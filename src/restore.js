const fs = require('fs');
const path = require('path');
const { getTargetPaths } = require('./config');

function runRestore() {
  console.log('====================================================');
  console.log('  Antigravity IDE 官方原生环境一键还原引擎');
  console.log('====================================================\n');

  const {
    installDir,
    productJsonPath,
    agyExtPackagePath,
    checksumTargets
  } = getTargetPaths();

  const outMainTarget = checksumTargets.find((t) => t.id === 'out/main.js')?.path;
  const workbenchTarget = checksumTargets.find((t) => t.id === 'vs/workbench/workbench.desktop.main.js')?.path;
  const jetskiTarget = checksumTargets.find((t) => t.id === 'jetskiAgent/main.js')?.path;
  const agyExtDir = path.join(installDir, 'resources', 'app', 'extensions', 'agy');

  const filesToRestore = [
    productJsonPath,
    workbenchTarget,
    jetskiTarget,
    outMainTarget,
    agyExtPackagePath,
    path.join(agyExtDir, 'vscode', 'extension.js')
  ].filter(Boolean);

  let restoredCount = 0;
  for (const filePath of filesToRestore) {
    const backupPath = filePath + '.bak';
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
      console.log(`✔ [还原成功] ${path.basename(filePath)} <- ${path.basename(backupPath)}`);
      restoredCount++;
    } else {
      console.log(`- [跳过] 无备份文件: ${path.basename(filePath)}`);
    }
  }

  // 清理代理模块、翻译微服务与中文 Hub 静态资源
  const filesToDelete = [
    path.join(agyExtDir, 'hub_proxy.js'),
    path.join(agyExtDir, 'hub_main_zh.js'),
    path.join(agyExtDir, 'title_translator.js'),
    path.join(agyExtDir, 'thought_translator.js'),
    path.join(agyExtDir, '.agy_zh_meta.json')
  ];

  for (const f of filesToDelete) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
        console.log(`✔ [清理成功] 移除非官方附加文件: ${path.basename(f)}`);
      } catch (e) {
        console.warn(`⚠ 清理文件失败: ${f} (${e.message})`);
      }
    }
  }

  console.log(`\n====================================================`);
  console.log(`🎉 还原工作执行完毕！共恢复 ${restoredCount} 个原始核心文件。`);
  console.log(`👉 重启 Antigravity IDE 即可回到纯净官方英文原版环境。`);
  console.log(`====================================================\n`);
}

runRestore();
