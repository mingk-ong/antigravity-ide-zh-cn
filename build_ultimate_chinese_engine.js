const fs = require('fs');
const path = require('path');
const { getTargetPaths } = require('./src/config');

const { agyExtDir } = getTargetPaths();
const localSrcPath = path.join(__dirname, 'hub_main.js');
const liveSrcPath = path.join(agyExtDir, 'hub_main.js');
const srcPath = fs.existsSync(localSrcPath) ? localSrcPath : liveSrcPath;
const dstPath = path.join(agyExtDir, 'hub_main_zh.js');
const backupDst = path.join(__dirname, 'hub_main_zh.js');
const dictPath = path.join(__dirname, 'src', 'title_dicts.json');
const cachePath = path.join(__dirname, 'src', 'title_cache.json');

if (!fs.existsSync(srcPath)) {
  throw new Error(`❌ 未找到官方静态源 hub_main.js（已检查 ${localSrcPath} 与 ${liveSrcPath}），请确认 Antigravity IDE 安装路径或设置 ANTIGRAVITY_IDE_DIR`);
}

let code = fs.readFileSync(srcPath, 'utf8');
console.log('Original size:', code.length);

// 0. 加载本地可选历史字典（src/title_dicts.json）与持久化翻译缓存（src/title_cache.json）
const titleDict = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf8')) : { id_to_zh: {}, en_title_to_zh: {} };
const titleCache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : { idToZh: {}, enToZh: {} };

const mergedIdToZh = {
  ...(titleDict.id_to_zh || {}),
  ...(titleCache.idToZh || {})
};

const mergedEnToZh = {
  ...(titleDict.en_title_to_zh || {}),
  ...(titleCache.enToZh || {}),
  'Change Software Language To Chinese': '软件界面中文化设置',
  'Search Interface Conversation Title Localization': '搜索界面会话标题中文化'
};

const mergedLowerEnToZh = {};
for (const [k, v] of Object.entries(mergedEnToZh)) {
  if (typeof k === 'string' && typeof v === 'string') {
    mergedLowerEnToZh[k.toLowerCase().trim()] = v;
  }
}

// =========================================================================
// 1. 字典定义 (Comprehensive Dictionary)
// =========================================================================

// 1.1 侧边栏及页面路由名称 (vT)
const screenTitles = {
  "General": "通用设置",
  "Appearance": "外观偏好",
  "Notifications": "系统通知",
  "Models": "模型配置",
  "Browser": "内置浏览器",
  "Projects": "项目分组",
  "Conversations": "对话历史",
  "Provide Feedback": "意见与反馈",
  "Give Feedback": "意见与反馈",
  "Workspaces": "工作区偏好",
  "Not in Project": "未归属项目",
  "Account": "账户设置",
  "Customizations": "自定义扩展与技能",
  "Shortcuts": "键盘快捷键",
  "Labs": "实验室特性",
  "Project 4K": "Project 4K 模式",
  "CitC Settings": "CitC 代码仓",
  "Application": "应用程序设置",
  "Developer": "开发者调试选项",
  "Jetski Chat": "智能体对话",
  "Running": "运行中任务"
};

// 1.2 页面大标题与长篇说明 (uT)
const utTitles = {
  ...screenTitles,
  "Tool Permissions": "工具与终端权限",
  "File Permissions": "文件系统权限",
  "Network Permissions": "网络访问权限",
  "Command Permissions": "终端命令权限",
  "Browser Actuation Permissions": "浏览器自动化权限",
  "GitHub Permissions": "GitHub 操作权限",
  "Add MCP Servers": "添加 MCP 服务器",
  "Manage Hooks": "管理生命周期钩子",
  "Build With Google Plugins": "Google 官方插件库",
  "Model Quota": "模型配额与用量",
  "Workspace Settings": "工作区专属设置"
};

const utDescriptions = {
  "Configure agent execution, queued message delivery, and permissions.": "配置智能体执行机制、追问消息排队传递及安全权限。",
  "Modify permissions for file, terminal, and MCP tools.": "修改文件系统读写、终端命令执行及 MCP 工具调用的权限。",
  "Modify permissions for file and terminal tools.": "修改文件系统读写及终端命令执行的权限。",
  "Configure the agent's visual theme and display preferences.": "配置智能体的界面主题外观、视觉风格及显示偏好设置。",
  "Settings for conversations outside of projects.": "未归属具体项目的独立对话会话及全局自定义扩展配置。",
  "Configure built-in browser, link opening, and browser subagent preferences.": "配置内置浏览器运行环境、链接打开方式及浏览器子智能体偏好。",
  "Manage your plan, credentials, and general preferences.": "管理您的订阅计划、身份凭据及账户全局偏好设置。",
  "Developer-only tools. These settings do not affect other users.": "仅供开发者使用的专业调试工具。这些设置不会影响其他正常功能。",
  "Manage your notification preferences.": "管理您的系统桌面通知、触发时机与声音偏好设置。",
  "Manage your keybinding scheme and customize shortcuts in VS Code.": "管理按键绑定方案并在编辑器中自定义键盘快捷键。",
  "Keyboard shortcuts for quick navigation and control.": "用于高效导航与控制的常用键盘快捷键列表。",
  "Manage fine-grained permissions for GitHub.": "配置面向 GitHub 代码仓与 API 的细粒度操作权限。",
  "Configure workspace-specific permissions, resources, and customizations.": "配置当前工作区专属的工具权限、系统资源及自定义扩展。",
  "Configure default behaviors, skills, and MCP servers.": "配置智能体默认行为、技能库及 MCP 外部工具服务器。",
  "Manage your model quota and credits.": "管理您的模型使用配额、AI 积分消耗及订阅状态。"
};

