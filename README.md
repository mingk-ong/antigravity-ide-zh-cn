# Antigravity IDE（反重力）深度全量汉化与使用体验优化工具包

本工具包专为 **Google Antigravity IDE（基于 VS Code 内核）** 深度定制，提供 **「深度全量汉化」** 与 **「使用体验优化」** 两大核心能力，并内置跨版本安全自愈与防“安装似乎损坏”校验机制。

---

## 一、深度全量汉化能力

### 1. 全界面四阵地深度中文化（共享全量词库 + 防误杀 DOM 清洗引擎 v2）
- **Hub 前端核心（`hub_main_zh.js`）**：通过 `sT`/`uT`/`yT`/`xT`/`vT` 展示层抗混淆拦截 + 右侧边栏概览抽屉与新建标签搜索页首帧直译 + 共享运行时 DOM 清洗引擎 v2（内置 9 大功能域全量词库、24 类动态模板正则及 `placeholder`/`title`/`aria-label` 属性变更监听，覆盖服务端动态下发的 `已用技能 (Skills Used)` 分区），严格通过四重作用域黑/白名单隔离代码、编辑器、终端、Diff 源码与 AI 正文，绝不误杀用户内容。
- **独立 Agent Manager 窗口（`out/jetskiAgent/main.js`）**：联动注入会话标题枢纽、思考耗时标签与共享全界面 DOM 清洗引擎 v2，实现独立窗口同步全面中文化。
- **5 大官方内置扩展与引导页**：全量汉化 `agy`、`antigravity-code-executor`、`antigravity-dev-containers`、`antigravity-remote-openssh`、`antigravity-remote-wsl` 的扩展命令、视图、自定义编辑器及设置描述，同步汉化 `extension.js` 原生弹窗提示、`out/vs/workbench/workbench.desktop.main.js` 会话标题枢纽以及内置浏览器引导页（`browserLanding.html` / `browserOnboarding.html`）。
- **Markdown 表格菜单汉化**：同步汉化对话表格右上角操作菜单与提示（`表格选项`、`复制为 Markdown`、`展开全宽`、`适应窗口`、`已复制到剪贴板`、`可横向滚动表格`）。

### 2. 会话标题（Conversations）实时翻译与原生 RPC 持久化
- 深入拦截侧边栏真实运行载体 `hub_main_zh.js` 的 `XB(a)` 核心枢纽及 4 处绕过点，并在根组件 `vcc` 注入 Redux 实时订阅守卫；
- 联动本地固定端口 `14588` 透明代理提供 `/translate-title` 多源翻译微服务（微软必应 → 彩云小译 → 腾讯 TranSmart → 本地离线兜底），新对话生成英文标题后 1~2 秒内自动调用官方原生 `updateConversationAnnotations` RPC 永久回写本地数据库；
- 详细故障排查与原理解析见：[会话标题中文化与全链路故障排查白皮书](docs/CONVERSATION_TITLE_LOCALIZATION.md)。

### 3. 思维链（`Thought for`）实时流式翻译与 JSONL 分层缓存
- **头部文案汉化**：静态汉化 `Thought for Xs` → `思考了 X 秒`、`Thinking for Xs` → `已思考 X 秒`、`Thought Process` → `思考过程`、`Thinking...` → `正在思考...`（同步覆盖 Hub 与 `jetskiAgent`）。
- **安全断句与代码无损隔离**：前端 `iAc` 组件内置等长掩码安全断句器（规避文件名/版本号/缩写句点陷阱并保留 `\n\n\n` 段落结构）；后端 `thought_translator.js` 通过动态零冲突锚点隔离行内代码、URL 与文件路径，并自动防 GFM 波浪号删除线误渲染。
- **高速批量流式通道**：代理提供 `POST /translate-thought`、`GET /thought-cache-stats`、`POST /thought-cache-clear`，启用 HTTP/HTTPS Keep-Alive 连接池，优先腾讯 TranSmart 批量通道（连续流式 ~200–300ms），支持通过 `AGY_ZH_THOUGHT_LLM_URL` 接入本地 Ollama 或 OpenAI 兼容轻量 LLM。
- **纯本地 Append-Only JSONL 缓存**：默认存放在 `%LOCALAPPDATA%\antigravity-zh-cn\cache\thought_cache.jsonl`（支持 `AGY_ZH_CACHE_DIR` 覆盖，自动避开 OneDrive 文件锁），具备 500ms 写合并、读命中 0 刷盘、崩溃残行容错、30 天按访问续命 TTL / 15,000 条 / 6 MB 惰性原子压缩与质量权重分级覆盖。

