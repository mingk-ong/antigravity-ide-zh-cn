/**
 * Antigravity IDE 智能自愈与更新自适应检测引擎 (Auto-Updater & Self-Healing Engine)
 *
 * 核心特性：
 * 1. 深度多维健康检查：覆盖 4 维版本身份（IDE v2.8.0 / agy v1.12.0 / VS Code / Distro）、扩展抗混淆钩子、
 *    代理热捕获与双翻译微服务模板一致性、hub_main_zh.js 特性指纹、外层 workbench/jetskiAgent 注入态与 product.json 全量签名
 * 2. 分层抗混淆兼容探针：
 *    - 核心必选层（抗混淆 extension.js 入口 + 设置底座）：任一缺失坚决熔断保原版启动
 *    - 独立增强层（会话标题枢纽/RPC、思维链 iAc、Markdown 表格 lkc/mkc、外层 workbench/jetskiAgent）：
 *      单模块不兼容自动安全降级跳过，绝不因局部重构导致整体退回纯英文
 * 3. 统一无损自愈流水线：复用 core_injector.applyAllPatches，内置跨版本 .bak 防污染保护
 * 4. 合法多行中文 VBS 提醒弹窗：严格转义换行符为 vbCrLf，彻底杜绝 800A0409 语法报错
 * 5. 智能日志生命周期管理：仅保留最近 2 次完整运行记录，单次超 500KB 自动体积兜底裁剪
 * 6. 零黑框静默拉起 IDE 主程序，全透传命令行参数
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const {
  computeChecksum,
  computeFileSha256,
  getTargetPaths,
  getLogDir,
  readDeployMeta
} = require('./config');
const {
  PROXY_REQUIRED_ENDPOINTS,
  PROXY_RESILIENCE_MARKERS,
  THOUGHT_TRANSLATOR_REQUIRED_MARKERS,
  HUB_ZH_THOUGHT_FEATURE_MARKERS,
  HUB_ZH_TITLE_FEATURE_MARKERS,
  HUB_ZH_TABLE_FEATURE_MARKERS,
  EXTENSION_HOOK_MARKER,
  WORKBENCH_TITLE_FN_REGEX,
  JETSKI_TITLE_FN_REGEX,
  JETSKI_UEN_REGEX,
  JETSKI_SMA_REGEX,
  JETSKI_THINKING_FOR_REGEX,
  JETSKI_THOUGHT_FOR_REGEX,
  JETSKI_THINKING_DOTS_TARGET,
  locateExtensionWebviewHook,
  findByAnchorRegex,
  locateTitleRpcModule,
  locateThoughtModule,
  locateTableModule,
  isAgyPackageLocalized,
  isWorkbenchPatched,
  isJetskiPatched,
  filesAreIdentical,
  resolveHubSourcePath,
  readInstalledAppIdentity,
  formatAppIdentity,
  applyAllPatches
} = require('./core_injector');

// 路径与常量配置（动态探测，零硬编码）
const {
  installDir: APP_DIR,
  appDir: RESOURCES_APP,
  agyExtDir: EXT_DIR,
  agyExtPackagePath: EXT_PACKAGE_JSON,
  productJsonPath: PRODUCT_JSON
} = getTargetPaths();
const PATCH_DIR = path.resolve(__dirname, '..');
const DEFAULT_LOG_DIR = getLogDir();
const LOG_FILE = path.join(DEFAULT_LOG_DIR, 'antigravity_auto_patch.log');
const IDE_EXE = path.join(APP_DIR, 'Antigravity IDE.exe');

// 关键系统文件
const OUT_DIR = path.join(RESOURCES_APP, 'out');
const WORKBENCH_JS = path.join(OUT_DIR, 'vs', 'workbench', 'workbench.desktop.main.js');
const JETSKI_JS = path.join(OUT_DIR, 'jetskiAgent', 'main.js');
const EXT_JS = path.join(EXT_DIR, 'vscode', 'extension.js');
const PROXY_JS = path.join(EXT_DIR, 'hub_proxy.js');
const TRANSLATOR_JS = path.join(EXT_DIR, 'title_translator.js');
const THOUGHT_TRANSLATOR_JS = path.join(EXT_DIR, 'thought_translator.js');
const ZH_MAIN_JS = path.join(EXT_DIR, 'hub_main_zh.js');
const LIVE_HUB_MAIN = path.join(EXT_DIR, 'hub_main.js');
const BUILD_ENGINE_JS = path.join(PATCH_DIR, 'build_ultimate_chinese_engine.js');
const SRC_PROXY_JS = path.join(PATCH_DIR, 'src', 'hub_proxy.template.js');
const SRC_TRANSLATOR_JS = path.join(PATCH_DIR, 'src', 'title_translator.js');
const SRC_THOUGHT_TRANSLATOR_JS = path.join(PATCH_DIR, 'src', 'thought_translator.js');

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * 构造严格合法的单行 VBScript MsgBox 脚本：
 * - 将所有换行符 (\r\n / \n) 转换为 `" & vbCrLf & "`，彻底杜绝 VBScript 800A0409 未结束字符串常量报错
 */
