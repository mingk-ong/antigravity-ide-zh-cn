/**
 * Antigravity IDE 深度全量汉化中英文字典 (v1.107.0 全界面精准细节增强版)
 * 适配目标：
 * 1. out/main.js (Electron 主入口与主界面，最为关键)
 * 2. out/vs/workbench/workbench.desktop.main.js (VS Code 工作区核心)
 * 3. out/jetskiAgent/main.js (独立弹窗界面)
 */

// 1. 设置侧边栏与导航映射表
const navScreenMap = {
  "General": "通用设置",
  "Appearance": "外观偏好",
  "Notifications": "系统通知",
  "Models": "模型与额度",
  "Browser": "内置浏览器",
  "Account": "账户设置",
  "Tab": "Tab 补全",
  "Editor": "代码编辑器",
  "Customizations": "自定义扩展与技能",
  "Shortcuts": "键盘快捷键",
  "Labs": "实验室特性",
  "Project 4K": "Project 4K 模式",
  "CitC Settings": "CitC 代码仓",
  "Provide Feedback": "问题与反馈",
  "Give Feedback": "问题与反馈",
  "Conversations": "对话历史",
  "Workspaces": "工作区",
  "Projects": "项目分组",
  "Not in Project": "未归属项目",
  "Application": "应用程序",
  "Developer": "开发者选项"
};

// 2. 侧边栏与导航展示层字典
const navDictionary = [
  // out/main.js 侧边栏 Label 转换函数 a0e(e) 汉化拦截 (主入口关键)
  {
    category: 'main.js侧边栏Label转换',
    from: 'function a0e(e){return Pra.get(e)??e}',
    to: `function a0e(e){let _k=Pra.get(e)??e;return(${JSON.stringify(navScreenMap)}[_k]||${JSON.stringify(navScreenMap)}[e]||_k)}`
  },
  // out/main.js 侧边栏组件 SY 展示层汉化拦截
  {
    category: 'main.js侧边栏项目展示',
    from: 'className:Pe("text-sm transition-colors select-none truncate flex-1",r?"text-foreground":"text-secondary-foreground group-hover/nav-item:text-foreground"),children:t??e})',
    to: `className:Pe("text-sm transition-colors select-none truncate flex-1",r?"text-foreground":"text-secondary-foreground group-hover/nav-item:text-foreground"),children:(${JSON.stringify(navScreenMap)}[t??e]||${JSON.stringify(navScreenMap)}[e]||(t??e))})`
  },
  // out/main.js 侧边栏分组标题 (h1, h2)
  {
    category: 'main.js侧边栏分类标题',
    from: 'children:h("h1",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"Settings"})',
    to: 'children:h("h1",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"设置 (Settings)"})'
  },
  {
    category: 'main.js侧边栏分类标题',
    from: 'children:h("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"Projects"})',
    to: 'children:h("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"项目分组 (Projects)"})'
  },
  {
    category: 'main.js侧边栏分类标题',
    from: 'children:h("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"Not in Project"})',
    to: 'children:h("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"未归属项目"})'
  },
  {
    category: 'main.js侧边栏分类标题',
    from: 'children:h("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"Workspaces"})',
    to: 'children:h("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"工作区 (Workspaces)"})'
  },
  // out/main.js 展开折叠按钮
  {
    category: 'main.js侧边栏展开按钮',
    from: 'children:b?"Show Less":"Show All"',
    to: 'children:b?"收起列表":"显示全部"'
  },
  // out/main.js 顶栏标题
  {
    category: 'main.js顶栏标题',
    from: 'children:[h("div",{className:"text-xs",children:["Settings - ",e]}),h(Z2a,{})]',
    to: `children:[h("div",{className:"text-xs",children:["设置 - ",(${JSON.stringify(navScreenMap)}[e]||e)]}),h(Z2a,{})]`
  },

  // workbench 侧边栏 Label 转换函数 tct(t) 汉化拦截
  {
    category: '侧边栏Label转换',
    from: 'function tct(t){return Uud.get(t)??t}',
    to: `function tct(t){let _k=Uud.get(t)??t;return(${JSON.stringify(navScreenMap)}[_k]||${JSON.stringify(navScreenMap)}[t]||_k)}`
  },
  // workbench 侧边栏组件 PUe 展示层汉化拦截
  {
    category: 'workbench侧边栏项目展示',
    from: 'className:ht("text-sm transition-colors select-none truncate flex-1",n?"text-foreground":"text-secondary-foreground group-hover/nav-item:text-foreground"),children:e??t})',
    to: `className:ht("text-sm transition-colors select-none truncate flex-1",n?"text-foreground":"text-secondary-foreground group-hover/nav-item:text-foreground"),children:(${JSON.stringify(navScreenMap)}[e??t]||${JSON.stringify(navScreenMap)}[t]||(e??t))})`
  },
  // jetskiAgent 侧边栏组件 oO 展示层汉化
  {
    category: 'jetskiAgent侧边栏项目展示',
    from: 'children:d("span",{className:ke("text-sm transition-colors select-none truncate flex-1",n?"text-foreground":"text-secondary-foreground group-hover/nav-item:text-foreground"),children:t??e})',
    to: `children:d("span",{className:ke("text-sm transition-colors select-none truncate flex-1",n?"text-foreground":"text-secondary-foreground group-hover/nav-item:text-foreground"),children:(${JSON.stringify(navScreenMap)}[t??e]||${JSON.stringify(navScreenMap)}[e]||(t??e))})`
  },
  // 侧边栏分组标题 (workbench)
  {
    category: '侧边栏分类标题',
    from: 'children:v("h1",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"Settings"})',
    to: 'children:v("h1",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"设置 (Settings)"})'
  },
  {
    category: '侧边栏分类标题',
    from: 'children:v("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"Workspaces"})',
    to: 'children:v("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"工作区 (Workspaces)"})'
  },
  {
    category: '侧边栏分类标题',
    from: 'children:v("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"Projects"})',
    to: 'children:v("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"项目分组 (Projects)"})'
  },
  {
    category: '侧边栏分类标题',
    from: 'children:v("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"Not in Project"})',
    to: 'children:v("h2",{className:"m-0 text-xs font-medium text-muted-foreground select-none",children:"未归属项目"})'
  },
  // 侧边栏分组标题 (jetskiAgent)
  {
    category: '侧边栏标题',
    from: 'children:"Workspaces"',
    to: 'children:"工作区 (Workspaces)"'
  },
  {
    category: '侧边栏标题',
    from: 'children:"Projects"',
    to: 'children:"项目分组 (Projects)"'
  },
  {
    category: '侧边栏标题',
    from: 'children:"Not in Project"',
    to: 'children:"未归属项目"'
  },
  // 侧边栏展开折叠按钮 (workbench & jetskiAgent)
  {
    category: '侧边栏展开按钮',
    from: 'children:E?"Show Less":"Show All"',
    to: 'children:E?"收起列表":"显示全部"'
  },
  {
    category: '侧边栏展开按钮',
    from: 'children:A?"Show Less":"Show All"',
    to: 'children:A?"收起列表":"显示全部"'
  },
  {
    category: '侧边栏展开按钮',
    from: 'children:R?"Show Less":"Show All"',
    to: 'children:R?"收起列表":"显示全部"'
  },
  {
    category: '侧边栏展开按钮',
    from: 'children:"Show all"',
    to: 'children:"显示全部"'
  },
  // 顶栏标题 (workbench & jetskiAgent)
  {
    category: '顶栏标题',
    from: 'children:[v("div",{className:"text-xs",children:["Settings - ",t]}),v(KGd,{})]',
    to: `children:[v("div",{className:"text-xs",children:["设置 - ",(${JSON.stringify(navScreenMap)}[t]||t)]}),v(KGd,{})]`
  },
  {
    category: '顶栏标题',
    from: 'children:[d("div",{className:"text-xs",children:["Settings - ",e]}),d(bGd,{})]',
    to: `children:[d("div",{className:"text-xs",children:["设置 - ",(${JSON.stringify(navScreenMap)}[e]||e)]}),d(bGd,{})]`
  },
  {
    category: '顶栏按钮',
    from: 'title:"Close Settings"',
    to: 'title:"关闭设置"'
  }
];