// 1.3 分区小标题 (yT)
const sectionTitles = {
  "Customizations": "自定义扩展与技能",
  "Token Usage": "Token 预算消耗",
  "Default Customizations": "系统默认扩展",
  "Skills": "技能库",
  "Rules": "指令规则",
  "Custom Agents": "自定义智能体",
  "Plugins": "扩展插件",
  "Browser Subagent": "浏览器子智能体",
  "Side Panel Preview": "侧边栏快速预览",
  "Built-in Browser": "内置独立浏览器",
  "Global Permissions": "全局权限",
  "Execution": "执行机制",
  "Terminal": "终端环境配置",
  "Workspaces": "工作区偏好",
  "Interface Layout": "界面布局偏好",
  "Best of N": "Best of N 多候选方案",
  "Labs": "实验室特性",
  "File Permissions": "文件权限规则",
  "Network Permissions": "网络权限规则",
  "Chat": "对话偏好",
  "Display": "显示偏好",
  "Theme": "外观主题",
  "General": "通用偏好",
  "Security": "安全与防护",
  "Notification": "通知提醒",
  "Sound": "音效设置",
  "Model Quota": "模型配额",
  "Model Credits": "模型积分",
  "Feedback Type": "反馈类型",
  "Description": "详细描述",
  "Steps to Reproduce": "复现步骤",
  "Console Telemetry": "控制台遥测日志"
};

// 1.4 设置项卡片 Label 与 Description (xT 及通用)
const rowLabels = {
  "Browser Javascript Execution Policy": "浏览器 JS 脚本执行策略",
  "Browser Actuation Rules": "浏览器自动化操作规则",
  "Download Location": "默认下载位置",
  "Browsing History": "浏览历史记录",
  "Permission Preset": "权限预设模板",
  "Tool Permissions": "工具与终端权限",
  "Network Access Rules": "网络访问规则",
  "File Access Rules": "文件访问规则",
  "Terminal Commands": "终端执行命令",
  "Commands Outside Sandbox": "沙盒外终端命令",
  "MCP Tools": "MCP 外部工具",
  "GitHub": "GitHub 访问权限",
  "File Reads": "文件读取权限",
  "File Writes": "文件写入权限",
  "Read URLs": "网络访问权限",
  "Execution": "执行机制",
  "Queued Messages": "追问排队递交",
  "Keyboard shortcuts": "键盘快捷键",
  "Send Immediately": "立即发送",
  "Queue": "排队等待",
  "Turbo": "Turbo 极速模式",
  "New Conversation Button": "新建会话默认工作区",
  "This Computer": "本机环境",
  "Remote": "远程环境",
  "File Permissions": "文件系统权限",
  "Network Permissions": "网络访问权限",
  "Delete All Remote Agents Data": "清除全部远程智能体数据",
  "Delete All Local Data": "清除全部本地用户数据",
  "Browsing Data": "清除浏览数据",
  "Override feature environment": "覆盖特性运行时环境",
  "Operating System": "模拟操作系统",
  "Host Environment": "模拟宿主环境",
  "Voice engine": "语音引擎配置",
  "Microphone": "麦克风输入设备",
  "Save audio recordings": "保存本地录音文件",
  "Recordings": "录音存储管理",
  "Enable Sandbox Mode": "启用终端沙盒安全模式",
  "Manage Hooks": "管理生命周期钩子",
  "Build With Google Plugins": "Google 官方插件库",
  "Idle Conversations": "空闲会话自动清理",
  "Enter to Send": "回车键发送消息",
  "Command Setup Script": "命令初始化前置脚本",
  "Enable Terminal Sandbox": "启用终端沙盒安全隔离",
  "Enable Sounds for Agent": "启用智能体提示音",
  "Enable Notifications for Agent": "启用智能体系统桌面通知",
  "Conversation Steps": "对话技术步骤展示级别",
  "Custom Context Menus": "自定义右键快捷菜单",
  "Screen Reader Mode": "屏幕朗读器无障碍模式",
  "Context and Quota Indicator": "上下文用量与模型配额指示器",
  "Conversation Width": "对话面板宽度",
  "Artifact Width": "Markdown 文档卡片宽度",
  "Terminal Location": "终端打开位置",
  "Open Links In": "超链接打开目标",
  "Enable Browser Agent": "启用内置浏览器子智能体",
  "Prevent Sleep": "阻止计算机睡眠",
  "Keep in Menu Bar": "常驻托盘与后台运行",
  "Automatic Check for Updates": "自动检查软件更新",
  "Print telemetry to the console": "输出遥测日志到开发者控制台",
  "Your Plan:": "当前订阅计划：",
  "Your Plan": "当前订阅计划",
  "Enable AI Credit Overages": "启用 AI 积分超额自动扣费",
  "Rules": "指令规则",
  "Other Customizations": "其他自定义扩展"
};