function buildVbsNotificationScript(title, message) {
  const escapeVbsSegment = (str) => String(str || '').replace(/"/g, '""');
  const lines = String(message || '').replace(/\r\n/g, '\n').split('\n');
  const msgExpr = lines.map(line => `"${escapeVbsSegment(line)}"`).join(' & vbCrLf & ');
  const safeTitle = escapeVbsSegment(String(title || '').replace(/\r?\n/g, ' '));
  return `MsgBox ${msgExpr}, 48, "${safeTitle}"`;
}

/**
 * 日志按运行次数精准留存管理器（严格保留最近 2 次运行日志）
 */
function pruneLogKeepLastRuns(logPath, keepExistingRuns = 1, maxBytes = 500 * 1024) {
  if (!fs.existsSync(logPath)) return { purgedRuns: 0, keptRuns: 0, trimmed: false };
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    if (!raw.trim()) return { purgedRuns: 0, keptRuns: 0, trimmed: false };

    const headerRe = /^={10,}\r?\n【启动自检与全景监控日志】/gm;
    const starts = [];
    let match;
    while ((match = headerRe.exec(raw)) !== null) {
      starts.push(match.index);
    }

    let keptContent = raw;
    let purgedRuns = 0;
    let keptRuns = 0;

    if (starts.length > 0) {
      const blocks = [];
      for (let i = 0; i < starts.length; i++) {
        const end = i + 1 < starts.length ? starts[i + 1] : raw.length;
        const blk = raw.slice(starts[i], end).trim();
        if (blk) blocks.push(blk);
      }
      const maxKeep = Math.max(0, keepExistingRuns);
      if (blocks.length > maxKeep) {
        purgedRuns = blocks.length - maxKeep;
      }
      const keptBlocks = maxKeep > 0 ? blocks.slice(-maxKeep) : [];
      keptRuns = keptBlocks.length;
      keptContent = keptBlocks.join('\n\n');
    } else if (keepExistingRuns <= 0) {
      keptContent = '';
    }

    let trimmed = false;
    if (keptContent && Buffer.byteLength(keptContent, 'utf8') > maxBytes) {
      const trimmedLines = keptContent.split(/\r?\n/).slice(-600);
      const timeStr = new Date().toLocaleString('zh-CN', { hour12: false });
      trimmedLines.unshift(`[${timeStr}] 【系统自维护】单次日志体积超过容量保护阈值（>500KB），已自动安全裁剪早期明细，保留最新 600 行。\n`);
      keptContent = trimmedLines.join('\n');
      trimmed = true;
    }

    fs.writeFileSync(logPath, keptContent ? keptContent.trim() + '\n\n' : '', 'utf8');
    return { purgedRuns, keptRuns, trimmed };
  } catch (e) {
    return { purgedRuns: 0, keptRuns: 0, trimmed: false, error: e.message };
  }
}

function writeLog(text) {
  try {
    fs.appendFileSync(LOG_FILE, text + '\n', 'utf8');
  } catch (e) {}
  console.log(text);
}

/**
 * 阶段一：深度多维健康检查 (7 大核心维度)
 */