// 3. 通用设置面板 (General) 与权限预设卡片 (Global Permissions)
const generalPageDictionary = [
  // out/main.js General 主面板标题与描述
  {
    category: '通用面板头部',
    from: 'return h(Ac,{title:"General",description:"Configure agent execution, queued message delivery, and permissions.",children:h("div",{className:"space-y-6"',
    to: 'return h(Ac,{title:"通用设置 (General)",description:"配置智能体运行执行策略、追问排队递交机制以及安全权限体系。",children:h("div",{className:"space-y-6"'
  },
  // out/main.js 全局权限分区标题与描述
  {
    category: '全局权限标题',
    from: '_t=fe?h(Ta,{title:"Global Permissions",subtitle:h("span",{children:["Configure global allowed and denied resource permissions."," "',
    to: '_t=fe?h(Ta,{title:"全局资源权限 (Global Permissions)",subtitle:h("span",{children:["配置全局允许和拒绝的资源权限规则。"," ",'
  },
  {
    category: '全局权限标题',
    from: 'gt=()=>h(Ta,{title:G?"Global Permissions":"Agent Settings",children:[h(Ei,{children:[h(i9,{nativeOnMobile:!0,label:"Securi',
    to: 'gt=()=>h(Ta,{title:G?"全局资源权限 (Global Permissions)":"智能体设置 (Agent Settings)",children:[h(Ei,{children:[h(i9,{nativeOnMobile:!0,label:"Securi'
  },
  // out/main.js 权限说明文本
  {
    category: '权限说明文本',
    from: 'qEe="Controls the actions the agent can take."',
    to: 'qEe="控制智能体在当前环境下可执行操作的权限级别。"'
  },
  // out/main.js 工具权限与网络访问规则
  {
    category: '工具权限项',
    from: 'le and terminal tools.",Qn=h(Js,{label:"Tool Permissions",badge:sr>0?sr:void 0,description:Cr,rightElement:h(lt,{variant:"secondary",size:"md",onClick:()=>{Ce("tools")},children:"Open"})})',
    to: 'le and terminal tools.",Qn=h(Js,{label:"工具与终端权限 (Tool Permissions)",badge:sr>0?sr:void 0,description:Cr,rightElement:h(lt,{variant:"secondary",size:"md",onClick:()=>{Ce("tools")},children:"打开配置"})})'
  },
  {
    category: '网络权限项',
    from: 'Si=h(Js,{label:"Network Access Rules",badge:ge>0?ge:void 0,description:"Configure allowed and denied URLs for reading.",rightElement:h(lt,{variant:"secondary",size:"sm",onClick:()=>{Ce("network")},children:"Open"})})',
    to: 'Si=h(Js,{label:"网络访问规则 (Network Access Rules)",badge:ge>0?ge:void 0,description:"配置允许和禁止智能体抓取读取的网络 URL 规则列表。",rightElement:h(lt,{variant:"secondary",size:"sm",onClick:()=>{Ce("network")},children:"打开配置"})})'
  },
  // out/main.js 追问排队选项
  {
    category: '追问排队选项',
    from: 'options:[Dc.WHEN_IDLE,Dc.NEXT_INVOCATION],resolveOptionToString:t=>{switch(t){case Dc.NEXT_INVOCATION:return"Send Immediately";case Dc.WHEN_IDLE:default:return"Queue"}}',
    to: 'options:[Dc.WHEN_IDLE,Dc.NEXT_INVOCATION],resolveOptionToString:t=>{switch(t){case Dc.NEXT_INVOCATION:return"立即递交 (Send Immediately)";case Dc.WHEN_IDLE:default:return"空闲排队 (Queue)"}}'
  },
  // out/main.js 快捷键
  {
    category: '快捷键提示',
    from: 'children:[h("span",{children:"Keyboard shortcuts"}),h("span",{"data-tooltip-id":r',
    to: 'children:[h("span",{children:"键盘快捷键"}),h("span",{"data-tooltip-id":r'
  },

  // workbench General 主面板
  {
    category: '通用面板头部',
    from: 'return v(uv,{title:"General",description:"Configure agent execution, queued message delivery, and permissions.",children:v("div",{className:"space-y-6"',
    to: 'return v(uv,{title:"通用设置 (General)",description:"配置智能体运行执行策略、追问排队递交机制以及安全权限体系。",children:v("div",{className:"space-y-6"'
  },
  // jetskiAgent General 主面板
  {
    category: '通用面板头部',
    from: 'return d(cv,{title:"General",description:"Configure agent execution, queued message delivery, and permissions.",children:d("div",{className:"space-y-6"',
    to: 'return d(cv,{title:"通用设置 (General)",description:"配置智能体运行执行策略、追问排队递交机制以及安全权限体系。",children:d("div",{className:"space-y-6"'
  },
  // workbench 全局权限分区
  {
    category: '全局权限标题',
    from: 'Ri=Ae?v(qc,{title:"Global Permissions",subtitle:v("span",{children:["Configure global allowed and denied resource permissions."," "',
    to: 'Ri=Ae?v(qc,{title:"全局资源权限 (Global Permissions)",subtitle:v("span",{children:["配置全局允许和拒绝的资源权限规则。"," ",'
  },
  {
    category: '全局权限标题',
    from: 'ri=()=>v(qc,{title:W?"Global Permissions":"Agent Settings",children:[',
    to: 'ri=()=>v(qc,{title:W?"全局资源权限 (Global Permissions)":"智能体设置 (Agent Settings)",children:['
  },
  // 权限预设字典 (适用 main.js / workbench / jetskiAgent)
  {
    category: '权限预设',
    from: 'label:"Request Review",description:"Ask before sensitive operations."',
    to: 'label:"人工审核模式 (Request Review)",description:"执行任何敏感或沙盒外操作前均须人工审核确认。"'
  },
  {
    category: '权限预设',
    from: 'label:"Request Review",description:"Every command requires approval."',
    to: 'label:"人工审核模式 (Request Review)",description:"执行任何终端命令前均须人工审核确认。"'
  },
  {
    category: '权限预设',
    from: 'label:"Default",description:"Ask before sensitive operations."',
    to: 'label:"标准推荐模式 (Default)",description:"执行敏感操作或沙盒外操作前进行确认提示。"'
  },
  {
    category: '权限预设',
    from: 'label:"Auto (Preview)",description:"Automatically decide if commands run."',
    to: 'label:"自主决策模式 (Auto 预览)",description:"智能体自动推演评估指令安全性并自主执行。"'
  },
  {
    category: '权限预设',
    from: 'label:"Turbo",description:"Run all commands without restrictions."',
    to: 'label:"极速自主模式 (Turbo)",description:"全自动无限制执行所有终端指令与文件修改。"'
  },
  {
    category: '权限说明文本',
    from: 'var yHt="Controls the actions the agent can take.";',
    to: 'var yHt="控制智能体在当前环境下可执行操作的权限级别。";'
  },
  {
    category: '权限预设Label',
    from: 'label:"Permission Preset"',
    to: 'label:"权限预设模板 (Permission Preset)"'
  },
  // 工具调用权限
  {
    category: '工具权限项',
    from: 'label:"Tool Permissions"',
    to: 'label:"工具与终端权限 (Tool Permissions)"'
  },
  {
    category: '工具权限描述',
    from: 'qs=le?"Modify permissions for file, terminal, and MCP tools.":"Modify permissions for file and terminal tools."',
    to: 'qs=le?"配置代码文件、终端命令及 MCP 扩展工具的访问执行权限。":"配置代码文件及终端命令的访问执行权限。"'
  },
  // 网络访问规则
  {
    category: '网络权限项',
    from: 'label:"Network Access Rules"',
    to: 'label:"网络访问规则 (Network Access Rules)"'
  },
  {
    category: '网络权限描述',
    from: 'description:"Configure allowed and denied URLs for reading."',
    to: 'description:"配置允许和禁止智能体抓取读取的网络 URL 规则列表。"'
  },
  // 卡片中的打开配置按钮
  {
    category: '打开配置按钮',
    from: 'children:"Open"',
    to: 'children:"打开配置"'
  },
  // 执行卡片 (Execution)
  {
    category: '执行分区标题',
    from: 'title:"Execution"',
    to: 'title:"执行机制 (Execution)"'
  },
  // 追问排队机制
  {
    category: '追问排队机制',
    from: 'screen:"General",label:"Queued Messages",description:"Configure when follow-up messages are sent."',
    to: 'screen:"General",label:"追问排队递交 (Queued Messages)",description:"配置后续追问消息何时递交发送给智能体。"'
  },
  {
    category: '追问排队选项',
    from: 'switch(e){case Vm.NEXT_INVOCATION:return"Send Immediately";case Vm.WHEN_IDLE:default:return"Queue"}}',
    to: 'switch(e){case Vm.NEXT_INVOCATION:return"立即递交 (Send Immediately)";case Vm.WHEN_IDLE:default:return"空闲排队 (Queue)"}}'
  },
  {
    category: '追问排队选项说明',
    from: 'switch(e){case Vm.NEXT_INVOCATION:return"Send follow-up messages immediately without waiting for the current task to finish.";case Vm.WHEN_IDLE:default:return"Queue follow-up messages and send them after the current task finishes."}}',
    to: 'switch(e){case Vm.NEXT_INVOCATION:return"无需等待当前任务结束，立即递交后续追问消息。";case Vm.WHEN_IDLE:default:return"等待当前任务结束后，再按顺序排队递交追问消息。"}}'
  },
  // 底部快捷键提示
  {
    category: '快捷键提示',
    from: 'children:[v("span",{children:"Keyboard shortcuts"}),v("span",{"data-tooltip-id":n',
    to: 'children:[v("span",{children:"键盘快捷键"}),v("span",{"data-tooltip-id":n'
  },
  {
    category: '快捷键提示',
    from: 'children:[d("span",{children:"Keyboard shortcuts"}),d("span",{"data-tooltip-id":n',
    to: 'children:[d("span",{children:"键盘快捷键"}),d("span",{"data-tooltip-id":n'
  },
  // 安全模式卡片
  {
    category: '安全模式标题',
    from: 'children:"Agent security mode"',
    to: 'children:"智能体安全运行模式"'
  },
  {
    category: '安全模式卡片',
    from: 'children:"Full access"',
    to: 'children:"完全信任模式 (Full access)"'
  },
  {
    category: '安全模式说明',
    from: 'children:"Agents have full access to your machine and external resources."',
    to: 'children:"智能体拥有对您本机环境、终端及外部资源的完全访问权限。"'
  },
  {
    category: '安全模式卡片',
    from: 'children:"Sandboxed"',
    to: 'children:"沙盒防护模式 (Sandboxed)"'
  },
  {
    category: '安全模式说明',
    from: 'children:"Agents run in a secure sandbox that restricts access to external resources outside of your trusted folders."',
    to: 'children:"智能体在安全的隔离沙盒中运行，严格限制对受信任工作区外部资源的访问。"'
  },
  {
    category: '安全模式卡片',
    from: 'children:"Strict"',
    to: 'children:"严格防御模式 (Strict)"'
  },
  {
    category: '安全模式说明',
    from: 'children:"Terminal commands always require review and the agent cannot access files outside of its given workspaces."',
    to: 'children:"所有终端命令均须经过人工审核确认，且智能体严禁访问指定工作区外部文件。"'
  },
  {
    category: '了解详情链接',
    from: 'children:"Learn more"',
    to: 'children:"了解详情"'
  }
];