---

## 二、使用体验与交互优化

### 1. 思维链点击与展开交互优化（`iAc` + `__agyThoughtEngine`）
针对官方思维链“刚想看就自动折叠、后续步骤推高滚动条打断阅读、中英文切换闪烁”等痛点进行深度体验重构：
- **点击展开防打断与悬停锁定**：点击展开或鼠标悬停在思考块任意区域（`data-agy-thought-wrap`）时，自动进入悬停锁定态；即便后续步骤到来引发组件卸载重挂载或页面自动滚动推高布局，依靠跨重挂载 UI 状态表（`getStepUiState`）与全局指针移动检测（`getLastPointer` 免疫 >220ms 假性 `mouseleave`），**绝不中途打断展开**；待鼠标真正主动移出思考块区域后延迟 **350ms** 平滑自动收起。
- **右上角「展开锁定」小锁按钮**：支持一键点击上锁（`thought-collapse-lock`，琥珀色高亮），上锁后停用鼠标离开自动折叠，可安心对照长思维链逐步排查；再次点击即可解锁恢复自动收起。
- **一键「查看原文 / 查看译文」切换**：右上角常驻语言切换按钮（`thought-lang-toggle`），点击即时切换中英文且阻止事件冒泡误触折叠，并在重挂载期间记住当前视图状态。
- **直出中文门控与防秒收起体验**：未就绪英文句绝不闪现上屏（首波展示柔和中文占位「正在同步中文思考过程…」），首波 0ms 零防抖发车 + 句末标点即时锁定；短思维链译完后额外保留 **1.5s** 自然阅读期再优雅收起（断网时 **3.5s** 硬超时兜底）。

### 2. Markdown 表格对话框自适应布局优化（`lkc` / `ckc` / `dkc` / `mkc` + `__agyTableEngine`）
针对官方表格“短列强锁 `20ch` 大片留白、多列触发 `dkc` 阈值放弃缩放、长内容列向右溢出对话框被裁切、右上角 `⋮` 按钮压住表头文字”等痛点全面重构：
- **智能权重列宽引擎（短列紧凑、长列宽敞）**：采用「单列保底 + 亚线性平滑权重 Water-Filling」算法按对话框实际可用宽度动态分配百分比列宽并启用 `table-layout: fixed`，消除短列多余空白，把主阅读宽度让给长说明列并自动安全折行；在宽屏独立窗口下打破官方 `320px` 硬编码上限，允许宽表居中舒展至可视边界；在窄侧边栏中精准贴合容器并关闭冗余 `translateX`，同时为表格右侧预留屏幕边缘呼吸留白（常规 `8px` / 极窄视口 `4px`），彻底消灭横向裁切、右侧贴边与亚像素发虚。
- **彻底解除长标识与文件胶囊撑爆**：移除单元格内文件胶囊 `.inline-pill-wrap` 的 `20ch` 最小宽死锁，同步为单元格内行内代码 `code` 开启 `overflow-wrap: anywhere` 安全折行，长文件路径与标识符不再撑破列宽。
- **流式生成与窗口拖动实时重排**：通过 `data-agy-measuring` 隔离标记保证 AI 逐行流式输出表格时列宽测量 100% 纯净无污染；`ResizeObserver` 同步追踪对话正文列、表格与视口变化，拖动侧边栏宽度即时丝滑响应。
- **超多列可读性底线保护与自由切换**：2–6 列常见表格默认 100% 贴合对话框零滚动；遇到 8–10+ 列超宽表或极窄窗口低于单列可读底线（内容 `< 52px`）时，温和回退至紧凑可控的横向滚动避免挤成竖排；随时可通过右上角 `⋮` 菜单一键切换 **「展开全宽 / 适应窗口」**，并为末列表头自动预留右侧内边距防止 `⋮` 按钮遮挡标题。

