# 开发日志

## [2026-09-25 18:20:15] fix(link): 回退"右侧已显示即跳过"守卫——它让右键联动变成"什么都不发生"

- **现象**：上一版上线后，右键播放画面无任何反应（不再切到智能笔记）；点击暂停不联动（符合预期）
- **根因**：上一版在 `openNoteForMediaFile()` 里加了 `isNoteShownInRightSidebar()` 提前 return（"右侧已显示该笔记就不重复切换"），而真实使用场景恰恰是"笔记已经在右侧栏开着"：
  - 实机证据（`.obsidian/workspace.json` 18:15 快照）：主区 ACTIVE = `Z_27数学/15.第13讲_多元函数与微分学/06.第13讲二、多元函数微分法则06.mp4`；右侧栏 markdown 标签 = 同目录智能笔记 `📝06.第13讲二、多元函数微分法则06.md` → 右键命中守卫直接 return
  - 该守卫只判断笔记"开着"、不判断它是否为当前选中标签（右侧栏同组还挂着 outline / yolo-chat / 番茄钟等 5 个标签），语义本身也不完整
- **旧逻辑为什么本来是对的**：`openNoteInRightSidebar` 精确匹配分支为 `setActiveLeaf(targetLeaf, {focus:true})`，而 Obsidian `setActiveLeaf` 内部对标签组执行 `selectTabIndex()`（app.js 证据）——已打开的笔记会被**激活并选中标签页**，并不会重复打开文件
- **修改**：删除 `isNoteShownInRightSidebar()` 及提前 return，恢复"已打开 → 激活/聚焦（选中标签）"；openFile 触发层（patch）、右键、启动兜底均不变；代码注释与 README 标注"不要加这个提前 return"
- **验证**：`npm run build`（tsc 零错误，`main.js 294.4kb`）；`node scripts/test_media_linkage_smoke.cjs` **23/23 通过**（用例 4/11 改为验证"不重复打开文件 + `setActiveLeaf(focus:true)` 激活已有笔记"）

## [2026-09-25 17:45:57] fix(link): 修复"点击播放画面暂停仍会切换右侧内容"——触发层改为包装 openFile

- **现象**：09-22 改造（file-open + 右键）上线后，点视频暂停/播放时右侧边栏仍会被切走（且焦点被抢回右侧），与"点击完全不触发"的目标不符
- **根因（一手证据）**：Obsidian `app.js` 里 `file-open` 的真正发射点是 `activeLeafEvents()`——
  `var t=this.lastActiveFile, n=this.getActiveFile(); t!==n && (this.recentFileTracker.onFileOpen(n,t), this.lastActiveFile=n, this.trigger("file-open", n))`
  即 **`file-open` 的真实语义是"活动文件变化"**：点播放画面会把活动文件从侧栏笔记切回视频，于是又触发联动。上一轮离线冒烟用 stub 模拟"打开"，没覆盖这条路径
- **修改**（仍只动触发层，`openNoteInRightSidebar` 逻辑零改动）：
  - 移除 `workspace.on('file-open')` 订阅，改为包装 `WorkspaceLeaf.prototype.openFile`（`patchLeafOpenFile()`）：这是"打开文件"的唯一入口（资源管理器点开 / 链接跳转 / 拖拽 / 新窗口 / 其它插件调用；内部就是 `setViewState({type,state:{file}})`）；点击窗格 / 标签页只走 `setActiveLeaf`，不经过它
  - 包装可叠加在其它插件（media-extended 也包装了 openFile）之上；卸载时仅当自己仍在外层才还原，不覆盖他人包装；打开失败（reject / 视图未换成目标文件）不联动
  - 启动恢复兜底：恢复工作区走 `leaf.setViewState` 不经 openFile，新增 `onLayoutReady` 时若当前激活文件是媒体文件则补一次联动（`handleInitialMediaOpen()`）
  - 防重复：新增 `isNoteShownInRightSidebar()`——右侧边栏已显示该笔记时直接返回，不再切换（避免无谓抢焦点）
  - 播放画面右键触发（contextmenu capture）保持不变
- **验证**：`npm run build`（tsc -noEmit 零错误 + esbuild 产物 `main.js 294.9kb`）；新增离线冒烟 `scripts/test_media_linkage_smoke.cjs`，`node scripts/test_media_linkage_smoke.cjs` **23/23 通过**——不再订阅 file-open / openFile 已包装 / 点击暂停不联动 / 打开视频联动 / 打开过程不抢焦点 / 右侧同笔记不重复切换 / 无笔记、md、侧边栏内打开均不联动 / reject 不外抛 / 启动兜底（视频→联动、笔记→不联动）/ 右键联动与防重复 / 卸载还原（在外层还原、不在外层不覆盖他人）
- **待实机确认**：需在 Obsidian「设置 → 第三方插件」对本插件禁用再启用（main.js 不热重载）；确认点暂停不再切换、右键仍联动、打开视频仍联动

## [2026-09-22 11:06:54] change(link): 主从视图联动触发方式由"激活窗格变化"改为「打开视频 / 播放画面右击」

- **需求**：点视频只是想暂停时，右侧边栏也会被切成智能笔记（且 `openNoteInRightSidebar` 会 `setActiveLeaf(focus:true)` 把焦点抢回右侧），导致"点一下暂停就来回切换"。要求把"点击"触发改为"右击"
- **逻辑澄清**：原实现并未绑定任何 click 监听，而是监听 `workspace.on('active-leaf-change')`（[`main.ts`](main.ts:423) 旧代码）——凡是"激活窗格发生变化"都会触发（含点击播放画面暂停、点标签页、点文件列表打开视频）；全项目（含编译产物 main.js）无 click/contextmenu 监听
- **修改**（仅动触发层，`openNoteInRightSidebar` 及其单例复用/转写保护逻辑零改动）：
  - 移除 `active-leaf-change` 订阅，改为 `file-open`（[`main.ts`](main.ts:424)）：只有文件被真正打开（文件列表点开 / 链接跳转 / 启动恢复工作区）才联动；点击播放画面暂停不再触发
  - 新增播放画面**右击**联动：`registerDomEvent(document, 'contextmenu', …, { capture: true })`，capture 阶段（播放器自身若 stopPropagation 仍能收到），**不 preventDefault**（Obsidian 原生右键菜单照常）；另在 `window-open` 时给弹出窗口的 document 注册同样监听
  - 命中判定：`target.closest('.view-content')`（= 播放画面本身，排除标签页 / 窗格头部 ⋯ 菜单区域）→ `View.containerEl.contains()` 反查所属 `WorkspaceLeaf` → 排除左右侧边栏 → 取 `view.file` 校验媒体扩展名
  - 侧边栏保护：`isFileOpenOnlyInSidebars()`——只在侧边栏里打开（如"在右侧边栏打开"）不联动；同一文件同时也开在主区时仍联动；布局中找不到该文件时放行（避免 file-open 时序漏触发）
