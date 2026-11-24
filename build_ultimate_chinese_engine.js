const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { getTargetPaths } = require('./src/config');
const {
  findByAnchorRegex,
  replaceAllByAnchorRegex,
  locateTitleRpcModule,
  locateThoughtModule,
  locateTableModule
} = require('./src/core_injector');
const { DOM_CLEANER_V2_MARKER, buildDomCleanerRuntimeScript } = require('./src/dom_cleaner');

const { agyExtDir } = getTargetPaths();
const localSrcPath = path.join(__dirname, 'hub_main.js');
const liveSrcPath = path.join(agyExtDir, 'hub_main.js');
// 优先使用当前安装目录的官方最新版 hub_main.js，防止升级后沿用本地旧版缓存
const srcPath = fs.existsSync(liveSrcPath) ? liveSrcPath : localSrcPath;
const dstPath = path.join(agyExtDir, 'hub_main_zh.js');
const backupDst = path.join(__dirname, 'hub_main_zh.js');
const dictPath = path.join(__dirname, 'src', 'title_dicts.json');
const cachePath = path.join(__dirname, 'src', 'title_cache.json');

if (!fs.existsSync(srcPath)) {
  throw new Error(`❌ 未找到官方静态源 hub_main.js（已检查 ${liveSrcPath} 与 ${localSrcPath}），请确认 Antigravity IDE 安装路径或设置 ANTIGRAVITY_IDE_DIR`);
}
if (srcPath === liveSrcPath) {
  try {
    const liveBuf = fs.readFileSync(liveSrcPath);
    if (!fs.existsSync(localSrcPath) || Buffer.compare(liveBuf, fs.readFileSync(localSrcPath)) !== 0) {
      fs.writeFileSync(localSrcPath, liveBuf);
    }
  } catch (_e) {}
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
// 2. 抗混淆结构化注入与分级韧性引擎 (Anti-Obfuscation & Tiered Resilience)
//    - 基础核心层 (core)：抗混淆动态定位 vT/uT/yT/xT/sT + 静态词条 + DOM 清洗器
//    - 独立增强层 (titleHub / titleRpc / thought / table)：各自前置校验耦合符号，
//      兼容则全量注入，新版重构单个模块时自动安全降级跳过该模块，绝不拖垮整体汉化
// =========================================================================

const STRICT_MODE = process.argv.includes('--strict');
const moduleStatus = {
  coreSettings: { enabled: false, hits: [], missing: [] },
  titleHub: { enabled: false, reason: '' },
  titleRpc: { enabled: false, reason: '' },
  thoughtHeader: { enabled: false, reason: '' },
  thoughtStream: { enabled: false, reason: '' },
  tableLayout: { enabled: false, reason: '' }
};
const skippedModules = [];
const activeOutputMarkers = [];

function recordSkipped(modName, reason) {
  skippedModules.push({ module: modName, reason });
  console.warn(`⚠ [降级跳过] ${modName}: ${reason}`);
}

// 2.1 抗混淆注入 vT 导航名称（窄窗口动态捕获函数名、参数名与路由 Map 变量名）
const vtRegex = /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return ([A-Za-z_$][\w$]*)\.get\(\2\)\?\?\2\}/;
const vtMatch = findByAnchorRegex(code, '){return ', vtRegex, 30, 60);
if (vtMatch) {
  const [vtFull, vtFn, vtArg, vtMap] = vtMatch;
  const vtReplacement = `function ${vtFn}(${vtArg}){
  const _screens = ${JSON.stringify(screenTitles)};
  return _screens[${vtArg}] || (${vtMap}.get(${vtArg}) ?? ${vtArg});
}`;
  code = code.slice(0, vtMatch.index) + vtReplacement + code.slice(vtMatch.index + vtFull.length);
  moduleStatus.coreSettings.hits.push(`vT(${vtFn})`);
} else {
  moduleStatus.coreSettings.missing.push('vT');
}

