# Antigravity IDE 深度全量汉化与防损坏补丁工具包

本工具包专为 **Google Antigravity IDE (基于 VS Code 内核 v1.107.0)** 深度定制开发，彻底解决版本更新后汉化失效、设置界面英文残留以及修改内核后引发的“安装似乎损坏”系统警告问题。

---

## 🌟 核心特性与架构亮点

1. **三大核心 JavaScript 文件全面覆盖**：
   - **`resources/app/out/main.js`**：Electron 实际主入口，负责渲染设置编辑器、主输入框、会话右键菜单（真正解决界面英文残留的根本）；
   - **`resources/app/out/vs/workbench/workbench.desktop.main.js`**：VS Code 工作区底层核心；
   - **`resources/app/out/jetskiAgent/main.js`**：独立智能体弹窗界面；
   - **`resources/app/extensions/agy/package.json`**：扩展命令与视图容器配置。
2. **展示层拦截机制（零副作用）**：
   - 采用 `a0e(e)`、`tct(t)`、`SY` 与 `PUe` 导航拦截，只将显示的 Label 翻译为中文，保留原始路由 key（`display: e === "General"`），杜绝右侧面板空白或失效。
3. **会话标题（Conversations）实时自动翻译与原生 RPC 持久化中文化**：
   - 深入拦截侧边栏真实运行载体 `hub_main_zh.js` 中的 `XB(a)` 命门函数及 4 处绕过渲染点，并在根组件 `vcc` 注入 Redux 实时订阅守卫；
   - 联动本地 `14588` 代理提供 `/translate-title` 多源翻译微服务（微软必应 → 彩云小译 → 腾讯 TranSmart → 本地离线兜底），新对话生成英文标题后 1~2 秒内自动调用官方原生 `updateConversationAnnotations` RPC 永久回写本地数据库；
   - 同步联动外层 `workbench.desktop.main.js`（`yhn`）与 `jetskiAgent/main.js`（`est`/`uEn`/`sMa`）；
   - 具备全链路实时追踪日志系统，默认输出至 `%USERPROFILE%\.antigravity-zh-cn\logs\`（支持 `AGY_ZH_LOG_DIR` 自定义目录）；
   - 详细排查历程见专题白皮书：[会话标题中文化与全链路故障排查白皮书](docs/CONVERSATION_TITLE_LOCALIZATION.md)。
4. **思维链（`Thought for`）实时流式翻译与 JSONL 分层缓存（v1.3.0 新增）**：
   - 静态汉化 `Thought for Xs` → `思考了 X 秒`、`Thinking for Xs` → `已思考 X 秒`、`Thought Process` → `思考过程`、`Thinking...` → `正在思考...`（同步覆盖 Hub 与 `jetskiAgent`）；
   - 前端 `iAc` 组件内置等长掩码安全断句器（规避文件名/版本号/缩写句点陷阱并保留 `\n\n\n` 段落结构），采用 **200ms 防抖批量锁定 + 超长未闭合半句临时预译不落盘 + 右上角「查看原文 / 查看译文」一键切换**；
   - 代理微服务 `thought_translator.js` 新增 `POST /translate-thought`、`GET /thought-cache-stats`、`POST /thought-cache-clear` 路由：启用 HTTP/HTTPS Keep-Alive 连接池，优先腾讯 TranSmart 原生批量通道（连续流式 ~200–300ms），动态零冲突锚点隔离行内代码/URL/路径并防 GFM 波浪号删除线误渲染；支持通过 `AGY_ZH_THOUGHT_LLM_URL` 接入本地 Ollama 或 OpenAI 兼容轻量 LLM；
   - 缓存采用纯本地 Append-Only JSONL（默认 `%LOCALAPPDATA%\antigravity-zh-cn\cache\thought_cache.jsonl`，支持 `AGY_ZH_CACHE_DIR` 覆盖，自动避开 OneDrive），具备 **500ms 写合并、读命中 0 刷盘、崩溃残行容错、30 天按访问续命 TTL / 15,000 条 / 6 MB 惰性原子压缩与质量权重分级覆盖**。
5. **SHA-256 校验和全量自愈同步（杜绝损坏警告）**：
   - 自动按照 VS Code 内核规范计算新文件的 Base64 校验和，同步写回 `product.json`，完美通过内核自检。
6. **V8 字节码与缓存自动清理**：
   - 每次打补丁时自动安全清理 `%APPDATA%\Antigravity IDE\CachedData` 下的历史字节码缓存，彻底防止 Electron 加载旧代码。
7. **全方位检验与审计日志**：
   - 内置自动化验证套件：`run-verify.bat`（`src/verifier.js`）、`verify_all_14_screens.js`（53 项设置页验收）、`verify_title_localization.js`（15 项标题自动化验收）与 `verify_thought_localization.js`（12 项思维链流式与 JSONL 缓存验收）。

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

1. **执行汉化补丁**：双击运行 `run-patch.bat`
2. **检验汉化生效状态**：双击运行 `run-verify.bat`
3. **如需还原官方纯净英文版**：双击运行 `run-restore.bat`
4. **（可选）配置随程自愈快捷方式**：右键以 PowerShell 运行 `setup_all_launch_hooks.ps1`（如需恢复原生快捷方式，运行 `restore_launcher.bat`）

### 方式二：使用 npm 命令行

```powershell
# 1. 执行全量汉化、校验和同步与代理/翻译微服务部署
npm run patch

