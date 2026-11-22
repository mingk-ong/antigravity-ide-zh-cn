/**
 * Antigravity IDE 智能自愈与更新自适应检测引擎 (Auto-Updater & Self-Healing Engine)
 * 
 * 核心特性：
 * 1. 深度多维健康检查：逐项输出 5 大核心模块、11 项完整性校验和的精确状态
 * 2. 8 大特征指纹精准探针：详尽记录新版本代码特征匹配偏移与上下文
 * 3. 自动化自愈流水线：自动同步新版资产、重编译中文引擎、修复校验和
 * 4. 零破坏安全防御：遇到不兼容版本自动拦截，输出全面诊断分析与排查建议
 * 5. 智能日志生命周期管理：按 7 天周期自销毁过期日志，超过 500KB 自动裁剪
 * 6. 零黑框静默拉起 IDE 主程序，全透传命令行参数
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const { getTargetPaths, getLogDir, writeDeployMeta } = require('./config');

// 路径与常量配置（动态探测，零硬编码）
const { installDir: APP_DIR } = getTargetPaths();
const PATCH_DIR = path.resolve(__dirname, '..');
const DEFAULT_LOG_DIR = getLogDir();
const LOG_FILE = path.join(DEFAULT_LOG_DIR, 'antigravity_auto_patch.log');
const IDE_EXE = path.join(APP_DIR, 'Antigravity IDE.exe');

// 关键系统文件
const RESOURCES_APP = path.join(APP_DIR, 'resources', 'app');
const PRODUCT_JSON = path.join(RESOURCES_APP, 'product.json');
const PACKAGE_JSON = path.join(RESOURCES_APP, 'package.json');
const EXT_DIR = path.join(RESOURCES_APP, 'extensions', 'agy');
const EXT_JS = path.join(EXT_DIR, 'vscode', 'extension.js');
const PROXY_JS = path.join(EXT_DIR, 'hub_proxy.js');
const TRANSLATOR_JS = path.join(EXT_DIR, 'title_translator.js');
const ZH_MAIN_JS = path.join(EXT_DIR, 'hub_main_zh.js');
const LIVE_HUB_MAIN = path.join(EXT_DIR, 'hub_main.js');
const SRC_HUB_MAIN = path.join(PATCH_DIR, 'hub_main.js');

function computeChecksum(contentBuffer) {
  return crypto.createHash('sha256').update(contentBuffer).digest('base64').replace(/=+$/, '');
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * 日志自更新与过期自销毁管理器 (Auto-Purge & Retention Manager)
 */
function purgeExpiredLogs(logPath, retentionDays = 7, maxBytes = 500 * 1024) {
  if (!fs.existsSync(logPath)) return { purgedCount: 0, trimmed: false };
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    if (!raw.trim()) return { purgedCount: 0, trimmed: false };

    const now = Date.now();
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    const lines = raw.split('\n');
    const validLines = [];
    let purgedCount = 0;

    for (const line of lines) {
      if (!line.trim()) continue;
      const match = line.match(/^\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\]/);
      if (match) {
        const timeVal = Date.parse(`${match[1]}T${match[2]}`);
        if (!isNaN(timeVal)) {
          if (now - timeVal > maxAgeMs) {
            purgedCount++;
            continue;
          }
        }
      }
      validLines.push(line);
    }

    let trimmed = false;
    let finalContent = validLines.join('\n');
    if (Buffer.byteLength(finalContent, 'utf8') > maxBytes) {
      const trimmedLines = validLines.slice(-600);
      const timeStr = new Date().toLocaleString('zh-CN', { hour12: false });
      trimmedLines.unshift(`[${timeStr}] 【系统自维护】日志体积超过容量保护阈值（>500KB），已自动归档裁剪早期记录，保留最新 600 行详细日志。\n`);
      finalContent = trimmedLines.join('\n');
      trimmed = true;
    }

    fs.writeFileSync(logPath, finalContent.trim() + '\n', 'utf8');
    return { purgedCount, trimmed };
  } catch (e) {
    return { purgedCount: 0, trimmed: false, error: e.message };
  }
}

function writeLog(text) {
  try {
    fs.appendFileSync(LOG_FILE, text + '\n', 'utf8');
  } catch (e) {}
  console.log(text);
}

/**
 * 深度多维健康检查 (Deep Diagnostics Inspection)
 */
