/**
 * Antigravity IDE 统一核心注入、抗混淆定位器、跨版本安全备份与特征指纹模块
 * (Core Injector, Anti-Obfuscation Locators & Shared Fingerprints)
 *
 * 设计目标：
 * 1. 让 patcher.js（手动部署）、auto_updater.js（更新自愈）、hub_proxy.js（热捕获同步）、verifier.js（生效审查）
 *    共享同一份真相源，彻底杜绝功能漂移。
 * 2. 全面采用结构化抗混淆定位器（不再写死易变的 Jv/Zw/yhn/est 等打包器重编号符号），大幅提升跨版本自动适配率。
 * 3. 跨版本安全备份：官方更新覆盖新版原件后自动刷新 .bak，绝不用旧版 .bak 污染新版内核。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const {
  computeChecksum,
  computeFileSha256,
  getTargetPaths,
  readDeployMeta,
  writeDeployMeta
} = require('./config');
const { agyCommandsMap } = require('./dictionary');
const { loadCache } = require('./title_translator');
const {
  EXTENSION_MANIFEST_TRANSLATIONS,
  EXTENSION_RUNTIME_MESSAGES,
  BROWSER_ONBOARDING_TRANSLATIONS
} = require('./ui_dictionary');
const {
  DOM_CLEANER_V2_MARKER,
  buildDomCleanerRuntimeScript
} = require('./dom_cleaner');

// =========================================================================
// 1. 全项目共享特征指纹常量与抗混淆正则（供自检、探针、审查共用）
// =========================================================================

const PROXY_REQUIRED_ENDPOINTS = [
  '/translate-title',
  '/log-title-persisted',
  '/translate-thought',
  '/thought-cache-stats',
  '/thought-cache-clear'
];

const PROXY_RESILIENCE_MARKERS = [
  'pruneProxyLogKeepLastRuns',
  'ensureLiveMainSyncedAndCompiled',
  'capturedHubAgyVersion'
];

const THOUGHT_TRANSLATOR_REQUIRED_MARKERS = [
  "CACHE_VERSION = 'v2'",
  'pickSafeTagPrefix',
  'sanitizeMarkdownTildes',
  'keepAlive: true'
];

const HUB_ZH_THOUGHT_FEATURE_MARKERS = [
  '__agyThoughtEngine',
  '/translate-thought',
  '思考了 ',
  '查看原文',
  '正在同步中文思考过程…',
  'hideUntranslated',
  'getStepUiState',
  'getLastPointer',
  'data-agy-thought-wrap',
  'thought-collapse-lock',
  'defaultExpanded:_effectiveActive',
  '_scheduleGraceCollapse(350,!0)'
];

const HUB_ZH_TITLE_FEATURE_MARKERS = [
  '软件界面中文化设置',
  '__agyTitleAutoLocalizer',
  'updateConversationAnnotations',
  '/translate-title'
];

const HUB_ZH_TABLE_FEATURE_MARKERS = [
  '__agyTableEngine',
  'computeColumnWidths',
  'buildTableCss',
  'data-agy-measuring',
  'data-agy-table-responsive',
  '展开全宽',
  '适应窗口',
  '复制为 Markdown',
  '表格选项'
];

const HUB_ZH_FULL_UI_MARKERS = [
  DOM_CLEANER_V2_MARKER,
  'window.__agyDomCleanerV2',
  '搜索标签页、文件及更多内容',
  '自定义分区',
  '已用技能',
  '侧边提问',
  '已修改文件',
  '拉取请求'
];

const EXTENSION_RUNTIME_MSG_MARKER = 'Antigravity：登录成功';
const BROWSER_ONBOARDING_MARKERS = {
  'browserLanding.html': 'Antigravity 浏览器自动化控制',
  'browserOnboarding.html': '浏览器集成配置'
};

// extension.js 抗混淆定位器：动态捕获 4 参数名并用 bridge.js 前瞻锁死目标方法，彻底免疫 Jv -> Zw 等内部函数改名
const EXTENSION_HOOK_MARKER = 'redirectIframeUrl';
const EXTENSION_HOOK_REGEX =
  /renderWebviewHtml\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\)\{(?=[^{}]{0,260}asWebviewUri\([^)]{0,140}"bridge\.js")/;

// 外层 workbench / jetskiAgent 抗混淆定位器（均配合固定字面量 indexOf 窄窗口使用，杜绝 12-27MB 大文件正则回溯）
const WORKBENCH_TITLE_FN_REGEX =
  /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return \2\?\.annotations\?\.title\?\.trim\(\)\|\|\2\?\.summary\?\.trim\(\)\|\|void 0\}/;
const WORKBENCH_PATCHED_MARKER = '软件界面中文化设置';

const JETSKI_TITLE_FN_REGEX =
  /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return \2\?\.annotations\?\.title\?\.trim\(\)\|\|\2\?\.summary\?\.trim\(\)\|\|void 0\}/;
const JETSKI_UEN_REGEX = /let ([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.summary\|\|"Untitled Conversation";/;
const JETSKI_SMA_REGEX = /item:\{id:([A-Za-z_$][\w$]*)\.cascadeId,label:\1\.title,/;
const JETSKI_THINKING_FOR_REGEX = /([A-Za-z_$][\w$]*)>=0\?`Thinking for \$\{Math\.max\(1,\1\)\}s`:"Thinking"/;
const JETSKI_THOUGHT_FOR_REGEX = /([A-Za-z_$][\w$]*)\?`Thought for \$\{Math\.max\(1,Number\(\1\.seconds\)\)\}s`:"Thought Process"/;
const JETSKI_THINKING_DOTS_TARGET = 'children:"Thinking..."';

/**
 * 大文件毫秒级抗混淆正则匹配原语：
 * 先用 V8 原生 SIMD indexOf 定位固定字面量锚点，再仅在极窄局部窗口内跑正则，
 * 将 12~27MB bundle 上的耗时从几十秒降至 ~1-3ms，彻底消除正则回溯卡顿。
 */
function findByAnchorRegex(code, anchorStr, regex, backChars = 120, fwdChars = 160) {
  if (typeof code !== 'string' || !anchorStr) return null;
  let searchFrom = 0;
  const localRe = new RegExp(regex.source, regex.flags.replace(/g/g, ''));
  while (searchFrom < code.length) {
    const idx = code.indexOf(anchorStr, searchFrom);
    if (idx === -1) return null;
    const winStart = Math.max(0, idx - backChars);
    const winEnd = Math.min(code.length, idx + anchorStr.length + fwdChars);
    const slice = code.slice(winStart, winEnd);
    const m = localRe.exec(slice);
    if (m) {
      m.index = winStart + m.index;
      return m;
    }
    searchFrom = idx + anchorStr.length;
  }
  return null;
}

/**
 * 大文件毫秒级全局替换原语（配合固定字面量锚点窄窗口）
 */
function replaceAllByAnchorRegex(code, anchorStr, regex, replacer, backChars = 80, fwdChars = 120) {
  if (typeof code !== 'string' || !anchorStr) return { code, count: 0 };
  let out = code;
  let count = 0;
  let searchFrom = 0;
  const localRe = new RegExp(regex.source, regex.flags.replace(/g/g, ''));
  while (searchFrom < out.length) {
    const idx = out.indexOf(anchorStr, searchFrom);
    if (idx === -1) break;
    const winStart = Math.max(0, idx - backChars);
    const winEnd = Math.min(out.length, idx + anchorStr.length + fwdChars);
    const slice = out.slice(winStart, winEnd);
    const m = localRe.exec(slice);
    if (m) {
      const absStart = winStart + m.index;
      const absEnd = absStart + m[0].length;
      const rep = typeof replacer === 'function' ? replacer(m) : replacer;
      out = out.slice(0, absStart) + rep + out.slice(absEnd);
      count++;
      searchFrom = absStart + rep.length;
    } else {
      searchFrom = idx + anchorStr.length;
    }
  }
  return { code: out, count };
}

/**
 * 精准 JS 花括号深度匹配扫描器（跳过单/双引号与模板字符串中的伪括号）
 * 用于精确找到任意组件函数体的闭合位置，彻底告别写死 ";var jAc=" / "var nkc=" 等邻接函数名
 */