// 4. 对话主输入框占位符
const chatInputDictionary = [
  // out/main.js
  {
    category: '输入框占位符',
    from: '"Ask anything, @ to mention"+(r?", / for actions":"")',
    to: '"向智能体提问，输入 @ 引用上下文"+(r?", 输入 / 触发动作":"")'
  },
  // workbench & jetskiAgent
  {
    category: '输入框占位符',
    from: '"Ask anything, @ to mention"+(n?", / for actions":"")',
    to: '"向智能体提问，输入 @ 引用上下文"+(n?", 输入 / 触发动作":"")'
  },
  {
    category: '子智能体占位符',
    from: '"Message subagent, @ to mention"+(n?", / for actions":"")',
    to: '"向子智能体发送指令，输入 @ 引用上下文"+(n?", 输入 / 触发动作":"")'
  }
];

// 5. 对话历史项右键上下文菜单
const conversationContextMenuDictionary = [
  // out/main.js 特有形式 (使用 SA 图标函数与 x 数组)
  {
    category: 'main.js右键菜单',
    from: '{id:"rename",label:"Rename",icon:SA("edit"),testId:"conversation-rename-menu-item"',
    to: '{id:"rename",label:"重命名",icon:SA("edit"),testId:"conversation-rename-menu-item"'
  },
  {
    category: 'main.js右键菜单',
    from: 'label:S?"Unpin":"Pin",icon:SA(S?"keep_off":"keep")',
    to: 'label:S?"取消固定":"固定对话",icon:SA(S?"keep_off":"keep")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"archive",label:"Archive",icon:SA("archive")',
    to: '{id:"archive",label:"归档对话",icon:SA("archive")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"split",type:"submenu",label:"Split",icon:SA("splitscreen_vertical_add")',
    to: '{id:"split",type:"submenu",label:"拆分视图",icon:SA("splitscreen_vertical_add")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"copy",type:"submenu",label:"Copy",icon:SA("content_copy")',
    to: '{id:"copy",type:"submenu",label:"复制",icon:SA("content_copy")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"delete",label:"Delete",icon:SA("delete")',
    to: '{id:"delete",label:"删除对话",icon:SA("delete")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"share",label:"Share",icon:SA("link_2")',
    to: '{id:"share",label:"分享对话",icon:SA("link_2")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"restore",label:"Restore",icon:SA("unarchive")',
    to: '{id:"restore",label:"恢复对话",icon:SA("unarchive")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"delete",label:"Delete Permanently",icon:SA("delete")',
    to: '{id:"delete",label:"彻底永久删除",icon:SA("delete")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"stop",label:"Stop",icon:SA("stop_circle")',
    to: '{id:"stop",label:"停止生成",icon:SA("stop_circle")'
  },
  {
    category: 'main.js右键菜单',
    from: '{id:"view-debug",label:"View Debug",icon:SA("bug_report")',
    to: '{id:"view-debug",label:"查看调试信息",icon:SA("bug_report")'
  },

  // workbench 与 jetskiAgent (使用 FB 图标函数与 D 数组)
  {
    category: '右键菜单',
    from: '{id:"rename",label:"Rename",icon:FB("edit"),testId:"conversation-rename-menu-item"',
    to: '{id:"rename",label:"重命名",icon:FB("edit"),testId:"conversation-rename-menu-item"'
  },
  {
    category: '右键菜单',
    from: '{id:"rename",label:"Rename",icon:FB("edit")',
    to: '{id:"rename",label:"重命名",icon:FB("edit")'
  },
  {
    category: '右键菜单',
    from: 'label:C?"Unpin":"Pin"',
    to: 'label:C?"取消固定":"固定对话"'
  },
  {
    category: '右键菜单',
    from: 'label:o?"Mark Read":"Mark Unread"',
    to: 'label:o?"标记为已读":"标记为未读"'
  },
  {
    category: '右键菜单',
    from: '{id:"view-debug",label:"View Debug"',
    to: '{id:"view-debug",label:"查看调试信息"'
  },
  {
    category: '右键菜单',
    from: '{id:"copy",type:"submenu",label:"Copy"',
    to: '{id:"copy",type:"submenu",label:"复制"'
  },
  {
    category: '右键菜单',
    from: '{id:"fork",type:"submenu",label:"Fork"',
    to: '{id:"fork",type:"submenu",label:"派生分支 (Fork)"'
  },
  {
    category: '右键菜单',
    from: '{id:"split",type:"submenu",label:"Split"',
    to: '{id:"split",type:"submenu",label:"拆分视图"'
  },
  {
    category: '右键菜单',
    from: '{id:"share",label:"Share"',
    to: '{id:"share",label:"分享对话"'
  },
  {
    category: '右键菜单',
    from: '{id:"stop",label:"Stop"',
    to: '{id:"stop",label:"停止生成"'
  },
  {
    category: '右键菜单',
    from: '{id:"archive",label:"Archive"',
    to: '{id:"archive",label:"归档对话"'
  },
  {
    category: '右键菜单',
    from: '{id:"delete",label:"Delete"',
    to: '{id:"delete",label:"删除对话"'
  },
  {
    category: '右键菜单',
    from: '{id:"restore",label:"Restore"',
    to: '{id:"restore",label:"恢复对话"'
  },
  {
    category: '右键菜单',
    from: '{id:"delete",label:"Delete Permanently"',
    to: '{id:"delete",label:"彻底永久删除"'
  },
  {
    category: '右键菜单',
    from: '{id:"telemetry",type:"checkbox",label:"Telemetry"',
    to: '{id:"telemetry",type:"checkbox",label:"匿名遥测"'
  },
  // CV 全局命令对象
  {
    category: '全局命令',
    from: 'toggleSidebar:{id:"sidebar.toggleSidebar",label:"Toggle Sidebar"',
    to: 'toggleSidebar:{id:"sidebar.toggleSidebar",label:"切换侧边栏"'
  },
  {
    category: '全局命令',
    from: 'feedback:{id:"sidebar.feedback",label:"Provide Feedback"',
    to: 'feedback:{id:"sidebar.feedback",label:"问题与反馈"'
  },
  {
    category: '全局命令',
    from: 'markAllAsRead:{id:"conversations.markAllAsRead",label:"Mark All as Read"',
    to: 'markAllAsRead:{id:"conversations.markAllAsRead",label:"全部标记为已读"'
  },
  {
    category: '全局命令',
    from: 'copyMarkdown:{id:"conversationView.copyConversationMarkdown",label:"Copy Conversation Markdown"',
    to: 'copyMarkdown:{id:"conversationView.copyConversationMarkdown",label:"复制对话 Markdown"'
  },
  {
    category: '全局命令',
    from: 'openSettings:{id:"settings.open",label:"Open Settings"',
    to: 'openSettings:{id:"settings.open",label:"打开设置"'
  },
  {
    category: '全局命令',
    from: 'restartMainLs:{id:"ls.restartMain",label:"Restart Main Language Server"',
    to: 'restartMainLs:{id:"ls.restartMain",label:"重启主语言服务"'
  },
  {
    category: '全局命令',
    from: 'archiveConversation:{id:"conversationView.archiveConversation",label:"Archive This Conversation"',
    to: 'archiveConversation:{id:"conversationView.archiveConversation",label:"归档此对话"'
  },
  {
    category: '全局命令',
    from: 'findInConversation:{id:"conversationView.findInConversation",label:"Find in Conversation"',
    to: 'findInConversation:{id:"conversationView.findInConversation",label:"在对话中查找"'
  },
  {
    category: '全局命令',
    from: 'pinConversation:{id:"conversationView.pinConversation",label:"Pin This Conversation"',
    to: 'pinConversation:{id:"conversationView.pinConversation",label:"固定此对话"'
  },
  {
    category: '全局命令',
    from: 'unpinConversation:{id:"conversationView.unpinConversation",label:"Unpin This Conversation"',
    to: 'unpinConversation:{id:"conversationView.unpinConversation",label:"取消固定此对话"'
  },
  {
    category: '全局命令',
    from: 'markConversationAsRead:{id:"conversationView.markAsRead",label:"Mark This Conversation as Read"',
    to: 'markConversationAsRead:{id:"conversationView.markAsRead",label:"标记此对话为已读"'
  },
  {
    category: '全局命令',
    from: 'markConversationAsUnread:{id:"conversationView.markAsUnread",label:"Mark This Conversation as Unread"',
    to: 'markConversationAsUnread:{id:"conversationView.markAsUnread",label:"标记此对话为未读"'
  },
  {
    category: '全局命令',
    from: 'renameConversation:{id:"conversationView.renameConversation",label:"Rename This Conversation"',
    to: 'renameConversation:{id:"conversationView.renameConversation",label:"重命名此对话"'
  }
];

