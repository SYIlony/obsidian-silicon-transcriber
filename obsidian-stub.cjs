// Obsidian API 桩：仅供 Node 环境下加载插件编译模块使用
// 插件的 asr/utils/llm 模块仅将 Notice/TFile/Vault 用作类型标注，运行时不会实例化
module.exports = { Notice: class Notice {}, TFile: class TFile {}, Vault: class Vault {} };
