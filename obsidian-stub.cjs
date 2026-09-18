// Obsidian API 桩：仅供 Node 环境下加载插件编译模块使用
// 插件的 asr/utils/llm 模块仅将 Notice/TFile/Vault 用作类型标注，运行时不会实例化
class Notice { constructor(message, timeout) { this.message = message; this.timeout = timeout; } hide() {} setMessage(msg) { this.message = msg; } }
class TFile {}
class TFolder { constructor() { this.children = []; } }
class Vault {}
class App {}
class Modal { constructor(app) { this.app = app; this.contentEl = { empty() {}, addClass() {}, createEl() { return null; }, createDiv() { return null; } }; } open() {} close() {} }
class FuzzySuggestModal { constructor(app) { this.app = app; } open() {} close() {} setPlaceholder() {} getItems() { return []; } getItemText() { return ''; } onChooseItem() {} }
module.exports = { Notice, TFile, TFolder, Vault, App, Modal, FuzzySuggestModal };
