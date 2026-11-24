/**
 * Antigravity IDE 共享全量 UI 汉化词库（单一真相源）
 *
 * 设计原则：
 * 1. 分级安全隔离：
 *    - SAFE_GLOBAL_PHRASES：专有界面名、多词短语、占位符、完整提示句（非代码/正文黑名单区域可安全生效）
 *    - CONTROL_ONLY_PHRASES：通用短词/多义词（仅允许在按钮、菜单项、标签页、标题、弹层、Tooltip 及属性上生效，绝不误改正文、代码或文件名）
 *    - DYNAMIC_PATTERNS：动态带数字/变量短语的正则替换规则（仅在安全 UI 节点生效）
 * 2. 术语风格：简洁地道中文为主，保留通用技术缩写（MCP、Git、Diff、URL、PDF、SSH、WSL、UI、API、Token、IDE、PR 等视语境自然表达）
 * 3. 四阵地共享：供 Hub 主 Webview (hub_main_zh.js)、独立 Agent Manager (jetskiAgent/main.js)、
 *    5 个官方内置扩展清单 (package.json)、扩展原生弹窗与内置浏览器引导页统一消费。
 */

// =========================================================================
// 1. 全区安全词条（SAFE_GLOBAL_PHRASES）— 按 9 大功能域分类
// =========================================================================

// 1.1 右侧边栏 / 上下文概览抽屉 / 新建标签页
const OVERVIEW_AND_SIDE_PANEL_PHRASES = {
  // 截图核心区域与动态服务端分区
  "Search tabs, files and more": "搜索标签页、文件及更多内容",
  "Search or enter a URL": "搜索或输入 URL",
  "Search for content to open": "搜索要打开的内容",
  "Customize Sections": "自定义分区",
  "Side Question": "侧边提问",
  "Side Question:": "侧边提问：",
  "Side Questions": "侧边提问",
  "New Side Question": "新建侧边提问",
  "Delete side question": "删除侧边提问",
  "Delete Side Question": "删除侧边提问",
  "Stop Side Question": "停止侧边提问",
  "Stop side question": "停止侧边提问",
  "Next side question": "下一个侧边提问",
  "Pull Requests": "拉取请求",
  "Pull requests": "拉取请求",
  "Background Tasks": "后台任务",
  "Background Task Output": "后台任务输出",
  "No background tasks": "暂无后台任务",
  "Modified Files": "已修改文件",
  "Skills Used": "已用技能",
  "Skills used": "已用技能",
  "Used Skills": "已用技能",
  "Accumulated State": "累计状态",
  "No subagents": "暂无子智能体",
  "Stop Subagent": "停止子智能体",
  "Stop subagent": "停止子智能体",
  "Stop All Subagents": "停止所有子智能体",
  "Subagent ended": "子智能体已结束",
  "Expand subagents": "展开子智能体",
  "Collapse subagents": "收起子智能体",
  "Loading subagent...": "正在加载子智能体...",
  "No documents": "暂无文档",
  "No uploads": "暂无上传文件",
  "No links": "暂无链接",
  "No artifacts": "暂无产物文档",
  "No goals": "暂无目标",
  "No modified files": "暂无已修改文件",
  "Upload Files": "上传文件",
  "Upload Debug Bundle": "上传调试诊断包",
  "Export Artifact": "导出产物文档",
  "Artifact Comments": "产物文档评论",
  "Document Answers": "文档问答",
  "Agent goal": "智能体目标",
  "Coordinator goal": "协调器目标",
  "Working Section": "当前工作区段",
  "Toggle Overview Panel": "切换概览面板",
  "Toggle Side Panel": "切换侧边面板",
  "Toggle Sidebar": "切换侧边栏",
  "Open in Side Panel": "在侧边面板中打开",
  "Open in side pane": "在侧边窗格中打开",
  "Next Side Panel Tab": "下一个侧边面板标签",
  "Auto Pin": "自动固定",
  "Pin Tab": "固定标签页",
  "Unpin Tab": "取消固定标签页",
  "Pin conversation": "固定会话",
  "Unpin conversation": "取消固定会话",
  "Remove from Split": "移出拆分视图",
  "Remove From Split": "移出拆分视图",
  "Copy link": "复制链接",
  "Copy Link": "复制链接",
  "Copy Link Address": "复制链接地址",
  "Copy sign-in link": "复制登录链接",
  "Link Settings": "链接设置",
  "Open links in": "链接打开方式",
  "View Split Diff": "并排查看 Diff",
  "Split Terminal": "拆分终端",
  "Typing into Browser": "正在浏览器中输入",
  "See less in Plugins": "收起插件列表",
  "See more in Plugins": "查看更多插件",
  "Continue your work from another device with Remote Control. Scan the QR code or open the link below.": "通过远程控制在其他设备上继续工作。扫描二维码或打开下方链接。",
  "Typing your corp password here may trigger a Password Alert reset.": "在此输入公司密码可能会触发密码警报重置。"
};

// 1.2 对话主区、输入栏、语音与模型选择
const CHAT_AND_COMPOSER_PHRASES = {
  "New Conversation": "新建对话",
  "New Conversation in Project": "在项目中新建对话",
  "New Conversation in Workspace": "在工作区中新建对话",
  "Search Conversations": "搜索对话",
  "Search conversations...": "搜索对话...",
  "Search for conversations...": "搜索对话...",
  "Sort Conversations": "排序对话",
  "Fork Conversation": "派生新对话",
  "Conversation name": "对话名称",
  "No conversations yet": "暂无对话记录",
  "Continue as a new conversation": "作为新对话继续",
  "Open in full conversation": "在完整对话中打开",
  "Insert into main conversation": "插入到主对话",
  "Add screenshot to conversation": "添加截图到对话",
  "Files modified by the agent in this conversation": "智能体在本次对话中修改的文件",
  "Configure what the agent can do in local and remote conversations.": "配置智能体在本地和远程对话中的可执行权限。",
  "Ask anything, @ to mention": "向 Antigravity 提问，输入 @ 提及",
  "Ask anything, @ to mention, / for actions": "向 Antigravity 提问，输入 @ 提及，/ 执行操作",
  "Message subagent, @ to mention": "向子智能体发送消息，输入 @ 提及",
  "Message this chat": "向此对话发送消息",
  "Listening. Ask anything.": "已就绪，请输入任何问题或任务。",
  "Send message": "发送消息",
  "Send Message": "发送消息",
  "Send reply": "发送回复",
  "Send Now": "立即发送",
  "Queue Message": "加入排队",
  "Queued messages": "排队中的消息",
  "Cancel Sending Message": "取消发送消息",
  "Add to Chat": "添加到对话",
  "Add Context": "添加上下文",
  "Context Providers": "上下文提供器",
  "Last Prompt": "上一条提示词",
  "Select Model": "选择模型",
  "Edit Model": "编辑模型",
  "Add Model": "添加模型",
  "Models Tab": "模型标签页",
  "Model quota reached": "模型配额已达上限",
  "Select another model": "切换其他模型",
  "See Plans": "查看订阅计划",
  "Inbox Mode": "收件箱模式",
  "Fit Mode": "自适应模式",
  "Dark Mode": "深色模式",
  "Voice mode": "语音模式",
  "Voice Mode": "语音模式",
  "End Voice mode": "结束语音模式",
  "Voice speed": "语音播放倍速",
  "Voice transcript": "语音转写文本",
  "Live transcript": "实时转写",
  "Cancel recording": "取消录音",
  "Live chat": "实时对话",
  "End Live chat": "结束实时对话",
  "Mute mic": "静音麦克风",
  "Unmute mic": "取消麦克风静音",
  "Copy Image": "复制图片",
  "Save Image": "保存图片",
  "Image URL:": "图片 URL：",
  "Unsent draft": "未发送草稿",
  "1 Draft": "1 份草稿",
  "Discard comment draft": "放弃评论草稿",
  "Continue with different account": "切换其他账户继续",
  "Continue with Google Cloud": "使用 Google Cloud 继续",
  "Enable sandbox mode": "启用沙盒模式",
  "Type your own answer": "输入自定义回答",
  "Write a comment...": "输入评论..."
};