// 6. 全量 61 项设置项 Label 与 Description
const settingsDictionary = [
  // 终端与沙盒
  {
    category: '设置项Label',
    from: 'label:"Terminal Command Auto-Execution Policy"',
    to: 'label:"终端命令自动执行策略 (Auto-Execution)"'
  },
  {
    category: '设置项说明',
    from: 'description:"Specifies the policy for auto-executing commands in the terminal."',
    to: 'description:"指定终端命令的自动执行策略（全速执行、沙盒内执行或每次询问）。"'
  },
  {
    category: '设置项Label',
    from: 'label:"Use Terminal Sandbox"',
    to: 'label:"启用终端安全沙盒 (Terminal Sandbox)"'
  },
  {
    category: '设置项说明',
    from: 'description:"Run terminal commands with sandbox restrictions."',
    to: 'description:"在受限沙盒环境中运行终端命令，防护系统安全。"'
  },
  {
    category: '设置项说明',
    from: 'description:"When enabled, terminal commands run with sandbox restrictions."',
    to: 'description:"启用后，终端命令将在隔离受限的沙盒环境中运行。"'
  },
  {
    category: '设置项Label',
    from: 'label:"Sandbox Allow Network"',
    to: 'label:"允许沙盒访问网络 (Sandbox Allow Network)"'
  },
  {
    category: '设置项说明',
    from: 'description:"Allow sandboxed commands to make network requests."',
    to: 'description:"允许沙盒中运行的终端命令向外部发起网络请求。"'
  },
  {
    category: '设置项说明',
    from: 'description:"When enabled, commands run inside the sandbox can access the network."',
    to: 'description:"启用后，沙盒内运行的命令可访问外部互联网。"'
  },
  // 工作区外文件访问
  {
    category: '设置项Label',
    from: 'label:"Outside Workspace File Access Policy"',
    to: 'label:"工作区外文件访问策略"'
  },
  {
    category: '设置项说明',
    from: 'description:"Specifies the policy for the agent reading and modifying files outside of workspaces."',
    to: 'description:"指定智能体读取和修改当前工作区以外文件时的权限策略。"'
  },
  // 工件审查策略
  {
    category: '设置项Label',
    from: 'label:"Artifact Review Policy"',
    to: 'label:"工件审查策略 (Artifact Review Policy)"'
  },
  {
    category: '设置项说明',
    from: 'description:"Specifies when the agent requires review for generated artifacts."',
    to: 'description:"指定智能体生成或更新工件（如任务计划、代码补丁）时是否需要人工审核。"'
  },
  // 单一对话中修复
  {
    category: '设置项Label',
    from: 'label:"Explain and Fix in Current Conversation"',
    to: 'label:"在当前对话中解释与修复"'
  },
  {
    category: '设置项说明',
    from: 'description:\'Continue "Explain and Fix" actions in the current conversation instead of starting a new one.\'',
    to: 'description:\'在当前已有对话中继续执行“解释并修复”操作，而不是开启全新的会话。\''
  },
  {
    category: '设置项说明',
    from: 'description:\'When enabled, "Explain and Fix" actions will continue in the current conversation instead of starting a new conversation.\'',
    to: 'description:\'启用后，“解释并修复”操作将在当前会话中继续执行，避免频繁创建新会话。\''
  },
  // 终端 Shell 集成
  {
    category: '设置项Label',
    from: 'label:"Enable Shell Integration"',
    to: 'label:"启用终端 Shell 集成"'
  },
  {
    category: '设置项说明',
    from: 'description:"When enabled, terminal commands run with shell integration."',
    to: 'description:"启用后，终端命令将利用 Shell 集成特性进行高可靠状态同步与输出捕获。"'
  },
  // 浏览器设置
  {
    category: '设置项Label',
    from: 'label:"Enable Agent Browser"',
    to: 'label:"启用智能体内置浏览器"'
  },
  {
    category: '设置项说明',
    from: 'description:"When enabled, the agent can use a browser to navigate the web."',
    to: 'description:"启用后，智能体可调用内置浏览器进行实时网页浏览与交互。"'
  },
  {
    category: '设置项Label',
    from: 'label:"Browser JavaScript Execution Policy"',
    to: 'label:"浏览器 JavaScript 执行策略"'
  },
  {
    category: '设置项说明',
    from: 'description:"Specifies the policy for executing JavaScript in the browser."',
    to: 'description:"指定在内置浏览器中执行网页 JavaScript 代码的安全策略。"'
  },
  // 菜单栏与后台
  {
    category: '设置项Label',
    from: 'label:"Keep In Menu Bar"',
    to: 'label:"保持在系统菜单栏/托盘"'
  },
  {
    category: '设置项说明',
    from: 'description:"Keep the app accessible from the menu bar and running in the background when all windows are closed."',
    to: 'description:"关闭所有窗口后，保持应用在菜单栏/托盘后台驻留运行。"'
  },
  {
    category: '设置项说明',
    from: 'description:"The app will be accessible from the menu bar and will keep running in the background when all windows are closed."',
    to: 'description:"所有窗口关闭时，软件将在系统托盘驻留后台，方便随时唤出。"'
  },
  // Tab 补全
  {
    category: '设置项Label',
    from: 'label:"Tab Autocomplete"',
    to: 'label:"Tab 代码智能补全"'
  },
  {
    category: '设置项说明',
    from: 'description:"Enable AI-powered tab autocomplete suggestions while typing."',
    to: 'description:"在键入代码时提供 AI 驱动的单行或多行智能补全建议。"'
  },
  // 自定义规则与技能
  {
    category: '设置项Label',
    from: 'label:"Enable Custom Rules"',
    to: 'label:"启用工作区自定义规则"'
  },
  {
    category: '设置项说明',
    from: 'description:"When enabled, custom rules from your workspace will be loaded."',
    to: 'description:"启用后，将自动加载并遵守工作区 .agent/rules 中的行为规范。"'
  },
  {
    category: '设置项Label',
    from: 'label:"Enable Skills"',
    to: 'label:"启用智能体专业技能 (Skills)"'
  },
  {
    category: '设置项说明',
    from: 'description:"When enabled, agents can invoke specialized skills to solve tasks."',
    to: 'description:"启用后，智能体可按需加载并执行专业技能扩展。"'
  },
  // Project 4K 模式
  {
    category: '设置项Label',
    from: 'label:"Project 4K"',
    to: 'label:"Project 4K 极简模式"'
  },
  {
    category: '设置项说明',
    from: 'description:"Choose between the Default and Project 4K experience."',
    to: 'description:"在标准开发环境与 Project 4K 极简创作体验之间进行选择。"'
  },
  {
    category: '设置项说明',
    from: 'resolveOptionToDescription:e=>e===2?"Project 4K interface without developer tooling.":"The full developer experience."',
    to: 'resolveOptionToDescription:e=>e===2?"Project 4K 纯净智能体界面（隐藏传统开发者工具）。":"标准完整开发者体验（包含全部调试与终端工具）。"'
  },
  {
    category: '设置项选项',
    from: 'resolveOptionToString:e=>e===2?"Project 4K":"Default"',
    to: 'resolveOptionToString:e=>e===2?"Project 4K 极简模式":"默认完整模式 (Default)"'
  },
  {
    category: '设置项选项',
    from: 'resolveOptionToString:t=>t===2?"Project 4K":"Default"',
    to: 'resolveOptionToString:t=>t===2?"Project 4K 极简模式":"默认完整模式 (Default)"'
  }
];

