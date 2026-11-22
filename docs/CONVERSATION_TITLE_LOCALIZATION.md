# Antigravity IDE 会话标题中文化与全链路故障排查技术白皮书

本文档详尽记录了在 **Antigravity IDE**（基于 VS Code 与 Google AI 深度定制的下一代智能编辑器）中，针对**搜索界面与侧边栏“会话标题（Conversations）全面中文化”**的完整技术攻坚、底层机理剖析、关键试错历程与最终架构解决方案。

---

## 1. 业务痛点与问题现象

在日常开发与交互中，Antigravity IDE 的会话管理主要存在以下三大痛点：

1. **历史会话大面积呈现英文**：
   积累的 90+ 条历史会话，大多数标题为自动生成的英文技术摘要（如 `Touch Gesture Plugin Analysis`、`Fix Git Push Permission Error` 等），检索非常费力。
2. **新建纯中文对话依然跳出英文标题**：
   即便用户在输入框中发送 100% 纯中文提示词（如 `将此软件的语言改为中文`），界面在响应首句后，标题依然实时跳出为纯英文摘要（`Change Software Language To Chinese`）。
3. **第三方修改极易触发系统报警**：
   只要尝试直接修改客户端打包后的静态 JavaScript 资源，IDE 启动时就会频繁弹窗报警：
   > `Antigravity IDE 安装似乎损坏。请重新安装`（Your installation appears to be corrupt. Please reinstall.）

---

## 2. 关键试错与技术演进历程

在彻底攻克该问题的过程中，经历了以下几个关键试错阶段，每一步都深化了对 Antigravity 底层机制的认知：

```
[阶段一: 离线SQLite修改] ──> [被agy.exe内存冲掉] ──> [阶段二: PB主数据双写] ──> [历史会话成功汉化]
                                                              │
[阶段三: 前端JS注入] ──────> [触发Integrity损坏警告] ──> [阶段四: 签名自愈重算] ──> [解除损坏报警]
                                                              │
[阶段五: 发现纯中文出英文] ──> [揭示云端微模型偏好] ──> [阶段六: 注入workbench未生效]
                                                              │
                                                        [阶段七: 深入hub_debug.log]
                                                              │
                                                        [定位代理Webview真实载体]
                                                              │
                                                  [突破 hub_main_zh.js 的 XB(a) 命门]
                                                              │
                                                    [全链路终极解决方案闭环]
```

---

### 阶段一：纯 SQLite 数据库层修改的失效
- **最初假设**：认为会话标题仅保存在本地 SQLite 数据库 `C:\Users\<user>\.gemini\antigravity\conversation_summaries.db` 中。
- **踩坑现象**：直接修改 SQLite 中的 `title` 与 `preview` 字段后，一旦启动或关闭 IDE，修改会被瞬间覆盖，标题依然变回英文。
- **根因发现**：Antigravity 拥有一个常驻后台的 Go 语言守护进程 `agy.exe --hub`。该守护进程在启动时将主数据 `agyhub_summaries_proto.pb` 加载入内存，SQLite 仅是其只读/查询投影。当守护进程退出或刷新时，会将内存中的旧数据直接序列化并强行覆盖回磁盘。

---

### 阶段二：攻克 Protobuf 序列化双写（历史会话汉化突破）
- **攻坚突破**：
  编写基于 Varint 与 WireType 的标准 Protobuf 递归解析引擎，对 `agyhub_summaries_proto.pb` 进行深度反序列化，定位到：
  - `entry.field_2` (summary_bytes)
  - `summary.field_1` (title_bytes)
  - `summary.field_15.field_1` (custom_title_bytes)
- **落地成效**：
  通过在守护进程退出后执行原子双写（主文件 `.pb` + 缓存 `.db`），成功将历史上全部 76 条英文会话一次性全量翻转为地道中文，用户验证完全通过。

---

### 阶段三：静态 JS 拦截与“安装损坏”告警危机
- **踩坑现象**：
  为解决“新建对话实时显示中文”的问题，尝试在前端 `workbench.desktop.main.js` 追加拦截代码，结果重启 IDE 时，右下角弹出了严重的系统级警报：
  `Antigravity IDE 安装似乎损坏。请重新安装`。
- **机理剖析**：
  Antigravity IDE 基于 VS Code 内核构建，其 `IntegrityService` 在每次启动和重新加载时，会自动遍历 `product.json` 中列出的关键系统 bundle：
  - `vs/workbench/workbench.desktop.main.js`
  - `vs/workbench/workbench.desktop.main.css`
  - `jetskiAgent/main.js` 等 11 个文件。
  系统会计算文件的 `SHA-256` 摘要并转为 Base64（去除末尾 `=`），如果与 `product.json` 中硬编码的 `checksums` 不一致，`isPure()` 即返回 `false`，触发损坏警报。
- **解决对策**：
  在修改任意前端代码后，立即重新计算该文件最新的 SHA-256 base64 哈希值，并**原子回写更新 `product.json` 的 `checksums` 字典**，自检断言达到 `ALL PASSED: True (11/11 全部校验通过)`，彻底根除损坏弹窗。