function inspectHealthDeeply() {
  const report = {
    valid: true,
    failures: [],
    details: {}
  };

  // 1. 检查扩展 extension.js 与 agy/package.json
  if (fs.existsSync(EXT_JS)) {
    const stat = fs.statSync(EXT_JS);
    const content = fs.readFileSync(EXT_JS, 'utf8');
    const hasProxyHook = content.includes(EXTENSION_HOOK_MARKER) && content.includes('hub_proxy');
    const pkgLocalized = fs.existsSync(EXT_PACKAGE_JSON) && isAgyPackageLocalized(fs.readFileSync(EXT_PACKAGE_JSON, 'utf8'));
    report.details.extension = {
      path: EXT_JS,
      size: formatBytes(stat.size),
      mtime: stat.mtime.toLocaleString('zh-CN', { hour12: false }),
      hookStatus: hasProxyHook ? '已挂载 (正常)' : '未挂载 (缺失)',
      pkgStatus: pkgLocalized ? '命令已汉化' : '命令未汉化',
      ok: hasProxyHook && pkgLocalized
    };
    if (!hasProxyHook) {
      report.valid = false;
      report.failures.push('extension.js 缺少 Webview 代理重定向钩子（官方更新已覆盖此文件）');
    }
    if (!pkgLocalized) {
      report.valid = false;
      report.failures.push('extensions/agy/package.json 扩展命令汉化缺失或被官方更新覆盖');
    }
  } else {
    report.valid = false;
    report.failures.push('未找到核心扩展文件: ' + EXT_JS);
    report.details.extension = { ok: false, error: '文件不存在' };
  }

  // 2. 检查透明代理 hub_proxy.js、双翻译微服务与源码模板一致性及部署元数据
  const meta = readDeployMeta(EXT_DIR);
  const metaOk = Boolean(meta && meta.patchSrcDir && meta.logDir && meta.cacheDir);
  if (fs.existsSync(PROXY_JS) && fs.existsSync(TRANSLATOR_JS) && fs.existsSync(THOUGHT_TRANSLATOR_JS)) {
    const stat = fs.statSync(PROXY_JS);
    const proxyContent = fs.readFileSync(PROXY_JS, 'utf8');
    const thoughtContent = fs.readFileSync(THOUGHT_TRANSLATOR_JS, 'utf8');
    const hasFixedPort = proxyContent.includes('14588');
    const missingEndpoints = PROXY_REQUIRED_ENDPOINTS.filter(ep => !proxyContent.includes(ep));
    const missingResilience = PROXY_RESILIENCE_MARKERS.filter(m => !proxyContent.includes(m));
    const missingThoughtMarkers = THOUGHT_TRANSLATOR_REQUIRED_MARKERS.filter(m => !thoughtContent.includes(m));
    const proxySynced = !fs.existsSync(SRC_PROXY_JS) || filesAreIdentical(SRC_PROXY_JS, PROXY_JS);
    const titleSynced = !fs.existsSync(SRC_TRANSLATOR_JS) || filesAreIdentical(SRC_TRANSLATOR_JS, TRANSLATOR_JS);
    const thoughtSynced = !fs.existsSync(SRC_THOUGHT_TRANSLATOR_JS) || filesAreIdentical(SRC_THOUGHT_TRANSLATOR_JS, THOUGHT_TRANSLATOR_JS);

    const proxyAllOk =
      missingEndpoints.length === 0 &&
      missingResilience.length === 0 &&
      missingThoughtMarkers.length === 0 &&
      proxySynced &&
      titleSynced &&
      thoughtSynced &&
      metaOk;

    report.details.proxy = {
      path: PROXY_JS,
      size: formatBytes(stat.size),
      port: hasFixedPort ? '固定高位端口 14588 (消除时序竞争)' : '动态端口',
      translateEndpoint:
        missingEndpoints.length === 0
          ? `已启用全部 ${PROXY_REQUIRED_ENDPOINTS.length} 项微服务端点 + 升级热捕获`
          : `缺少端点: ${missingEndpoints.join(', ')}`,
      syncStatus: proxySynced && titleSynced && thoughtSynced ? '与源码 100% 同步' : '检测到源码已更新（待同步）',
      metaStatus: metaOk ? '元数据与纯本地缓存配置就绪' : '缺少 .agy_zh_meta.json',
      ok: proxyAllOk
    };

    if (missingEndpoints.length > 0) {
      report.valid = false;
      report.failures.push(`hub_proxy.js 缺少必要微服务端点: ${missingEndpoints.join(', ')}`);
    }
    if (missingResilience.length > 0) {
      report.valid = false;
      report.failures.push(`hub_proxy.js 缺少升级热捕获特性: ${missingResilience.join(', ')}`);
    }
    if (missingThoughtMarkers.length > 0) {
      report.valid = false;
      report.failures.push(`thought_translator.js 版本过旧，缺少特性: ${missingThoughtMarkers.join(', ')}`);
    }
    if (!proxySynced || !titleSynced || !thoughtSynced) {
      report.valid = false;
      report.failures.push('本地代理或翻译微服务源码已升级，与已部署副本不一致（需自动同步）');
    }
    if (!metaOk) {
      report.valid = false;
      report.failures.push('扩展目录缺少有效部署元数据 .agy_zh_meta.json');
    }
  } else {
    const missingDesc = !fs.existsSync(PROXY_JS)
      ? 'hub_proxy.js 不存在'
      : !fs.existsSync(TRANSLATOR_JS)
        ? 'title_translator.js 标题翻译微服务缺失'
        : 'thought_translator.js 思维链实时翻译微服务缺失';
    report.valid = false;
    report.failures.push(missingDesc);
    report.details.proxy = { ok: false, error: missingDesc };
  }

  // 3. 检查汉化核心 hub_main_zh.js 与 4 维版本漂移
  if (fs.existsSync(ZH_MAIN_JS)) {
    const stat = fs.statSync(ZH_MAIN_JS);
    const content = fs.readFileSync(ZH_MAIN_JS, 'utf8');
    const modStat = (meta && meta.moduleStatus) || null;

    const hasSt = content.includes('_wrapMap(new Map');
    const hasUt = content.includes('_titles =') && content.includes('通用设置');
    const hasYt = content.includes('_secTitles =') && content.includes('自定义扩展与技能');
    const hasXt = content.includes('_labels =') && content.includes('权限预设模板');
    const hasDomCleaner = content.includes('Antigravity 全局自适应运行时 DOM 清洗引擎');

    // 若某增强模块在新版本中已记录为“受控降级跳过”，则不因该模块缺失触发无限重编译循环
    const titleExpected = !modStat || !modStat.titleRpc || modStat.titleRpc.enabled !== false;
    const thoughtExpected = !modStat || !modStat.thoughtStream || modStat.thoughtStream.enabled !== false;
    const tableExpected = !modStat || !modStat.tableLayout || modStat.tableLayout.enabled !== false;

    const hasTitleEngine = !titleExpected || HUB_ZH_TITLE_FEATURE_MARKERS.every(m => content.includes(m));
    const missingThoughtFeatures = thoughtExpected ? HUB_ZH_THOUGHT_FEATURE_MARKERS.filter(m => !content.includes(m)) : [];
    const hasThoughtEngine = missingThoughtFeatures.length === 0;
    const missingTableFeatures = tableExpected ? HUB_ZH_TABLE_FEATURE_MARKERS.filter(m => !content.includes(m)) : [];
    const hasTableEngine = missingTableFeatures.length === 0;

    // 4 维版本漂移检测（IDE 版本 + agy 扩展版本 + VS Code 基座 + Distro + 源资产/构建引擎哈希）
    const hubSourcePath = resolveHubSourcePath(EXT_DIR, PATCH_DIR);
    const hubSourceSha = computeFileSha256(hubSourcePath);
    const buildEngineSha = computeFileSha256(BUILD_ENGINE_JS);
    const curId = readInstalledAppIdentity(RESOURCES_APP);
    const appIdentityDrifted = Boolean(
      meta &&
        ((curId.appVersion && meta.appVersion && meta.appVersion !== curId.appVersion) ||
          (curId.distro && meta.distro && meta.distro !== curId.distro) ||
          (curId.ideVersion && meta.ideVersion && meta.ideVersion !== curId.ideVersion) ||
          (curId.agyVersion && meta.agyVersion && meta.agyVersion !== curId.agyVersion))
    );
    const hubSourceDrifted = Boolean(hubSourceSha && meta && meta.hubSourceSha256 && meta.hubSourceSha256 !== hubSourceSha);
    const buildEngineDrifted = Boolean(buildEngineSha && meta && meta.buildEngineSha256 && meta.buildEngineSha256 !== buildEngineSha);
    const hubMetaMissingHash = Boolean(
      !meta ||
        !meta.hubSourceSha256 ||
        !meta.buildEngineSha256 ||
        (curId.distro && !meta.distro) ||
        (curId.ideVersion && !meta.ideVersion) ||
        (curId.agyVersion && !meta.agyVersion)
    );
    const noDrift = !appIdentityDrifted && !hubSourceDrifted && !buildEngineDrifted && !hubMetaMissingHash;
    const coreSettingsOk = [hasSt, hasUt, hasYt, hasXt].filter(Boolean).length >= 2 && hasDomCleaner;

    const allEnginesOk = coreSettingsOk && hasTitleEngine && hasThoughtEngine && hasTableEngine && noDrift;

    report.details.zhBundle = {
      path: ZH_MAIN_JS,
      size: formatBytes(stat.size),
      mtime: stat.mtime.toLocaleString('zh-CN', { hour12: false }),
      engines: {
        sT_元数据工厂: hasSt ? '✔ 劫持正常' : '⚠ 跳过',
        uT_顶层标题卡片: hasUt ? '✔ 注入正常' : '⚠ 跳过',
        yT_分区折叠面板: hasYt ? '✔ 注入正常' : '⚠ 跳过',
        xT_设置卡片行: hasXt ? '✔ 注入正常' : '⚠ 跳过',
        XB_会话标题枢纽: !titleExpected ? '⚠ 已降级跳过' : hasTitleEngine ? '✔ 拦截与实时持久化就绪' : '❌ 缺失/版本过旧',
        iAc_思维链流式翻译: !thoughtExpected ? '⚠ 已降级跳过' : hasThoughtEngine ? '✔ 直出门控/悬停防打断/小锁全就绪' : `❌ 缺失 (${missingThoughtFeatures.slice(0, 3).join(', ')})`,
        lkc_表格自适应布局: !tableExpected ? '⚠ 已降级跳过' : hasTableEngine ? '✔ 智能权重列宽/防遮挡/菜单汉化就绪' : `❌ 缺失 (${missingTableFeatures.slice(0, 3).join(', ')})`,
        DOM_运行时清洗器: hasDomCleaner ? '✔ 挂载正常' : '❌ 缺失'
      },
      driftStatus: appIdentityDrifted
        ? `检测到客户端升级 (${formatAppIdentity(meta)} -> ${formatAppIdentity(curId)})`
        : hubSourceDrifted
          ? 'hub_main.js 源码已更新（待重编）'
          : buildEngineDrifted
            ? '构建引擎源码已更新（待重编）'
            : hubMetaMissingHash
              ? '版本基准指纹待建立'
              : '与当前客户端版本、源资产及构建脚本零漂移',
      ok: allEnginesOk
    };
    if (!coreSettingsOk || !hasTitleEngine) {
      report.valid = false;
      report.failures.push('hub_main_zh.js 汉化核心引擎或会话标题守卫指纹不完整');
    }
    if (!hasThoughtEngine) {
      report.valid = false;
      report.failures.push(`hub_main_zh.js 思维链特性版本过旧，缺少: ${missingThoughtFeatures.join(', ')}`);
    }
    if (!hasTableEngine) {
      report.valid = false;
      report.failures.push(`hub_main_zh.js Markdown 表格自适应布局特性缺失: ${missingTableFeatures.join(', ')}`);
    }
    if (appIdentityDrifted) {
      report.valid = false;
      report.failures.push(`检测到 Antigravity IDE 版本升级 (${formatAppIdentity(meta)} -> ${formatAppIdentity(curId)})，需重新验证并同步汉化`);
    } else if (hubSourceDrifted) {
      report.valid = false;
      report.failures.push('检测到 hub_main.js 源资产发生变更（与已编译 hub_main_zh.js 基准哈希不一致，需自动重编）');
    } else if (buildEngineDrifted) {
      report.valid = false;
      report.failures.push('检测到本地 build_ultimate_chinese_engine.js 已更新（需重新编译部署 hub_main_zh.js）');
    } else if (hubMetaMissingHash) {
      report.valid = false;
      report.failures.push('部署元数据缺少 4 维版本身份或源资产基准指纹（需自愈对齐一次）');
    }
  } else {
    report.valid = false;
    report.failures.push('全量汉化前端资产文件不存在: ' + ZH_MAIN_JS);
    report.details.zhBundle = { ok: false, error: '文件不存在' };
  }

  // 4. 检查外层工作台 (workbench) 与独立智能体弹窗 (jetskiAgent) 实际注入状态
  const wbExists = fs.existsSync(WORKBENCH_JS);
  const wbOk = wbExists && isWorkbenchPatched(fs.readFileSync(WORKBENCH_JS, 'utf8'));
  const jkExists = fs.existsSync(JETSKI_JS);
  const jkOk = jkExists && isJetskiPatched(fs.readFileSync(JETSKI_JS, 'utf8'));
  report.details.outerBundles = {
    workbench: wbExists ? (wbOk ? '✔ 标题枢纽已注入' : '❌ 未注入/被官方覆盖') : '❌ 文件不存在',
    jetskiAgent: jkExists ? (jkOk ? '✔ 标题与思考标签已注入' : '❌ 未注入/被官方覆盖') : '❌ 文件不存在',
    ok: wbOk && jkOk
  };
  if (wbExists && !wbOk) {
    report.valid = false;
    report.failures.push('workbench.desktop.main.js 会话标题枢纽未注入或已被官方更新覆写');
  }
  if (jkExists && !jkOk) {
    report.valid = false;
    report.failures.push('jetskiAgent/main.js 标题枢纽或思考标签汉化未注入/已被官方更新覆写');
  }

  // 5. 检查官方原始 bundle
  if (fs.existsSync(LIVE_HUB_MAIN)) {
    const stat = fs.statSync(LIVE_HUB_MAIN);
    report.details.liveBundle = {
      path: LIVE_HUB_MAIN,
      size: formatBytes(stat.size),
      mtime: stat.mtime.toLocaleString('zh-CN', { hour12: false }),
      ok: true
    };
  } else {
    report.details.liveBundle = { ok: false, error: '文件不存在（将在首次启动后由代理自动热捕获核验）' };
  }

  // 6. 检查 product.json 完整性签名
  if (fs.existsSync(PRODUCT_JSON)) {
    try {
      const prodJson = JSON.parse(fs.readFileSync(PRODUCT_JSON, 'utf8'));
      if (prodJson.checksums) {
        let matched = 0;
        let total = 0;
        const mismatches = [];
        const checksumList = [];

        for (const relPath in prodJson.checksums) {
          total++;
          const fullPath = path.join(OUT_DIR, relPath);
          if (fs.existsSync(fullPath)) {
            const curHash = computeChecksum(fs.readFileSync(fullPath));
            const expectedHash = prodJson.checksums[relPath];
            const isMatch = curHash === expectedHash;
            if (isMatch) {
              matched++;
            } else {
              mismatches.push(relPath);
            }
            checksumList.push({
              file: relPath,
              matched: isMatch,
              hash: curHash.slice(0, 10) + '...'
            });
          } else {
            mismatches.push(relPath + ' (目标文件不存在)');
          }
        }

        const isIntegrityPure = matched === total;
        report.details.integrity = {
          total,
          matched,
          mismatches,
          checksumList,
          ok: isIntegrityPure
        };

        if (!isIntegrityPure) {
          report.valid = false;
          report.failures.push(`product.json 校验和不匹配 (${matched}/${total})，可能被官方更新覆写`);
        }
      }
    } catch (e) {
      report.valid = false;
      report.failures.push('product.json 解析异常: ' + e.message);
      report.details.integrity = { ok: false, error: e.message };
    }
  } else {
    report.valid = false;
    report.failures.push('product.json 配置文件不存在');
    report.details.integrity = { ok: false, error: '文件不存在' };
  }

  return report;
}

