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
  THOUGHT_TRANSLATOR_REQUIRED_MARKERS,
  HUB_ZH_THOUGHT_FEATURE_MARKERS,
  HUB_ZH_TITLE_FEATURE_MARKERS,
  EXTENSION_HOOK_MARKER,
  isAgyPackageLocalized,
  isWorkbenchPatched,
  isJetskiPatched,
  filesAreIdentical,
  resolveHubSourcePath,
  readInstalledAppIdentity
} = require('./core_injector');

function runVerify() {
  console.log('====================================================');
  console.log('  Antigravity IDE 汉化生效与防损坏综合自检系统');
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
  const liveHubMainPath = path.join(agyExtDir, 'hub_main.js');

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

  // 2. 检验扩展钩子与扩展命令汉化
  assert('扩展 extension.js 文件存在', fs.existsSync(extJsPath));
  if (fs.existsSync(extJsPath)) {
    const extContent = fs.readFileSync(extJsPath, 'utf8');
    assert('extension.js 包含 Webview 代理重定向钩子', extContent.includes(EXTENSION_HOOK_MARKER));
  }
  assert(
    '扩展 agy/package.json 命令标题汉化生效',
    fs.existsSync(agyExtPackagePath) && isAgyPackageLocalized(fs.readFileSync(agyExtPackagePath, 'utf8'))
  );

  // 3. 检验代理与双翻译微服务（存在性 + 完整路由/特性 + 与源码模板一致）
  assert('Hub 透明代理模块 hub_proxy.js 存在且与源码模板同步', fs.existsSync(proxyPath) && filesAreIdentical(srcProxyPath, proxyPath));
  if (fs.existsSync(proxyPath)) {
    const proxyContent = fs.readFileSync(proxyPath, 'utf8');
    const missingEndpoints = PROXY_REQUIRED_ENDPOINTS.filter(ep => !proxyContent.includes(ep));
    assert(
      'hub_proxy.js 包含全部 5 个标题与思维链微服务端点',
      missingEndpoints.length === 0,
      missingEndpoints.length === 0 ? `(${PROXY_REQUIRED_ENDPOINTS.length}/${PROXY_REQUIRED_ENDPOINTS.length})` : `(缺失: ${missingEndpoints.join(', ')})`
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

  // 4. 检验部署元数据与版本漂移状态
  const meta = readDeployMeta(agyExtDir);
  const hubSourcePath = resolveHubSourcePath(agyExtDir, patchDir);
  const hubSourceSha = computeFileSha256(hubSourcePath);
  const buildEngineSha = computeFileSha256(buildEnginePath);
  const { appVersion: curAppVersion, distro: curDistro } = readInstalledAppIdentity(appDir);
  assert(
    '部署元数据 .agy_zh_meta.json 完整就绪（含日志、缓存路径与版本基准指纹）',
    Boolean(meta && meta.patchSrcDir && meta.logDir && meta.cacheDir && meta.hubSourceSha256 && meta.buildEngineSha256)
  );
  assert(
    '已部署资产与当前客户端版本、hub_main.js 源及构建引擎零版本漂移',
    Boolean(
      meta &&
        (!curAppVersion || meta.appVersion === curAppVersion) &&
        (!curDistro || meta.distro === curDistro) &&
        (!hubSourceSha || meta.hubSourceSha256 === hubSourceSha) &&
        (!buildEngineSha || meta.buildEngineSha256 === buildEngineSha)
    )
  );

  // 5. 检验 hub_main_zh.js 汉化、标题持久化与思维链全部新功能
  assert('汉化版前端资产 hub_main_zh.js 存在', fs.existsSync(zhMainPath));
  if (fs.existsSync(zhMainPath)) {
    const zhContent = fs.readFileSync(zhMainPath, 'utf8');
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

    const missingTitleMarkers = HUB_ZH_TITLE_FEATURE_MARKERS.filter(m => !zhContent.includes(m));
    assert(
      'Hub 前端会话标题拦截与原生 RPC 持久化守卫就绪',
      missingTitleMarkers.length === 0,
      missingTitleMarkers.length === 0 ? `(${HUB_ZH_TITLE_FEATURE_MARKERS.length}/${HUB_ZH_TITLE_FEATURE_MARKERS.length})` : `(缺失: ${missingTitleMarkers.join(', ')})`
    );

    const missingThoughtMarkers = HUB_ZH_THOUGHT_FEATURE_MARKERS.filter(m => !zhContent.includes(m));
    assert(
      'Hub 前端思维链实时流式翻译、直出门控、防打断悬停与小锁锁定就绪',
      missingThoughtMarkers.length === 0,
      missingThoughtMarkers.length === 0 ? `(${HUB_ZH_THOUGHT_FEATURE_MARKERS.length}/${HUB_ZH_THOUGHT_FEATURE_MARKERS.length})` : `(缺失: ${missingThoughtMarkers.join(', ')})`
    );
  }

  // 6. 检验外层工作台与 jetskiAgent 实际注入生效状态
  assert(
    'workbench.desktop.main.js 会话标题输出枢纽 yhn(t) 注入生效',
    fs.existsSync(wbPath) && isWorkbenchPatched(fs.readFileSync(wbPath, 'utf8'))
  );
  assert(
    'jetskiAgent/main.js 会话标题与思考标签汉化注入生效',
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