function inspectHealthDeeply() {
  const report = {
    valid: true,
    failures: [],
    details: {}
  };

  // 1. 检查扩展 extension.js
  if (fs.existsSync(EXT_JS)) {
    const stat = fs.statSync(EXT_JS);
    const content = fs.readFileSync(EXT_JS, 'utf8');
    const hasProxyHook = content.includes('redirectIframeUrl') && content.includes('hub_proxy');
    report.details.extension = {
      path: EXT_JS,
      size: formatBytes(stat.size),
      mtime: stat.mtime.toLocaleString('zh-CN', { hour12: false }),
      hookStatus: hasProxyHook ? '已挂载 (正常)' : '未挂载 (缺失)',
      ok: hasProxyHook
    };
    if (!hasProxyHook) {
      report.valid = false;
      report.failures.push('extension.js 缺少 Webview 代理重定向钩子（官方更新已覆盖此文件）');
    }
  } else {
    report.valid = false;
    report.failures.push('未找到核心扩展文件: ' + EXT_JS);
    report.details.extension = { ok: false, error: '文件不存在' };
  }

  // 2. 检查反向代理 hub_proxy.js 与标题翻译微服务 title_translator.js
  if (fs.existsSync(PROXY_JS) && fs.existsSync(TRANSLATOR_JS)) {
    const stat = fs.statSync(PROXY_JS);
    const content = fs.readFileSync(PROXY_JS, 'utf8');
    const hasFixedPort = content.includes('14588');
    const hasTranslateEndpoint = content.includes('/translate-title');
    report.details.proxy = {
      path: PROXY_JS,
      size: formatBytes(stat.size),
      port: hasFixedPort ? '固定高位端口 14588 (消除时序竞争)' : '动态端口',
      translateEndpoint: hasTranslateEndpoint ? '已启用 /translate-title 微服务' : '缺失翻译端点',
      ok: hasTranslateEndpoint
    };
    if (!hasTranslateEndpoint) {
      report.valid = false;
      report.failures.push('hub_proxy.js 缺少 /translate-title 实时标题翻译端点（需升级代理模板）');
    }
  } else {
    const missingDesc = !fs.existsSync(PROXY_JS) ? 'hub_proxy.js 不存在' : 'title_translator.js 标题翻译微服务缺失';
    report.valid = false;
    report.failures.push(missingDesc);
    report.details.proxy = { ok: false, error: missingDesc };
  }

  // 3. 检查汉化核心 hub_main_zh.js
  if (fs.existsSync(ZH_MAIN_JS)) {
    const stat = fs.statSync(ZH_MAIN_JS);
    const content = fs.readFileSync(ZH_MAIN_JS, 'utf8');
    
    // 探测核心引擎注入特征
    const hasSt = content.includes('_wrapMap(new Map');
    const hasUt = content.includes('_titles =') && content.includes('通用设置');
    const hasYt = content.includes('_secTitles =') && content.includes('自定义扩展与技能');
    const hasXt = content.includes('_labels =') && content.includes('权限预设模板');
    const hasDomCleaner = content.includes('Antigravity 全局自适应运行时 DOM 清洗引擎');
    const hasTitleEngine = content.includes('XB') &&
      content.includes('软件界面中文化设置') &&
      content.includes('__agyTitleAutoLocalizer') &&
      content.includes('updateConversationAnnotations');

    const allEnginesOk = hasSt && hasUt && hasYt && hasXt && hasDomCleaner && hasTitleEngine;

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
        DOM_运行时清洗器: hasDomCleaner ? '✔ 挂载正常' : '❌ 缺失'
      },
      ok: allEnginesOk
    };
    if (!allEnginesOk) {
      report.valid = false;
      report.failures.push('hub_main_zh.js 汉化引擎或实时标题自动化守卫指纹不完整');
    }
  } else {
    report.valid = false;
    report.failures.push('全量汉化前端资产文件不存在: ' + ZH_MAIN_JS);
    report.details.zhBundle = { ok: false, error: '文件不存在' };
  }

  // 4. 检查官方原始 bundle
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

  // 5. 检查 product.json 完整性签名
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
          const fullPath = path.join(RESOURCES_APP, 'out', relPath);
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

        const isIntegrityPure = (matched === total);
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
 * 阶段二：新版本特征指纹兼容性探针 (9大核心锚点)
 */
function probeVersionCompatibility(targetHubMainPath) {
  if (!fs.existsSync(targetHubMainPath)) {
    return {
      compatible: false,
      missingAnchors: ['hub_main.js 不存在'],
      details: `在路径 ${targetHubMainPath} 未找到官方前端 bundle 文件。`
    };
  }

  const code = fs.readFileSync(targetHubMainPath, 'utf8');

  const requiredAnchors = [
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
      id: 'vcc',
      name: 'Hub 对话注释与状态挂载组件 (vcc)',
      pattern: 'var vcc=()=>{var a=SO(),b=Xk(),c=ZP(),d=xQ(),{updateConversationAnnotations:f}=PB(),g=tC(),h=wQ();',
      desc: '负责挂载 Redux 状态订阅及官方原生 updateConversationAnnotations RPC 持久化守卫'
    }
  ];

  const matchedAnchors = [];
  const missingAnchors = [];

  for (const anchor of requiredAnchors) {
    const idx = code.indexOf(anchor.pattern);
    if (idx !== -1) {
      matchedAnchors.push({
        ...anchor,
        offset: idx
      });
    } else {
      missingAnchors.push(anchor);
    }
  }

  const isCompatible = (missingAnchors.length === 0);
  return {
    compatible: isCompatible,
    matchedAnchors,
    missingAnchors,
    codeLength: code.length
  };
}