- **实机环境核对**：视频由 Media Extended 打开（视图类型 `mx-file`，见 workspace.json）；其 `main.js` 中 `this.contentEl.addClasses(["mx","custom","mx-media-view","mx-file-media-view"])`、`styles.css` 中 `.mx-media-view.view-content` —— 即播放器根元素自带 `view-content` 类，且播放器在 shadow root 内（contextmenu 为 composed 事件，会冒泡/重定向到宿主，仍落在 `.view-content` 内）
- **验证**：`npx tsc -noEmit` 零错误；`npm run build` 成功（`main.js 292.2kb`）；离线冒烟（stub obsidian/electron 直接加载构建产物 `main.js`）19/19 通过——注册项（有 file-open/window-open + capture contextmenu、无 active-leaf-change）、真·打开视频→切换、打开笔记/无笔记视频/null→不切换、主区+侧边栏同开→仍切换、只开侧边栏→不切换、画面上右击→切换、播放器容器右击→切换、笔记内嵌视频右击→不切换、窗格头部右击→不切换、侧边栏视频右击→不切换、非元素目标→不报错

## [2026-09-22 00:20:00] fix(mindmap): 修复时间戳塌陷成 00:00 导致链接失效 + 思维导图请求缺 max_tokens 截断

- **现象**：8 篇新笔记的 BATCH_0 全部章节时间戳变成 `00:00`（覆盖了原有正确内容）；对应 rich 导图中该批链接**全部指向同一标题**（用户反馈"链接无法指向对应位置"）；另有多张导图末尾章节缺失
- **根因链**：
  1. 全局校验（阶段2）模型偶发输出"整课粗排重复版"（22~37 条覆盖全课、时间戳全部丢失/不可解析）
  2. [`src/utils.ts`](src/utils.ts:1) `parseTime` 解析失败返回 0，`formatTime(NaN)` 命中 `if (!s && s !== 0)` 静默兜底 `"00:00"` → 污染数据被"合法化"
  3. [`main.ts`](main.ts:1) 全局校验分发逻辑 `(i === 0 && topicSec < jobEndTime)` 把全部 00:00 条目倾倒进 BATCH_0，覆盖正确内容
  4. 导图链接生成 `chapters.find(c => c.timestamp === ts)` 在同时间戳多章节时只取第一个 → 22 个链接全指同一标题（结构梳理型课程同时间戳多章节是合法场景）
  5. 思维导图 LLM 请求**缺少 `max_tokens`**（批次/全局校验都有 65536）：长导图大纲可能被网关默认上限截断（"最近导图末尾截断"的最可能来源）
- **代码修复**：
  - `parseTime`：容错解析（容忍方括号/全角冒号/空白，MM 可超 59），失败返回 `NaN`，绝不静默返回 0
  - `runGlobalCorrectionAnalysis`：输出清洗（非法时间戳条目丢弃）+ **塌陷检测**（同一时间戳重复 ≥5 次且远超初步结果 → 判定失真，放弃本次全局结果、保留初步笔记）
  - 批次时间戳接受：补有限性 + 上界校验（旧代码只有下界）
  - `postProcessMindmapMarkdown`：`[MM:SS]` 链接替换改为"同时间戳多章节按标题相似度优选"，正则支持 3 位分钟
  - `requestMindmapLLMText`：补 `max_tokens: 65536` + `finish_reason=length` 截断告警（Notice）
- **数据修复**（详见 .backup-timestamp-fix-20260921 备份说明）：
  - 8 篇 B0 重跑重生成（ASR+LLM 定点补齐，修复后区块外内容逐字一致）
  - 信号01 B4/B7、概率03 B4 等失败块定点补齐
  - 6 张污染导图**只修 heading 链接**（保留节点/结构/手动编辑，除 heading 外零改动，全部可解析；遵守"不整体重生成"要求）
- **验证**：`npx tsc --noEmit` 零错误；`npm run build` 成功；离线仿真（parseTime 10 项 / 标题匹配 / 导图合并）；6 张导图链接可解析率 100%

## [2026-09-18 11:22:26] feat(mindmap): 新增「局部思维导图」命令 —— 选分块生成分支并追加到已有导图

- **需求**：运行命令 → 选中智能笔记的特定分块（%%BATCH_N%% 划分）→ LLM 生成局部导图 → 追加到所选导图文件（挂到根节点下、排在现有二级分支最后）
- **新增命令**：🧩 局部思维导图（追加到已有导图）（id `partial-mindmap-append`），需先打开智能笔记（含 %%BATCH_N%% 分块标记）
- **新增模块 [`src/partial-mindmap.ts`](src/partial-mindmap.ts:1)**：
  - `parseNoteChunks`：解析 %%BATCH_N_START/END%% 分块（编号 / 首尾时间戳 / 首标题 / 章节数）
  - `PartialMindmapModal`：多选弹窗——分块勾选（全选/清空）；目标导图确认（自动匹配同名 🧠-rich.md → 🧠.md；支持同目录候选下拉更换 + 全库模糊搜索兜底；匹配不到时强制手动选择）
  - rich 合并 `appendBranchesToRichMindmap`：直接编辑文件内 JSON 数据块（`mindData[0]`），新节点挂根节点、与"最后一个二级分支"同侧、排在其子树最低点之下；坐标布局（叶子间距 34px、层级步进 170px、父节点居中于首尾子节点）；配色沿用现有二级分支色循环；id 用 MarkMind 同款 8-4-4 十六进制生成器
  - basic 合并 `appendBranchesToBasicMindmap`：在最后一个 ## 分支之后（下一个一级标题之前）插入 Markdown
- **LLM 侧（[`src/llm.ts`](src/llm.ts:1)）**：抽取共享辅助 `requestMindmapLLMText` / `postProcessMindmapMarkdown`（父节点加粗 + `### [MM:SS]` 链接替换，逻辑逐字迁移，全量生成行为不变）；新增 `generatePartialMindmapContent`，prompt 携带"现有导图骨架"供 LLM 参考命名风格与分类粒度，按内容自适应输出 1~3 条 `##` 分支
- **安全性**：写入前关闭目标文件已打开的 mindmapview（反编译 MarkMind 3.5.7 确认：不监听外部文件修改、关闭视图不写盘），避免陈旧内存数据覆盖写入结果；写入走 `safeWriteWithRetry` 重试
- **验证**：离线仿真 9 项全过——真实笔记 9 分块解析、章节/大纲解析、真实 rich 文件合并（节点数/根节点/pid 完整性/位置/配色/二次追加 id 唯一）、basic 插入位置、目标自动匹配、链接 HTML 与 `$` 符号 JSON 往返逐字保留；另在 4 个不同结构的真实导图上复检几何布局
- **编译**：`npx tsc --noEmit` 零错误，`npm run build` 成功（`main.js 257.5kb`）

## [2026-08-14 18:30:00] task(asr): ASR 上传从 curl 改为 Node.js 原生 https 直传，大幅提升上传速度

- **问题**：之前 ASR 上传使用 `spawn('curl', ...)` 调用系统 curl，上传速度慢且无进度反馈（仅显示"上传中 (via curl)..."文案）
- **历史背景**：最初使用 Obsidian `XMLHttpRequest + FormData` 上传，但 SiliconFlow ASR 拒绝浏览器 multipart 请求（HTTP 500），遂改为 curl（[2026-06-26] 记录）
- **根因分析**：curl 方式慢的原因有三：
  1. 需先将内存 Buffer 同步写入临时文件（磁盘 I/O），curl 再从文件读取（二次磁盘 I/O），上传完成后还需删除临时文件
  2. curl 单线程顺序读取+发送，无 HTTP/2 多路复用，无上传缓冲优化
  3. curl `-s` 静默模式下无进度反馈，用户体验差
