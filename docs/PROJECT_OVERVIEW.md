# 项目概述

## 项目名称

**Silicon Transcriber** - Obsidian 智能转写插件

## 项目简介

Silicon Transcriber 是一款专为 Obsidian 设计的智能转写插件，旨在帮助用户（特别是考研学习者）将视频/音频内容自动转换为结构化的学习笔记。

插件通过集成 SiliconFlow ASR API 和火山引擎 DeepSeek-R1 模型，实现了从音频转写到 AI 章节分析再到思维导图生成的完整工作流。

## 核心功能

### 1. 智能转写 (ASR)

- 支持格式: `mp4`, `mp3`, `wav`, `m4a`, `mov`
- 切片策略: 每 600 秒一个分片 (可配置)
- 输出格式: 带精确时间戳的逐句文本
- 处理流程: 视频/音频 → FFmpeg 切片 → SiliconFlow ASR → 带时间戳的文本

### 2. AI 章节分析

- 智能识别知识点边界
- 自动生成章节标题
- 动词起手的摘要风格 (专为学习笔记优化)
- 支持上下文记忆 (历史摘要传递)
- 处理流程: 转写文本 → DeepSeek-R1 → 结构化章节

### 3. 思维导图生成

- 多级层次结构 (3-5 层)
- 自动链接到笔记章节
- 兼容 MarkMind 插件
- 输出格式: Markmap 格式导图

### 4. 主从视图联动

- 自动检测视频文件
- 智能匹配笔记路径
- 避免重复打开
- 左侧打开视频 → 右侧自动打开对应笔记

### 5. 模糊搜索

- 全文模糊匹配
- 自动展开折叠的 Callout
- 高亮目标行
- 快捷键触发快速跳转

## 技术栈

| 类别 | 技术 |
|------|------|
| 开发语言 | TypeScript |
| 运行环境 | Obsidian Desktop (需要 Node.js 环境) |
| 音频处理 | FFmpeg (本地二进制) |
| 语音识别 | SiliconFlow ASR API |
| AI 总结 | 火山引擎 DeepSeek-R1 模型 |
| 构建工具 | esbuild |
| 包管理 | npm |

## 主要依赖

### 生产依赖

- 无外部生产依赖，核心功能通过 API 调用实现

### 开发依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| @types/node | ^25.1.0 | Node.js 类型定义 |
| builtin-modules | ^3.3.0 | 内置模块列表 |
| esbuild | ^0.17.3 | 快速打包工具 |
| obsidian | ^1.11.4 | Obsidian API |
| tslib | ^2.8.1 | TypeScript 运行时库 |
| typescript | ^5.9.3 | TypeScript 编译器 |

## 架构概述

### 模块结构

```
silicon-transcriber/
├── main.ts              # 插件入口，注册命令和视图
├── src/
│   ├── asr.ts           # ASR 转写模块
│   ├── config.ts        # 配置管理模块
│   ├── llm.ts           # LLM API 调用模块
│   ├── search-modal.ts  # 搜索模态框
│   ├── types.ts         # 类型定义
│   └── utils.ts         # 工具函数
├── docs/                # 文档目录
└── manifest.json        # Obsidian 插件清单
```

### 数据流程

```
用户操作
    ↓
插件入口 (main.ts)
    ↓
音频处理 (FFmpeg 切片)
    ↓
ASR 转写 (SiliconFlow API)
    ↓
AI 分析 (DeepSeek-R1)
    ↓
笔记生成 (Markdown + 思维导图)
    ↓
Obsidian 笔记文件
```

### 核心接口

- **ASR 接口**: 处理音频上传和转写结果获取
- **LLM 接口**: 处理章节分析和思维导图生成
- **配置接口**: 管理 API 密钥和用户偏好设置

## 插件信息

| 属性 | 值 |
|------|------|
| 插件 ID | obsidian-siliconflow-transcriber |
| 插件名称 | SiliconFlow Transcriber |
| 版本 | 1.0.0 |
| 最低 Obsidian 版本 | 0.15.0 |
| 描述 | 使用硅基流动 API 转写音频附件 |
| 作者 | Me |
| 仅桌面端 | 否 |
