/**
 * Antigravity IDE 智能自愈与更新自适应检测引擎 (Auto-Updater & Self-Healing Engine)
 *
 * 核心特性：
 * 1. 深度多维健康检查：覆盖 7 大维度（扩展钩子、代理与双翻译微服务模板一致性、hub_main_zh.js 完整特性指纹、
 *    官方 hub_main.js 与构建引擎哈希漂移、外层 workbench/jetskiAgent/package.json 注入态、元数据与 product.json 全量签名）
 * 2. 分层特征指纹兼容探针：23 项主引擎必选核心锚点（含 iAc/lkc/mkc 内部耦合符号组与 extension.js）+ 外围增强锚点分级评估
 * 3. 统一无损自愈流水线：直接复用 core_injector.applyAllPatches，与手动 patcher.js 100% 同步无漏项，内置跨版本 .bak 防污染保护
 * 4. 零破坏安全防御：遇到不兼容版本坚决熔断，保持官方原版启动并输出详尽诊断报告
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
  THOUGHT_TRANSLATOR_REQUIRED_MARKERS,
  HUB_ZH_THOUGHT_FEATURE_MARKERS,
  HUB_ZH_TITLE_FEATURE_MARKERS,
  HUB_ZH_TABLE_FEATURE_MARKERS,
  EXTENSION_HOOK_MARKER,
  EXTENSION_HOOK_TARGET,
  WORKBENCH_YHN_TARGET,
  JETSKI_EST_TARGET,
  JETSKI_UEN_TARGET,
  JETSKI_SMA_TARGET,
  JETSKI_THOUGHT_PAIRS,
  isAgyPackageLocalized,
  isWorkbenchPatched,
  isJetskiPatched,
  filesAreIdentical,
  resolveHubSourcePath,
  readInstalledAppIdentity,
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
const PACKAGE_JSON = path.join(RESOURCES_APP, 'package.json');
const OUT_DIR = path.join(RESOURCES_APP, 'out');
const WORKBENCH_JS = path.join(OUT_DIR, 'vs', 'workbench', 'workbench.desktop.main.js');
const JETSKI_JS = path.join(OUT_DIR, 'jetskiAgent', 'main.js');
const EXT_JS = path.join(EXT_DIR, 'vscode', 'extension.js');
const PROXY_JS = path.join(EXT_DIR, 'hub_proxy.js');
const TRANSLATOR_JS = path.join(EXT_DIR, 'title_translator.js');
const THOUGHT_TRANSLATOR_JS = path.join(EXT_DIR, 'thought_translator.js');
const ZH_MAIN_JS = path.join(EXT_DIR, 'hub_main_zh.js');
const LIVE_HUB_MAIN = path.join(EXT_DIR, 'hub_main.js');
const SRC_HUB_MAIN = path.join(PATCH_DIR, 'hub_main.js');
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
 * 日志按运行次数精准留存管理器（严格保留最近 2 次运行日志）
 * - 写入本次新日志前调用 keepExistingRuns = 1，写完本次后文件内恰好保留最近 2 次完整运行记录
 * - 若单次极端体积超过 maxBytes，额外执行尾部行保护
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
    const missingThoughtMarkers = THOUGHT_TRANSLATOR_REQUIRED_MARKERS.filter(m => !thoughtContent.includes(m));
    const proxySynced = !fs.existsSync(SRC_PROXY_JS) || filesAreIdentical(SRC_PROXY_JS, PROXY_JS);
    const titleSynced = !fs.existsSync(SRC_TRANSLATOR_JS) || filesAreIdentical(SRC_TRANSLATOR_JS, TRANSLATOR_JS);
    const thoughtSynced = !fs.existsSync(SRC_THOUGHT_TRANSLATOR_JS) || filesAreIdentical(SRC_THOUGHT_TRANSLATOR_JS, THOUGHT_TRANSLATOR_JS);

    const proxyAllOk = missingEndpoints.length === 0 && missingThoughtMarkers.length === 0 && proxySynced && titleSynced && thoughtSynced && metaOk;

    report.details.proxy = {
      path: PROXY_JS,
      size: formatBytes(stat.size),
      port: hasFixedPort ? '固定高位端口 14588 (消除时序竞争)' : '动态端口',
      translateEndpoint:
        missingEndpoints.length === 0
          ? `已启用全部 ${PROXY_REQUIRED_ENDPOINTS.length} 项标题与思维链微服务端点`
          : `缺少端点: ${missingEndpoints.join(', ')}`,
      syncStatus: proxySynced && titleSynced && thoughtSynced ? '与源码 100% 同步' : '检测到源码已更新（待同步）',
      metaStatus: metaOk ? '元数据与纯本地缓存配置就绪' : '缺少 .agy_zh_meta.json',
      ok: proxyAllOk
    };

    if (missingEndpoints.length > 0) {
      report.valid = false;
      report.failures.push(`hub_proxy.js 缺少必要微服务端点: ${missingEndpoints.join(', ')}`);
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

  // 3. 检查汉化核心 hub_main_zh.js（含最新直出中文门控、防打断悬停与小锁特性指纹）
  if (fs.existsSync(ZH_MAIN_JS)) {
    const stat = fs.statSync(ZH_MAIN_JS);
    const content = fs.readFileSync(ZH_MAIN_JS, 'utf8');

    const hasSt = content.includes('_wrapMap(new Map');
    const hasUt = content.includes('_titles =') && content.includes('通用设置');
    const hasYt = content.includes('_secTitles =') && content.includes('自定义扩展与技能');
    const hasXt = content.includes('_labels =') && content.includes('权限预设模板');
    const hasDomCleaner = content.includes('Antigravity 全局自适应运行时 DOM 清洗引擎');
    const hasTitleEngine = HUB_ZH_TITLE_FEATURE_MARKERS.every(m => content.includes(m));
    const missingThoughtFeatures = HUB_ZH_THOUGHT_FEATURE_MARKERS.filter(m => !content.includes(m));
    const hasThoughtEngine = missingThoughtFeatures.length === 0;
    const missingTableFeatures = HUB_ZH_TABLE_FEATURE_MARKERS.filter(m => !content.includes(m));
    const hasTableEngine = missingTableFeatures.length === 0;

    // 检查版本漂移：官方 IDE 版本/distro、hub_main.js 源或本地构建引擎是否已变更
    const hubSourcePath = resolveHubSourcePath(EXT_DIR, PATCH_DIR);
    const hubSourceSha = computeFileSha256(hubSourcePath);
    const buildEngineSha = computeFileSha256(BUILD_ENGINE_JS);
    const { appVersion: curAppVersion, distro: curDistro } = readInstalledAppIdentity(RESOURCES_APP);
    const appIdentityDrifted = Boolean(
      meta &&
        ((curAppVersion && meta.appVersion && meta.appVersion !== curAppVersion) ||
          (curDistro && meta.distro && meta.distro !== curDistro))
    );
    const hubSourceDrifted = Boolean(hubSourceSha && meta && meta.hubSourceSha256 && meta.hubSourceSha256 !== hubSourceSha);
    const buildEngineDrifted = Boolean(buildEngineSha && meta && meta.buildEngineSha256 && meta.buildEngineSha256 !== buildEngineSha);
    const hubMetaMissingHash = Boolean(!meta || !meta.hubSourceSha256 || !meta.buildEngineSha256 || (curDistro && !meta.distro));
    const noDrift = !appIdentityDrifted && !hubSourceDrifted && !buildEngineDrifted && !hubMetaMissingHash;

    const allEnginesOk = hasSt && hasUt && hasYt && hasXt && hasDomCleaner && hasTitleEngine && hasThoughtEngine && hasTableEngine && noDrift;

    report.details.zhBundle = {
      path: ZH_MAIN_JS,
      size: formatBytes(stat.size),
      mtime: stat.mtime.toLocaleString('zh-CN', { hour12: false }),
      engines: {
        sT_元数据工厂: hasSt ? '✔ 劫持正常' : '❌ 缺失',
        uT_顶层标题卡片: hasUt ? '✔ 注入正常' : '❌ 缺失',
        yT_分区折叠面板: hasYt ? '✔ 注入正常' : '❌ 缺失',
        xT_设置卡片行: hasXt ? '✔ 注入正常' : '❌ 缺失',
        XB_会话标题枢纽: hasTitleEngine ? '✔ 拦截与实时持久化就绪' : '❌ 缺失/版本过旧',
        iAc_思维链流式翻译: hasThoughtEngine ? '✔ 直出门控/悬停防打断/小锁全就绪' : `❌ 缺失 (${missingThoughtFeatures.slice(0, 3).join(', ')})`,
        lkc_表格自适应布局: hasTableEngine ? '✔ 智能权重列宽/防遮挡/菜单汉化就绪' : `❌ 缺失 (${missingTableFeatures.slice(0, 3).join(', ')})`,
        DOM_运行时清洗器: hasDomCleaner ? '✔ 挂载正常' : '❌ 缺失'
      },
      driftStatus: appIdentityDrifted
        ? `检测到 IDE 版本变化 (${meta.appVersion}/${String(meta.distro || '').slice(0, 8)} -> ${curAppVersion}/${String(curDistro || '').slice(0, 8)})`
        : hubSourceDrifted
          ? 'hub_main.js 源码已更新（待重编）'
          : buildEngineDrifted
            ? '构建引擎源码已更新（待重编）'
            : hubMetaMissingHash
              ? '版本基准哈希待建立'
              : '与当前客户端版本、源资产及构建脚本零漂移',
      ok: allEnginesOk
    };
    if (!hasSt || !hasUt || !hasYt || !hasXt || !hasDomCleaner || !hasTitleEngine) {
      report.valid = false;
      report.failures.push('hub_main_zh.js 汉化引擎或会话标题守卫指纹不完整');
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
      report.failures.push(`检测到 Antigravity IDE 版本或 Distro 变化 (${meta.appVersion} -> ${curAppVersion})，需重新验证并自愈注入`);
    } else if (hubSourceDrifted) {
      report.valid = false;
      report.failures.push('检测到 hub_main.js 源资产发生变更（与已编译 hub_main_zh.js 基准哈希不一致，需自动重编）');
    } else if (buildEngineDrifted) {
      report.valid = false;
      report.failures.push('检测到本地 build_ultimate_chinese_engine.js 已更新（需重新编译部署 hub_main_zh.js）');
    } else if (hubMetaMissingHash) {
      report.valid = false;
      report.failures.push('部署元数据缺少 hub_main.js/构建脚本/Distro 基准指纹（需自愈对齐一次）');
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
    workbench: wbExists ? (wbOk ? '✔ yhn 标题枢纽已注入' : '❌ 未注入/被官方覆盖') : '❌ 文件不存在',
    jetskiAgent: jkExists ? (jkOk ? '✔ est 标题与思考标签已注入' : '❌ 未注入/被官方覆盖') : '❌ 文件不存在',
    ok: wbOk && jkOk
  };
  if (wbExists && !wbOk) {
    report.valid = false;
    report.failures.push('workbench.desktop.main.js 会话标题枢纽 yhn(t) 未注入或已被官方更新覆写');
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
    report.details.liveBundle = { ok: false, error: '文件不存在' };
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
 * 阶段二：分层新版本特征指纹兼容性探针
 * - 必选核心锚点（23 项，含 hub_main.js 22 项 + extension.js 1 项）：任一缺失即坚决熔断保护，防止白屏
 * - 外围增强锚点（workbench / jetskiAgent）：分级记录诊断，不阻断主引擎自愈
 */