const rowDescriptions = {
  "Controls whether the agent can run custom JavaScript to automate complex browser actions.": "控制智能体是否可以在内置浏览器中运行自定义 JavaScript 脚本以实现复杂交互自动化。",
  "Controls the actions the agent can take.": "控制智能体可以执行的操作范围与权限级别。",
  "Modify permissions for file, terminal, and MCP tools.": "修改文件系统读写、终端命令执行及 MCP 工具调用的权限。",
  "Modify permissions for file and terminal tools.": "修改文件系统读写及终端命令执行的权限。",
  "Configure allowed and denied URLs for reading.": "配置智能体允许和拒绝读取的网络 URL 与域名。",
  "Configure when follow-up messages are sent.": "配置在智能体处理过程中提交的后续消息的发送时机。",
  "Configure allowed terminal commands.": "配置智能体允许自动执行的终端命令白名单。",
  "Configure allowed commands outside the sandbox.": "配置允许在沙盒隔离环境之外执行的高权限命令。",
  "Configure external tools via Model Context Protocol.": "配置通过模型上下文协议 (MCP) 调用的外部工具及服务器。",
  "Configure allowed and denied paths for file reads and writes.": "配置智能体允许和拒绝读写的文件与目录路径规则。",
  "A shell setup script run before every command the agent executes.": "在智能体执行每条终端命令之前自动运行的前置 Shell 初始化脚本。",
  "Run terminal commands with sandbox restrictions.": "在终端沙盒安全隔离环境中执行命令，防止误改系统。",
  "Play a sound when your action is needed or the agent finishes.": "当需要人工交互或智能体完成任务时播放提示音。",
  "Show system notifications when your action is needed or the agent finishes.": "当需要人工交互或智能体完成任务时弹出系统桌面通知。",
  "Choose how much detail is shown during a conversation.": "设置对话历史中展示的技术思考过程与详细日志级别。",
  "Replace the default browser right-click menu with quick actions.": "使用 Antigravity 快捷操作菜单替换系统原生右键菜单。",
  "Optimize the interface and terminal output for screen readers.": "为屏幕朗读器优化界面布局及终端流式输出。",
  "Configure the maximum width of the conversation panel.": "配置文件与对话界面的最大显示宽度。",
  "Choose where terminal sessions appear.": "选择终端会话的默认展示位置（面板或独立编辑器）。",
  "Configure the default width of markdown artifacts.": "配置生成的 Markdown 工件文档的默认展示宽度。",
  "Show how full the context window is next to the send button. Click it for a breakdown and to see your model quota.": "在发送按钮旁显示上下文窗口的消耗百分比；点击可查看模型配额明细。",
  "Choose where links open by default when clicked.": "设置点击超链接时的默认打开目标（内置浏览器或系统默认浏览器）。",
  "Include default customizations, such as default skills.": "加载系统内置的默认扩展与预置技能库。",
  "Send messages with the keyboard's Enter key instead of starting a new line.": "使用 Enter 回车键直接发送消息（换行请使用 Shift+Enter）。",
  "Which workspace the New Conversation button and keyboard shortcut start you in.": "设置点击新建会话按钮或按下快捷键时默认启动的目标工作区。",
  "Folder where files downloaded in the built-in browser are saved.": "设置在内置浏览器中下载文件时保存到的本地文件夹路径。",
  "Clear visited URLs and autocomplete suggestions from the built-in browser.": "清除内置浏览器的访问历史记录、Cookie 与搜索建议缓存。",
  "Clear visited URLs and autocomplete suggestions from side panel preview.": "清除侧边栏预览面板的访问历史记录与搜索建议缓存。",
  "Prevent the computer from sleeping while the app is running.": "防止应用程序在运行智能体长任务时系统进入睡眠状态。",
  "Logs each telemetry event to the browser's DevTools console as it fires, with the click or key that caused it. Stays on across reloads until you turn it off.": "在 DevTools 控制台中实时打印触发的遥测事件详情，重启窗口后依然保持开启直到手动关闭。"
};

// 1.5 选项值解析字典 (resolveOptionToString)
const optionValues = {
  "Disabled": "已禁用",
  "Always Ask": "每次询问确认",
  "Request Review": "审查确认",
  "Turbo": "Turbo 极速全自动",
  "Always Proceed": "始终直接允许",
  "Queue": "排队等待",
  "Send Immediately": "立即发送",
  "Default": "默认居中",
  "Wide": "宽屏展示",
  "Fill": "铺满视口",
  "Side Panel": "侧边栏面板",
  "Built-in Browser": "内置独立浏览器",
  "New Tab": "新标签页",
  "External Browser": "系统默认浏览器",
  "Panel": "底部面板",
  "Editor": "独立编辑器窗口"
};

// 1.6 按钮与常用操作词汇
const actionWords = {
  "Edit": "编辑规则",
  "Open": "打开配置",
  "Reset": "重置默认",
  "Change…": "更改路径…",
  "Clear": "立即清除",
  "Save": "保存设置",
  "Cancel": "取消",
  "Delete": "删除",
  "Add": "添加",
  "Close": "关闭",
  "Back": "返回",
  "Upgrade": "升级订阅",
  "See Activity": "查看用量明细",
  "Get More AI Credits": "获取更多积分",
  "Sign In": "登录账户",
  "Sign Out": "退出登录",
  "Show Less": "收起列表",
  "Hide breakdown": "收起用量明细",
  "Hide tools": "隐藏工具列表"
};