- **解决方案**：在 [`src/asr.ts`](src/asr.ts:1) 中使用 Node.js 原生 `https`/`http` 模块直接构建 multipart/form-data 请求体并发送
  - 新增 `generateBoundary()` 生成 multipart boundary
  - 新增 `buildMultipartBody()` 从内存 Buffer 直接构建 multipart body（Buffer.concat 拼接，零磁盘 I/O）
  - 复用 `http-direct.ts` 的 `withClearedProxyEnv()` 代理绕过逻辑和纯 Agent 直连策略
  - 支持 gzip/deflate/brotli 响应解压
  - 分块写入（64KB/write）+ 'drain' 事件背压处理，实时显示上传进度百分比（每 5% 更新）
  - 30 分钟超时保护（与 LLM 保持一致）
- **关键优势**：
  - 不经过 XMLHttpRequest/Electron net stack → 避免 SiliconFlow HTTP 500
  - 不经过系统代理 → 避免 V2rayN 等代理中断
  - 不写临时文件 → 省掉 3 次磁盘 I/O
  - 实时进度反馈 → 用户可见百分比和文件大小
  - keepAlive 连接复用 → 多分片上传时避免重复 TCP 握手
- **函数签名不变**：`uploadToASR(buffer, filename, notice, prefix, apiKey)` 签名完全兼容，`main.ts` 无需改动
- **编译**：`npx tsc --noEmit` 零错误，`npm run build` 成功（`main.js 646.5kb`）
- **风险提示**：依赖 Node.js 内置 `https`/`http`/`zlib` 模块（Obsidian Electron 环境自带）；如 SiliconFlow ASR 后续对 multipart 编码有特殊校验，可能需要调整 boundary 格式

## [2026-07-01 13:06:19] task(mindmap): 修复思维导图自动转换 MarkMind rich 模式失败问题

- **问题**：basic md 正常生成后，"自动转换为 MarkMind rich 模式"步骤始终失败，控制台报 `[自动转换] Rich 文件未在预期时间内生成`，rich 文件从未出现，用户需手动 Ctrl+P 执行转换
- **根因（反编译 MarkMind 3.5.2 确认）**：
  - 命令 `obsidian-markmind:Change basic mode to rich mode` 的回调 `getActiveViewOfType(mindmapview) && basicToRich()` —— 必须当前活动 leaf 是 mindmapview 才生效
  - MarkMind 通过 monkey-patch `setViewState` 检测 `mindmap-plugin` frontmatter 自动切 view，但该钩子依赖 `metadataCache` 已解析出 frontmatter
  - 原代码在 `safeCreateWithRetry` 创建 basic md 后仅等 500ms 就 `leaf.openFile()`，此时 `metadataCache` 通常尚未完成新文件的 frontmatter 解析 → monkey-patch 条件不满足 → leaf 停留在 markdown view → 命令回调返回 null → **静默 no-op**
  - `workspace.getLeaf(false)` + 未调用 `setActiveLeaf` → 即使切为 mindmapview 也未必是 focused leaf
  - 30 秒轮询无中间日志，用户完全不知卡在哪一步
- **修复（[`main.ts:1717-1823`](main.ts:1717) 的 `autoConvertToRich` 重写，6 项改进）**：
  - 打开文件前轮询等待 `metadataCache.getFileCache(basicFile)?.frontmatter?.["mindmap-plugin"]` 有值（最多 3s，每 100ms）
  - `getLeaf(true)` 新开 tab + `setActiveLeaf(leaf, { focus: true })` 显式激活
  - 打开后检测 `leaf.view.getViewType()`，若非 `mindmapview` 则兜底 `setViewState({type:'mindmapview', ...})` 强切
  - 执行命令前检查 `commands.commands[commandId]` 是否存在，不存在则 Notice 提示"MarkMind 插件未启用或命令 ID 已变更"
  - 30 秒轮询每 6 次（3 秒）打印一次进度日志
  - 超时不再静默 warn，弹 8 秒 Notice "自动转换失败，请手动 Ctrl+P → Change basic mode to rich mode"
- **保留不变**：删除旧 rich 文件逻辑、找到 rich 后删除 basic 文件、成功 Notice
- **编译**：`npm run build` 通过，`main.js 151.8kb`，无 TS 错误
- **回归风险**：`getLeaf(true)` 多开一个 tab（成功时 basic 被删后 tab 自动关闭，失败时保留作为手动入口）；frontmatter 等待最多引入 0-3s 延迟（正常 <200ms）；Notice 弹窗替代静默失败，用户可见性明显改善

## [2026-07-01 12:48:00] task(mindmap): reasoning_effort 从 'max' 改为 'xhigh' 以适配阿里 Qwen 网关参数校验

- 借助前次 commit 新增的 raw response 日志，发现阿里网关直接返回 `'reasoning_effort' must be one of: ..., 'xhigh'`
- `max` 是 DeepSeek 专有扩展，阿里 Qwen 不识别
- 修改 [`src/config.ts`](src/config.ts:1) 中 `LLM_PROVIDERS[0].EXTRA_BODY.reasoning_effort` 为 `'xhigh'`

## [2026-07-01 12:50:31] task(mindmap): 三通道 LLM 独立配置 —— 修复思维导图/全局校验错用章节分析模型

- **真正根因**：[`generateMindmapContent`](src/llm.ts:1) 与 [`getGlobalCorrectionSummary`](src/llm.ts:1) 硬编码读 `LLM_PROVIDERS[0]`，UI 里的"全局分析模型"设置项从未被代码读取
- **修复**：新增 `mindmapLlmApiKey / mindmapLlmBaseUrl / mindmapLlmModel` 设置项及 `LLM_MINDMAP_CONFIG` 配置对象；真正激活 `LLM_GLOBAL_CONFIG`
- **回退链**：思维导图自身设置 → `LLM_GLOBAL_CONFIG` → `LLM_PROVIDERS[0]`
- **修改文件**：[`src/settings.ts`](src/settings.ts:1)、[`src/settings-tab.ts`](src/settings-tab.ts:1)、[`src/config.ts`](src/config.ts:1)、[`src/llm.ts`](src/llm.ts:1)、[`docs/WORKSPACE_STRUCTURE.md`](docs/WORKSPACE_STRUCTURE.md:1)
- **编译**：`npm run build` 通过，`main.js 149.1kb`，无 TS 错误

## [2026-07-01 12:30:35] task(mindmap): 修复基于当前笔记重生成思维导图时"AI 返回空数据"错误

