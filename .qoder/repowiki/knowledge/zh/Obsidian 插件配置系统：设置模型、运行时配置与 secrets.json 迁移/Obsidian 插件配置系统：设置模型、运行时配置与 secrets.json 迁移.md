---
kind: configuration_system
name: Obsidian 插件配置系统：设置模型、运行时配置与 secrets.json 迁移
category: configuration_system
scope:
    - '**'
source_files:
    - src/settings.ts
    - src/config.ts
    - src/settings-tab.ts
    - main.ts
    - data.json
    - manifest.json
---

## 1. 使用的系统与框架

该仓库是一个 Obsidian 桌面端插件，其配置系统基于 Obsidian 插件 API 的 `Plugin.loadData` / `saveData` 机制实现。所有用户可持久化的设置以 JSON 形式存储在插件目录下的 `data.json` 文件中；同时通过一个集中式的 TypeScript 模块导出运行时配置对象，供 ASR、LLM、处理参数等子模块消费。

## 2. 关键文件与位置

- `src/settings.ts`：定义 `SiliconTranscriberSettings` 接口与 `DEFAULT_SETTINGS` 默认值，并提供 `maskApiKey` 掩码工具。
- `src/config.ts`：集中导出运行时配置对象（`ASR_CONFIG`、`LLM_PROVIDERS`、`LLM_GLOBAL_CONFIG`、`LLM_MINDMAP_CONFIG`、`LLM_REPORT_CONFIG`、`LLM_REPORT_FALLBACK`、`PROCESSING_CONFIG`），以及两个更新入口函数 `updateConfigs`（从旧版 `secrets.json`）和 `updateConfigsFromSettings`（从当前 settings 对象）。
- `src/settings-tab.ts`：基于 `PluginSettingTab` 构建 Obsidian 设置面板，按分组渲染 ASR、主 LLM、报告 LLM、全局分析 LLM、思维导图 LLM、处理参数、数据迁移等输入项，并在每次修改后调用 `plugin.saveSettings()`。
- `main.ts`：插件主类 `TranscribePlugin`，在 `onload` 中依次执行 `loadSettings` → 可选 `loadSecrets` → `updateConfigsFromSettings` → 注册设置面板；提供 `loadSettings`/`saveSettings`/`loadSecrets` 三个方法。
- `data.json`：Obsidian 持久化存储的用户设置（由 `saveData` 写入）。
- `manifest.json`：插件元信息（id、版本、最小 App 版本等），不承载业务配置。

## 3. 架构与设计约定

### 3.1 三层配置来源与优先级

配置加载顺序为：**默认值 → 持久化 settings (`data.json`) → 运行时覆盖**，其中 settings 优先级最高。

1. **默认层**：`DEFAULT_SETTINGS`（`src/settings.ts`）提供所有字段的初始值，包括 ASR Base URL、模型名、chunkSize=420、batchSize=1 等。
2. **持久化层**：`loadSettings` 使用 `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())` 合并，使未设置的字段保留默认值。
3. **运行时层**：`saveSettings` 在调用 `saveData(this.settings)` 之后立即调用 `updateConfigsFromSettings(this.settings)`，把 settings 中的值同步到模块级运行时配置对象（如 `ASR_CONFIG.API_KEY`、`LLM_PROVIDERS[0].BASE_URL` 等）。因此，任何对 settings 的修改都会实时反映到运行时代码中。

### 3.2 secrets.json 向后兼容迁移

插件保留了旧版 `secrets.json` 格式（包含 `ASR_API_KEY1`、`ASR_API_KEY2`、`LLM_API_KEY` 等键）。`loadSecrets` 会读取 `.obsidian/plugins/<id>/secrets.json`，将其中的非空值覆盖到当前 `settings`，并自动将旧的 `LLM_API_KEY` 回灌到 `reportLlmApiKey` 和 `globalLlmApiKey`（如果它们为空）。迁移成功后调用 `saveSettings` 持久化。

`updateConfigs` 也提供从 secrets 对象直接更新运行时配置的兼容路径，用于历史代码路径。

### 3.3 多 LLM Provider 与三级回退

`config.ts` 定义了多个独立配置对象：
- `LLM_PROVIDERS`：数组形式的 provider 池，索引 0 为主力（Ollama Gateway Volc Pool），索引 1-3 为 ModelScope DeepSeek R1 备用。
- `LLM_GLOBAL_CONFIG`：全局深度校验与修正专用。
- `LLM_MINDMAP_CONFIG`：思维导图专用，支持三级回退链：`mindmapLlmApiKey/BaseURL/Model` → `globalLlm*` → `LLM_PROVIDERS[0]`。
- `LLM_REPORT_CONFIG` / `LLM_REPORT_FALLBACK`：任务报告的主备双通道。

`updateConfigsFromSettings` 在应用设置时，会为每个场景分别赋值，并对 `LLM_MINDMAP_CONFIG` 显式实现 `settings.mindmapLlmXxx || globalLlmXxx || LLM_PROVIDERS[0].Xxx` 的回退逻辑。

### 3.4 设置面板与 UI 约定

`settings-tab.ts` 将设置分为 6 个分组（ASR、AI 章节分析、任务报告、全局分析、思维导图、处理参数、数据迁移），每个分组内统一使用 `addPasswordSetting` 辅助方法创建带“小眼睛”可见性切换的密码输入框，并通过 `onChange` 回调直接修改 `this.plugin.settings` 并调用 `saveSettings()`。数值输入项通过 HTML `min`/`max` 属性限制范围（chunkSize 60–1800，batchSize 1–10），并在后端再次校验。

### 3.5 常量与不可变配置

`PROCESSING_CONFIG`、`SUPPORTED_MEDIA_EXTENSIONS`、`FILE_NAMING` 等以 `as const` 形式导出，作为只读常量被其他模块引用；这些不属于用户可配置项，而是插件行为约束。

## 4. 约定与约束

- **设置持久化位置固定**：所有用户设置统一通过 Obsidian 的 `loadData`/`saveData` 写入插件目录下的 `data.json`，不使用环境变量或外部配置文件。
- **API Key 不硬编码进 settings 默认值**：`DEFAULT_SETTINGS` 中所有 API Key 字段均为空字符串，Key 只能通过手动输入或 `secrets.json` 迁移获得。
- **settings 变更即生效**：`saveSettings` 在写盘后立即调用 `updateConfigsFromSettings`，因此无需重启插件即可刷新运行时配置。
- **LLM 配置必须显式覆盖**：只有当 `settings.llmExtraBody` 非空且解析成功时才替换 `EXTRA_BODY`；空字符串会清空额外请求体，避免发送无意义字段。
- **chunkSize/batchSize 有边界约束**：UI 层用 `min`/`max` 限制，`updateConfigsFromSettings` 再次校验 `chunkSize ∈ [60,1800]`、`batchSize ∈ [1,10]`，超出范围则忽略。
- **思维导图 LLM 允许留空走回退链**：当 `mindmapLlmApiKey/BaseURL/Model` 全为空时，自动复用全局分析配置，再回退到主 LLM。
- **旧版 secrets.json 仍受支持但不再强制**：仅在启动时检测是否存在，不存在则静默跳过；迁移按钮仍可手动触发导入。
- **掩码显示**：设置面板中对已有 API Key 使用 `maskApiKey` 显示占位符（前 4 后 4 + `****`），聚焦输入框时才恢复明文。

## 5. 适用性判断

本仓库是 Obsidian 插件，具备完整的配置加载、持久化、迁移与运行时注入机制，属于典型的轻量级应用配置系统，因此本类别适用。
