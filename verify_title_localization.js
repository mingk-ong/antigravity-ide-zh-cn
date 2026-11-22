/**
 * Antigravity IDE 新建对话标题全自动中文化端到端回归测试套件
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { execSync } = require('child_process');

const { getTargetPaths } = require('./src/config');

const NODE_EXE = process.execPath;
const PATCH_DIR = __dirname;
const SRC_DIR = path.join(PATCH_DIR, 'src');
const CACHE_FILE = path.join(SRC_DIR, 'title_cache.json');
const { agyExtDir: EXT_DIR } = getTargetPaths();
const ZH_MAIN_JS = path.join(EXT_DIR, 'hub_main_zh.js');
const PROXY_JS = path.join(EXT_DIR, 'hub_proxy.js');
const TRANSLATOR_JS = path.join(EXT_DIR, 'title_translator.js');

const {
  translateTitle,
  cleanTitle,
  isPlaceholderTitle,
  shouldTranslateTitle
} = require('./src/title_translator.js');

async function runTests() {
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`✔ [通过] ${name}`);
    } catch (err) {
      console.error(`❌ [失败] ${name}\n   原因: ${err.stack || err.message}`);
    }
  }

  console.log('====================================================');
  console.log('  Antigravity IDE 对话标题自动中文化端到端验证');
  console.log('====================================================\n');

  // -----------------------------------------------------------------------
  // 1. 翻译微服务质量与持久化测试
  // -----------------------------------------------------------------------
  console.log('【第一组】多源标题翻译微服务与防污染测试');

  const sampleTitles = [
    'Missing Adb Android Platform Tools',
    'Optimize React Component Rendering Performance',
    'Fix Git Push Authentication Permission Error',
    'Custom Extension Sidebar Layout Design',
    'Node.js Process Memory Leak Investigation',
    'TypeScript Strict Mode Migration Checklist'
  ];

  for (const title of sampleTitles) {
    await test(`标准英文标题翻译: "${title}"`, async () => {
      const res = await translateTitle(title);
      assert.strictEqual(res.ok, true, 'ok 应为 true');
      assert.strictEqual(res.persistable, true, '在线/缓存译文必须可持久化 persistable=true');
      assert.ok(/[\u4e00-\u9fa5]/.test(res.translated), `译文必须包含中文: ${res.translated}`);
      assert.notStrictEqual(res.translated, title);
      console.log(`     └─► [${res.source}] "${title}" -> "${res.translated}"`);
    });
  }

  const syntheticTitle = 'Fix Docker Container Network Timeout Issue';
  await test(`全新虚构标题实时翻译: "${syntheticTitle}"`, async () => {
    const res = await translateTitle(syntheticTitle, { bypassCache: true });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.persistable, true);
    assert.ok(/[\u4e00-\u9fa5]/.test(res.translated), `译文未含中文: ${res.translated}`);
    console.log(`     └─► [${res.source}] "${syntheticTitle}" -> "${res.translated}"`);
  });

  await test('缓存极速命中验证 (<20ms) 与磁盘落盘检查', async () => {
    const t0 = Date.now();
    const res = await translateTitle('Missing Adb Android Platform Tools');
    const cost = Date.now() - t0;
    assert.strictEqual(res.source, 'cache', `预期命中 cache，实际为 ${res.source}`);
    assert.strictEqual(res.persistable, true);
    assert.ok(cost < 20, `缓存查询耗时过大: ${cost}ms`);
    assert.ok(fs.existsSync(CACHE_FILE), '未找到磁盘缓存文件 title_cache.json');
    const disk = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    assert.ok(disk.enToZh && disk.enToZh['Missing Adb Android Platform Tools'], '磁盘缓存缺少目标词条');
  });

  await test('豁免与占位符保护（绝不持久化）', async () => {
    const skips = [
      'Untitled Conversation',
      'New Conversation',
      'New Chat',
      'Coordinator',
      'Parent Conversation',
      'Conversation 3c76a2ae',
      '反重力软件界面中文化设置',
      '12345',
      ''
    ];
    for (const s of skips) {
      assert.strictEqual(shouldTranslateTitle(s), false, `不应翻译豁免词条: "${s}"`);
      const res = await translateTitle(s);
      assert.strictEqual(res.persistable, false, `豁免词条绝不可持久化: "${s}"`);
      assert.strictEqual(res.source, 'skip', `预期 source=skip，实际=${res.source}`);
    }
    assert.strictEqual(isPlaceholderTitle('Untitled Conversation'), true);
    assert.strictEqual(isPlaceholderTitle('Conversation 3c76a2ae'), true);
  });

  await test('脏响应拦截校验 (cleanTitle)', async () => {
    assert.strictEqual(cleanTitle('Test', '<html><body>302 Moved</body></html>'), null);
    assert.strictEqual(cleanTitle('Test', 'MYMEMORY WARNING: LIMIT EXCEEDED'), null);
    assert.strictEqual(cleanTitle('Test', 'Error 500 Internal Server Error'), null);
    assert.strictEqual(cleanTitle('Test', 'Pure English Without Chinese'), null);
    assert.strictEqual(cleanTitle('Test title', '“修复安卓平台调试工具。”'), '修复安卓平台调试工具');
  });

  await test('离线降级安全性验证（保留英文空格、禁止持久化）', async () => {
    const r1 = await translateTitle('Missing Adb Android Platform Tools', { offlineOnly: true, bypassCache: true });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.source, 'offline');
    assert.strictEqual(r1.persistable, false, '离线降级禁止持久化');
    assert.ok(/[\u4e00-\u9fa5]/.test(r1.translated));
    assert.ok(!/MissingAdb|AdbAndroid|PlatformTools/.test(r1.translated), `存在无空格粘连: ${r1.translated}`);

    const r2 = await translateTitle('Fix Docker Container Network Timeout Issue', { offlineOnly: true, bypassCache: true });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.persistable, false);
    assert.ok(!/[A-Za-z][A-Z]/.test(r2.translated), `发现异常粘连: ${r2.translated}`);
  });

  // 清理测试虚构标题，避免污染本地缓存
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const cleanupKeys = [
        syntheticTitle,
        'Optimize React Component Rendering Performance',
        'Fix Git Push Authentication Permission Error',
        'Custom Extension Sidebar Layout Design',
        'Node.js Process Memory Leak Investigation',
        'TypeScript Strict Mode Migration Checklist'
      ];
      let dirty = false;
      for (const k of cleanupKeys) {
        if (cacheData.enToZh && cacheData.enToZh[k]) {
          delete cacheData.enToZh[k];
          dirty = true;
        }
      }
      if (dirty) {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
      }
    }
  } catch (_e) {}

  // -----------------------------------------------------------------------
  // 2. HTTP 代理端点并发去重测试 (使用临时随机端口 0，不干扰 14588)
  // -----------------------------------------------------------------------
  console.log('\n【第二组】本地 HTTP /translate-title 端点与 Single-Flight 并发测试');

  await test('临时随机端口复用 handleTranslateTitleRequest 并发 5 次请求', async () => {
    process.env.AGY_PROXY_NO_AUTOSTART = '1';
    const proxyMod = require('./src/hub_proxy.template.js');
    const server = http.createServer((req, res) => {
      if ((req.url || '').startsWith('/translate-title')) {
        proxyMod.handleTranslateTitleRequest(req, res, req.url);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const makeGet = urlPath =>
        new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${port}${urlPath}`, res => {
            let body = '';
            res.on('data', c => (body += c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
          }).on('error', reject);
        });

      const reqs = Array.from({ length: 5 }, (_, idx) =>
        makeGet(`/translate-title?id=test-cid-${idx}&text=${encodeURIComponent('Missing Adb Android Platform Tools')}`)
      );
      const responses = await Promise.all(reqs);
      for (const r of responses) {
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.headers['access-control-allow-origin'], '*');
        assert.ok((r.headers['content-type'] || '').includes('application/json'));
        const json = JSON.parse(r.body);
        assert.strictEqual(json.ok, true);
        assert.strictEqual(json.persistable, true);
        assert.ok(/[\u4e00-\u9fa5]/.test(json.translated));
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // -----------------------------------------------------------------------
  // 3. 编译产物语法、关键指纹与 XB 沙盒行为验证
  // -----------------------------------------------------------------------
  console.log('\n【第三组】部署产物语法检查、特征指纹与 XB(a) 沙盒验证');

  await test('node -c 语法检查全部关键 JS 文件', async () => {
    const filesToCheck = [
      ZH_MAIN_JS,
      PROXY_JS,
      TRANSLATOR_JS,
      path.join(PATCH_DIR, 'build_ultimate_chinese_engine.js'),
      path.join(SRC_DIR, 'auto_updater.js'),
      path.join(SRC_DIR, 'patcher.js')
    ];
    for (const f of filesToCheck) {
      assert.ok(fs.existsSync(f), `文件不存在: ${f}`);
      execSync(`"${NODE_EXE}" -c "${f}"`, { stdio: 'pipe' });
    }
  });

  await test('hub_main_zh.js 关键注入指纹与 ELK 同名函数完整性校验', async () => {
    const code = fs.readFileSync(ZH_MAIN_JS, 'utf8');
    const markers = [
      '__agyTitleAutoLocalizer',
      'updateConversationAnnotations',
      '/translate-title',
      '/log-title-persisted',
      'ConversationAnnotationsSchema',
      'label:XB({cascadeId:a.cascadeId,title:a.title,summary:a.title})',
      'a=XB({cascadeId:f,annotations:a.annotations,summary:d||a.summary})',
      'title:XB(g)||',
      'g=XB(d)||',
      'function XB(a){var b;var c=new tD(Ok,"[","]");' // 确保 ELK 图形库 XB 完好
    ];
    for (const m of markers) {
      assert.ok(code.includes(m), `部署产物缺少关键特征: ${m}`);
    }
  });

  await test('VM 沙盒提取新版 XB(a) 验证各类输入行为', async () => {
    const code = fs.readFileSync(ZH_MAIN_JS, 'utf8');
    const startIdx = code.indexOf('function XB(a){\n  var _isStr');
    assert.notStrictEqual(startIdx, -1, '未定位到新版 XB(a) 源码起点');
    const endMarker = 'var i3a=(a,b)=>{';
    const endIdx = code.indexOf(endMarker, startIdx);
    assert.notStrictEqual(endIdx, -1, '未定位到 XB(a) 源码终点');
    const xbSource = code.slice(startIdx, endIdx);

    const sandbox = {
      window: {
        __agyZhIdCache: {
          '00000000-0000-0000-0000-000000000001': '自定义 ID 命中测试'
        },
        __agyZhTitleCache: {
          'Runtime Dynamic Title Test': '运行时动态标题测试'
        }
      }
    };
    vm.runInNewContext(xbSource, sandbox);
    const XB = sandbox.XB;
    assert.strictEqual(typeof XB, 'function');

    // 中文直通
    assert.strictEqual(XB({ annotations: { title: '你好，Antigravity' } }), '你好，Antigravity');
    // 占位符显示映射
    assert.strictEqual(XB({ annotations: { title: 'Untitled Conversation' } }), '未命名对话');
    assert.strictEqual(XB({ summary: 'New Conversation' }), '新对话');
    assert.strictEqual(XB({ annotations: { coordinator: true } }), '智能体助手');
    // 运行时 ID 缓存命中
    assert.strictEqual(
      XB({ cascadeId: '00000000-0000-0000-0000-000000000001', summary: 'Anything English' }),
      '自定义 ID 命中测试'
    );
    // 通用英文短语字典命中
    assert.strictEqual(XB({ summary: 'Change Software Language To Chinese' }), '软件界面中文化设置');
    // 运行时窗口缓存命中
    assert.strictEqual(XB({ summary: 'Runtime Dynamic Title Test' }), '运行时动态标题测试');
    // 字符串传参兼容
    assert.strictEqual(XB('Change Software Language To Chinese'), '软件界面中文化设置');
  });

  console.log('\n====================================================');
  console.log(`端到端验证结果: ${passed} / ${total} 项通过 (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('====================================================');
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