- **问题**：用户使用"基于当前笔记重新生成思维导图"功能时报错 `思维导图 AI 返回空数据，生成失败`
- **根因**：[`src/llm.ts`](src/llm.ts:1) 中 `generateMindmapContent()` 只读取 `choices[0].message.content`，但 OpenCode DeepSeek V4 Pro 在 `reasoning_effort=max` + `thinking.enabled` 双开时，最终内容会被放到 `message.reasoning_content` 字段（`content` 为空）。旧代码直接判空抛错，且无 raw response 日志
- **修复**：在 [`src/llm.ts`](src/llm.ts:648) 的 `generateMindmapContent()` 函数中：
  - 请求返回后先打印 raw response（截断 2000 字符）方便诊断
  - 依次尝试 `content` → `reasoning_content` → `reasoning` 三字段，优先使用非空的第一个
  - 打印 `usedField` 明确指示走了哪个字段
  - 仅在三者均为空时才抛错（错误信息更明确）
  - 回退字段的内容照样走原有 `<think>` 清除与 ` ```markdown ` 包裹去除清洗
- **影响面**：仅本函数内部改动，未触及 `requestOpenCodeV4WithRetry` / `getBatchSummary` / `getGlobalCorrectionSummary` 等共享调用点，其他 LLM 功能不受影响
- **验证**：`npm run build` 通过，产物 `main.js 146.1kb`，无 TS 错误

## [2026-06-27 23:46:18] task(settings-panel): 为插件添加 Obsidian 设置界面

- 新建 [`src/settings.ts`](src/settings.ts:1)：定义 `SiliconTranscriberSettings` 接口（17 个配置项）、默认值、API Key 掩码函数
- 新建 [`src/settings-tab.ts`](src/settings-tab.ts:1)：实现 `SiliconTranscriberSettingTab` 设置界面，含 6 个分组（ASR/LLM/报告/全局/处理参数/数据迁移）
- 修改 [`src/config.ts`](src/config.ts:1)：新增 `updateConfigsFromSettings()` 函数支持从 settings 应用运行时配置
- 修改 [`main.ts`](main.ts:1)：添加 `loadSettings()`/`saveSettings()` 方法，`loadSecrets()` 改为自动迁移函数，`onload()` 重构支持设置加载→迁移→配置应用→注册设置界面
- 修改 [`src/index.ts`](src/index.ts:1)：导出新模块
- 功能：API Key 密码掩码输入、小眼睛可见性切换、secrets.json 自动迁移、配置热更新

## [2026-06-26 23:06:10] task(http-direct): 取消 reasoning_effort 降级，超时不重试只报错
- **策略调整**：用户决定不接受质量降级，让 max 模式跑到底；超时（=AI 还在算）不视为失败，超时仍未完成则直接报错让用户决定
- **关键改动**：
  - 移除 `body.reasoning_effort = 'medium'` 第 2 次重试降级逻辑
  - 可重试错误集合移除超时类（ERR_TIMED_OUT/ETIMEDOUT/请求超时/Request timeout/socket hang up），仅保留真网络断连错误
  - `requestDirect` 与 `requestOpenCodeV4WithRetry` 默认 timeoutMs 升至 1_800_000 (30 分钟)
  - 错误日志按"网络错误重试失败"vs"其他错误"区分
- **不变项**：网络错误最多 2 次重试；重试退避 2s/5s；JSON 清洗 / 全链路直连 / ASR --noproxy 全部保留
- **修改文件**：[`src/llm.ts`](src/llm.ts:1)、[`src/http-direct.ts`](src/http-direct.ts:1)

## [2026-06-26 22:53:45] task(http-direct): 分级超时与超时智能降级优化
- **背景**：用户实测大文本全局校验真实需要超过 5 分钟（反常积分课首次 300s 超时，medium 重试 5 秒内成功）
- **核心策略**：分级超时（大请求 10 分钟，小请求 5 分钟）+ 超时也触发智能降级（max→medium）
- **关键改动**：
  - requestOpenCodeV4WithRetry 增加 timeoutMs 参数，透传到 requestDirect
  - 全局校验 / 思维导图 timeout 升到 600s；批次分析 / 报告 / 改写保持 300s
  - 可重试错误集合新增"请求超时"/"Request timeout"/"socket hang up"
  - 日志区分网络异常（🔁）和超时（⏱️）
- **不变项**：重试次数 2 次（共 3 次尝试）、第 2 次降级 reasoning_effort=max→medium 的现有逻辑保持
- **修改文件**：[`src/llm.ts`](src/llm.ts:1)（单文件改动）

## [2026-06-26 21:45:27] task(http-direct): 全链路绕过系统代理（V2rayN）实现 HTTP 直连
- **背景**：用户使用 V2rayN 系统代理-全局模式，代理不稳定，频繁出现 ERR_CONNECTION_CLOSED/RESET 导致 LLM/ASR 请求失败
- **解决方案**：所有对外网络请求绕过系统代理，直连国内 API 服务器
- **关键改动**：
  - 新增 [`src/http-direct.ts`](src/http-direct.ts:1) —— 基于 Node.js `https`/`http` + 显式空 Agent + 暂存清空 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` 环境变量；支持 gzip/deflate/brotli 解压、5 次 redirect、5 分钟 timeout；API 与 Obsidian `requestUrl` 兼容
  - 修改 [`src/llm.ts`](src/llm.ts:1) —— 4 处 `requestUrl` 调用 + 1 处 import 全部替换为 `requestDirect`（涉及 OpenCode、商汤、京东云所有 LLM API）
  - 修改 [`src/asr.ts`](src/asr.ts:69) —— ASR `spawn('curl', ...)` args 追加 `--noproxy '*'`，令 curl 也绕过系统代理
  - 修改 [`scripts/test-asr-curl.js`](scripts/test-asr-curl.js:49) —— 同步添加 `--noproxy '*'` 保持一致
  - 修改 [`main.ts`](main.ts:166) —— `onload()` 增加直连启动日志
- **自测结果**：`node src/http-direct.js https://httpbin.org/ip` 返回 `112.2.94.131`（中国联通 IP），确认绕过 V2rayN 成功
- **未覆盖范围说明**：TUN 模式（虚拟网卡）等系统级流量劫持本方案无效；当前方案仅适配 V2rayN 系统代理模式

## [2026-06-26 20:55:18] task(llm-resilience): 修复 OpenCode V4 网络中断与畸形 JSON 解析问题
- **问题根因**：
  - ① OpenCode V4 (DeepSeek V4 Pro) `reasoning_effort=max` 下耗时过长，触发上游 TCP 超时，出现 `ERR_CONNECTION_RESET`/`ERR_CONNECTION_CLOSED`，导致两次任务的"全局校验"环节都返回空数据
  - ② max 推理模式下 LLM 偶发输出畸形 JSON（中文全角引号「」、裸键名 `summary:`），原解析链全部失败
  - ③ MarkMind 第三方插件生成 rich 文件耗时偶尔超过 10s
- **修复策略**：
  - ① 网络层：[`src/llm.ts`](src/llm.ts:1) 新增 `requestOpenCodeV4WithRetry()` (159-218)，自动重试 2 次（间隔 2s/5s），第 2 次重试自动降级 `reasoning_effort=max→medium`
  - ② 解析层：[`src/llm.ts`](src/llm.ts:1) 新增 `sanitizeJsonString()` (136-157) 预处理，全角引号→半角、裸键名自动补引号，作为策略 0 前置；改造 `getBatchSummaryInternal` (289-406) 和 `getGlobalCorrectionSummary` (462-552) 使用带重试的请求并接入 sanitize 解析策略
  - ③ 时序层：[`main.ts`](main.ts:1) `autoConvertToRich` (1696-1705) 中 MarkMind 转换轮询超时从 10s 延长到 30s
- **修改文件**：[`src/llm.ts`](src/llm.ts:1) · [`main.ts`](main.ts:1) · `main.js` · `src/llm.js`（esbuild 自动生成）

## [2026-06-26 13:56:45] task(asr): 修复 SiliconFlow ASR multipart 请求 HTTP 500（改用系统 curl）
- **问题根因**：SiliconFlow ASR 对 `XMLHttpRequest + FormData` 的 multipart 编码返回 HTTP 500，与 Python `requests.post()` 同源问题，系统 `curl` 正常
- **解决方案**：在 [`src/asr.ts`](src/asr.ts) 中改用 Node.js `child_process.spawn('curl', ...)` 调用系统 curl
- **关键实现**：`spawn` 数组形式（防注入）、临时文件 + `-F file=@path`、`-s` 静默、`-w "\n%{http_code}"` 分离 HTTP 状态码、always cleanup 临时文件、函数签名不变
- **测试**：新增 [`scripts/test-asr-curl.js`](scripts/test-asr-curl.js) 干跑测试通过（9/9 项检查），含中文路径与特殊字符场景
- **编译**：`npm run build` 成功，`main.js` 119.3kb；验证 `require("child_process")` 正确保留为 external 引用
- **风险提示**：依赖系统 `curl`（Windows 10/11、macOS、Linux 默认自带）；上传进度从精确百分比降级为"上传中 (via curl)..."文案

