# 工作区结构

## 完整文件树

```
silicon-transcriber/
├── .gitignore                    # Git 忽略配置
├── .vscode/                      # VSCode 配置目录
│   └── settings.json             # VSCode 工作区设置
├── docs/                         # 文档目录
│   ├── mindmap-link-fix-workflow.md  # 思维导图链接修复工作流
│   ├── prompt-for-mindmap-link.md    # 思维导图链接提示词
│   ├── PROJECT_OVERVIEW.md       # 项目概述文档
│   ├── WORKSPACE_STRUCTURE.md    # 工作区结构文档 (本文件)
│   └── DEV_LOG.md                # 开发日志
├── plans/                         # 计划/分析文档目录
│   └── latex-json-escape-analysis.md  # LaTeX JSON 转义分析
├── src/                          # 源代码目录
│   ├── asr.ts                    # ASR 转写模块 (TypeScript)
│   ├── asr.js                    # ASR 转写模块 (编译后 JavaScript)
│   ├── config.ts                 # 配置管理模块 (TypeScript)
│   ├── config.js                 # 配置管理模块 (编译后 JavaScript)
│   ├── http-direct.ts            # HTTP 直连工具，绕过系统代理 (TypeScript)
│   ├── index.ts                  # 索引/导出模块 (TypeScript)
│   ├── index.js                  # 索引/导出模块 (编译后 JavaScript)
│   ├── latex-protect.ts          # LaTeX 保护/修复模块 (TypeScript)
│   ├── llm.ts                    # LLM API 调用模块 (TypeScript)
│   ├── llm.js                    # LLM API 调用模块 (编译后 JavaScript)
│   ├── search-modal.ts           # 搜索模态框 (TypeScript)
│   ├── search-modal.js           # 搜索模态框 (编译后 JavaScript)
│   ├── settings.ts               # 设置数据模型 (TypeScript)
│   ├── settings-tab.ts           # 设置界面类 (TypeScript)
│   ├── types.ts                  # 类型定义 (TypeScript)
│   ├── types.js                  # 类型定义 (编译后 JavaScript)
│   ├── utils.ts                  # 工具函数 (TypeScript)
│   └── utils.js                  # 工具函数 (编译后 JavaScript)
├── main.ts                       # 插件入口源码 (TypeScript)
├── main.js                       # 插件入口编译产物 (JavaScript)
├── manifest.json                 # Obsidian 插件清单
├── package.json                  # npm 包配置
├── package-lock.json             # npm 依赖锁定文件
├── tsconfig.json                 # TypeScript 编译配置
├── esbuild.config.mjs            # esbuild 构建配置
├── ffmpeg.exe                    # FFmpeg 可执行文件 (Windows)
├── secrets.json                  # API 密钥配置 (不提交到 Git)
├── README.md                     # 项目说明文档
└── 开发文档.md                    # 开发文档 (中文)
```

## 目录说明

### `.vscode/`

VSCode 编辑器的工作区配置目录。

| 文件 | 说明 |
|------|------|
| `settings.json` | VSCode 工作区设置，包含编辑器配置、TypeScript 配置等 |

### `docs/`

项目文档目录，存放各类文档文件。

| 文件 | 说明 |
|------|------|
| `mindmap-link-fix-workflow.md` | 思维导图链接修复的工作流程文档 |
| `prompt-for-mindmap-link.md` | 思维导图链接生成的提示词模板 |
| `PROJECT_OVERVIEW.md` | 项目概述文档，包含项目简介、功能、技术栈等 |
| `WORKSPACE_STRUCTURE.md` | 工作区结构文档 (本文件) |
| `DEV_LOG.md` | 开发日志，记录开发过程中的重要变更 |

### `src/`

源代码目录，包含插件的核心功能模块。