// 1.3 工具调用卡片、权限审批、终端与沙盒
const TOOLS_PERMISSIONS_AND_TERMINAL_PHRASES = {
  "MCP Servers": "MCP 服务器",
  "MCP servers": "MCP 服务器",
  "MCP tools": "MCP 工具",
  "Add MCP Server": "添加 MCP 服务器",
  "Refresh MCP servers": "刷新 MCP 服务器",
  "MCP error": "MCP 错误",
  "MCP Install Error:": "MCP 安装错误：",
  "MCP Configuration Error:": "MCP 配置错误：",
  "Click to enable tool": "点击启用工具",
  "Click to disable tool": "点击禁用工具",
  "All tools (*)": "全部工具 (*)",
  "Tool Output": "工具输出",
  "Tool arguments": "工具参数",
  "Copy command": "复制命令",
  "Copy Command": "复制命令",
  "Copy output": "复制输出",
  "Copy code": "复制代码",
  "Command:": "命令：",
  "Output:": "输出：",
  "in a terminal": "在终端中",
  "New Terminal": "新建终端",
  "Open Terminal": "打开终端",
  "Kill Terminal": "终止终端",
  "Delete Terminal": "删除终端",
  "No active terminals": "暂无活动终端",
  "Terminal commands": "终端命令",
  "Command setup script": "命令初始化脚本",
  "Commands outside sandbox": "沙盒外终端命令",
  "Terminal command auto execution": "终端命令自动执行",
  "Proceed in Sandbox": "在沙盒中继续执行",
  "Restricts agent tools to a secure, isolated local sandbox.": "将智能体工具限制在安全隔离的本地沙盒中运行。",
  "Configure global allowed and denied resource permissions.": "配置全局允许和拒绝的资源访问权限。",
  "Permission preset": "权限预设",
  "Local Permissions": "本地权限",
  "Plugin permissions": "插件权限",
  "Permission Details": "权限详情",
  "Require Review": "需要人工审查",
  "Remove policy": "移除策略",
  "Edit permission target": "编辑权限目标",
  "Allowed by you": "已由您批准",
  "Accept Step": "接受此步骤",
  "Reject Step": "拒绝此步骤",
  "Cancel Step": "取消此步骤",
  "Cancel step": "取消此步骤",
  "Cancel Task": "取消任务",
  "Confirm Undo": "确认撤销",
  "Review contents": "审查内容",
  "Code Preview": "代码预览",
  "Web Preview": "网页预览",
  "Embedded web preview": "内嵌网页预览",
  "Preview unavailable": "暂不可预览",
  "Still running": "仍在运行中",
  "More toolbar actions": "更多工具栏操作",
  "Canceled edit to": "已取消编辑",
  "Canceled deletion of": "已取消删除",
  "Canceled bookmark of": "已取消收藏",
  "Google Privacy Policy": "Google 隐私政策"
};

// 1.4 代码审阅 / Diff / Git / 工作区与文件
const DIFF_GIT_AND_FILES_PHRASES = {
  "Review Changes": "审阅变更",
  "Files Changed": "已变更文件",
  "Agent Edits": "智能体编辑",
  "Staged Changes": "已暂存变更",
  "Branch Changes": "分支变更",
  "Added (Staged)": "已新增（已暂存）",
  "View Diff": "查看 Diff",
  "Open Diff": "打开 Diff",
  "View Stacked Diff": "上下堆叠查看 Diff",
  "Show Whitespace Changes": "显示空白字符变更",
  "Hide Whitespace Changes": "隐藏空白字符变更",
  "Previous match": "上一处匹配",
  "Next match": "下一处匹配",
  "Match case": "区分大小写",
  "Copy Path": "复制路径",
  "Copy path": "复制路径",
  "Open File": "打开文件",
  "View File": "查看文件",
  "Open Folder": "打开文件夹",
  "Add Folder": "添加文件夹",
  "Add files": "添加文件",
  "File Explorer": "文件资源管理器",
  "File explorer": "文件资源管理器",
  "File Picker": "文件选择器",
  "File reads": "文件读取",
  "Read files": "读取文件",
  "File writes": "文件写入",
  "Write files": "写入文件",
  "Open in Code Search": "在代码搜索中打开",
  "Code Search": "代码搜索",
  "Open in new tab": "在新标签页中打开",
  "Open in New Tab": "在新标签页中打开",
  "Open in tab": "在标签页中打开",
  "Open in Tab": "在标签页中打开",
  "Open in New Window": "在新窗口中打开",
  "Open in External Browser": "在系统默认浏览器中打开",
  "Open in external browser": "在系统默认浏览器中打开",
  "Open in Remote Control": "在远程控制中打开",
  "Open in Antigravity IDE": "在 Antigravity IDE 中打开",
  "Open in Hub": "在 Hub 中打开",
  "Open in Cider": "在 Cider 中打开",
  "Open In": "打开方式",
  "Keep Open": "保持打开",
  "Connect GitHub": "连接 GitHub",
  "Copy gh auth login command": "复制 gh auth login 命令",
  "Configure Branches": "配置分支",
  "No branches": "暂无分支",
  "Search branches": "搜索分支",
  "Create Project": "创建项目",
  "Create New Project": "创建新项目",
  "New Project": "新建项目",
  "Select Project": "选择项目",
  "No Project": "无归属项目",
  "Archive project": "归档项目",
  "Project Settings": "项目设置",
  "Create a project first.": "请先创建一个项目。",
  "New Workspace": "新建工作区",
  "Add Workspace": "添加工作区",
  "Previous Worktrees": "历史工作树 (Worktrees)",
  "New Worktree": "新建工作树",
  "Matcher:": "匹配规则："
};