## [2026-06-20 02:30:00] task(mindmap): 思维导图生成后自动调用MarkMind命令转为Rich模式并删除basic文件
- 新增 `autoConvertToRich()` 方法，在 `generateMindMap()` 写入 basic 后自动执行
- 通过 `obsidian-markmind:Change basic mode to rich mode` 命令调用 MarkMind 插件
- 轮询等待 rich 文件生成（最多10秒），成功后删除 basic 文件
- 阶段提示从 1/3 更新为 1/4

## [2026-06-20 01:42:26] task(fix-opencode-key): 魔搭R1不可用，更换OpenCode DeepSeek V4 Pro备用key，思考模式拉到max，输出不限制
- 魔搭ModelScope-A/B 均返回400，确认已不可用
- secrets.json LLM_API_KEY 更新为新key
- src/llm.ts reasoning_effort 设为 "max"（仅OpenCode idx=0）
- thinking: { type: "enabled" } 保持不变
- max_tokens 不传递，API不限制输出
- 编译构建通过（npx tsc --noEmit 零错误）

## [2026-06-05 15:30:00] task(llm): LLM分析备用API从豆包迁移至OpenCode Go DeepSeek V4 Pro
- 将 `LLM_PROVIDERS[0]`（备用兜底）从火山方舟豆包替换为 OpenCode Go DeepSeek V4 Pro
- API: `https://opencode.ai/zen/go/v1/chat/completions`，模型: `deepseek-v4-pro`
- 启用思考模式 `thinking: { type: "enabled" }`（思考级别 max）
- 更新 `getBatchSummary` / `getBatchSummaryInternal` 中的日志和标签 `[Volc-Doubao]` → `[OpenCode-V4]`
- 更新 `main.ts` 中 `shortModelName` 和 `providerName` 的判断逻辑
- 任务报告 API（LLM_REPORT_CONFIG / LLM_REPORT_FALLBACK）保持不变
- 魔搭社区首选模型（索引 1-3）保持不变

## [2026-05-23 22:45:00] task(report): 报告头展示 LLM 生成模型和错误信息
- 修改 `generateTaskReport`：报告头显示使用的模型名称
- 当主模型（商汤）失败切换到备用时，显示 `⚠️(备用激活)` 标记
- 显示主模型失败原因（截断显示，最长 80 字符）
- 两个模型都失败时，在简化版报告中显示具体错误信息

### 报告头示例

**正常情况：**
```
> [!summary] 📋 任务完成报告
> 生成时间: 2026/5/23 22:45:00
>
> **报告生成模型**: 商汤 DeepSeek-V4-Flash
```

**切换到备用：**
```
> [!summary] 📋 任务完成报告
> 生成时间: 2026/5/23 22:45:00
>
> **报告生成模型**: 京东云 Kimi-K2.5 ⚠️(备用激活)
> **主模型失败原因**: Request timeout after 30000ms
```

## [2026-05-23 22:30:00] task(config): 切换报告生成 LLM 到商汤 DeepSeek
- 新增 `LLM_REPORT_FALLBACK` 配置：京东云 Kimi-K2.5 作为备用
- 修改 `LLM_REPORT_CONFIG`：商汤 DeepSeek-V4-Flash 设为优先
- 修改 `generateTaskReport` 函数：添加 Provider fallback 机制
- 调用链：商汤优先 → 失败则回退到京东云 → 都失败则返回简化版报告

## [2026-05-23 22:15:00] task(report): 增强任务报告，添加 LLM 使用统计展示
- 新增 `LLMCallRecord` 接口：记录单次 LLM 调用的详细信息（批次、阶段、Provider、模型、成功/失败、错误信息、耗时）
- 新增 `LLMUsageStats` 接口：汇总 LLM 使用统计（总调用次数、成功/失败次数、使用的 Provider/模型列表、总耗时、错误摘要）
- 修改 `TaskReport` 接口（main.ts）：添加 `llmCallRecords: LLMCallRecord[]` 字段
- 修改 `TaskReportData` 接口（src/llm.ts）：添加 `llmCallRecords` 字段传递
- 新增 `calculateLLMStats` 函数（src/llm.ts）：从调用记录计算统计摘要
- 修改 `generateTaskReport` 函数：在 prompt 中展示 LLM 使用情况（总调用次数、成功/失败、使用的 Provider/模型、失败详情）
- 修改批次处理代码（main.ts）：记录每次 LLM 调用的详细信息，包括成功/失败状态和耗时
- 修改全局分析代码（main.ts）：记录全局分析的 LLM 调用
- 修改思维导图生成代码（main.ts）：记录思维导图的 LLM 调用

### 反斜杠自动修复逻辑分析
`src/latex-protect.ts` 中的 `fixDoubleBackslash` 方法实现：
- 正则 `/\\\\([a-zA-Z])/g` 将 `\\command` 修复为 `\command`
- 只处理 `$...$` 和 `$$...$$` 内的 LaTeX 公式
- 只处理反斜杠后跟字母的情况（符合 LaTeX 命令格式）
- 通过 `restoreAndFixFields` 在 JSON 解析后自动调用

## [2025-01-16 17:00:00] task(feat): 添加任务完成报告功能
- 新增 `TaskReportData` 接口和 `generateTaskReport` 函数（src/llm.ts）
- 使用京东云 Kimi 模型生成客观、真实的任务完成报告
- 在 `processTranscription` 中初始化和收集任务执行数据
- 记录 API 使用日志和错误日志
- 统计成功/失败批次、全局分析和思维导图状态
- 在流程结束时生成报告并追加到笔记末尾
- 报告使用 Markdown callout 格式，便于阅读

## [2025-01-16 16:15:00] task(log): 优化 LLM 提供商日志显示
- 统一 ModelScope key 命名：ModelScope-A/B/C（索引 1/2/3）
- 切换到京东云兜底时，自动替换 `[MS-R1]` 标签为 `[JDC-K2.5]`
- 简化日志输出格式，更清晰地显示当前使用的 API key

## [2025-01-16 16:00:00] task(fix): 修复 runGlobalCorrectionAnalysis 边界检查问题
- 修复 `main.ts` 中 `jobEndTime` 计算时访问空数组 `[0].start` 的 TypeError
- 改为遍历查找下一个有 segments 的批次来计算结束时间
- 添加全局分析 API 调用的调试日志，便于追踪问题

## [2025-01-16 15:30:00] task(llm): 重构 LLM 提供商架构，将全局分析任务独立到专用 API Key
- 新增 `LLM_GLOBAL_CONFIG` 配置：专用于全局分析和思维导图生成的第三个魔搭 API Key
- 修改 `src/llm.ts`:
  - `getGlobalCorrectionSummary`: 移除 provider 循环逻辑，改为直接使用 `LLM_GLOBAL_CONFIG`
  - `generateMindmapContent`: 从 `LLM_CONFIG` 切换到 `LLM_GLOBAL_CONFIG`
  - 添加 `max_tokens: 8192` 参数防止响应截断