function probeVersionCompatibility(targetHubMainPath, opts = {}) {
  const extJsPath = opts.extJsPath || EXT_JS;
  const wbPath = opts.wbPath || WORKBENCH_JS;
  const jkPath = opts.jkPath || JETSKI_JS;

  if (!fs.existsSync(targetHubMainPath)) {
    return {
      compatible: false,
      matchedAnchors: [],
      missingAnchors: [{ id: 'hub_main', name: '官方静态源 hub_main.js', pattern: targetHubMainPath }],
      optionalAnchors: [],
      codeLength: 0,
      details: `在路径 ${targetHubMainPath} 未找到官方前端 bundle 文件。`
    };
  }

  const code = fs.readFileSync(targetHubMainPath, 'utf8');

  const requiredHubAnchors = [
    {
      id: 'vT',
      name: '侧边栏与路由映射函数 (vT)',
      pattern: 'function vT(a){return CKb.get(a)??a}',
      desc: '负责将 General、Browser、Models 等 20+ 个路由名称分发至侧边栏导航'
    },
    {
      id: 'uT',
      name: '顶层页面大标题与长篇说明组件 (uT)',
      pattern: 'var zKb=D.createContext(!1),uT=({title:a,description:b',
      desc: '负责 14 个设置屏幕及二级弹窗的顶层 Title 与 Description 展示'
    },
    {
      id: 'yT',
      name: '分区面板折叠小标题组件 (yT)',
      pattern: 'var yT=({title:a,subtitle:b,headerRight:c',
      desc: '负责 48 个分区（Token Usage、Skills、Rules、Browser Subagent 等）的分类展示'
    },
    {
      id: 'xT',
      name: '设置项卡片单行渲染器 (xT)',
      pattern: 'var xT=({label:a,description:b,rightElement:c',
      desc: '负责所有单项设置开关、说明文字与操作按钮的通用行渲染'
    },
    {
      id: 'sT_head',
      name: '配置元数据工厂函数头 (sT)',
      pattern: 'function sT(a){',
      desc: '设置中心的核心注册表工厂，提供全部动态配置项'
    },
    {
      id: 'sT_map',
      name: '配置注册表 Map 入口 (sT Map)',
      pattern: 'return new Map([["useAICredits"',
      desc: '配置字典的构造起点'
    },
    {
      id: 'sT_end',
      name: '配置注册表 Map 闭合特征 (sT End)',
      pattern: 'settingType:"switch"}]])}var vKb=sT();',
      desc: '工厂函数的执行返回与单例实例化锚点'
    },
    {
      id: 'XB',
      name: '会话标题核心渲染枢纽 (XB)',
      pattern: 'function XB(a){var b=a?.annotations?.title?.trim()',
      desc: '侧边栏与检索面板输出会话标题的最底层终极拦截点'
    },
    {
      id: 'bypass_search',
      name: '会话标题绕过点 1：搜索结果列表项',
      pattern: 'label:a.title||"Untitled Conversation"',
      desc: '封堵全局检索结果绕过 XB 的渲染入口'
    },
    {
      id: 'bypass_active',
      name: '会话标题绕过点 2：活跃会话索引 ($2a)',
      pattern: 'a=a.annotations?.title||d||`Conversation ${f.slice(0,8)}`',
      desc: '封堵活跃对话列表绕过 XB 的渲染入口'
    },
    {
      id: 'bypass_parent',
      name: '会话标题绕过点 3：父级追溯链路 (OYc)',
      pattern: 'title:g?.annotations?.title?.trim()||g?.summary||"Parent Conversation"',
      desc: '封堵子对话回溯父对话绕过 XB 的渲染入口'
    },
    {
      id: 'bypass_scope',
      name: '会话标题绕过点 4：上下文引用作用域条目',
      pattern: 'g=d.annotations?.title?.trim()||g;',
      desc: '封堵上下文引用标题绕过 XB 的渲染入口'
    },
    {
      id: 'vcc',
      name: 'Hub 对话注释与状态挂载组件 (vcc)',
      pattern: 'var vcc=()=>{var a=SO(),b=Xk(),c=ZP(),d=xQ(),{updateConversationAnnotations:f}=PB(),g=tC(),h=wQ();',
      desc: '负责挂载 Redux 状态订阅及官方原生 updateConversationAnnotations RPC 持久化守卫'
    },
    {
      id: 'hAc',
      name: '思维链计时头部动画文案 (hAc)',
      pattern: 'd>=0?`Thinking for ${Math.max(1,d)}s`:"Thinking"',
      desc: '负责汉化思考中实时计时器头部文案'
    },
    {
      id: 'iAc_start',
      name: '思维链渲染组件起点 (iAc)',
      pattern: 'var iAc=({thinking:a,thinkingDuration:b,metadata:c,status:d,stepHasNonThinkingContent:f})=>{',
      desc: '负责渲染 Thought for 折叠面板及流式思维链实时翻译、防打断悬停与小锁交互'
    },
    {
      id: 'ckc_table_measure',
      name: 'Markdown 表格列宽测量函数 (ckc)',
      pattern: 'function ckc(a){var b=a.querySelector(":scope > table");',
      desc: '负责测量 Markdown 表格各列自然宽度与边框内边距'
    },
    {
      id: 'lkc_table_start',
      name: 'Markdown 表格主渲染组件起点 (lkc)',
      pattern: 'function lkc({node:a,staggerStyle:b,...c}){',
      desc: '负责 Markdown 表格自适应布局与窗口尺寸追踪'
    },
    {
      id: 'mkc_table_menu',
      name: 'Markdown 表格操作菜单组件 (mkc)',
      pattern: 'function mkc({widthMode:a,disabled:b=!1,onWidthModeChange:c,getMarkdown:d}){',
      desc: '负责表格右上角复制与展开全宽/适应窗口切换菜单'
    }
  ];

  const matchedAnchors = [];
  const missingAnchors = [];

  for (const anchor of requiredHubAnchors) {
    const idx = code.indexOf(anchor.pattern);
    if (idx !== -1) {
      matchedAnchors.push({ ...anchor, offset: idx });
    } else {
      missingAnchors.push(anchor);
    }
  }

  // 必选锚点 16：iAc 结尾定界符 (;var jAc= 必须在 iAc 起点之后)
  const iacStartAnchor = matchedAnchors.find(a => a.id === 'iAc_start');
  const iacStartIdx = iacStartAnchor ? iacStartAnchor.offset : -1;
  const iacEndIdx = iacStartIdx !== -1 ? code.indexOf(';var jAc=', iacStartIdx) : -1;
  const iacEndAnchor = {
    id: 'iAc_end',
    name: '思维链渲染组件定界终点 (;var jAc=)',
    pattern: ';var jAc='
  };
  if (iacEndIdx !== -1) {
    matchedAnchors.push({ ...iacEndAnchor, offset: iacEndIdx });
  } else {
    missingAnchors.push(iacEndAnchor);
  }

  // 必选锚点 17：iAc 内部强耦合外部混淆符号组（防止新版换符号名导致注入后运行时报错白屏）
  const iacCoupledSymbols = [
    'tI()',
    'd5b()',
    'J.CascadeRunStatus.RUNNING',
    'J.CortexStepStatus.RUNNING',
    'J.CortexStepStatus.GENERATING',
    'Fj()',
    'pqc()',
    'D.createElement(uY',
    'D.createElement(n2',
    'D.createElement(hAc'
  ];
  const iacBody = iacStartIdx !== -1 && iacEndIdx !== -1 ? code.slice(iacStartIdx, iacEndIdx + 1) : '';
  const missingCoupled = iacBody ? iacCoupledSymbols.filter(sym => !iacBody.includes(sym)) : iacCoupledSymbols;
  const coupledAnchor = {
    id: 'iAc_coupled_symbols',
    name: '思维链组件内部强耦合符号组 (tI/d5b/Fj/pqc/uY/n2/hAc)',
    pattern: missingCoupled.length > 0 ? `缺失符号: ${missingCoupled.join(', ')}` : iacCoupledSymbols.join(', ')
  };
  if (missingCoupled.length === 0) {
    matchedAnchors.push({ ...coupledAnchor, offset: iacStartIdx });
  } else {
    missingAnchors.push(coupledAnchor);
  }

  // 必选锚点 21：表格组件定界终点 (var nkc= 必须在 mkc 起点之后)
  const mkcStartAnchor = matchedAnchors.find(a => a.id === 'mkc_table_menu');
  const lkcStartAnchor = matchedAnchors.find(a => a.id === 'lkc_table_start');
  const mkcStartIdx = mkcStartAnchor ? mkcStartAnchor.offset : -1;
  const lkcStartIdx = lkcStartAnchor ? lkcStartAnchor.offset : -1;
  const nkcEndIdx = mkcStartIdx !== -1 ? code.indexOf('var nkc=({src:a,alt:b,originalFilePath:c', mkcStartIdx) : -1;
  const nkcEndAnchor = {
    id: 'nkc_table_end',
    name: 'Markdown 表格组件定界终点 (var nkc=)',
    pattern: 'var nkc=({src:a,alt:b,originalFilePath:c'
  };
  if (nkcEndIdx !== -1) {
    matchedAnchors.push({ ...nkcEndAnchor, offset: nkcEndIdx });
  } else {
    missingAnchors.push(nkcEndAnchor);
  }

  // 必选锚点 22：表格组件强耦合符号组 + 文件胶囊最小宽 CSS 锚点
  const tableCoupledSymbols = [
    'Wi(',
    'ckc(',
    'ekc(',
    'fkc(',
    'ikc(',
    'kkc(',
    'kY()',
    'D.createElement(WW',
    'D.createElement(XW',
    'D.createElement(YW',
    'D.createElement(ZW',
    'D.createElement(gH',
    'D.createElement(Aw'
  ];
  const tableBody = lkcStartIdx !== -1 && nkcEndIdx !== -1 ? code.slice(lkcStartIdx, nkcEndIdx) : '';
  const missingTableCoupled = tableBody ? tableCoupledSymbols.filter(sym => !tableBody.includes(sym)) : tableCoupledSymbols;
  const hasPillCss = code.includes('min-width: calc-size(max-content, min(size, 20ch));');
  if (!hasPillCss) missingTableCoupled.push('.inline-pill-wrap(20ch)');
  const tableCoupledAnchor = {
    id: 'table_coupled_symbols',
    name: 'Markdown 表格强耦合符号组与胶囊 CSS 锚点 (Wi/fkc/ikc/kkc/kY/WW-ZW/gH/Aw)',
    pattern: missingTableCoupled.length > 0 ? `缺失符号: ${missingTableCoupled.join(', ')}` : tableCoupledSymbols.join(', ')
  };
  if (missingTableCoupled.length === 0) {
    matchedAnchors.push({ ...tableCoupledAnchor, offset: lkcStartIdx });
  } else {
    missingAnchors.push(tableCoupledAnchor);
  }

  // 必选锚点 23：extension.js Webview 代理注入点（已挂钩或原生锚点命中）
  const extAnchor = {
    id: 'ext_renderWebviewHtml',
    name: '扩展 Webview 渲染钩子入口 (extension.js)',
    pattern: EXTENSION_HOOK_TARGET
  };
  if (fs.existsSync(extJsPath)) {
    const extCode = fs.readFileSync(extJsPath, 'utf8');
    const hookIdx = extCode.indexOf(EXTENSION_HOOK_MARKER);
    const rawIdx = extCode.indexOf(EXTENSION_HOOK_TARGET);
    if (hookIdx !== -1 || rawIdx !== -1) {
      matchedAnchors.push({ ...extAnchor, offset: hookIdx !== -1 ? hookIdx : rawIdx });
    } else {
      missingAnchors.push(extAnchor);
    }
  } else {
    missingAnchors.push({ ...extAnchor, pattern: `文件不存在: ${extJsPath}` });
  }

  // 外围增强锚点（可选分级评估：不阻断主引擎自愈，但透明展示在诊断报告中）
  const optionalAnchors = [];
  if (fs.existsSync(wbPath)) {
    const wbSrc = fs.existsSync(wbPath + '.bak') && isWorkbenchPatched(fs.readFileSync(wbPath, 'utf8'))
      ? fs.readFileSync(wbPath + '.bak', 'utf8')
      : fs.readFileSync(wbPath, 'utf8');
    const wbReady = wbSrc.includes(WORKBENCH_YHN_TARGET) || isWorkbenchPatched(wbSrc);
    optionalAnchors.push({
      id: 'workbench_yhn',
      name: '外层工作台标题枢纽 (workbench yhn)',
      matched: wbReady
    });
  }
  if (fs.existsSync(jkPath)) {
    const jkLive = fs.readFileSync(jkPath, 'utf8');
    const jkSrc = fs.existsSync(jkPath + '.bak') && isJetskiPatched(jkLive)
      ? fs.readFileSync(jkPath + '.bak', 'utf8')
      : jkLive;
    const jkTitleReady =
      (jkSrc.includes(JETSKI_EST_TARGET) && jkSrc.includes(JETSKI_UEN_TARGET) && jkSrc.includes(JETSKI_SMA_TARGET)) ||
      isJetskiPatched(jkLive);
    const jkThoughtReady =
      JETSKI_THOUGHT_PAIRS.every(([fromStr]) => jkSrc.includes(fromStr)) || isJetskiPatched(jkLive);
    optionalAnchors.push({
      id: 'jetski_titles',
      name: '独立智能体弹窗标题枢纽 (jetskiAgent est/uEn/sMa)',
      matched: jkTitleReady
    });
    optionalAnchors.push({
      id: 'jetski_thoughts',
      name: '独立智能体弹窗思考标签 (jetskiAgent Thought 4处)',
      matched: jkThoughtReady
    });
  }

  return {
    compatible: missingAnchors.length === 0,
    matchedAnchors,
    missingAnchors,
    optionalAnchors,
    codeLength: code.length
  };
}

