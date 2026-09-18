---
kind: dependency_management
name: Obsidian 插件的 npm + esbuild 依赖管理
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - esbuild.config.mjs
    - tsconfig.json
    - main.ts
---

## 1. 使用的系统/方案

本项目是一个 Obsidian 桌面端插件，采用 **npm** 作为包管理器，通过 `package.json` 声明依赖、`package-lock.json`（lockfileVersion 3）锁定版本，并使用 **esbuild** 将 TypeScript 源码打包为单个 CommonJS 产物 `main.js`。构建脚本由根目录的 `esbuild.config.mjs` 驱动。

## 2. 关键文件

- `package.json`：声明项目元信息、脚本命令与 `devDependencies`。
- `package-lock.json`：锁定的依赖树，包含所有间接依赖的版本与 integrity hash。
- `esbuild.config.mjs`：构建配置，定义入口、外部依赖、目标平台等。
- `tsconfig.json`：TypeScript 编译选项（模块解析使用 `node` 策略）。
- `src/*.ts`：业务代码，仅通过相对路径导入本地模块，不直接引入第三方运行时库。
- `manifest.json`：Obsidian 插件清单（运行期由宿主提供 `obsidian`、`electron` 等全局）。