- 修改 `main.ts`:
  - llmWorkers 循环从 `for (let i = 1; i < LLM_PROVIDERS.length; i++)` 改为 `for (let i = 1; i <= 2; i++)`
  - 确保索引 3 的 ModelScope Key 不参与批次处理轮询，专注于全局分析和思维导图任务
- 架构调整后职责分明：
  - 索引 0: 京东云 Kimi-K2.5 (备用兜底)
  - 索引 1-2: 魔搭社区双 Key 轮询并行处理批次分析
  - 索引 3: 魔搭社区专用 Key，仅负责全局分析和思维导图生成

## [2026-05-12 11:35:00] task(llm): 调整 LLM 路由优先级，首选 SiliconFlow R1
- 验证 SiliconFlow 本地网关 API 可用性 (HTTP 200)。
- 修改 `src/llm.ts` 路由逻辑：将 SiliconFlow (索引 0) 设为第一优先级，魔搭社区设为备份。
- 修复之前逻辑中由于默认 providerIndex 为 1 导致一直调用魔搭社区的问题。
- 重新运行 `npm run build` 确保同步更新 `main.js`。

## [2026-05-12 11:20:00] task(llm): 将火山引擎 R1 模型替换为 SiliconFlow OpenAI 兼容 API
- 全面移除火山引擎 (Volcengine) API 相关配置和逻辑引用。
- 引入 SiliconFlow 新 API 端点：`http://127.0.0.1:23333/v1/chat/completions`。
- 更新模型 ID 为 `silicon:Pro/deepseek-ai/DeepSeek-R1` 并设置对应 API Key。
- 同步更新后台日志和注释中的厂商标识，确保一致性。

## [2026-04-17 19:30:03] task(docs): 初始化项目文档

创建项目文档基础结构，包含以下三个核心文档文件：

1. **PROJECT_OVERVIEW.md** - 项目概述文档
   - 项目名称和简介
   - 核心功能描述（智能转写、AI 章节分析、思维导图生成、主从视图联动、模糊搜索）
   - 技术栈说明（TypeScript、Obsidian、FFmpeg、SiliconFlow ASR、DeepSeek-R1）
   - 主要依赖列表
   - 架构概述和模块结构

2. **WORKSPACE_STRUCTURE.md** - 工作区结构文档
   - 完整的文件树结构
   - 每个目录和文件的详细说明
   - 关键文件的作用描述
   - 构建产物和配置文件的说明

3. **DEV_LOG.md** - 开发日志文档
   - 建立开发日志记录机制
   - 使用标准格式记录开发活动

同时初始化 Git 仓库，为后续版本控制做准备。

---

## 日志格式说明

### 格式规范

```
## [YYYY-MM-DD HH:MM:SS] task(<area>): <中文详细备注>
```

### 区域标识 (area)

| 标识 | 含义 |
|------|------|
| `docs` | 文档相关 |
| `feat` | 新功能开发 |
| `fix` | 错误修复 |
| `refactor` | 代码重构 |
| `test` | 测试相关 |
| `config` | 配置变更 |
| `build` | 构建相关 |
| `deps` | 依赖更新 |

### 示例

```
## [2026-04-17 10:00:00] task(feat): 实现 ASR 转写功能
添加 SiliconFlow ASR API 调用，支持音频文件转写为带时间戳的文本。

## [2026-04-17 14:30:00] task(fix): 修复时间戳格式问题
修正转写结果中时间戳的显示格式，确保与 Obsidian 链接兼容。
```

---

*本日志按时间倒序排列，最新的记录在最上方。*

## [2026-05-12 22:35:05] task(llm): 移除遗留的火山引擎硬编码逻辑
- 在 src/llm.ts 移除了最后残留的 Volcengine 字符串
- 确保代码全面兼容 SiliconFlow OpenAI 兼容 API

## [2026-05-12 22:35:05] task(llm): 移除遗留的火山引擎硬编码逻辑
- 在 src/llm.ts 移除了最后残留的 Volcengine 字符串
- 确保代码全面兼容 SiliconFlow OpenAI 兼容 API

## [2026-05-12 22:50:57] task(llm): 重构 LLM 双轨并行调度与兜底逻辑
- 优化 main.ts 中 llmWorkers 的生成：仅启动两个魔搭社区 key（索引 1、2）对应的双轨工作流。
- 修复 main.ts 中传递写死索引 1 的问题，现在可以正确将 providerIdx 一路传到 llm.ts，确保了 Key1 和 Key2 交替/并行被真正使用。
- 完善 llm.ts:getBatchSummary，若当前魔搭 Key 报错（如 429 额度不足），将立刻停止魔搭重试，转而使用兜底的硅基流动（DeepSeek-R1）进行接管。

## [2026-05-12 22:50:57] task(llm): 重构 LLM 双轨并行调度与兜底逻辑
- 优化 main.ts 中 llmWorkers 的生成：仅启动两个魔搭社区 key（索引 1、2）对应的双轨工作流。
- 修复 main.ts 中传递写死索引 1 的问题，现在可以正确将 providerIdx 一路传到 llm.ts，确保了 Key1 和 Key2 交替/并行被真正使用。
- 完善 llm.ts:getBatchSummary，若当前魔搭 Key 报错（如 429 额度不足），将立刻停止魔搭重试，转而使用兜底的硅基流动（DeepSeek-R1）进行接管。

## [2026-05-17 21:34:49] task(llm): 将兜底模型从 SiliconFlow DeepSeek-R1 替换为京东云 Kimi-K2.5
- 更新 src/config.ts 中 LLM_PROVIDERS[0] 的配置：
  - BASE_URL: https://modelservice.jdcloud.com/coding/openai/v1
  - API_KEY: pk-8ca7ea9d-dba0-463a-83b6-002ae8c68500
  - MODEL: Kimi-K2.5
- 同步更新 LLM_CONFIG 向后兼容配置
- 更新 src/llm.ts 中的日志和提供商标识字符串
- 更新 secrets.json 中的 LLM_API_KEY

## [2026-05-17 21:34:49] task(llm): 将兜底模型从 SiliconFlow DeepSeek-R1 替换为京东云 Kimi-K2.5
- 更新 src/config.ts 中 LLM_PROVIDERS[0] 的配置：
  - BASE_URL: https://modelservice.jdcloud.com/coding/openai/v1
  - API_KEY: pk-8ca7ea9d-dba0-463a-83b6-002ae8c68500
  - MODEL: Kimi-K2.5
- 同步更新 LLM_CONFIG 向后兼容配置
- 更新 src/llm.ts 中的日志和提供商标识字符串
- 更新 secrets.json 中的 LLM_API_KEY

## [2026-05-17 21:39:46] task(llm): 为京东云 Kimi-K2.5 启用思考模式
- 在 getBatchSummaryInternal 和 getGlobalCorrectionSummary 请求体中添加 enable_thinking: true
- 仅当使用索引 0（京东云 Kimi）时启用，魔搭模型不添加此参数

## [2026-05-17 21:39:46] task(llm): 为京东云 Kimi-K2.5 启用思考模式
- 在 getBatchSummaryInternal 和 getGlobalCorrectionSummary 请求体中添加 enable_thinking: true
- 仅当使用索引 0（京东云 Kimi）时启用，魔搭模型不添加此参数

