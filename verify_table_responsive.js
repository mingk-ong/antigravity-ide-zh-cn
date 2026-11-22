/**
 * Antigravity IDE Markdown 表格智能权重自适应布局端到端验收测试套件
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const NODE_EXE = process.execPath;
const PATCH_DIR = __dirname;
const SRC_DIR = path.join(PATCH_DIR, 'src');
const { getTargetPaths } = require('./src/config');
const { agyExtDir } = getTargetPaths();
const ZH_MAIN_JS = path.join(agyExtDir, 'hub_main_zh.js');
const { resolveHubSourcePath, HUB_ZH_TABLE_FEATURE_MARKERS } = require('./src/core_injector');
const { probeVersionCompatibility } = require('./src/auto_updater');

function loadTableEngineFromBundle(bundlePath) {
  const code = fs.readFileSync(bundlePath, 'utf8');
  const startMarker = '// Antigravity Markdown 表格智能权重自适应布局引擎 (__agyTableEngine)';
  const endMarker = '// Antigravity 全局自适应运行时 DOM 清洗引擎';
  const sIdx = code.indexOf(startMarker);
  const eIdx = code.indexOf(endMarker, sIdx);
  assert.ok(sIdx !== -1 && eIdx !== -1, '未定位到前端 __agyTableEngine 脚本块');

  const engineCode = code.slice(sIdx, eIdx);
  const sandbox = { window: {} };
  vm.runInNewContext(engineCode, sandbox);
  const eng = sandbox.window.__agyTableEngine;
  assert.ok(eng && typeof eng.computeColumnWidths === 'function' && typeof eng.buildTableCss === 'function');
  return { eng, code };
}

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
  console.log('  Antigravity IDE Markdown 表格自适应布局端到端验证');
  console.log('====================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-table-test-'));

  try {
    console.log('【第一组】产物语法、指纹完整性与 VM 沙盒加载');

    let eng = null;
    let bundleCode = '';

    await test('已部署 hub_main_zh.js 语法合法且包含全部表格自适应指纹与中文菜单', async () => {
      assert.ok(fs.existsSync(ZH_MAIN_JS), `文件不存在: ${ZH_MAIN_JS}`);
      execSync(`"${NODE_EXE}" -c "${ZH_MAIN_JS}"`, { stdio: 'pipe' });
      const loaded = loadTableEngineFromBundle(ZH_MAIN_JS);
      eng = loaded.eng;
      bundleCode = loaded.code;

      for (const marker of HUB_ZH_TABLE_FEATURE_MARKERS) {
        assert.ok(bundleCode.includes(marker), `缺少表格自适应关键指纹: ${marker}`);
      }
      assert.ok(!bundleCode.includes('min-width: calc-size(max-content, min(size, 20ch));'), '旧版 .inline-pill-wrap 20ch 最小宽锁死应已移除');
      assert.ok(bundleCode.includes('已复制到剪贴板') && bundleCode.includes('可横向滚动表格'), '缺少表格提示与无障碍文案汉化');
    });

    console.log('\n【第二组】智能权重列宽分配核心数学算法验收');

    await test('不超宽常规短表：保持 natural 模式零压缩且禁用无意义的展开按钮', async () => {
      const cols = [
        { natural: 90, chrome: 25 },
        { natural: 140, chrome: 25 },
        { natural: 80, chrome: 25 }
      ];
      const res = eng.computeColumnWidths(cols, 620);
      assert.strictEqual(res.mode, 'natural');
      assert.strictEqual(res.overflow, false);
      assert.deepStrictEqual(res.widths, [90, 140, 80]);

      const built = eng.buildTableCss('tbl-short', cols, 620, 'column', { parentWidth: 620, capWidth: 620 });
      assert.strictEqual(built.canExpand, false, '未超宽表格不应启用展开全宽按钮');
      assert.ok(built.css.includes('transform: none !important;'), '窄屏不外溢时应关闭 translateX 防亚像素发虚');
    });

    await test('现场复现：截图同款 4 列审计表在窄(460px)/中(620px)/宽(760px)/全屏(1100px)全面适配零裁切', async () => {
      // 模拟截图真实 4 列：链路 / 对应文件 / 当前状态 / 发现的具体缺口
      const auditCols = [
        { natural: 115, chrome: 25 },
        { natural: 195, chrome: 25 },
        { natural: 88, chrome: 25 },
        { natural: 1600, chrome: 25 }
      ];

      for (const width of [460, 620, 760, 1100]) {
        const res = eng.computeColumnWidths(auditCols, width);
        assert.strictEqual(res.mode, 'fit', `宽度 ${width}px 应命中 fit 模式，实际=${res.mode}`);
        assert.strictEqual(res.overflow, false, `宽度 ${width}px 不应发生横向溢出`);
        assert.ok(res.totalAllocated <= width - eng.FRAME_BORDER_SLACK, `宽度 ${width}px 分配总宽超界: ${res.totalAllocated}`);
        assert.ok(res.widths[3] > res.widths[1] && res.widths[1] > res.widths[0] && res.widths[0] > res.widths[2],
          `列宽优先级应符合内容体量顺序(列3>列1>列0>列2)，width=${width}, actual=${JSON.stringify(res.widths)}`);
        // 百分比求和严格等于 100%
        const pctSum = res.percents.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(pctSum - 100) < 0.01, `百分比总和应为 100%，实际=${pctSum}`);

        // 在 620px 下第 4 列主内容区至少占总净预算 44% 以上，且无短列被压成竖排(<52px)
        if (width === 620) {
          assert.ok(res.widths[3] >= 230, `620px 下第 4 列应拿到充足阅读宽(>=230px)，实际=${res.widths[3]}`);
          assert.ok(res.widths.every(w => w >= 52), `620px 下任何列不得低于可读底线 52px: ${JSON.stringify(res.widths)}`);
          console.log(`     └─► 620px 截图同款分配结果(内容px / 整列px): ${res.widths.map((w, i) => `${w}/${w + auditCols[i].chrome}`).join(' | ')}`);
        }
        // 在 1100px 宽屏下前 3 列应精准吃饱自然宽不浪费，第 4 列打破官方 320px 死上限拿到 >500px！
        if (width === 1100) {
          assert.strictEqual(res.widths[0], 115, '宽屏下短列 0 应恰好贴合自然宽不留多余空白');
          assert.strictEqual(res.widths[1], 195, '宽屏下文件列 1 应恰好贴合自然宽');
          assert.strictEqual(res.widths[2], 88, '宽屏下状态列 2 应恰好贴合自然宽');
          assert.ok(res.widths[3] >= 590, `宽屏下主说明列应打破官方 320px 限制并吃满剩余宽度，实际=${res.widths[3]}`);
        }
      }
    });

    await test('2 列 KV 表、3 列对称长文本表与 6 列混合表精准适配', async () => {
      // 1) 2 列 KV 表：左列紧凑贴合，右列拿满剩余
      const kv = eng.computeColumnWidths(
        [{ natural: 86, chrome: 25 }, { natural: 950, chrome: 25 }],
        560
      );
      assert.strictEqual(kv.mode, 'fit');
      assert.strictEqual(kv.widths[0], 86, `KV 左短列应精准吃饱 86px，实际=${kv.widths[0]}`);
      assert.ok(kv.widths[1] >= 415, `KV 右长列应拿满剩余宽，实际=${kv.widths[1]}`);

      // 2) 3 列对称长文本表：三列严格对称（误差 <= 1px）
      const sym = eng.computeColumnWidths(
        [{ natural: 800, chrome: 25 }, { natural: 800, chrome: 25 }, { natural: 800, chrome: 25 }],
        660
      );
      assert.strictEqual(sym.mode, 'fit');
      assert.ok(Math.max(...sym.widths) - Math.min(...sym.widths) <= 1, `对称长列分配不均: ${JSON.stringify(sym.widths)}`);

      // 3) 6 列混合表（3 短列 + 3 中长列）在 650px 对话框内依然 100% 贴合无横向滚动
      const sixCols = [
        { natural: 36, chrome: 25 },
        { natural: 44, chrome: 25 },
        { natural: 48, chrome: 25 },
        { natural: 140, chrome: 25 },
        { natural: 260, chrome: 25 },
        { natural: 900, chrome: 25 }
      ];
      const sixRes = eng.computeColumnWidths(sixCols, 650);
      assert.strictEqual(sixRes.mode, 'fit', `6 列混合表在 650px 下应无缝 fit，实际=${sixRes.mode}`);
      assert.strictEqual(sixRes.overflow, false);
      assert.ok(sixRes.totalAllocated <= 646);
    });

    await test('超多列(10列)与极窄视口(260px)可读性底线保护：温和回退紧凑横向滚动不挤烂', async () => {
      const tenCols = Array.from({ length: 10 }, (_, idx) => ({
        natural: idx % 3 === 0 ? 75 : idx % 3 === 1 ? 180 : 650,
        chrome: 25
      }));
      const res10 = eng.computeColumnWidths(tenCols, 600);
      assert.strictEqual(res10.mode, 'scroll', '10 列表格在 600px 下低于单列底线应回退 scroll');
      assert.strictEqual(res10.overflow, true);
      assert.ok(res10.widths.every(w => w >= 52 && w <= 260), `scroll 回退模式列宽应在 [52, 260] 紧凑区间: ${JSON.stringify(res10.widths)}`);

      const narrow4 = eng.computeColumnWidths(
        [{ natural: 100, chrome: 25 }, { natural: 150, chrome: 25 }, { natural: 120, chrome: 25 }, { natural: 500, chrome: 25 }],
        260
      );
      assert.strictEqual(narrow4.mode, 'scroll', '260px 极窄视口 4 列应触发可读性底线保护');
      assert.strictEqual(narrow4.overflow, true);
    });

    await test('极端边界输入防御（单列、空列、0 宽、非法 NaN）零异常零 NaN', async () => {
      const single = eng.computeColumnWidths([{ natural: 1800, chrome: 25 }], 500);
      assert.strictEqual(single.mode, 'fit');
      assert.deepStrictEqual(Array.from(single.percents), [100]);

      const withEmpty = eng.computeColumnWidths([{ natural: 0, chrome: 25 }, { natural: 900, chrome: 25 }], 480);
      assert.strictEqual(withEmpty.mode, 'fit');
      assert.strictEqual(withEmpty.widths[0], 16, '空列应保持最小 16px 不浪费空间');
      assert.ok(withEmpty.widths[1] >= 400);

      const zeroW = eng.computeColumnWidths([{ natural: 100, chrome: 25 }], 0);
      assert.strictEqual(zeroW.mode, 'natural');
      assert.deepStrictEqual(Array.from(zeroW.widths), []);

      const dirty = eng.computeColumnWidths([{ natural: NaN, chrome: -10 }, { natural: Infinity, chrome: 999 }], 500);
      assert.ok(dirty.widths.every(w => Number.isFinite(w) && w >= 0), `脏数据不可产生 NaN/负值: ${JSON.stringify(dirty)}`);
    });

    console.log('\n【第三组】CSS 规则生成、宽屏外溢对齐与防遮挡校验');

    await test('buildTableCss 输出精确 scoped 规则（防测量污染、table-layout:fixed、防 ⋮ 遮挡、full 模式切换）', async () => {
      const cols = [
        { natural: 115, chrome: 25 },
        { natural: 195, chrome: 25 },
        { natural: 88, chrome: 25 },
        { natural: 1600, chrome: 25 }
      ];

      // 1) 窄侧边栏 (parent=620, cap=620)：右侧自动预留 8px 屏幕边缘安全间距，舒展且不空旷
      const narrowCss = eng.buildTableCss('t-narrow', cols, 620, 'column', { parentWidth: 620, capWidth: 620 });
      assert.strictEqual(narrowCss.canExpand, true);
      assert.ok(narrowCss.css.includes('[data-md-table="t-narrow"]:not([data-agy-measuring="1"]) > table { table-layout: fixed !important;'), 'fit 模式必须启用 table-layout: fixed 并隔离测量态');
      assert.ok(narrowCss.css.includes('padding-inline-end: 1.75rem;'), '末列表头应预留右上角 ⋮ 按钮空间防遮挡');
      assert.ok(narrowCss.css.includes('overflow-wrap: anywhere; word-break: break-word;'), '应启用长标识符/代码强制安全折行');
      assert.ok(narrowCss.css.includes('transform: none !important;'), '侧边栏不外溢时禁用 translateX');
      assert.ok(narrowCss.css.includes('box-sizing: border-box !important; padding-inline-end: 8px !important;'), '表格右侧应对齐增加 8px 屏幕边缘安全留白');

      // 2) 极窄视口 (parent=260, cap=260)：右侧安全留白温和收敛至 4px，不浪费空间
      const tinyCss = eng.buildTableCss('t-tiny', cols, 260, 'column', { parentWidth: 260, capWidth: 260 });
      assert.ok(tinyCss.css.includes('padding-inline-end: 4px !important;'), '极窄视口右侧安全留白应收敛至 4px');

      // 3) 宽屏独立窗口 (parent=768, cap=1280)：居中舒展并保留屏幕边缘安全距(1280 - 16 = 1264px)，不覆写官方 max-width reserve 过渡
      const wideCss = eng.buildTableCss('t-wide', cols, 1280, 'column', { parentWidth: 768, capWidth: 1280 });
      assert.ok(wideCss.css.includes('[data-md-table-host="t-wide"][data-width-mode="column"] { width: 1264px !important; box-sizing: border-box !important; padding-inline-end: 8px !important; }'), '宽屏超宽表应自动舒展并预留右侧安全距');
      assert.ok(!wideCss.css.includes('max-width: 100cqw !important'), '不可覆写官方 --md-table-end-reserve 动态 max-width 过渡');

      // 4) full 展开全宽模式：同样预留右侧屏幕边缘安全留白
      const fullCss = eng.buildTableCss('t-full', cols, 620, 'full', { parentWidth: 620, capWidth: 620 });
      assert.ok(fullCss.css.includes('[data-md-table-host="t-full"][data-width-mode="full"] { box-sizing: border-box !important; padding-inline-end: 8px !important; }'), 'full 模式也应保留右侧屏幕边缘安全距');
      assert.ok(fullCss.css.includes('min-width: min(1600px, 70ch); max-width: none;'), 'full 模式应允许用户按需展开查看原始全宽表');
      assert.ok(!fullCss.css.includes('table-layout: fixed'), 'full 模式不应锁定 table-layout: fixed');
    });

    console.log('\n【第四组】更新自愈探针兼容与防白屏熔断验证');

    await test('更新适配探针 23 项必选核心锚点命中 + 表格耦合符号改名熔断保护', async () => {
      const hubSourcePath = resolveHubSourcePath(agyExtDir, PATCH_DIR);
      const probeOk = probeVersionCompatibility(hubSourcePath);
      assert.strictEqual(probeOk.compatible, true, `当前官方版本应 100% 兼容，缺失项: ${JSON.stringify(probeOk.missingAnchors)}`);
      assert.strictEqual(probeOk.matchedAnchors.length, 23, `应命中全部 23 项必选锚点，实际=${probeOk.matchedAnchors.length}`);

      // 模拟新版修改了 mkc 内部下拉菜单组件名 WW -> Z9，探针必须触发熔断
      const rawHub = fs.readFileSync(hubSourcePath, 'utf8');
      const mutated = rawHub.replace('D.createElement(WW,{open:f,onOpenChange:g}', 'D.createElement(Z9,{open:f,onOpenChange:g}');
      assert.notStrictEqual(mutated, rawHub, '模拟变异必须实际修改到目标符号');
      const mutatedPath = path.join(tmpDir, 'mutated_table_hub.js');
      fs.writeFileSync(mutatedPath, mutated, 'utf8');

      const probeBroken = probeVersionCompatibility(mutatedPath);
      assert.strictEqual(probeBroken.compatible, false, '表格组件强耦合符号改名时探针必须触发熔断');
      assert.ok(
        probeBroken.missingAnchors.some(a => a.id === 'table_coupled_symbols'),
        `熔断报告应精准定位 table_coupled_symbols，实际=${JSON.stringify(probeBroken.missingAnchors)}`
      );
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {}
  }

  console.log('\n====================================================');
  console.log(`Markdown 表格自适应验证结果: ${passed} / ${total} 项通过 (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('====================================================');
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