// 1.5 蜂群 / 子智能体 / 自动化定时任务
const SWARM_AND_AUTOMATIONS_PHRASES = {
  "Main Agent": "主智能体",
  "New Agent": "新建智能体",
  "New agent": "新建智能体",
  "Create Agent": "创建智能体",
  "No agents": "暂无智能体",
  "Agent name": "智能体名称",
  "Agent options": "智能体选项",
  "Agent Settings": "智能体设置",
  "Agent Script": "智能体脚本",
  "New Agent Script": "新建智能体脚本",
  "Agent:": "智能体：",
  "Agent can": "智能体可以",
  "Agent can run": "智能体可执行",
  "Agent said": "智能体回复",
  "Agent working": "智能体运行中",
  "Agent execution failed.": "智能体执行失败。",
  "Agent terminated due to error": "智能体因发生错误而终止",
  "Interrupt Agent": "中断智能体",
  "Filter agents": "筛选智能体",
  "Back to all agents": "返回全部智能体",
  "Custom Agent Error:": "自定义智能体错误：",
  "Remote Agents Data": "远程智能体数据",
  "Remote agents are busy": "远程智能体正忙",
  "Migrate with Agent": "使用智能体迁移",
  "Shared agent for your team": "团队共享智能体",
  "Coordinator name": "协调器名称",
  "Coordinator settings": "协调器设置",
  "Coordinators Options": "协调器选项",
  "New Coordinator": "新建协调器",
  "Create Coordinator": "创建协调器",
  "Chief of Staff canvas": "协调总控画布",
  "New automation": "新建自动化任务",
  "Start Automation": "启动自动化任务",
  "Show Automations": "显示自动化任务",
  "Only Automations": "仅看自动化任务",
  "Scheduled Task": "定时任务",
  "On a schedule": "按计划定时运行",
  "Not scheduled": "未设置定时",
  "Schedule type": "定时类型",
  "Change schedule": "修改定时计划",
  "Schedules only.": "仅限计划任务。",
  "Schedules and events.": "计划任务与事件触发。",
  "Remove trigger": "移除触发器",
  "Workflow runs": "工作流运行记录",
  "Workflow refs": "工作流引用",
  "Refresh all credentials": "刷新全部凭据",
  "Refreshing credentials...": "正在刷新凭据...",
  "Refreshed credentials for all automations.": "已刷新所有自动化任务的凭据。",
  "Failed to refresh credentials": "刷新凭据失败",
  "Refresh gcert Credentials": "刷新 gcert 凭据",
  "Active Skills": "已启用技能",
  "Skills & Rules": "技能与规则",
  "Delete Skill": "删除技能",
  "Open skill page": "打开技能详情页",
  "Customize Global Skills": "自定义全局技能",
  "Enable Recommended Skills": "启用推荐技能",
  "No skills or rules yet.": "暂无技能或规则。",
  "Agent Hooks Configuration": "智能体钩子配置",
  "Enable browser agent": "启用浏览器智能体",
  "Enable sounds for agent": "启用智能体提示音",
  "Pause (k)": "暂停 (k)",
  "Play (k)": "播放 (k)",
  "Curated sets of plugins for common workflows and roles.": "针对常见工作流与角色精选的插件套装。"
};

// 1.6 内置浏览器与 PDF 预览
const BROWSER_AND_PREVIEW_PHRASES = {
  "Go Back": "后退",
  "Go Forward": "前进",
  "Reload app": "重新加载应用",
  "Reload Window": "重新加载窗口",
  "Zoom In": "放大",
  "Zoom Out": "缩小",
  "Zoom in (+)": "放大 (+)",
  "Zoom out (-)": "缩小 (-)",
  "Reset Zoom": "重置缩放",
  "Reset zoom (0)": "重置缩放 (0)",
  "Zoom Level": "缩放比例",
  "Fit to Page": "适应整页",
  "Fit to Width": "适应页宽",
  "Previous Page": "上一页",
  "Current Page": "当前页",
  "Next Page": "下一页",
  "Download PDF": "下载 PDF",
  "Download video": "下载视频",
  "Downloading...": "正在下载...",
  "Close downloads": "关闭下载列表",
  "Download location": "下载位置",
  "Browser downloads": "浏览器下载",
  "Address bar": "地址栏",
  "Address bar suggestions": "地址栏建议",
  "Click to copy URL": "点击复制 URL",
  "Open URL": "打开 URL",
  "Execute URLs": "执行 URL",
  "New tab": "新建标签页",
  "Close Tab": "关闭标签页",
  "Close Other Tabs": "关闭其他标签页",
  "Reopen Closed Tab": "重新打开已关闭的标签页",
  "Browser Use": "浏览器使用",
  "Browser steps": "浏览器操作步骤",
  "Browser actions": "浏览器动作",
  "Browsing history": "浏览历史记录",
  "Cookies by Site": "按站点查看 Cookie",
  "Sites with cookies": "包含 Cookie 的站点",
  "View Page": "查看页面",
  "Read page": "读取页面",
  "Page contents": "页面内容",
  "Empty table": "空表格",
  "Back to home": "返回主页",
  "Back to safety": "返回安全页面",
  "This page says": "此页面显示",
  "in your browser.": "在浏览器中。",
  "Inspect element to comment": "审查元素以添加评论",
  "Capture Screenshot": "截取屏幕截图",
  "Taking Screenshot": "正在截图",
  "Took Screenshot": "已截取屏幕截图",
  "Rendering playback": "正在渲染回放",
  "Playback available": "可查看操作回放",
  "2x playback speed": "2 倍速播放",
  "Accounts tab": "账户标签页",
  "Log back in": "重新登录",
  "Open plugin page": "打开插件详情页",
  "Hide Thumbnail Sidebar": "隐藏缩略图侧边栏",
  "Show Thumbnail Sidebar": "显示缩略图侧边栏"
};

// 1.7 自定义扩展 / 插件市场 / 连接器 / 钩子
const PLUGINS_AND_CUSTOMIZATIONS_PHRASES = {
  "Last Updated": "最近更新",
  "Update Available": "发现可用更新",
  "Update Anyway": "仍要更新",
  "App update required": "需要更新客户端",
  "Plugin update required": "需要更新插件",
  "A new version is available.": "发现新版本可用。",
  "Check for Updates": "检查更新",
  "To update:": "更新方式：",
  "UI Plugins": "UI 插件",
  "UI plugins": "UI 插件",
  "More Plugins": "更多插件",
  "Show Plugins": "显示插件",
  "Show or Hide Plugins": "显示或隐藏插件",
  "Start Plugin": "启动插件",
  "Create plugin": "创建插件",
  "Filter plugins": "筛选插件",
  "Plugin details": "插件详情",
  "Plugin metadata": "插件元数据",
  "Plugins Options": "插件选项",
  "Plugin Operation Error:": "插件操作错误：",
  "Loading plugins...": "正在加载插件...",
  "No Plugins Available": "暂无可用插件",
  "No plugins available": "暂无可用插件",
  "No plugins available.": "暂无可用插件。",
  "Included with plugin": "随插件内置",
  "Installed in": "安装位置",
  "Installed separately": "独立安装",
  "Currently installed": "当前已安装",
  "Installing...": "正在安装...",
  "plugins available.": "个插件可用。",
  "Marketplace notice": "插件市场提示",
  "Explore other marketplace customizations": "探索插件市场的其他扩展",
  "Build With Google plugins": "Google 官方插件库",
  "Disabled. Open Details to finish setup or enable.": "已禁用。请打开详情完成配置或启用。",
  "Search connectors": "搜索连接器",
  "Search customizations...": "搜索自定义扩展...",
  "Loading customizations...": "正在加载自定义扩展...",
  "Loading workspace customizations...": "正在加载工作区自定义扩展...",
  "There are no customizations enabled.": "当前未启用任何自定义扩展。",
  "Include Jetski default customizations": "包含系统默认自定义扩展",
  "Customizations views": "自定义扩展视图",
  "Access rules": "访问规则",
  "Browse rules": "浏览规则",
  "Manage hooks": "管理钩子",
  "Loading hooks...": "正在加载钩子...",
  "Delete Hook": "删除钩子",
  "Add Hook Card": "添加钩子卡片",
  "New hook name": "新钩子名称",
  "Enable Text Selection": "启用文本选择",
  "Disable Text Selection": "禁用文本选择",
  "Enable Notifications": "启用通知",
  "Enable Remote Control": "启用远程控制",
  "Enable Overages": "启用超额计费",
  "Enable AI credit overages": "启用 AI 积分超额自动扣费",
  "Enable Best-of-2": "启用 Best-of-2 双候选",
  "Enable telemetry": "启用遥测统计",
  "Sign in": "登录",
  "Sign in again": "重新登录",
  "and sign in again.": "并重新登录。",
  "Sign in needed": "需要登录",
  "Sign in required": "请先登录",
  "Business Account Sign In": "企业账户登录",
  "Connected account": "已连接账户",
  "Signed-in accounts": "已登录账户",
  "Go to Accounts": "前往账户设置",
  "Extension (VS Code)": "扩展 (VS Code)",
  "Extension (Cider)": "扩展 (Cider)",
  "Extension (Eclipse)": "扩展 (Eclipse)",
  "Extension (Visual Studio)": "扩展 (Visual Studio)"
};

