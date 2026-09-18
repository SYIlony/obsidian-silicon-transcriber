---
kind: error_handling
name: Obsidian 插件错误处理：重试、超时与用户反馈的统一模式
category: error_handling
scope:
    - '**'
source_files:
    - src/http-direct.ts
    - src/asr.ts
    - src/llm.ts
    - src/utils.ts
    - main.ts
---

## 1. 整体方法

该仓库没有定义统一的自定义错误类型或错误码体系，而是采用原生 Error + Promise reject 作为错误传播载体，在调用方通过 try/catch 捕获后，统一以两种方式呈现：
- 面向用户的即时反馈：使用 Obsidian 的 Notice（右上角提示条）。
- 面向开发者的诊断信息：使用 console.log / console.warn / console.error，并在关键路径附带结构化日志（如 LLM 请求带 requestId、chunk 计数、耗时等）。

所有网络 I/O（ASR 上传、LLM 调用）和文件系统 I/O（vault.create/modify）都集中在少数几个模块中，因此错误处理的策略也集中在这几个文件里。

## 2. 关键文件与职责

src/http-direct.ts：底层 HTTP 直连层，提供三层超时保护（硬性总超时、首字节超时、无数据超时），所有网络错误在此处被包装为 Error 并 reject。
src/asr.ts：ASR 上传封装，对 HTTP 5xx、空响应、JSON 解析失败、代理环境变量异常分别 reject，并通过 Notice 上报进度。
src/llm.ts：LLM 调用封装，实现网络错误/超时的指数退避重试（最多 3 次尝试）、SSE 流式拼接、畸形 JSON/LaTeX 转义修复、截断 JSON 抢救。
src/utils.ts：文件写入/创建的安全封装 safeWriteWithRetry / safeCreateWithRetry，带指数退避重试与写入验证。
main.ts：插件主入口，负责队列级错误收敛：单个任务失败记录到 currentTaskReport.errorLog，并向用户展示 Notice，同时继续处理队列中的下一个任务。

## 3. 架构与约定

### 3.1 分层错误边界

业务层 (main.ts) 捕获并转换为 Notice + 报告字段。
应用层 (asr.ts / llm.ts) 决定重试、降级与结构化 Error。
基础设施层 (http-direct.ts) 提供三层超时 + 重定向限制 + 代理隔离。

- 基础设施层 (http-direct.ts) 不向用户暴露任何 UI，只抛出 Error；它定义了统一的超时语义：timeoutMs（默认 180 万 ms = 30 分钟）、firstByteTimeoutMs（60s）、idleTimeoutMs（120s），以及最大重定向次数 5。
- 应用层 (asr.ts, llm.ts) 决定哪些错误可重试。例如 requestOpenCodeV4WithRetry 将包含 ERR_CONNECTION_RESET、ERR_CONNECTION_CLOSED、Failed to fetch、ECONNRESET 或“超时”字样的错误视为可重试，按 [10s, 20s] 延迟重试两次。
- 业务层 (main.ts) 在 processQueue() 中对每个任务包裹 try/catch/finally，无论成功失败都会清理状态锁并调度下一个任务，保证队列不会因单个失败而卡死。

### 3.2 重试与回退策略

| 场景 | 策略 | 位置 |
|---|---|---|
| 文件写入失败 | safeWriteWithRetry：最多 3 次，指数退避 1000 * 2^i ms，每次写入后 vault.read 校验内容一致性 | src/utils.ts |
| 文件创建冲突 | safeCreateWithRetry：捕获 already exists 直接返回现有文件，否则重试 | src/utils.ts |
| LLM 网络/超时 | 最多 3 次尝试（含首次），间隔 10s/20s；支持多 provider 切换（由调用方传入不同 providerIndex） | src/llm.ts |
| ASR 上传 | 单次尝试；若失败则向上抛错，由上层队列处理 | src/asr.ts |
| FFmpeg 子进程 | 非零退出码时 reject(new Error('FFmpeg code ' + code)) | src/utils.ts |
| JSON 解析失败 | LLM 侧先尝试 parseSegmentFormat（分隔符格式），再回退 tryParseTruncatedJson 抢救截断 JSON，最后才认为失败 | src/llm.ts |

### 3.3 用户可见的错误呈现

- 配置缺失：main.ts 检查 LLM_CONFIG.API_KEY.includes('你的')，直接 new Notice('⚠️ 请配置火山引擎 API Key') 并 return。
- 环境不可用：main.ts 检测非桌面环境时 new Notice("非桌面环境不可用")。
- 任务失败：processQueue 的 catch 块输出 "❌ 任务失败: ${videoFile.basename} - ${error.message}"。
- 队列完成：队列为空且无进行中任务时，updateQueueStatus 显示 "🎉 所有转写任务已完成！" 并在 5 秒后自动隐藏。
- 进度反馈：ASR 上传每 5% 更新一次 Notice，FFmpeg 转换根据 stderr 的 time= 输出百分比。

### 3.4 内部错误追踪

- TaskReport 结构体维护 errorLog: string[]、llmCallRecords: LLMCallRecord[]，每条记录包含 batchIndex、phase、provider、model、attempt、success、error、durationMs。
- LLM 请求生成唯一 requestId，每 1000 个 SSE chunk 打一次进度日志，便于定位“哪个批次慢”和“为什么超时”。
- 文件写入前会双重验证编辑器内存与磁盘内容是否一致，不一致时抛出明确错误。

## 4. 约定与约束

1. 禁止吞掉未分类的网络错误：http-direct.ts 对所有 socket/error/end 事件统一走 fail(err)，不会静默丢弃。
2. 所有外部 I/O 必须带超时：HTTP 请求默认 30 分钟硬超时；ASR 上传单独设置 req.setTimeout(1_800_000)。
3. 用户可见的错误必须通过 Notice 表达：业务层不直接向控制台抛错而不通知用户，所有影响用户流程的错误都会伴随 Notice。
4. 重试仅限幂等/可恢复错误：只有网络错误和超时被视为可重试；业务逻辑错误（如 JSON 解析失败、API 返回 5xx）直接上抛。
5. 文件写入必须可验证：safeWriteWithRetry 要求写入后立即 vault.read 比对，不一致即重试；最终仍失败才抛错。
6. 代理隔离是强制的：withClearedProxyEnv 在每次网络请求期间临时删除 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY 等环境变量，请求结束后恢复，避免系统代理劫持。
7. 队列级容错：processQueue 的 finally 块确保即使某个任务崩溃也会继续处理队列中的后续任务，不会阻塞整个流水线。
8. 不使用 throw new CustomError(...): 全仓使用原生 Error，错误区分靠 message 字符串匹配（如 includes('超时')、includes('already exists')）而非类型判断。
9. 不存在 panic/recover 等价物：代码中没有类似 Go panic 的模式，也没有全局错误处理器；错误始终沿 Promise 链向上冒泡至最近的 try/catch。
10. SSE 流式错误容忍：SSE 回调中的单行 JSON 解析失败会被 catch 跳过而非中断流，体现“尽力而为”的容错风格。