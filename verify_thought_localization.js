/**
 * Antigravity IDE 思维链实时流式翻译与 JSONL 分层缓存端到端验收测试套件
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { execSync } = require('child_process');

const NODE_EXE = process.execPath;
const PATCH_DIR = __dirname;
const SRC_DIR = path.join(PATCH_DIR, 'src');
const { getTargetPaths } = require('./src/config');
const { agyExtDir } = getTargetPaths();
const ZH_MAIN_JS = path.join(agyExtDir, 'hub_main_zh.js');
const PROXY_JS = path.join(agyExtDir, 'hub_proxy.js');
const THOUGHT_TRANSLATOR_JS = path.join(agyExtDir, 'thought_translator.js');

const {
  createThoughtTranslator,
  maskCodeTokens,
  unmaskAndValidate,
  shouldTranslateSegment,
  SOURCE_QUALITY
} = require('./src/thought_translator.js');

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
  console.log('  Antigravity IDE 思维链流式翻译与缓存端到端验证');
  console.log('====================================================\n');

  const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-thought-test-'));

  try {
    // ---------------------------------------------------------------------
    // 第一组：代码隔离、无损回填与防污染校验
    // ---------------------------------------------------------------------
    console.log('【第一组】代码保护、路径锚点隔离与防污染校验');

    await test('行内代码、路径、版本号隔离与 100% 无损回填', async () => {
      const sample =
        'Examining `src/title_cache.json` and C:\\Users\\demo\\app.js under v1.107.0 for `hub_proxy.js` updates.';
      const masked = maskCodeTokens(sample);
      assert.strictEqual(masked.skip, false);
      assert.ok(masked.tokens.length >= 4, `应识别至少 4 个代码/路径/版本锚点，实际=${masked.tokens.length}`);
      assert.ok(!masked.masked.includes('title_cache.json'), '原反引号内容应被隔离');
      assert.ok(!masked.masked.includes('C:\\Users\\demo\\app.js'), 'Windows 路径应被隔离');

      // 模拟引擎正常返回（甚至带字母数字间插入空格、大小写变化与方括号包裹容错）
      const tp = masked.tagPrefix;
      const fakeZh = masked.masked
        .replace('Examining', '正在检查')
        .replace('and', '和')
        .replace('under', '在')
        .replace('for', '中的')
        .replace('updates.', '更新。')
        .replace(`${tp}0X`, `[${tp.toLowerCase()} 0X]`)
        .replace(`${tp}1X`, `${tp} 1 X`);
      const restored = unmaskAndValidate(sample, fakeZh, masked);
      assert.ok(restored && restored.includes('`src/title_cache.json`'), `未正确回填反引号: ${restored}`);
      assert.ok(restored.includes('C:\\Users\\demo\\app.js'), `未正确回填路径: ${restored}`);
      assert.ok(restored.includes('v1.107.0'), `未正确回填版本号: ${restored}`);
      assert.ok(!new RegExp(`${tp}\\s*\\d+\\s*X`, 'i').test(restored), `残留未替换锚点: ${restored}`);
    });

    await test('复现现场 Bug 修复：波浪号删除线防误渲染 + 原文含 `AGYC0X` 不自杀拦截', async () => {
      // 1) 波浪号测试：正文 ~400ms / ~1900 必须转为安全中文，且反引号内 `~/config` 保持原样
      const tildeSample = 'Latency jumped from ~400ms to ~1900 - 2500 ms when reading `~/config`.';
      const maskedTilde = maskCodeTokens(tildeSample);
      const fakeTildeZh = `读取 ${maskedTilde.tagPrefix}0X 时延迟从~400ms增加到~1900 - 2500 ms。`;
      const restoredTilde = unmaskAndValidate(tildeSample, fakeTildeZh, maskedTilde);
      assert.ok(restoredTilde && !/~\d/.test(restoredTilde), `正文仍残留会触发删除线的半角波浪号: ${restoredTilde}`);
      assert.ok(restoredTilde.includes('约400ms') && restoredTilde.includes('约1900'), `未转为自然中文约数: ${restoredTilde}`);
      assert.ok(restoredTilde.includes('`~/config`'), `反引号内的路径波浪号被误改: ${restoredTilde}`);

      // 2) 元递归冲突实测：直接用截图第二段真实英文（含 `httpRequest` 和 `AGYC0X`）走真实在线翻译！
      const screenshotSent =
        'Primary hypothesis: each `httpRequest` might be establishing a new TLS connection without keep-alive, potentially adding significant overhead, and the earlier `AGYC0X` idea is not right because of the observed engine name.';
      const liveInst = createThoughtTranslator({
        cacheDir: tmpCacheDir,
        disableAutoCompact: true,
        flushIntervalMs: 0
      });
      const liveRes = await liveInst.translateThoughtBatch(
        [{ id: 'meta_bug', text: screenshotSent, persist: false }],
        { bypassCache: true }
      );
      const item = liveRes.results[0];
      assert.strictEqual(item.source, 'transmart', `应直接在 TranSmart 一次命中而不降级，实际=${item.source} (${liveRes.stats.costMs}ms)`);
      assert.ok(/[\u4e00-\u9fa5]/.test(item.translated), `未翻译成中文: ${item.translated}`);
      assert.ok(item.translated.includes('`httpRequest`') && item.translated.includes('`AGYC0X`'), `代码未完整保留: ${item.translated}`);
      console.log(`     └─► 现场原句复测 [${item.source}, ${liveRes.stats.costMs}ms]: ${item.translated}`);
    });

    await test('锚点丢失或脏响应必须拒绝（防污染缓存）', async () => {
      const sample = 'Checking `hub_proxy.js` and `patcher.js` status.';
      const masked = maskCodeTokens(sample);
      // 模拟翻译引擎吞掉第 2 个锚点
      assert.strictEqual(unmaskAndValidate(sample, `正在检查 ${masked.tagPrefix}0X 的状态。`, masked), null);
      // 模拟返回 HTML 错误页
      assert.strictEqual(unmaskAndValidate(sample, '<html><body>429 Too Many Requests</body></html>', masked), null);
      // 模拟不含中文
      assert.strictEqual(
        unmaskAndValidate(sample, `Checking ${masked.tagPrefix}0X and ${masked.tagPrefix}1X status.`, masked),
        null
      );
    });

    await test('中英文比例判定（中文 > 30% 自动透传）', async () => {
      assert.strictEqual(shouldTranslateSegment('正在检查 `hub_proxy.js` 的监听端口是否正常。'), false);
      assert.strictEqual(shouldTranslateSegment('Examining `hub_proxy.js` listener status on port 14588.'), true);
      assert.strictEqual(shouldTranslateSegment('```js\nconst a = 1;\n```'), false);
      assert.strictEqual(shouldTranslateSegment('12345'), false);
    });

    // ---------------------------------------------------------------------
    // 第二组：真实多引擎联调与 JSONL 分层缓存规则验收
    // ---------------------------------------------------------------------
    console.log('\n【第二组】真实多引擎批量翻译与 JSONL 分层缓存规则测试');

    const inst = createThoughtTranslator({
      cacheDir: tmpCacheDir,
      maxEntries: 20,
      maxFileBytes: 4096,
      ttlMs: 30 * 24 * 3600 * 1000,
      flushIntervalMs: 0,
      disableAutoCompact: true
    });

    await test('内置高频套话 0ms 瞬出且不写入磁盘缓存', async () => {
      const res = await inst.translateThoughtBatch([
        { id: 'b1', text: "I'm thinking through how to approach this.", persist: true }
      ]);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.results[0].source, 'static');
      assert.strictEqual(res.results[0].translated, '正在梳理处理思路。');
      assert.strictEqual(res.results[0].persisted, false);
      assert.strictEqual(fs.existsSync(inst.cacheFile), false, '静态套话不应写入磁盘');
    });

    await test('真实思维链 3 句批量翻译（TranSmart 优先、含反引号与版本号保真）', async () => {
      const items = [
        {
          id: 's1',
          text: "The title cache contains precisely the user's six most recent English conversation titles and their accurate Chinese translations.",
          persist: true
        },
        {
          id: 's2',
          text: 'No test data remains in `src/title_cache.json`.',
          persist: true
        },
        {
          id: 's3',
          text: 'Proceeding to validate `product.json` checksums for v1.107.0 before finishing.',
          persist: true
        }
      ];
      const res = await inst.translateThoughtBatch(items);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.results.length, 3);
      for (const r of res.results) {
        assert.ok(/[\u4e00-\u9fa5]/.test(r.translated), `未包含中文: ${JSON.stringify(r)}`);
        assert.strictEqual(r.persisted, true, `已闭合句应落盘: ${JSON.stringify(r)}`);
      }
      assert.ok(res.results[1].translated.includes('`src/title_cache.json`'), `s2 代码丢失: ${res.results[1].translated}`);
      assert.ok(res.results[2].translated.includes('`product.json`'), `s3 代码丢失: ${res.results[2].translated}`);
      assert.ok(res.results[2].translated.includes('v1.107.0'), `s3 版本号丢失: ${res.results[2].translated}`);
      console.log(
        `     └─► 批量耗时 ${res.stats.costMs}ms | 引擎=${res.results[0].source}\n` +
          `         s1: ${res.results[0].translated}\n` +
          `         s2: ${res.results[1].translated}\n` +
          `         s3: ${res.results[2].translated}`
      );
    });

    await test('二次命中 L2 缓存 0ms 且读操作零磁盘写入', async () => {
      const beforeSize = fs.statSync(inst.cacheFile).size;
      const t0 = Date.now();
      const res = await inst.translateThoughtBatch([
        { id: 's2', text: 'No test data remains in `src/title_cache.json`.', persist: true }
      ]);
      const cost = Date.now() - t0;
      const afterSize = fs.statSync(inst.cacheFile).size;
      assert.strictEqual(res.results[0].source, 'cache');
      assert.strictEqual(res.results[0].cached, true);
      assert.ok(cost < 15, `缓存命中耗时过高: ${cost}ms`);
      assert.strictEqual(afterSize, beforeSize, '读命中绝不应写入磁盘');
    });

    await test('未闭合流式半句 (persist=false) 严禁写入 JSONL 磁盘缓存', async () => {
      const beforeSize = fs.statSync(inst.cacheFile).size;
      const res = await inst.translateThoughtBatch([
        {
          id: 'tail1',
          text: 'Inspecting the streaming buffer while waiting for the next segment to arrive',
          persist: false
        }
      ]);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.results[0].persisted, false);
      const afterSize = fs.statSync(inst.cacheFile).size;
      assert.strictEqual(afterSize, beforeSize, '临时尾句绝不可写入磁盘');
    });

    await test('JSONL 崩溃残行容错 + 30 天 TTL 淘汰 + 质量权重分级覆盖', async () => {
      // 1) 人为追加一条超 30 天过期记录 + 一条崩溃残损半行
      const expiredAt = Date.now() - 35 * 24 * 3600 * 1000;
      const oldKey = inst.makeCacheKey('An expired sentence from 35 days ago.');
      fs.appendFileSync(
        inst.cacheFile,
        JSON.stringify({ k: oldKey, z: '35天前的过期译文', s: 'transmart', q: 2, at: expiredAt }) +
          '\n{"k":"v1:corrupt_half_line',
        'utf8'
      );

      // 2) 重新加载应跳过过期与残损行，完整恢复 3 条有效记录
      const reloaded = createThoughtTranslator({
        cacheDir: tmpCacheDir,
        maxEntries: 20,
        maxFileBytes: 4096,
        ttlMs: 30 * 24 * 3600 * 1000,
        flushIntervalMs: 0,
        disableAutoCompact: true
      });
      const statsBefore = reloaded.getCacheStats();
      assert.strictEqual(statsBefore.memoryEntries, 3, `应完整恢复 3 条有效记录，实际=${statsBefore.memoryEntries}`);

      // 3) 测试质量权重覆盖：caiyun(q=1) 不能覆盖 bing(q=3)，bing(q=3) 可覆盖 caiyun(q=1)
      const qKey = reloaded.makeCacheKey('Quality test sentence for priority rule.');
      assert.strictEqual(reloaded.putCache(qKey, '彩云初版译文', 'caiyun', true), true);
      assert.strictEqual(reloaded.putCache(qKey, '必应精译版本', 'bing', true), true);
      assert.strictEqual(reloaded.putCache(qKey, '彩云低权试图回退', 'caiyun', true), false);
      const checkRes = await reloaded.translateThoughtBatch([
        { id: 'q', text: 'Quality test sentence for priority rule.', persist: true }
      ]);
      assert.strictEqual(checkRes.results[0].translated, '必应精译版本');
      assert.ok(SOURCE_QUALITY.bing > SOURCE_QUALITY.caiyun);

      // 4) 测试惰性原子压缩：清理坏行与去重，且不残留 .tmp 文件
      const cmp = reloaded.compactCache();
      assert.strictEqual(cmp.compacted, true);
      assert.strictEqual(cmp.kept, 4);
      const leftovers = fs.readdirSync(tmpCacheDir).filter(f => f.endsWith('.tmp'));
      assert.strictEqual(leftovers.length, 0, '压缩后不应残留临时文件');
    });

    // ---------------------------------------------------------------------
    // 第三组：HTTP POST /translate-thought 端点并发去重实测（随机端口 0）
    // ---------------------------------------------------------------------
    console.log('\n【第三组】本地 HTTP POST /translate-thought 端点与并发实测');

    await test('随机端口复用 handleTranslateThoughtRequest 并发 5 路批量请求', async () => {
      process.env.AGY_PROXY_NO_AUTOSTART = '1';
      const proxyMod = require('./src/hub_proxy.template.js');
      const server = http.createServer((req, res) => {
        if ((req.url || '').startsWith('/translate-thought')) {
          proxyMod.handleTranslateThoughtRequest(req, res);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const port = server.address().port;

      try {
        const postReq = bodyObj =>
          new Promise((resolve, reject) => {
            const payload = JSON.stringify(bodyObj);
            const r = http.request(
              {
                hostname: '127.0.0.1',
                port,
                path: '/translate-thought',
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload)
                }
              },
              res => {
                let data = '';
                res.on('data', c => (data += c));
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
              }
            );
            r.on('error', reject);
            r.write(payload);
            r.end();
          });

        const payload = {
          items: [
            { id: 'c1', text: "I'm thinking through how to approach this.", persist: false },
            { id: 'c2', text: 'Checking `hub_proxy.js` streaming cache rules.', persist: false }
          ]
        };
        const resList = await Promise.all(Array.from({ length: 5 }, () => postReq(payload)));
        for (const r of resList) {
          assert.strictEqual(r.status, 200);
          assert.strictEqual(r.headers['access-control-allow-origin'], '*');
          const json = JSON.parse(r.body);
          assert.strictEqual(json.ok, true);
          assert.strictEqual(json.results.length, 2);
          assert.strictEqual(json.results[0].translated, '正在梳理处理思路。');
          assert.ok(json.results[1].translated.includes('`hub_proxy.js`'));
          assert.ok(/[\u4e00-\u9fa5]/.test(json.results[1].translated));
        }
      } finally {
        await new Promise(resolve => server.close(resolve));
      }
    });

    // ---------------------------------------------------------------------
    // 第四组：编译产物语法检查与前端 __agyThoughtEngine VM 沙盒验证
    // ---------------------------------------------------------------------
    console.log('\n【第四组】编译产物语法检查与前端 __agyThoughtEngine 沙盒验证');

    await test('node -c 语法检查全部关键与已部署 JS 文件', async () => {
      const files = [
        ZH_MAIN_JS,
        PROXY_JS,
        THOUGHT_TRANSLATOR_JS,
        path.join(PATCH_DIR, 'build_ultimate_chinese_engine.js'),
        path.join(SRC_DIR, 'thought_translator.js'),
        path.join(SRC_DIR, 'hub_proxy.template.js'),
        path.join(SRC_DIR, 'patcher.js'),
        path.join(SRC_DIR, 'auto_updater.js'),
        path.join(SRC_DIR, 'config.js'),
        path.join(SRC_DIR, 'verifier.js')
      ];
      for (const f of files) {
        assert.ok(fs.existsSync(f), `文件不存在: ${f}`);
        execSync(`"${NODE_EXE}" -c "${f}"`, { stdio: 'pipe' });
      }
    });

    await test('VM 沙盒提取前端 __agyThoughtEngine 验证安全断句、\\n\\n\\n 保留与双态切换拼装', async () => {
      const code = fs.readFileSync(ZH_MAIN_JS, 'utf8');
      const startMarker = '// Antigravity 思维链实时流式翻译与 L1 内存 LRU 引擎 (__agyThoughtEngine)';
      const endMarker = '// Antigravity 全局自适应运行时 DOM 清洗引擎';
      const sIdx = code.indexOf(startMarker);
      const eIdx = code.indexOf(endMarker, sIdx);
      assert.ok(sIdx !== -1 && eIdx !== -1, '未定位到前端 __agyThoughtEngine 脚本块');

      const engineCode = code.slice(sIdx, eIdx);
      const sandbox = { window: {}, fetch: async () => ({ ok: true, json: async () => ({ ok: true, results: [] }) }) };
      vm.runInNewContext(engineCode, sandbox);
      const eng = sandbox.window.__agyThoughtEngine;
      assert.ok(eng && typeof eng.splitThoughtSegments === 'function');

      // 测试 38.2% 句点陷阱 + 93% \n\n\n 分段 + 流式未闭合半句
      const streamingSample =
        "I'm thinking through how to approach this.\n\n\n" +
        'Checking `src/title_cache.json` and v1.107.0 (e.g. section 3.2) in C:\\demo\\app.js. ' +
        'Next verifying streaming tail without period yet';

      const partsStreaming = eng.splitThoughtSegments(streamingSample, true);
      const sentsStreaming = partsStreaming.filter(p => p.kind === 'sent');
      assert.strictEqual(
        sentsStreaming.length,
        3,
        `句点陷阱不应导致误切句，预期 3 句，实际=${sentsStreaming.length}: ${JSON.stringify(sentsStreaming.map(x => x.norm))}`
      );
      assert.strictEqual(sentsStreaming[0].committed, true);
      assert.strictEqual(sentsStreaming[1].committed, true);
      assert.strictEqual(sentsStreaming[2].committed, false, '流式末尾无句号半句必须标记 committed=false');

      // 模拟第 2 句完成翻译写入 L1，检验 \n\n\n 保留与拼装输出
      eng.setCached(sentsStreaming[1].key, '正在检查 C:\\demo\\app.js 中的 `src/title_cache.json` 和 v1.107.0（例如第 3.2 节）。');
      const composed = eng.composeDisplay(partsStreaming, new Map());
      assert.ok(composed.startsWith('正在梳理处理思路。\n\n\n正在检查'), `段落与静态套话拼装异常: ${composed}`);
      assert.ok(composed.endsWith('Next verifying streaming tail without period yet'), '未译半句应平稳保留原文不丢字');

      // 思考结束后，最后一句转为 committed=true
      const partsDone = eng.splitThoughtSegments(streamingSample, false);
      assert.strictEqual(partsDone.filter(p => p.kind === 'sent')[2].committed, true);

      // 流式未闭合多行代码块必须跳过翻译
      const unclosedCode = 'Checking code:\n```js\nconst x = 1.2;';
      const codeParts = eng.splitThoughtSegments(unclosedCode, true);
      assert.ok(codeParts.some(p => p.kind === 'code' && p.translatable === false), '未闭合代码块应标记 code 并跳过');
    });
  } finally {
    try {
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    } catch (_e) {}
  }

  console.log('\n====================================================');
  console.log(`思维链端到端验证结果: ${passed} / ${total} 项通过 (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('====================================================');
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
