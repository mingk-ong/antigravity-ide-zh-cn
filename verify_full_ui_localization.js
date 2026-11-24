/**
 * Antigravity IDE 全界面四阵地汉化与四重防误杀端到端验收测试套件
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PATCH_DIR = __dirname;
const { getTargetPaths, readDeployMeta } = require('./src/config');
const {
  SAFE_GLOBAL_PHRASES,
  CONTROL_ONLY_PHRASES,
  DYNAMIC_PATTERNS,
  EXTENSION_MANIFEST_TRANSLATIONS,
  EXTENSION_RUNTIME_MESSAGES,
  BROWSER_ONBOARDING_TRANSLATIONS
} = require('./src/ui_dictionary');
const { DOM_CLEANER_V2_MARKER } = require('./src/dom_cleaner');
const {
  HUB_ZH_FULL_UI_MARKERS,
  EXTENSION_HOOK_MARKER,
  EXTENSION_RUNTIME_MSG_MARKER,
  checkAllBuiltInExtensionsLocalized,
  inspectExtensionPackageLocalization,
  checkBrowserOnboardingLocalized,
  computeBuildEngineFingerprint,
  isJetskiPatched
} = require('./src/core_injector');

const { appDir, agyExtDir } = getTargetPaths();
const ZH_MAIN_JS = path.join(agyExtDir, 'hub_main_zh.js');
const EXT_JS = path.join(agyExtDir, 'vscode', 'extension.js');
const JETSKI_JS = path.join(appDir, 'out', 'jetskiAgent', 'main.js');

// 轻量拟真 DOM 节点构造器（用于在纯 Node VM 沙盒内验证 DOM 清洗器 v2 的精准命中与防误杀边界）
function createMockElement(tagName, attrs = {}, children = []) {
  const attrMap = new Map();
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v !== undefined && v !== null) attrMap.set(k, String(v));
  }
  const el = {
    nodeType: 1,
    tagName: String(tagName || 'DIV').toUpperCase(),
    className: attrMap.get('class') || '',
    placeholder: attrMap.get('placeholder') || '',
    title: attrMap.get('title') || '',
    isContentEditable: attrMap.get('contenteditable') === 'true' || attrMap.get('contenteditable') === '',
    parentElement: null,
    childNodes: [],
    getAttribute(name) {
      if (name === 'class') return this.className || null;
      if (name === 'placeholder') return this.placeholder || null;
      if (name === 'title') return this.title || null;
      return attrMap.has(name) ? attrMap.get(name) : null;
    },
    setAttribute(name, val) {
      const s = String(val);
      attrMap.set(name, s);
      if (name === 'class') this.className = s;
      if (name === 'placeholder') this.placeholder = s;
      if (name === 'title') this.title = s;
    },
    hasAttribute(name) {
      return attrMap.has(name);
    }
  };
  for (const ch of children) {
    const node = typeof ch === 'string'
      ? { nodeType: 3, nodeValue: ch, parentElement: el }
      : ch;
    node.parentElement = el;
    el.childNodes.push(node);
  }
  return el;
}

function loadDomCleanerFromBundle(bundlePath) {
  const code = fs.readFileSync(bundlePath, 'utf8');
  const startIdx = code.indexOf(`// ${DOM_CLEANER_V2_MARKER}`);
  assert.notStrictEqual(startIdx, -1, `产物 ${path.basename(bundlePath)} 缺少 DOM 清洗引擎 v2 起始标记`);
  const endMarker = 'ruleCount: rules.length\n  };\n})();';
  const endIdx = code.indexOf(endMarker, startIdx);
  assert.notStrictEqual(endIdx, -1, `产物 ${path.basename(bundlePath)} 缺少 DOM 清洗引擎 v2 闭合标记`);

  const scriptSlice = code.slice(startIdx, endIdx + endMarker.length);
  const sandbox = { window: {} };
  vm.runInNewContext(scriptSlice, sandbox);
  const api = sandbox.window.__agyDomCleanerV2;
  assert.ok(api && typeof api.translateText === 'function' && typeof api.translateSubtree === 'function', '清洗引擎 v2 诊断接口缺失');
  return { api, code };
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
  console.log('  Antigravity IDE 全界面四阵地汉化与防误杀验证套件');
  console.log('====================================================\n');

  await test('共享 UI 词库规模、译文完整性与动态正则编译校验', () => {
    const safeKeys = Object.keys(SAFE_GLOBAL_PHRASES);
    const ctrlKeys = Object.keys(CONTROL_ONLY_PHRASES);
    assert.ok(safeKeys.length >= 300, `全区安全短语词库规模不足: ${safeKeys.length}`);
    assert.ok(ctrlKeys.length >= 140, `控件门控短词词库规模不足: ${ctrlKeys.length}`);
    assert.ok(DYNAMIC_PATTERNS.length >= 20, `动态模板正则规则数量不足: ${DYNAMIC_PATTERNS.length}`);

    for (const [k, v] of [...Object.entries(SAFE_GLOBAL_PHRASES), ...Object.entries(CONTROL_ONLY_PHRASES)]) {
      assert.ok(k.trim().length >= 2 && typeof v === 'string' && v.trim().length >= 1, `词条非法: ${k} -> ${v}`);
    }
    for (const rule of DYNAMIC_PATTERNS) {
      const re = new RegExp(rule.pattern, rule.flags || '');
      assert.ok(re instanceof RegExp);
    }
    assert.strictEqual(Object.keys(EXTENSION_MANIFEST_TRANSLATIONS).length, 5, '应完整覆盖 5 个官方内置扩展');
    assert.ok(EXTENSION_RUNTIME_MESSAGES.length >= 10, '应覆盖 10 条原生扩展弹窗消息');
    assert.strictEqual(Object.keys(BROWSER_ONBOARDING_TRANSLATIONS).length, 2, '应覆盖 2 个浏览器静态引导页');
  });

  await test('Hub 前端右侧边栏首帧源码直译完整且零路由 ID 破坏', () => {
    const zhCode = fs.readFileSync(ZH_MAIN_JS, 'utf8');
    for (const mk of HUB_ZH_FULL_UI_MARKERS) {
      assert.ok(zhCode.includes(mk), `hub_main_zh.js 缺少全界面特征标记: ${mk}`);
    }
    // 路由与状态持久化 Key 绝不可被篡改
    const intactRouteKeys = [
      '{id:"subagents",title:"子智能体"',
      '{id:"sideQuestions",title:"侧边提问"',
      '{id:"backgroundTasks",title:"后台任务"',
      '{id:"modifiedFiles",title:"已修改文件"',
      'sectionId:"modifiedFiles",title:"已修改文件"',
      'overview:{header:"拉取请求"',
      'persistentKey:"conversationDecorationPullRequests"'
    ];
    for (const k of intactRouteKeys) {
      assert.ok(zhCode.includes(k), `右侧边栏首帧直译或路由保活断言失败: ${k}`);
    }
  });

  await test('VM 拟真 DOM：截图右侧边栏（含服务端下发 Skills Used）、属性动态切换与动态模板全命中', () => {
    const { api } = loadDomCleanerFromBundle(ZH_MAIN_JS);
    assert.ok(api.safeCount >= 350 && api.ctrlCount >= 140 && api.ruleCount >= 20, `运行时词库加载异常: ${JSON.stringify({ safe: api.safeCount, ctrl: api.ctrlCount, rule: api.ruleCount })}`);

    const searchInput = createMockElement('input', {
      placeholder: 'Search tabs, files and more',
      'aria-label': 'Search for content to open'
    });
    const urlInput = createMockElement('input', {
      placeholder: 'Search or enter a URL'
    });
    const sideQBtn = createMockElement('button', {}, [createMockElement('span', {}, ['Side Question'])]);
    const modifiedHdr = createMockElement('div', { 'data-testid': 'overview-panel-section-modifiedFiles' }, [
      createMockElement('span', { class: 'select-none' }, ['Modified Files'])
    ]);
    const skillsServerSec = createMockElement('div', { 'data-testid': 'overview-accumulated-section-skills_used' }, [
      createMockElement('span', {}, ['Skills Used']),
      createMockElement('button', { type: 'button' }, ['See all'])
    ]);
    const customizeMenu = createMockElement('div', { 'data-radix-popper-content-wrapper': '' }, [
      createMockElement('div', {}, ['Customize Sections']),
      createMockElement('div', { role: 'menuitemcheckbox' }, ['Pull Requests']),
      createMockElement('div', { role: 'menuitemcheckbox' }, ['Subagents']),
      createMockElement('div', { role: 'menuitemcheckbox' }, ['Goals']),
      createMockElement('div', { role: 'menuitemcheckbox' }, ['Artifacts']),
      createMockElement('div', { role: 'menuitemcheckbox' }, ['Links']),
      createMockElement('div', { role: 'menuitemcheckbox' }, ['Uploads'])
    ]);
    const dynPanel = createMockElement('div', { role: 'toolbar' }, [
      createMockElement('span', {}, ['3 files changed']),
      createMockElement('button', {}, ['Show 5 more']),
      createMockElement('span', {}, ['Open Subagent: Codebase Researcher']),
      createMockElement('button', { 'aria-label': 'More actions for verifier.js' }, ['Copy'])
    ]);

    const root = createMockElement('div', {}, [searchInput, urlInput, sideQBtn, modifiedHdr, skillsServerSec, customizeMenu, dynPanel]);
    api.translateSubtree(root);

    assert.strictEqual(searchInput.placeholder, '搜索标签页、文件及更多内容');
    assert.strictEqual(searchInput.getAttribute('aria-label'), '搜索要打开的内容');
    assert.strictEqual(urlInput.placeholder, '搜索或输入 URL');
    assert.strictEqual(sideQBtn.childNodes[0].childNodes[0].nodeValue, '侧边提问');
    assert.strictEqual(modifiedHdr.childNodes[0].childNodes[0].nodeValue, '已修改文件');
    assert.strictEqual(skillsServerSec.childNodes[0].childNodes[0].nodeValue, '已用技能');
    assert.strictEqual(skillsServerSec.childNodes[1].childNodes[0].nodeValue, '查看全部');
    assert.strictEqual(customizeMenu.childNodes[0].childNodes[0].nodeValue, '自定义分区');
    assert.strictEqual(customizeMenu.childNodes[1].childNodes[0].nodeValue, '拉取请求');
    assert.strictEqual(customizeMenu.childNodes[2].childNodes[0].nodeValue, '子智能体');
    assert.strictEqual(customizeMenu.childNodes[3].childNodes[0].nodeValue, '目标');
    assert.strictEqual(customizeMenu.childNodes[4].childNodes[0].nodeValue, '产物文档');
    assert.strictEqual(customizeMenu.childNodes[5].childNodes[0].nodeValue, '链接');
    assert.strictEqual(customizeMenu.childNodes[6].childNodes[0].nodeValue, '上传文件');
    assert.strictEqual(dynPanel.childNodes[0].childNodes[0].nodeValue, '3 个文件已变更');
    assert.strictEqual(dynPanel.childNodes[1].childNodes[0].nodeValue, '展开其余 5 项');
    assert.strictEqual(dynPanel.childNodes[2].childNodes[0].nodeValue, '打开子智能体：Codebase Researcher');
    assert.strictEqual(dynPanel.childNodes[3].getAttribute('aria-label'), 'verifier.js 的更多操作');
    assert.strictEqual(dynPanel.childNodes[3].childNodes[0].nodeValue, '复制');
  });

  await test('VM 拟真 DOM：四重防误杀护城河（代码/编辑器/终端/Markdown 正文/思维链/表格/文件名 100% 零污染）', () => {
    const { api } = loadDomCleanerFromBundle(ZH_MAIN_JS);

    const codeBlock = createMockElement('pre', {}, [createMockElement('code', {}, ['Customize Sections'])]);
    const monaco = createMockElement('div', { class: 'monaco-editor' }, [createMockElement('span', {}, ['Modified Files'])]);
    const xterm = createMockElement('div', { class: 'xterm' }, [createMockElement('span', {}, ['Background Tasks'])]);
    const editable = createMockElement('div', { contenteditable: 'true' }, [createMockElement('p', {}, ['Side Question'])]);
    const thoughtBody = createMockElement('div', { 'data-agy-thought-body': '1' }, [createMockElement('p', {}, ['Customize Sections'])]);
    const tableCell = createMockElement('table', { class: 'md-table-el' }, [createMockElement('td', {}, ['Skills Used'])]);
    const prosePara = createMockElement('div', { class: 'markdown-body prose' }, [
      createMockElement('p', {}, ['Modified Files']),
      createMockElement('p', {}, ['Copy']),
      // 正文内部嵌套的真实 UI 按钮（例如代码块复制按钮）仍应被精准翻译！
      createMockElement('button', { type: 'button' }, ['Copy'])
    ]);
    // 非控件普通容器里的多义短词 & 文件名绝不可被误杀
    const plainList = createMockElement('div', {}, [
      createMockElement('span', {}, ['Goals']),
      createMockElement('span', {}, ['Links.md']),
      createMockElement('span', {}, ['src/Subagents.ts'])
    ]);

    const root = createMockElement('div', {}, [codeBlock, monaco, xterm, editable, thoughtBody, tableCell, prosePara, plainList]);
    api.translateSubtree(root);

    assert.strictEqual(codeBlock.childNodes[0].childNodes[0].nodeValue, 'Customize Sections', '代码块不可误译');
    assert.strictEqual(monaco.childNodes[0].childNodes[0].nodeValue, 'Modified Files', 'Monaco 编辑器不可误译');
    assert.strictEqual(xterm.childNodes[0].childNodes[0].nodeValue, 'Background Tasks', 'Xterm 终端不可误译');
    assert.strictEqual(editable.childNodes[0].childNodes[0].nodeValue, 'Side Question', '可编辑输入框内容不可误译');
    assert.strictEqual(thoughtBody.childNodes[0].childNodes[0].nodeValue, 'Customize Sections', '思维链正文容器由专用引擎处理，不可被 DOM 清洗干扰');
    assert.strictEqual(tableCell.childNodes[0].childNodes[0].nodeValue, 'Skills Used', 'Markdown 表格正文单元格不可误译');
    assert.strictEqual(prosePara.childNodes[0].childNodes[0].nodeValue, 'Modified Files', 'AI Markdown 正文段落不可误译');
    assert.strictEqual(prosePara.childNodes[1].childNodes[0].nodeValue, 'Copy', 'AI 正文短词不可误译');
    assert.strictEqual(prosePara.childNodes[2].childNodes[0].nodeValue, '复制', 'AI 正文内嵌套的显式操作按钮应正常汉化');
    assert.strictEqual(plainList.childNodes[0].childNodes[0].nodeValue, 'Goals', '普通非控件容器内的高歧义短词不可误译');
    assert.strictEqual(plainList.childNodes[1].childNodes[0].nodeValue, 'Links.md', '文件名不可误译');
    assert.strictEqual(plainList.childNodes[2].childNodes[0].nodeValue, 'src/Subagents.ts', '文件路径不可误译');
  });

  await test('独立 Agent Manager (jetskiAgent/main.js) 共享 DOM 清洗引擎 v2 挂载与 VM 可执行验收', () => {
    assert.ok(fs.existsSync(JETSKI_JS), '未找到 jetskiAgent/main.js');
    const jkCode = fs.readFileSync(JETSKI_JS, 'utf8');
    assert.strictEqual(isJetskiPatched(jkCode), true, 'jetskiAgent/main.js 应通过完整补丁校验');
    const { api } = loadDomCleanerFromBundle(JETSKI_JS);
    assert.strictEqual(api.translateText('Skills Used', false), '已用技能');
    assert.strictEqual(api.translateText('Customize Sections', false), '自定义分区');
    assert.strictEqual(api.translateText('See all', true), '查看全部');
  });

  await test('5 大官方内置扩展 package.json 全量诚实汉化验收（含单条篡改防假绿回归）', () => {
    const report = checkAllBuiltInExtensionsLocalized(appDir);
    assert.strictEqual(report.ok, true, `部分扩展未完成汉化: ${JSON.stringify(report.results)}`);
    assert.strictEqual(report.results.length, 5, '应校验全部 5 个官方内置扩展');
    assert.ok(report.totalItems >= 80 && report.localizedItems === report.totalItems, `扩展总汉化项数异常: ${report.localizedItems}/${report.totalItems}`);

    // 回归防假绿测试：将 agy/package.json 某条命令还原为英文，必须诚实返回 ok=false
    const agyPkgPath = path.join(appDir, 'extensions', 'agy', 'package.json');
    const mutatedPkg = JSON.parse(fs.readFileSync(agyPkgPath, 'utf8'));
    mutatedPkg.contributes.commands[0].title = 'Show Third Party Notices';
    const checkMut = inspectExtensionPackageLocalization('agy', JSON.stringify(mutatedPkg));
    assert.strictEqual(checkMut.ok, false, '篡改扩展命令标题后诚实校验必须报 false');
  });

  await test('extension.js 代理钩子、10 处原生弹窗与内置浏览器引导页汉化验收', () => {
    const extCode = fs.readFileSync(EXT_JS, 'utf8');
    assert.ok(extCode.includes(EXTENSION_HOOK_MARKER) && extCode.includes('hub_proxy'), 'extension.js 缺少代理钩子');
    assert.ok(extCode.includes(EXTENSION_RUNTIME_MSG_MARKER), 'extension.js 缺少原生弹窗汉化');
    for (const [, zhLit] of EXTENSION_RUNTIME_MESSAGES) {
      assert.ok(extCode.includes(zhLit), `extension.js 缺少汉化弹窗: ${zhLit}`);
    }

    const ob = checkBrowserOnboardingLocalized(appDir);
    assert.strictEqual(ob.ok, true, `浏览器静态引导页汉化不完整: ${JSON.stringify(ob.results)}`);
    assert.strictEqual(ob.results.length, 2);
  });

  await test('构建引擎与共享词库组合指纹一致性验收', () => {
    const meta = readDeployMeta(agyExtDir);
    const expectedFp = computeBuildEngineFingerprint(PATCH_DIR);
    assert.ok(meta && meta.buildEngineSha256 === expectedFp, '部署元数据 buildEngineSha256 应与组合指纹一致');
  });

  console.log('\n====================================================');
  console.log(`全界面四阵地汉化与防误杀验证结果: ${passed} / ${total} 项通过 (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('====================================================');
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