## [2026-05-17 21:46:02] task(llm): 添加 LLM 连续失败中断机制
- 新增 llmFailedCount 和 llmCriticalError 变量跟踪失败状态
- 设置 MAX_LLM_FAILURES = 3，连续失败 3 次后终止剩余分析
- 修改 runBatchAnalysis 返回 boolean，成功返回 true，失败返回 false
- 失败时显示醒目通知，避免用户误以为分析完整

## [2026-05-17 21:46:02] task(llm): 添加 LLM 连续失败中断机制
- 新增 llmFailedCount 和 llmCriticalError 变量跟踪失败状态
- 设置 MAX_LLM_FAILURES = 3，连续失败 3 次后终止剩余分析
- 修改 runBatchAnalysis 返回 boolean，成功返回 true，失败返回 false
- 失败时显示醒目通知，避免用户误以为分析完整

## [2026-05-17 23:31:21] task(fix): 移除京东云 Kimi 不支持的 enable_thinking 参数
- 京东云 Kimi API 不支持 enable_thinking 参数，导致 HTTP 400 错误
- 已从 getBatchSummaryInternal 和 getGlobalCorrectionSummary 中移除此参数

## [2026-05-17 23:31:21] task(fix): 移除京东云 Kimi 不支持的 enable_thinking 参数
- 京东云 Kimi API 不支持 enable_thinking 参数，导致 HTTP 400 错误
- 已从 getBatchSummaryInternal 和 getGlobalCorrectionSummary 中移除此参数

## [2026-05-18 00:03:40] task(llm): 为京东云 Kimi 显式启用思考模式
- 使用正确的参数格式: thinking: { type: "enabled" }
- 已在以下函数中添加:
  - getBatchSummaryInternal (批次摘要生成)
  - getGlobalCorrectionSummary (全局校验修正)
  - generateMindmapContent (思维导图生成)
  - rewriteSelection (选段重写)
- 仅对索引 0 (京东云 Kimi) 启用，魔搭模型不添加此参数

## [2026-05-18 00:03:40] task(llm): 为京东云 Kimi 显式启用思考模式
- 使用正确的参数格式: thinking: { type: "enabled" }
- 已在以下函数中添加:
  - getBatchSummaryInternal (批次摘要生成)
  - getGlobalCorrectionSummary (全局校验修正)
  - generateMindmapContent (思维导图生成)
  - rewriteSelection (选段重写)
- 仅对索引 0 (京东云 Kimi) 启用，魔搭模型不添加此参数

## [2026-05-18 00:12:57] task(config): 添加第三个魔搭社区 API Key 到轮询池
- 新增 API Key: ms-9acac3e9-cc71-4ff9-9751-8f0b0e9506fe
- LLM_PROVIDERS 现有 4 个提供者：
  - 索引 0: 京东云 Kimi-K2.5 (备用兜底)
  - 索引 1-3: 魔搭社区 DeepSeek-R1-0528 (三 key 轮询并行)
- main.ts 中 llmWorker 启动逻辑保持不变 (for i = 1 to length)，自动支持三轨并行

## [2026-05-18 00:12:57] task(config): 添加第三个魔搭社区 API Key 到轮询池
- 新增 API Key: ms-9acac3e9-cc71-4ff9-9751-8f0b0e9506fe
- LLM_PROVIDERS 现有 4 个提供者：
  - 索引 0: 京东云 Kimi-K2.5 (备用兜底)
  - 索引 1-3: 魔搭社区 DeepSeek-R1-0528 (三 key 轮询并行)
- main.ts 中 llmWorker 启动逻辑保持不变 (for i = 1 to length)，自动支持三轨并行

## [2026-05-18 00:16:51] task(config): 修复京东云 Kimi BASE_URL 缺少 /chat/completions 后缀
- 错误原因: 京东云 API 端点需要完整路径 /v1/chat/completions
- 修复前: https://modelservice.jdcloud.com/coding/openai/v1
- 修复后: https://modelservice.jdcloud.com/coding/openai/v1/chat/completions
- 同步修复 LLM_CONFIG 向后兼容配置

## [2026-05-18 00:16:51] task(config): 修复京东云 Kimi BASE_URL 缺少 /chat/completions 后缀
- 错误原因: 京东云 API 端点需要完整路径 /v1/chat/completions
- 修复前: https://modelservice.jdcloud.com/coding/openai/v1
- 修复后: https://modelservice.jdcloud.com/coding/openai/v1/chat/completions
- 同步修复 LLM_CONFIG 向后兼容配置

## [2026-05-18 00:22:26] task(llm): 移除京东云 Kimi 的 thinking 参数
- 问题根因: 京东云托管的 Kimi API 不支持 thinking 参数
- 官方 Moonshot API 需要使用 extra_body 传递 thinking 参数，但京东云是第三方托管
- 传了不支持的参数导致 400 Bad Request
- 已移除所有 4 处 thinking 参数:
  - getBatchSummaryInternal
  - getGlobalCorrectionSummary
  - generateMindmapContent
  - rewriteSelection

## [2026-05-18 00:22:26] task(llm): 移除京东云 Kimi 的 thinking 参数
- 问题根因: 京东云托管的 Kimi API 不支持 thinking 参数
- 官方 Moonshot API 需要使用 extra_body 传递 thinking 参数，但京东云是第三方托管
- 传了不支持的参数导致 400 Bad Request
- 已移除所有 4 处 thinking 参数:
  - getBatchSummaryInternal
  - getGlobalCorrectionSummary
  - generateMindmapContent
  - rewriteSelection

## [2026-05-18 00:28:52] task(llm): 恢复京东云 Kimi 显式思考模式参数
- 测试确认: thinking: { type: "enabled" } 参数有效
- 已在以下函数中添加:
  - getBatchSummaryInternal (idx === 0 时启用)
  - getGlobalCorrectionSummary (i === 0 时启用)
  - generateMindmapContent (固定启用)
  - rewriteSelection (provider 为索引 0 时启用)

## [2026-05-18 00:28:52] task(llm): 恢复京东云 Kimi 显式思考模式参数
- 测试确认: thinking: { type: "enabled" } 参数有效
- 已在以下函数中添加:
  - getBatchSummaryInternal (idx === 0 时启用)
  - getGlobalCorrectionSummary (i === 0 时启用)
  - generateMindmapContent (固定启用)
  - rewriteSelection (provider 为索引 0 时启用)

## [2026-06-20 09:29:00] task(mindmap-link): 修复思维导图链接节点显示文本过长问题——displayTitle 改用 realTitle

- 问题根源：链接节点显示文本使用 LLM 自由生成的 displayTitle，V4 Pro + reasoning_effort: "max" 下文本冗长（罗列子标题而非概括）
- 修复1：src/llm.ts 第598行，cleanDisplayTitle 从 displayTitle.trim() 改为 realTitle.trim()，使链接显示直接用原文章节标题
- 修复2：src/llm.ts 第477行，思维导图 prompt 追加链接节点简洁性约束（2-6字关键词，不罗列子标题）
- 编译验证通过：npx tsc --noEmit 和 npm run build 均成功

## [2026-06-20 09:37:00] task(mindmap-link): 回退realTitle方案，改为仅通过prompt强化链接节点简洁性约束

- 原因：realTitle方案影响范围太大——链接节点多为聚合多个子章节的上级节点，直接替换会丢失概括意义
- 回退：src/llm.ts 第600行，cleanDisplayTitle 恢复为 displayTitle.trim()
- 强化：prompt 中追加独立强调规则——链接节点标题2-8字凝练概括短语，禁止罗列子标题/完整句/展开解释
- 编译验证通过：npx tsc --noEmit 和 npm run build 均成功