// 1.8 设置、快捷键、账户与配额补漏
const SETTINGS_AND_ACCOUNT_PHRASES = {
  "Open Settings": "打开设置",
  "Open settings menu": "打开设置菜单",
  "System Settings": "系统设置",
  "Privacy Settings": "隐私设置",
  "Advanced Settings": "高级设置",
  "Orchestrator Settings": "编排器设置",
  "Notification settings": "通知设置",
  "Notification Preferences": "通知偏好设置",
  "Settings Unavailable": "设置暂不可用",
  "Failed to parse settings. Fix and restart.": "解析设置文件失败，请修复后重启。",
  "Keybinding Scheme": "快捷键方案",
  "Add Shortcut": "添加快捷键",
  "Edit Shortcut": "编辑快捷键",
  "Remove Shortcut": "移除快捷键",
  "Customize Shortcuts": "自定义快捷键",
  "Open Keyboard Shortcuts": "打开键盘快捷键",
  "VS Code keyboard shortcuts": "VS Code 键盘快捷键",
  "Reset all shortcuts to defaults": "将所有快捷键重置为默认",
  "All active Antigravity shortcuts and user keybinding overrides are managed directly by VS Code.": "所有已生效的 Antigravity 快捷键与用户自定义按键绑定均由 VS Code 直接管理。",
  "Enter always submits. This adds a second shortcut.": "Enter 键始终用于提交，此处添加第二组快捷键。",
  "Dark Theme": "深色主题",
  "Light Theme": "浅色主题",
  "Default Dark": "默认深色",
  "Default Light": "默认浅色",
  "Toggle Between Light/Dark Themes": "切换浅色/深色主题",
  "Use theme to be imported with settings": "使用随设置导入的主题",
  "App version": "应用版本",
  "Copy version details": "复制版本详情",
  "Copied version details": "已复制版本详情",
  "Custom Flags": "自定义启动标志",
  "Search flags": "搜索标志",
  "Custom flag to turn on": "要启用的自定义标志",
  "Turn on a flag you don't have": "启用尚未开启的实验标志",
  "This client was started with no custom flags.": "当前客户端未附带任何自定义启动标志。",
  "Developer: Reset NUX": "开发者：重置新手引导 (NUX)",
  "Developer: Reset Onboarding": "开发者：重置初始化引导",
  "Restart sign-in": "重新启动登录流程",
  "Having trouble signing in?": "登录遇到问题？",
  "Purchase Credits": "购买 AI 积分",
  "Insufficient AI Credits": "AI 积分不足",
  "AI Credits Used to Generate Response": "生成回复所消耗的 AI 积分",
  "Available AI Credits:": "可用 AI 积分：",
  "No quota information available.": "暂无可用配额信息。",
  "Refresh quota and credits data": "刷新配额与积分数据",
  "Terms and Privacy:": "服务条款与隐私：",
  "Dismiss notification": "忽略通知",
  "Your Remote setting": "当前远程环境设置",
  "Your This Computer setting": "当前本机环境设置",
  "This computer": "本机环境",
  "The full developer experience.": "完整的开发者体验。",
  "Did restarting the desktop app help?": "重启桌面应用后问题是否已解决？",
  "Change VCS in General settings, under Advanced": "可在「通用设置 → 高级」中更改版本控制系统 (VCS)",
  "To modify notification settings, open your operating system's system preferences.": "如需修改通知权限，请打开操作系统的系统偏好设置。",
  "Your information (for example, passwords or credit card numbers) is private when it is sent to this site.": "您向此站点发送的信息（例如密码或信用卡号）处于私密加密保护状态。",
  "A nickname for identifying this application in the companion website. Changing this will restart the connection.": "用于在配套网页端识别此应用的设备昵称；修改后将重新建立连接。"
};

// 1.9 通用弹窗、提示、占位符与操作短语
const COMMON_DIALOGS_AND_PLACEHOLDERS = {
  "No results": "无匹配结果",
  "See more results": "查看更多结果",
  "Clear search": "清空搜索内容",
  "Clear Search": "清空搜索",
  "Clear filter": "清空筛选条件",
  "Open Search": "打开搜索",
  "Search shortcuts": "搜索键盘快捷键",
  "Search MCP servers by name": "按名称搜索 MCP 服务器",
  "Search sites...": "搜索站点...",
  "Search file contents...": "搜索文件内容...",
  "Search for commands...": "搜索命令...",
  "Search projects...": "搜索项目...",
  "Search by name or username": "按名称或用户名搜索",
  "Filter resources...": "筛选资源...",
  "Filter rows...": "筛选数据行...",
  "Filter files...": "筛选文件...",
  "Enter device name...": "输入设备名称...",
  "Enter authorization code...": "输入授权码...",
  "Paste authorization code": "粘贴授权码",
  "Paste auth code": "粘贴授权码",
  "Paste code": "粘贴代码",
  "Enter a URL (e.g. http://localhost:8080)": "输入 URL（例如 http://localhost:8080）",
  "Select or enter a workspace URI": "选择或输入工作区 URI",
  "Please list the steps to reproduce the issue": "请列出复现该问题的具体步骤",
  "Enter tool name or server...": "输入工具名称或服务器...",
  "Type absolute path or navigate folders...": "输入绝对路径或浏览文件夹...",
  "Group name": "分组名称",
  "(Optional) Tell us more or type your reason...": "（可选）补充更多说明或输入原因...",
  "Enter project name...": "输入项目名称...",
  "What should the agent do on each run?": "希望智能体在每次运行时执行什么任务？",
  "Prompt to run when triggered...": "触发时要执行的提示词...",
  "For example: every morning, summarize new bugs assigned to me and anything that changed overnight.": "例如：每天早晨汇总分配给我的新缺陷以及昨夜的代码变更。",
  "For example: Morning bug summary": "例如：每日早晨缺陷汇总",
  "Target text in PDF...": "在 PDF 中查找目标文本...",
  "Device name": "设备名称",
  "Select All": "全选",
  "Sort By": "排序方式",
  "Group By": "分组方式",
  "Learn more": "了解更多",
  "More actions": "更多操作",
  "Edit comment": "编辑评论",
  "Delete comment": "删除评论",
  "Copy transcript": "复制对话记录",
  "Copy error messages": "复制错误信息",
  "Dismiss error": "忽略错误",
  "Dismiss suggestion": "忽略建议",
  "Dismiss service announcement": "关闭服务公告",
  "Sidecar error": "扩展侧栏服务异常",
  "Previous question": "上一个问题",
  "Next question": "下一个问题",
  "Close Panel": "关闭面板",
  "Show in Sidebar": "在侧边栏中显示",
  "Reset to Default": "恢复默认",
  "Hide token": "隐藏令牌",
  "Show token": "显示令牌",
  "Add anyway": "仍要添加",
  "Add bundle": "添加套装",
  "New Group": "新建分组",
  "Remove from Group": "移出分组",
  "Set at least one scope filter": "请至少设置一个范围筛选条件",
  "Loading...": "加载中...",
  "Adding...": "添加中...",
  "Refreshing...": "刷新中...",
  "Saving...": "保存中...",
  "Creating...": "创建中...",
  "Loading events...": "正在加载事件...",
  "Connecting to language server...": "正在连接语言服务器...",
  "Open IDE": "打开 IDE",
  "Next run": "下次运行",
  "Try again": "重试",
  "Get started": "快速开始",
  "Auto (detected)": "自动（已检测）",
  "Archived Only": "仅已归档",
  "Runs as": "运行身份",
  "For Turn": "本轮有效",
  "Built In": "系统内置",
  "Custom View": "自定义视图",
  "You said": "你说",
  "Timeout:": "超时时间：",
  "Error:": "错误：",
  "Help:": "帮助：",
  "7 days": "7 天",
  "14 days": "14 天",
  "by Google": "由 Google 提供"
};

