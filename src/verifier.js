const fs = require('fs');
const path = require('path');
const {
  computeChecksum,
  computeFileSha256,
  getTargetPaths,
  readDeployMeta
} = require('./config');
const {
  PROXY_REQUIRED_ENDPOINTS,
  PROXY_RESILIENCE_MARKERS,
  THOUGHT_TRANSLATOR_REQUIRED_MARKERS,
  HUB_ZH_THOUGHT_FEATURE_MARKERS,
  HUB_ZH_TITLE_FEATURE_MARKERS,
  HUB_ZH_TABLE_FEATURE_MARKERS,
  HUB_ZH_FULL_UI_MARKERS,
  EXTENSION_HOOK_MARKER,
  EXTENSION_RUNTIME_MSG_MARKER,
  checkAllBuiltInExtensionsLocalized,
  checkBrowserOnboardingLocalized,
  computeBuildEngineFingerprint,
  isWorkbenchPatched,
  isJetskiPatched,
  filesAreIdentical,
  resolveHubSourcePath,
  readInstalledAppIdentity,
  formatAppIdentity
} = require('./core_injector');

function runVerify() {
  console.log('====================================================');
  console.log('  Antigravity IDE 汉化与使用优化综合自检系统');
  console.log('====================================================\n');

  const patchDir = path.resolve(__dirname, '..');
  const {
    installDir,
    appDir,
    agyExtDir,
    agyExtPackagePath,
    productJsonPath
  } = getTargetPaths();

  const outDir = path.join(appDir, 'out');
  const wbPath = path.join(outDir, 'vs', 'workbench', 'workbench.desktop.main.js');
  const jetskiPath = path.join(outDir, 'jetskiAgent', 'main.js');
  const extJsPath = path.join(agyExtDir, 'vscode', 'extension.js');
  const proxyPath = path.join(agyExtDir, 'hub_proxy.js');
  const titleTranslatorPath = path.join(agyExtDir, 'title_translator.js');
  const thoughtTranslatorPath = path.join(agyExtDir, 'thought_translator.js');
  const zhMainPath = path.join(agyExtDir, 'hub_main_zh.js');

  const srcProxyPath = path.join(patchDir, 'src', 'hub_proxy.template.js');
  const srcTitleTranslatorPath = path.join(patchDir, 'src', 'title_translator.js');
  const srcThoughtTranslatorPath = path.join(patchDir, 'src', 'thought_translator.js');
  const buildEnginePath = path.join(patchDir, 'build_ultimate_chinese_engine.js');

  let passCount = 0;
  let totalCount = 0;

  function assert(name, condition, extra = '') {
    totalCount++;
    if (condition) {
      passCount++;
      console.log(`✔ [通过] ${name}${extra ? ' ' + extra : ''}`);
    } else {
      console.error(`❌ [未通过] ${name}${extra ? ' ' + extra : ''}`);
    }
  }

  const curId = readInstalledAppIdentity(appDir);
  console.log(`当前检测客户端: Antigravity ${formatAppIdentity(curId)}\n`);

  // 1. 检验 product.json 完整性校验和（全量 + 关键内核）
  assert('IDE 安装目录与 product.json 存在', fs.existsSync(installDir) && fs.existsSync(productJsonPath));
  if (fs.existsSync(productJsonPath)) {
    const prod = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
    if (prod.checksums) {
      if (fs.existsSync(wbPath)) {
        const realWb = computeChecksum(fs.readFileSync(wbPath));
        assert('workbench 校验和匹配', prod.checksums['vs/workbench/workbench.desktop.main.js'] === realWb);
      }
      if (fs.existsSync(jetskiPath)) {
        const realJetski = computeChecksum(fs.readFileSync(jetskiPath));
        assert('jetskiAgent/main.js 校验和匹配', prod.checksums['jetskiAgent/main.js'] === realJetski);
      }
      let allMatched = 0;
      let allTotal = 0;
      for (const relPath in prod.checksums) {
        allTotal++;
        const fullPath = path.join(outDir, relPath);
        if (fs.existsSync(fullPath) && computeChecksum(fs.readFileSync(fullPath)) === prod.checksums[relPath]) {
          allMatched++;
        }
      }
      assert('product.json 全量 bundle 校验和一致', allMatched === allTotal, `(${allMatched}/${allTotal})`);
    }
  }

  // 2. 检验扩展钩子、原生弹窗、全部 5 个内置扩展清单与浏览器引导页
  assert('扩展 extension.js 文件存在', fs.existsSync(extJsPath));
  if (fs.existsSync(extJsPath)) {
    const extContent = fs.readFileSync(extJsPath, 'utf8');
    assert('extension.js 包含抗混淆 Webview 代理重定向钩子', extContent.includes(EXTENSION_HOOK_MARKER) && extContent.includes('hub_proxy'));
    assert('extension.js 原生提示弹窗汉化生效', extContent.includes(EXTENSION_RUNTIME_MSG_MARKER));
  }
  const extPkgReport = checkAllBuiltInExtensionsLocalized(appDir);
  assert(
    '5 个官方内置扩展 package.json 全量命令/视图/设置描述汉化生效',
    extPkgReport.ok,
    extPkgReport.ok
      ? `(${extPkgReport.results.length} 个扩展，共 ${extPkgReport.localizedItems}/${extPkgReport.totalItems} 项)`
      : `(未完成: ${extPkgReport.results.filter(r => !r.ok).map(r => `${r.extId} ${r.localized}/${r.total}`).join(', ')})`
  );
  const onboardingReport = checkBrowserOnboardingLocalized(appDir);
  assert(
    '内置浏览器欢迎页与引导页静态汉化生效',
    onboardingReport.ok,
    `(${onboardingReport.results.filter(r => r.ok).length}/${onboardingReport.results.length} 页)`
  );

  // 3. 检验代理与双翻译微服务（存在性 + 完整路由/热捕获特性 + 与源码模板一致）
  assert('Hub 透明代理模块 hub_proxy.js 存在且与源码模板同步', fs.existsSync(proxyPath) && filesAreIdentical(srcProxyPath, proxyPath));
  if (fs.existsSync(proxyPath)) {
    const proxyContent = fs.readFileSync(proxyPath, 'utf8');
    const missingEndpoints = PROXY_REQUIRED_ENDPOINTS.filter(ep => !proxyContent.includes(ep));
    const missingResilience = PROXY_RESILIENCE_MARKERS.filter(m => !proxyContent.includes(m));
    assert(
      'hub_proxy.js 包含全部 5 个微服务端点及升级热捕获/日志留存能力',
      missingEndpoints.length === 0 && missingResilience.length === 0,
      missingEndpoints.length === 0 && missingResilience.length === 0
        ? `(端点 ${PROXY_REQUIRED_ENDPOINTS.length}/${PROXY_REQUIRED_ENDPOINTS.length}, 韧性 ${PROXY_RESILIENCE_MARKERS.length}/${PROXY_RESILIENCE_MARKERS.length})`
        : `(缺失: ${[...missingEndpoints, ...missingResilience].join(', ')})`
    );
  }

  assert(
    '标题翻译微服务 title_translator.js 存在且与源码同步',
    fs.existsSync(titleTranslatorPath) && filesAreIdentical(srcTitleTranslatorPath, titleTranslatorPath)
  );
  assert(
    '思维链实时翻译微服务 thought_translator.js 存在且与源码同步',
    fs.existsSync(thoughtTranslatorPath) && filesAreIdentical(srcThoughtTranslatorPath, thoughtTranslatorPath)
  );
  if (fs.existsSync(thoughtTranslatorPath)) {
    const thoughtCode = fs.readFileSync(thoughtTranslatorPath, 'utf8');
    const missingMarkers = THOUGHT_TRANSLATOR_REQUIRED_MARKERS.filter(m => !thoughtCode.includes(m));
    assert(
      'thought_translator.js 具备 v2 防删除线、动态锚点与 Keep-Alive',
      missingMarkers.length === 0,
      missingMarkers.length === 0 ? `(${THOUGHT_TRANSLATOR_REQUIRED_MARKERS.length}/${THOUGHT_TRANSLATOR_REQUIRED_MARKERS.length})` : `(缺失: ${missingMarkers.join(', ')})`
    );
  }

  // 4. 检验部署元数据与 4 维版本零漂移状态
  const meta = readDeployMeta(agyExtDir);
  const hubSourcePath = resolveHubSourcePath(agyExtDir, patchDir);
  const hubSourceSha = computeFileSha256(hubSourcePath);
  const buildEngineSha = computeBuildEngineFingerprint(patchDir);
  assert(
    '部署元数据 .agy_zh_meta.json 完整就绪（含日志、缓存、Node 路径与 4 维版本指纹）',
    Boolean(
      meta &&
        meta.patchSrcDir &&
        meta.logDir &&
        meta.cacheDir &&
        meta.hubSourceSha256 &&
        meta.buildEngineSha256 &&
        meta.nodeExecPath
    )
  );
  assert(
    '已部署资产与当前 4 维客户端版本、hub_main.js 源及构建引擎零漂移',
    Boolean(
      meta &&
        (!curId.appVersion || meta.appVersion === curId.appVersion) &&
        (!curId.distro || meta.distro === curId.distro) &&
        (!curId.ideVersion || meta.ideVersion === curId.ideVersion) &&
        (!curId.agyVersion || meta.agyVersion === curId.agyVersion) &&
        (!hubSourceSha || meta.hubSourceSha256 === hubSourceSha) &&
        (!buildEngineSha || meta.buildEngineSha256 === buildEngineSha)
    )
  );

  // 5. 检验 hub_main_zh.js 汉化、标题持久化、思维链与表格自适应全部功能
  assert('汉化版前端资产 hub_main_zh.js 存在', fs.existsSync(zhMainPath));
  if (fs.existsSync(zhMainPath)) {
    const zhContent = fs.readFileSync(zhMainPath, 'utf8');
    const modStat = (meta && meta.moduleStatus) || null;
    const testKeywords = [
      '权限预设模板',
      '全局权限',
      '通用设置',
      '外观偏好',
      '系统通知',
      '模型配置',
      '内置浏览器',
      '对话历史',
      '追问排队递交',
      '向 Antigravity 提问，输入 @ 提及',
      '重命名',
      '固定会话',
      '归档会话',
      '拆分视图'
    ];
    let matchedKeywords = 0;
    for (const kw of testKeywords) {
      if (zhContent.includes(kw)) matchedKeywords++;
    }
    assert('Hub 前端核心关键字汉化覆盖率', matchedKeywords === testKeywords.length, `(${matchedKeywords}/${testKeywords.length})`);

    // 严格按真实生效状态审查：任何增强模块降级/缺失均如实报 ❌，绝不伪装 100% 通过
    const missingTitleMarkers = HUB_ZH_TITLE_FEATURE_MARKERS.filter(m => !zhContent.includes(m));
    assert(
      'Hub 前端会话标题拦截与原生 RPC 持久化守卫就绪',
      missingTitleMarkers.length === 0,
      missingTitleMarkers.length === 0
        ? `(${HUB_ZH_TITLE_FEATURE_MARKERS.length}/${HUB_ZH_TITLE_FEATURE_MARKERS.length})`
        : `(未生效/已降级，缺失: ${missingTitleMarkers.join(', ')})`
    );

    const missingThoughtMarkers = HUB_ZH_THOUGHT_FEATURE_MARKERS.filter(m => !zhContent.includes(m));
    assert(
      'Hub 前端思维链实时流式翻译、直出门控、防打断悬停与小锁锁定就绪',
      missingThoughtMarkers.length === 0,
      missingThoughtMarkers.length === 0
        ? `(${HUB_ZH_THOUGHT_FEATURE_MARKERS.length}/${HUB_ZH_THOUGHT_FEATURE_MARKERS.length})`
        : `(未生效/已降级，缺失: ${missingThoughtMarkers.join(', ')})`
    );

    const missingTableMarkers = HUB_ZH_TABLE_FEATURE_MARKERS.filter(m => !zhContent.includes(m));
    assert(
      'Hub 前端 Markdown 表格智能权重自适应布局与菜单汉化就绪',
      missingTableMarkers.length === 0,
      missingTableMarkers.length === 0
        ? `(${HUB_ZH_TABLE_FEATURE_MARKERS.length}/${HUB_ZH_TABLE_FEATURE_MARKERS.length})`
        : `(未生效/已降级，缺失: ${missingTableMarkers.join(', ')})`
    );
    const missingFullUiMarkers = HUB_ZH_FULL_UI_MARKERS.filter(m => !zhContent.includes(m));
    assert(
      'Hub 前端全界面清洗引擎 v2 与右侧边栏首帧直译就绪',
      missingFullUiMarkers.length === 0,
      missingFullUiMarkers.length === 0
        ? `(${HUB_ZH_FULL_UI_MARKERS.length}/${HUB_ZH_FULL_UI_MARKERS.length})`
        : `(缺失: ${missingFullUiMarkers.join(', ')})`
    );

    const skippedList = Array.isArray(meta?.skippedModules) ? meta.skippedModules : [];
    assert(
      '无任何降级跳过的增强模块（全功能满血生效）',
      skippedList.length === 0,
      skippedList.length === 0 ? '(0 项降级)' : `(已降级跳过: ${skippedList.map(s => s.module).join('、')})`
    );
  }

  // 6. 检验外层工作台与 jetskiAgent 实际注入生效状态
  assert(
    'workbench.desktop.main.js 会话标题输出枢纽注入生效',
    fs.existsSync(wbPath) && isWorkbenchPatched(fs.readFileSync(wbPath, 'utf8'))
  );
  assert(
    'jetskiAgent/main.js 会话标题、思考标签与全界面清洗引擎 v2 注入生效',
    fs.existsSync(jetskiPath) && isJetskiPatched(fs.readFileSync(jetskiPath, 'utf8'))
  );

  console.log(`\n====================================================`);
  console.log(`综合自检结果: 通过率 ${(passCount / totalCount * 100).toFixed(1)}% (${passCount}/${totalCount})`);
  if (passCount === totalCount) {
    console.log('🎉 全部自检项目 100% 验证通过！系统已处于最佳就绪状态。');
  } else {
    console.warn('⚠ 存在未通过项，请参考上方具体提示执行 npm run patch 或排查。');
  }
  console.log(`====================================================\n`);

  if (passCount !== totalCount) {
    process.exit(1);
  }
}

runVerify();