// =========================================================================
// 2. 注入核心拦截器 (Code Injections)
// =========================================================================

// 2.1 注入 vT 导航名称
const vtTarget = 'function vT(a){return CKb.get(a)??a}';
const vtReplacement = `function vT(a){
  const _screens = ${JSON.stringify(screenTitles)};
  return _screens[a] || (CKb.get(a) ?? a);
}`;
code = code.replace(vtTarget, vtReplacement);

// 2.2 注入 uT 页面大标题与长篇说明
const utTarget = 'var zKb=D.createContext(!1),uT=({title:a,description:b,children:c,scrollable:d=!0,headerRight:f,onBack:g})=>{';
const utReplacement = `var zKb=D.createContext(!1),uT=({title:a,description:b,children:c,scrollable:d=!0,headerRight:f,onBack:g})=>{
  const _titles = ${JSON.stringify(utTitles)};
  const _descs = ${JSON.stringify(utDescriptions)};
  if (typeof a === 'string' && _titles[a]) a = _titles[a];
  if (typeof b === 'string' && _descs[b]) b = _descs[b];
`;
code = code.replace(utTarget, utReplacement);

// 2.3 注入 yT 分区标题
const ytTarget = 'var yT=({title:a,subtitle:b,headerRight:c,id:d,count:f,collapsible:g=!1,defaultCollapsed:h=!1,forceExpanded:k=!1,children:l})=>{';
const ytReplacement = `var yT=({title:a,subtitle:b,headerRight:c,id:d,count:f,collapsible:g=!1,defaultCollapsed:h=!1,forceExpanded:k=!1,children:l})=>{
  const _secTitles = ${JSON.stringify(sectionTitles)};
  if (typeof a === 'string' && _secTitles[a]) a = _secTitles[a];
`;
code = code.replace(ytTarget, ytReplacement);

// 2.4 注入 xT 卡片行渲染器
const xtStart = 'var xT=({label:a,description:b,rightElement:c,extraContent:d,badge:f,alignItems:g="center",unpadded:h=!1,labelId:k,descriptionId:l,disabled:m=!1,"data-testid":n})=>';
const xtIdx = code.indexOf(xtStart);
const nextVar = code.indexOf(';var ', xtIdx);
const oldXt = code.slice(xtIdx, nextVar + 1);

const newXt = `var xT=({label:a,description:b,rightElement:c,extraContent:d,badge:f,alignItems:g="center",unpadded:h=!1,labelId:k,descriptionId:l,disabled:m=!1,"data-testid":n})=>{
  const _labels = ${JSON.stringify(rowLabels)};
  const _descs = ${JSON.stringify(rowDescriptions)};
  if (typeof a === 'string' && _labels[a]) a = _labels[a];
  if (typeof b === 'string' && _descs[b]) b = _descs[b];
  return D.createElement("div",{"data-testid":n,"data-disabled":m?"true":void 0,className:\`\${h?"":"py-2 px-3"} w-full bg-transparent flex justify-between gap-4 \${g==="start"?"items-start":"items-center"}\`},D.createElement("div",{className:"flex-1 flex flex-col gap-0.5"},D.createElement("div",{className:"flex items-center gap-1.5"},D.createElement("span",
{className:m?"text-muted-foreground":"",id:k},a),f!==void 0&&f!==null&&D.createElement("span",{"data-testid":"settings-row-badge",className:"text-[10px] font-semibold leading-none bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full select-none border border-border"},f)),b&&D.createElement("span",{className:"text-sm text-muted-foreground whitespace-pre-wrap",id:l},b),d&&D.createElement("div",{className:"w-full"},d)),c&&D.createElement("div",{className:"shrink-0"},c));
};`;
code = code.replace(oldXt, newXt);