---

### 阶段四：Google 云端微模型生成逻辑剖析（为什么纯中文依然出英文）
- **现场实测**：
  用户新建会话输入：`将此软件的语言改为中文`（全中文，33 字节）。
  云端返回标题：`Change Software Language To Chinese`。
- **机理透视**：
  新建会话发送首句后，后台向 Google 云端发起 RPC：
  `/google.gca.aicode.v1main.JetskiRemoteAgentProxyService/GenerateConversationTitle`
  Google 部署在云端的 Jetski 微模型由于 Prompt 设计偏向和全球化训练数据分布，**默认将用户意图归纳为标准的英文大写短语（Title Case）**。
  除非包含强中文专有名词，否则涉及系统配置、开发命令的短句极易被模型直接翻译为英文意图摘要。
- **结论**：
  不能依赖云端模型的主动配合，必须在**客户端渲染消费层进行无感拦截**。

---

### 阶段五：真假渲染宿主辨析（终极突破）
- **最后迷局**：
  当我们为 `workbench.desktop.main.js`（`yhn`）和 `jetskiAgent/main.js`（`est`）注入拦截后，用户重新打开侧边栏，界面前两项依然顽固地显示为英文！
- **拨云见日**：
  通过查阅 `C:\Users\<user>\hub_debug.log`，抓取到了 Electron 真实的 Webview 挂载日志：
  ```text
  [renderWebviewHtml] type=main loc=sideBar new=http://127.0.0.1:14588/c/...
  [Proxy HTTP] method=GET url=/main.js
  [Proxy] SERVING ZH MAIN JS! Size: 12507344
  ```
- **核心真相**：
  用户本地运行着 `hub_proxy.js` 本地代理服务，将 Webview 请求的 `/main.js` 重定向到了：
  `resources/app/extensions/agy/hub_main_zh.js`！
  **用户肉眼看到的侧边栏真实代码载体，既不是 workbench 也不是 jetskiAgent，而是这个独立的 `hub_main_zh.js`！**
- **定位命门函数**：
  在 `hub_main_zh.js` 中，负责会话列表输出的真正命门函数是：
  ```javascript
  function XB(a) {
      var b = a?.annotations?.title?.trim();
      return a?.annotations?.coordinator ? b || "Coordinator" : b || a?.summary?.trim() || void 0
  }
  ```
  在列表生成器 `rEc` 中，直接调用了 `let n = XB(d) || "Untitled Conversation";`！
  由于此前该文件未对 `XB(a)` 进行任何汉化拦截，导致直接输出了云端下发的英文。

---

## 3. 终极架构设计与三层防御体系

我们在补丁体系中构建了**双端联动、动静结合、三层防御**的完整架构：

```
                      [进入 XB(a) / yhn(t) 标题枢纽]
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                  【首层防御: 中文直通】  【用户自定义优先】
                   包含汉字? ───是───> 直接原样返回
                         │ 否
                         ▼
                  【二层防御: 精准映射字典】
                   匹配已知会话ID? ───是───> 返回标准中文 (自定义映射表)
                   匹配高频英文短语? ──是───> 返回标准中文
                         │ 否
                         ▼
                  【三层防御: 自适应词根重组引擎】
                   动作词库 (Change->修改, Fix->修复, Develop->开发...)
                   技术名词 (Website->网站, Login->登录, Unlock->解锁...)
                   分词重组 ───> 输出通顺流畅的简体中文标题 (<=25字)
                         │
                         ▼
                  【全链路运行态日志追踪】
                   fetch('/log-title') ──> 追加写入 hub_debug.log
```

---

## 4. 迁移与工程整合说明

本次攻坚产出的所有成果已完整整合入 `antigravity-chinese-patch` 工程：

1. **`src/title_dicts.example.json`（本地可复制为 `src/title_dicts.json`）**：
   可选配置本地历史会话 ID 映射与常见英文标题短语映射（仅保留本地，不纳入版本控制）。
2. **`src/patcher.js`**：
   升级为全功能复合补丁引擎，执行 `npm run patch` 时自动完成：
   - 设置面板与快捷键汉化；
   - `hub_main_zh.js` 的 `XB(a)` 枢纽函数注入与搜索项拦截；
   - `workbench.desktop.main.js` 的 `yhn(t)` 枢纽函数注入；
   - `jetskiAgent/main.js` 的 `est(e)` 函数注入；
   - 全量 11 个系统文件 SHA-256 签名自愈同步（杜绝“安装损坏”报错）；
3. **`src/hub_proxy.template.js`**：
   增加了 `/log-title` 路由端点，支持前端 Webview 实时将标题判定日志写入 `C:\Users\<user>\hub_debug.log`；
4. **`tools/update_conversation_titles.py`**：
   提供底层的离线全量 Protobuf 与 SQLite 双写修复工具，可作为深层数据重构的离线辅助；
5. **`src/restore.js`**：
   升级支持对所有打补丁组件与哈希表的一键无损还原。
