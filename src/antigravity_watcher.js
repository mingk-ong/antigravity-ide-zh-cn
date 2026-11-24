/**
 * Antigravity IDE 自动化目录监视守护进程 (Update Watcher Daemon)
 * 
 * 原理：
 * 监视 Antigravity IDE 的核心安装目录。
 * 当官方在后台进行静默升级、下载覆盖或新版本替换时，
 * 本守护进程在毫秒级感知到文件变更，并在写入稳定后自动触发特征评估与无损自愈汉化。
 * 
 * 防自触发设计：
 * 1. 静态忽略全部补丁自产文件（hub_main_zh.js / hub_proxy.js / title_translator.js / thought_translator.js / .agy_zh_meta.json / .bak / log）；
 * 2. 启用自愈执行锁 + 10 秒写后冷却窗口，彻底杜绝自愈写回 extension.js / workbench / jetskiAgent / product.json 时循环触发自己。
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getTargetPaths, getLogFile } = require('./config');

const { installDir: APP_DIR } = getTargetPaths();
const WATCH_TARGET = path.join(APP_DIR, 'resources');
const UPDATER_SCRIPT = path.join(__dirname, 'auto_updater.js');
const LOG_FILE = getLogFile('antigravity_auto_patch.log');

// 补丁自身产出的文件一律忽略，不作为官方更新事件触发
const SELF_ARTIFACT_PATTERNS = [
  'hub_main_zh.js',
  'hub_main.js',
  'hub_proxy.js',
  'title_translator.js',
  'thought_translator.js',
  '.agy_zh_meta.json',
  '.agy_build_report.json',
  'hub_debug.log',
  '.bak'
];

function log(msg) {
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
                  `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const formatted = `[${timeStr}] 【后台守护】 ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, formatted, 'utf8');
  } catch (e) {}
  console.log(formatted.trim());
}

if (!fs.existsSync(WATCH_TARGET)) {
  log(`未找到监控目标目录: ${WATCH_TARGET}，守护进程退出`);
  process.exit(1);
}

log(`启动 Antigravity 安装目录变动监控: ${WATCH_TARGET}`);

let debounceTimer = null;
let isHealing = false;
let cooldownUntil = 0;

function isIgnoredFilename(filename) {
  if (!filename) return false;
  const normalized = String(filename).replace(/\\/g, '/').toLowerCase();
  return SELF_ARTIFACT_PATTERNS.some(pat => normalized.includes(pat));
}

function onDirectoryChange(eventType, filename) {
  if (isIgnoredFilename(filename)) {
    return;
  }
  // 正在执行自愈或处于自愈完成后的 10 秒写冷却期内，忽略自愈引起的系统文件回写事件
  if (isHealing || Date.now() < cooldownUntil) {
    return;
  }

  // 防抖延迟 3 秒，等待官方更新安装程序完全释放并写入完毕
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (isHealing || Date.now() < cooldownUntil) return;
    isHealing = true;
    log(`检测到核心安装目录文件变动 (事件: ${eventType}, 变动项: ${filename || '全量'})，开始触发自适应健康自愈...`);
    exec(`"${process.execPath}" "${UPDATER_SCRIPT}"`, { cwd: path.resolve(__dirname, '..') }, (error) => {
      isHealing = false;
      cooldownUntil = Date.now() + 10000;
      if (error) {
        log(`自动自愈执行出错: ${error.message}`);
      } else {
        log(`✔ 目录变动自愈完成！已进入 10 秒防回环冷却期，新版本已就绪。`);
      }
    });
  }, 3000);
}

try {
  fs.watch(WATCH_TARGET, { recursive: true }, onDirectoryChange);
  log(`已成功挂载递归文件系统监视器，处于常驻静默待命状态`);
} catch (e) {
  log(`挂载文件监视器失败: ${e.message}`);
}