/**
 * 阶段二：分层抗混淆新版本特征指纹兼容性探针
 * - 核心必选层 (requiredCore)：extension.js 抗混淆代理钩子 + 设置中心基础层（>=2 项组件命中）
 *   -> 任一核心缺失即坚决熔断保护，保留官方原版启动防止白屏
 * - 独立增强层 (featureModules)：会话标题枢纽 / RPC 持久化 / 思维链流式翻译 / Markdown 表格自适应 / 外层工作台与智能体弹窗
 *   -> 单个增强模块不兼容仅降级跳过该模块，不影响整体同步汉化
 */
function probeVersionCompatibility(targetHubMainPath, opts = {}) {
  const extJsPath = opts.extJsPath || EXT_JS;
  const wbPath = opts.wbPath || WORKBENCH_JS;
  const jkPath = opts.jkPath || JETSKI_JS;

  if (!fs.existsSync(targetHubMainPath)) {
    return {
      compatible: false,
      fullyCompatible: false,
      matchedAnchors: [],
      missingAnchors: [{ id: 'hub_main', name: '官方静态源 hub_main.js', pattern: targetHubMainPath }],
      featureModules: [],
      optionalAnchors: [],
      codeLength: 0,
      details: `在路径 ${targetHubMainPath} 未找到官方前端 bundle 文件。`
    };
  }

  const code = fs.readFileSync(targetHubMainPath, 'utf8');
  const matchedAnchors = [];
  const missingAnchors = [];

  // ----- A. 核心必选层 1：extension.js 抗混淆代理钩子 -----
  const extAnchor = {
    id: 'ext_renderWebviewHtml',
    name: '扩展 Webview 渲染钩子入口 (extension.js 抗混淆定位)'
  };
  if (fs.existsSync(extJsPath)) {
    const extCode = fs.readFileSync(extJsPath, 'utf8');
    const loc = locateExtensionWebviewHook(extCode);
    if (loc.matched) {
      matchedAnchors.push({
        ...extAnchor,
        offset: loc.offset,
        detail: loc.alreadyHooked ? '钩子已挂载' : `动态命中 URL 参数 ${loc.urlArg}`
      });
    } else {
      missingAnchors.push({
        ...extAnchor,
        pattern: 'renderWebviewHtml(a,b,c,d){ ... asWebviewUri(...,"bridge.js")'
      });
    }
  } else {
    missingAnchors.push({ ...extAnchor, pattern: `文件不存在: ${extJsPath}` });
  }

  // ----- B. 核心必选层 2：设置底座 5 大抗混淆锚点（窄窗口毫秒级定位，至少命中 2 项即可） -----
  const coreSettingRules = [
    {
      id: 'vT',
      name: '侧边栏路由映射函数 (vT 抗混淆)',
      anchor: '){return ',
      back: 30,
      fwd: 60,
      regex: /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return ([A-Za-z_$][\w$]*)\.get\(\2\)\?\?\2\}/
    },
    {
      id: 'uT',
      name: '顶层页面大标题与说明组件 (uT 抗混淆)',
      anchor: ',scrollable:',
      back: 90,
      fwd: 90,
      regex: /([A-Za-z_$][\w$]*)=\(\{title:([A-Za-z_$][\w$]*),description:([A-Za-z_$][\w$]*),children:([A-Za-z_$][\w$]*),scrollable:([A-Za-z_$][\w$]*)=!0,headerRight:([A-Za-z_$][\w$]*),onBack:([A-Za-z_$][\w$]*)\}\)=>\{/
    },
    {
      id: 'yT',
      name: '分区折叠小标题组件 (yT 抗混淆)',
      anchor: ',defaultCollapsed:',
      back: 140,
      fwd: 90,
      regex: /([A-Za-z_$][\w$]*)=\(\{title:([A-Za-z_$][\w$]*),subtitle:([A-Za-z_$][\w$]*),headerRight:([A-Za-z_$][\w$]*),id:([A-Za-z_$][\w$]*),count:([A-Za-z_$][\w$]*),collapsible:([A-Za-z_$][\w$]*)=!1,defaultCollapsed:([A-Za-z_$][\w$]*)=!1,forceExpanded:([A-Za-z_$][\w$]*)=!1,children:([A-Za-z_$][\w$]*)\}\)=>\{/
    },
    {
      id: 'xT',
      name: '设置项卡片单行渲染器 (xT 抗混淆)',
      anchor: ',unpadded:',
      back: 180,
      fwd: 120,
      regex: /var ([A-Za-z_$][\w$]*)=\(\{label:([A-Za-z_$][\w$]*),description:([A-Za-z_$][\w$]*),rightElement:([A-Za-z_$][\w$]*),extraContent:([A-Za-z_$][\w$]*),badge:([A-Za-z_$][\w$]*),alignItems:([A-Za-z_$][\w$]*)=["']center["'],unpadded:([A-Za-z_$][\w$]*)=!1,labelId:([A-Za-z_$][\w$]*),descriptionId:([A-Za-z_$][\w$]*),disabled:([A-Za-z_$][\w$]*)=!1,"data-testid":([A-Za-z_$][\w$]*)\}\)=>/
    },
    {
      id: 'sT',
      name: '配置元数据工厂与 Map 闭环 (sT 抗混淆)',
      anchor: 'return new Map([["useAICredits"',
      back: 450,
      fwd: 20,
      regex: /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{(?:(?!;function )[\s\S]){0,420}?return new Map\(\[\["useAICredits"/
    }
  ];

  const coreHits = [];
  const coreMisses = [];
  for (const rule of coreSettingRules) {
    const m = findByAnchorRegex(code, rule.anchor, rule.regex, rule.back, rule.fwd);
    if (m) {
      if (rule.id === 'sT') {
        const endRe = new RegExp(`settingType:"switch"\\}\\]\\]\\)\\}var ([A-Za-z_$][\\w$]*)=${m[1]}\\(\\);`);
        if (!findByAnchorRegex(code.slice(m.index), 'settingType:"switch"}]])}', endRe, 10, 40)) {
          coreMisses.push(rule);
          continue;
        }
      }
      coreHits.push({ id: rule.id, name: rule.name, offset: m.index, symbol: m[1] });
      matchedAnchors.push({ id: rule.id, name: rule.name, offset: m.index, detail: `动态符号 ${m[1]}` });
    } else {
      coreMisses.push(rule);
    }
  }
  if (coreHits.length < 2) {
    for (const miss of coreMisses) {
      missingAnchors.push({ id: miss.id, name: miss.name, pattern: String(miss.regex) });
    }
  }

  // ----- C. 独立增强模块层（各自窄窗口判定，不兼容时安全降级跳过该模块） -----
  const featureModules = [];

  // 模块 1：会话标题枢纽 + 4 绕过点（抗混淆）
  const xbMatch = findByAnchorRegex(
    code,
    '?.annotations?.coordinator?',
    /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{var ([A-Za-z_$][\w$]*)=\2\?\.annotations\?\.title\?\.trim\(\);return \2\?\.annotations\?\.coordinator\?\3\|\|"Coordinator":\3\|\|\2\?\.summary\?\.trim\(\)\|\|void 0\}/,
    100,
    120
  );
  const bypassPatterns = [
    { anchor: '.title||"Untitled Conversation"', regex: /label:([A-Za-z_$][\w$]*)\.title\|\|"Untitled Conversation"/ },
    { anchor: '||`Conversation ${', regex: /([A-Za-z_$][\w$]*)=\1\.annotations\?\.title\|\|([A-Za-z_$][\w$]*)\|\|`Conversation \$\{([A-Za-z_$][\w$]*)\.slice\(0,8\)\}`/ },
    { anchor: '||"Parent Conversation"', regex: /title:([A-Za-z_$][\w$]*)\?\.annotations\?\.title\?\.trim\(\)\|\|\1\?\.summary\|\|"Parent Conversation"/ },
    { anchor: '.annotations?.title?.trim()||', regex: /([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.annotations\?\.title\?\.trim\(\)\|\|\1;/ }
  ];
  const bypassHitCount = bypassPatterns.filter(p => Boolean(findByAnchorRegex(code, p.anchor, p.regex, 80, 60))).length;
  featureModules.push({
    id: 'titleHub',
    name: '会话标题显示枢纽与 4 绕过点 (抗混淆)',
    matched: Boolean(xbMatch && bypassHitCount === 4),
    detail: xbMatch ? `符号 ${xbMatch[1]}，绕过点 ${bypassHitCount}/4` : '未匹配到标题枢纽函数'
  });

  // 模块 2：会话标题 RPC 自动持久化守卫（全抗混淆动态定位，兼容 vcc / sjc 等）
  const rpcLoc = locateTitleRpcModule(code);
  featureModules.push({
    id: 'titleRpc',
    name: '会话标题原生 RPC 自动持久化守卫 (抗混淆)',
    matched: rpcLoc.matched,
    detail: rpcLoc.matched
      ? `组件 ${rpcLoc.compName} (React=${rpcLoc.reactVar}, action=${rpcLoc.patchActionFn}, pb=${rpcLoc.createFn}/${rpcLoc.pbMod})`
      : `${rpcLoc.reason}（将自动降级跳过）`
  });

  // 模块 3：思维链实时流式翻译与悬停小锁（全抗混淆动态定位，兼容 iAc / rTc 等）
  const hacOk = Boolean(
    findByAnchorRegex(code, '>=0?`Thinking for ${Math.max(1,', /([A-Za-z_$][\w$]*)>=0\?`Thinking for \$\{Math\.max\(1,\1\)\}s`:"Thinking"/, 24, 60)
  );
  const thoughtLoc = locateThoughtModule(code);
  featureModules.push({
    id: 'thoughtStream',
    name: '思维链实时流式翻译、直出门控与悬停小锁 (抗混淆)',
    matched: hacOk && thoughtLoc.matched,
    detail:
      hacOk && thoughtLoc.matched
        ? `组件 ${thoughtLoc.compName} (React=${thoughtLoc.reactVar}, collapse=${thoughtLoc.collapseComp}, header=${thoughtLoc.headerComp})`
        : [!hacOk ? '缺失 hAc 计时文案' : '', thoughtLoc.reason || ''].filter(Boolean).join('; ')
  });

  // 模块 4：Markdown 表格智能自适应与菜单汉化（全抗混淆动态定位，兼容 ckc-mkc / Crc-Mrc 等）
  const tableLoc = locateTableModule(code);
  featureModules.push({
    id: 'tableLayout',
    name: 'Markdown 表格智能权重自适应与菜单汉化 (抗混淆)',
    matched: tableLoc.matched,
    detail: tableLoc.matched
      ? `组件 ${tableLoc.measureFn}/${tableLoc.tableComp}/${tableLoc.menuComp} (React=${tableLoc.reactVar}, menu=${tableLoc.menuRoot}, icon=${tableLoc.iconComp})`
      : tableLoc.reason
  });

  // ----- D. 外围增强锚点（workbench / jetskiAgent 窄窗口抗混淆探测） -----
  const optionalAnchors = [];
  if (fs.existsSync(wbPath)) {
    const wbLive = fs.readFileSync(wbPath, 'utf8');
    const wbSrc = fs.existsSync(wbPath + '.bak') && isWorkbenchPatched(wbLive)
      ? fs.readFileSync(wbPath + '.bak', 'utf8')
      : wbLive;
    const wbReady = Boolean(findByAnchorRegex(wbSrc, '?.annotations?.title?.trim()', WORKBENCH_TITLE_FN_REGEX, 60, 120)) || isWorkbenchPatched(wbLive);
    optionalAnchors.push({
      id: 'workbench_title',
      name: '外层工作台标题枢纽 (workbench 抗混淆)',
      matched: wbReady
    });
  }
  if (fs.existsSync(jkPath)) {
    const jkLive = fs.readFileSync(jkPath, 'utf8');
    const jkSrc = fs.existsSync(jkPath + '.bak') && isJetskiPatched(jkLive)
      ? fs.readFileSync(jkPath + '.bak', 'utf8')
      : jkLive;
    const jkTitleReady =
      (Boolean(findByAnchorRegex(jkSrc, '?.annotations?.title?.trim()', JETSKI_TITLE_FN_REGEX, 60, 120)) &&
        Boolean(findByAnchorRegex(jkSrc, '.summary||"Untitled Conversation";', JETSKI_UEN_REGEX, 40, 20)) &&
        Boolean(findByAnchorRegex(jkSrc, '.cascadeId,label:', JETSKI_SMA_REGEX, 40, 50))) ||
      isJetskiPatched(jkLive);
    const jkThoughtReady =
      (Boolean(findByAnchorRegex(jkSrc, '>=0?`Thinking for ${Math.max(1,', JETSKI_THINKING_FOR_REGEX, 24, 80)) &&
        Boolean(findByAnchorRegex(jkSrc, '?`Thought for ${Math.max(1,Number(', JETSKI_THOUGHT_FOR_REGEX, 24, 90)) &&
        jkSrc.includes(JETSKI_THINKING_DOTS_TARGET)) ||
      isJetskiPatched(jkLive);
    optionalAnchors.push({
      id: 'jetski_titles',
      name: '独立智能体弹窗标题枢纽 (jetskiAgent 抗混淆)',
      matched: jkTitleReady
    });
    optionalAnchors.push({
      id: 'jetski_thoughts',
      name: '独立智能体弹窗思考标签 (jetskiAgent 抗混淆)',
      matched: jkThoughtReady
    });
  }

  const coreCompatible = missingAnchors.length === 0;
  const allFeaturesCompatible =
    coreCompatible &&
    coreMisses.length === 0 &&
    featureModules.every(m => m.matched) &&
    optionalAnchors.every(a => a.matched);

  return {
    compatible: coreCompatible,
    fullyCompatible: allFeaturesCompatible,
    matchedAnchors,
    missingAnchors,
    featureModules,
    optionalAnchors,
    codeLength: code.length
  };
}

/**
 * 阶段三：执行统一全自动无损重新编译与全量重注入
 */
function applyFullLocalization(logger) {
  return applyAllPatches({
    patchDir: PATCH_DIR,
    logger: (msg) => logger('  ' + msg.replace(/^\n+/, '')),
    buildStdio: 'pipe'
  });
}

function showNotification(title, message) {
  try {
    const vbs = buildVbsNotificationScript(title, message);
    const tmpVbs = path.join(os.tmpdir(), 'agy_zh_notice.vbs');
    const bom = Buffer.from([0xff, 0xfe]);
    fs.writeFileSync(tmpVbs, Buffer.concat([bom, Buffer.from(vbs, 'utf16le')]));
    spawn('wscript.exe', [tmpVbs], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {}
}

/**
 * 主执行流程
 */
function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const isLaunchRequested = args.includes('--launch') || args.includes('-l');
  const userAppArgs = args.filter(a => a !== '--launch' && a !== '-l');

  // 1. 执行日志保留策略：写本次前仅保留最近 1 次历史运行（写入本次后文件内恰好保留最近 2 次）
  const purgeResult = pruneLogKeepLastRuns(LOG_FILE, 1, 500 * 1024);

  // 2. 收集完整 4 维客户端身份信息
  const appId = readInstalledAppIdentity(RESOURCES_APP);
  const versionDisplay = formatAppIdentity(appId);

  const now = new Date();
  const timeStr =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const logBuffer = [];
  const appendLog = (msg) => logBuffer.push(msg);

  appendLog(`================================================================================`);
  appendLog(`【启动自检与全景监控日志】 ${timeStr}`);
  appendLog(`================================================================================`);
  appendLog(`[环境概要]`);
  appendLog(`  • 客户端版本   : Antigravity ${versionDisplay}`);
  appendLog(`  • 宿主平台     : Windows ${os.release()} (${os.arch()}) | Node: ${process.version}`);
  appendLog(`  • 日志存储位置 : ${LOG_FILE}`);
  if (purgeResult.purgedRuns > 0) {
    appendLog(`  • 日志保留策略 : 仅保留最近 2 次运行日志（本次前已自动清理 ${purgeResult.purgedRuns} 次更早记录）`);
  }
  if (purgeResult.trimmed) {
    appendLog(`  • 日志容量保护 : 单次日志体积超过 500KB，已自动安全裁剪早期明细`);
  }
  if (userAppArgs.length > 0) {
    appendLog(`  • 启动透传参数 : ${userAppArgs.join(' ')}`);
  }

  appendLog(`\n[核心模块多维健康度检测]`);

  // 3. 执行深度健康检查
  const health = inspectHealthDeeply();

  if (health.details.extension && health.details.extension.ok) {
    appendLog(`  ✔ 核心扩展 (extension.js)   : 正常 [大小: ${health.details.extension.size}, 钩子: ${health.details.extension.hookStatus}, 扩展命令: ${health.details.extension.pkgStatus}]`);
  } else {
    appendLog(`  ❌ 核心扩展 (extension.js)   : 异常 [${health.details.extension?.error || `${health.details.extension?.hookStatus} / ${health.details.extension?.pkgStatus}`}]`);
  }

  if (health.details.proxy && health.details.proxy.ok) {
    appendLog(`  ✔ 本地代理 (hub_proxy.js)   : 就绪 [大小: ${health.details.proxy.size}, 监听: ${health.details.proxy.port}, ${health.details.proxy.translateEndpoint}, ${health.details.proxy.syncStatus}]`);
  } else {
    appendLog(`  ❌ 本地代理 (hub_proxy.js)   : 异常 [${health.details.proxy?.error || `${health.details.proxy?.translateEndpoint} | ${health.details.proxy?.syncStatus} | ${health.details.proxy?.metaStatus}`}]`);
  }

  if (health.details.zhBundle && health.details.zhBundle.ok) {
    appendLog(`  ✔ 汉化资产 (hub_main_zh.js) : 完整 [大小: ${health.details.zhBundle.size}, 版本校验: ${health.details.zhBundle.driftStatus}]`);
    const eng = health.details.zhBundle.engines;
    appendLog(`     └─► 引擎指纹核验: sT配置工厂(${eng.sT_元数据工厂}) | uT大标题(${eng.uT_顶层标题卡片}) | yT分区(${eng.yT_分区折叠面板}) | xT设置行(${eng.xT_设置卡片行}) | XB标题枢纽(${eng.XB_会话标题枢纽}) | iAc思维链(${eng.iAc_思维链流式翻译}) | lkc表格自适应(${eng.lkc_表格自适应布局}) | DOM清洗(${eng.DOM_运行时清洗器})`);
  } else {
    appendLog(`  ❌ 汉化资产 (hub_main_zh.js) : 异常 [${health.details.zhBundle?.error || health.details.zhBundle?.driftStatus || '组件指纹不完整'}]`);
  }

  if (health.details.outerBundles && health.details.outerBundles.ok) {
    appendLog(`  ✔ 外层工作台与智能体弹窗    : 正常 [workbench(${health.details.outerBundles.workbench}) | jetskiAgent(${health.details.outerBundles.jetskiAgent})]`);
  } else {
    appendLog(`  ❌ 外层工作台与智能体弹窗    : 异常 [workbench(${health.details.outerBundles?.workbench}) | jetskiAgent(${health.details.outerBundles?.jetskiAgent})]`);
  }

  if (health.details.integrity && health.details.integrity.ok) {
    appendLog(`  ✔ 完整性签名 (product.json) : 100% 匹配 (共对齐 ${health.details.integrity.matched}/${health.details.integrity.total} 项核心 bundle，零损坏弹窗风险)`);
  } else {
    const integ = health.details.integrity;
    appendLog(`  ❌ 完整性签名 (product.json) : 不匹配 (仅命中 ${integ?.matched || 0}/${integ?.total || 0} 项)`);
    if (integ?.mismatches && integ.mismatches.length > 0) {
      appendLog(`     └─► 失效项: ${integ.mismatches.join(', ')}`);
    }
  }

  appendLog(`\n[综合判定与自愈决策]`);

  if (health.valid) {
    const skippedList = (readDeployMeta(EXT_DIR)?.skippedModules) || [];
    if (skippedList.length > 0) {
      appendLog(`  ⚠ 结论: 核心基础汉化运行正常，但当前存在 ${skippedList.length} 个已降级未生效模块 (自检耗时: ${Date.now() - startTime}ms)`);
      for (const sk of skippedList) {
        appendLog(`     • [未生效/降级] ${sk.module} -> ${sk.reason}`);
      }
    } else {
      appendLog(`  ✔ 结论: 汉化全链路与全部增强功能 100% 健康就绪 (自检耗时: ${Date.now() - startTime}ms)`);
    }
    appendLog(`  ✔ 动作: 准备拉起 Antigravity IDE 主进程...`);
  } else {
    appendLog(`  ⚠ 结论: 检测到汉化失效、源码升级或官方更新覆盖！`);
    for (const fail of health.failures) {
      appendLog(`     • ${fail}`);
    }

    appendLog(`\n[新版本分层抗混淆兼容性评估 (Tiered Compatibility Prober)]`);
    const candidatePath = resolveHubSourcePath(EXT_DIR, PATCH_DIR);
    const probe = probeVersionCompatibility(candidatePath);

    const totalRequired = probe.matchedAnchors.length + probe.missingAnchors.length;
    appendLog(`  • 评估目标: ${candidatePath} (体积: ${formatBytes(probe.codeLength)})`);
    appendLog(`  • 核心必选层探测 (${probe.matchedAnchors.length}/${totalRequired} 项):`);
    for (const anchor of probe.matchedAnchors) {
      appendLog(`     ✔ [命中] ${anchor.name} (偏移: ${anchor.offset}${anchor.detail ? `, ${anchor.detail}` : ''})`);
    }
    for (const anchor of probe.missingAnchors) {
      appendLog(`     ❌ [缺失] ${anchor.name} -> "${anchor.pattern}"`);
    }
    if (probe.featureModules && probe.featureModules.length > 0) {
      appendLog(`  • 独立增强模块评估 (${probe.featureModules.filter(m => m.matched).length}/${probe.featureModules.length} 项):`);
      for (const mod of probe.featureModules) {
        appendLog(`     ${mod.matched ? '✔ [兼容]' : '⚠ [将自动降级跳过]'} ${mod.name} (${mod.detail})`);
      }
    }
    if (probe.optionalAnchors && probe.optionalAnchors.length > 0) {
      appendLog(`  • 外围增强特征评估 (${probe.optionalAnchors.filter(a => a.matched).length}/${probe.optionalAnchors.length} 项):`);
      for (const opt of probe.optionalAnchors) {
        appendLog(`     ${opt.matched ? '✔ [兼容]' : '⚠ [跳过]'} ${opt.name}`);
      }
    }

    if (probe.compatible) {
      const modeDesc = probe.fullyCompatible
        ? '全核心与增强模块 100% 兼容，执行满血同步自愈...'
        : '核心底座 100% 兼容，执行分层韧性同步自愈（不兼容增强模块自动安全降级跳过）...';
      appendLog(`\n  🎉 评估结论: ${modeDesc}`);
      try {
        const healStart = Date.now();
        const healRes = applyFullLocalization(appendLog);
        const skipped = (healRes && healRes.buildReport && healRes.buildReport.skippedModules) || [];
        appendLog(`  ✔ 自适应全量自愈汉化完成！(自愈流水线耗时: ${Date.now() - healStart}ms${skipped.length > 0 ? `，降级跳过 ${skipped.length} 个模块` : ''})`);
        if (skipped.length > 0) {
          const skipNames = skipped.map(s => s.module).join('、');
          showNotification(
            'Antigravity 汉化已同步适配（部分降级）',
            `检测到 Antigravity 已更新至 ${versionDisplay}。\n核心中文界面已自动同步完成，可正常使用！\n\n以下增强模块因新版内部结构变化已安全跳过（不影响主界面稳定）：\n• ${skipNames}\n\n详细诊断报告：\n${LOG_FILE}`
          );
        }
      } catch (err) {
        appendLog(`  ❌ 自动汉化执行失败: ${err.message}`);
        appendLog(err.stack);
        showNotification(
          'Antigravity 汉化自愈警告',
          `自动重新汉化过程中遇到错误：\n${err.message}\n\n已为您保留原版启动，详细信息请查看日志。\n日志路径: ${LOG_FILE}`
        );
      }
    } else {
      appendLog(`\n  🛑 评估结论: 检测到核心入口或底层结构不兼容，触发安全熔断！`);
      appendLog(`  🛡 防护策略: 坚守安全红线，终止自动注入，防止代码破坏或主窗口白屏。`);
      appendLog(`  💡 处置建议: 保持官方原版启动，请查看日志定位缺失的核心锚点。`);
      showNotification(
        'Antigravity IDE 汉化更新提示',
        `检测到 Antigravity IDE 进行了版本更新 (${versionDisplay})。\n由于新版本重构了核心入口代码，现有规则暂不完全适用。\n\n为确保正常使用，已保持官方原版启动，详细分析报告已写入日志：\n${LOG_FILE}`
      );
    }
  }

  // 4. 拉起主程序
  if (isLaunchRequested) {
    if (fs.existsSync(IDE_EXE)) {
      appendLog(`\n[进程拉起] 正在启动主程序: "${IDE_EXE}" (总前置耗时: ${Date.now() - startTime}ms)`);
      const child = spawn(IDE_EXE, userAppArgs, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } else {
      appendLog(`\n❌ [进程拉起失败] 未找到主程序可执行文件: ${IDE_EXE}`);
    }
  }

  appendLog(`--------------------------------------------------------------------------------\n`);
  writeLog(logBuffer.join('\n'));
}

if (require.main === module) {
  main();
}

module.exports = {
  inspectHealthDeeply,
  probeVersionCompatibility,
  applyFullLocalization,
  pruneLogKeepLastRuns,
  buildVbsNotificationScript
};
