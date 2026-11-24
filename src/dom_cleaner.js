/**
 * Antigravity 全局自适应运行时 DOM 清洗引擎 v2（防误杀作用域隔离架构）
 *
 * 同时复用于：
 * - Hub 主 Webview (hub_main_zh.js)
 * - 独立 Agent Manager 窗口 (out/jetskiAgent/main.js)
 *
 * 核心特性：
 * 1. 两级词典门控：
 *    - safeMap：专有界面名、多词短语、占位符与服务端下发分区标题（如 Skills Used）
 *    - ctrlMap：通用短词/多义词（如 Copy/Edit/Stop/Goals/Links/See all），仅允许在语义 UI 控件与属性上生效
 * 2. 四重零误杀防线：
 *    - 硬黑名单跳过 code/pre/textarea/[contenteditable]/.monaco-editor/.xterm/思维链/表格正文等
 *    - 对话正文与 Diff 源码区内仅放行显式 UI 控件（button/menuitem/tooltip 等），绝不污染 AI 回复、代码与文件名
 *    - 文件名/路径特征保护（跳过带扩展名或路径分隔符的纯文件名片段）
 *    - 监听 attributes (placeholder/title/aria-label) 动态切换 + rAF/微任务批量节流防卡顿
 */

const {
  SAFE_GLOBAL_PHRASES,
  CONTROL_ONLY_PHRASES,
  DYNAMIC_PATTERNS
} = require('./ui_dictionary');

const DOM_CLEANER_V2_MARKER = 'Antigravity 全局自适应运行时 DOM 清洗引擎 v2';

/**
 * 构建可独立注入浏览器/Webview 运行时的 DOM 清洗器脚本字符串
 * @param {Record<string, string>} extraSafePhrases 附加全区安全短语（如设置屏字典）
 * @param {Record<string, string>} extraControlPhrases 附加仅限控件短词
 */