// 7. 下拉选项与返回值字典
const optionsDictionary = [
  // 终端命令选项描述
  {
    category: '终端命令选项',
    from: 'return"The agent never asks for confirmation before executing terminal commands (except those in the Deny list). This provides the agent with the maximum ability to operate over lon',
    to: 'return"智能体在执行终端命令前无需人工确认（拒绝列表中的除外）。这使智能体具备最强的长时间独立作业能力。'
  },
  {
    category: '终端命令选项',
    from: 'return"The agent always asks for confirmation before executing terminal commands (except those in the Allow list).";default:return"Terminal command automatically proceeds if the comm',
    to: 'return"智能体在执行终端命令前一律要求人工确认（允许列表中的除外）。";default:return"终端命令在经过安全评估后自动执行。'
  },
  // 工件审查策略选项描述
  {
    category: '工件审查选项',
    from: 'return"The agent never asks for review. This maximizes the autonomy of the agent, but also has the highest risk of the agent operating over unsafe ',
    to: 'return"智能体从不请求工件审查。这最大化了智能体的自主权，但在潜在不安全操作时具有最高风险。'
  },
  {
    category: '工件审查选项',
    from: 'return"The agent always asks for review.";default:return""',
    to: 'return"智能体在生成或更新工件时始终请求人工审查确认。";default:return""'
  },
  // 通用选项标签
  { category: '选项标签', from: 'label:"Always Proceed"', to: 'label:"全自动执行 (Always Proceed)"' },
  { category: '选项标签', from: 'label:"Always Ask"', to: 'label:"总是询问确认 (Always Ask)"' },
  { category: '选项标签', from: 'label:"Request Review"', to: 'label:"请求人工审核 (Request Review)"' },
  { category: '选项标签', from: 'label:"Inherit Global"', to: 'label:"继承全局设置 (Inherit Global)"' },
  { category: '选项标签', from: 'label:"Ask Every Time"', to: 'label:"每次询问确认 (Ask Every Time)"' },
  { category: '选项标签', from: 'label:"Never Allow"', to: 'label:"严禁执行 (Never Allow)"' },
  { category: '选项标签', from: 'label:"Allow"', to: 'label:"允许 (Allow)"' },
  { category: '选项标签', from: 'label:"Deny"', to: 'label:"拒绝 (Deny)"' },
  { category: '选项标签', from: 'label:"Ask"', to: 'label:"询问 (Ask)"' },
  { category: '选项标签', from: 'label:"Enabled"', to: 'label:"已启用 (Enabled)"' },
  { category: '选项标签', from: 'label:"Disabled"', to: 'label:"已禁用 (Disabled)"' }
];

