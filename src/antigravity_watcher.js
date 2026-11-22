/**
 * Antigravity IDE 自动化目录监视守护进程 (Update Watcher Daemon)
 * 
 * 原理：
 * 监视 Antigravity IDE 的核心安装目录。
 * 当官方在后台进行静默升级、下载覆盖或新版本替换时，
 * 本守护进程在毫秒级感知到文件变更，并在写入稳定后自动触发特征评估与无损自愈汉化。
 * 
 * 效果：
 * 用户无需依赖任何桌面快捷方式！
 * 无论是通过任务栏、开始菜单、命令行、右键菜单还是第三方启动器，
 * 打开软件时，新版本早已在后台自动完成汉化！
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getTargetPaths, getLogFile } = require('./config');

const { installDir: APP_DIR } = getTargetPaths();
const WATCH_TARGET = path.join(APP_DIR, 'resources');
const UPDATER_SCRIPT = path.join(__dirname, 'auto_updater.js');
const LOG_FILE = getLogFile('antigravity_auto_patch.log');

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

function onDirectoryChange(eventType, filename) {
  // 忽略我们自身生成的补丁资产写入，防止循环触发
  if (filename && (filename.includes('hub_main_zh.js') || filename.includes('hub_debug.log') || filename.includes('.bak'))) {
    return;
  }

  // 防抖延迟 3 秒，等待官方更新安装程序完全释放并写入完毕
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    log(`检测到核心安装目录文件变动 (事件: ${eventType}, 变动项: ${filename || '全量'})，开始触发自适应健康自愈...`);
    exec(`"${process.execPath}" "${UPDATER_SCRIPT}"`, { cwd: path.resolve(__dirname, '..') }, (error, stdout, stderr) => {
      if (error) {
        log(`自动自愈执行出错: ${error.message}`);
      } else {
        log(`✔ 目录变动自愈完成！新版本已就绪。`);
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
