# 📝 Silicon Transcriber - Obsidian 智能转写插件

> 🎬 视频/音频智能转写 + AI 章节总结 + 思维导图生成

---

## 📋 目录

- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [配置说明](#配置说明)
- [文件结构](#文件结构)
- [核心模块详解](#核心模块详解)
- [数据流程图](#数据流程图)
- [API 接口](#api-接口)
- [使用指南](#使用指南)
- [开发指南](#开发指南)
- [常见问题](#常见问题)

---

## 项目概述

### 🎯 项目定位

Silicon Transcriber 是一款专为 Obsidian 设计的智能转写插件，旨在帮助用户（特别是考研学习者）将视频/音频内容自动转换为结构化的学习笔记。

### ✨ 核心价值

| 痛点 | 解决方案 |
|------|----------|
| 手动记录视频笔记耗时 | 自动转写 + AI 章节划分 |
| 笔记结构混乱 | 智能分段 + 思维导图生成 |
| 回顾定位困难 | 时间戳链接 + 模糊搜索 |
| 视频笔记分离 | 主从视图联动机制 |

### 🛠️ 技术栈

- **开发语言**: TypeScript
- **运行环境**: Obsidian Desktop (需要 Node.js 环境)
- **音频处理**: FFmpeg (本地二进制)
- **语音识别**: SiliconFlow ASR API
- **AI 总结**: 火山引擎 DeepSeek-R1 模型

---

## 核心功能

### 1️⃣ 智能转写 (ASR)

```
视频/音频 → FFmpeg 切片 → SiliconFlow ASR → 带时间戳的文本
```

- 支持格式: `mp4`, `mp3`, `wav`, `m4a`, `mov`
- 切片策略: 每 600 秒一个分片 (可配置)
- 输出格式: 带精确时间戳的逐句文本

### 2️⃣ AI 章节分析

```
转写文本 → DeepSeek-R1 → 结构化章节 (标题 + 摘要)
```

- 智能识别知识点边界
- 自动生成章节标题
- 动词起手的摘要风格 (专为学习笔记优化)
- 支持上下文记忆 (历史摘要传递)

### 3️⃣ 思维导图生成

```
章节数据 → AI 归纳分类 → Markmap 格式导图
```

- 多级层次结构 (3-5 层)
- 自动链接到笔记章节
- 兼容 MarkMind 插件

### 4️⃣ 主从视图联动

```
左侧打开视频 → 右侧自动打开对应笔记
```

- 自动检测视频文件
- 智能匹配笔记路径
- 避免重复打开

### 5️⃣ 模糊搜索

```
快捷键触发 → 搜索转写原文 → 跳转并展开折叠块
```

- 全文模糊匹配
- 自动展开折叠的 Callout
- 高亮目标行

---

## 技术架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Obsidian Plugin API                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Command   │  │    Event    │  │    Modal    │              │
│  │  Registry   │  │   Handler   │  │   System    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│                          ▼                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   TranscribePlugin                         │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                Core Processing Pipeline              │  │  │
│  │  │                                                      │  │  │
│  │  │  ┌──────────┐   ┌──────────┐   ┌──────────────────┐ │  │  │
│  │  │  │  FFmpeg  │ → │   ASR    │ → │  AI Summarizer   │ │  │  │
│  │  │  │ Splitter │   │  Upload  │   │  (Batch Queue)   │ │  │  │
│  │  │  └──────────┘   └──────────┘   └──────────────────┘ │  │  │
│  │  │                                         │           │  │  │
│  │  │                                         ▼           │  │  │
│  │  │                              ┌──────────────────┐   │  │  │
│  │  │                              │  MindMap Gen     │   │  │  │
│  │  │                              └──────────────────┘   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                        External Services                         │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │  SiliconFlow    │              │  火山引擎        │           │
│  │  ASR API        │              │  DeepSeek-R1    │           │
│  └─────────────────┘              └─────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### 类结构

```typescript
class TranscribePlugin extends Plugin {
    // ===== 状态属性 =====
    ffmpegPath: string              // FFmpeg 可执行文件路径
    historySummaries: string        // 历史摘要（用于 AI 上下文）
    allChapterSummaries: Array<>    // 所有章节数据（用于思维导图）
    aiQueue: Promise<void>          // AI 任务队列
    activeAiCount: number           // 当前活跃的 AI 任务数
    isProcessing: boolean           // 全局处理锁

    // ===== 生命周期 =====
    onload()                        // 插件加载入口

    // ===== 核心方法 =====
    processTranscription()          // 主处理流程
    runBatchAnalysis()              // 批次 AI 分析
    getBatchSummary()               // 调用 LLM API
    generateMindMap()               // 生成思维导图

    // ===== 工具方法 =====
    convertChunkToMp3()             // FFmpeg 切片转码
    uploadToASR()                   // ASR API 上传
    getVideoDuration()              // 获取视频时长
    openTranscriptNote()            // 打开/创建笔记文件
    findTargetNoteLeaf()            // 智能查找笔记窗口
    
    // ===== 辅助方法 =====
    formatTime()                    // 秒数 → MM:SS
    parseTime()                     // MM:SS → 秒数
    isVideoView()                   // 判断视频视图
    findAudioFileInNote()           // 从笔记中提取媒体文件
    markBatchAsFailed()             // 标记失败的批次
}

class TranscriptionSearchModal extends FuzzySuggestModal<SegmentLine> {
    // 模糊搜索模态框实现
}
```

---

## 配置说明

### 🔑 API 配置 (代码内硬编码)

```typescript
// ===== 语音转文字配置 =====
const ASR_API_KEY = 'sk-xxx';                    // SiliconFlow API Key
const ASR_BASE_URL = 'https://api.siliconflow.cn/v1/audio/transcriptions';
const ASR_MODEL = 'TeleAI/TeleSpeechASR';       // 语音识别模型

// ===== AI 总结配置 =====
const LLM_API_KEY = 'xxx';                       // 火山引擎 API Key
const LLM_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const LLM_MODEL = 'deepseek-r1-250528';          // 推理模型
```

### ⚙️ 处理参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `CHUNK_SIZE` | 600 | 每个音频分片的秒数 (10分钟) |
| `BATCH_SIZE` | 1 | 每批次处理的分片数量 |

### 📂 输出路径规则

```
视频位置: /path/to/video.mp4

生成文件:
├── /path/to/📝智能笔记/📝智能笔记 - video.md   (转写笔记)
└── /path/to/🧠思维导图 - video.md              (思维导图)
```

---

## 文件结构

```
silicon-transcriber/
├── main.ts           # 主插件源码 (TypeScript)
├── main.js           # 编译后的 JS (Obsidian 加载)
├── manifest.json     # 插件元数据
├── package.json      # NPM 配置
├── tsconfig.json     # TypeScript 配置
├── ffmpeg.exe        # FFmpeg 可执行文件 (需手动放置)
└── README.md         # 本文档
```

---

## 核心模块详解

### 1. 插件初始化 (`onload`)

```typescript
async onload() {
    // 1. 注册主从视图联动：包装 WorkspaceLeaf.prototype.openFile（"真正打开文件"的唯一入口）
    //    不用 workspace.on('file-open') —— 它的语义是"活动文件变化"，点击播放画面也会误触发
    this.patchLeafOpenFile();
    //    启动恢复工作区走 leaf.setViewState（不经 openFile），用 onLayoutReady 兜底
    this.app.workspace.onLayoutReady(() => this.handleInitialMediaOpen());
    //    播放画面右键联动（capture 阶段 contextmenu）
    this.registerDomEvent(document, 'contextmenu', (evt) => this.handleMediaContextMenu(evt), { capture: true });

    // 2. 注册"智能转写"命令
    this.addCommand({ id: 'transcribe-v37-stable-fix', ... });

    // 3. 注册"模糊搜索"命令
    this.addCommand({ id: 'fuzzy-search-transcription', ... });
}
```

**主从视图联动逻辑:**

```
触发方式一：真正"打开"视频文件（包装 WorkspaceLeaf.openFile：文件列表点开 / 链接跳转 /
            拖拽 / 新窗口；启动恢复工作区由 onLayoutReady 兜底补触发）
触发方式二：在视频播放画面上右击（contextmenu，capture 阶段监听）
    ↓
过滤：必须是媒体文件 (mp4/mp3/wav/m4a/mov)；只开在侧边栏里的不参与联动
    ↓
计算对应笔记路径: {视频目录}/📝智能笔记/📝{视频名}.md
    ↓
检查笔记是否存在
    ├── 存在 → 在右侧边栏打开（已在右侧打开则激活并选中它的标签页，不重复打开文件）
    └── 不存在 → 不做任何操作
```

> 注意：**不要改回 `workspace.on('file-open')`** —— Obsidian 里 `file-open` 的实际语义是
> "活动文件变化"（app.js `activeLeafEvents`），点击播放画面暂停/播放会把活动文件从侧栏笔记
> 切回视频，同样会触发（表现为"点一下暂停右侧内容就切换 + 焦点被抢"）。
> 现在只有上述两种明确动作才切换右侧。
>
> 也不要在 `openNoteForMediaFile()` 里加"右侧已显示该笔记就提前 return"的所谓防重复守卫：
> 笔记已在右侧开着时右键会直接变成"什么都不发生"（2026-09-25 已踩过一次，详见 `docs/DEV_LOG.md`）。
> 已打开的情形交给 `openNoteInRightSidebar` 的精确匹配分支（`setActiveLeaf` 会选中标签页）。
>
> 回归测试：`node scripts/test_media_linkage_smoke.cjs`

---

### 2. 主处理流程 (`processTranscription`)

```typescript
async processTranscription(file: TFile, editor: Editor, targetLeaf: WorkspaceLeaf) {
    // 阶段 0: 环境检查
    // - 检查 FFmpeg 是否存在
    // - 检查 API Key 是否配置
    // - 初始化状态变量

    // 阶段 1: 获取视频时长，计算分片数
    const duration = await this.getVideoDuration(inputPath);
    const totalChunks = Math.ceil(duration / CHUNK_SIZE);

    // 阶段 2: 循环处理每个分片
    for (let i = 0; i < totalChunks; i++) {
        // 2.1 FFmpeg 提取音频
        const mp3Buffer = await this.convertChunkToMp3(...);
        
        // 2.2 上传到 ASR API
        const asrJson = await this.uploadToASR(mp3Buffer, ...);
        
        // 2.3 写入临时占位符到编辑器
        // 使用 %%BATCH_X_START%% ... %%BATCH_X_END%% 作为锚点
        
        // 2.4 将 AI 分析任务加入队列
        this.aiQueue = this.aiQueue.then(() => this.runBatchAnalysis(...));
    }

    // 阶段 3: 等待所有 AI 任务完成
    await this.aiQueue;

    // 阶段 4: 切换到阅读模式
    // 阶段 5: 生成思维导图
    await this.generateMindMap(file);
}
```

**分片处理时序图:**

```
时间 ─────────────────────────────────────────────────────────────►

Chunk 0:  [FFmpeg] → [ASR上传] → [写入占位符] → [AI入队]
                                                    │
Chunk 1:  [FFmpeg] → [ASR上传] → [写入占位符] → [AI入队]
                                                    │
Chunk 2:  ...                                       │
                                                    ▼
                                            [AI队列串行执行]
                                                    │
                                                    ▼
                                            [生成思维导图]
```

---

### 3. AI 批次分析 (`runBatchAnalysis`)

```typescript
async runBatchAnalysis(job: BatchJob, fileName: string, editor: Editor) {
    // 阶段 1: 组装原文文本
    let rawText = "";
    job.segments.forEach(s => rawText += `[${this.formatTime(s.start)}] ${s.text}\n`);

    // 阶段 2: 调用 LLM API (带心跳计时器)
    const topics = await this.getBatchSummary(rawText, this.historySummaries, startTime);

    // 阶段 3: 处理返回数据
    // - 按时间戳排序
    // - 过滤幻觉 (时间戳 < 当前批次起始时间)
    // - 匹配原文到对应章节

    // 阶段 4: 构建最终内容
    // - 章节标题 + 时间戳链接
    // - 摘要文本
    // - 折叠的原文 Callout

    // 阶段 5: 替换占位符
    // 通过 %%BATCH_X_START%% 和 %%BATCH_X_END%% 定位
    const startIndex = docContent.indexOf(`%%${job.anchorId}_START%%`);
    const endIndex = docContent.indexOf(`%%${job.anchorId}_END%%`);
    editor.replaceRange(finalContent, startPos, endPos);
}
```

**AI 返回数据结构:**

```json
[
  {
    "timestamp": "05:30",
    "title": "极限的定义与性质",
    "summary": "介绍极限的 ε-δ 严格定义，阐述局部有界性和保号性两个核心性质..."
  },
  {
    "timestamp": "12:00",
    "title": "例题：利用等价无穷小求极限",
    "summary": "分析 sin(x)/x 型极限，演示等价无穷小替换的标准步骤..."
  }
]
```

---

### 4. 思维导图生成 (`generateMindMap`)

```typescript
async generateMindMap(videoFile: TFile) {
    // 1. 收集所有章节数据 (this.allChapterSummaries)
    
    // 2. 构建 Prompt
    // - 要求生成多级 Markdown 大纲
    // - 章节标题带链接: [[笔记名#⏱️ 00:00 标题]]
    
    // 3. 调用 LLM API
    
    // 4. 清洗返回内容
    // - 移除 <think>...</think> 思考过程
    // - 移除 markdown 代码块标记
    
    // 5. 添加 MarkMind 识别头
    const yamlHeader = "---\nmindmap-plugin: basic\n---\n\n";
    
    // 6. 写入文件: 🧠思维导图 - {视频名}.md
}
```

**输出示例:**

```markdown
---
mindmap-plugin: basic
---

# 📝智能笔记 - 高数第一讲
## 🎯 概念基础
### 📌 [[📝智能笔记 - 高数第一讲#⏱️ 00:00 极限定义]]
- 极限的本质是描述函数的趋近行为
- 严格定义使用 ε-δ 语言
### 📌 [[📝智能笔记 - 高数第一讲#⏱️ 05:30 极限性质]]
- 局部有界性
- 保号性
## 📐 计算方法
### 📌 [[📝智能笔记 - 高数第一讲#⏱️ 12:00 等价无穷小]]
- sin(x) ~ x
- 1-cos(x) ~ x²/2
```

---

### 5. 模糊搜索 (`TranscriptionSearchModal`)

```typescript
class TranscriptionSearchModal extends FuzzySuggestModal<SegmentLine> {
    // 预加载数据: 扫描所有以 "> **" 开头的行 (转写原文)
    async preloadItems() {
        // 提取纯文本 (移除时间戳链接格式)
        const cleanText = lineText.replace(/^>\s*\*\*.*?\|.*?\]\]\*\*\s*/, '');
    }

    // 选中后的操作
    onChooseItem(item: SegmentLine) {
        // 1. 向上查找 Callout 头部 (> [!quote]-)
        // 2. 如果是阅读模式，先切换到编辑模式
        // 3. 展开折叠的 Callout (将 > [!quote]- 改为 > [!quote])
        // 4. 跳转到目标行并高亮
    }
}
```

---

## 数据流程图

### 完整处理流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                           用户操作                                    │
│                              │                                        │
│                              ▼                                        │
│                     ┌─────────────────┐                              │
│                     │  打开视频/音频   │                              │
│                     │  执行"智能转写"  │                              │
│                     └────────┬────────┘                              │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        音频提取阶段                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │ 视频文件    │ →  │   FFmpeg    │ →  │  MP3 Buffer │              │
│  │ (MP4/MOV)   │    │  -ss -t     │    │  (内存)     │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        语音识别阶段                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐  │
│  │  MP3 Buffer │ →  │ SiliconFlow │ →  │ { segments: [           │  │
│  │             │    │  ASR API    │    │   { start, end, text }  │  │
│  │             │    │             │    │   ...                   │  │
│  └─────────────┘    └─────────────┘    │ ] }                     │  │
│                                         └─────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        AI 分析阶段                                    │
│  ┌─────────────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ 原文 + 历史摘要     │ →  │ DeepSeek-R1 │ →  │ [               │  │
│  │ + Prompt            │    │ (火山引擎)   │    │  { timestamp,   │  │
│  │                     │    │             │    │    title,       │  │
│  └─────────────────────┘    └─────────────┘    │    summary }    │  │
│                                                 │ ]               │  │
│                                                 └─────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        笔记生成阶段                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ #### ⏱️ 05:30 极限的定义  🎬 [[video.mp4#t=05:30|05:30]]      │  │
│  │ 介绍极限的 ε-δ 严格定义，阐述局部有界性...                     │  │
│  │                                                               │  │
│  │ > [!quote]- 📜 原文                                           │  │
│  │ > **[[video.mp4#t=05:30|05:30]]** 我们来看极限的定义...       │  │
│  │ > **[[video.mp4#t=05:35|05:35]]** 所谓极限就是...             │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        思维导图阶段                                   │
│  ┌─────────────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ 所有章节数据        │ →  │ DeepSeek-R1 │ →  │ Markmap 格式    │  │
│  │ (timestamp/title/   │    │ 归纳分类     │    │ Markdown 大纲   │  │
│  │  summary)           │    │             │    │                 │  │
│  └─────────────────────┘    └─────────────┘    └─────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## API 接口

### 1. SiliconFlow ASR API

**Endpoint:** `POST https://api.siliconflow.cn/v1/audio/transcriptions`

**Headers:**
```
Authorization: Bearer {ASR_API_KEY}
```

**Body (FormData):**
| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | Blob | 音频文件 (MP3) |
| `model` | string | `TeleAI/TeleSpeechASR` |
| `response_format` | string | `verbose_json` |
| `timestamp_granularities[]` | string | `segment` |

**Response:**
```json
{
  "text": "完整文本...",
  "segments": [
    {
      "start": 0.0,
      "end": 5.2,
      "text": "第一句话..."
    },
    ...
  ]
}
```

---

### 2. 火山引擎 LLM API

**Endpoint:** `POST https://ark.cn-beijing.volces.com/api/v3/chat/completions`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {LLM_API_KEY}
```

**Body:**
```json
{
  "model": "deepseek-r1-250528",
  "messages": [
    { "role": "system", "content": "You are a JSON generator." },
    { "role": "user", "content": "{prompt}" }
  ],
  "stream": false,
  "temperature": 0.1
}
```

**Response:**
```json
{
  "choices": [
    {
      "message": {
        "content": "<think>思考过程...</think>[{\"timestamp\":\"05:30\",...}]"
      }
    }
  ]
}
```

---

## 使用指南

### 快速开始

1. **安装插件**
   - 将 `silicon-transcriber` 文件夹放入 `.obsidian/plugins/`
   - 确保 `ffmpeg.exe` 存在于插件目录

2. **配置 API Key**
   - 打开 `main.ts`
   - 修改 `ASR_API_KEY` 和 `LLM_API_KEY`
   - 重新编译: `npm run build`

3. **使用转写**
   - 打开任意视频/音频文件
   - 调用命令面板 (Ctrl+P)
   - 搜索"智能转写"并执行

4. **搜索原文**
   - 调用命令面板
   - 搜索"搜索转写原文"
   - 输入关键词进行模糊匹配

### 命令列表

| 命令 ID | 命令名称 | 快捷键 | 说明 |
|---------|----------|--------|------|
| `transcribe-v37-stable-fix` | 智能转写 | - | 转写当前视频/音频 |
| `fuzzy-search-transcription` | 🔍 搜索转写原文 | - | 模糊搜索并跳转 |
| `partial-mindmap-append` | 🧩 局部思维导图（追加到已有导图） | - | 选取智能笔记分块，生成局部导图并追加到已有导图末尾二级分支之后 |

### 输出文件说明

| 文件类型 | 路径模式 | 说明 |
|----------|----------|------|
| 转写笔记 | `{视频目录}/📝智能笔记/📝智能笔记 - {视频名}.md` | 包含章节标题、摘要、折叠原文 |
| 思维导图 | `{视频目录}/🧠思维导图 - {视频名}.md` | Markmap 格式，需配合 MarkMind 插件 |

---

## 开发指南

### 环境搭建

```bash
# 1. 安装依赖
npm install

# 2. 开发模式 (监听变更)
npm run dev

# 3. 生产构建
npm run build
```

### 依赖说明

| 包名 | 用途 |
|------|------|
| `obsidian` | Obsidian API 类型定义 |
| `typescript` | TypeScript 编译器 |

### 关键接口

```typescript
// Obsidian API
import { 
    Plugin,              // 插件基类
    Notice,              // 通知提示
    MarkdownView,        // Markdown 视图
    TFile,               // 文件对象
    Editor,              // 编辑器实例
    FileSystemAdapter,   // 文件系统适配器
    requestUrl,          // HTTP 请求
    WorkspaceLeaf,       // 工作区叶子
    FuzzySuggestModal    // 模糊搜索模态框
} from 'obsidian';

// Node.js API
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
```

### 调试技巧

1. **查看日志**
   - 打开开发者工具 (Ctrl+Shift+I)
   - 查看 Console 面板

2. **关键日志点**
   ```typescript
   console.log(`[替换] 批次 ${job.batchIndex} - 位置: ${startIndex} 到 ${endIndex}`);
   console.log(`[替换] 批次 ${job.batchIndex} 替换成功`);
   console.error(`[替换] 批次 ${job.batchIndex} 失败`);
   ```

3. **强制重载插件**
   - 设置 → 第三方插件 → 禁用再启用

---

## 常见问题

### Q1: 找不到 ffmpeg.exe

**原因:** FFmpeg 未放置在插件目录

**解决:**
1. 下载 FFmpeg: https://ffmpeg.org/download.html
2. 将 `ffmpeg.exe` 复制到 `.obsidian/plugins/silicon-transcriber/`

---

### Q2: ASR API 返回 401

**原因:** API Key 无效或过期

**解决:**
1. 登录 SiliconFlow 控制台
2. 生成新的 API Key
3. 更新 `main.ts` 中的 `ASR_API_KEY`

---

### Q3: AI 返回空数据

**原因:** LLM 返回格式不符合预期

**排查:**
1. 查看 Console 日志中的 "JSON Parse Error"
2. 检查 `content` 变量的原始值
3. 调整 Prompt 或 temperature 参数

---

### Q4: 锚点丢失导致替换失败

**原因:** 用户在处理过程中手动编辑了笔记

**解决:**
- 避免在转写过程中编辑笔记
- 如已丢失，手动删除 `%%BATCH_X_START%%` 相关内容

---

### Q5: 思维导图无法渲染

**原因:** 未安装 MarkMind 插件

**解决:**
1. 社区插件市场搜索 "MarkMind"
2. 安装并启用
3. 重新打开思维导图文件

---

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v37 | 2026-02-01 | 稳定版：修复并发锁、锚点替换、心跳计时 |

---

## License

MIT License

---

## 联系方式

如有问题或建议，请在 GitHub 提交 Issue。