const SAFE_GLOBAL_PHRASES = {
  ...OVERVIEW_AND_SIDE_PANEL_PHRASES,
  ...CHAT_AND_COMPOSER_PHRASES,
  ...TOOLS_PERMISSIONS_AND_TERMINAL_PHRASES,
  ...DIFF_GIT_AND_FILES_PHRASES,
  ...SWARM_AND_AUTOMATIONS_PHRASES,
  ...BROWSER_AND_PREVIEW_PHRASES,
  ...PLUGINS_AND_CUSTOMIZATIONS_PHRASES,
  ...SETTINGS_AND_ACCOUNT_PHRASES,
  ...COMMON_DIALOGS_AND_PLACEHOLDERS
};

// =========================================================================
// 2. 仅限 UI 控件内生效的短词/多义词（CONTROL_ONLY_PHRASES）
//    只在 button/menuitem/tab/tooltip/header/label/radix 弹层/属性上生效，
//    绝不会误改代码、AI 正文、文件名、路径或终端输出！
// =========================================================================

const CONTROL_ONLY_PHRASES = {
  // 右侧边栏 & 概览核心短词
  "Subagents": "子智能体",
  "Subagent": "子智能体",
  "Goals": "目标",
  "Goal": "目标",
  "Documents": "文档",
  "Artifacts": "产物文档",
  "Artifact": "产物文档",
  "Links": "链接",
  "Uploads": "上传文件",
  "Overview": "概览",
  "Pinned": "已固定",
  "See all": "查看全部",
  "See less": "收起",
  "Show All": "展开全部",
  "Show Less": "收起列表",

  // 对话、模式与通用操作
  "Stop": "停止",
  "Stopped": "已停止",
  "Send": "发送",
  "Retry": "重试",
  "Continue": "继续",
  "Cancel": "取消",
  "Canceled": "已取消",
  "Confirm": "确认",
  "Close": "关闭",
  "Back": "返回",
  "Next": "下一步",
  "Done": "完成",
  "Skip": "跳过",
  "Skipped": "已跳过",
  "Save": "保存",
  "Saved": "已保存",
  "Saved!": "已保存！",
  "Apply": "应用",
  "Reset": "重置",
  "Clear": "清除",
  "Delete": "删除",
  "Deleted": "已删除",
  "Remove": "移除",
  "Add": "添加",
  "Added": "已添加",
  "Create": "创建",
  "Created": "已创建",
  "New": "新建",
  "Edit": "编辑",
  "Edited": "已编辑",
  "Open": "打开",
  "Rename": "重命名",
  "Renamed": "已重命名",
  "Refresh": "刷新",
  "Dismiss": "忽略",
  "Discard": "放弃",
  "Undo": "撤销",
  "Redo": "重做",
  "Copy": "复制",
  "Copied": "已复制",
  "Copied!": "已复制！",
  "Cut": "剪切",
  "Paste": "粘贴",
  "Share": "分享",
  "Quote": "引用",
  "Submit": "提交",
  "Restore": "恢复",
  "Expand": "展开",
  "Collapse": "收起",
  "Show": "显示",
  "Hide": "隐藏",
  "More": "更多",
  "Search": "搜索",
  "Searching": "搜索中",
  "Searched": "已搜索",
  "Find": "查找",
  "Replace": "替换",
  "Filter": "筛选",
  "Filters": "筛选条件",
  "Help": "帮助",

  // 工具权限、终端与状态
  "Allow": "允许",
  "Deny": "拒绝",
  "Decline": "拒绝",
  "Approved": "已批准",
  "Review": "审查",
  "Preview": "预览",
  "Permission": "权限",
  "Permissions": "权限",
  "Command": "命令",
  "Commands": "命令",
  "Output": "输出",
  "Executed": "已执行",
  "Executing": "执行中",
  "Terminals": "终端",
  "Terminal": "终端",
  "Ready": "就绪",
  "Idle": "空闲",
  "Working": "运行中",
  "Starting": "启动中",
  "Started": "已启动",
  "Loading": "加载中",
  "Blocked": "已阻塞",
  "Error": "错误",
  "Errors": "错误",
  "Unknown": "未知",
  "Failed": "失败",
  "Online": "在线",
  "Offline": "离线",
  "Connect": "连接",
  "Connected": "已连接",
  "Disconnect": "断开连接",
  "Disconnected": "已断开",
  "Connections": "连接",
  "Pause": "暂停",
  "Resume": "继续",
  "Enable": "启用",
  "Enabled": "已启用",
  "Disable": "禁用",
  "Disabled": "已禁用",
  "Install": "安装",
  "Installed": "已安装",
  "Update": "更新",
  "Restart": "重启",
  "Reload": "重新加载",
  "Forward": "前进",
  "Download": "下载",
  "Downloads": "下载",
  "Bookmarked": "已收藏",
  "Zoom": "缩放",
  "Minimize": "最小化",
  "Maximize": "最大化",

  // 工作区、文件、Git、插件、蜂群、设置导航
  "Workspace": "工作区",
  "Workspaces": "工作区",
  "Project": "项目",
  "Projects": "项目",
  "Files": "文件",
  "Folder": "文件夹",
  "Folders": "文件夹",
  "Changes": "变更",
  "Modified": "已修改",
  "Branch": "分支",
  "Commit": "提交",
  "Repo": "代码仓",
  "Repository": "代码仓",
  "Worktree": "工作树",
  "Fork": "派生",
  "Agents": "智能体",
  "Agent": "智能体",
  "Automations": "自动化",
  "Automation": "自动化",
  "Schedule": "定时计划",
  "Skill": "技能",
  "Skills": "技能",
  "Rules": "规则",
  "Hooks": "钩子",
  "Plugin": "插件",
  "Plugins": "插件",
  "Marketplace": "插件市场",
  "Connectors": "连接器",
  "Extension": "扩展",
  "Bundles": "套装",
  "Decorations": "装饰项",
  "Actions": "操作",
  "Comments": "评论",
  "Comment": "评论",
  "Conversation": "对话",
  "Conversations": "对话",
  "Model": "模型",
  "Models": "模型",
  "Plan": "规划",
  "Mode": "模式",
  "Voice": "语音",
  "Voices": "语音",
  "Recording": "录音中",
  "Thinking": "思考中",
  "Mentions": "提及",
  "Image": "图片",
  "Environment": "环境",
  "Settings": "设置",
  "Account": "账户",
  "Accounts": "账户",
  "Shortcuts": "快捷键",
  "Themes": "主题",
  "Version": "版本",
  "Telemetry": "遥测",
  "Advanced": "高级",
  "Custom": "自定义",
  "Global": "全局",
  "Preset": "预设",
  "Status": "状态",
  "Name": "名称",
  "Type": "类型",
  "Email": "邮箱",
  "Volume": "音量",
  "Layout": "布局",
  "Logs": "日志",
  "Resources": "资源",
  "Fields": "字段",
  "Other": "其他",
  "Unread": "未读",
  "Reading": "读取中",
  "Read": "读取",
  "Clicking": "点击中",
  "Helpers": "助手",
  "Recommended": "推荐",
  "Hourly": "每小时",
  "Untitled": "未命名",
  "Pin": "固定",
  "Unpin": "取消固定",
  "Archive": "归档",
  "Unarchive": "取消归档",
  "Split": "拆分",
  "Split Right": "向右拆分",
  "Split Down": "向下拆分",
  "Background": "后台",
  "Customizations": "自定义扩展",
  "Appearance": "外观",
  "Notifications": "通知",
  "General": "通用",
  "Browser": "浏览器",
  "Labs": "实验室",
  "Developer": "开发者",
  "Application": "应用程序"
};