### 3. 工程稳定性与跨版本同步自愈优化
- **统一真相源架构**：`src/core_injector.js` 统一驱动手动部署（`patcher.js`）、启动自愈（`auto_updater.js`）、代理热捕获（`hub_proxy.js`）与综合审查（`verifier.js`），消除多端能力漂移。
- **结构化抗混淆定位 + 分层韧性注入**：全面摆脱对易变打包混淆名（如 `extension.js` 的 `Jv/Zw`、`workbench` 的 `yhn`、`jetskiAgent` 的 `est` 及 `hub_main.js` 的 `vT/uT/yT/xT/sT/XB`）的硬编码依赖，采用固定字面量 `indexOf` 窄窗口正则毫秒级动态捕获真实符号；并将注入拆分为 **核心必选层** 与 **独立增强模块层**（标题枢纽/RPC、思维链、Markdown 表格、外层工作台），单模块因大改版不兼容时自动安全降级跳过而不拖垮整体同步汉化，核心层不兼容则坚决熔断保原版启动。
- **4 维版本监测 + 代理 `/main.js` 真身热捕获**：完整追踪 `ideVersion`、`agyVersion`、`VS Code version` 与 `distro`；升级后首次打开 IDE 时，`hub_proxy.js` 自动向本地官方后端核验最新 `/main.js` 真身——若与现有源一致直接 0 开销启用汉化，若官方发布了新版前端则自动落盘并通过独立 Node.js 实时热重编（含落盘前 V8 语法预检），极端不兼容时无缝透传官方原版防白屏。
- **跨版本 `.bak` 防污染备份与校验和自愈**：检测到官方升级覆写原件时自动刷新纯净 `.bak`，同步重写 `product.json` 全量 SHA-256 校验和（杜绝“安装似乎损坏”警告），并安全清理 Electron V8 字节码缓存。
- **轻量日志生命周期管理**：运行日志默认输出至 `%USERPROFILE%\.antigravity-zh-cn\logs\`（支持 `AGY_ZH_LOG_DIR` 自定义），**严格仅保留最近 2 次完整运行记录**，避免长期堆积。

---

## 🚀 快速上手与命令使用

### 环境要求
- Windows 10 / 11 + 已安装 **Google Antigravity IDE**（默认探测 `%LOCALAPPDATA%\Programs\Antigravity IDE`，可通过环境变量 `ANTIGRAVITY_IDE_DIR` 自定义）
- **Node.js >= 18**（零外部 npm 依赖，克隆即用）

### 方式一：使用批处理脚本（推荐）

```powershell
git clone https://github.com/mingk-ong/antigravity-ide-zh-cn.git
cd antigravity-ide-zh-cn
```

1. **执行汉化与优化补丁**：双击运行 `run-patch.bat`
2. **检验全链路生效状态**：双击运行 `run-verify.bat`
3. **如需还原官方纯净英文版**：双击运行 `run-restore.bat`
4. **（可选）配置随程自愈快捷方式**：右键以 PowerShell 运行 `setup_all_launch_hooks.ps1`（如需恢复原生快捷方式，运行 `restore_launcher.bat`）

### 方式二：使用 npm 命令行

```powershell
# 1. 执行全量汉化、使用体验优化、校验和同步与代理/翻译微服务部署
npm run patch