// 8. 设置分区区块标题
const sectionsDictionary = [
  { category: '分区标题', from: 'title:"Security"', to: 'title:"安全与沙盒防御 (Security)"' },
  { category: '分区标题', from: 'title:"Permissions"', to: 'title:"权限配置体系 (Permissions)"' },
  { category: '分区标题', from: 'title:"Terminal"', to: 'title:"终端与命令执行 (Terminal)"' },
  { category: '分区标题', from: 'title:"Browser"', to: 'title:"内置浏览器设置 (Browser)"' },
  { category: '分区标题', from: 'title:"Suggestions"', to: 'title:"代码建议与补全 (Suggestions)"' },
  { category: '分区标题', from: 'title:"Application"', to: 'title:"应用程序偏好 (Application)"' },
  { category: '分区标题', from: 'title:"Appearance"', to: 'title:"外观与主题 (Appearance)"' },
  { category: '分区标题', from: 'title:"Account"', to: 'title:"用户账户信息 (Account)"' },
  { category: '分区标题', from: 'title:"Customizations"', to: 'title:"自定义规则与扩展 (Customizations)"' },
  { category: '分区标题', from: 'title:"Developer"', to: 'title:"开发者调试选项 (Developer)"' }
];

// 9. 全局操作菜单与提示
const globalActionsDictionary = [
  { category: '全局操作', from: 'label:"Search Conversations"', to: 'label:"搜索历史对话"' },
  { category: '全局操作', from: 'label:"Copy conversation as markdown"', to: 'label:"复制对话为 Markdown"' },
  { category: '全局操作', from: 'label:"Rename this conversation"', to: 'label:"重命名此对话"' },
  { category: '全局操作', from: 'label:"Pin this conversation"', to: 'label:"固定此对话"' },
  { category: '全局操作', from: 'label:"Unpin this conversation"', to: 'label:"取消固定此对话"' },
  { category: '全局操作', from: 'label:"Delete this conversation"', to: 'label:"删除此对话"' }
];