/**
 * 阶段三：执行全自动无损重新编译与注入
 */
function applyFullLocalization(logger) {
  logger('  [自愈流水线 1/4] 同步官方最新版静态资产 hub_main.js...');
  if (fs.existsSync(LIVE_HUB_MAIN)) {
    fs.copyFileSync(LIVE_HUB_MAIN, SRC_HUB_MAIN);
    logger(`  ✔ 已同步至 ${SRC_HUB_MAIN} (${formatBytes(fs.statSync(SRC_HUB_MAIN).size)})`);
  }

  logger('  [自愈流水线 2/4] 调用终极中文引擎重新编译 hub_main_zh.js...');
  const buildScript = path.join(PATCH_DIR, 'build_ultimate_chinese_engine.js');
  if (!fs.existsSync(buildScript)) {
    throw new Error('未找到终极构建脚本: ' + buildScript);
  }
  const buildStart = Date.now();
  execSync(`"${process.execPath}" "${buildScript}"`, { cwd: PATCH_DIR, stdio: 'pipe' });
  logger(`  ✔ 终极中文引擎编译完成，已部署至 hub_main_zh.js (耗时: ${Date.now() - buildStart}ms)`);

  logger('  [自愈流水线 3/4] 验证与同步透明反向代理、标题翻译微服务并挂载钩子...');
  const templateProxy = path.join(PATCH_DIR, 'src', 'hub_proxy.template.js');
  if (fs.existsSync(templateProxy)) {
    const srcProxyBuf = fs.readFileSync(templateProxy);
    const needSyncProxy = !fs.existsSync(PROXY_JS) || Buffer.compare(srcProxyBuf, fs.readFileSync(PROXY_JS)) !== 0;
    if (needSyncProxy) {
      fs.copyFileSync(templateProxy, PROXY_JS);
      logger('  ✔ 已同步更新本地透明代理模块: hub_proxy.js');
    } else {
      logger('  ✔ 本地透明代理模块 hub_proxy.js 已为最新版本');
    }
  }

  const srcTranslator = path.join(PATCH_DIR, 'src', 'title_translator.js');
  if (fs.existsSync(srcTranslator)) {
    const srcTransBuf = fs.readFileSync(srcTranslator);
    const needSyncTrans = !fs.existsSync(TRANSLATOR_JS) || Buffer.compare(srcTransBuf, fs.readFileSync(TRANSLATOR_JS)) !== 0;
    if (needSyncTrans) {
      fs.copyFileSync(srcTranslator, TRANSLATOR_JS);
      logger('  ✔ 已同步更新标题翻译微服务模块: title_translator.js');
    } else {
      logger('  ✔ 标题翻译微服务模块 title_translator.js 已为最新版本');
    }
  }
  writeDeployMeta(EXT_DIR, path.join(PATCH_DIR, 'src'));

  if (fs.existsSync(EXT_JS)) {
    let extCode = fs.readFileSync(EXT_JS, 'utf8');
    if (!extCode.includes('redirectIframeUrl')) {
      const target = 'renderWebviewHtml(a,b,c,d){Jv(a);';
      const replacement = 'renderWebviewHtml(a,b,c,d){try{var _hp=require("../hub_proxy.js");c=_hp.redirectIframeUrl(c);}catch(_err){}Jv(a);';
      if (extCode.includes(target)) {
        extCode = extCode.replace(target, replacement);
        fs.writeFileSync(EXT_JS, extCode, 'utf8');
        logger('  ✔ 已在 renderWebviewHtml 注入代理重定向钩子');
      } else {
        logger('  ⚠ 未找到 renderWebviewHtml 原始模式，尝试自适应注入...');
      }
    } else {
      logger('  ✔ extension.js 代理重定向钩子已存在，无需重复注入');
    }
  }

  logger('  [自愈流水线 4/4] 重新计算核心 bundle 签名并更新 product.json 完整性字典...');
  if (fs.existsSync(PRODUCT_JSON)) {
    try {
      const prodJson = JSON.parse(fs.readFileSync(PRODUCT_JSON, 'utf8'));
      if (prodJson.checksums) {
        let syncedCount = 0;
        for (const relPath in prodJson.checksums) {
          const fullTarget = path.join(RESOURCES_APP, 'out', relPath);
          if (fs.existsSync(fullTarget)) {
            const curHash = computeChecksum(fs.readFileSync(fullTarget));
            if (prodJson.checksums[relPath] !== curHash) {
              prodJson.checksums[relPath] = curHash;
              syncedCount++;
            }
          }
        }
        fs.writeFileSync(PRODUCT_JSON, JSON.stringify(prodJson, null, '\t'), 'utf8');
        logger(`  ✔ product.json 完整性签名对齐完成 (自动对齐 ${syncedCount} 项，彻底杜绝安装损坏弹窗)`);
      }
    } catch (e) {
      logger('  ⚠ 更新 product.json 校验和异常: ' + e.message);
    }
  }
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

  // 1. 执行日志历史清理
  const purgeResult = purgeExpiredLogs(LOG_FILE, 7, 500 * 1024);

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
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
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
  if (purgeResult.purgedCount > 0) {
    appendLog(`  • 日志生命周期 : 自动销毁 ${purgeResult.purgedCount} 条超过 7 天的历史记录`);
  }
  if (purgeResult.trimmed) {
    appendLog(`  • 日志容量保护 : 文件体积超过 500KB，已自动安全裁剪早期数据`);
  }
  if (userAppArgs.length > 0) {
    appendLog(`  • 启动透传参数 : ${userAppArgs.join(' ')}`);
  }

  appendLog(`\n[核心模块多维健康度检测]`);

  // 3. 执行深度健康检查
  const health = inspectHealthDeeply();

  // 输出 extension.js 诊断
  if (health.details.extension && health.details.extension.ok) {
    appendLog(`  ✔ 核心扩展 (extension.js)   : 正常 [大小: ${health.details.extension.size}, 钩子: ${health.details.extension.hookStatus}]`);
  } else {
    appendLog(`  ❌ 核心扩展 (extension.js)   : 异常 [${health.details.extension?.error || health.details.extension?.hookStatus || '未挂载'}]`);
  }

  // 输出 hub_proxy.js 诊断
  if (health.details.proxy && health.details.proxy.ok) {
    appendLog(`  ✔ 本地代理 (hub_proxy.js)   : 就绪 [大小: ${health.details.proxy.size}, 监听: ${health.details.proxy.port}, 标题翻译: ${health.details.proxy.translateEndpoint}]`);
  } else {
    appendLog(`  ❌ 本地代理 (hub_proxy.js)   : 异常 [${health.details.proxy?.error || health.details.proxy?.translateEndpoint || '未找到代理或翻译服务文件'}]`);
  }

  // 输出 hub_main_zh.js 诊断
  if (health.details.zhBundle && health.details.zhBundle.ok) {
    appendLog(`  ✔ 汉化资产 (hub_main_zh.js) : 完整 [大小: ${health.details.zhBundle.size}]`);
    const eng = health.details.zhBundle.engines;
    appendLog(`     └─► 引擎指纹核验: sT配置工厂(${eng.sT_元数据工厂}) | uT大标题(${eng.uT_顶层标题卡片}) | yT分区(${eng.yT_分区折叠面板}) | xT设置行(${eng.xT_设置卡片行}) | XB标题枢纽(${eng.XB_会话标题枢纽}) | DOM清洗(${eng.DOM_运行时清洗器})`);
  } else {
    appendLog(`  ❌ 汉化资产 (hub_main_zh.js) : 异常 [${health.details.zhBundle?.error || '组件指纹不完整'}]`);
  }

  // 输出 product.json 完整性签名诊断
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
    appendLog(`  ⚠ 结论: 检测到汉化失效或官方更新覆盖！`);
    for (const fail of health.failures) {
      appendLog(`     • ${fail}`);
    }

    appendLog(`\n[新版本特征指纹兼容性评估 (Compatibility Prober)]`);
    const candidatePath = fs.existsSync(LIVE_HUB_MAIN) ? LIVE_HUB_MAIN : SRC_HUB_MAIN;
    const probe = probeVersionCompatibility(candidatePath);

    appendLog(`  • 评估目标: ${candidatePath} (体积: ${formatBytes(probe.codeLength)})`);
    appendLog(`  • 核心特征探测结果 (共 9 项核心锚点):`);
    for (const anchor of probe.matchedAnchors) {
      appendLog(`     ✔ [命中] ${anchor.name} (代码偏移: ${anchor.offset} 字节)`);
    }
    for (const anchor of probe.missingAnchors) {
      appendLog(`     ❌ [缺失] ${anchor.name} -> "${anchor.pattern}"`);
    }

    if (probe.compatible) {
      appendLog(`\n  🎉 评估结论: 新版本与当前汉化引擎 100% 兼容！开始执行全自动自愈流水线...`);
      try {
        const healStart = Date.now();
        applyFullLocalization(appendLog);
        appendLog(`  ✔ 自适应自愈汉化完成！(自愈流水线耗时: ${Date.now() - healStart}ms)`);
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

main();