// =========================================================================
// 3. 动态模板正则规则（序列化注入到前端清洗引擎 v2）
//    每条规则声明：pattern(正则字符串), flags, replacement, controlOnly(是否仅限控件/属性)
// =========================================================================

const DYNAMIC_PATTERNS = [
  { pattern: '^Show (\\d+) more$', flags: '', replacement: '展开其余 $1 项', controlOnly: true },
  { pattern: '^Show (\\d+) more results?$', flags: '', replacement: '查看更多 $1 条结果', controlOnly: true },
  { pattern: '^See all \\((\\d+)\\)$', flags: '', replacement: '查看全部 ($1)', controlOnly: true },
  { pattern: '^(\\d+) files? changed$', flags: '', replacement: '$1 个文件已变更', controlOnly: false },
  { pattern: '^(\\d+) running$', flags: '', replacement: '$1 项运行中', controlOnly: true },
  { pattern: '^(\\d+) selected$', flags: '', replacement: '已选 $1 项', controlOnly: true },
  { pattern: '^(\\d+) matches?$', flags: '', replacement: '$1 处匹配', controlOnly: true },
  { pattern: '^(\\d+) results?$', flags: '', replacement: '$1 条结果', controlOnly: true },
  { pattern: '^(\\d+) comments?$', flags: '', replacement: '$1 条评论', controlOnly: true },
  { pattern: '^(\\d+) items?$', flags: '', replacement: '$1 项', controlOnly: true },
  { pattern: '^(\\d+) tools?$', flags: '', replacement: '$1 项工具', controlOnly: true },
  { pattern: '^(\\d+) Drafts?$', flags: '', replacement: '$1 份草稿', controlOnly: true },
  { pattern: '^(\\d+) plugins? available\\.?$', flags: '', replacement: '共 $1 个插件可用', controlOnly: false },
  { pattern: '^Open Subagent:\\s*(.+)$', flags: '', replacement: '打开子智能体：$1', controlOnly: false },
  { pattern: '^More actions for\\s+(.+)$', flags: '', replacement: '$1 的更多操作', controlOnly: true },
  { pattern: '^Run\\s+(.+)\\s+now$', flags: '', replacement: '立即运行 $1', controlOnly: true },
  { pattern: '^Deleted\\s+"(.+)"\\.?$', flags: '', replacement: '已删除“$1”。', controlOnly: false },
  { pattern: '^Failed to delete\\s+"(.+)"\\.?$', flags: '', replacement: '删除“$1”失败', controlOnly: false },
  { pattern: '^Failed to update\\s+"(.+)"\\.?$', flags: '', replacement: '更新“$1”失败', controlOnly: false },
  { pattern: '^Failed to save project:\\s*(.+)$', flags: '', replacement: '保存项目失败：$1', controlOnly: false },
  { pattern: '^Canceled edit to\\s+(.+)$', flags: '', replacement: '已取消对 $1 的编辑', controlOnly: false },
  { pattern: '^Canceled deletion of\\s+(.+)$', flags: '', replacement: '已取消删除 $1', controlOnly: false },
  { pattern: '^Canceled bookmark of\\s+(.+)$', flags: '', replacement: '已取消收藏 $1', controlOnly: false },
  { pattern: '^Shortcut\\s+(.+)\\s+for\\s+(.+)$', flags: '', replacement: '$2 的快捷键 $1', controlOnly: true }
];

// =========================================================================
// 4. 官方 5 大内置扩展 package.json 全量汉化字典（按 command ID + title 双保险映射）
// =========================================================================