// 10. workbench 外壳与底层命令
const workbenchShellDictionary = [
  // 底部状态栏与容器
  {
    category: '侧边栏视图',
    from: 'registerViews([{id:WDh,name:{value:"Agent",original:"Agent"}',
    to: 'registerViews([{id:WDh,name:{value:"智能体 (Agent)",original:"智能体 (Agent)"}'
  },
  // 工作流与规则创建命令
  { category: '核心命令', from: '"Create New Workflow"', to: '"新建工作流 (Workflow)"' },
  { category: '核心命令', from: '"Create New Global Workflow"', to: '"新建全局工作流 (Global Workflow)"' },
  { category: '核心命令', from: '"Create New Rule"', to: '"新建规则 (Rule)"' },
  { category: '核心说明', from: '"Create a new workflow file in the current workspace."', to: '"在当前工作区中创建一个新的工作流文件。"' },
  { category: '核心说明', from: '"Create a new global workflow file."', to: '"创建一个全局通用的工作流文件。"' },
  { category: '核心说明', from: '"Create a new rule file."', to: '"创建一个新的规则文件。"' }
];

// 合并核心代码字典
const coreCodeDictionary = [
  ...navDictionary,
  ...generalPageDictionary,
  ...chatInputDictionary,
  ...conversationContextMenuDictionary,
  ...settingsDictionary,
  ...optionsDictionary,
  ...sectionsDictionary,
  ...globalActionsDictionary,
  ...workbenchShellDictionary
];