// 2.4.1 注入 XB 会话标题核心输出枢纽（含中文直通、占位符显示映射、持久化缓存/历史全量字典兜底）
const xbTarget = 'function XB(a){var b=a?.annotations?.title?.trim();return a?.annotations?.coordinator?b||"Coordinator":b||a?.summary?.trim()||void 0}';
if (!code.includes(xbTarget)) {
  throw new Error('❌ 未在 hub_main.js 中找到 XB(a) 目标函数签名，终止编译！');
}
const xbReplacement = `function XB(a){
  var _isStr = typeof a === 'string';
  var _isCoord = !_isStr && !!(a && a.annotations && a.annotations.coordinator);
  var _raw = _isStr
    ? a.trim()
    : (a?.annotations?.title?.trim() || a?.summary?.trim() || a?.title?.trim() || void 0);
  if (!_raw) return _isCoord ? "智能体助手" : void 0;
  if (/[\\u4e00-\\u9fa5]/.test(_raw)) return _raw;
  if (_raw === "Untitled Conversation") return "未命名对话";
  if (_raw === "New Conversation") return "新对话";
  if (_raw === "Coordinator") return "智能体助手";
  if (_raw === "Parent Conversation") return "父级对话";
  var _im = ${JSON.stringify(mergedIdToZh)};
  var _pm = ${JSON.stringify(mergedEnToZh)};
  var _pmLow = ${JSON.stringify(mergedLowerEnToZh)};
  var _cid = !_isStr ? (a?.cascadeId || a?.id) : void 0;
  if (typeof window !== 'undefined') {
    if (_cid && window.__agyZhIdCache && window.__agyZhIdCache[_cid]) return window.__agyZhIdCache[_cid];
    if (window.__agyZhTitleCache && window.__agyZhTitleCache[_raw]) return window.__agyZhTitleCache[_raw];
    if (window.__agyZhTitleCache) {
      var _wLow = _raw.toLowerCase();
      for (var _wk in window.__agyZhTitleCache) {
        if (_wk.toLowerCase() === _wLow) return window.__agyZhTitleCache[_wk];
      }
    }
  }
  if (_cid && _im[_cid]) return _im[_cid];
  if (_pm[_raw]) return _pm[_raw];
  var _low = _raw.toLowerCase();
  if (_pmLow[_low]) return _pmLow[_low];
  return _raw;
}`;
code = code.replace(xbTarget, xbReplacement);
console.log('✔ [锚点 1/6] 已重建 XB(a) 会话标题输出枢纽');

// 2.4.2 封堵 4 处绕过 XB(a) 直接读取 annotations?.title / title 的渲染点
const bypassRules = [
  {
    name: '搜索结果列表项 label',
    from: 'label:a.title||"Untitled Conversation"',
    to: 'label:XB({cascadeId:a.cascadeId,title:a.title,summary:a.title})||a.title||"未命名对话"'
  },
  {
    name: '活跃会话索引列表 ($2a)',
    from: 'a=a.annotations?.title||d||`Conversation ${f.slice(0,8)}`',
    to: 'a=XB({cascadeId:f,annotations:a.annotations,summary:d||a.summary})||a.annotations?.title||d||`对话 ${f.slice(0,8)}`'
  },
  {
    name: '父级追溯链路标题 (OYc)',
    from: 'title:g?.annotations?.title?.trim()||g?.summary||"Parent Conversation"',
    to: 'title:XB(g)||g?.annotations?.title?.trim()||g?.summary||"父级对话"'
  },
  {
    name: '上下文引用作用域条目标题',
    from: 'g=d.annotations?.title?.trim()||g;',
    to: 'g=XB(d)||d.annotations?.title?.trim()||g;'
  }
];

for (let i = 0; i < bypassRules.length; i++) {
  const rule = bypassRules[i];
  if (!code.includes(rule.from)) {
    throw new Error(`❌ 未命中绕过点 [${rule.name}]: ${rule.from}`);
  }
  code = code.replace(rule.from, rule.to);
  console.log(`✔ [锚点 ${i + 2}/6] 已封堵绕过点: ${rule.name}`);
}