const EXTENSION_MANIFEST_TRANSLATIONS = {
  'agy': {
    commandsById: {
      'antigravity.showThirdPartyNotices': '查看第三方许可声明',
      'antigravity.openChangelog': '打开更新日志',
      'antigravity.resetConversationState': '重置对话状态',
      'antigravity.insertSnippet': '将选中文本添加到对话',
      'antigravity.insertTerminalSnippet': '将终端选中内容添加到对话',
      'antigravity.insertTerminalOutput': '将终端输出添加到对话',
      'antigravity.startNewConversation': '新建对话',
      'antigravity.toggleChatFocus': '切换对话焦点',
      'antigravity.panel.focus': '聚焦 Antigravity 面板',
      'antigravity.acceptAllChanges': '接受所有文件中的变更',
      'antigravity.rejectAllChanges': '拒绝所有文件中的变更',
      'antigravity.inlineDiff.acceptAll': '接受当前文件中的变更',
      'antigravity.inlineDiff.rejectAll': '拒绝当前文件中的变更',
      'antigravity.inlineDiff.acceptFocusedHunk': '接受当前选中的变更块',
      'antigravity.inlineDiff.rejectFocusedHunk': '拒绝当前选中的变更块',
      'antigravity.sideBySide.acceptAll': '接受当前文件中的变更',
      'antigravity.sideBySide.rejectAll': '拒绝当前文件中的变更',
      'antigravity.toggleInlineDiff': '切换行内差异对比',
      'antigravity.openSettings': '打开 Antigravity 设置',
      'antigravity.signIn': '登录账户',
      'antigravity.signOut': '退出登录',
      'antigravity.statusMenu': '显示操作菜单',
      'antigravity.openTelemetrySettings': '管理数据共享与遥测',
      'antigravity.feedback': '意见与反馈',
      'antigravity.createComment': '添加评论到对话',
      'antigravity.editComment': '编辑评论',
      'antigravity.deleteComment': '删除评论',
      'antigravity.saveComment': '保存评论',
      'antigravity.cancelComment': '取消编辑',
      'antigravity.commentForSelection': '为 Antigravity 添加代码评论',
      'antigravity.dynamic.conversationView.findInConversation': '在对话中查找',
      'antigravity.prioritized.supercompleteAccept': '接受智能补全',
      'antigravity.prioritized.supercompleteEscape': '取消智能补全',
      'antigravity.generateCommitMessage': '智能生成 Git 提交信息'
    },
    submenusById: {
      'antigravity.panelMoreSubmenu': '更多操作...'
    },
    customEditorsByViewType: {
      'antigravity.artifactEditor': 'Antigravity 产物文档查看器',
      'jetski.settingsEditor': 'Antigravity 设置查看器'
    },
    settingsByKey: {
      'antigravity.serverPort': {
        description: 'Antigravity 后台服务（`agy --hub`）监听端口。保持为 0（推荐）以自动分配临时端口。每个 VS Code 窗口会启动独立的 `agy` 服务，建议在工作区设置而非用户设置中固定端口；若指定端口已被占用，Antigravity 将自动回退到可用的临时端口。'
      },
      'antigravity.serverStartupTimeoutMs': {
        description: '等待 Antigravity 后端语言服务器启动并通过健康检查的超时时间（毫秒）。'
      },
      'antigravity.heartbeatIntervalMs': {
        description: '启动后 /healthz 存活探针的检测间隔（毫秒，最小 1000；当 Antigravity 视图隐藏或失焦时自动降频为 4 倍）。连续 3 次探测失败将自动重启后端服务。设为 0 可关闭心跳探测。'
      },
      'antigravity.enableTelemetry': {
        markdownDeprecationMessage: '遥测开关现已迁移至 Antigravity 设置 → 账户设置中的 **启用遥测** 开关（[打开设置](command:antigravity.openTelemetrySettings)）。除设为 `false` 时关闭扩展使用指标外，该设置已不再产生其他作用。'
      },
      'antigravity.enableInlineDiff': {
        description: '启用行内 Diff 装饰与 CodeLens 快捷操作。关闭后将回退为在并排 Diff 标签页中审阅变更。'
      },
      'antigravity.autoAcceptOnChat': {
        description: '发起新对话或排队消息时自动接受后台文件中待审阅的修改（非累积模式：重复编辑同一文件仅保留最新一轮 Diff）。关闭后变更将跨轮次累积保留，所有已改文件持续打开直到您手动接受或拒绝。'
      },
      'antigravity.autoOpenFiles': {
        description: '当智能体提出代码修改建议时，自动在编辑器中打开对应文件。'
      },
      'antigravity.enableComments': {
        description: '允许在代码编辑器和 Git Diff 视图中通过行号槽“+”按钮、右键菜单或快捷键向智能体添加行内评论。'
      },
      'antigravity.caCertificates': {
        description: 'PEM 编码的 CA 证书文件路径（例如企业 TLS 检查根证书），将与系统根证书一起被 Antigravity 扩展与语言服务器信任。'
      },
      'antigravity.disableEnterprise': {
        description: '隐藏企业账户登录入口。'
      },
      'antigravity.defaultGroupByNone': {
        description: '在手动选择分组方式之前，智能体侧边栏默认不分组显示。'
      },
      'antigravity.hideWelcomePrefix': {
        description: '登录界面标题不显示“Welcome to”前缀。'
      },
      'antigravity.isAntigravityIde': {
        description: '在智能体 UI 遥测中将当前宿主上报为 Antigravity IDE。'
      },
      'antigravity.releaseBaseUrl': {
        description: 'CLI 下载基础 URL（用于内部测试与自定义源覆盖）。'
      },
      'antigravity.serverArgs': {
        description: '传递给后端语言服务器的附加命令行参数列表。'
      },
      'antigravity.channel': {
        description: '当前扩展构建版本的发布通道。',
        deprecationMessage: '内部通道设置'
      },
      'antigravity.serverUrl': {
        description: '显式指定 Antigravity 后端语言服务器 URL（例如 http://127.0.0.1:4242），将覆盖自动端口分配。'
      }
    }
  },
  'antigravity-code-executor': {
    commandsById: {
      'antigravity-code-executor.executeCode': '执行代码 (Antigravity)'
    }
  },
  'antigravity-dev-containers': {
    commandsById: {
      'antigravity-dev-containers.reopenInContainer': '在开发容器中重新打开',
      'antigravity-dev-containers.showLog': '查看 Antigravity 开发容器日志',
      'antigravity-dev-containers.openInContainer': '在开发容器中打开文件夹',
      'antigravity-dev-containers.reopenFolderLocally': '在本地重新打开文件夹',
      'antigravity-dev-containers.attachToRunningContainer': '附加到正在运行的容器'
    },
    viewsById: {
      'antigravityDevContainers': '开发容器 (Antigravity)'
    },
    settingsByKey: {
      'remote.antigravityDevContainers.enableSSHAgentForwarding': {
        description: '连接开发容器时启用 SSH 代理转发 (SSH Agent Forwarding)。'
      },
      'remote.antigravityDevContainers.experimental.disableServerChecksum': {
        description: '禁用服务端校验和验证（仅推荐用于开发与测试环境）。'
      }
    }
  },
  'antigravity-remote-openssh': {
    commandsById: {
      'antigravity-remote-openssh.closeSSHProcess': '关闭 SSH 进程',
      'antigravity-remote-openssh.newWindow': '连接到 SSH 主机...',
      'antigravity-remote-openssh.currentWindow': '在当前窗口连接到 SSH 主机...',
      'antigravity-remote-openssh.showLog': '查看 SSH 日志...',
      'antigravity-remote-openssh.explorer.emptyWindowInNewWindow': '在新窗口连接到 SSH 主机',
      'antigravity-remote-openssh.explorer.emptyWindowInCurrentWindow': '在当前窗口连接到 SSH 主机',
      'antigravity-remote-openssh.explorer.reopenFolderInCurrentWindow': '在当前窗口打开 SSH 主机目录',
      'antigravity-remote-openssh.explorer.reopenFolderInNewWindow': '在新窗口打开 SSH 主机目录',
      'antigravity-remote-openssh.explorer.deleteFolderHistoryItem': '从列表中移除',
      'antigravity-remote-openssh.explorer.refresh': '刷新',
      'antigravity-remote-openssh.explorer.configure': '配置 SSH 主机',
      'antigravity-remote-openssh.explorer.add': '添加新主机',
      'antigravity-remote-openssh.addCloudtopUrl': '添加 Cloudtop URL'
    },
    viewsById: {
      'antigravitySSHHosts': 'SSH 远程主机 (Antigravity)'
    },
    settingsByKey: {
      'remote.antigravitySSH.configFile': {
        description: '自定义 SSH 配置文件的绝对路径。'
      },
      'remote.antigravitySSH.path': {
        description: 'SSH 可执行文件的绝对路径。留空则自动使用 PATH 中的 ssh。'
      },
      'remote.antigravitySSH.experimental.serverDownloadUrlTemplate': {
        description: '实验性：Antigravity 远程服务端下载地址模板（支持变量占位符替换）。'
      },
      'remote.antigravitySSH.experimental.serverBinaryName': {
        description: '实验性：服务端二进制文件名称，适用于无官方预置构建的自定义客户端环境。'
      },
      'remote.antigravitySSH.experimental.disableServerChecksum': {
        description: '实验性：禁用服务端校验和验证（仅推荐用于开发与测试环境）。'
      }
    }
  },
  'antigravity-remote-wsl': {
    commandsById: {
      'antigravityremotewsl.connect': '连接到 WSL',
      'antigravityremotewsl.connectInNewWindow': '在新窗口连接到 WSL',
      'antigravityremotewsl.connectUsingDistro': '使用指定发行版连接到 WSL...',
      'antigravityremotewsl.connectUsingDistroInNewWindow': '在新窗口使用指定发行版连接到 WSL...',
      'antigravityremotewsl.showLog': '查看 WSL 日志',
      'antigravityremotewsl.explorer.emptyWindowInNewWindow': '在新窗口连接',
      'antigravityremotewsl.explorer.emptyWindowInCurrentWindow': '在当前窗口连接',
      'antigravityremotewsl.explorer.reopenFolderInCurrentWindow': '在当前窗口打开',
      'antigravityremotewsl.explorer.reopenFolderInNewWindow': '在新窗口打开',
      'antigravityremotewsl.explorer.deleteFolderHistoryItem': '从最近列表移除',
      'antigravityremotewsl.explorer.refresh': '刷新',
      'antigravityremotewsl.explorer.addDistro': '添加发行版',
      'antigravityremotewsl.explorer.setDefaultDistro': '设为默认发行版',
      'antigravityremotewsl.explorer.deleteDistro': '删除发行版'
    },
    viewsById: {
      'antigravityWslTargets': 'WSL 目标环境 (Antigravity)'
    },
    settingsByKey: {
      'remote.WSL.serverDownloadUrlTemplate': {
        description: 'Antigravity WSL 服务端下载地址模板（支持环境变量占位符替换）。'
      },
      'remote.WSL.experimental.disableServerChecksum': {
        description: '实验性：禁用服务端校验和验证（仅推荐用于开发与测试环境）。'
      }
    }
  }
};