## [2026-06-29 01:02:00] task(llm-config): 修复 LLM 配置切换失效问题

**Git Anchor:** 7e38f15604b588ef5ad265af22051633189c5ea2 (for rollback: git revert -m 1 7e38f15604b588ef5ad265af22051633189c5ea2)

- 扩展 `LLMProvider` 接口，新增 `NAME` 和 `EXTRA_BODY` 字段
- 修复 `src/llm.ts` 中四处硬编码（`getBatchSummary`、`getBatchSummaryInternal`、`getGlobalCorrectionSummary`、`generateMindmapContent`）
- 将 OpenCode 专属参数 `reasoning_effort` 和 `thinking` 移至 `EXTRA_BODY` 配置
- 修复日志字符串硬编码问题，现显示真实 provider 名称

## [2026-10-11 15:30:00] feat(mindmap): Rich 思维导图分支拆分组装迁移引擎与自定义要求迭代生成

1. **核心拓扑分析引擎与全覆盖分组 (src/rich-mindmap-manager.ts)**:
   - 自动识别主根节点 (Root) 与所有第一层次级节点 (Secondary Branches)
   - 递归深度优先遍历提取完整子树集合，连带样式、颜色与展开状态
   - 闭包提取所有不在次级节点下的独立游离节点 (Orphan Nodes)，形成独立分支组
   - 严格拓扑守恒校验：`1(root) + sum(groups.nodeCount) === totalNodeCount`，确保 100% 不漏不拿

2. **跨思维导图原子合并与几何坐标排版**:
   - MarkMind 8-4-4 十六进制 ID 全局防冲突重映射表
   - 元数据关联对象 (induceData 概要框、wireFrameData 外框、relateLinkData 连线) 完整继承转换
   - 2D 树形自适应排版算法：自动扫描目标导图同侧最低点 $Y_{\max}$，叶子节点 $34\text{px}$ 步进，父节点自动居中，水平层级深度 $170\text{px}$ 递增，绝对杜绝坐标重叠
   - 调色板颜色顺延循环，风格统一优雅
   - 支持两套模式：`copy` (复制追加，保留源导图) 与 `move` (剪切迁移，源导图清理对应子树)

3. **交互弹窗与命令系统 (src/mindmap-migrate-modal.ts & main.ts)**:
   - 新增命令：`🔀 组装与迁移思维导图分支 (MarkMind)` (`migrate-rich-mindmap-branches`)
   - 文件管理器右键菜单与活动页面一键触发
   - 可视化弹窗清晰展示分支统计、节点数量、全库目标思维导图搜索选择器与模式切换

4. **自定义要求增量思维导图生成 (src/llm.ts & src/partial-mindmap.ts)**:
   - 全量及局部思维导图生成方法支持 `customRequirements` 参数
   - `PartialMindmapModal` 弹窗新增「③ 增添的新要求」多行输入框，动态将用户新指令注入到提示词最高优先级部分
   - 插件类实例暴露统一 `mindmapAPI` (含 `parseAndAnalyze`, `migrateGroups`, `generateContent`, `generatePartialContent`)，供外部与后续 AI 对话直接调用

5. **实测与质量保证**:
   - 新建 `scripts/test_rich_mindmap_migration_smoke.cjs` 针对库内真实导图进行 6 大项严苛端到端与边界测试，全部 100% 通过
   - TypeScript 严格类型检查，彻底消除 `any` 类型声明，esbuild 构建打包产物 `main.js` 333.7KB

## [2026-10-12 10:15:00] feat(mindmap-detect): 彻底消除死板文件名后缀限制，全面支持已改名思维导图“打开即运行”与全库穿透检索

1. **问题根因定位**:
   - 用户习惯先打开思维导图再按命令，但库中大量导图已被重命名（去除了 `-rich` 后缀甚至不带 `🧠` 标记，如 `05.谓语动词时态下.md`、`03.z_概念-普通对称性与轮换对称性.md`）
   - 旧逻辑强依赖 `activeFile.name.endsWith('-rich.md') || activeFile.name.includes('🧠')`，导致改名后的活跃导图被误判为非导图而弹出全库选择框；且全库选择框因同样的文件名过滤规则漏搜大量已改名导图。

2. **三级穿透识别算法 (`isMindmapFile`)**:
   - **第一级（MetadataCache 内存元数据，0ms 极速命中）**：直接读取 Obsidian 索引的 Frontmatter `mindmap-plugin: rich` 或 `mindmap-plugin: basic`，改名后依然 100% 稳定命中。
   - **第二级（内容特征动态扫描）**：当用户在当前页面打开文档时，若元数据尚未刷新，即时读取文本，检测 MarkMind 专有结构 `mindmap-plugin: rich` 或 ````json` 且含 `"mindData"` 节点数组，确保内容为真导图即刻生效。
   - **第三级（文件名宽松兜底）**：保留包含 `🧠`、`rich` 的文件名兼容。

3. **交互与选择器增强**:
   - 命令 `🔀 组装与迁移思维导图分支 (MarkMind)`：用户打开任何重命名后的思维导图直接运行，瞬间命中并弹出分支列表。
   - 全库目标导图选择器 (`TargetMindmapPickerModal`)：全面升级为 `isMindmapFile` 检索，并在列表项前置标注 `🧠 [Rich]` 与 `📝 [Basic]` 视觉标签，实测在全库 4000+ 文件中瞬间精准发现并聚合全部 317 个思维导图。

4. **实测保障**:
   - 编写 `scripts/test_renamed_mindmap_in_app.mjs`，通过 Electron CDP 在运行中的 Obsidian 内对真实已改名导图 `05.谓语动词时态下.md`（79节点）进行真实打开运行实测，场景 A（打开即运行）与场景 B（全库检索 317 个导图）100% 通过。

## [2026-10-12 11:30:00] feat(mindmap-regenerate): 重生成思维导图增加自定义新要求弹窗与 AI 可编程重生成接口

1. **需求背景**:
   - 用户不仅需要在已有导图上追加新要求分支，而且在运行“🧠 重生成思维导图”全量命令时，也需要能随时输入新的自定义要求（如“重点突出核心定理技巧与易错点”、“精简说明文字只留框架”等）重绘全图。
   - 需对外引出可编程 AI 接口，使外部 Agent/对话直接携带自定义指令触发全图重生成。

2. **功能与架构实现**:
   - 新增 `RegenerateMindmapModal` 弹窗（`src/mindmap-migrate-modal.ts`），展示当前笔记路径、已识别章节数，并提供多行自定义要求输入框（留空按默认生成，填入则最高优先级遵循）。
   - 增强 `generateMindMap` 与 `regenerateMindmapFromNote` 方法，全面兼容视频文件移位/脱机场景（自动基于智能笔记推断导图输出路径，不再因视频未找到而阻断导图生成）。
   - 在 `plugin.mindmapAPI` 统一暴露出：
     - `regenerateMindmap(noteFile, customRequirements)`: 纯代码/AI 异步调用接口，不弹窗直接执行。
     - `openRegenerateModal(noteFile)`: 交互弹窗调用接口。
     - `RegenerateMindmapModal`: 模态框类。

3. **应用内实测 (CDP)**:
   - 在运行中的 Obsidian 内对真实智能笔记 `📝01 写作功能句1-5.md` 进行实测，验证弹窗成功打开、章节统计准确（18个章节）、新要求多行输入框渲染及取值正常，API 挂载健全。