# 2. 运行自动化生效检验（综合 / 14 屏幕 / 会话标题 / 思维链实时翻译）
npm run verify
npm run verify:screens
npm run verify:titles
npm run verify:thoughts

# 3. 一键还原官方状态
npm run restore
```

### 自定义会话标题字典（仅存本地，保护隐私）
- 本仓库不包含官方闭源静态资源（`hub_main.js` / `hub_main_zh.js`），执行 `npm run patch` 时会自动从你本机 Antigravity IDE 安装目录读取并编译。
- 如需为特定历史会话固定中文标题，可将 `src/title_dicts.example.json` 复制为 `src/title_dicts.json` 后按需编辑（该文件与 `src/title_cache.json` 均已加入 `.gitignore`，不会上传至远程仓库）。

---

## 📋 截图元素汉化检验对照表

| 界面区域 | 原始英文 (Before) | 汉化后效果 (After) | 检验状态 |
| :--- | :--- | :--- | :--- |
| **侧边栏标题** | `Settings` | `设置 (Settings)` | ✅ 通过 |
| **侧边栏导航** | `General` | `通用设置` | ✅ 通过 |
| **侧边栏导航** | `Appearance` | `外观偏好` | ✅ 通过 |
| **侧边栏导航** | `Notifications` | `系统通知` | ✅ 通过 |
| **侧边栏导航** | `Models` | `模型与额度` | ✅ 通过 |
| **侧边栏导航** | `Browser` | `内置浏览器` | ✅ 通过 |
| **侧边栏分组** | `Projects` | `项目分组 (Projects)` | ✅ 通过 |
| **侧边栏分组** | `Not in Project` | `未归属项目` | ✅ 通过 |
| **侧边栏项目** | `Conversations` | `对话历史` | ✅ 通过 |
| **侧边栏按钮** | `Show All` / `Show Less` | `显示全部` / `收起列表` | ✅ 通过 |
| **设置主面板** | `General` 标题与描述 | `通用设置 (General)` 及全中文详细说明 | ✅ 通过 |
| **设置主面板** | `Global Permissions` | `全局资源权限 (Global Permissions)` | ✅ 通过 |
| **设置主面板** | `Permission Preset` | `权限预设模板 (Permission Preset)` | ✅ 通过 |
| **设置主面板** | `Turbo` 下拉选项与卡片 | `极速自主模式 (Turbo)` 及全中文风险描述 | ✅ 通过 |
| **设置主面板** | `Controls the actions the agent can take.` | `控制智能体在当前环境下可执行操作的权限级别。` | ✅ 通过 |
| **设置主面板** | `Tool Permissions` | `工具与终端权限 (Tool Permissions)` | ✅ 通过 |
| **设置主面板** | `Network Access Rules` | `网络访问规则 (Network Access Rules)` | ✅ 通过 |
| **设置主面板** | `Open` 按钮 | `打开配置` | ✅ 通过 |
| **设置主面板** | `Execution` 分区 | `执行机制 (Execution)` | ✅ 通过 |
| **设置主面板** | `Queued Messages` | `追问排队递交 (Queued Messages)` | ✅ 通过 |
| **设置主面板** | `Send Immediately` / `Queue` | `立即递交 (Send Immediately)` / `空闲排队 (Queue)` | ✅ 通过 |
| **设置主面板** | `Keyboard shortcuts` | `键盘快捷键` | ✅ 通过 |
| **安全模式卡片**| `Agent security mode` | `智能体安全运行模式`（完全信任/沙盒/严格模式） | ✅ 通过 |
| **主对话输入框**| `Ask anything, @ to mention, / for actions` | `向智能体提问，输入 @ 引用上下文，输入 / 触发动作` | ✅ 通过 |
| **会话右键菜单**| `Rename` | `重命名` | ✅ 通过 |
| **会话右键菜单**| `Pin` / `Unpin` | `固定对话` / `取消固定` | ✅ 通过 |
| **会话右键菜单**| `Archive` | `归档对话` | ✅ 通过 |
| **会话右键菜单**| `Split` | `拆分视图` | ✅ 通过 |
| **会话右键菜单**| `Copy` | `复制` | ✅ 通过 |
| **会话右键菜单**| `Stop` | `停止生成` | ✅ 通过 |
| **全局操作菜单**| `Open Settings` | `打开设置` | ✅ 通过 |
| **思维链头部** | `Thought for Xs` / `Thinking for Xs` | `思考了 X 秒` / `已思考 X 秒` | ✅ 通过 |
| **思维链正文** | 云端英文思维摘要（含行内代码/路径） | 实时流式增量译文（支持「查看原文 / 查看译文」一键切换） | ✅ 通过 |

---

## 💡 如何在 IDE 中查看生效效果

> [!IMPORTANT]
> 由于 Antigravity IDE 开启了系统托盘后台驻留特性（Keep In Menu Bar），单纯点击窗口右上角的 `X` 不会退出主进程。请务必：
> 1. 在系统右下角托盘图标处右键退出 Antigravity IDE（或在窗口中按 `Ctrl+Shift+P` 执行 `Reload Window`）；
> 2. 重新启动 Antigravity IDE；
> 3. 此时 Electron 将载入已清空缓存的全新 `out/main.js`，呈现 100% 中文化界面！
