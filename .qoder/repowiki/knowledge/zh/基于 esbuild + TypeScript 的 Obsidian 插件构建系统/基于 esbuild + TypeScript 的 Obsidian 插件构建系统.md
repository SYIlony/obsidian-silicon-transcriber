---
kind: build_system
name: 基于 esbuild + TypeScript 的 Obsidian 插件构建系统
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - esbuild.config.mjs
    - tsconfig.json
    - manifest.json
    - main.ts
    - scripts/test-asr-curl.js
---

## 1. 使用的系统与工具

该项目是一个 Obsidian 桌面端插件，采用 **TypeScript + esbuild** 的轻量级构建方案：
- **TypeScript**（`typescript@^5.9.3`）负责类型检查与源码编译配置。
- **esbuild**（`esbuild@^0.17.3`）作为打包器，将 `main.ts` 入口打包为单文件 `main.js`。
- 通过 `builtin-modules` 自动注入 Node.js 内置模块到外部依赖列表，避免打包进产物。
- 使用 npm scripts 组织开发/生产两种构建流程。

## 2. 关键文件

- `package.json`：定义项目元信息、npm scripts（`dev`、`build`）、依赖声明及 `allowScripts` 白名单。
- `esbuild.config.mjs`：esbuild 构建配置，控制入口、外部依赖、输出格式、sourcemap、tree-shaking 等。
- `tsconfig.json`：TypeScript 编译选项，目标 ES6、CommonJS 模块、严格模式、内联 source map。
- `manifest.json`：Obsidian 插件清单，包含插件 id、名称、版本、最低 App 版本要求。
- `scripts/*.js`：一组独立的测试脚本（ASR 接口、文件系统遍历、Obsidian index 等），通过 Node.js 直接运行，不参与主构建流程。

## 3. 架构与约定

### 构建流水线
- **开发模式**：`npm run dev` → 执行 `node esbuild.config.mjs`，生成带 inline sourcemap 的 `main.js`，便于调试。
- **生产模式**：`npm run build` → 先执行 `tsc -noEmit -skipLibCheck` 进行纯类型检查（不产出 JS），再执行 `node esbuild.config.mjs production` 生成压缩后的 `main.js`（关闭 sourcemap，启用 tree-shaking）。

### 打包策略
- 入口固定为 `main.ts`，输出单一 CJS 文件 `main.js`（Obsidian 插件标准格式）。
- 所有 Obsidian 内部模块（`obsidian`、`electron`、`@codemirror/*`、`@lezer/*`）以及 Node.js 内置模块均标记为 `external`，不打包进产物，由运行时环境提供。
- CSS 资源以 `text` loader 处理，直接内联为字符串。
- 生产构建开启 tree-shaking，开发构建保留 inline sourcemap。

### 版本管理
- 版本号在 `package.json` 和 `manifest.json` 中分别维护（当前均为 `1.0.0`），两者需手动同步。
- `minAppVersion: "0.15.0"` 声明了插件对 Obsidian 客户端的最低版本要求。

### 源文件组织
- `src/` 目录存放 TypeScript 源码（`.ts`）及其对应的 `.js` 编译产物（可能是历史遗留或手动拷贝）。
- 根目录 `main.ts` 是插件入口，同时存在 `main.js` 作为 esbuild 的输出目标。
- `styles.css` 作为样式资源被 esbuild 以 text 形式加载。

## 4. 约定与约束

- **构建命令约定**：开发用 `npm run dev`，发布前用 `npm run build`；后者会先做类型检查再做打包，确保类型安全后再产出产物。
- **外部依赖约定**：所有 Obsidian/Electron/Codemirror/Lezer 相关包必须保持 external，不得打包进插件体积。
- **目标平台**：`target: "es2018"` 配合 `lib: ["DOM", "ES5", "ES6", "ES7"]`，适配 Electron 宿主环境。
- **插件规范**：遵循 Obsidian 插件约定——`manifest.json` 描述元数据，`main.js` 为可执行入口。
- **测试方式**：测试脚本位于 `scripts/` 目录，通过 Node.js 直接执行（如 `node scripts/test-asr-curl.js`），不属于构建产物的一部分。
- **无 CI/自动化发布**：仓库未包含 Makefile、Dockerfile、GitHub Actions 等 CI/CD 配置，发布流程依赖本地 npm scripts 手动执行。
- **二进制依赖**：根目录存在 `ffmpeg.exe`，作为运行时依赖被 ASR 功能调用，不参与构建过程。