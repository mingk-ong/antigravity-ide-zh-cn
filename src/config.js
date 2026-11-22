const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * 获取统一日志目录（支持环境变量 AGY_ZH_LOG_DIR 覆盖）
 */
function getLogDir() {
  const customDir = (process.env.AGY_ZH_LOG_DIR || '').trim();
  const logDir = customDir || path.join(os.homedir(), '.antigravity-zh-cn', 'logs');
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (_e) {}
  }
  return logDir;
}

/**
 * 获取纯本地高速缓存目录（避开 OneDrive 同步目录，防止高频写入引发文件锁冲突）
 */
function getCacheDir() {
  const customDir = (process.env.AGY_ZH_CACHE_DIR || '').trim();
  const localAppData = process.env.LOCALAPPDATA || '';
  const defaultDir = localAppData
    ? path.join(localAppData, 'antigravity-zh-cn', 'cache')
    : path.join(os.homedir(), '.antigravity-zh-cn', 'cache');
  const cacheDir = customDir || defaultDir;
  if (!fs.existsSync(cacheDir)) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
    } catch (_e) {}
  }
  return cacheDir;
}

/**
 * 获取指定日志文件的完整路径
 */
function getLogFile(fileName) {
  return path.join(getLogDir(), fileName);
}

/**
 * 获取写入到扩展目录的部署元数据文件路径（供独立运行的代理与翻译模块定位本机配置）
 */
function getMetaFilePath(agyExtDir) {
  return path.join(agyExtDir, '.agy_zh_meta.json');
}

/**
 * 将当前机器的源码目录、日志目录与纯本地缓存目录写入扩展目录元数据（仅本机使用，不入库）
 */
function writeDeployMeta(agyExtDir, patchSrcDir) {
  try {
    const meta = {
      patchSrcDir: path.resolve(patchSrcDir),
      logDir: getLogDir(),
      cacheDir: getCacheDir(),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(getMetaFilePath(agyExtDir), JSON.stringify(meta, null, 2), 'utf8');
  } catch (_e) {}
}

/**
 * 自动探测并返回 Antigravity IDE 相关的核心文件路径与备份配置
 */
function getTargetPaths() {
  const homeDir = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
  const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
  const defaultInstallDir = path.join(localAppData, 'Programs', 'Antigravity IDE');

  const installDir = (process.env.ANTIGRAVITY_IDE_DIR || '').trim() || defaultInstallDir;

  const appDir = path.join(installDir, 'resources', 'app');
  const productJsonPath = path.join(appDir, 'product.json');
  const outDir = path.join(appDir, 'out');
  const agyExtDir = path.join(appDir, 'extensions', 'agy');
  const agyExtPackagePath = path.join(agyExtDir, 'package.json');

  // 三大核心 JavaScript 文件
  const mainJsPath = path.join(outDir, 'main.js');
  const jetskiAgentPath = path.join(outDir, 'jetskiAgent', 'main.js');
  const workbenchJsPath = path.join(outDir, 'vs', 'workbench', 'workbench.desktop.main.js');

  // 用户数据目录下的 V8 编译缓存目录
  const userDataDir = path.join(appData, 'Antigravity IDE');
  const cachedDataDir = path.join(userDataDir, 'CachedData');
  const codeCacheDir = path.join(userDataDir, 'Code Cache');

  return {
    installDir,
    appDir,
    agyExtDir,
    userDataDir,
    cachedDataDir,
    codeCacheDir,
    productJsonPath,
    productJsonBackupPath: productJsonPath + '.bak',
    agyExtPackagePath,
    agyExtPackageBackupPath: agyExtPackagePath + '.bak',
    checksumTargets: [
      {
        id: 'out/main.js',
        path: mainJsPath,
        backupPath: mainJsPath + '.bak',
        inProductJson: false
      },
      {
        id: 'jetskiAgent/main.js',
        path: jetskiAgentPath,
        backupPath: jetskiAgentPath + '.bak',
        inProductJson: true
      },
      {
        id: 'vs/workbench/workbench.desktop.main.js',
        path: workbenchJsPath,
        backupPath: workbenchJsPath + '.bak',
        inProductJson: true
      }
    ],
    isValid: fs.existsSync(mainJsPath) && fs.existsSync(jetskiAgentPath) && fs.existsSync(workbenchJsPath) && fs.existsSync(productJsonPath)
  };
}

module.exports = {
  getTargetPaths,
  getLogDir,
  getCacheDir,
  getLogFile,
  getMetaFilePath,
  writeDeployMeta
};