// 2.4.3 在 Hub 根组件 vcc 注入实时 Redux 监听与原生 RPC 自动翻译持久化守卫
const vccAnchor = 'var vcc=()=>{var a=SO(),b=Xk(),c=ZP(),d=xQ(),{updateConversationAnnotations:f}=PB(),g=tC(),h=wQ();';
if (!code.includes(vccAnchor)) {
  throw new Error('❌ 未找到 vcc 根组件挂载锚点，终止编译！');
}
const vccWatcherBlock = `(0,D.useEffect)(()=>{
  try{
    if(typeof window==='undefined')return;
    if(window.location&&window.location.pathname&&window.location.pathname.indexOf('settings')!==-1)return;
    window.__agyZhTitleCache=window.__agyZhTitleCache||{};
    window.__agyZhIdCache=window.__agyZhIdCache||{};
    if(!window.__agyTitleAutoLocalizer){
      window.__agyTitleAutoLocalizer={
        seenPairs:new Set(),
        idAttempts:new Map(),
        failAttempts:new Map(),
        inFlight:new Set(),
        queue:[],
        processing:false
      };
    }
    var _st=window.__agyTitleAutoLocalizer;
    var _isPlaceholder=function(_t){
      var _s=String(_t||'').trim();
      if(!_s)return true;
      return /^(Untitled Conversation|New Conversation|New Chat|Coordinator|Parent Conversation|Conversation\\s+[0-9a-f-]{6,})$/i.test(_s);
    };
    var _needsLocalization=function(_t){
      var _s=String(_t||'').trim();
      if(!_s||_s.length<2)return false;
      if(/[\\u4e00-\\u9fa5]/.test(_s))return false;
      if(!/[A-Za-z]{2,}/.test(_s))return false;
      if(_isPlaceholder(_s))return false;
      return true;
    };
    var _drainQueue=async function(){
      if(_st.processing)return;
      _st.processing=true;
      try{
        while(_st.queue.length>0){
          var _job=_st.queue.shift();
          if(!_job)continue;
          var _cid=_job.cid,_raw=_job.raw;
          var _pair=_cid+'::'+_raw;
          if(_st.inFlight.has(_pair))continue;
          if((_st.idAttempts.get(_cid)||0)>=2)continue;
          if((_st.failAttempts.get(_pair)||0)>=3)continue;
          _st.inFlight.add(_pair);
          _st.seenPairs.add(_pair);
          try{
            var _resp=await fetch('/translate-title?id='+encodeURIComponent(_cid)+'&text='+encodeURIComponent(_raw));
            if(_resp&&_resp.ok){
              var _data=await _resp.json();
              if(_data&&_data.ok&&_data.translated&&/[\\u4e00-\\u9fa5]/.test(_data.translated)&&_data.translated!==_raw){
                window.__agyZhTitleCache[_raw]=_data.translated;
                window.__agyZhIdCache[_cid]=_data.translated;
                if(_data.persistable===true){
                  var _curState=b.getState();
                  var _curMap=_curState?.trajectorySummaries?.summaries||(typeof Ml!=='undefined'?Ml.summaries:void 0)||{};
                  var _curSummary=_curMap[_cid];
                  var _curRaw=_curSummary?.annotations?.title?.trim()||_curSummary?.summary?.trim()||'';
                  if(!_curRaw||!/[\\u4e00-\\u9fa5]/.test(_curRaw)){
                    if(typeof f==='function'){
                      await f([_cid],dc(Df.ConversationAnnotationsSchema,{title:_data.translated}),!0);
                      try{b.dispatch(Ll({cascadeId:_cid,annotations:{title:_data.translated}}));}catch(_de){}
                      _st.idAttempts.set(_cid,(_st.idAttempts.get(_cid)||0)+1);
                      try{fetch('/log-title-persisted?id='+encodeURIComponent(_cid)+'&from='+encodeURIComponent(_raw)+'&to='+encodeURIComponent(_data.translated)+'&source='+encodeURIComponent(_data.source||'')).catch(function(){});}catch(_le){}
                    }
                  }
                }
              }else if(_data&&_data.source==='none'){
                var _fc=(_st.failAttempts.get(_pair)||0)+1;
                _st.failAttempts.set(_pair,_fc);
                if(_fc<3)_st.seenPairs.delete(_pair);
              }
            }else{
              var _hc=(_st.failAttempts.get(_pair)||0)+1;
              _st.failAttempts.set(_pair,_hc);
              if(_hc<3)_st.seenPairs.delete(_pair);
            }
          }catch(_je){
            var _ec=(_st.failAttempts.get(_pair)||0)+1;
            _st.failAttempts.set(_pair,_ec);
            if(_ec<3)_st.seenPairs.delete(_pair);
          }finally{
            _st.inFlight.delete(_pair);
          }
          await new Promise(function(_r){setTimeout(_r,250);});
        }
      }finally{
        _st.processing=false;
        if(_st.queue.length>0)setTimeout(_drainQueue,200);
      }
    };
    var _scanSummaries=function(){
      try{
        var _state=b.getState();
        var _summaries=_state?.trajectorySummaries?.summaries||(typeof Ml!=='undefined'?Ml.summaries:void 0);
        if(!_summaries)return;
        var _startingSet=new Set((typeof dwa==='function'?dwa(_state):[])||[]);
        var _queuedIds=new Set(_st.queue.map(function(_q){return _q.cid;}));
        var _candidates=[];
        var _keys=Object.keys(_summaries);
        for(var _idx=0;_idx<_keys.length;_idx++){
          var _cid=_keys[_idx];
          var _item=_summaries[_cid];
          if(!_item||_startingSet.has(_cid)||_item.annotations?.coordinator)continue;
          var _raw=_item.annotations?.title?.trim()||_item.summary?.trim()||'';
          if(!_needsLocalization(_raw))continue;
          var _pair=_cid+'::'+_raw;
          if(_st.seenPairs.has(_pair)||_st.inFlight.has(_pair)||_queuedIds.has(_cid))continue;
          if((_st.idAttempts.get(_cid)||0)>=2)continue;
          if((_st.failAttempts.get(_pair)||0)>=3)continue;
          var _ts=Number(_item.lastModifiedTime?.seconds||_item.trajectoryMetadata?.createdAt?.seconds||0);
          _candidates.push({cid:_cid,raw:_raw,ts:_ts});
        }
        if(_candidates.length===0)return;
        _candidates.sort(function(_x,_y){return _y.ts-_x.ts;});
        for(var _k=0;_k<_candidates.length;_k++){
          _st.queue.push({cid:_candidates[_k].cid,raw:_candidates[_k].raw});
        }
        _drainQueue();
      }catch(_se){}
    };
    var _timer=null;
    var _initTimer=setTimeout(_scanSummaries,600);
    var _unsub=b.subscribe(function(){
      clearTimeout(_timer);
      _timer=setTimeout(_scanSummaries,800);
    });
    return function(){
      clearTimeout(_initTimer);
      clearTimeout(_timer);
      try{if(typeof _unsub==='function')_unsub();}catch(_ue){}
    };
  }catch(_ee){}
},[b,f]);`;
code = code.replace(vccAnchor, vccAnchor + vccWatcherBlock);
console.log('✔ [锚点 6/6] 已注入 vcc 实时监听与原生 RPC 标题持久化守卫');