| 文件 | 说明 |
|------|------|
| `asr.ts` | ASR (自动语音识别) 模块，处理音频转写逻辑 |
| `config.ts` | 配置管理模块，处理插件设置和 API 密钥（含 LLM 三通道配置） |
| `http-direct.ts` | HTTP 直连工具，基于 Node.js http/https 模块绕过系统代理（V2rayN） |
| `index.ts` | 模块索引/导出文件 |
| `latex-protect.ts` | LaTeX 保护/修复模块，处理 JSON 中的反斜杠转义问题 |
| `llm.ts` | LLM (大语言模型) 模块，处理 AI 章节分析和思维导图生成 |
| `search-modal.ts` | 搜索模态框组件，实现模糊搜索功能 |
| `settings.ts` | 设置数据模型，定义 `SiliconTranscriberSettings` 接口和默认值 |
| `settings-tab.ts` | 设置界面类，实现 `SiliconTranscriberSettingTab`（6 个分组） |
| `types.ts` | TypeScript 类型定义文件 |
| `utils.ts` | 工具函数集合 |

> **注意**: `.js` 文件是 TypeScript 编译后的产物，不应手动编辑。

## 关键文件说明

### `main.ts`

**插件入口文件**

- 注册 Obsidian 命令
- 初始化插件设置
- 处理用户交互
- 协调各模块工作

### `manifest.json`

**Obsidian 插件清单**

```json
{
  "id": "obsidian-siliconflow-transcriber",
  "name": "SiliconFlow Transcriber",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "使用硅基流动 API 转写音频附件",
  "author": "Me",
  "isDesktopOnly": false
}
```

### `package.json`

**npm 包配置文件**

- 定义项目名称和版本
- 配置构建脚本 (`dev`, `build`)
- 声明开发依赖

### `tsconfig.json`

**TypeScript 编译配置**

- 配置编译选项
- 设置目标模块类型
- 定义类型包含范围

### `esbuild.config.mjs`

**esbuild 构建配置**

- 配置打包入口和出口
- 设置构建模式 (开发/生产)
- 处理外部依赖

### `secrets.json`

**API 密钥配置文件**

- 存储 SiliconFlow API 密钥
- 存储火山引擎 API 密钥
- **重要**: 此文件不应提交到版本控制

### `ffmpeg.exe`

**FFmpeg 可执行文件**

- 用于音频/视频切片
- 支持多种格式转换
- Windows 平台专用

## 构建产物

以下文件是构建过程的产物，不应手动编辑：

| 文件 | 来源 |
|------|------|
| `main.js` | 由 `main.ts` 编译生成 |
| `src/*.js` | 由 `src/*.ts` 编译生成 |

## 配置文件

| 文件 | 用途 |
|------|------|
| `.gitignore` | Git 版本控制忽略规则 |
| `tsconfig.json` | TypeScript 编译器配置 |
| `esbuild.config.mjs` | esbuild 打包工具配置 |
| `package.json` | npm 项目配置 |
| `package-lock.json` | npm 依赖版本锁定 |

## LLM 三通道配置

插件使用三个独立的 LLM 配置通道，各自有独立的 API Key / Base URL / Model 设置，互不干扰：

| 通道 | 配置对象 | 设置字段前缀 | 用途 | 回退链 |
|------|----------|-------------|------|--------|
| 章节分析 | `LLM_PROVIDERS[0]` | `llm*` | 批次分析（batch analysis） | 无（必须配置） |
| 全局校验 | `LLM_GLOBAL_CONFIG` | `globalLlm*` | 全局深度校验与修正 | 无（直接使用设置值，缺省用硬编码默认值） |
| 思维导图 | `LLM_MINDMAP_CONFIG` | `mindmapLlm*` | 思维导图 Markdown 生成 | `mindmapLlm*` → `globalLlm*` → `LLM_PROVIDERS[0]` |

> **回退链说明**：思维导图配置是最灵活的——如果用户未填写思维导图专用设置，则依次回退到全局分析设置，再回退到章节分析设置（`LLM_PROVIDERS[0]`）。这保证了在任何配置状态下思维导图都能正常工作。

## 文档文件

| 文件 | 用途 |
|------|------|
| `README.md` | 项目说明文档，包含使用指南和开发指南 |
| `开发文档.md` | 中文开发文档 |

## 忽略文件

根据 `.gitignore` 配置，以下内容不会被提交到版本控制：

- `node_modules/` - npm 依赖目录
- `*.js` - JavaScript 编译产物 (部分)
- `secrets.json` - API 密钥文件
- 其他临时文件和编辑器配置