// =========================================================================
// 5. extensions/agy/vscode/extension.js 原生提示弹窗精确汉化
// =========================================================================

const EXTENSION_RUNTIME_MESSAGES = [
  [
    '"Inline diffs work best with Auto Save off. Turn off Auto Save, or switch to side-by-side diffs."',
    '"行内 Diff 在关闭自动保存时体验最佳。建议关闭自动保存，或切换为并排 Diff 对比模式。"'
  ],
  [
    '"Side-by-side diffs will be used once the open inline reviews are done."',
    '"当前已打开的行内审阅完成后，将自动切换为并排 Diff 对比模式。"'
  ],
  [
    '"A diagnostics report for this Antigravity version was already sent in the last 24 hours, so it was not sent again."',
    '"过去 24 小时内已提交过当前 Antigravity 版本的诊断报告，本次无需重复发送。"'
  ],
  [
    '"Thank you! Your feedback has been submitted successfully."',
    '"感谢反馈！您的意见已成功提交。"'
  ],
  [
    '"Antigravity: Signed out"',
    '"Antigravity：已退出登录"'
  ],
  [
    '"Use Reject to undo the agent\'s change"',
    '"请点击「拒绝」以撤销智能体的此项修改"'
  ],
  [
    '"Antigravity conversation state reset."',
    '"Antigravity 对话状态已重置。"'
  ],
  [
    '"Antigravity: Sign-in successful"',
    '"Antigravity：登录成功"'
  ],
  [
    '"Changing the Antigravity server port requires reloading the window to take effect."',
    '"修改 Antigravity 服务端口后，需要重新加载窗口才能生效。"'
  ],
  [
    '"Changing proxy or CA certificate settings requires reloading the window for Antigravity to apply them."',
    '"修改代理或 CA 证书配置后，需要重新加载窗口以使 Antigravity 应用新设置。"'
  ]
];

// =========================================================================
// 6. 内置浏览器引导页（browserLanding.html / browserOnboarding.html）汉化映射
// =========================================================================

const BROWSER_ONBOARDING_TRANSLATIONS = {
  'browserLanding.html': [
    ['<title>Browser</title>', '<title>内置浏览器</title>'],
    ['<h3 class="welcome-text">Welcome to</h3>', '<h3 class="welcome-text">欢迎使用</h3>'],
    ['<h1 class="main-title">Antigravity Browser Control</h1>', '<h1 class="main-title">Antigravity 浏览器自动化控制</h1>'],
    ['<p class="preview-pill">Preview</p>', '<p class="preview-pill">预览版</p>'],
    ['<h2 class="hero-title">Getting Started</h2>', '<h2 class="hero-title">快速上手</h2>'],
    [
      'The agent can click, scroll, type, and navigate web pages automatically. While working, it displays an overlay\n\t\t\t\tshowing its progress and provides controls to stop execution if you need to intervene.',
      '智能体可自动点击、滚动、输入并浏览网页。运行期间页面会显示实时进度浮层，并提供随时停止执行的控制按钮，方便您在需要时人工接管。'
    ],
    [
      'Simply return to your Antigravity conversation, and the browser will be used automatically when appropriate.',
      '只需返回您的 Antigravity 对话窗口，智能体将在合适时机自动调用内置浏览器完成任务。'
    ],
    ['<h3 class="section-heading">Example Use Cases</h3>', '<h3 class="section-heading">典型使用场景</h3>'],
    ['<span class="use-case-text">Iterating on website designs and implementations</span>', '<span class="use-case-text">快速迭代网站设计与前端实现</span>'],
    ['<span class="use-case-text">Quality assurance testing</span>', '<span class="use-case-text">端到端质量保障与交互测试</span>'],
    ['<span class="use-case-text">Monitoring dashboards</span>', '<span class="use-case-text">实时巡检与监控业务看板</span>'],
    ['<span class="use-case-text">Automating routine tasks like rerunning CI</span>', '<span class="use-case-text">自动处理日常重复任务（如重跑 CI 流水线）</span>']
  ],
  'browserOnboarding.html': [
    ['<title>Browser Onboarding</title>', '<title>浏览器扩展引导</title>'],
    ['<h1 class="main-title">Browser Setup</h1>', '<h1 class="main-title">浏览器集成配置</h1>'],
    ['<p class="preview-pill">Preview</p>', '<p class="preview-pill">预览版</p>'],
    [
      'Bring the Antigravity agent into your browser to see and interact with websites. It empowers the agent\n\t\t\t\tto test\n\t\t\t\tfeatures, intelligently monitor dashboards, and seamlessly handle routine browser tasks.',
      '将 Antigravity 智能体接入浏览器以查看并操作网页，助力智能体自动测试功能、智能监控仪表盘，并流畅处理各类日常浏览器任务。'
    ],
    [
      'Security Disclaimer: While browser access and actuation increases the Agent\'s\n\t\t\t\t\tknowledge base and autonomy, this also increases risk to prompt injection or other malicious\n\t\t\t\t\tbehavior.',
      '安全提示：开启浏览器访问与自动操作会显著提升智能体的信息获取能力与自主性，但同时也可能增加遭遇网页提示词注入（Prompt Injection）或其他恶意内容的风险。'
    ],
    ['<p class="description">Install the extension to get started.</p>', '<p class="description">安装浏览器扩展后即可开始使用。</p>'],
    ['\t\t\t\t\tInstall extension\n', '\t\t\t\t\t安装浏览器扩展\n']
  ]
};

module.exports = {
  SAFE_GLOBAL_PHRASES,
  CONTROL_ONLY_PHRASES,
  DYNAMIC_PATTERNS,
  EXTENSION_MANIFEST_TRANSLATIONS,
  EXTENSION_RUNTIME_MESSAGES,
  BROWSER_ONBOARDING_TRANSLATIONS
};