// 2.5 终极注入：劫持设置元数据工厂 sT(a)
const stHeader = 'function sT(a){';
const stHook = `function sT(a){
  const _optMap = ${JSON.stringify(optionValues)};
  const _lblMap = ${JSON.stringify(rowLabels)};
  const _dscMap = ${JSON.stringify(rowDescriptions)};
  function _wrapMap(m) {
    if (!m || !m.forEach) return m;
    m.forEach((val, key) => {
      if (val && typeof val === 'object') {
        if (typeof val.label === 'string' && _lblMap[val.label]) val.label = _lblMap[val.label];
        if (typeof val.description === 'string' && _dscMap[val.description]) val.description = _dscMap[val.description];
        if (typeof val.resolveOptionToString === 'function') {
          const _orig = val.resolveOptionToString;
          val.resolveOptionToString = function(...args) {
            const res = _orig.apply(this, args);
            return (typeof res === 'string' && _optMap[res]) ? _optMap[res] : res;
          };
        }
      }
    });
    return m;
  }
`;
code = code.replace(stHeader, stHook);

// 配对 wrap Map 的起始和闭合
const stReturn = 'return new Map([["useAICredits"';
code = code.replace(stReturn, 'return _wrapMap(new Map([["useAICredits"');
const actualStEnd = 'settingType:"switch"}]])}var vKb=sT();';
code = code.replace(actualStEnd, 'settingType:"switch"}]]))}' + 'var vKb=sT();');

// 2.6 注入手写组件内的特定文本（Token 用量、Show breakdown、Demoted、Excluded 等）
code = code.replace('The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.',
  '下方图表展示了规则（Rules）、技能（Skills）及 MCP 扩展工具对上下文 Token 预算的占用情况。当超出配额上限时，大型规则会自动降级为文件路径指针，大型自定义项会被自动从上下文中排除。');

code = code.replace('C?"Hide breakdown":`Show ${A.length} breakdown${A.length===1?"":"s"}`',
  'C?"收起用量明细":`展开查看 ${A.length} 项明细`');

code = code.replace('M?"Hide tools":`${N.length} tools`',
  'M?"隐藏工具列表":`${N.length} 项工具`');

code = code.replace('Y="Demoted"', 'Y="降级为路径指针"');
code = code.replace('Y="Excluded"', 'Y="超出预算已排除"');

code = code.replace('D.createElement("span",{className:"font-medium text-secondary-foreground"},"Rules")',
  'D.createElement("span",{className:"font-medium text-secondary-foreground"},"指令规则 (Rules)")');

code = code.replace('a.length>0?"Other Customizations":"Customizations"',
  'a.length>0?"其他扩展与技能":"自定义扩展与技能"');

// 2.7 浏览器页面手写组件（uPb）按钮与文本
code = code.replace('D.createElement(Aw,{name:"arrow_back",size:16}),D.createElement("span",{className:"font-medium"},"Back"))',
  'D.createElement(Aw,{name:"arrow_back",size:16}),D.createElement("span",{className:"font-medium"},"返回"))');

code = code.replace('"Clear visited URLs and autocomplete suggestions from the built-in browser."',
  '"清除内置浏览器的访问历史记录、Cookie 与搜索建议缓存。"');

code = code.replace('Clear browser history', '清除浏览记录');
code = code.replace('>Reset<', '>重置<');
code = code.replace('"Reset"', '"重置"');
code = code.replace('"Change\\u2026"', '"更改目录\\u2026"');
code = code.replace('>Clear<', '>立即清除<');
code = code.replace('"Clear"', '"立即清除"');
code = code.replace('"Edit"', '"编辑规则"');

// 2.8 侧边栏及右键菜单静态替换
code = code.replace('select-none"},"Settings"))', 'select-none"},"设置中心 (Settings)"))');
code = code.replace('select-none"},"Workspaces"))', 'select-none"},"工作区偏好 (Workspaces)"))');
code = code.replace('select-none"},"Projects"))', 'select-none"},"项目分组 (Projects)"))');
code = code.replace('children:b?"Show Less":"Show All"', 'children:b?"收起列表":"展开全部"');
code = code.replace('children:v?"Show Less":"Show All"', 'children:v?"收起列表":"展开全部"');
code = code.replace('"Not in Project"', '"未归属项目"');

// 2.9 对话框与右键菜单精确替换
const staticDict = [
  { from: '"Ask anything, @ to mention"', to: '"向 Antigravity 提问，输入 @ 提及"' },
  { from: '", / for actions"', to: '"，/ 执行操作"' },
  { from: '"Message subagent, @ to mention"', to: '"向子智能体发送消息，输入 @ 提及"' },
  { from: '"Listening. Ask anything."', to: '"已就绪，请输入任何问题或任务。"' },
  { from: '"Rename"', to: '"重命名"' },
  { from: '"Pin"', to: '"固定会话"' },
  { from: '"Unpin"', to: '"取消固定"' },
  { from: '"Archive"', to: '"归档会话"' },
  { from: '"Unarchive"', to: '"取消归档"' },
  { from: '"Split"', to: '"拆分视图"' },
  { from: '"Split Right"', to: '"向右拆分"' },
  { from: '"Split Down"', to: '"向下拆分"' },
  { from: '"Copy"', to: '"复制"' },
  { from: '"Copy Link"', to: '"复制链接"' },
  { from: '"Delete"', to: '"删除会话"' }
];