/**
 * 阶段三：执行统一全自动无损重新编译与全量重注入（复用 core_injector.applyAllPatches）
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
    const vbs = `MsgBox "${message.replace(/"/g, '""')}", 48, "${title.replace(/"/g, '""')}"`;
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

  // 2. 收集基础环境信息
  let appVersion = '未知版本';
  let distroCommit = '未知提交';
  if (fs.existsSync(PACKAGE_JSON)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
      appVersion = pkg.version || appVersion;
      distroCommit = pkg.distro || distroCommit;
    } catch (e) {}
  }

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
  appendLog(`  • 客户端版本   : Antigravity IDE v${appVersion} (Distro: ${distroCommit.slice(0, 10)})`);
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
    appendLog(`  ✔ 结论: 汉化全链路健康就绪 (自检耗时: ${Date.now() - startTime}ms)`);
    appendLog(`  ✔ 动作: 准备拉起 Antigravity IDE 主进程...`);
  } else {
    appendLog(`  ⚠ 结论: 检测到汉化失效、源码升级或官方更新覆盖！`);
    for (const fail of health.failures) {
      appendLog(`     • ${fail}`);
    }

    appendLog(`\n[新版本特征指纹兼容性评估 (Compatibility Prober)]`);
    const candidatePath = resolveHubSourcePath(EXT_DIR, PATCH_DIR);
    const probe = probeVersionCompatibility(candidatePath);

    const totalRequired = probe.matchedAnchors.length + probe.missingAnchors.length;
    appendLog(`  • 评估目标: ${candidatePath} (体积: ${formatBytes(probe.codeLength)})`);
    appendLog(`  • 必选核心特征探测结果 (${probe.matchedAnchors.length}/${totalRequired} 项必选锚点):`);
    for (const anchor of probe.matchedAnchors) {
      appendLog(`     ✔ [命中] ${anchor.name} (代码偏移: ${anchor.offset} 字节)`);
    }
    for (const anchor of probe.missingAnchors) {
      appendLog(`     ❌ [缺失] ${anchor.name} -> "${anchor.pattern}"`);
    }
    if (probe.optionalAnchors && probe.optionalAnchors.length > 0) {
      appendLog(`  • 外围增强特征评估 (${probe.optionalAnchors.filter(a => a.matched).length}/${probe.optionalAnchors.length} 项):`);
      for (const opt of probe.optionalAnchors) {
        appendLog(`     ${opt.matched ? '✔ [兼容]' : '⚠ [跳过]'} ${opt.name}`);
      }
    }

    if (probe.compatible) {
      appendLog(`\n  🎉 评估结论: 新版本与当前汉化引擎 100% 兼容！开始执行统一全量自愈流水线...`);
      try {
        const healStart = Date.now();
        applyFullLocalization(appendLog);
        appendLog(`  ✔ 自适应全量自愈汉化完成！(自愈流水线耗时: ${Date.now() - healStart}ms)`);
      } catch (err) {
        appendLog(`  ❌ 自动汉化执行失败: ${err.message}`);
        appendLog(err.stack);
        showNotification('Antigravity 汉化自愈警告', `自动重新汉化过程中遇到错误：\n${err.message}\n\n已为您保留原版启动，详细信息请查看日志。\n日志路径: ${LOG_FILE}`);
      }
    } else {
      appendLog(`\n  🛑 评估结论: 检测到 Google 在新版本中重构了代码混淆符号，当前规则不完全兼容！`);
      appendLog(`  🛡 防护策略: 坚守安全红线，终止自动注入，防止代码破坏或主窗口白屏。`);
      appendLog(`  💡 处置建议: 保持官方原版启动，请将本日志提交维护者更新 build_ultimate_chinese_engine.js 中缺失的特征锚点。`);
      showNotification('Antigravity IDE 汉化更新提示', `检测到 Antigravity IDE 进行了版本更新 (v${appVersion})。\n由于新版本重构了部分内部代码，现有汉化规则不完全适用。\n\n为确保正常使用，已保持官方原版启动，详细分析报告已写入日志：\n${LOG_FILE}`);
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

  // 将全部格式化日志原子输出
  writeLog(logBuffer.join('\n'));
}

if (require.main === module) {
  main();
}

module.exports = {
  inspectHealthDeeply,
  probeVersionCompatibility,
  applyFullLocalization,
  pruneLogKeepLastRuns
};