// 2.2 抗混淆注入 uT 页面大标题与长篇说明（窄窗口动态捕获组件名与解构参数名）
const utRegex = /([A-Za-z_$][\w$]*)=\(\{title:([A-Za-z_$][\w$]*),description:([A-Za-z_$][\w$]*),children:([A-Za-z_$][\w$]*),scrollable:([A-Za-z_$][\w$]*)=!0,headerRight:([A-Za-z_$][\w$]*),onBack:([A-Za-z_$][\w$]*)\}\)=>\{/;
const utMatch = findByAnchorRegex(code, ',scrollable:', utRegex, 90, 90);
if (utMatch) {
  const [utFull, utFn, utTitle, utDesc] = utMatch;
  const utInject = `
  const _titles = ${JSON.stringify(utTitles)};
  const _descs = ${JSON.stringify(utDescriptions)};
  if (typeof ${utTitle} === 'string' && _titles[${utTitle}]) ${utTitle} = _titles[${utTitle}];
  if (typeof ${utDesc} === 'string' && _descs[${utDesc}]) ${utDesc} = _descs[${utDesc}];
`;
  code = code.slice(0, utMatch.index) + utFull + utInject + code.slice(utMatch.index + utFull.length);
  moduleStatus.coreSettings.hits.push(`uT(${utFn})`);
} else {
  moduleStatus.coreSettings.missing.push('uT');
}

// 2.3 抗混淆注入 yT 分区标题（窄窗口动态捕获组件名与 title 参数名）
const ytRegex = /([A-Za-z_$][\w$]*)=\(\{title:([A-Za-z_$][\w$]*),subtitle:([A-Za-z_$][\w$]*),headerRight:([A-Za-z_$][\w$]*),id:([A-Za-z_$][\w$]*),count:([A-Za-z_$][\w$]*),collapsible:([A-Za-z_$][\w$]*)=!1,defaultCollapsed:([A-Za-z_$][\w$]*)=!1,forceExpanded:([A-Za-z_$][\w$]*)=!1,children:([A-Za-z_$][\w$]*)\}\)=>\{/;
const ytMatch = findByAnchorRegex(code, ',defaultCollapsed:', ytRegex, 140, 90);
if (ytMatch) {
  const [ytFull, ytFn, ytTitle] = ytMatch;
  const ytInject = `
  const _secTitles = ${JSON.stringify(sectionTitles)};
  if (typeof ${ytTitle} === 'string' && _secTitles[${ytTitle}]) ${ytTitle} = _secTitles[${ytTitle}];
`;
  code = code.slice(0, ytMatch.index) + ytFull + ytInject + code.slice(ytMatch.index + ytFull.length);
  moduleStatus.coreSettings.hits.push(`yT(${ytFn})`);
} else {
  moduleStatus.coreSettings.missing.push('yT');
}

// 2.4 抗混淆注入 xT 卡片行渲染器（窄窗口定位，原样保留官方 JSX）
const xtRegex = /var ([A-Za-z_$][\w$]*)=\(\{label:([A-Za-z_$][\w$]*),description:([A-Za-z_$][\w$]*),rightElement:([A-Za-z_$][\w$]*),extraContent:([A-Za-z_$][\w$]*),badge:([A-Za-z_$][\w$]*),alignItems:([A-Za-z_$][\w$]*)=["']center["'],unpadded:([A-Za-z_$][\w$]*)=!1,labelId:([A-Za-z_$][\w$]*),descriptionId:([A-Za-z_$][\w$]*),disabled:([A-Za-z_$][\w$]*)=!1,"data-testid":([A-Za-z_$][\w$]*)\}\)=>/;
const xtMatch = findByAnchorRegex(code, ',unpadded:', xtRegex, 180, 120);
if (xtMatch) {
  const [xtHead, xtFn, xtLbl, xtDesc] = xtMatch;
  const xtBodyStart = xtMatch.index + xtHead.length;
  const nextVar = code.indexOf(';var ', xtBodyStart);
  if (nextVar !== -1) {
    const origBody = code.slice(xtBodyStart, nextVar);
    let newXt;
    if (origBody.startsWith('{')) {
      newXt = `${xtHead}{
  const _labels = ${JSON.stringify(rowLabels)};
  const _descs = ${JSON.stringify(rowDescriptions)};
  if (typeof ${xtLbl} === 'string' && _labels[${xtLbl}]) ${xtLbl} = _labels[${xtLbl}];
  if (typeof ${xtDesc} === 'string' && _descs[${xtDesc}]) ${xtDesc} = _descs[${xtDesc}];
${origBody.slice(1)}`;
    } else {
      newXt = `${xtHead}{
  const _labels = ${JSON.stringify(rowLabels)};
  const _descs = ${JSON.stringify(rowDescriptions)};
  if (typeof ${xtLbl} === 'string' && _labels[${xtLbl}]) ${xtLbl} = _labels[${xtLbl}];
  if (typeof ${xtDesc} === 'string' && _descs[${xtDesc}]) ${xtDesc} = _descs[${xtDesc}];
  return (${origBody});
}`;
    }
    code = code.slice(0, xtMatch.index) + newXt + code.slice(nextVar);
    moduleStatus.coreSettings.hits.push(`xT(${xtFn})`);
  } else {
    moduleStatus.coreSettings.missing.push('xT_end');
  }
} else {
  moduleStatus.coreSettings.missing.push('xT');
}

// 2.4.1 模块 A：抗混淆注入 XB 会话标题核心输出枢纽（窄窗口动态捕获真实函数名）
const xbRegex = /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{var ([A-Za-z_$][\w$]*)=\2\?\.annotations\?\.title\?\.trim\(\);return \2\?\.annotations\?\.coordinator\?\3\|\|"Coordinator":\3\|\|\2\?\.summary\?\.trim\(\)\|\|void 0\}/;
const xbMatch = findByAnchorRegex(code, '?.annotations?.coordinator?', xbRegex, 100, 120);
let resolvedTitleFnName = '';
if (xbMatch) {
  const [xbFull, xbFn, xbArg] = xbMatch;
  resolvedTitleFnName = xbFn;
  const xbReplacement = `function ${xbFn}(${xbArg}){
  var _isStr = typeof ${xbArg} === 'string';
  var _isCoord = !_isStr && !!(${xbArg} && ${xbArg}.annotations && ${xbArg}.annotations.coordinator);
  var _raw = _isStr
    ? ${xbArg}.trim()
    : (${xbArg}?.annotations?.title?.trim() || ${xbArg}?.summary?.trim() || ${xbArg}?.title?.trim() || void 0);
  if (!_raw) return _isCoord ? "智能体助手" : void 0;
  if (/[\\u4e00-\\u9fa5]/.test(_raw)) return _raw;
  if (_raw === "Untitled Conversation") return "未命名对话";
  if (_raw === "New Conversation") return "新对话";
  if (_raw === "Coordinator") return "智能体助手";
  if (_raw === "Parent Conversation") return "父级对话";
  var _im = ${JSON.stringify(mergedIdToZh)};
  var _pm = ${JSON.stringify(mergedEnToZh)};
  var _pmLow = ${JSON.stringify(mergedLowerEnToZh)};
  var _cid = !_isStr ? (${xbArg}?.cascadeId || ${xbArg}?.id) : void 0;
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
  code = code.slice(0, xbMatch.index) + xbReplacement + code.slice(xbMatch.index + xbFull.length);
  console.log(`✔ [锚点 1/12] 已重建 ${xbFn}(${xbArg}) 会话标题输出枢纽`);

  // 2.4.2 抗混淆封堵 4 处绕过标题枢纽直接读取 annotations?.title / title 的渲染点（窄窗口毫秒级定位）
  const bypassRegexRules = [
    {
      name: '搜索结果列表项 label',
      anchor: '.title||"Untitled Conversation"',
      regex: /label:([A-Za-z_$][\w$]*)\.title\|\|"Untitled Conversation"/,
      build: (m) => `label:${xbFn}({cascadeId:${m[1]}.cascadeId,title:${m[1]}.title,summary:${m[1]}.title})||${m[1]}.title||"未命名对话"`
    },
    {
      name: '活跃会话索引列表 ($2a)',
      anchor: '||`Conversation ${',
      regex: /([A-Za-z_$][\w$]*)=\1\.annotations\?\.title\|\|([A-Za-z_$][\w$]*)\|\|`Conversation \$\{([A-Za-z_$][\w$]*)\.slice\(0,8\)\}`/,
      build: (m) => `${m[1]}=${xbFn}({cascadeId:${m[3]},annotations:${m[1]}.annotations,summary:${m[2]}||${m[1]}.summary})||${m[1]}.annotations?.title||${m[2]}||\`对话 \${${m[3]}.slice(0,8)}\``
    },
    {
      name: '父级追溯链路标题 (OYc)',
      anchor: '||"Parent Conversation"',
      regex: /title:([A-Za-z_$][\w$]*)\?\.annotations\?\.title\?\.trim\(\)\|\|\1\?\.summary\|\|"Parent Conversation"/,
      build: (m) => `title:${xbFn}(${m[1]})||${m[1]}?.annotations?.title?.trim()||${m[1]}?.summary||"父级对话"`
    },
    {
      name: '上下文引用作用域条目标题',
      anchor: '.annotations?.title?.trim()||',
      regex: /([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)\.annotations\?\.title\?\.trim\(\)\|\|\1;/,
      build: (m) => `${m[1]}=${xbFn}(${m[2]})||${m[2]}.annotations?.title?.trim()||${m[1]};`
    }
  ];

  let bypassHits = 0;
  for (let i = 0; i < bypassRegexRules.length; i++) {
    const rule = bypassRegexRules[i];
    const bm = findByAnchorRegex(code, rule.anchor, rule.regex, 80, 60);
    if (bm) {
      const rep = rule.build(bm);
      code = code.slice(0, bm.index) + rep + code.slice(bm.index + bm[0].length);
      bypassHits++;
      console.log(`✔ [锚点 ${i + 2}/12] 已封堵绕过点: ${rule.name}`);
    } else if (STRICT_MODE) {
      throw new Error(`❌ 未命中绕过点 [${rule.name}]`);
    } else {
      console.warn(`⚠ [降级跳过] 标题绕过点未命中: ${rule.name}`);
    }
  }
  moduleStatus.titleHub = { enabled: true, fnName: xbFn, bypassHits };
  activeOutputMarkers.push('软件界面中文化设置');
} else if (STRICT_MODE) {
  throw new Error('❌ 未在 hub_main.js 中找到会话标题枢纽函数签名，终止编译！');
} else {
  moduleStatus.titleHub = { enabled: false, reason: '未匹配到标题枢纽函数签名' };
  recordSkipped('会话标题显示枢纽 (XB)', '未匹配到标题枢纽函数签名');
}

// 2.4.3 模块 A-RPC：全抗混淆注入实时 Redux 监听与原生 RPC 自动翻译持久化守卫（兼容 vcc / sjc 等任意混淆名）
const rpcLoc = locateTitleRpcModule(code);
if (rpcLoc.matched) {
  const _R = rpcLoc.reactVar;
  const _S = rpcLoc.storeVar;
  const _RPC = rpcLoc.rpcVar;
  const _START = rpcLoc.startingFn;
  const _CRT = rpcLoc.createFn;
  const _PB = rpcLoc.pbMod;
  const _ACT = rpcLoc.patchActionFn;
  const vccWatcherBlock = `(0,${_R}.useEffect)(()=>{
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
                  var _curState=${_S}.getState();
                  var _curMap=_curState?.trajectorySummaries?.summaries||{};
                  var _curSummary=_curMap[_cid];
                  var _curRaw=_curSummary?.annotations?.title?.trim()||_curSummary?.summary?.trim()||'';
                  if(!_curRaw||!/[\\u4e00-\\u9fa5]/.test(_curRaw)){
                    if(typeof ${_RPC}==='function'){
                      await ${_RPC}([_cid],${_CRT}(${_PB}.ConversationAnnotationsSchema,{title:_data.translated}),!0);
                      try{${_S}.dispatch(${_ACT}({cascadeId:_cid,annotations:{title:_data.translated}}));}catch(_de){}
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
        var _state=${_S}.getState();
        var _summaries=_state?.trajectorySummaries?.summaries;
        if(!_summaries)return;
        var _startingSet=new Set((typeof ${_START}==='function'?${_START}(_state):[])||[]);
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
    var _unsub=${_S}.subscribe(function(){
      clearTimeout(_timer);
      _timer=setTimeout(_scanSummaries,800);
    });
    return function(){
      clearTimeout(_initTimer);
      clearTimeout(_timer);
      try{if(typeof _unsub==='function')_unsub();}catch(_ue){}
    };
  }catch(_ee){}
},[${_S},${_RPC}]);`;
  code = code.slice(0, rpcLoc.insertPos) + vccWatcherBlock + code.slice(rpcLoc.insertPos);
  console.log(`✔ [锚点 6/12] 已抗混淆注入 ${rpcLoc.compName} 实时监听与原生 RPC 标题持久化守卫 (React=${_R}, action=${_ACT})`);
  moduleStatus.titleRpc = { enabled: true, compName: rpcLoc.compName };
  activeOutputMarkers.push('__agyTitleAutoLocalizer', 'updateConversationAnnotations', '/translate-title', 'ConversationAnnotationsSchema');
} else if (STRICT_MODE) {
  throw new Error(`❌ 未找到会话标题 RPC 挂载锚点: ${rpcLoc.reason}`);
} else {
  moduleStatus.titleRpc = { enabled: false, reason: rpcLoc.reason };
  recordSkipped('会话标题 RPC 自动持久化守卫 (vcc/sjc)', rpcLoc.reason);
}

// 2.4.4 思维链头部计时与侧边追问标签静态汉化（窄窗口抗混淆正则）
const hacRegex = /([A-Za-z_$][\w$]*)>=0\?`Thinking for \$\{Math\.max\(1,\1\)\}s`:"Thinking"/;
const hacMatch = findByAnchorRegex(code, '>=0?`Thinking for ${Math.max(1,', hacRegex, 24, 60);
if (hacMatch) {
  const hacVar = hacMatch[1];
  const hacRep = `${hacVar}>=0?\`已思考 \${Math.max(1,${hacVar})} 秒\`:"正在思考"`;
  code = code.slice(0, hacMatch.index) + hacRep + code.slice(hacMatch.index + hacMatch[0].length);
  console.log('✔ [锚点 7/12] 已汉化 hAc 思考耗时头部动画文案');
  moduleStatus.thoughtHeader = { enabled: true };
  activeOutputMarkers.push('已思考 ');
} else if (STRICT_MODE) {
  throw new Error('❌ 未找到 hAc 思考计时头部锚点，终止编译！');
} else {
  moduleStatus.thoughtHeader = { enabled: false, reason: '未匹配到 Thinking for 计时文案' };
  recordSkipped('思维链计时头部文案 (hAc)', '未匹配到 Thinking for 计时文案');
}

// 侧边追问 (Side Question) 中的思考标签静态汉化
const sideThoughtPairs = [
  {
    from: 'q?`Thought for ${Math.max(1,Number(q.seconds))}s`:"Thought Process":"Thinking..."',
    to: 'q?`思考了 ${Math.max(1,Number(q.seconds))} 秒`:"思考过程":"正在思考..."'
  },
  {
    from: '`Thought for ${Math.max(1,Number(S.seconds))}s`:"Thought Process"',
    to: '`思考了 ${Math.max(1,Number(S.seconds))} 秒`:"思考过程"'
  },
  {
    from: 'opacity-70 animate-pulse"},"Thinking..."',
    to: 'opacity-70 animate-pulse"},"正在思考..."'
  },
  {
    from: '"aria-label":"Thinking..."',
    to: '"aria-label":"正在思考..."'
  }
];
for (const sp of sideThoughtPairs) {
  if (code.includes(sp.from)) {
    code = code.split(sp.from).join(sp.to);
  }
}

// 2.4.5 模块 B：全抗混淆重构思维链组件（动态捕获全部内部符号 + 零变量遮蔽，兼容 iAc / rTc 及任意混淆名）
const thoughtLoc = locateThoughtModule(code);
if (thoughtLoc.matched) {
  const _TR = thoughtLoc.reactVar;
  const _TCTX = thoughtLoc.ctxHook;
  const _TRUN = thoughtLoc.runStatusHook;
  const _TENUM = thoughtLoc.enumObj;
  const _TANIM = thoughtLoc.animHook;
  const _TSHIM = thoughtLoc.shimmerComp;
  const _THEAD = thoughtLoc.headerComp;
  const _TCOL = thoughtLoc.collapseComp;
  const _steerInit = thoughtLoc.featHook
    ? `var _feat=${thoughtLoc.featHook}(),_steer=_feat.get("conversationView")?.trajectorySteering,_steerBtn=_steer?.SteerButton,_steerEd=_steer?.SteerableThoughtEditor;`
    : `var _steerBtn=null,_steerEd=null;`;
  const newThoughtComp = `var ${thoughtLoc.compName}=({thinking:a,thinkingDuration:b,metadata:c,status:d,stepHasNonThinkingContent:f})=>{
  var {renderers:{markdown:_md},verboseAgentChat:_verbose}=${_TCTX}(),
    _k=_verbose??!1,
    _l=${_TRUN}()!==void 0&&${_TRUN}()=== ${_TENUM}.CascadeRunStatus.RUNNING,
    _m=(d===${_TENUM}.CortexStepStatus.RUNNING||d===${_TENUM}.CortexStepStatus.GENERATING)&&_l&&!f&&!b;
  var _n=${_TANIM}();
  ${_steerInit}
  var _engBoot=typeof window!=="undefined"?window.__agyThoughtEngine:null;
  var _stepInfo=c?.sourceTrajectoryStepInfo;
  var _stepKey=_stepInfo?(_stepInfo.trajectoryId+":"+_stepInfo.stepIndex):(_engBoot&&a?("txt:"+_engBoot.hashKey(_engBoot.normalize(String(a).slice(0,120)))):"anon");
  var _initUi=_engBoot?_engBoot.getStepUiState(_stepKey):null;
  var _initLocked=!!(_initUi&&!_initUi.manualClosed&&_initUi.locked);
  var _initNeedShortHold=!1;
  if(!_m&&_initUi&&_initUi.wasActive&&!_initUi.manualClosed&&!_initUi.graceDone&&!_initLocked&&!_initUi.hovered&&!_initUi.pinnedByHover&&!(_initUi.graceUntil&&_initUi.graceUntil>Date.now())&&_engBoot&&a){
    try{
      var _initParts=_engBoot.splitThoughtSegments(a,!1);
      for(var _ii=0;_ii<_initParts.length;_ii++){
        if(_initParts[_ii].kind==="sent"&&_initParts[_ii].translatable){_initNeedShortHold=!0;break;}
      }
      if(_initNeedShortHold&&_engBoot.setStepUiState){
        _engBoot.setStepUiState(_stepKey,{graceUntil:Date.now()+3500});
        _initUi=_engBoot.getStepUiState(_stepKey);
      }
    }catch(_ie){}
  }
  var _initHold=!!(_initUi&&!_initUi.manualClosed&&(_initLocked||_initUi.hovered||_initUi.pinnedByHover||_initNeedShortHold||(_initUi.graceUntil&&_initUi.graceUntil>Date.now())));
  var [_exp,_setExp]=(0,${_TR}.useState)(_m||_initHold);
  var [_holdActive,_setHoldActive]=(0,${_TR}.useState)(_initHold);
  var [_locked,_setLocked]=(0,${_TR}.useState)(_initLocked);
  var [_showOrig,_setShowOrig]=(0,${_TR}.useState)(!!(_initUi&&_initUi.showOrig));
  var [_tick,_setTick]=(0,${_TR}.useState)(0);
  var [_translating,_setTranslating]=(0,${_TR}.useState)(!1);
  var _wrapRef=(0,${_TR}.useRef)(null);
  var _prevMRef=(0,${_TR}.useRef)(_m);
  var _wasActiveRef=(0,${_TR}.useRef)(_m||!!(_initUi&&_initUi.wasActive));
  var _firstWaveSentRef=(0,${_TR}.useRef)(!!(_initUi&&_initUi.firstWaveSent));
  var _lockedRef=(0,${_TR}.useRef)(_initLocked);
  var _hoveredRef=(0,${_TR}.useRef)(!!(_initUi&&(_initUi.hovered||_initUi.pinnedByHover)));
  var _pinnedRef=(0,${_TR}.useRef)(!!(_initUi&&_initUi.pinnedByHover));
  var _seqRef=(0,${_TR}.useRef)(0);
  var _tempTailRef=(0,${_TR}.useRef)(new Map());
  var _failedRef=(0,${_TR}.useRef)(new Map());
  var _tailTrackRef=(0,${_TR}.useRef)({prefix:"",ts:0,sentKey:""});
  var _debounceRef=(0,${_TR}.useRef)(null);
  var _tailTimerRef=(0,${_TR}.useRef)(null);
  var _holdCloseRef=(0,${_TR}.useRef)(null);
  var _holdHardCapRef=(0,${_TR}.useRef)(null);
  var _syncUi=function(_patch){
    try{
      var _e=typeof window!=="undefined"?window.__agyThoughtEngine:null;
      if(_e&&_e.setStepUiState)_e.setStepUiState(_stepKey,_patch);
    }catch(_se){}
  };
  var _clearHoldTimers=function(){
    if(_holdCloseRef.current){clearTimeout(_holdCloseRef.current);_holdCloseRef.current=null;}
    if(_holdHardCapRef.current){clearTimeout(_holdHardCapRef.current);_holdHardCapRef.current=null;}
  };
  var _collapseNow=function(_isManual){
    _clearHoldTimers();
    _lockedRef.current=!1;
    _setLocked(!1);
    _hoveredRef.current=!1;
    _pinnedRef.current=!1;
    _syncUi({locked:!1,hovered:!1,pinnedByHover:!1,graceUntil:0,graceDone:!0,manualClosed:!!_isManual});
    _setHoldActive(!1);
    _setExp(!1);
  };
  var _scheduleGraceCollapse=function(_delayMs,_forceAfterLeave){
    if(_lockedRef.current)return;
    if(!_forceAfterLeave&&(_hoveredRef.current||_pinnedRef.current))return;
    if(_holdCloseRef.current){clearTimeout(_holdCloseRef.current);_holdCloseRef.current=null;}
    var _until=Date.now()+_delayMs;
    _syncUi({graceUntil:_until});
    _holdCloseRef.current=setTimeout(function(){
      _holdCloseRef.current=null;
      if(_lockedRef.current||_hoveredRef.current||_pinnedRef.current)return;
      _collapseNow(!1);
    },_delayMs);
  };
  var _enterHover=function(){
    _hoveredRef.current=!0;
    if(_lockedRef.current){
      _clearHoldTimers();
      _syncUi({hovered:!0});
      return;
    }
    if(_exp||_m||_holdActive){
      _pinnedRef.current=!0;
      _clearHoldTimers();
      _syncUi({hovered:!0,pinnedByHover:!0,manualClosed:!1,graceUntil:0});
      if(!_m&&!_holdActive)_setHoldActive(!0);
      if(!_exp)_setExp(!0);
    }else{
      _syncUi({hovered:!0});
    }
  };
  var _leaveHover=function(_ev,_fromPointerMove){
    if(_lockedRef.current){
      _hoveredRef.current=!1;
      _pinnedRef.current=!1;
      _syncUi({hovered:!1,pinnedByHover:!1});
      return;
    }
    if(!_fromPointerMove){
      var _el=_wrapRef.current;
      if(_el&&typeof _el.getBoundingClientRect==="function"&&_ev&&typeof _ev.clientX==="number"&&typeof _ev.clientY==="number"){
        var _r=_el.getBoundingClientRect();
        if(_ev.clientX>=_r.left-6&&_ev.clientX<=_r.right+6&&_ev.clientY>=_r.top-6&&_ev.clientY<=_r.bottom+6)return;
      }
      var _engPtr=typeof window!=="undefined"?window.__agyThoughtEngine:null;
      var _lp=_engPtr&&_engPtr.getLastPointer?_engPtr.getLastPointer():null;
      if(_pinnedRef.current&&_lp&&_lp.ts>0&&(Date.now()-_lp.ts)>220)return;
    }
    _hoveredRef.current=!1;
    var _wasPinned=_pinnedRef.current;
    _pinnedRef.current=!1;
    _syncUi({hovered:!1,pinnedByHover:!1});
    if(_m){
      _clearHoldTimers();
      if(_holdActive)_setHoldActive(!1);
    }else if(_wasPinned||_holdActive||_exp){
      _scheduleGraceCollapse(350,!0);
    }
  };
  (0,${_TR}.useEffect)(()=>{
    if(_m){
      _wasActiveRef.current=!0;
      _syncUi({wasActive:!0,manualClosed:!1,graceDone:!1});
    }
    if(_prevMRef.current!==_m){
      var _wasM=_prevMRef.current;
      _prevMRef.current=_m;
      if(_m){
        _clearHoldTimers();
        if(!_pinnedRef.current&&!_lockedRef.current)_setHoldActive(!1);
        _setExp(!0);
      }else if(_lockedRef.current){
        _clearHoldTimers();
        _syncUi({locked:!0,manualClosed:!1,graceUntil:0});
        _setHoldActive(!0);
        _setExp(!0);
      }else if(_hoveredRef.current||_pinnedRef.current){
        _clearHoldTimers();
        _pinnedRef.current=!0;
        _syncUi({hovered:!0,pinnedByHover:!0,manualClosed:!1,graceUntil:0});
        _setHoldActive(!0);
        _setExp(!0);
      }else if(_wasM&&_wasActiveRef.current&&!_showOrig){
        var _needHold=!1;
        try{
          var _hEng=typeof window!=="undefined"?window.__agyThoughtEngine:null;
          if(_hEng&&a){
            var _hParts=_hEng.splitThoughtSegments(a,!1);
            for(var _hi=0;_hi<_hParts.length;_hi++){
              if(_hParts[_hi].kind==="sent"&&_hParts[_hi].translatable){_needHold=!0;break;}
            }
          }
        }catch(_he){}
        if(_needHold){
          _syncUi({graceUntil:Date.now()+3500});
          _setHoldActive(!0);
          _setExp(!0);
          if(_holdHardCapRef.current)clearTimeout(_holdHardCapRef.current);
          _holdHardCapRef.current=setTimeout(function(){
            _holdHardCapRef.current=null;
            if(_lockedRef.current||_hoveredRef.current||_pinnedRef.current)return;
            _collapseNow(!1);
          },3500);
        }else{
          _collapseNow(!1);
        }
      }else{
        _collapseNow(!1);
      }
    }
  },[_m,_showOrig,a]);
  (0,${_TR}.useEffect)(()=>{
    if(!_holdActive&&!(_m&&_exp))return;
    if(!_m&&_holdActive&&!_lockedRef.current){
      var _u=_engBoot?_engBoot.getStepUiState(_stepKey):null;
      if(!_pinnedRef.current&&_u&&_u.graceUntil&&_u.graceUntil>Date.now()){
        var _rem=Math.max(300,_u.graceUntil-Date.now());
        if(!_translating)_scheduleGraceCollapse(_rem,!1);
        if(!_holdHardCapRef.current){
          _holdHardCapRef.current=setTimeout(function(){
            _holdHardCapRef.current=null;
            if(_lockedRef.current||_hoveredRef.current||_pinnedRef.current)return;
            _collapseNow(!1);
          },_rem);
        }
      }
    }
    var _onPointerMove=function(_ev){
      if(_lockedRef.current)return;
      if(!_pinnedRef.current&&!_hoveredRef.current)return;
      var _el=_wrapRef.current;
      if(!_el||typeof _el.getBoundingClientRect!=="function")return;
      var _r=_el.getBoundingClientRect();
      var _pad=10;
      var _inside=_ev.clientX>=_r.left-_pad&&_ev.clientX<=_r.right+_pad&&_ev.clientY>=_r.top-_pad&&_ev.clientY<=_r.bottom+_pad;
      if(_inside){
        _hoveredRef.current=!0;
        _pinnedRef.current=!0;
        _clearHoldTimers();
      }else{
        _leaveHover(_ev,!0);
      }
    };
    window.addEventListener("pointermove",_onPointerMove,{passive:!0});
    return function(){
      window.removeEventListener("pointermove",_onPointerMove);
    };
  },[_m,_exp,_holdActive,_locked,_translating,_stepKey]);
  (0,${_TR}.useEffect)(()=>{return function(){_clearHoldTimers();};},[]);
  (0,${_TR}.useEffect)(()=>{
    var _alive=!0;
    var _cleanup=()=>{
      if(_debounceRef.current){clearTimeout(_debounceRef.current);_debounceRef.current=null;}
      if(_tailTimerRef.current){clearTimeout(_tailTimerRef.current);_tailTimerRef.current=null;}
    };
    try{
      if(!a||!_k||!(_exp||_holdActive)||_showOrig)return _cleanup;
      var _eng=typeof window!=="undefined"?window.__agyThoughtEngine:null;
      if(!_eng)return _cleanup;
      var _parts=_eng.splitThoughtSegments(a,_m);
      var _needCommitted=[];
      var _seenBatch=new Set();
      var _tailPart=null;
      var _hasAnyZh=!1;
      for(var _i=0;_i<_parts.length;_i++){
        var _pt=_parts[_i];
        if(_pt.kind!=="sent"||!_pt.translatable)continue;
        if(_pt.committed){
          if(_eng.lookupSync(_pt.norm,_pt.key)){
            _hasAnyZh=!0;
          }else if(!_seenBatch.has(_pt.key)&&((_failedRef.current.get(_pt.key)||0)<2)){
            _seenBatch.add(_pt.key);
            _needCommitted.push({id:_pt.key,text:_pt.norm,persist:!0});
          }
        }else{
          _tailPart=_pt;
          if(_tempTailRef.current.has(_pt.key))_hasAnyZh=!0;
        }
      }
      if(_needCommitted.length>0){
        var _runCommitted=async function(){
          _firstWaveSentRef.current=!0;
          _syncUi({firstWaveSent:!0});
          var _mySeq=++_seqRef.current;
          if(_alive)_setTranslating(!0);
          try{
            var _res=await _eng.requestBatch(_needCommitted);
            if(_res&&_res.ok&&Array.isArray(_res.results)){
              var _changed=!1;
              for(var _rIdx=0;_rIdx<_res.results.length;_rIdx++){
                var _rItem=_res.results[_rIdx];
                if(_rItem&&_rItem.translated&&_rItem.source!=="fallback"&&_rItem.source!=="skip"){
                  _eng.setCached(_rItem.id,_rItem.translated);
                  _tempTailRef.current.delete(_rItem.id);
                  _failedRef.current.delete(_rItem.id);
                  _changed=!0;
                }else if(_rItem&&_rItem.source==="fallback"){
                  _failedRef.current.set(_rItem.id,(_failedRef.current.get(_rItem.id)||0)+1);
                  _changed=!0;
                }
              }
              if(_alive&&_changed)_setTick(function(_v){return _v+1;});
            }
          }catch(_e){}finally{
            if(_alive&&_mySeq===_seqRef.current){
              _setTranslating(!1);
              if(!_m&&_holdActive&&!_lockedRef.current&&!_hoveredRef.current&&!_pinnedRef.current)_scheduleGraceCollapse(1500,!1);
            }
          }
        };
        if(!_m||!_firstWaveSentRef.current){
          _runCommitted();
        }else{
          _debounceRef.current=setTimeout(_runCommitted,200);
        }
      }else if(_m&&_tailPart){
        var _tPrefix=_tailPart.norm.slice(0,24);
        var _now=Date.now();
        if(_tailTrackRef.current.prefix!==_tPrefix){
          _tailTrackRef.current={prefix:_tPrefix,ts:_now,sentKey:""};
        }
        var _tailMinLen=_hasAnyZh?140:45;
        var _tailDelayMs=_hasAnyZh?1500:350;
        if(_tailPart.norm.length>=_tailMinLen&&_tailTrackRef.current.sentKey!==_tailPart.key&&!_tempTailRef.current.has(_tailPart.key)){
          var _wait=Math.max(0,_tailDelayMs-(_now-_tailTrackRef.current.ts));
          var _capKey=_tailPart.key,_capText=_tailPart.norm;
          _tailTimerRef.current=setTimeout(async function(){
            if(!_alive)return;
            _tailTrackRef.current.sentKey=_capKey;
            try{
              var _tRes=await _eng.requestBatch([{id:_capKey,text:_capText,persist:!1}]);
              if(_alive&&_tRes&&_tRes.ok&&_tRes.results&&_tRes.results[0]){
                var _first=_tRes.results[0];
                if(_first.translated&&_first.source!=="fallback"&&_first.source!=="skip"){
                  _tempTailRef.current.set(_capKey,_first.translated);
                  _setTick(function(_v){return _v+1;});
                }
              }
            }catch(_te){}
          },_wait);
        }
      }else if(!_m&&_holdActive&&!_translating&&!_lockedRef.current&&!_hoveredRef.current&&!_pinnedRef.current){
        _scheduleGraceCollapse(1500,!1);
      }
    }catch(_err){}
    return function(){
      _alive=!1;
      _cleanup();
    };
  },[a,_k,_m,_exp,_holdActive,_showOrig,_tick]);
  if(!a)return null;
  if(!_k)return _m?${_TR}.createElement("div",{className:"flex w-full items-center gap-1.5 px-2 min-h-8 text-left rounded-lg text-muted-foreground tabular-nums select-none"},${_TR}.createElement(${_TSHIM},null,${_TR}.createElement(${_THEAD},{metadata:c}))):null;
  var _rendered=a,_hasEn=!1,_isWaitingFirstZh=!1,_hasPendingZh=!1;
  try{
    var _engRender=typeof window!=="undefined"?window.__agyThoughtEngine:null;
    if(_engRender){
      var _rParts=_engRender.splitThoughtSegments(a,_m);
      for(var _ri=0;_ri<_rParts.length;_ri++){
        if(_rParts[_ri].kind==="sent"&&_rParts[_ri].translatable){_hasEn=!0;break;}
      }
      if(_hasEn&&!_showOrig){
        var _comp=_engRender.composeDisplayState(_rParts,_tempTailRef.current,{hideUntranslated:!0,failedKeys:_failedRef.current});
        _hasPendingZh=_comp.hasPending;
        if(_comp.text&&_comp.text.trim()){
          _rendered=_comp.text;
        }else if(_comp.hasPending){
          _isWaitingFirstZh=!0;
          _rendered="";
        }
      }
    }
  }catch(_re){_rendered=a;}
  var _p=b?\`思考了 \${Math.max(1,Number(b.seconds))} 秒\`:"思考过程";
  var _toggleLock=function(_ev){
    _ev.stopPropagation();
    var _next=!_lockedRef.current;
    _lockedRef.current=_next;
    _setLocked(_next);
    if(_next){
      _clearHoldTimers();
      _syncUi({locked:!0,manualClosed:!1,graceDone:!1,graceUntil:0});
      if(!_m&&!_holdActive)_setHoldActive(!0);
      if(!_exp)_setExp(!0);
    }else{
      _hoveredRef.current=!0;
      _pinnedRef.current=!0;
      _syncUi({locked:!1,hovered:!0,pinnedByHover:!0});
      if(!_m&&!_holdActive)_setHoldActive(!0);
    }
  };
  var _renderBody=(_q,_t)=>{
    var _content=_q===a?_rendered:_q;
    var _showBusy=_hasEn&&(_translating||_hasPendingZh)&&!_showOrig;
    var _lockIcon=_locked
      ? ${_TR}.createElement("svg",{width:13,height:13,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},
          ${_TR}.createElement("rect",{x:3,y:11,width:18,height:11,rx:2,ry:2}),
          ${_TR}.createElement("path",{d:"M7 11V7a5 5 0 0 1 10 0v4"})
        )
      : ${_TR}.createElement("svg",{width:13,height:13,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},
          ${_TR}.createElement("rect",{x:3,y:11,width:18,height:11,rx:2,ry:2}),
          ${_TR}.createElement("path",{d:"M7 11V7a5 5 0 0 1 9.9-1"})
        );
    return ${_TR}.createElement("div",{className:"cursor-edit group relative text-secondary-foreground pl-2"},
      ${_TR}.createElement("div",{className:"flex items-center justify-end gap-1.5 pb-1 pr-1 text-[11px] text-muted-foreground/75 select-none"},
        _showBusy&&${_TR}.createElement("span",{className:"animate-pulse"},_isWaitingFirstZh?"正在同步中文思考…":"实时译文中…"),
        ${_TR}.createElement("button",{
          type:"button",
          "data-testid":"thought-collapse-lock",
          "aria-pressed":_locked,
          title:_locked?"已锁定展开（鼠标离开不会自动折叠，点击解锁）":"锁定展开（上锁后鼠标离开不会自动折叠）",
          className:"inline-flex items-center justify-center px-1.5 py-0.5 rounded hover:bg-muted/60 hover:text-foreground transition-colors cursor-pointer",
          style:_locked?{color:"#f59e0b",backgroundColor:"rgba(245,158,11,0.14)"}:void 0,
          onClick:_toggleLock
        },_lockIcon),
        _hasEn&&${_TR}.createElement("button",{
          type:"button",
          "data-testid":"thought-lang-toggle",
          className:"px-1.5 py-0.5 rounded hover:bg-muted/60 hover:text-foreground transition-colors cursor-pointer",
          onClick:function(_ev){
            _ev.stopPropagation();
            _setShowOrig(function(_v){
              var _nv=!_v;
              _syncUi({showOrig:_nv});
              return _nv;
            });
          }
        },_showOrig?"查看译文":"查看原文")
      ),
      _isWaitingFirstZh&&!_showOrig
        ? ${_TR}.createElement("div",{className:"py-1 text-sm text-muted-foreground/80 animate-pulse select-none"},"正在同步中文思考过程…")
        : ${_TR}.createElement(_md,{animate:_t&&_m},_content)
    );
  };
  var _effectiveActive=_m||_holdActive;
  return ${_TR}.createElement("div",{
    ref:_wrapRef,
    "data-agy-thought-wrap":"1",
    onMouseEnter:_enterHover,
    onMouseLeave:function(_ev){_leaveHover(_ev,!1);}
  },${_TR}.createElement(${_TCOL},{
    trigger:_q=>${_TR}.createElement(${_TSHIM},{active:_m,className:"text-muted-foreground"},_m||_n?${_TR}.createElement(${_THEAD},{metadata:c,doneText:_m?void 0:_p,animate:!_q}):_p),
    defaultExpanded:_effectiveActive,
    isActive:_effectiveActive,
    dataTestId:"thinking-collapsible-trigger",
    onToggle:_open=>{
      if(!_open){
        _collapseNow(!0);
      }else{
        _clearHoldTimers();
        _hoveredRef.current=!0;
        _pinnedRef.current=!0;
        _syncUi({hovered:!0,pinnedByHover:!0,manualClosed:!1,graceDone:!1,graceUntil:0});
        _setHoldActive(!0);
        _setExp(!0);
      }
    },
    maxHeight:200,
    autoScroll:!0,
    smoothScroll:!1
  },_steerBtn&&${_TR}.createElement(_steerBtn,{metadata:c,isRunning:_l}),_steerEd?${_TR}.createElement(_steerEd,{metadata:c,thinking:a,isRunning:_l},_renderBody):_renderBody(a,_l)));
};`;
  code = code.slice(0, thoughtLoc.startIdx) + newThoughtComp + code.slice(thoughtLoc.endIdx);
  console.log(`✔ [锚点 8/12] 已抗混淆重构 ${thoughtLoc.compName} 思维链实时流式翻译与悬停小锁引擎 (React=${_TR}, collapse=${_TCOL})`);
  moduleStatus.thoughtStream = { enabled: true, compName: thoughtLoc.compName };
  activeOutputMarkers.push(
    '__agyThoughtEngine',
    '/translate-thought',
    'thought-lang-toggle',
    'thought-collapse-lock',
    'data-agy-thought-wrap',
    'getStepUiState',
    'getLastPointer',
    '正在同步中文思考过程…',
    'defaultExpanded:_effectiveActive',
    '思考了 '
  );
} else if (STRICT_MODE) {
  throw new Error(`❌ 思维链渲染组件锚点或内部符号缺失: ${thoughtLoc.reason}`);
} else {
  moduleStatus.thoughtStream = { enabled: false, reason: thoughtLoc.reason };
  recordSkipped('思维链实时流式翻译与悬停小锁 (iAc/rTc)', thoughtLoc.reason);
}

// 2.4.6 模块 C：全抗混淆 Markdown 表格智能权重自适应布局引擎（兼容 ckc-mkc / Crc-Mrc 及任意混淆名，全部局部变量加 _ 前缀零遮蔽）
const tableLoc = locateTableModule(code);
if (tableLoc.matched) {
  const _MR = tableLoc.reactVar;
  const _MEAS = tableLoc.measureFn;
  const _ALLOC = tableLoc.allocFn;
  const _EQ = tableLoc.eqFn;
  const _BLEED = tableLoc.bleedFn;
  const _CN = tableLoc.cnFn;
  const _TOMD = tableLoc.toMdFn;
  const _MASK = tableLoc.maskFn;
  const _COPY = tableLoc.copyHook;
  const _MROOT = tableLoc.menuRoot;
  const _MTRIG = tableLoc.menuTrigger;
  const _MBTN = tableLoc.btnComp;
  const _MICON = tableLoc.iconComp;
  const _MCONT = tableLoc.menuContent;
  const _MITEM = tableLoc.menuItem;

  const newMeasureAlloc = `function ${_MEAS}(a){
  var _b=a.querySelector(":scope > table");
  if(!_b)return[];
  a.setAttribute("data-agy-measuring","1");
  var _c=Array.from(_b.rows),_d=Math.max(0,..._c.map(_m=>_m.cells.length));
  _c=_c.flatMap(_m=>Array.from(_m.cells).flatMap(_n=>_n.firstElementChild instanceof HTMLElement&&_n.firstElementChild.tagName==="DIV"?[_n.firstElementChild]:[]));
  var _f=_c.map(_m=>_m.style.cssText),_g=a.style.cssText,_h=_b.style.cssText;
  var _k=Array(_d).fill(0),_l=Array(_d).fill(0);
  try{
    a.style.height=a.getBoundingClientRect().height+"px";
    a.style.width="max-content";
    a.style.maxWidth="none";
    _b.style.tableLayout="auto";
    _b.style.width="auto";
    _b.style.minWidth="0";
    for(var _ci=0;_ci<_c.length;_ci++){
      _c[_ci].style.display="inline-block";
      _c[_ci].style.width="max-content";
      _c[_ci].style.maxWidth="none";
      _c[_ci].style.minWidth="0";
    }
    for(let _m of _c){
      let _n=_m.parentElement;
      if(!_n||_n.cellIndex>=_d)continue;
      let _p=_n.cellIndex;
      _k[_p]=Math.max(_k[_p],_m.getBoundingClientRect().width);
      _l[_p]=Math.max(_l[_p],_n.getBoundingClientRect().width);
    }
  }finally{
    _c.forEach((_m,_n)=>{_m.style.cssText=_f[_n]});
    _b.style.cssText=_h;
    a.style.cssText=_g;
    a.removeAttribute("data-agy-measuring");
  }
  return _k.map((_m,_n)=>({natural:Math.ceil(_m),chrome:Math.min(64,Math.ceil(Math.max(0,_l[_n]-_m)))}));
}
function ${_ALLOC}(a,b){
  var _te=typeof window!=="undefined"?window.__agyTableEngine:null;
  var _map=new Map();
  if(!_te||!Array.isArray(a)||a.length===0||!(b>0))return _map;
  var _res=_te.computeColumnWidths(a,b);
  if(_res.mode==="fit"||_res.mode==="scroll"){
    for(var _i=0;_i<_res.widths.length;_i++)_map.set(_i,_res.widths[_i]);
  }
  return _map;
}`;

  const newTableMenu = `function ${tableLoc.tableComp}({node:a,staggerStyle:b,...c}){
  var _d=(0,${_MR}.useRef)(null),_f=(0,${_MR}.useRef)(null),_g=(0,${_MR}.useRef)(null),_h=(0,${_MR}.useId)(),
    [_k,_l]=(0,${_MR}.useState)(null),_m=_k??"column",
    [_n,_p]=(0,${_MR}.useState)([]),
    [_q,_t]=(0,${_MR}.useState)({q:0,parentW:0,capW:0}),
    [_w,_x]=(0,${_MR}.useState)("none"),
    _y=(0,${_MR}.useCallback)(()=>{
      var _I=_f.current;
      if(_I){
        var _K=getComputedStyle(_I).direction==="rtl",
          _L=_I.scrollWidth-_I.clientWidth,
          _M=_K?Math.abs(_I.scrollLeft)<_L-1:_I.scrollLeft>1;
        _I=_K?_I.scrollLeft<-1:_I.scrollLeft<_L-1;
        var _N=_M&&_I?"both":_M?"left":_I?"right":"none";
        _x(_Q=>_Q===_N?_Q:_N);
      }
    },[]),
    _z=(0,${_MR}.useRef)([]),_A=(0,${_MR}.useRef)({q:0,parentW:0,capW:0}),_C=(0,${_MR}.useRef)(null),_B=(0,${_MR}.useRef)(null),
    _E=(0,${_MR}.useCallback)(_I=>{
      var _K=_g.current,_L=_d.current;
      if(_K){
        var _M=${_BLEED}(_L),_N=_L?getComputedStyle(_L).maxWidth:"";
        _N=_N.endsWith("px")?parseFloat(_N):0;
        var _pW=_L?.parentElement?.clientWidth||0;
        var _mSt=_M?getComputedStyle(_M):null;
        var _mIn=_M?Math.max(0,_M.clientWidth-(parseFloat(_mSt?.paddingLeft||0)||0)-(parseFloat(_mSt?.paddingRight||0)||0)):0;
        var _cap=_L&&_M&&_M.clientWidth>0?(_N>0&&_mIn>0?Math.min(_N,_mIn):(_N||_mIn||_pW||_L.clientWidth||_f.current?.clientWidth||0)):(_pW||_L?.clientWidth||_f.current?.clientWidth||0);
        var _Q=_cap||_pW||_L?.clientWidth||_f.current?.clientWidth||0;
        var _O=[_pW,_M?.clientWidth,_cap].join(" "),_P=_C.current!==null&&_C.current!==_O;
        _C.current=_O;
        var _curCols=_z.current,_R=!_curCols.some(_S=>_S.natural>0);
        var _nextDim={q:_Q,parentW:_pW,capW:_cap};
        var _dimChanged=!_A.current||Math.abs(_nextDim.q-_A.current.q)>=1||Math.abs(_nextDim.parentW-_A.current.parentW)>=1||Math.abs(_nextDim.capW-_A.current.capW)>=1;
        if(_I==="always"||_R||(_I==="if-content-resized"&&!_P)){
          var _measured=${_MEAS}(_K);
          if(!${_EQ}(_curCols,_measured)){_curCols=_measured;_z.current=_curCols;_p(_curCols);}
          if(_dimChanged){_A.current=_nextDim;_t(_nextDim);}
        }else if(_dimChanged){
          _A.current=_nextDim;_t(_nextDim);
        }
        _y();
      }
    },[_y]);
  (0,${_MR}.useLayoutEffect)(()=>{
    var _I=_f.current,_K=_g.current,_L=_d.current;
    if(_I&&_K){
      var _M=null,_N=new ResizeObserver(_S=>{
        var _Y=_S.find(_Z=>_Z.target===_K);
        var _contentResized=!1;
        if(_Y){
          var _sig=_Y.contentRect.width+" "+_Y.contentRect.height;
          _contentResized=_M!==null&&_M!==_sig;
          _M=_sig;
        }
        _E(_contentResized?"if-content-resized":"never");
      });
      _N.observe(_I);
      _N.observe(_K);
      if(_L&&_L.parentElement)_N.observe(_L.parentElement);
      var _bleed=${_BLEED}(_L);
      if(_bleed)_N.observe(_bleed);
      var _Q=new MutationObserver(()=>{_E("always")});
      _Q.observe(_K,{childList:!0,subtree:!0,characterData:!0});
      _B.current=_Q;
      var _O=_K.ownerDocument.fonts,_P=!1,_R=()=>{_P||_E("always")};
      _O?.addEventListener("loadingdone",_R);
      _O?.status==="loading"&&_O.ready.then(_R);
      return()=>{_P=!0;_N.disconnect();_Q.disconnect();_O?.removeEventListener("loadingdone",_R);_B.current=null};
    }
  },[_E]);
  (0,${_MR}.useLayoutEffect)(()=>{_E("always");_B.current?.takeRecords()},[_E,c.children]);
  (0,${_MR}.useLayoutEffect)(()=>{_y()},[_n,_m,_q,_y]);
  var _te=typeof window!=="undefined"?window.__agyTableEngine:null;
  var _built=_te?_te.buildTableCss(_h,_n,_q.q,_m,{parentWidth:_q.parentW,capWidth:_q.capW}):{css:"",layout:{mode:"natural"},canExpand:!1};
  var _css=_built.css;
  var _u=!_built.canExpand;
  var _H=_w!=="none";
  return ${_MR}.createElement("div",{ref:_d,"data-md-table-host":_h,"data-agy-table-responsive":"1","data-agy-table-layout":_built.layout?.mode||"natural","data-width-mode":_m,style:b,className:${_CN}("group/md-table relative my-4","md-table-host")},
    _css&&${_MR}.createElement("style",null,_css),
    ${_MR}.createElement(${tableLoc.menuComp},{widthMode:_m,disabled:_m==="column"&&_u,onWidthModeChange:_l,getMarkdown:()=>_g.current?${_TOMD}(_g.current):""}),
    ${_MR}.createElement("div",{ref:_f,onScroll:_y,tabIndex:_H?0:void 0,role:_H?"region":void 0,"aria-label":_H?"可横向滚动表格":void 0,style:${_MASK}(_w),className:${_CN}("w-full overflow-x-auto overflow-y-hidden",_H&&"rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary","md-table-scroll")},
      ${_MR}.createElement("div",{ref:_g,"data-md-table":_h,className:${_CN}("agy-md-table relative w-fit min-w-full rounded-lg overflow-hidden border","md-table-frame")},
        ${_MR}.createElement("table",{...c,className:${_CN}("md-table-el min-w-full border-separate border-spacing-0",c.className)},c.children)
      )
    )
  );
}
function ${tableLoc.menuComp}({widthMode:a,disabled:b=!1,onWidthModeChange:c,getMarkdown:d}){
  var [_f,_g]=(0,${_MR}.useState)(!1),{copied:_h,copy:_k}=${_COPY}(),_l=a==="column";
  var _lbl=_l?"展开全宽":"适应窗口";
  var _m=_h?"已复制到剪贴板":"表格选项";
  return ${_MR}.createElement("div",{className:"pointer-events-none sticky top-0 z-[5] -mb-8 flex h-8 items-start justify-end px-2"},
    ${_MR}.createElement("div",{className:${_CN}("mt-2 transition-opacity",_f||_h?"opacity-100 pointer-events-auto":"pointer-events-auto can-hover:opacity-0 can-hover:pointer-events-none","group-hover/md-table:opacity-100 group-hover/md-table:pointer-events-auto group-focus-within/md-table:opacity-100 group-focus-within/md-table:pointer-events-auto")},
      ${_MR}.createElement(${_MROOT},{open:_f,onOpenChange:_g},
        ${_MR}.createElement(${_MTRIG},{asChild:!0},
          ${_MR}.createElement(${_MBTN},{variant:"muted",size:"custom",className:"agy-pill h-6 w-6 rounded-md shadow-sm","aria-label":_m,tooltip:_m,"data-testid":"markdown-table-menu"},
            ${_MR}.createElement(${_MICON},{name:_h?"check":"more_vert",size:14})
          )
        ),
        ${_MR}.createElement(${_MCONT},{side:"bottom",align:"end",className:"min-w-[180px]"},
          ${_MR}.createElement(${_MITEM},{onClick:()=>{_k(d());_g(!1)},"data-testid":"markdown-table-copy-markdown"},
            ${_MR}.createElement(${_MICON},{name:"content_copy",size:14,className:"mr-2"}),"复制为 Markdown"
          ),
          ${_MR}.createElement(${_MITEM},{disabled:b,onClick:()=>{b||(c(_l?"full":"column"),_g(!1))},"data-testid":"markdown-table-width-toggle"},
            ${_MR}.createElement(${_MICON},{name:_l?"open_in_full":"close_fullscreen",size:14,className:"mr-2 rotate-45"}),_lbl
          )
        )
      )
    )
  );
};`;

  // 先替换后段 (tableStart..menuEnd)，再替换前段 (measureStart..eqStart)，确保索引严格准确
  code = code.slice(0, tableLoc.tableStart) + newTableMenu + code.slice(tableLoc.menuEnd);
  code = code.slice(0, tableLoc.measureStart) + newMeasureAlloc + code.slice(tableLoc.eqStart);
  code = code.replace(tableLoc.pillCssTarget, 'min-width: 0;\\n  word-break: break-word;');
  console.log(`✔ [锚点 9-12/12] 已抗混淆升级表格引擎 (${_MEAS}/${_ALLOC}/${tableLoc.tableComp}/${tableLoc.menuComp}, React=${_MR}) 并解除 20ch 胶囊锁死`);
  moduleStatus.tableLayout = { enabled: true, tableComp: tableLoc.tableComp, menuComp: tableLoc.menuComp };
  activeOutputMarkers.push(
    '__agyTableEngine',
    'computeColumnWidths',
    'buildTableCss',
    'data-agy-measuring',
    'data-agy-table-responsive',
    '展开全宽',
    '适应窗口',
    '复制为 Markdown',
    '表格选项'
  );
} else if (STRICT_MODE) {
  throw new Error(`❌ Markdown 表格自适应锚点或耦合符号缺失: ${tableLoc.reason}`);
} else {
  moduleStatus.tableLayout = { enabled: false, reason: tableLoc.reason };
  recordSkipped('Markdown 表格自适应布局与菜单汉化 (ckc-mkc/Crc-Mrc)', tableLoc.reason);
}

// 2.5 抗混淆终极注入：劫持设置元数据工厂 sT(a)（窄窗口动态捕获函数名、参数名、中间声明与单例名）
const stStartRegex = /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{((?:(?!;function )[\s\S]){0,420}?)return new Map\(\[\["useAICredits"/;
const stStartMatch = findByAnchorRegex(code, 'return new Map([["useAICredits"', stStartRegex, 450, 20);
if (stStartMatch) {
  const [stStartFull, stFn, stArg, stPreDecls] = stStartMatch;
  const stEndRegex = new RegExp(`settingType:"switch"\\}\\]\\]\\)\\}var ([A-Za-z_$][\\w$]*)=${stFn}\\(\\);`);
  const stEndMatch = findByAnchorRegex(code.slice(stStartMatch.index), 'settingType:"switch"}]])}', stEndRegex, 10, 40);
  if (stEndMatch) {
    const stEndAbsIdx = stStartMatch.index + stEndMatch.index;
    const stEndFull = stEndMatch[0];
    const stInstVar = stEndMatch[1];
    const stHook = `function ${stFn}(${stArg}){
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
  ${stPreDecls}return _wrapMap(new Map([["useAICredits"`;
    const stEndReplacement = `settingType:"switch"}]]))}` + `var ${stInstVar}=${stFn}();`;
    // 先替换尾部再替换头部，确保偏移精准无漂移
    code = code.slice(0, stEndAbsIdx) + stEndReplacement + code.slice(stEndAbsIdx + stEndFull.length);
    code = code.slice(0, stStartMatch.index) + stHook + code.slice(stStartMatch.index + stStartFull.length);
    moduleStatus.coreSettings.hits.push(`sT(${stFn})`);
  } else {
    moduleStatus.coreSettings.missing.push('sT_end');
  }
} else {
  moduleStatus.coreSettings.missing.push('sT_head');
}

moduleStatus.coreSettings.enabled = moduleStatus.coreSettings.hits.length >= 2;
if (!moduleStatus.coreSettings.enabled) {
  throw new Error(`❌ 基础设置汉化核心层命中不足 (${moduleStatus.coreSettings.hits.length}/5)，中止编译以防大面积失效！缺失: ${moduleStatus.coreSettings.missing.join(', ')}`);
}

// 2.6 抗混淆注入手写组件内的特定文本（Token 用量、Show breakdown、Demoted、Excluded、Rules 等，零硬编码变量名）
code = code.replace('The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.',
  '下方图表展示了规则（Rules）、技能（Skills）及 MCP 扩展工具对上下文 Token 预算的占用情况。当超出配额上限时，大型规则会自动降级为文件路径指针，大型自定义项会被自动从上下文中排除。');

const bdMatch = findByAnchorRegex(code, '?"Hide breakdown":`Show ${', /([A-Za-z_$][\w$]*)\?"Hide breakdown":`Show \$\{([A-Za-z_$][\w$]*)\.length\} breakdown\$\{\2\.length===1\?"":"s"\}`/, 20, 80);
if (bdMatch) {
  const bdRep = `${bdMatch[1]}?"收起用量明细":\`展开查看 \${${bdMatch[2]}.length} 项明细\``;
  code = code.slice(0, bdMatch.index) + bdRep + code.slice(bdMatch.index + bdMatch[0].length);
}

const toolsMatch = findByAnchorRegex(code, '?"Hide tools":`${', /([A-Za-z_$][\w$]*)\?"Hide tools":`\$\{([A-Za-z_$][\w$]*)\.length\} tools`/, 20, 40);
if (toolsMatch) {
  const toolsRep = `${toolsMatch[1]}?"隐藏工具列表":\`\${${toolsMatch[2]}.length} 项工具\``;
  code = code.slice(0, toolsMatch.index) + toolsRep + code.slice(toolsMatch.index + toolsMatch[0].length);
}

const demotedMatch = findByAnchorRegex(code, '="Demoted"', /([A-Za-z_$][\w$]*)="Demoted"/, 16, 16);
if (demotedMatch) {
  code = code.slice(0, demotedMatch.index) + `${demotedMatch[1]}="降级为路径指针"` + code.slice(demotedMatch.index + demotedMatch[0].length);
}
const excludedMatch = findByAnchorRegex(code, '="Excluded"', /([A-Za-z_$][\w$]*)="Excluded"/, 16, 16);
if (excludedMatch) {
  code = code.slice(0, excludedMatch.index) + `${excludedMatch[1]}="超出预算已排除"` + code.slice(excludedMatch.index + excludedMatch[0].length);
}

code = code.replace('createElement("span",{className:"font-medium text-secondary-foreground"},"Rules")',
  'createElement("span",{className:"font-medium text-secondary-foreground"},"指令规则 (Rules)")');

code = code.replace('a.length>0?"Other Customizations":"Customizations"',
  'a.length>0?"其他扩展与技能":"自定义扩展与技能"');

// 2.7 浏览器页面手写组件按钮与文本（抗混淆兼容 D/E/Aw/sx 与 1.12.0 侧边栏描述）
const backBtnMatch = findByAnchorRegex(
  code,
  'name:"arrow_back",size:16}),',
  /name:"arrow_back",size:16\}\),([A-Za-z_$][\w$]*)\.createElement\("span",\{className:"font-medium"\},"Back"\)/,
  10,
  90
);
if (backBtnMatch) {
  const backRep = `name:"arrow_back",size:16}),${backBtnMatch[1]}.createElement("span",{className:"font-medium"},"返回")`;
  code = code.slice(0, backBtnMatch.index) + backRep + code.slice(backBtnMatch.index + backBtnMatch[0].length);
}

code = code.replace('"Clear visited URLs and autocomplete suggestions from the built-in browser."',
  '"清除内置浏览器的访问历史记录、Cookie 与搜索建议缓存。"');
code = code.replace('"Clear visited URLs and autocomplete suggestions from side panel preview."',
  '"清除侧边栏内置预览的访问历史记录、Cookie 与搜索建议缓存。"');

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

// 2.9.5 右侧边栏概览抽屉与新建标签页首帧抗混淆直译（零路由副作用，仅译显示文本，不改任何 id/sectionId/key）
const overviewDirectPairs = [
  // bld 客户端分区配置数组（保持 id 不变）
  ['{id:"subagents",title:"Subagents"', '{id:"subagents",title:"子智能体"'],
  ['{id:"sideQuestions",title:"Side Questions"', '{id:"sideQuestions",title:"侧边提问"'],
  ['{id:"backgroundTasks",title:"Background Tasks"', '{id:"backgroundTasks",title:"后台任务"'],
  ['{id:"goals",title:"Goals"', '{id:"goals",title:"目标"'],
  ['{id:"documents",title:"Documents"', '{id:"documents",title:"文档"'],
  ['{id:"artifacts",title:"Artifacts"', '{id:"artifacts",title:"产物文档"'],
  ['{id:"links",title:"Links"', '{id:"links",title:"链接"'],
  ['{id:"modifiedFiles",title:"Modified Files"', '{id:"modifiedFiles",title:"已修改文件"'],
  ['{id:"uploads",title:"Uploads"', '{id:"uploads",title:"上传文件"'],
  // omd 分区组件标题（保持 sectionId 不变）
  ['sectionId:"subagents",title:"Subagents"', 'sectionId:"subagents",title:"子智能体"'],
  ['sectionId:"sideQuestions",title:"Side Questions"', 'sectionId:"sideQuestions",title:"侧边提问"'],
  ['sectionId:"backgroundTasks",title:"Background Tasks"', 'sectionId:"backgroundTasks",title:"后台任务"'],
  ['sectionId:"goals",title:"Goals"', 'sectionId:"goals",title:"目标"'],
  ['sectionId:"documents",title:"Documents"', 'sectionId:"documents",title:"文档"'],
  ['sectionId:"artifacts",title:"Artifacts"', 'sectionId:"artifacts",title:"产物文档"'],
  ['sectionId:"links",title:"Links"', 'sectionId:"links",title:"链接"'],
  ['sectionId:"modifiedFiles",title:"Modified Files"', 'sectionId:"modifiedFiles",title:"已修改文件"'],
  ['sectionId:"uploads",title:"Uploads"', 'sectionId:"uploads",title:"上传文件"'],
  // Pull Requests 装饰分区（保持 persistentKey/id 不变）
  ['overview:{header:"Pull Requests"', 'overview:{header:"拉取请求"'],
  ['displayOption:{label:"Pull Requests"', 'displayOption:{label:"拉取请求"'],
  // Customize Sections 触发器、Tooltip、菜单标题与空搜索提示
  ['"aria-label":"Customize Sections"', '"aria-label":"自定义分区"'],
  ['place:"top"},"Customize Sections")', 'place:"top"},"自定义分区")'],
  [',null,"Customize Sections")', ',null,"自定义分区")'],
  ['"aria-label":"Search for content to open"', '"aria-label":"搜索要打开的内容"'],
  ['"text-muted-foreground px-3"},"No results")', '"text-muted-foreground px-3"},"无匹配结果")'],
  // Side Question 右侧入口、标签头与提示
  ['"Side Question: "', '"侧边提问："'],
  ['"Side Question:"', '"侧边提问："'],
  ['"New Side Question"', '"新建侧边提问"'],
  ['"Delete Side Question"', '"删除侧边提问"'],
  ['accessibilityLabel:"Side Question"', 'accessibilityLabel:"侧边提问"'],
  ['"whitespace-nowrap"},"Side Question")', '"whitespace-nowrap"},"侧边提问")'],
  ['"text-sm whitespace-nowrap"},"Side Question")', '"text-sm whitespace-nowrap"},"侧边提问")']
];

let overviewDirectHits = 0;
for (const [fromStr, toStr] of overviewDirectPairs) {
  let pos = 0;
  while (true) {
    const idx = code.indexOf(fromStr, pos);
    if (idx === -1) break;
    code = code.slice(0, idx) + toStr + code.slice(idx + fromStr.length);
    pos = idx + toStr.length;
    overviewDirectHits++;
  }
}

// 抗混淆替换新建标签页搜索框动态占位符与 See all / See less 切换按钮
const newTabPhRes = replaceAllByAnchorRegex(
  code,
  '"Search tabs, files and more"',
  /placeholder:([A-Za-z_$][\w$]*)\?"Search or enter a URL":"Search tabs, files and more"/,
  m => `placeholder:${m[1]}?"搜索或输入 URL":"搜索标签页、文件及更多内容"`,
  30,
  10
);
if (newTabPhRes.count > 0) {
  code = newTabPhRes.code;
  overviewDirectHits += newTabPhRes.count;
}

const seeAllRes = replaceAllByAnchorRegex(
  code,
  '?"See less":"See all"',
  /([A-Za-z_$][\w$]*)\?"See less":"See all"/,
  m => `${m[1]}?"收起":"查看全部"`,
  16,
  8
);
if (seeAllRes.count > 0) {
  code = seeAllRes.code;
  overviewDirectHits += seeAllRes.count;
}

if (overviewDirectHits > 0) {
  console.log(`✔ [右侧边栏直译] 已首帧抗混淆汉化右侧概览抽屉与搜索面板 (${overviewDirectHits} 处)`);
}

// 2.10 注入全局自适应运行时 DOM 清洗引擎 v2（全 9 大功能域共享词库 + 动态模板 + 四重防误杀隔离 + 属性变更监听）
const extraSettingsSafeDict = {
  ...screenTitles,
  ...utTitles,
  ...sectionTitles,
  ...utDescriptions,
  ...rowDescriptions,
  ...rowLabels,
  ...optionValues,
  ...actionWords,
  "Configure default behaviors, skills, and MCP servers.": "配置智能体默认行为、技能库及 MCP 外部工具服务器。",
  "Settings for conversations outside of projects.": "未归属具体项目的独立对话会话及全局自定义扩展配置。",
  "Configure built-in browser, link opening, and browser subagent preferences.": "配置内置浏览器运行环境、链接打开方式及浏览器子智能体偏好。",
  "The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.": "下方图表展示了规则（Rules）、技能（Skills）及 MCP 扩展工具对上下文 Token 预算的占用情况。当超出配额上限时，大型规则会自动降级为文件路径指针，大型自定义项会被自动从上下文中排除。"
};

const domCleanerScript = buildDomCleanerRuntimeScript(extraSettingsSafeDict);

const runtimeTitleCacheInit = `
(function() {
  if (typeof window === 'undefined') return;
  window.__agyZhIdCache = Object.assign(${JSON.stringify(mergedIdToZh)}, window.__agyZhIdCache || {});
  window.__agyZhTitleCache = Object.assign(${JSON.stringify(mergedEnToZh)}, window.__agyZhTitleCache || {});
})();
`;

const thoughtEngineRuntimeScript = `
// =========================================================================
// Antigravity 思维链实时流式翻译与 L1 内存 LRU 引擎 (__agyThoughtEngine)
// =========================================================================
(function() {
  if (typeof window === 'undefined') return;
  if (window.__agyThoughtEngine) return;

  var L1_MAX = 2000;
  var UI_STATE_MAX = 500;
  var l1Cache = new Map();
  var uiStates = new Map();
  var lastPointer = { x: -1, y: -1, ts: 0 };
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pointermove', function(ev) {
      if (ev && typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
        if (Math.abs(ev.clientX - lastPointer.x) >= 2 || Math.abs(ev.clientY - lastPointer.y) >= 2) {
          lastPointer.x = ev.clientX;
          lastPointer.y = ev.clientY;
          lastPointer.ts = Date.now();
        }
      }
    }, { passive: true, capture: true });
  }
  function getLastPointer() {
    return lastPointer;
  }

  function getStepUiState(stepKey) {
    if (!stepKey || !uiStates.has(stepKey)) return null;
    var val = uiStates.get(stepKey);
    uiStates.delete(stepKey);
    uiStates.set(stepKey, val);
    return val;
  }

  function setStepUiState(stepKey, patch) {
    if (!stepKey) return null;
    var cur = uiStates.get(stepKey) || {};
    var next = Object.assign({}, cur, patch || {});
    uiStates.delete(stepKey);
    uiStates.set(stepKey, next);
    while (uiStates.size > UI_STATE_MAX) {
      var oldest = uiStates.keys().next().value;
      if (oldest === undefined) break;
      uiStates.delete(oldest);
    }
    return next;
  }
  var staticMap = {
    "I'm thinking through how to approach this.": "正在梳理处理思路。",
    "Thinking through how to approach this.": "正在梳理处理思路。",
    "Let's think through this carefully.": "正在仔细梳理当前问题。",
    "Let's analyze the user's request.": "正在分析用户的需求。",
    "Analyzing the user's request.": "正在分析用户的需求。",
    "Checking the current workspace context.": "正在检查当前工作区上下文。",
    "Examining the current workspace context.": "正在检查当前工作区上下文。",
    "Initiating the \\"Test Optimization\\" phase.": "正在进入测试优化阶段。",
    "Proceeding to the testing and optimization phase.": "正在推进至测试与优化阶段。"
  };
  var staticMapLower = {};
  for (var sk in staticMap) {
    staticMapLower[sk.toLowerCase()] = staticMap[sk];
  }

  function normalize(text) {
    return String(text || '').replace(/\\r\\n/g, '\\n').replace(/[ \\t]+/g, ' ').trim();
  }

  function hashKey(norm) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < norm.length; i++) {
      var ch = norm.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= (ch + i);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    return 't1:' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + ':' + norm.length;
  }

  function shouldTranslate(text) {
    var raw = normalize(text);
    if (!raw || raw.length < 2) return false;
    if (/^\\x60\\x60\\x60/.test(raw)) return false;
    var plain = raw.replace(/\\x60[^\\x60\\n]+\\x60/g, ' ').replace(/https?:\\/\\/\\S+/gi, ' ').trim();
    var enMatches = plain.match(/[A-Za-z]/g);
    var enCount = enMatches ? enMatches.length : 0;
    if (enCount < 3) return false;
    var zhMatches = plain.match(/[\\u4e00-\\u9fa5]/g);
    var zhCount = zhMatches ? zhMatches.length : 0;
    if (zhCount > 0 && zhCount / (zhCount + enCount) > 0.3) return false;
    return true;
  }

  function getCached(key) {
    if (!l1Cache.has(key)) return null;
    var val = l1Cache.get(key);
    l1Cache.delete(key);
    l1Cache.set(key, val);
    return val;
  }

  function setCached(key, val) {
    if (!key || !val) return;
    l1Cache.delete(key);
    l1Cache.set(key, val);
    while (l1Cache.size > L1_MAX) {
      var oldest = l1Cache.keys().next().value;
      if (oldest === undefined) break;
      l1Cache.delete(oldest);
    }
  }

  function lookupSync(norm, key) {
    if (staticMap[norm]) return staticMap[norm];
    var low = norm.toLowerCase();
    if (staticMapLower[low]) return staticMapLower[low];
    return getCached(key);
  }

  function maskRegexMatches(para, chars, re) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(para)) !== null) {
      var s = m.index, len = m[0].length;
      if (len === 0) { re.lastIndex++; continue; }
      for (var i = 0; i < len && s + i < chars.length; i++) chars[s + i] = '_';
    }
  }

  function splitParagraph(para, parts) {
    if (!para) return;
    var chars = para.split('');
    maskRegexMatches(para, chars, /\\x60[^\\x60\\n]+\\x60/g);
    maskRegexMatches(para, chars, /https?:\\/\\/[^\\s<>)"']*[^\\s<>)"'.!?]/gi);
    maskRegexMatches(para, chars, /[A-Za-z]:[\\\\\\/][^\\s,;:)"'<>]*[^\\s,;:)"'<>.!?]/g);
    maskRegexMatches(para, chars, /\\b[A-Za-z0-9_-]+\\.(?:js|ts|jsx|tsx|json|jsonl|md|py|txt|vbs|ps1|bat|db|pb|pbtxt|lua|xml|sql|html|css|exe|lnk|log|yaml|yml)\\b/gi);
    maskRegexMatches(para, chars, /\\bv?\\d+\\.\\d+(?:\\.\\d+)*\\b/g);
    maskRegexMatches(para, chars, /\\b(?:e\\.g|i\\.e|etc|vs|Mr|Ms|Dr|Prof|Inc|Ltd|No|Fig|Sec)\\./gi);
    var masked = chars.join('');

    var start = 0;
    for (var i = 0; i < masked.length; i++) {
      var ch = masked[i];
      if (ch === '\\n') {
        if (i > start) pushSent(para.slice(start, i), masked.slice(start, i), parts);
        parts.push({ kind: 'sep', text: '\\n' });
        start = i + 1;
        continue;
      }
      if (ch === '.' || ch === '!' || ch === '?') {
        var sp = i + 1;
        while (sp < masked.length && (masked[sp] === ' ' || masked[sp] === '\\t')) sp++;
        if (sp > i + 1 && sp < para.length) {
          var nextCh = para[sp];
          if (/[A-Z0-9\\x60"'(\\[]/.test(nextCh) || nextCh.charCodeAt(0) >= 0x4e00) {
            pushSent(para.slice(start, i + 1), masked.slice(start, i + 1), parts);
            parts.push({ kind: 'sep', text: para.slice(i + 1, sp) });
            start = sp;
            i = sp - 1;
          }
        }
      }
    }
    if (start < para.length) {
      pushSent(para.slice(start), masked.slice(start), parts);
    }
  }

  function pushSent(rawSlice, maskedSlice, parts) {
    var norm = normalize(rawSlice);
    if (!norm) {
      if (rawSlice) parts.push({ kind: 'sep', text: rawSlice });
      return;
    }
    var leadMatch = rawSlice.match(/^([ \\t]*)/);
    var lead = leadMatch ? leadMatch[1] : '';
    var trailMatch = rawSlice.match(/([ \\t]*)$/);
    var trail = trailMatch ? trailMatch[1] : '';
    if (lead) parts.push({ kind: 'sep', text: lead });
    var core = rawSlice.slice(lead.length, rawSlice.length - trail.length);
    var maskedCore = String(maskedSlice || rawSlice).slice(lead.length, rawSlice.length - trail.length).trim();
    var coreNorm = normalize(core);
    var key = hashKey(coreNorm);
    var endsCleanly = coreNorm.length >= 12 && /[.!?。！？]["'”’)]?$/.test(maskedCore);
    parts.push({
      kind: 'sent',
      text: core,
      norm: coreNorm,
      key: key,
      endsCleanly: endsCleanly,
      committed: true,
      translatable: shouldTranslate(coreNorm)
    });
    if (trail) parts.push({ kind: 'sep', text: trail });
  }

  function splitThoughtSegments(rawText, isStreaming) {
    var src = String(rawText || '');
    if (!src) return [];
    var parts = [];
    // 按多行代码块安全切分（奇数个三反引号视为流式未闭合代码块，跳过翻译）
    var fence = String.fromCharCode(96, 96, 96);
    var cursor = 0;
    while (cursor < src.length) {
      var openIdx = src.indexOf(fence, cursor);
      if (openIdx === -1) {
        splitNonCodeChunk(src.slice(cursor), parts);
        break;
      }
      if (openIdx > cursor) {
        splitNonCodeChunk(src.slice(cursor, openIdx), parts);
      }
      var closeIdx = src.indexOf(fence, openIdx + 3);
      if (closeIdx === -1) {
        parts.push({ kind: 'code', text: src.slice(openIdx), committed: false, translatable: false });
        break;
      }
      parts.push({ kind: 'code', text: src.slice(openIdx, closeIdx + 3), committed: true, translatable: false });
      cursor = closeIdx + 3;
    }

    // 流式末尾句判定：若经安全掩码校验以真实句末标点闭合（非缩写/文件名小数点），立即锁定加速首屏
    if (isStreaming) {
      var lastSentIdx = -1;
      for (var k = parts.length - 1; k >= 0; k--) {
        if (parts[k].kind === 'sent') { lastSentIdx = k; break; }
      }
      if (lastSentIdx !== -1) {
        var lastPart = parts[lastSentIdx];
        var hasTrailingSep = lastSentIdx < parts.length - 1;
        var hasEndingPunct = /[.!?。！？]["'”’)]?$/.test(lastPart.norm);
        if (!lastPart.endsCleanly && !(hasTrailingSep && hasEndingPunct)) {
          lastPart.committed = false;
        }
      }
    }
    return parts;
  }

  function splitNonCodeChunk(chunk, parts) {
    var blocks = chunk.split(/(\\n{2,})/);
    for (var i = 0; i < blocks.length; i++) {
      var blk = blocks[i];
      if (!blk) continue;
      if (/^\\n{2,}$/.test(blk)) {
        parts.push({ kind: 'sep', text: blk });
      } else {
        splitParagraph(blk, parts);
      }
    }
  }

  function composeDisplayState(parts, tempTailMap, opts) {
    var hideUntranslated = !!(opts && opts.hideUntranslated);
    var failedKeys = opts && opts.failedKeys ? opts.failedKeys : null;
    var rendered = [];
    var hasZhOutput = false;
    var hasPending = false;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.kind !== 'sent' || !p.translatable) {
        var nonSentZh = /[\\u4e00-\\u9fa5]/.test(p.text);
        if (nonSentZh) hasZhOutput = true;
        rendered.push({ kind: p.kind, text: p.text, isZh: nonSentZh });
        continue;
      }
      var zh = lookupSync(p.norm, p.key);
      if (!zh && !p.committed && tempTailMap && tempTailMap.has(p.key)) {
        zh = tempTailMap.get(p.key);
      }
      if (zh) {
        hasZhOutput = true;
        rendered.push({ kind: 'sent', text: zh, isZh: true });
      } else {
        var isHardFailed = !!(failedKeys && typeof failedKeys.get === 'function' && (failedKeys.get(p.key) || 0) >= 2);
        if (hideUntranslated && !isHardFailed) {
          hasPending = true;
          // 译文门控：未就绪英文句绝不上屏，等待中文译文到达后直接呈现
          continue;
        }
        rendered.push({ kind: 'sent', text: p.text, isZh: /[\\u4e00-\\u9fa5]/.test(p.text) });
      }
    }

    // 清理被隐藏英文句留下的首尾悬空分隔符
    while (rendered.length > 0 && rendered[0].kind === 'sep') rendered.shift();
    while (rendered.length > 0 && rendered[rendered.length - 1].kind === 'sep') rendered.pop();

    var out = '';
    for (var j = 0; j < rendered.length; j++) {
      var cur = rendered[j];
      if (cur.kind === 'sep') {
        var prev = j > 0 ? rendered[j - 1] : null;
        var next = j + 1 < rendered.length ? rendered[j + 1] : null;
        if (prev && prev.kind === 'sep') continue;
        if (/^[ \\t]+$/.test(cur.text) && prev && next && prev.isZh && next.isZh && /[。！？；：）】]$/.test(prev.text)) {
          continue;
        }
      }
      out += cur.text;
    }
    return { text: out, hasZhOutput: hasZhOutput, hasPending: hasPending };
  }

  function composeDisplay(parts, tempTailMap, opts) {
    return composeDisplayState(parts, tempTailMap, opts).text;
  }

  async function requestBatch(items) {
    var resp = await fetch('/translate-thought', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    });
    if (!resp || !resp.ok) return { ok: false, results: [] };
    return resp.json();
  }

  window.__agyThoughtEngine = {
    normalize: normalize,
    hashKey: hashKey,
    shouldTranslate: shouldTranslate,
    lookupSync: lookupSync,
    getCached: getCached,
    setCached: setCached,
    getStepUiState: getStepUiState,
    setStepUiState: setStepUiState,
    getLastPointer: getLastPointer,
    splitThoughtSegments: splitThoughtSegments,
    composeDisplay: composeDisplay,
    composeDisplayState: composeDisplayState,
    requestBatch: requestBatch
  };
})();
`;

const tableEngineRuntimeScript = `
// =========================================================================
// Antigravity Markdown 表格智能权重自适应布局引擎 (__agyTableEngine)
// =========================================================================
(function() {
  if (typeof window === 'undefined') return;
  if (window.__agyTableEngine) return;

  var DEFAULT_MIN_COL_CONTENT = 52;
  var FRAME_BORDER_SLACK = 4;
  var RIGHT_EDGE_GAP_PX = 8;
  var NARROW_RIGHT_EDGE_GAP_PX = 4;
  var WEIGHT_EXPONENT = 0.52;
  var MAX_SCROLL_COL_WIDTH = 260;

  function sanitizeCols(cols) {
    if (!Array.isArray(cols)) return [];
    return cols.map(function(c) {
      var nat = Number(c && c.natural);
      var chr = Number(c && c.chrome);
      return {
        natural: isFinite(nat) && nat > 0 ? Math.ceil(nat) : 0,
        chrome: isFinite(chr) && chr >= 0 ? Math.min(64, Math.ceil(chr)) : 24
      };
    });
  }

  function computeColumnWidths(rawCols, rawAvailableWidth, opts) {
    var cols = sanitizeCols(rawCols);
    var n = cols.length;
    var availableWidth = Number(rawAvailableWidth);
    if (!isFinite(availableWidth) || availableWidth <= 0 || n === 0) {
      return {
        mode: 'natural',
        widths: [],
        percents: [],
        totalAllocated: 0,
        totalNatural: 0,
        totalChrome: 0,
        overflow: false
      };
    }

    var minColContent = (opts && opts.minColContent > 0) ? opts.minColContent : DEFAULT_MIN_COL_CONTENT;
    var borderSlack = (opts && opts.borderSlack >= 0) ? opts.borderSlack : FRAME_BORDER_SLACK;
    var exponent = (opts && opts.exponent > 0) ? opts.exponent : WEIGHT_EXPONENT;

    var totalChrome = 0;
    var totalNatural = 0;
    for (var i = 0; i < n; i++) {
      totalChrome += cols[i].chrome;
      totalNatural += cols[i].natural;
    }

    var usableWidth = Math.max(0, Math.floor(availableWidth - borderSlack));

    // 场景 1：自然宽度不超过可用宽度，无需强制压缩
    if (totalNatural + totalChrome <= usableWidth) {
      var natWidths = cols.map(function(c) { return c.natural; });
      var natSum = totalNatural + totalChrome;
      var natPcts = cols.map(function(c) {
        return natSum > 0 ? Number((((c.natural + c.chrome) / natSum) * 100).toFixed(3)) : Number((100 / n).toFixed(3));
      });
      return {
        mode: 'natural',
        widths: natWidths,
        percents: natPcts,
        totalAllocated: natSum,
        totalNatural: totalNatural,
        totalChrome: totalChrome,
        overflow: false
      };
    }

    var innerBudget = Math.floor(usableWidth - totalChrome);
    var floors = [];
    var totalFloor = 0;
    for (var f = 0; f < n; f++) {
      var fl = cols[f].natural > 0 ? Math.min(Math.max(16, cols[f].natural), minColContent) : 16;
      floors.push(fl);
      totalFloor += fl;
    }

    // 场景 2：超多列或超窄视口低于单列可读底线，温和回退紧凑横向滚动
    if (innerBudget < totalFloor) {
      var scrollWidths = [];
      var scrollTotal = totalChrome;
      for (var s = 0; s < n; s++) {
        var nat = cols[s].natural;
        var sw = nat <= floors[s]
          ? Math.max(16, nat)
          : Math.min(nat, Math.max(floors[s], Math.min(MAX_SCROLL_COL_WIDTH, Math.round(56 + 24 * Math.sqrt(nat)))));
        scrollWidths.push(sw);
        scrollTotal += sw;
      }
      var scrollPcts = scrollWidths.map(function(w, idx) {
        return scrollTotal > 0 ? Number((((w + cols[idx].chrome) / scrollTotal) * 100).toFixed(3)) : Number((100 / n).toFixed(3));
      });
      return {
        mode: 'scroll',
        widths: scrollWidths,
        percents: scrollPcts,
        totalAllocated: scrollTotal,
        totalNatural: totalNatural,
        totalChrome: totalChrome,
        overflow: true
      };
    }

    // 场景 3：亚线性权重 Water-Filling 自适应分配（短列紧凑吃饱、长列拿大头并优雅折行）
    var widths = floors.slice();
    var remaining = innerBudget - totalFloor;
    var active = [];
    for (var a = 0; a < n; a++) {
      if (cols[a].natural > widths[a]) active.push(a);
    }

    var guard = 0;
    while (remaining > 0.5 && active.length > 0 && guard < 16) {
      guard++;
      var weightSum = 0;
      var weights = new Array(active.length);
      for (var k = 0; k < active.length; k++) {
        var idx = active[k];
        var need = Math.max(0, cols[idx].natural - widths[idx]);
        var wt = need > 0 ? Math.pow(need, exponent) : 0;
        weights[k] = wt;
        weightSum += wt;
      }
      if (weightSum <= 0) break;

      var nextActive = [];
      var distributed = 0;
      for (var m = 0; m < active.length; m++) {
        var cIdx = active[m];
        var share = remaining * (weights[m] / weightSum);
        var capNeed = cols[cIdx].natural - widths[cIdx];
        if (share >= capNeed - 0.01) {
          widths[cIdx] = cols[cIdx].natural;
          distributed += capNeed;
        } else {
          widths[cIdx] += share;
          distributed += share;
          nextActive.push(cIdx);
        }
      }
      remaining = Math.max(0, remaining - distributed);
      if (nextActive.length === active.length) break;
      active = nextActive;
    }

    var floorWidths = widths.map(function(w) { return Math.floor(w); });
    var used = floorWidths.reduce(function(acc, v) { return acc + v; }, 0);
    var leftover = Math.max(0, innerBudget - used);
    if (leftover > 0) {
      var order = [];
      for (var o = 0; o < n; o++) {
        if (floorWidths[o] < cols[o].natural) {
          order.push({ idx: o, frac: widths[o] - floorWidths[o], need: cols[o].natural - floorWidths[o] });
        }
      }
      order.sort(function(x, y) { return (y.frac - x.frac) || (y.need - x.need); });
      for (var p = 0; p < order.length && leftover > 0; p++) {
        floorWidths[order[p].idx] += 1;
        leftover--;
      }
    }

    var totalAlloc = totalChrome + floorWidths.reduce(function(acc, v) { return acc + v; }, 0);
    var percents = [];
    var pctSum = 0;
    for (var q = 0; q < n; q++) {
      var colTotal = floorWidths[q] + cols[q].chrome;
      if (q === n - 1) {
        percents.push(Number(Math.max(1, 100 - pctSum).toFixed(3)));
      } else {
        var pct = totalAlloc > 0 ? Number(((colTotal / totalAlloc) * 100).toFixed(3)) : Number((100 / n).toFixed(3));
        percents.push(pct);
        pctSum += pct;
      }
    }

    return {
      mode: 'fit',
      widths: floorWidths,
      percents: percents,
      totalAllocated: totalAlloc,
      totalNatural: totalNatural,
      totalChrome: totalChrome,
      overflow: false
    };
  }

  function buildTableCss(tableId, rawCols, availableWidth, widthMode, hostState) {
    var cols = sanitizeCols(rawCols);
    var n = cols.length;
    if (!tableId || n === 0) {
      return { css: '', layout: computeColumnWidths([], 0), canExpand: false };
    }

    var mode = widthMode === 'full' ? 'full' : 'column';
    var selTable = '[data-md-table="' + tableId + '"]:not([data-agy-measuring="1"])';
    var selHost = '[data-md-table-host="' + tableId + '"]';
    var parentW = Number(hostState && hostState.parentWidth) || 0;
    var capW = Number(hostState && hostState.capWidth) || 0;
    var targetAvail = Number(availableWidth) || capW || parentW || 0;

    var totalNatural = 0;
    var totalChrome = 0;
    for (var i = 0; i < n; i++) {
      totalNatural += cols[i].natural;
      totalChrome += cols[i].chrome;
    }
    var totalNeeded = totalNatural + totalChrome + FRAME_BORDER_SLACK;

    var effectiveAvail = targetAvail;
    var hostBleedWidth = 0;
    var disableBleedTransform = false;
    var baseSpan = capW > 0 ? capW : (parentW || targetAvail);
    var rightGap = baseSpan >= 300 ? RIGHT_EDGE_GAP_PX : (baseSpan > 0 ? NARROW_RIGHT_EDGE_GAP_PX : 0);

    if (mode === 'column') {
      if (parentW > 0 && capW > parentW + 4) {
        if (totalNeeded > parentW - rightGap) {
          var maxBleed = Math.max(parentW, capW - rightGap * 2);
          hostBleedWidth = Math.floor(Math.min(totalNeeded + rightGap, maxBleed));
          effectiveAvail = Math.max(120, hostBleedWidth - rightGap);
        } else {
          effectiveAvail = Math.max(120, parentW - rightGap);
          disableBleedTransform = true;
        }
      } else {
        effectiveAvail = Math.max(120, baseSpan - rightGap);
        disableBleedTransform = true;
      }
    }

    var layout = computeColumnWidths(cols, effectiveAvail);
    var rules = [];

    if (mode === 'column') {
      if (disableBleedTransform) {
        rules.push(selHost + '[data-width-mode="column"] { width: 100% !important; min-width: 0 !important; max-width: 100% !important; margin-inline-start: 0 !important; transform: none !important; box-sizing: border-box !important; padding-inline-end: ' + rightGap + 'px !important; }');
      } else if (hostBleedWidth > 0) {
        rules.push(selHost + '[data-width-mode="column"] { width: ' + hostBleedWidth + 'px !important; box-sizing: border-box !important; padding-inline-end: ' + rightGap + 'px !important; }');
      }
    } else if (rightGap > 0) {
      rules.push(selHost + '[data-width-mode="full"] { box-sizing: border-box !important; padding-inline-end: ' + rightGap + 'px !important; }');
    }

    var lastColTotal = layout.widths.length === n ? (layout.widths[n - 1] + cols[n - 1].chrome) : 0;
    if (effectiveAvail >= 280 && (mode === 'full' || lastColTotal >= 108 || layout.mode === 'natural')) {
      rules.push(selTable + ' > table > thead > tr:first-child > th:last-child > div { padding-inline-end: 1.75rem; }');
    }

    rules.push(selTable + ' > table :is(td, th) code { overflow-wrap: anywhere; word-break: break-word; white-space: break-spaces; }');
    rules.push(selTable + ' > table :is(td, th) .inline-pill-wrap { min-width: 0 !important; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }');

    if (mode === 'full') {
      for (var fi = 0; fi < n; fi++) {
        rules.push(selTable + ' > table > :is(thead, tbody) > tr > :nth-child(' + (fi + 1) + ') > div { min-width: min(' + cols[fi].natural + 'px, 70ch); max-width: none; overflow-wrap: anywhere; }');
      }
    } else if (layout.mode === 'fit') {
      rules.push(selTable + ' { width: 100% !important; max-width: 100% !important; min-width: 0 !important; }');
      rules.push(selTable + ' > table { table-layout: fixed !important; width: 100% !important; min-width: 0 !important; max-width: 100% !important; }');
      for (var k = 0; k < n; k++) {
        rules.push(selTable + ' > table > :is(thead, tbody) > tr > :nth-child(' + (k + 1) + ') { width: ' + layout.percents[k] + '%; }');
        rules.push(selTable + ' > table > :is(thead, tbody) > tr > :nth-child(' + (k + 1) + ') > div { display: block; width: 100%; min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }');
      }
    } else if (layout.mode === 'scroll') {
      for (var si = 0; si < n; si++) {
        var sw = layout.widths[si];
        rules.push(selTable + ' > table > :is(thead, tbody) > tr > :nth-child(' + (si + 1) + ') > div { min-width: min(' + sw + 'px, ' + Math.max(16, cols[si].natural) + 'px); max-width: ' + sw + 'px; overflow-wrap: anywhere; word-break: break-word; }');
      }
    } else {
      rules.push(selTable + ' { width: 100%; max-width: 100%; }');
      for (var ni = 0; ni < n; ni++) {
        rules.push(selTable + ' > table > :is(thead, tbody) > tr > :nth-child(' + (ni + 1) + ') > div { min-width: 0; max-width: none; overflow-wrap: anywhere; }');
      }
    }

    var canExpand = layout.mode === 'fit' || layout.mode === 'scroll' || (totalNeeded > effectiveAvail + 2);
    return {
      css: rules.join('\\n'),
      layout: layout,
      canExpand: canExpand
    };
  }

  window.__agyTableEngine = {
    DEFAULT_MIN_COL_CONTENT: DEFAULT_MIN_COL_CONTENT,
    FRAME_BORDER_SLACK: FRAME_BORDER_SLACK,
    RIGHT_EDGE_GAP_PX: RIGHT_EDGE_GAP_PX,
    NARROW_RIGHT_EDGE_GAP_PX: NARROW_RIGHT_EDGE_GAP_PX,
    WEIGHT_EXPONENT: WEIGHT_EXPONENT,
    computeColumnWidths: computeColumnWidths,
    buildTableCss: buildTableCss
  };
})();
`;

code = runtimeTitleCacheInit + '\n' + thoughtEngineRuntimeScript + '\n' + tableEngineRuntimeScript + '\n' + domCleanerScript + '\n' + code;

// 2.11 动态关键指纹断言 + 落盘前 V8 语法预检（零白屏护城河）
const baseRequiredMarkers = [DOM_CLEANER_V2_MARKER, 'window.__agyDomCleanerV2'];
const allExpectedMarkers = [...baseRequiredMarkers, ...activeOutputMarkers];
for (const marker of allExpectedMarkers) {
  if (!code.includes(marker)) {
    throw new Error('❌ 输出产物缺少关键指纹，中断写入: ' + marker);
  }
}

try {
  new vm.Script(code, { filename: 'hub_main_zh.js' });
} catch (syntaxErr) {
  throw new Error('❌ 产物 V8 语法预检未通过，已中止写入防止白屏: ' + syntaxErr.message);
}

// 原子写入目标、备份与模块状态报告
fs.writeFileSync(dstPath, code, 'utf8');
fs.writeFileSync(backupDst, code, 'utf8');
const reportPayload = {
  builtAt: new Date().toISOString(),
  sourcePath: srcPath,
  outputSize: code.length,
  strictMode: STRICT_MODE,
  modules: moduleStatus,
  skippedModules
};
try {
  fs.writeFileSync(path.join(agyExtDir, '.agy_build_report.json'), JSON.stringify(reportPayload, null, 2), 'utf8');
} catch (_e) {}

if (skippedModules.length > 0) {
  console.warn(`⚠ 已完成韧性降级编译部署（跳过 ${skippedModules.length} 个不兼容增强模块: ${skippedModules.map(s => s.module).join('、')}）！大小: ${code.length}`);
} else {
  console.log('✔ 已成功编译并部署全量终极中文与优化引擎（含标题持久化、思维链流式翻译与表格自适应）！大小:', code.length);
}