function findMatchingBraceEnd(code, openBraceIdx) {
  if (typeof code !== 'string' || openBraceIdx < 0 || code[openBraceIdx] !== '{') return -1;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = openBraceIdx; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 模块 A-RPC 抗混淆定位器（会话标题原生 RPC 自动持久化守卫，兼容 1.11.0 vcc / 1.12.0 sjc 及任意混淆名）
 */
function locateTitleRpcModule(code) {
  if (typeof code !== 'string') return { matched: false, reason: '无效源码' };
  const anchorIdx = code.indexOf('getStartingConversationIds:()=>');
  if (anchorIdx === -1) {
    return { matched: false, reason: '未找到 getStartingConversationIds 锚点' };
  }
  const winStart = Math.max(0, anchorIdx - 360);
  const winEnd = Math.min(code.length, anchorIdx + 120);
  const win = code.slice(winStart, winEnd);

  const compMatch = /var ([A-Za-z_$][\w$]*)=\(\)=>\{[^}]*?\{updateConversationAnnotations:([A-Za-z_$][\w$]*)\}=[A-Za-z_$][\w$]*\(\)[^;]*;\(0,([A-Za-z_$][\w$]*)\.useEffect\)/.exec(win);
  if (!compMatch) {
    return { matched: false, reason: '未匹配到 updateConversationAnnotations 挂载组件签名' };
  }
  const dispatchMatch = /dispatch:([A-Za-z_$][\w$]*)\.dispatch/.exec(win);
  const startingMatch = /getStartingConversationIds:\(\)=>([A-Za-z_$][\w$]*)\(/.exec(win);
  if (!dispatchMatch || !startingMatch) {
    return { matched: false, reason: '未捕获到 store.dispatch 或 getStartingConversationIds 符号' };
  }

  // 在整包中通过固定语义串提取 protobuf 构造器、schema 命名空间及本地 Redux 更新 action
  const pbMatch = findByAnchorRegex(
    code,
    '.ConversationAnnotationsSchema,{markedAsUnread:',
    /([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\.ConversationAnnotationsSchema,\{markedAsUnread:/,
    30,
    20
  );
  const actionMatch = findByAnchorRegex(
    code,
    ',annotations:{markedAsUnread:!1}}))',
    /\.dispatch\(([A-Za-z_$][\w$]*)\(\{cascadeId:[A-Za-z_$][\w$]*,annotations:\{markedAsUnread:!1\}\}\)\)/,
    60,
    20
  );
  if (!pbMatch || !actionMatch) {
    return { matched: false, reason: '未捕获到 ConversationAnnotationsSchema 构造器或 Redux action 符号' };
  }

  const effectRelIdx = compMatch[0].indexOf(`(0,${compMatch[3]}.useEffect)`);
  const insertPos = winStart + compMatch.index + effectRelIdx;

  return {
    matched: true,
    insertPos,
    compName: compMatch[1],
    rpcVar: compMatch[2],
    reactVar: compMatch[3],
    storeVar: dispatchMatch[1],
    startingFn: startingMatch[1],
    createFn: pbMatch[1],
    pbMod: pbMatch[2],
    patchActionFn: actionMatch[1]
  };
}

/**
 * 模块 B 抗混淆定位器（思维链实时流式翻译与悬停小锁，兼容 1.11.0 iAc / 1.12.0 rTc 及任意混淆名）
 */
function locateThoughtModule(code) {
  if (typeof code !== 'string') return { matched: false, reason: '无效源码' };
  const triggerIdx = code.indexOf('dataTestId:"thinking-collapsible-trigger"');
  if (triggerIdx === -1) {
    return { matched: false, reason: '未找到 thinking-collapsible-trigger 锚点' };
  }
  const searchStart = Math.max(0, triggerIdx - 1400);
  const preSlice = code.slice(searchStart, triggerIdx);
  const headMatch = /var ([A-Za-z_$][\w$]*)=\(\{thinking:a,thinkingDuration:b,metadata:c,status:d,stepHasNonThinkingContent:f\}\)=>\{/.exec(preSlice);
  if (!headMatch) {
    return { matched: false, reason: '未匹配到思维链组件参数签名' };
  }
  const startIdx = searchStart + headMatch.index;
  const openBraceIdx = startIdx + headMatch[0].length - 1;
  const closeBraceIdx = findMatchingBraceEnd(code, openBraceIdx);
  if (closeBraceIdx === -1) {
    return { matched: false, reason: '思维链组件花括号未闭合' };
  }
  const endIdx = code[closeBraceIdx + 1] === ';' ? closeBraceIdx + 2 : closeBraceIdx + 1;
  const body = code.slice(startIdx, endIdx);

  const reactMatch = /([A-Za-z_$][\w$]*)\.createElement\("div"/.exec(body);
  const ctxMatch = /verboseAgentChat:h\}=([A-Za-z_$][\w$]*)\(\)/.exec(body);
  const runMatch = /=([A-Za-z_$][\w$]*)\(\)===([A-Za-z_$][\w$]*)\.CascadeRunStatus\.RUNNING/.exec(body);
  const stepStatusOk = runMatch && body.includes(`${runMatch[2]}.CortexStepStatus.RUNNING`) && body.includes(`${runMatch[2]}.CortexStepStatus.GENERATING`);
  const animMatch = /(?:var\s+|,)n=([A-Za-z_$][\w$]*)\(\)/.exec(body);
  const featMatch = /=([A-Za-z_$][\w$]*)\(\);[^;]*get\("conversationView"\)\?\.trajectorySteering/.exec(body);
  const shimmerMatch = /\.createElement\(([A-Za-z_$][\w$]*),\{active:m/.exec(body);
  const headerMatch = /\.createElement\(([A-Za-z_$][\w$]*),\{metadata:c,doneText:/.exec(body);
  const collapseMatch = /return [A-Za-z_$][\w$]*\.createElement\(([A-Za-z_$][\w$]*),\{trigger:/.exec(body);

  const missing = [];
  if (!reactMatch) missing.push('reactVar');
  if (!ctxMatch) missing.push('ctxHook');
  if (!runMatch) missing.push('runStatusHook/enumObj');
  if (!stepStatusOk) missing.push('CortexStepStatus');
  if (!animMatch) missing.push('animHook');
  if (!shimmerMatch) missing.push('shimmerComp');
  if (!headerMatch) missing.push('headerComp');
  if (!collapseMatch) missing.push('collapseComp');

  if (missing.length > 0) {
    return { matched: false, reason: `缺少内部符号: ${missing.join(', ')}` };
  }

  return {
    matched: true,
    startIdx,
    endIdx,
    compName: headMatch[1],
    reactVar: reactMatch[1],
    ctxHook: ctxMatch[1],
    runStatusHook: runMatch[1],
    enumObj: runMatch[2],
    animHook: animMatch[1],
    featHook: featMatch ? featMatch[1] : '',
    shimmerComp: shimmerMatch[1],
    headerComp: headerMatch[1],
    collapseComp: collapseMatch[1]
  };
}

/**
 * 模块 C 抗混淆定位器（Markdown 表格智能自适应与菜单汉化，兼容 1.11.0 ckc-mkc / 1.12.0 Crc-Mrc 及任意混淆名）
 */
function locateTableModule(code) {
  if (typeof code !== 'string') return { matched: false, reason: '无效源码' };
  const pillCssTarget = 'min-width: calc-size(max-content, min(size, 20ch));';
  const hasPillCss = code.includes(pillCssTarget);

  // 1. 定位测量与分配函数组 (ckc/dkc/ekc 或 Crc/Drc/Erc)
  const measureMatch = findByAnchorRegex(
    code,
    'querySelector(":scope > table")',
    /function ([A-Za-z_$][\w$]*)\(a\)\{var b=a\.querySelector\(":scope > table"\);/,
    40,
    20
  );
  if (!measureMatch) {
    return { matched: false, reason: '未找到表格列宽测量函数 (:scope > table)' };
  }
  const measureStart = measureMatch.index;
  const measureFn = measureMatch[1];

  const tailAfterMeasure = code.slice(measureStart, measureStart + 2500);
  const allocMatch = /function ([A-Za-z_$][\w$]*)\(a,b\)\{var c=new Map;/.exec(tailAfterMeasure);
  const eqMatch = /function ([A-Za-z_$][\w$]*)\(a,b\)\{return a\.length===b\.length/.exec(tailAfterMeasure);
  if (!allocMatch || !eqMatch) {
    return { matched: false, reason: '未找到表格分配或相等比较函数 (dkc/ekc)' };
  }
  const allocFn = allocMatch[1];
  const eqFn = eqMatch[1];
  const eqStart = measureStart + eqMatch.index;

  // 2. 定位主表格组件 (lkc / Lrc) 与操作菜单组件 (mkc / Mrc)
  const tableMatch = findByAnchorRegex(
    code,
    '({node:a,staggerStyle:b,...c}){',
    /function ([A-Za-z_$][\w$]*)\(\{node:a,staggerStyle:b,\.\.\.c\}\)\{/,
    40,
    20
  );
  if (!tableMatch) {
    return { matched: false, reason: '未找到 Markdown 表格主渲染组件签名' };
  }
  const tableStart = tableMatch.index;
  const tableComp = tableMatch[1];

  const menuWin = code.slice(tableStart, tableStart + 8000);
  const menuMatch = /function ([A-Za-z_$][\w$]*)\(\{widthMode:a,disabled:b=!1,onWidthModeChange:c,getMarkdown:d\}\)\{/.exec(menuWin);
  if (!menuMatch) {
    return { matched: false, reason: '未找到 Markdown 表格操作菜单组件签名' };
  }
  const menuComp = menuMatch[1];
  const menuStartAbs = tableStart + menuMatch.index;
  const menuOpenBrace = menuStartAbs + menuMatch[0].length - 1;
  const menuCloseBrace = findMatchingBraceEnd(code, menuOpenBrace);
  if (menuCloseBrace === -1) {
    return { matched: false, reason: '表格菜单组件花括号未闭合' };
  }
  const menuEnd = code[menuCloseBrace + 1] === ';' ? menuCloseBrace + 2 : menuCloseBrace + 1;
  const body = code.slice(tableStart, menuEnd);

  // 3. 动态提取内部全部耦合 UI 与工具符号
  const reactMatch = /\(0,([A-Za-z_$][\w$]*)\.useRef\)\(null\)/.exec(body);
  const bleedMatch = /\((?:[A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\(L\)\)&&[A-Za-z_$][\w$]*\.observe\(/.exec(body) ||
    /var [A-Za-z_$][\w$]*=([A-Za-z_$][\w$]*)\(L\),/.exec(body);
  const cnMatch = /className:([A-Za-z_$][\w$]*)\("group\/md-table/.exec(body);
  const toMdMatch = /getMarkdown:\(\)=>g\.current\?([A-Za-z_$][\w$]*)\(g\.current\):""/.exec(body);
  const maskMatch = /style:([A-Za-z_$][\w$]*)\(w\)/.exec(body);
  const copyMatch = /\{copied:h,copy:k\}=([A-Za-z_$][\w$]*)\(\)/.exec(body);
  const menuRootMatch = /\.createElement\(([A-Za-z_$][\w$]*),\{open:f,onOpenChange:g\}/.exec(body);
  const menuTriggerMatch = /\.createElement\(([A-Za-z_$][\w$]*),\{asChild:!0\}/.exec(body);
  const btnMatch = /\.createElement\(([A-Za-z_$][\w$]*),\{variant:"muted",size:"custom"/.exec(body);
  const iconMatch = /\.createElement\(([A-Za-z_$][\w$]*),\{name:h\?"check":"more_vert"/.exec(body);
  const menuContentMatch = /\.createElement\(([A-Za-z_$][\w$]*),\{side:"bottom",align:"end"/.exec(body);
  const menuItemMatch = /\.createElement\(([A-Za-z_$][\w$]*),\{onClick:\(\)=>\{k\(d\(\)\);g\(!1\)\}/.exec(body);

  const missing = [];
  if (!reactMatch) missing.push('reactVar');
  if (!bleedMatch) missing.push('bleedFn');
  if (!cnMatch) missing.push('cnFn');
  if (!toMdMatch) missing.push('toMdFn');
  if (!maskMatch) missing.push('maskFn');
  if (!copyMatch) missing.push('copyHook');
  if (!menuRootMatch) missing.push('menuRoot');
  if (!menuTriggerMatch) missing.push('menuTrigger');
  if (!btnMatch) missing.push('btnComp');
  if (!iconMatch) missing.push('iconComp');
  if (!menuContentMatch) missing.push('menuContent');
  if (!menuItemMatch) missing.push('menuItem');
  if (!hasPillCss) missing.push('.inline-pill-wrap(20ch)');

  if (missing.length > 0) {
    return { matched: false, reason: `缺少内部符号: ${missing.join(', ')}` };
  }

  return {
    matched: true,
    measureStart,
    eqStart,
    tableStart,
    menuEnd,
    measureFn,
    allocFn,
    eqFn,
    tableComp,
    menuComp,
    reactVar: reactMatch[1],
    bleedFn: bleedMatch[1],
    cnFn: cnMatch[1],
    toMdFn: toMdMatch[1],
    maskFn: maskMatch[1],
    copyHook: copyMatch[1],
    menuRoot: menuRootMatch[1],
    menuTrigger: menuTriggerMatch[1],
    btnComp: btnMatch[1],
    iconComp: iconMatch[1],
    menuContent: menuContentMatch[1],
    menuItem: menuItemMatch[1],
    hasPillCss,
    pillCssTarget
  };
}

// =========================================================================
// 2. 抗混淆定位与注入原语
// =========================================================================

/**
 * 探测 extension.js 中的 Webview 代理注入点（抗混淆版本，免疫内部 helper 改名）
 */
function locateExtensionWebviewHook(extCode) {
  if (typeof extCode !== 'string' || !extCode) {
    return { matched: false, alreadyHooked: false, offset: -1, urlArg: '', signature: '' };
  }
  const hookedIdx = extCode.indexOf(EXTENSION_HOOK_MARKER);
  if (hookedIdx !== -1 && extCode.includes('hub_proxy')) {
    return { matched: true, alreadyHooked: true, offset: hookedIdx, urlArg: '', signature: EXTENSION_HOOK_MARKER };
  }
  const m = EXTENSION_HOOK_REGEX.exec(extCode);
  if (m) {
    return {
      matched: true,
      alreadyHooked: false,
      offset: m.index,
      urlArg: m[3],
      signature: m[0]
    };
  }
  return { matched: false, alreadyHooked: false, offset: -1, urlArg: '', signature: '' };
}

/**
 * 向 extension.js 动态注入 Webview 代理重定向钩子，并精确汉化原生弹窗提示
 */
function injectExtensionWebviewHook(extCode) {
  const loc = locateExtensionWebviewHook(extCode);
  if (!loc.matched) {
    return { ok: false, changed: false, code: extCode, reason: '未匹配到 renderWebviewHtml(..., bridge.js) 方法签名' };
  }
  let code = extCode;
  let changed = false;
  let hookAdded = false;
  if (!loc.alreadyHooked) {
    const insertPos = loc.offset + loc.signature.length;
    const injection = `try{${loc.urlArg}=require("../hub_proxy.js").redirectIframeUrl(${loc.urlArg})}catch(_e){}`;
    code = code.slice(0, insertPos) + injection + code.slice(insertPos);
    changed = true;
    hookAdded = true;
  }

  let runtimeMsgHits = 0;
  for (const [fromStr, toStr] of EXTENSION_RUNTIME_MESSAGES) {
    if (code.includes(fromStr)) {
      const parts = code.split(fromStr);
      runtimeMsgHits += parts.length - 1;
      code = parts.join(toStr);
      changed = true;
    }
  }

  return {
    ok: true,
    changed,
    alreadyHooked: loc.alreadyHooked && !changed,
    hookAdded,
    runtimeMsgHits,
    code,
    urlArg: loc.urlArg,
    offset: loc.offset
  };
}

function getConfigPropGroups(pkg) {
  const cfg = pkg && pkg.contributes ? pkg.contributes.configuration : null;
  if (!cfg) return [];
  if (Array.isArray(cfg)) {
    return cfg.map(c => (c && c.properties && typeof c.properties === 'object' ? c.properties : null)).filter(Boolean);
  }
  if (cfg.properties && typeof cfg.properties === 'object') return [cfg.properties];
  return [];
}

/**
 * 通用内置扩展 package.json 汉化器（按 command ID + title 双保险映射，同时覆盖子菜单、自定义编辑器、视图和设置描述）
 */
function localizeExtensionPackageObject(extId, pkg) {
  const spec = EXTENSION_MANIFEST_TRANSLATIONS[extId];
  if (!spec || !pkg || !pkg.contributes) return { modified: false, applied: 0 };
  let applied = 0;

  if (Array.isArray(pkg.contributes.commands)) {
    for (const cmd of pkg.contributes.commands) {
      let zh = spec.commandsById && spec.commandsById[cmd.command];
      if (!zh && extId === 'agy' && agyCommandsMap[cmd.title]) {
        zh = agyCommandsMap[cmd.title];
      }
      if (zh && cmd.title !== zh) {
        cmd.title = zh;
        applied++;
      }
    }
  }

  if (spec.submenusById && Array.isArray(pkg.contributes.submenus)) {
    for (const sm of pkg.contributes.submenus) {
      const zh = spec.submenusById[sm.id];
      if (zh && sm.label !== zh) {
        sm.label = zh;
        applied++;
      }
    }
  }

  if (spec.customEditorsByViewType && Array.isArray(pkg.contributes.customEditors)) {
    for (const ed of pkg.contributes.customEditors) {
      const zh = spec.customEditorsByViewType[ed.viewType];
      if (zh && ed.displayName !== zh) {
        ed.displayName = zh;
        applied++;
      }
    }
  }

  if (spec.viewsById && pkg.contributes.views && typeof pkg.contributes.views === 'object') {
    for (const list of Object.values(pkg.contributes.views)) {
      if (!Array.isArray(list)) continue;
      for (const v of list) {
        const zh = spec.viewsById[v.id];
        if (zh && v.name !== zh) {
          v.name = zh;
          applied++;
        }
      }
    }
  }

  if (spec.settingsByKey) {
    for (const props of getConfigPropGroups(pkg)) {
      for (const [key, patchFields] of Object.entries(spec.settingsByKey)) {
        const prop = props[key];
        if (!prop || typeof prop !== 'object') continue;
        for (const field of ['description', 'markdownDeprecationMessage', 'deprecationMessage']) {
          if (patchFields[field] && typeof prop[field] === 'string' && prop[field] !== patchFields[field]) {
            prop[field] = patchFields[field];
            applied++;
          }
        }
      }
    }
  }

  return { modified: applied > 0, applied };
}

/**
 * 诚实核验单个扩展 package.json 的汉化覆盖状态（绝不允许 totalMapped === 0 蒙混通过）
 */
function inspectExtensionPackageLocalization(extId, pkgContent) {
  const spec = EXTENSION_MANIFEST_TRANSLATIONS[extId];
  if (!spec) return { ok: false, localized: 0, total: 0 };
  try {
    const pkg = JSON.parse(pkgContent);
    if (!pkg || !pkg.contributes) return { ok: false, localized: 0, total: 0 };
    let total = 0;
    let localized = 0;

    if (Array.isArray(pkg.contributes.commands)) {
      for (const cmd of pkg.contributes.commands) {
        const zh = spec.commandsById && spec.commandsById[cmd.command];
        if (zh) {
          total++;
          if (cmd.title === zh) localized++;
        }
      }
    }
    if (spec.submenusById && Array.isArray(pkg.contributes.submenus)) {
      for (const sm of pkg.contributes.submenus) {
        const zh = spec.submenusById[sm.id];
        if (zh) {
          total++;
          if (sm.label === zh) localized++;
        }
      }
    }
    if (spec.customEditorsByViewType && Array.isArray(pkg.contributes.customEditors)) {
      for (const ed of pkg.contributes.customEditors) {
        const zh = spec.customEditorsByViewType[ed.viewType];
        if (zh) {
          total++;
          if (ed.displayName === zh) localized++;
        }
      }
    }
    if (spec.viewsById && pkg.contributes.views && typeof pkg.contributes.views === 'object') {
      for (const list of Object.values(pkg.contributes.views)) {
        if (!Array.isArray(list)) continue;
        for (const v of list) {
          const zh = spec.viewsById[v.id];
          if (zh) {
            total++;
            if (v.name === zh) localized++;
          }
        }
      }
    }
    if (spec.settingsByKey) {
      for (const props of getConfigPropGroups(pkg)) {
        for (const [key, patchFields] of Object.entries(spec.settingsByKey)) {
          const prop = props[key];
          if (!prop || typeof prop !== 'object') continue;
          for (const field of ['description', 'markdownDeprecationMessage', 'deprecationMessage']) {
            if (patchFields[field] && typeof prop[field] === 'string') {
              total++;
              if (prop[field] === patchFields[field]) localized++;
            }
          }
        }
      }
    }

    return { ok: total > 0 && localized === total, localized, total };
  } catch (_e) {
    return { ok: false, localized: 0, total: 0 };
  }
}

function isAgyPackageLocalized(pkgContent) {
  return inspectExtensionPackageLocalization('agy', pkgContent).ok;
}

function isAgyPackageHasAnyLocalized(pkgContent) {
  return inspectExtensionPackageLocalization('agy', pkgContent).localized > 0;
}

function isExtensionPackageHasAnyLocalized(extId, pkgContent) {
  return inspectExtensionPackageLocalization(extId, pkgContent).localized > 0;
}

function checkAllBuiltInExtensionsLocalized(appDir) {
  const results = [];
  for (const extId of Object.keys(EXTENSION_MANIFEST_TRANSLATIONS)) {
    const pkgPath = path.join(appDir, 'extensions', extId, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const status = inspectExtensionPackageLocalization(extId, fs.readFileSync(pkgPath, 'utf8'));
    results.push({ extId, pkgPath, ...status });
  }
  const allOk = results.length > 0 && results.every(r => r.ok);
  const totalItems = results.reduce((s, r) => s + r.total, 0);
  const localizedItems = results.reduce((s, r) => s + r.localized, 0);
  return { ok: allOk, results, totalItems, localizedItems };
}

function checkBrowserOnboardingLocalized(appDir) {
  const staticDir = path.join(appDir, 'out', 'vs', 'platform', 'browserOnboarding', 'static');
  const results = [];
  for (const [fileName, marker] of Object.entries(BROWSER_ONBOARDING_MARKERS)) {
    const fullPath = path.join(staticDir, fileName);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    results.push({ fileName, fullPath, ok: content.includes(marker) });
  }
  return {
    ok: results.length > 0 && results.every(r => r.ok),
    results
  };
}

/**
 * 组合计算构建引擎与共享 UI 词库/清洗器源码指纹（任何一处变更都会触发热/冷重编）
 */
function computeBuildEngineFingerprint(patchDir) {
  const files = [
    path.join(patchDir, 'build_ultimate_chinese_engine.js'),
    path.join(patchDir, 'src', 'ui_dictionary.js'),
    path.join(patchDir, 'src', 'dom_cleaner.js')
  ];
  const hash = crypto.createHash('sha256');
  for (const fp of files) {
    hash.update(path.basename(fp));
    hash.update('\0');
    if (fs.existsSync(fp)) {
      hash.update(fs.readFileSync(fp));
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

function isWorkbenchPatched(content) {
  return (
    typeof content === 'string' &&
    content.includes(WORKBENCH_PATCHED_MARKER) &&
    !findByAnchorRegex(content, '?.annotations?.title?.trim()', WORKBENCH_TITLE_FN_REGEX, 60, 120)
  );
}

function isJetskiPatched(content) {
  if (typeof content !== 'string') return false;
  if (!content.includes(WORKBENCH_PATCHED_MARKER)) return false;
  const hasUen = Boolean(
    findByAnchorRegex(
      content,
      '||"Untitled Conversation"',
      /[A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\)\|\|[A-Za-z_$][\w$]*\.summary\|\|"Untitled Conversation"/,
      60,
      20
    )
  );
  const hasSma = Boolean(
    findByAnchorRegex(
      content,
      '.cascadeId,label:(',
      /label:\([A-Za-z_$][\w$]*\([A-Za-z_$][\w$]*\)\|\|[A-Za-z_$][\w$]*\.title\)/,
      20,
      80
    )
  );
  const hasThoughts =
    content.includes('已思考 ${Math.max(1,') &&
    content.includes('思考了 ${Math.max(1,Number(') &&
    content.includes('children:"正在思考..."');
  const hasDomCleaner = content.includes(DOM_CLEANER_V2_MARKER) && content.includes('window.__agyDomCleanerV2');
  return hasUen && hasSma && hasThoughts && hasDomCleaner;
}

function isJetskiHasAnyPatch(content) {
  if (typeof content !== 'string') return false;
  return (
    content.includes(WORKBENCH_PATCHED_MARKER) ||
    content.includes(DOM_CLEANER_V2_MARKER) ||
    content.includes('已思考 ${Math.max(1,') ||
    content.includes('children:"正在思考..."')
  );
}

function filesAreIdentical(fileA, fileB) {
  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) return false;
  try {
    return Buffer.compare(fs.readFileSync(fileA), fs.readFileSync(fileB)) === 0;
  } catch (_e) {
    return false;
  }
}

/**
 * 解析当前可用的官方 Hub 静态源 hub_main.js（优先扩展目录最新捕获源，否则回退项目根目录源）
 */
function resolveHubSourcePath(agyExtDir, patchDir) {
  const livePath = path.join(agyExtDir, 'hub_main.js');
  const localPath = path.join(patchDir, 'hub_main.js');
  if (fs.existsSync(livePath)) return livePath;
  return localPath;
}

/**
 * 读取当前已安装 Antigravity IDE 的完整 4 维版本身份：
 * - appVersion / distro（VS Code 基座）
 * - ideVersion（Antigravity IDE 上层版本，来自 product.json）
 * - agyVersion（核心 agy 扩展版本，来自 extensions/agy/package.json）
 */
function readInstalledAppIdentity(appDir) {
  const result = {
    appVersion: '',
    distro: '',
    ideVersion: '',
    agyVersion: ''
  };
  if (!appDir) return result;

  const pkgPath = path.join(appDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      result.appVersion = pkg.version || '';
      result.distro = pkg.distro || '';
    } catch (_e) {}
  }

  const productPath = path.join(appDir, 'product.json');
  if (fs.existsSync(productPath)) {
    try {
      const prod = JSON.parse(fs.readFileSync(productPath, 'utf8'));
      result.ideVersion = prod.ideVersion || prod.antigravityVersion || '';
    } catch (_e) {}
  }

  const agyPkgPath = path.join(appDir, 'extensions', 'agy', 'package.json');
  if (fs.existsSync(agyPkgPath)) {
    try {
      const agyPkg = JSON.parse(fs.readFileSync(agyPkgPath, 'utf8'));
      result.agyVersion = agyPkg.version || '';
    } catch (_e) {}
  }

  return result;
}

/**
 * 格式化可读的版本展示串
 */
function formatAppIdentity(identity) {
  if (!identity) return '未知版本';
  const parts = [];
  if (identity.ideVersion) parts.push(`IDE v${identity.ideVersion}`);
  if (identity.agyVersion) parts.push(`agy v${identity.agyVersion}`);
  const vsPart = identity.appVersion
    ? `VS Code v${identity.appVersion}${identity.distro ? ` / ${String(identity.distro).slice(0, 10)}` : ''}`
    : '';
  if (vsPart) parts.push(`(${vsPart})`);
  return parts.length > 0 ? parts.join(' ') : '未知版本';
}

/**
 * 跨版本防污染安全备份：
 * - 若当前线上文件不含我们的补丁痕迹，说明它是官方原始文件（或官方刚升级的新版原件），
 *   则强制同步刷新 .bak，彻底杜绝“用旧版本 .bak 覆盖新版官方文件”的致命隐患。
 * - 若当前线上文件已含补丁痕迹且 .bak 已存在，保留原 .bak 以保证幂等反复重注入。
 */
function ensureFreshBackup(filePath, isPatchedPredicate, logger) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { existed: false, refreshed: false, backupPath: filePath ? filePath + '.bak' : '' };
  }
  const backupPath = filePath + '.bak';
  const content = fs.readFileSync(filePath, 'utf8');
  const alreadyPatched = typeof isPatchedPredicate === 'function' ? Boolean(isPatchedPredicate(content)) : false;

  if (!alreadyPatched) {
    const needRefresh = !fs.existsSync(backupPath) || !filesAreIdentical(filePath, backupPath);
    if (needRefresh) {
      fs.copyFileSync(filePath, backupPath);
      if (logger) {
        logger(`[备份] 已更新纯净官方原件备份: ${path.basename(filePath)}.bak`);
      }
      return { existed: true, refreshed: true, backupPath };
    }
  } else if (!fs.existsSync(backupPath)) {
    return { existed: true, refreshed: false, backupPath, missingBackup: true };
  }

  return { existed: true, refreshed: false, backupPath };
}

/**
 * 构造注入 workbench / jetskiAgent 的会话标题中文化引擎代码（支持动态函数名）
 */
function buildZhTitleEngine(funcName) {
  const merged = loadCache();
  const idToZh = {
    ...(merged.idToZh || {})
  };
  const phraseToZh = {
    ...(merged.enToZh || {}),
    'Change Software Language To Chinese': '软件界面中文化设置',
    'Search Interface Conversation Title Localization': '搜索界面会话标题中文化'
  };
  const lowerToZh = {};
  for (const [k, v] of Object.entries(phraseToZh)) {
    if (typeof k === 'string' && typeof v === 'string') {
      lowerToZh[k.toLowerCase().trim()] = v;
    }
  }

  return `function ${funcName}(t){
  var _raw = t?.annotations?.title?.trim() || t?.summary?.trim() || t?.title?.trim() || (typeof t==='string'?t.trim():void 0);
  if (!_raw) return void 0;
  if (/[\\u4e00-\\u9fa5]/.test(_raw)) return _raw;
  if (_raw === "Untitled Conversation") return "未命名对话";
  if (_raw === "New Conversation") return "新对话";
  if (_raw === "Coordinator") return "智能体助手";
  if (_raw === "Parent Conversation") return "父级对话";
  var _im = ${JSON.stringify(idToZh)};
  var _pm = ${JSON.stringify(phraseToZh)};
  var _pmLow = ${JSON.stringify(lowerToZh)};
  var _cid = t?.cascadeId || t?.id;
  if (_cid && _im[_cid]) return _im[_cid];
  if (_pm[_raw]) return _pm[_raw];
  var _low = _raw.toLowerCase().trim();
  if (_pmLow[_low]) return _pmLow[_low];
  var _am = {
    add:'添加',analyze:'分析',analysis:'分析',audit:'审计',automate:'自动化',backup:'备份',
    block:'拦截',blocker:'拦截器',build:'构建',bypass:'绕过',change:'修改',check:'检查',
    clean:'清理',cleanup:'清理',compile:'编译',configure:'配置',config:'配置',connect:'连接',
    control:'控制',convert:'转换',copy:'复制',create:'创建',custom:'自定义',debug:'调试',
    delete:'删除',deploy:'部署',deployment:'部署',design:'设计',detect:'检测',detection:'检测',
    develop:'开发',development:'开发',diagnose:'诊断',disable:'禁用',download:'下载',edit:'编辑',
    enable:'启用',enhance:'增强',execute:'执行',export:'导出',extract:'提取',fix:'修复',
    generate:'生成',handle:'处理',implement:'实现',import:'导入',improve:'改进',inject:'注入',
    inspect:'审查',install:'安装',integrate:'集成',intercept:'拦截',investigate:'排查',
    launch:'启动',localize:'中文化',localization:'本地化',locate:'定位',lock:'锁定',login:'登录',
    manage:'管理',merge:'合并',migrate:'迁移',missing:'缺失',modify:'修改',monitor:'监控',
    optimize:'优化',optimization:'优化',parse:'解析',patch:'修补',plan:'规划',preview:'预览',
    publish:'发布',query:'查询',read:'读取',rebuild:'重建',recover:'恢复',redirect:'重定向',
    refactor:'重构',refresh:'刷新',remove:'移除',rename:'重命名',render:'渲染',repair:'修复',
    replace:'替换',reset:'重置',resolve:'解决',restore:'还原',retrieve:'检索',review:'审查',
    run:'运行',save:'保存',scan:'扫描',search:'检索',setup:'配置',solve:'解决',start:'启动',
    stop:'停止',summarize:'总结',summary:'总结',switch:'切换',sync:'同步',test:'测试',
    testing:'测试',track:'跟踪',tracking:'跟踪',translate:'翻译',troubleshoot:'排错',
    unlock:'解锁',update:'更新',upgrade:'升级',verify:'验证',watch:'监听',write:'写入'
  };
  var _nm = {
    account:'账户',agent:'智能体',android:'安卓',api:'API',app:'应用',application:'应用程序',
    architecture:'架构',archive:'归档',artifact:'文档',auth:'认证',backend:'后端',
    browser:'浏览器',bug:'Bug',cache:'缓存',chat:'对话',chrome:'Chrome',client:'客户端',
    cloud:'云端',code:'代码',command:'命令',component:'组件',config:'配置',console:'控制台',
    container:'容器',context:'上下文',conversation:'对话',cookie:'Cookie',crash:'崩溃',
    data:'数据',database:'数据库',desktop:'桌面',device:'设备',docker:'Docker',doc:'文档',
    document:'文档',dom:'DOM',domain:'域名',editor:'编辑器',engine:'引擎',environment:'环境',
    error:'错误',exception:'异常',expense:'支出',extension:'扩展',feature:'特性',file:'文件',
    folder:'文件夹',form:'表单',framework:'框架',frontend:'前端',game:'游戏',gesture:'手势',
    git:'Git',guide:'指南',history:'历史',hook:'钩子',host:'宿主',icon:'图标',ide:'IDE',
    image:'图片',input:'输入',interface:'界面',issue:'问题',java:'Java',javascript:'JavaScript',
    json:'JSON',key:'密钥',keyboard:'键盘',language:'语言',launcher:'启动器',layout:'布局',
    link:'链接',log:'日志',logic:'逻辑',manga:'漫画',markdown:'Markdown',memory:'内存',
    menu:'菜单',message:'消息',metadata:'元数据',mod:'模组',mode:'模式',model:'模型',
    module:'模块',network:'网络',node:'Node',notification:'通知',novel:'小说',page:'页面',
    panel:'面板',path:'路径',performance:'性能',permission:'权限',permissions:'权限',
    platform:'平台',plugin:'插件',policy:'策略',port:'端口',process:'进程',project:'项目',
    prompt:'提示词',proxy:'代理',python:'Python',queue:'队列',quota:'配额',react:'React',
    request:'请求',resource:'资源',response:'响应',route:'路由',rule:'规则',rules:'规则',
    russian:'俄语',sandbox:'沙盒',screen:'页面',script:'脚本',security:'安全',
    sensitivity:'灵敏度',server:'服务器',service:'服务',session:'会话',setting:'设置',
    shortcut:'快捷键',sidebar:'侧边栏',skill:'技能',slide:'滑动',software:'软件',
    source:'源码',sqlite:'SQLite',state:'状态',status:'状态',storage:'存储',string:'字符串',
    subagent:'子智能体',system:'系统',tab:'标签页',table:'表格',task:'任务',template:'模板',
    terminal:'终端',text:'文本',theme:'主题',timeout:'超时',title:'标题',token:'Token',
    tool:'工具',tools:'工具',touch:'触控',ui:'界面',url:'URL',user:'用户',version:'版本',
    view:'视图',warning:'警告',web:'Web',webpage:'网页',website:'网站',webview:'Webview',
    wechat:'微信',window:'窗口',windows:'Windows',workflow:'工作流',workspace:'工作区'
  };
  var _ppm = {and:'与',to:'为',for:'针对',in:'中',with:'配合',of:'的',on:'上',from:'来自'};
  var _lookup = function(_lw) {
    if (_am[_lw]) return _am[_lw];
    if (_nm[_lw]) return _nm[_lw];
    if (_lw.endsWith('ies') && _lw.length > 4) { var _b1 = _lw.slice(0,-3)+'y'; if (_am[_b1]||_nm[_b1]) return _am[_b1]||_nm[_b1]; }
    if (_lw.endsWith('ing') && _lw.length > 5) { var _b2 = _lw.slice(0,-3); if (_am[_b2]||_nm[_b2]) return _am[_b2]||_nm[_b2]; if (_am[_b2+'e']||_nm[_b2+'e']) return _am[_b2+'e']||_nm[_b2+'e']; }
    if (_lw.endsWith('ed') && _lw.length > 4) { var _b3 = _lw.slice(0,-2); if (_am[_b3]||_nm[_b3]) return _am[_b3]||_nm[_b3]; if (_am[_b3+'e']||_nm[_b3+'e']) return _am[_b3+'e']||_nm[_b3+'e']; }
    if (_lw.endsWith('s') && _lw.length > 3) { var _b4 = _lw.slice(0,-1); if (_am[_b4]||_nm[_b4]) return _am[_b4]||_nm[_b4]; }
    return null;
  };
  var _w = _raw.split(/\\s+/);
  var _res = [];
  var _hit = 0;
  for (var _i = 0; _i < _w.length; _i++) {
    var _word = _w[_i];
    var _clean = _word.toLowerCase().replace(/[^a-z0-9]/g, '');
    var _hitWord = _lookup(_clean);
    if (_hitWord) { _res.push(_hitWord); _hit++; }
    else if (_ppm[_clean]) { _res.push(_ppm[_clean]); }
    else { _res.push(_word); }
  }
  if (_hit > 0 && _hit * 2 >= _w.length) {
    var _fin = '';
    for (var _j = 0; _j < _res.length; _j++) {
      var _tk = _res[_j];
      if (!_tk) continue;
      if (!_fin) { _fin = _tk; continue; }
      var _pCh = _fin[_fin.length - 1], _nCh = _tk[0];
      if ((/[A-Za-z0-9]/.test(_pCh) && /[A-Za-z0-9]/.test(_nCh)) ||
          (/[A-Za-z0-9]/.test(_pCh) && /[\\u4e00-\\u9fa5]/.test(_nCh)) ||
          (/[\\u4e00-\\u9fa5]/.test(_pCh) && /[A-Za-z0-9]/.test(_nCh))) {
        _fin += ' ' + _tk;
      } else {
        _fin += _tk;
      }
    }
    _fin = _fin.length > 36 ? _fin.slice(0, 36).trim() : _fin;
    return _fin;
  }
  return _raw;
}`;
}

/**
 * 抗混淆注入 workbench.desktop.main.js（窄窗口锚点匹配，~2ms 完成，不再写死 yhn）
 */
function patchWorkbenchContent(wbCode) {
  const m = findByAnchorRegex(wbCode, '?.annotations?.title?.trim()', WORKBENCH_TITLE_FN_REGEX, 60, 120);
  if (m) {
    const fnName = m[1];
    const patched = wbCode.slice(0, m.index) + buildZhTitleEngine(fnName) + wbCode.slice(m.index + m[0].length);
    return { ok: true, changed: true, fnName, code: patched };
  }
  if (isWorkbenchPatched(wbCode)) {
    return { ok: true, changed: false, fnName: '', code: wbCode };
  }
  return { ok: false, changed: false, fnName: '', code: wbCode };
}

/**
 * 抗混淆注入 jetskiAgent/main.js（窄窗口锚点匹配，~3ms 完成，动态捕获函数与变量名）
 */
function patchJetskiContent(jkCode) {
  let code = jkCode;
  let changed = false;
  let fnName = '';
  let uenHit = false;
  let smaHit = false;
  let thoughtHits = 0;

  const fnMatch = findByAnchorRegex(code, '?.annotations?.title?.trim()', JETSKI_TITLE_FN_REGEX, 60, 120);
  if (fnMatch) {
    fnName = fnMatch[1];
    code = code.slice(0, fnMatch.index) + buildZhTitleEngine(fnName) + code.slice(fnMatch.index + fnMatch[0].length);
    changed = true;
  }

  if (fnName) {
    const uenMatch = findByAnchorRegex(code, '.summary||"Untitled Conversation";', JETSKI_UEN_REGEX, 40, 20);
    if (uenMatch) {
      const rep = `let ${uenMatch[1]}=${fnName}(${uenMatch[2]})||${uenMatch[2]}.summary||"Untitled Conversation";`;
      code = code.slice(0, uenMatch.index) + rep + code.slice(uenMatch.index + uenMatch[0].length);
      uenHit = true;
      changed = true;
    }

    const smaMatch = findByAnchorRegex(code, '.cascadeId,label:', JETSKI_SMA_REGEX, 40, 50);
    if (smaMatch) {
      const rep = `item:{id:${smaMatch[1]}.cascadeId,label:(${fnName}(${smaMatch[1]})||${smaMatch[1]}.title),`;
      code = code.slice(0, smaMatch.index) + rep + code.slice(smaMatch.index + smaMatch[0].length);
      smaHit = true;
      changed = true;
    }
  }

  const r1 = replaceAllByAnchorRegex(
    code,
    '>=0?`Thinking for ${Math.max(1,',
    JETSKI_THINKING_FOR_REGEX,
    (m) => `${m[1]}>=0?\`已思考 \${Math.max(1,${m[1]})} 秒\`:"正在思考"`,
    24,
    80
  );
  if (r1.count > 0) {
    code = r1.code;
    thoughtHits += r1.count;
    changed = true;
  }

  const r2 = replaceAllByAnchorRegex(
    code,
    '?`Thought for ${Math.max(1,Number(',
    JETSKI_THOUGHT_FOR_REGEX,
    (m) => `${m[1]}?\`思考了 \${Math.max(1,Number(${m[1]}.seconds))} 秒\`:"思考过程"`,
    24,
    90
  );
  if (r2.count > 0) {
    code = r2.code;
    thoughtHits += r2.count;
    changed = true;
  }

  if (code.includes(JETSKI_THINKING_DOTS_TARGET)) {
    const parts = code.split(JETSKI_THINKING_DOTS_TARGET);
    thoughtHits += parts.length - 1;
    code = parts.join('children:"正在思考..."');
    changed = true;
  }

  // 挂载共享全量 DOM 清洗引擎 v2（实现独立 Agent Manager 窗口全界面汉化，且不破坏末尾 sourceMappingURL）
  let domCleanerAttached = false;
  if (!code.includes(DOM_CLEANER_V2_MARKER)) {
    const cleanerBlock = '\n;' + buildDomCleanerRuntimeScript() + '\n';
    const smIdx = code.lastIndexOf('//# sourceMappingURL=');
    if (smIdx !== -1) {
      code = code.slice(0, smIdx) + cleanerBlock + code.slice(smIdx);
    } else {
      code = code + cleanerBlock;
    }
    domCleanerAttached = true;
    changed = true;
  }

  return {
    ok: changed || isJetskiPatched(code),
    changed,
    fnName,
    uenHit,
    smaHit,
    thoughtHits,
    domCleanerAttached,
    code
  };
}

/**
 * 安全清理 Electron V8 字节码缓存（忽略被运行中进程占用的文件，不强杀 IDE）
 */
function safelyClearV8Cache(cachedDataDir, logger) {
  if (!cachedDataDir || !fs.existsSync(cachedDataDir)) return { cleared: 0, skipped: 0 };
  let cleared = 0;
  let skipped = 0;
  try {
    const entries = fs.readdirSync(cachedDataDir);
    for (const entry of entries) {
      const fullPath = path.join(cachedDataDir, entry);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        cleared++;
      } catch (_e) {
        skipped++;
      }
    }
  } catch (_e) {}
  if (logger && cleared > 0) {
    logger(`✔ [缓存清理] 已安全清理 V8 字节码缓存 ${cleared} 项${skipped > 0 ? `（跳过正在占用的 ${skipped} 项）` : ''}`);
  }
  return { cleared, skipped };
}

/**
 * 读取 build_ultimate_chinese_engine.js 产出的模块状态报告（供分级降级诊断使用）
 */
function parseBuildModuleReport(agyExtDir) {
  const reportPath = path.join(agyExtDir, '.agy_build_report.json');
  if (!fs.existsSync(reportPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/**
 * 统一全量注入流水线（供 patcher.js 与 auto_updater.js 共用）
 */
function applyAllPatches(options = {}) {
  const patchDir = path.resolve(options.patchDir || path.join(__dirname, '..'));
  const logger = typeof options.logger === 'function' ? options.logger : (msg) => console.log(msg);
  const stdio = options.buildStdio || 'inherit';

  const {
    installDir,
    appDir,
    agyExtDir,
    cachedDataDir,
    productJsonPath,
    agyExtPackagePath
  } = getTargetPaths();

  if (!fs.existsSync(installDir)) {
    throw new Error(`未找到 Antigravity IDE 安装目录: ${installDir}`);
  }

  const outDir = path.join(appDir, 'out');
  const extJsPath = path.join(agyExtDir, 'vscode', 'extension.js');
  const liveHubMainPath = path.join(agyExtDir, 'hub_main.js');
  const localHubMainPath = path.join(patchDir, 'hub_main.js');
  const wbPath = path.join(outDir, 'vs', 'workbench', 'workbench.desktop.main.js');
  const jkPath = path.join(outDir, 'jetskiAgent', 'main.js');

  // 1. 同步扩展目录中最新捕获的官方 hub_main.js（避免旧工作区缓存遮蔽新版本原件）
  if (fs.existsSync(liveHubMainPath)) {
    if (!fs.existsSync(localHubMainPath) || !filesAreIdentical(liveHubMainPath, localHubMainPath)) {
      fs.copyFileSync(liveHubMainPath, localHubMainPath);
      logger(`✔ [资产同步] 已同步当前官方 hub_main.js 至本地构建源 (${(fs.statSync(localHubMainPath).size / 1024 / 1024).toFixed(2)} MB)`);
    }
  }

  // 2. 跨版本安全备份关键文件（若检测到官方新版覆盖，自动刷新 .bak）
  const extBackupInfo = ensureFreshBackup(
    extJsPath,
    c => c.includes(EXTENSION_HOOK_MARKER) || c.includes(EXTENSION_RUNTIME_MSG_MARKER),
    logger
  );
  const wbBackupInfo = ensureFreshBackup(wbPath, isWorkbenchPatched, logger);
  const jkBackupInfo = ensureFreshBackup(jkPath, isJetskiHasAnyPatch, logger);

  const anyCoreRefreshed = extBackupInfo.refreshed || wbBackupInfo.refreshed || jkBackupInfo.refreshed;
  if (fs.existsSync(productJsonPath)) {
    const prodBak = productJsonPath + '.bak';
    if (!fs.existsSync(prodBak) || anyCoreRefreshed) {
      fs.copyFileSync(productJsonPath, prodBak);
      logger('[备份] 已更新纯净官方原件备份: product.json.bak');
    }
  }

  // 3. 全面汉化 5 个官方内置扩展的 package.json（含命令、自定义编辑器、子菜单、视图及设置描述）
  let localizedExtCount = 0;
  let totalExtFieldHits = 0;
  for (const extId of Object.keys(EXTENSION_MANIFEST_TRANSLATIONS)) {
    const pkgPath = path.join(appDir, 'extensions', extId, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    try {
      ensureFreshBackup(pkgPath, c => isExtensionPackageHasAnyLocalized(extId, c), logger);
      const sourcePkgPath = fs.existsSync(pkgPath + '.bak') ? pkgPath + '.bak' : pkgPath;
      const pkg = JSON.parse(fs.readFileSync(sourcePkgPath, 'utf8'));
      const res = localizeExtensionPackageObject(extId, pkg);
      if (res.modified) {
        const nextStr = JSON.stringify(pkg, null, 2);
        const curStr = fs.readFileSync(pkgPath, 'utf8');
        if (curStr !== nextStr) {
          fs.writeFileSync(pkgPath, nextStr, 'utf8');
        }
        localizedExtCount++;
        totalExtFieldHits += res.applied;
      }
    } catch (e) {
      logger(`⚠ 扩展 ${extId}/package.json 处理跳过: ${e.message}`);
    }
  }
  if (localizedExtCount > 0) {
    logger(`✔ [扩展清单] 已全量汉化 ${localizedExtCount} 个官方内置扩展清单 (共 ${totalExtFieldHits} 项命令/视图/设置描述)`);
  }

  // 3.5 汉化内置浏览器静态引导页（browserLanding.html / browserOnboarding.html）
  const browserStaticDir = path.join(appDir, 'out', 'vs', 'platform', 'browserOnboarding', 'static');
  let onboardingLocalized = 0;
  for (const [fileName, pairs] of Object.entries(BROWSER_ONBOARDING_TRANSLATIONS)) {
    const htmlPath = path.join(browserStaticDir, fileName);
    if (!fs.existsSync(htmlPath)) continue;
    try {
      const marker = BROWSER_ONBOARDING_MARKERS[fileName];
      ensureFreshBackup(htmlPath, c => c.includes(marker), logger);
      const srcHtmlPath = fs.existsSync(htmlPath + '.bak') ? htmlPath + '.bak' : htmlPath;
      let html = fs.readFileSync(srcHtmlPath, 'utf8');
      let hits = 0;
      for (const [fromStr, toStr] of pairs) {
        if (html.includes(fromStr)) {
          html = html.replace(fromStr, toStr);
          hits++;
        }
      }
      if (hits > 0) {
        const curHtml = fs.readFileSync(htmlPath, 'utf8');
        if (curHtml !== html) {
          fs.writeFileSync(htmlPath, html, 'utf8');
        }
        onboardingLocalized++;
      }
    } catch (e) {
      logger(`⚠ 浏览器引导页 ${fileName} 处理跳过: ${e.message}`);
    }
  }
  if (onboardingLocalized > 0) {
    logger(`✔ [浏览器引导] 已汉化内置浏览器欢迎页与引导页 (${onboardingLocalized} 个静态页)`);
  }

  // 4. 调用唯一权威构建脚本编译并部署 hub_main_zh.js（内置抗混淆动态定位 + 分级韧性模块容错 + 语法预检）
  const ultimateBuildScript = path.join(patchDir, 'build_ultimate_chinese_engine.js');
  if (!fs.existsSync(ultimateBuildScript)) {
    throw new Error('未找到终极构建脚本: ' + ultimateBuildScript);
  }
  logger('\n[Hub] 调用终极权威引擎构建并部署 hub_main_zh.js...');
  execSync(`"${process.execPath}" "${ultimateBuildScript}"`, { cwd: patchDir, stdio });
  const buildReport = parseBuildModuleReport(agyExtDir);

  // 5. 同步代理与双翻译微服务
  const syncPairs = [
    { src: path.join(patchDir, 'src', 'hub_proxy.template.js'), dst: path.join(agyExtDir, 'hub_proxy.js'), label: '本地 Hub 透明代理模块' },
    { src: path.join(patchDir, 'src', 'title_translator.js'), dst: path.join(agyExtDir, 'title_translator.js'), label: '标题翻译微服务模块' },
    { src: path.join(patchDir, 'src', 'thought_translator.js'), dst: path.join(agyExtDir, 'thought_translator.js'), label: '思维链实时翻译微服务模块' }
  ];
  for (const item of syncPairs) {
    if (fs.existsSync(item.src)) {
      if (!fs.existsSync(item.dst) || !filesAreIdentical(item.src, item.dst)) {
        fs.copyFileSync(item.src, item.dst);
        logger(`✔ [同步] 已更新${item.label}: ${item.dst}`);
      } else {
        logger(`✔ [同步] ${item.label}已为最新版本: ${path.basename(item.dst)}`);
      }
    }
  }

  // 6. 抗混淆注入 extension.js Webview 代理重定向钩子并汉化原生提示弹窗（基于纯净原件重建防止脏叠加）
  if (fs.existsSync(extJsPath)) {
    const extSrcPath = fs.existsSync(extJsPath + '.bak') ? extJsPath + '.bak' : extJsPath;
    const extContent = fs.readFileSync(extSrcPath, 'utf8');
    const hookRes = injectExtensionWebviewHook(extContent);
    if (hookRes.ok) {
      const curExt = fs.readFileSync(extJsPath, 'utf8');
      if (curExt !== hookRes.code) {
        fs.writeFileSync(extJsPath, hookRes.code, 'utf8');
        logger(`✔ [扩展] extension.js 注入与弹窗汉化完成 (代理钩子=${hookRes.hookAdded ? `新注入:${hookRes.urlArg}` : '就绪'}, 原生弹窗汉化=${hookRes.runtimeMsgHits} 处)`);
      } else {
        logger(`✔ [扩展] extension.js Webview 代理钩子与原生弹窗汉化已就绪`);
      }
    } else {
      throw new Error(`未能在 extension.js 中定位 renderWebviewHtml 注入锚点: ${hookRes.reason}`);
    }
  }

  // 7. 抗混淆注入外层 workbench.desktop.main.js
  if (fs.existsSync(wbPath)) {
    const wbSrcPath = fs.existsSync(wbPath + '.bak') ? wbPath + '.bak' : wbPath;
    const wbCode = fs.readFileSync(wbSrcPath, 'utf8');
    const wbRes = patchWorkbenchContent(wbCode);
    if (wbRes.ok && wbRes.changed) {
      fs.writeFileSync(wbPath, wbRes.code, 'utf8');
      logger(`✔ [会话标题] 已成功注入 workbench 标题输出枢纽 ${wbRes.fnName}(t)`);
    } else if (wbRes.ok) {
      logger('✔ [会话标题] workbench 标题输出枢纽已就绪');
    } else {
      logger('⚠ [会话标题] 未定位到 workbench 标题枢纽锚点（外围增强跳过，不影响主窗口运行）');
    }
  }

  // 8. 抗混淆注入 jetskiAgent/main.js
  if (fs.existsSync(jkPath)) {
    const jkSrcPath = fs.existsSync(jkPath + '.bak') ? jkPath + '.bak' : jkPath;
    const jkCode = fs.readFileSync(jkSrcPath, 'utf8');
    const jkRes = patchJetskiContent(jkCode);
    if (jkRes.ok && jkRes.changed) {
      fs.writeFileSync(jkPath, jkRes.code, 'utf8');
      if (jkRes.fnName) logger(`✔ [会话标题] 已成功注入 jetskiAgent 标题输出枢纽 ${jkRes.fnName}(e)`);
      if (jkRes.uenHit) logger('✔ [会话标题] 已拦截 jetskiAgent 列表渲染入口');
      if (jkRes.smaHit) logger('✔ [会话标题] 已拦截 jetskiAgent 搜索项渲染入口');
      if (jkRes.thoughtHits > 0) logger(`✔ [思维链标签] 已汉化 jetskiAgent 思考标签 (${jkRes.thoughtHits} 处)`);
      if (jkRes.domCleanerAttached) logger('✔ [全界面汉化] 已为 jetskiAgent 独立窗口挂载共享 DOM 清洗引擎 v2');
    } else if (jkRes.ok) {
      logger('✔ [jetskiAgent] 标题、思考标签与全界面 DOM 清洗引擎 v2 已就绪');
    } else {
      logger('⚠ [jetskiAgent] 未定位到外围注入锚点（跳过，不影响主窗口运行）');
    }
  }

  // 9. 更新 product.json 完整性校验和
  let syncedChecksums = 0;
  if (fs.existsSync(productJsonPath)) {
    try {
      const prodJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
      if (prodJson.checksums) {
        for (const relPath in prodJson.checksums) {
          const fullTarget = path.join(outDir, relPath);
          if (fs.existsSync(fullTarget)) {
            const curHash = computeChecksum(fs.readFileSync(fullTarget));
            if (prodJson.checksums[relPath] !== curHash) {
              prodJson.checksums[relPath] = curHash;
              syncedChecksums++;
            }
          }
        }
        if (syncedChecksums > 0) {
          fs.writeFileSync(productJsonPath, JSON.stringify(prodJson, null, '\t'), 'utf8');
        }
        logger(`✔ [校验和自愈] product.json 全量自愈同步完成 (共对齐 ${syncedChecksums} 项，彻底杜绝安装损坏弹窗)`);
      }
    } catch (e) {
      logger(`⚠ product.json 校验和更新跳过: ${e.message}`);
    }
  }

  // 10. 安全清理 V8 字节码缓存
  safelyClearV8Cache(cachedDataDir, logger);

  // 11. 写入包含 4 维版本身份、源哈希与真实 Node 路径的本机部署元数据
  const identity = readInstalledAppIdentity(appDir);
  const hubSourcePath = resolveHubSourcePath(agyExtDir, patchDir);
  const existingMeta = readDeployMeta(agyExtDir) || {};
  const nodeExecPath = /node(\.exe)?$/i.test(path.basename(process.execPath)) ? process.execPath : (existingMeta.nodeExecPath || '');

  writeDeployMeta(agyExtDir, path.join(patchDir, 'src'), {
    appVersion: identity.appVersion,
    distro: identity.distro,
    ideVersion: identity.ideVersion,
    agyVersion: identity.agyVersion,
    hubSourceSha256: computeFileSha256(hubSourcePath),
    buildEngineSha256: computeBuildEngineFingerprint(patchDir),
    nodeExecPath,
    moduleStatus: buildReport ? buildReport.modules : undefined,
    skippedModules: buildReport ? buildReport.skippedModules : [],
    syncedChecksums
  });

  return {
    ...identity,
    buildReport,
    syncedChecksums
  };
}

module.exports = {
  PROXY_REQUIRED_ENDPOINTS,
  PROXY_RESILIENCE_MARKERS,
  THOUGHT_TRANSLATOR_REQUIRED_MARKERS,
  HUB_ZH_THOUGHT_FEATURE_MARKERS,
  HUB_ZH_TITLE_FEATURE_MARKERS,
  HUB_ZH_TABLE_FEATURE_MARKERS,
  HUB_ZH_FULL_UI_MARKERS,
  EXTENSION_HOOK_MARKER,
  EXTENSION_HOOK_REGEX,
  EXTENSION_RUNTIME_MSG_MARKER,
  BROWSER_ONBOARDING_MARKERS,
  DOM_CLEANER_V2_MARKER,
  WORKBENCH_TITLE_FN_REGEX,
  WORKBENCH_PATCHED_MARKER,
  JETSKI_TITLE_FN_REGEX,
  JETSKI_UEN_REGEX,
  JETSKI_SMA_REGEX,
  JETSKI_THINKING_FOR_REGEX,
  JETSKI_THOUGHT_FOR_REGEX,
  JETSKI_THINKING_DOTS_TARGET,
  locateExtensionWebviewHook,
  injectExtensionWebviewHook,
  findByAnchorRegex,
  replaceAllByAnchorRegex,
  findMatchingBraceEnd,
  locateTitleRpcModule,
  locateThoughtModule,
  locateTableModule,
  localizeExtensionPackageObject,
  inspectExtensionPackageLocalization,
  isAgyPackageLocalized,
  checkAllBuiltInExtensionsLocalized,
  checkBrowserOnboardingLocalized,
  computeBuildEngineFingerprint,
  isWorkbenchPatched,
  isJetskiPatched,
  filesAreIdentical,
  resolveHubSourcePath,
  readInstalledAppIdentity,
  formatAppIdentity,
  ensureFreshBackup,
  buildZhTitleEngine,
  patchWorkbenchContent,
  patchJetskiContent,
  applyAllPatches
};