for (const s of staticDict) {
  let pos = 0;
  while (true) {
    let idx = code.indexOf(s.from, pos);
    if (idx === -1) break;
    pos = idx + s.to.length;
    code = code.slice(0, idx) + s.to + code.slice(idx + s.from.length);
  }
}

// 2.10 注入全局自适应 DOM 清洗监听器（兜底防线）
const globalZhDictionary = {
  ...screenTitles,
  ...utTitles,
  ...sectionTitles,
  ...rowLabels,
  ...optionValues,
  ...actionWords,
  "Configure default behaviors, skills, and MCP servers.": "配置智能体默认行为、技能库及 MCP 外部工具服务器。",
  "Settings for conversations outside of projects.": "未归属具体项目的独立对话会话及全局自定义扩展配置。",
  "Configure built-in browser, link opening, and browser subagent preferences.": "配置内置浏览器运行环境、链接打开方式及浏览器子智能体偏好。",
  "The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.": "下方图表展示了规则（Rules）、技能（Skills）及 MCP 扩展工具对上下文 Token 预算的占用情况。当超出配额上限时，大型规则会自动降级为文件路径指针，大型自定义项会被自动从上下文中排除。",
  "Search shortcuts": "搜索键盘快捷键",
  "Search MCP servers by name": "按名称搜索 MCP 服务器",
  "Clear search": "清空搜索内容",
  "Add MCP Servers": "添加 MCP 服务器",
  "Manage Hooks": "管理生命周期钩子",
  "Build With Google Plugins": "Google 官方插件库",
  "No quota information available.": "暂无可用配额信息。",
  "Refresh quota and credits data": "刷新配额与积分数据",
  "Enable AI Credit Overages": "启用 AI 积分超额自动扣费",
  "Available AI Credits:": "可用 AI 积分：",
  "See Activity": "查看用量明细",
  "Get More AI Credits": "获取更多积分",
  "Connecting to language server...": "正在连接语言服务器...",
  "Loading workspace customizations...": "正在加载工作区自定义扩展...",
  "There are no customizations enabled.": "当前未启用任何自定义扩展。",
  "Ask anything, @ to mention, / for actions": "向 Antigravity 提问，输入 @ 提及，/ 执行操作",
  "Rename": "重命名",
  "Pin": "固定会话",
  "Unpin": "取消固定",
  "Archive": "归档会话",
  "Split": "拆分视图",
  "Copy": "复制",
  "Settings": "打开设置"
};

const domCleanerScript = `
// ==========================================
// Antigravity 全局自适应运行时 DOM 清洗引擎
// ==========================================
(function() {
  if (typeof window === 'undefined') return;
  const zhMap = ${JSON.stringify(globalZhDictionary)};

  function translateNode(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      const text = node.nodeValue ? node.nodeValue.trim() : '';
      if (text && zhMap[text]) {
        node.nodeValue = node.nodeValue.replace(text, zhMap[text]);
      }
    } else if (node.nodeType === 1) {
      if (node.placeholder && zhMap[node.placeholder]) {
        node.placeholder = zhMap[node.placeholder];
      }
      if (node.title && zhMap[node.title]) {
        node.title = zhMap[node.title];
      }
      const aria = node.getAttribute('aria-label');
      if (aria && zhMap[aria]) {
        node.setAttribute('aria-label', zhMap[aria]);
      }
      for (let child of node.childNodes) {
        translateNode(child);
      }
    }
  }

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.addedNodes) {
        for (const n of m.addedNodes) translateNode(n);
      }
      if (m.type === 'characterData' && m.target) {
        const text = m.target.nodeValue ? m.target.nodeValue.trim() : '';
        if (text && zhMap[text]) {
          m.target.nodeValue = m.target.nodeValue.replace(text, zhMap[text]);
        }
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      translateNode(document.body);
    });
  } else if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    translateNode(document.body);
  }
})();
`;

const runtimeTitleCacheInit = `
(function() {
  if (typeof window === 'undefined') return;
  window.__agyZhIdCache = Object.assign(${JSON.stringify(mergedIdToZh)}, window.__agyZhIdCache || {});
  window.__agyZhTitleCache = Object.assign(${JSON.stringify(mergedEnToZh)}, window.__agyZhTitleCache || {});
})();
`;

code = runtimeTitleCacheInit + '\n' + domCleanerScript + '\n' + code;

// 2.11 关键指纹断言（防止混淆锚点缺失导致静默失效）
const requiredOutputMarkers = [
  '__agyTitleAutoLocalizer',
  'updateConversationAnnotations',
  '/translate-title',
  'ConversationAnnotationsSchema',
  'label:XB({cascadeId:a.cascadeId,title:a.title,summary:a.title})',
  'a=XB({cascadeId:f,annotations:a.annotations,summary:d||a.summary})',
  'title:XB(g)||',
  'g=XB(d)||'
];
for (const marker of requiredOutputMarkers) {
  if (!code.includes(marker)) {
    throw new Error('❌ 输出产物缺少关键指纹，中断写入: ' + marker);
  }
}

// 写入目标和备份
fs.writeFileSync(dstPath, code, 'utf8');
fs.writeFileSync(backupDst, code, 'utf8');
console.log('✔ 已成功编译并部署全量终极中文引擎（含实时标题自动翻译与持久化）！大小:', code.length);
