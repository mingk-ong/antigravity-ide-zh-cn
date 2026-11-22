const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getTargetPaths } = require('./config');

function computeChecksum(contentBuffer) {
  return crypto.createHash('sha256').update(contentBuffer).digest('base64').replace(/=+$/, '');
}

function runVerify() {
  console.log('====================================================');
  console.log('  Antigravity IDE 汉化生效与防损坏综合自检系统');
  console.log('====================================================\n');

  const {
    installDir,
    productJsonPath
  } = getTargetPaths();

  const appDir = path.join(installDir, 'resources', 'app');
  const outDir = path.join(appDir, 'out');
  const wbPath = path.join(outDir, 'vs', 'workbench', 'workbench.desktop.main.js');
  const jetskiPath = path.join(outDir, 'jetskiAgent', 'main.js');

  let passCount = 0;
  let totalCount = 0;

  function assert(name, condition, extra = '') {
    totalCount++;
    if (condition) {
      passCount++;
      console.log(`✔ [通过] ${name} ${extra}`);
    } else {
      console.error(`❌ [未通过] ${name} ${extra}`);
    }
  }

  // 1. 检验 product.json 校验和
  if (fs.existsSync(productJsonPath)) {
    const prod = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
    if (prod.checksums && fs.existsSync(wbPath)) {
      const realWb = computeChecksum(fs.readFileSync(wbPath));
      assert('workbench 校验和匹配', prod.checksums['vs/workbench/workbench.desktop.main.js'] === realWb);
    }
    if (prod.checksums && fs.existsSync(jetskiPath)) {
      const realJetski = computeChecksum(fs.readFileSync(jetskiPath));
      assert('jetskiAgent/main.js 校验和匹配', prod.checksums['jetskiAgent/main.js'] === realJetski);
    }
  }

  // 2. 检验扩展与代理模块
  const agyExtDir = path.join(appDir, 'extensions', 'agy');
  const extJsPath = path.join(agyExtDir, 'vscode', 'extension.js');
  const proxyPath = path.join(agyExtDir, 'hub_proxy.js');
  const zhMainPath = path.join(agyExtDir, 'hub_main_zh.js');

  assert('扩展 extension.js 文件存在', fs.existsSync(extJsPath));
  if (fs.existsSync(extJsPath)) {
    const extContent = fs.readFileSync(extJsPath, 'utf8');
    assert('extension.js 包含代理重定向钩子', extContent.includes('redirectIframeUrl'));
  }

  assert('Hub 透明代理模块 hub_proxy.js 存在', fs.existsSync(proxyPath));
  assert('汉化版前端资产 hub_main_zh.js 存在', fs.existsSync(zhMainPath));

  // 3. 检验 hub_main_zh.js 汉化命中
  if (fs.existsSync(zhMainPath)) {
    const zhContent = fs.readFileSync(zhMainPath, 'utf8');
    let matchedKeywords = 0;
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

    for (const kw of testKeywords) {
      if (zhContent.includes(kw)) matchedKeywords++;
    }
    assert('Hub 前端核心关键字汉化覆盖率', matchedKeywords === testKeywords.length, `(${matchedKeywords}/${testKeywords.length})`);
  }

  console.log(`\n====================================================`);
  console.log(`综合自检结果: 通过率 ${(passCount / totalCount * 100).toFixed(1)}% (${passCount}/${totalCount})`);
  if (passCount === totalCount) {
    console.log('🎉 全部自检项目 100% 验证通过！系统已处于最佳就绪状态。');
  } else {
    console.warn('⚠ 存在未通过项，请参考提示进行排查。');
  }
  console.log(`====================================================\n`);
}

runVerify();