# 2. 运行自动化生效检验（综合 / 全界面防误杀 / 14 屏幕 / 会话标题 / 思维链 / Markdown 表格）
npm run verify
npm run verify:ui
npm run verify:screens
npm run verify:titles
npm run verify:thoughts
npm run verify:tables

# 3. 一键还原官方状态
npm run restore
```

### 自定义会话标题字典（仅存本地，保护隐私）
- 本仓库不包含官方闭源静态资源（`hub_main.js` / `hub_main_zh.js`），执行 `npm run patch` 时会自动从本机 Antigravity IDE 安装目录同步并编译。
- 如需为特定历史会话固定中文标题，可将 `src/title_dicts.example.json` 复制为 `src/title_dicts.json` 后按需编辑（该文件与 `src/title_cache.json` 均已加入 `.gitignore`，不会上传至远程仓库）。

---

## 📋 汉化与优化检验对照表

| 类别 | 界面 / 能力区域 | 原始状态 (Before) | 汉化与优化后效果 (After) | 检验状态 |
| :--- | :--- | :--- | :--- | :--- |
| **汉化** | 侧边栏与设置主面板 | `Settings` / `General` / `Appearance` / `Models` 等 14 屏英文 | 全中文导航、标题、描述、权限卡片与选项下拉（保留原始路由 Key） | ✅ 通过 |
| **汉化** | 右侧边栏与 9 大功能区 | `Search tabs, files and more` / `Customize Sections` / `Skills Used` / `Modified Files` / `Side Question` / `See all` 等英文界面 | 全中文右侧概览抽屉、服务端动态分区、工具/终端/Diff/Swarm/浏览器/插件市场/自动化全覆盖（四重防误杀隔离正文与代码） | ✅ 通过 |
| **汉化** | 5 大内置扩展与引导页 | 命令面板、扩展设置描述、SSH/WSL/容器命令、原生弹窗与浏览器引导页纯英文 | 5 个官方内置扩展清单、10 处原生弹窗、`jetskiAgent` 独立窗口与浏览器引导页全量中文化 | ✅ 通过 |
| **汉化** | 会话历史标题 | 云端生成英文对话标题 | 1~2 秒自动中文化并通过原生 RPC 持久化写入本地数据库 | ✅ 通过 |
| **汉化** | 思维链头部与正文 | `Thought for Xs` + 英文思维摘要 | `思考了 X 秒` + 实时流式中文译文（代码/路径/波浪号无损隔离） | ✅ 通过 |
| **优化** | 思维链点击与悬停交互 | 思考完秒收起、后续步骤推高滚动打断阅读、无法锁定展开 | 悬停防打断锁定 + 右上角小锁常驻展开 + 一键原文/译文切换 + 离区 350ms 自动收起 | ✅ 通过 |
| **优化** | Markdown 表格自适应 | 短列锁死 `20ch` 大片留白、长列向右溢出裁切、`⋮` 遮挡表头 | 智能权重按对话框宽度贴合折行、解除胶囊 `20ch` 锁死、超多列底线保护、菜单汉化与防遮挡 | ✅ 通过 |
| **优化** | 更新自愈与防损坏校验 | 更新即失效、改包弹“安装似乎损坏”警告 | 23 项锚点探针自动自愈/安全熔断 + `product.json` 全量校验和对齐 + 日志仅留最近 2 次 | ✅ 通过 |

---

## 💡 如何在 IDE 中查看生效效果

> [!IMPORTANT]
> 由于 Antigravity IDE 开启了系统托盘后台驻留特性（Keep In Menu Bar），单纯点击窗口右上角的 `X` 不会退出主进程。请务必：
> 1. 在窗口中按 `Ctrl+Shift+P` 执行 **`Developer: Reload Window`**（或在系统右下角托盘图标处右键彻底退出 Antigravity IDE 后重新启动）；
> 2. Electron 将重新载入最新版 `hub_main_zh.js`，立即体验全中文界面、思维链交互优化与 Markdown 表格对话框自适应！