// 11. agy 扩展命令映射字典 (用于 package.json 汉化)
const agyCommandsMap = {
  "Show Third Party Notices": "查看第三方许可声明",
  "Open Changelog": "打开更新日志",
  "Reset Conversation State": "重置对话状态",
  "Add Selection to Chat": "将选中文本添加到对话",
  "Add Terminal Selection or Output to Chat": "将终端内容添加到对话",
  "New Conversation": "新建对话",
  "Toggle Chat Focus": "切换对话焦点",
  "Focus Panel": "聚焦面板",
  "Accept Changes in All Files": "接受所有文件中的变更",
  "Reject Changes in All Files": "拒绝所有文件中的变更",
  "Accept Changes in Current File": "接受当前文件中的变更",
  "Reject Changes in Current File": "拒绝当前文件中的变更",
  "Accept Focused Change": "接受当前选中的变更块",
  "Reject Focused Change": "拒绝当前选中的变更块",
  "Toggle Inline Diff": "切换行内差异对比",
  "Open Settings": "打开 Antigravity 设置",
  "Sign In": "登录账户",
  "Sign Out": "退出登录",
  "Show Menu": "显示操作菜单",
  "Manage Data Sharing & Telemetry": "管理数据共享与遥测",
  "Provide Feedback": "问题与反馈",
  "Add Comment to Chat": "添加评论到对话",
  "Edit Comment": "编辑评论",
  "Delete Comment": "删除评论",
  "Generate Commit Message": "智能生成 Git 提交信息"
};

module.exports = {
  navScreenMap,
  coreCodeDictionary,
  agyCommandsMap
};
