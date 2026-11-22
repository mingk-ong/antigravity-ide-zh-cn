const path = require('path');
const { applyAllPatches } = require('./core_injector');

async function runPatch() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('  Antigravity IDE 深度汉化与使用优化引擎 (Hub & Webview)');
  console.log('  覆盖层级: 外层工作台 + Hub 全量汉化 + 思维链/表格体验优化');
  console.log('====================================================\n');

  applyAllPatches({
    patchDir: path.resolve(__dirname, '..'),
    logger: (msg) => console.log(msg),
    buildStdio: 'inherit'
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n====================================================`);
  console.log(`🎉 补丁注入圆满完成！耗时: ${duration} 秒`);
  console.log(`👉 请重启 Antigravity IDE 客户端或执行 Developer: Reload Window 查看全中文体验！`);
  console.log(`====================================================\n`);
}

runPatch().catch(err => {
  console.error('❌ 补丁执行异常:', err);
  process.exit(1);
});