function buildDomCleanerRuntimeScript(extraSafePhrases = {}, extraControlPhrases = {}) {
  const safeMap = { ...SAFE_GLOBAL_PHRASES };
  const ctrlMap = { ...CONTROL_ONLY_PHRASES };

  // 将附加字典按安全度自动分流：单字母/单词高歧义词优先留在 ctrlMap，多词短语与界面专名进入 safeMap
  for (const [k, v] of Object.entries(extraSafePhrases || {})) {
    if (typeof k !== 'string' || typeof v !== 'string' || !k.trim() || !v.trim()) continue;
    if (Object.prototype.hasOwnProperty.call(ctrlMap, k)) {
      // 已被显式列为高歧义短词的条目继续保留在控件门控中，用附加译文（如更贴合语境）覆盖
      ctrlMap[k] = v;
    } else if (!k.includes(' ') && /^[A-Za-z]+$/.test(k) && k.length <= 12) {
      ctrlMap[k] = v;
    } else {
      safeMap[k] = v;
    }
  }
  for (const [k, v] of Object.entries(extraControlPhrases || {})) {
    if (typeof k !== 'string' || typeof v !== 'string' || !k.trim() || !v.trim()) continue;
    ctrlMap[k] = v;
  }

  // 确保同一键不会同时冗余落在两张表（ctrlMap 优先保留更严格的控件门控）
  for (const ck of Object.keys(ctrlMap)) {
    if (Object.prototype.hasOwnProperty.call(safeMap, ck)) {
      delete safeMap[ck];
    }
  }

  return `
// =========================================================================
// ${DOM_CLEANER_V2_MARKER}
// =========================================================================
(function() {
  if (typeof window === 'undefined') return;
  if (window.__agyDomCleanerV2Installed) return;
  window.__agyDomCleanerV2Installed = true;

  var safeMap = ${JSON.stringify(safeMap)};
  var ctrlMap = ${JSON.stringify(ctrlMap)};
  var rawRules = ${JSON.stringify(DYNAMIC_PATTERNS)};
  var rules = [];
  for (var ri = 0; ri < rawRules.length; ri++) {
    try {
      rules.push({
        re: new RegExp(rawRules[ri].pattern, rawRules[ri].flags || ''),
        rep: rawRules[ri].replacement,
        controlOnly: !!rawRules[ri].controlOnly
      });
    } catch (_e) {}
  }

  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1,
    VAR: 1, SVG: 1, PATH: 1, TEXTAREA: 1, TEMPLATE: 1, IFRAME: 1, CANVAS: 1
  };
  var CTRL_TAGS = {
    BUTTON: 1, LABEL: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    HEADER: 1, NAV: 1, SUMMARY: 1, OPTION: 1, OPTGROUP: 1, LEGEND: 1,
    CAPTION: 1, TITLE: 1, DT: 1
  };
  var CTRL_ROLES = {
    button: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1,
    option: 1, tab: 1, tablist: 1, tooltip: 1, dialog: 1, alertdialog: 1,
    menu: 1, menubar: 1, listbox: 1, toolbar: 1, navigation: 1,
    heading: 1, status: 1, switch: 1, checkbox: 1, radio: 1, combobox: 1,
    banner: 1, complementary: 1
  };

  function getClassString(el) {
    if (!el) return '';
    if (typeof el.className === 'string') return el.className;
    if (el.getAttribute) return el.getAttribute('class') || '';
    return '';
  }

  function hasAttrVal(el, attr) {
    return el && el.getAttribute ? (el.getAttribute(attr) || '') : '';
  }

  function isHardProtectedElement(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (SKIP_TAGS[tag]) return true;
    var ce = el.getAttribute ? el.getAttribute('contenteditable') : null;
    if (ce === '' || ce === 'true' || ce === 'plaintext-only' || el.isContentEditable === true) return true;
    if (hasAttrVal(el, 'data-agy-no-translate') === '1') return true;
    if (hasAttrVal(el, 'data-agy-thought-body') === '1') return true;
    var cls = getClassString(el);
    if (cls) {
      if (
        cls.indexOf('monaco-editor') !== -1 ||
        cls.indexOf('xterm') !== -1 ||
        cls.indexOf('ProseMirror') !== -1 ||
        cls.indexOf('md-table-el') !== -1 ||
        cls.indexOf('agy-md-table') !== -1 ||
        cls.indexOf('cm-editor') !== -1 ||
        cls.indexOf('view-lines') !== -1
      ) return true;
    }
    if (hasAttrVal(el, 'data-lexical-editor') === 'true') return true;
    return false;
  }

  function isExplicitControlElement(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (CTRL_TAGS[tag]) return true;
    var role = hasAttrVal(el, 'role');
    if (role && CTRL_ROLES[role]) return true;
    if (el.hasAttribute && (
      el.hasAttribute('data-radix-popper-content-wrapper') ||
      el.hasAttribute('data-radix-collection-item') ||
      el.hasAttribute('data-tooltip-id') ||
      el.hasAttribute('aria-expanded')
    )) return true;
    var tid = hasAttrVal(el, 'data-testid');
    if (tid && (
      tid.indexOf('overview-') !== -1 ||
      tid.indexOf('sidebar') !== -1 ||
      tid.indexOf('section') !== -1 ||
      tid.indexOf('header') !== -1 ||
      tid.indexOf('toolbar') !== -1 ||
      tid.indexOf('menu') !== -1 ||
      tid.indexOf('tab') !== -1 ||
      tid.indexOf('dialog') !== -1 ||
      tid.indexOf('settings') !== -1 ||
      tid.indexOf('button') !== -1
    )) return true;
    return false;
  }

  function isContentZoneElement(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'ARTICLE' || tag === 'BLOCKQUOTE') return true;
    var cls = getClassString(el);
    if (cls) {
      if (
        cls.indexOf('markdown-body') !== -1 ||
        /(?:^|\\s)prose(?:$|\\s|-)/.test(cls) ||
        cls.indexOf('diff-line') !== -1 ||
        cls.indexOf('line-content') !== -1
      ) return true;
    }
    var tid = hasAttrVal(el, 'data-testid');
    if (tid && (tid.indexOf('message-content') !== -1 || tid.indexOf('markdown') !== -1 || tid.indexOf('diff-code') !== -1)) {
      return true;
    }
    return false;
  }

  function inspectNodeContext(parentEl) {
    var cur = parentEl;
    var depth = 0;
    var inControl = false;
    var controlDepth = 999;
    var inContentZone = false;
    var contentDepth = 999;
    var hasSelectNone = false;

    while (cur && cur.nodeType === 1 && depth < 14) {
      if (isHardProtectedElement(cur)) {
        return { skip: true, inControl: false };
      }
      if (!inControl && isExplicitControlElement(cur)) {
        inControl = true;
        controlDepth = depth;
      }
      if (!hasSelectNone && depth <= 2) {
        var c = getClassString(cur);
        if (c && (c.indexOf('select-none') !== -1 || c.indexOf('uppercase') !== -1)) {
          hasSelectNone = true;
        }
      }
      if (!inContentZone && isContentZoneElement(cur)) {
        inContentZone = true;
        contentDepth = depth;
      }
      cur = cur.parentElement;
      depth++;
    }

    // 位于 Markdown/消息正文或代码 Diff 区域内部时，仅放行更内层的显式 UI 控件（如按钮/菜单/气泡）
    if (inContentZone && (!inControl || controlDepth > contentDepth)) {
      return { skip: true, inControl: false };
    }

    return {
      skip: false,
      inControl: inControl || hasSelectNone
    };
  }

  function translateText(rawText, allowControlOnly) {
    if (!rawText || typeof rawText !== 'string') return null;
    var trimmed = rawText.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 260) return null;
    // 快速短路：已含中文且不含 ASCII 字母，无需查表
    if (/[\\u4e00-\\u9fa5]/.test(trimmed) && !/[A-Za-z]/.test(trimmed)) return null;
    // 防误杀文件名/路径（仅在无空格且含扩展名或路径斜杠时跳过）
    if (trimmed.indexOf(' ') === -1 && (/[\\\\/]/.test(trimmed) || /\\.[a-z0-9]{1,6}$/i.test(trimmed))) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(safeMap, trimmed)) {
      return safeMap[trimmed];
    }
    if (allowControlOnly && Object.prototype.hasOwnProperty.call(ctrlMap, trimmed)) {
      return ctrlMap[trimmed];
    }
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.controlOnly && !allowControlOnly) continue;
      if (rule.re.test(trimmed)) {
        var replaced = trimmed.replace(rule.re, rule.rep);
        if (replaced && replaced !== trimmed) return replaced;
      }
    }
    return null;
  }

  function applyTextNode(textNode) {
    if (!textNode || textNode.nodeType !== 3) return false;
    var raw = textNode.nodeValue;
    if (!raw || raw.length > 320) return false;
    var trimmed = raw.trim();
    if (!trimmed || trimmed.length < 2) return false;
    var parent = textNode.parentElement;
    if (!parent) return false;

    var ctx = inspectNodeContext(parent);
    if (ctx.skip) return false;

    var zh = translateText(trimmed, ctx.inControl);
    if (!zh || zh === trimmed) return false;
    var nextVal = raw.replace(trimmed, zh);
    if (nextVal !== raw) {
      textNode.nodeValue = nextVal;
      return true;
    }
    return false;
  }

  function applyElementAttributes(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'PATH') return false;
    var changed = false;

    if (typeof el.placeholder === 'string' && el.placeholder) {
      var pZh = translateText(el.placeholder, true);
      if (pZh && pZh !== el.placeholder) {
        el.placeholder = pZh;
        changed = true;
      }
    }
    if (typeof el.title === 'string' && el.title) {
      var tZh = translateText(el.title, true);
      if (tZh && tZh !== el.title) {
        el.title = tZh;
        changed = true;
      }
    }
    if (el.getAttribute && el.setAttribute) {
      var aria = el.getAttribute('aria-label');
      if (aria) {
        var aZh = translateText(aria, true);
        if (aZh && aZh !== aria) {
          el.setAttribute('aria-label', aZh);
          changed = true;
        }
      }
    }
    return changed;
  }

  function translateSubtree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      applyTextNode(root);
      return;
    }
    if (root.nodeType !== 1) return;
    applyElementAttributes(root);
    if (isHardProtectedElement(root)) return;

    var children = root.childNodes;
    if (!children || !children.length) return;
    for (var i = 0; i < children.length; i++) {
      var ch = children[i];
      if (ch.nodeType === 3) {
        applyTextNode(ch);
      } else if (ch.nodeType === 1) {
        translateSubtree(ch);
      }
    }
  }

  // 批量异步队列，避免高频流式渲染引发主线程抖动
  var pendingNodes = new Set();
  var flushScheduled = false;
  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    var run = function() {
      flushScheduled = false;
      if (pendingNodes.size === 0) return;
      var batch = Array.from(pendingNodes);
      pendingNodes.clear();
      for (var i = 0; i < batch.length; i++) {
        translateSubtree(batch[i]);
      }
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  function startObserver() {
    if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined') return;
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'childList' && m.addedNodes) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            pendingNodes.add(m.addedNodes[j]);
          }
        } else if (m.type === 'characterData' && m.target) {
          pendingNodes.add(m.target);
        } else if (m.type === 'attributes' && m.target) {
          applyElementAttributes(m.target);
        }
      }
      if (pendingNodes.size > 0) scheduleFlush();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label']
    });
    translateSubtree(document.body);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver);
    } else if (document.body) {
      startObserver();
    } else {
      setTimeout(startObserver, 30);
    }
  }

  // 暴露只读诊断与测试接口（供离线自动化防误杀测试直接校验）
  window.__agyDomCleanerV2 = {
    marker: ${JSON.stringify(DOM_CLEANER_V2_MARKER)},
    translateText: translateText,
    translateSubtree: translateSubtree,
    applyElementAttributes: applyElementAttributes,
    safeCount: Object.keys(safeMap).length,
    ctrlCount: Object.keys(ctrlMap).length,
    ruleCount: rules.length
  };
})();
`;
}

module.exports = {
  DOM_CLEANER_V2_MARKER,
  buildDomCleanerRuntimeScript
};
