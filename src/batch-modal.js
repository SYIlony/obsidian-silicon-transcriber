"use strict";
/**
 * 📋 批量转写选择模态框（文件树版）
 * 以树形结构展示 Vault 中的视频/音频文件，支持展开/折叠、搜索、多选联动
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchTranscribeModal = void 0;
const obsidian_1 = require("obsidian");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
class BatchTranscribeModal extends obsidian_1.Modal {
    constructor(app, onConfirm) {
        super(app);
        this.selectedFiles = new Set();
        this.allMediaFiles = [];
        this.showOnlyUntranscribed = false;
        this.collapsedPaths = new Set();
        this.initialized = false;
        this.onConfirm = onConfirm;
    }
    injectStyles() {
        var _a;
        const style = document.createElement('style');
        style.id = 'batch-transcribe-styles';
        // 如果已存在先移除
        (_a = document.getElementById('batch-transcribe-styles')) === null || _a === void 0 ? void 0 : _a.remove();
        style.textContent = `
.batch-transcribe-modal { width: 700px; max-width: 90vw; }
.batch-transcribe-modal .bt-header h2 { margin: 0 0 4px 0; font-size: 1.3em; }
.batch-transcribe-modal .bt-stats { display: flex; gap: 12px; margin-bottom: 10px; font-size: 0.85em; color: var(--text-muted); }
.batch-transcribe-modal .bt-tag-done { color: var(--color-green); }
.batch-transcribe-modal .bt-tag-pending { color: var(--color-orange); }
.batch-transcribe-modal .bt-toolbar { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.batch-transcribe-modal .bt-search { flex: 1; min-width: 200px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); }
.batch-transcribe-modal .bt-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); cursor: pointer; font-size: 0.85em; white-space: nowrap; }
.batch-transcribe-modal .bt-btn:hover { background: var(--background-modifier-hover); }
.batch-transcribe-modal .bt-btn.is-active { background: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent); }
.batch-transcribe-modal .bt-tree { height: 400px; overflow-y: auto; border: 1px solid var(--background-modifier-border); border-radius: 6px; background: var(--background-secondary); padding: 4px; }
.batch-transcribe-modal .bt-row { display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 4px; cursor: pointer; user-select: none; line-height: 1.8; }
.batch-transcribe-modal .bt-row:hover { background: var(--background-modifier-hover); }
.batch-transcribe-modal .bt-folder-row { font-weight: 600; }
.batch-transcribe-modal .bt-file-row { font-weight: 400; }
.batch-transcribe-modal .bt-file-row.is-selected { background: var(--background-modifier-success-hover); }
.batch-transcribe-modal .bt-arrow { display: inline-block; width: 14px; text-align: center; font-size: 0.7em; color: var(--text-muted); flex-shrink: 0; }
.batch-transcribe-modal .bt-arrow-placeholder { visibility: hidden; }
.batch-transcribe-modal .bt-checkbox { margin: 0; flex-shrink: 0; width: 14px; height: 14px; cursor: pointer; }
.batch-transcribe-modal .bt-icon { font-size: 0.95em; flex-shrink: 0; }
.batch-transcribe-modal .bt-folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.batch-transcribe-modal .bt-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.batch-transcribe-modal .bt-folder-count { font-size: 0.75em; color: var(--text-muted); flex-shrink: 0; }
.batch-transcribe-modal .bt-tag { font-size: 0.8em; flex-shrink: 0; }
.batch-transcribe-modal .bt-file-size { font-size: 0.75em; color: var(--text-faint); flex-shrink: 0; min-width: 50px; text-align: right; }
.batch-transcribe-modal .bt-empty { text-align: center; padding: 30px; color: var(--text-muted); }
.batch-transcribe-modal .bt-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; gap: 8px; }
.batch-transcribe-modal .bt-count { color: var(--text-muted); font-size: 0.9em; }
        `;
        document.head.appendChild(style);
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('batch-transcribe-modal');
        // ── 注入内联样式 ──
        this.injectStyles();
        // ── 标题 ──
        const header = contentEl.createDiv({ cls: 'bt-header' });
        header.createEl('h2', { text: '📋 批量智能转写' });
        this.allMediaFiles = this.collectMediaFiles();
        const transcribed = this.allMediaFiles.filter(f => this.isAlreadyTranscribed(f)).length;
        // ── 统计 ──
        const stats = contentEl.createDiv({ cls: 'bt-stats' });
        stats.createEl('span', { text: `共 ${this.allMediaFiles.length} 个` });
        stats.createEl('span', { text: `已转写 ${transcribed}`, cls: 'bt-tag-done' });
        stats.createEl('span', { text: `未转写 ${this.allMediaFiles.length - transcribed}`, cls: 'bt-tag-pending' });
        // ── 工具栏 ──
        const toolbar = contentEl.createDiv({ cls: 'bt-toolbar' });
        this.filterInput = toolbar.createEl('input', {
            type: 'text',
            placeholder: '🔍 搜索文件名或路径…',
            cls: 'bt-search'
        });
        this.filterInput.oninput = () => {
            // 输入搜索时自动展开一次，之后用户可自由折叠
            if (this.filterInput.value.trim()) {
                this.collapsedPaths.clear();
            }
            this.renderTree();
        };
        const btnUntranscribed = toolbar.createEl('button', {
            text: '仅未转写',
            cls: 'bt-btn'
        });
        btnUntranscribed.onclick = () => {
            this.showOnlyUntranscribed = !this.showOnlyUntranscribed;
            btnUntranscribed.classList.toggle('is-active', this.showOnlyUntranscribed);
            btnUntranscribed.textContent = this.showOnlyUntranscribed ? '✅ 显示全部' : '仅未转写';
            // 切换到"仅未转写"时自动展开所有目录
            if (this.showOnlyUntranscribed) {
                this.collapsedPaths.clear();
            }
            this.renderTree();
        };
        const btnExpandAll = toolbar.createEl('button', { text: '全部展开', cls: 'bt-btn' });
        btnExpandAll.onclick = () => { this.collapsedPaths.clear(); this.renderTree(); };
        const btnCollapseAll = toolbar.createEl('button', { text: '全部折叠', cls: 'bt-btn' });
        btnCollapseAll.onclick = () => {
            // 收集所有文件夹路径
            const root = this.buildTree(this.allMediaFiles);
            this.collectFolderPaths(root).forEach(p => this.collapsedPaths.add(p));
            this.renderTree();
        };
        const btnSelectAll = toolbar.createEl('button', { text: '全选', cls: 'bt-btn' });
        btnSelectAll.onclick = () => {
            const visible = this.getVisibleFiles();
            if (this.selectedFiles.size === visible.length) {
                visible.forEach(f => this.selectedFiles.delete(f));
                btnSelectAll.textContent = '全选';
            }
            else {
                visible.forEach(f => this.selectedFiles.add(f));
                btnSelectAll.textContent = '取消全选';
            }
            this.renderTree();
        };
        // ── 树容器 ──
        this.treeContainer = contentEl.createDiv({ cls: 'bt-tree' });
        // ── 底部 ──
        const footer = contentEl.createDiv({ cls: 'bt-footer' });
        const countEl = footer.createEl('span', { cls: 'bt-count', text: '已选择 0 个' });
        this.startBtn = footer.createEl('button', {
            text: '🚀 开始批量转写',
            cls: 'mod-cta'
        });
        this.startBtn.disabled = true;
        this.startBtn.onclick = () => {
            if (this.selectedFiles.size === 0) {
                new obsidian_1.Notice('请至少选择一个文件');
                return;
            }
            this.onConfirm(Array.from(this.selectedFiles));
            this.close();
        };
        const cancelBtn = footer.createEl('button', { text: '取消' });
        cancelBtn.onclick = () => this.close();
        // 定时刷新计数
        this._btInterval = setInterval(() => {
            countEl.textContent = `已选择 ${this.selectedFiles.size} 个`;
        }, 150);
        // 首次加载：默认折叠所有非根目录
        if (!this.initialized) {
            this.initialized = true;
            const root = this.buildTree(this.allMediaFiles);
            this.collectFolderPaths(root).forEach(p => this.collapsedPaths.add(p));
        }
        this.renderTree();
    }
    onClose() {
        var _a;
        this.contentEl.empty();
        clearInterval(this._btInterval);
        (_a = document.getElementById('batch-transcribe-styles')) === null || _a === void 0 ? void 0 : _a.remove();
    }
    // ════════════════════════════════════════════════════
    // 数据收集
    // ════════════════════════════════════════════════════
    collectMediaFiles() {
        // 使用 fs 遍历文件系统，能正确跟随符号链接和 Junction
        const adapter = this.app.vault.adapter;
        if (!(adapter === null || adapter === void 0 ? void 0 : adapter.getBasePath)) {
            return this.collectViaObsidian();
        }
        const basePath = adapter.getBasePath();
        const mediaExts = ['mp4', 'mp3', 'wav', 'm4a', 'mov'];
        const results = [];
        const seen = new Set();
        const walkDir = (dirPath, relativePath) => {
            var _a;
            let entries;
            try {
                entries = fs.readdirSync(dirPath, { withFileTypes: true });
            }
            catch (_b) {
                return;
            }
            for (const entry of entries) {
                if (entry.name.startsWith('.'))
                    continue;
                const fullChildPath = path.join(dirPath, entry.name);
                const relChildPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
                if (entry.isDirectory() || entry.isSymbolicLink()) {
                    let isDir = entry.isDirectory();
                    if (entry.isSymbolicLink()) {
                        try {
                            isDir = fs.statSync(fullChildPath).isDirectory();
                        }
                        catch (_c) {
                            continue;
                        }
                    }
                    if (isDir)
                        walkDir(fullChildPath, relChildPath);
                }
                else if (entry.isFile()) {
                    const ext = ((_a = entry.name.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                    if (!mediaExts.includes(ext) || seen.has(relChildPath))
                        continue;
                    seen.add(relChildPath);
                    // 优先用 Obsidian 已索引的 TFile
                    const tfile = this.app.vault.getAbstractFileByPath(relChildPath);
                    if (tfile instanceof obsidian_1.TFile) {
                        results.push(tfile);
                    }
                    else {
                        // Obsidian 未索引（常见于符号链接目录），创建代理 TFile
                        let stat;
                        try {
                            stat = fs.statSync(fullChildPath);
                        }
                        catch (_d) {
                            stat = { size: 0 };
                        }
                        const proxy = Object.create(obsidian_1.TFile.prototype);
                        proxy.path = relChildPath;
                        proxy.name = entry.name;
                        proxy.basename = entry.name.replace(/\.[^.]+$/, '');
                        proxy.extension = ext;
                        proxy.stat = { size: stat.size, mtime: Date.now(), ctime: Date.now() };
                        proxy.vault = this.app.vault;
                        proxy.parent = this.getFolderProxy(relativePath, this.app);
                        results.push(proxy);
                    }
                }
            }
        };
        walkDir(basePath, '');
        if (results.length === 0)
            return this.collectViaObsidian();
        return results.sort((a, b) => a.path.localeCompare(b.path));
    }
    /** 回退：使用 Obsidian vault.getFiles() */
    collectViaObsidian() {
        return this.app.vault.getFiles()
            .filter(f => (0, utils_1.isSupportedMediaExtension)(f.extension) && !f.path.includes('.obsidian/plugins/'))
            .sort((a, b) => a.path.localeCompare(b.path));
    }
    /** 获取或创建文件夹代理对象 */
    getFolderProxy(folderPath, app) {
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof obsidian_1.TFolder)
            return folder;
        const proxy = Object.create(obsidian_1.TFolder.prototype);
        proxy.path = folderPath;
        proxy.name = folderPath.split('/').pop() || folderPath;
        proxy.parent = null;
        proxy.vault = app.vault;
        return proxy;
    }
    isAlreadyTranscribed(file) {
        var _a, _b;
        const dir = ((_a = file.parent) === null || _a === void 0 ? void 0 : _a.path) === '/' ? '' : ((_b = file.parent) === null || _b === void 0 ? void 0 : _b.path) || '';
        const { notePath } = (0, utils_1.calculateNotePaths)(dir, file.basename);
        return this.app.vault.getAbstractFileByPath(notePath) instanceof obsidian_1.TFile;
    }
    // ════════════════════════════════════════════════════
    // 树构建
    // ════════════════════════════════════════════════════
    buildTree(files) {
        const root = {
            name: '', path: '', isFolder: true,
            children: new Map(), allFiles: []
        };
        for (const file of files) {
            const parts = file.path.split('/');
            let current = root;
            let currentPath = '';
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                const isLast = i === parts.length - 1;
                if (isLast) {
                    // 文件节点
                    const fileNode = {
                        name: part, path: file.path, isFolder: false,
                        file, children: new Map(), allFiles: [file]
                    };
                    current.children.set(part, fileNode);
                    current.allFiles.push(file);
                }
                else {
                    // 文件夹节点
                    if (!current.children.has(part)) {
                        const folderNode = {
                            name: part, path: currentPath, isFolder: true,
                            children: new Map(), allFiles: []
                        };
                        current.children.set(part, folderNode);
                    }
                    current = current.children.get(part);
                    current.allFiles.push(file);
                }
            }
        }
        // 递归收集 allFiles（已在上面 push 了，但中间节点也需要）
        this.finalizeAllFiles(root);
        return root;
    }
    /** 递归确保 allFiles 正确 */
    finalizeAllFiles(node) {
        if (!node.isFolder)
            return node.allFiles;
        const collected = [];
        for (const child of node.children.values()) {
            collected.push(...this.finalizeAllFiles(child));
        }
        node.allFiles = collected;
        return collected;
    }
    collectFolderPaths(node) {
        const paths = [];
        if (node.isFolder && node.path) {
            paths.push(node.path);
        }
        for (const child of node.children.values()) {
            paths.push(...this.collectFolderPaths(child));
        }
        return paths;
    }
    // ════════════════════════════════════════════════════
    // 树渲染
    // ════════════════════════════════════════════════════
    renderTree() {
        this.treeContainer.empty();
        const filterText = this.filterInput.value.toLowerCase().trim();
        let files = this.allMediaFiles;
        if (this.showOnlyUntranscribed) {
            files = files.filter(f => !this.isAlreadyTranscribed(f));
        }
        if (filterText) {
            files = files.filter(f => f.path.toLowerCase().includes(filterText) ||
                f.basename.toLowerCase().includes(filterText));
        }
        if (files.length === 0) {
            this.treeContainer.createEl('div', {
                text: '📭 没有匹配的文件', cls: 'bt-empty'
            });
            this.updateStartBtn();
            return;
        }
        const collapsed = this.collapsedPaths;
        const tree = this.buildTree(files);
        // 过滤掉只有空子文件夹的节点
        const pruned = this.pruneEmptyFolders(tree);
        if (pruned) {
            this.renderNode(tree, this.treeContainer, 0, collapsed);
        }
        this.updateStartBtn();
    }
    pruneEmptyFolders(node) {
        if (!node.isFolder)
            return true;
        const toDelete = [];
        for (const [name, child] of node.children) {
            if (!this.pruneEmptyFolders(child)) {
                toDelete.push(name);
            }
        }
        toDelete.forEach(n => node.children.delete(n));
        return node.children.size > 0 || !node.isFolder;
    }
    renderNode(node, container, depth, collapsed) {
        const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
            // 文件夹在前
            if (a.isFolder !== b.isFolder)
                return a.isFolder ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        for (const child of sortedChildren) {
            if (child.isFolder) {
                this.renderFolderNode(child, container, depth, collapsed);
            }
            else {
                this.renderFileNode(child, container, depth);
            }
        }
    }
    renderFolderNode(node, container, depth, collapsed) {
        const isCollapsed = collapsed.has(node.path);
        const folderFiles = node.allFiles;
        const selectedCount = folderFiles.filter(f => this.selectedFiles.has(f)).length;
        const allSelected = selectedCount === folderFiles.length;
        const someSelected = selectedCount > 0 && !allSelected;
        const row = container.createDiv({ cls: 'bt-row bt-folder-row' });
        row.style.paddingLeft = `${depth * 20 + 8}px`;
        // 展开/折叠箭头
        const arrow = row.createEl('span', { cls: 'bt-arrow' });
        arrow.textContent = isCollapsed ? '▶' : '▼';
        // 复选框
        const cb = row.createEl('input', { type: 'checkbox', cls: 'bt-checkbox' });
        cb.checked = allSelected;
        cb.indeterminate = someSelected;
        cb.onclick = (e) => e.stopPropagation();
        cb.onchange = () => {
            if (cb.checked) {
                folderFiles.forEach(f => this.selectedFiles.add(f));
            }
            else {
                folderFiles.forEach(f => this.selectedFiles.delete(f));
            }
            this.renderTree();
        };
        // 文件夹名
        row.createEl('span', { text: '📁', cls: 'bt-icon' });
        row.createEl('span', { text: node.name, cls: 'bt-folder-name' });
        // 文件计数
        row.createEl('span', {
            text: `${selectedCount}/${folderFiles.length}`,
            cls: 'bt-folder-count'
        });
        // 点击切换折叠
        row.onclick = (e) => {
            // 不要在点 checkbox 时触发折叠
            if (e.target.tagName === 'INPUT')
                return;
            if (isCollapsed) {
                collapsed.delete(node.path);
            }
            else {
                collapsed.add(node.path);
            }
            this.renderTree();
        };
        // 子节点
        if (!isCollapsed) {
            this.renderNode(node, container, depth + 1, collapsed);
        }
    }
    renderFileNode(node, container, depth) {
        const file = node.file;
        const isTranscribed = this.isAlreadyTranscribed(file);
        const isSelected = this.selectedFiles.has(file);
        const row = container.createDiv({ cls: 'bt-row bt-file-row' });
        if (isSelected)
            row.addClass('is-selected');
        if (isTranscribed)
            row.addClass('is-transcribed');
        row.style.paddingLeft = `${depth * 20 + 8}px`;
        // 占位箭头（保持对齐）
        row.createEl('span', { cls: 'bt-arrow bt-arrow-placeholder' });
        // 复选框
        const cb = row.createEl('input', { type: 'checkbox', cls: 'bt-checkbox' });
        cb.checked = isSelected;
        cb.onclick = (e) => e.stopPropagation();
        cb.onchange = () => {
            if (cb.checked) {
                this.selectedFiles.add(file);
                row.addClass('is-selected');
            }
            else {
                this.selectedFiles.delete(file);
                row.removeClass('is-selected');
            }
            this.updateStartBtn();
            // 同步更新父文件夹的状态（重新渲染）
            this.renderTree();
        };
        // 文件图标
        row.createEl('span', { text: '🎬', cls: 'bt-icon' });
        // 文件名
        row.createEl('span', { text: file.name, cls: 'bt-file-name' });
        // 状态标签
        if (isTranscribed) {
            row.createEl('span', { text: '✅', cls: 'bt-tag', title: '已转写' });
        }
        else {
            row.createEl('span', { text: '⏳', cls: 'bt-tag', title: '未转写' });
        }
        // 文件大小
        const sizeKB = file.stat.size / 1024;
        let sizeStr;
        if (sizeKB > 1024 * 1024)
            sizeStr = `${(sizeKB / 1024 / 1024).toFixed(1)} GB`;
        else if (sizeKB > 1024)
            sizeStr = `${(sizeKB / 1024).toFixed(0)} MB`;
        else
            sizeStr = `${sizeKB.toFixed(0)} KB`;
        row.createEl('span', { text: sizeStr, cls: 'bt-file-size' });
        // 整行点击切换
        row.onclick = () => {
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        };
    }
    // ════════════════════════════════════════════════════
    // 辅助
    // ════════════════════════════════════════════════════
    getVisibleFiles() {
        const filterText = this.filterInput.value.toLowerCase().trim();
        let files = this.allMediaFiles;
        if (this.showOnlyUntranscribed) {
            files = files.filter(f => !this.isAlreadyTranscribed(f));
        }
        if (filterText) {
            files = files.filter(f => f.path.toLowerCase().includes(filterText) ||
                f.basename.toLowerCase().includes(filterText));
        }
        return files;
    }
    updateStartBtn() {
        this.startBtn.disabled = this.selectedFiles.size === 0;
        this.startBtn.textContent = this.selectedFiles.size > 0
            ? `🚀 开始批量转写 (${this.selectedFiles.size} 个)`
            : '🚀 开始批量转写';
    }
}
exports.BatchTranscribeModal = BatchTranscribeModal;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmF0Y2gtbW9kYWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJiYXRjaC1tb2RhbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCx1Q0FBOEQ7QUFDOUQsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3QixtQ0FBd0U7QUFZeEUsTUFBYSxvQkFBcUIsU0FBUSxnQkFBSztJQVczQyxZQUFZLEdBQVEsRUFBRSxTQUFtQztRQUNyRCxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFYUCxrQkFBYSxHQUFlLElBQUksR0FBRyxFQUFFLENBQUM7UUFDdEMsa0JBQWEsR0FBWSxFQUFFLENBQUM7UUFLNUIsMEJBQXFCLEdBQUcsS0FBSyxDQUFDO1FBQzlCLG1CQUFjLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEMsZ0JBQVcsR0FBRyxLQUFLLENBQUM7UUFJeEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDL0IsQ0FBQztJQUVPLFlBQVk7O1FBQ2hCLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDOUMsS0FBSyxDQUFDLEVBQUUsR0FBRyx5QkFBeUIsQ0FBQztRQUNyQyxXQUFXO1FBQ1gsTUFBQSxRQUFRLENBQUMsY0FBYyxDQUFDLHlCQUF5QixDQUFDLDBDQUFFLE1BQU0sRUFBRSxDQUFDO1FBQzdELEtBQUssQ0FBQyxXQUFXLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBNkJuQixDQUFDO1FBQ0YsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELE1BQU07UUFDRixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNsQixTQUFTLENBQUMsUUFB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QUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBRU8sY0FBYztRQUNsQixJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEdBQUcsQ0FBQztZQUNuRCxDQUFDLENBQUMsY0FBYyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSztZQUM1QyxDQUFDLENBQUMsV0FBVyxDQUFDO0lBQ3RCLENBQUM7Q0FFSjtBQXJqQkQsb0RBcWpCQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiDwn5OLIOaJuemHj+i9rOWGmemAieaLqeaooeaAgeahhu+8iOaWh+S7tuagkeeJiO+8iVxyXG4gKiDku6XmoJHlvaLnu5PmnoTlsZXnpLogVmF1bHQg5Lit55qE6KeG6aKRL+mfs+mikeaWh+S7tu+8jOaUr+aMgeWxleW8gC/mipjlj6DjgIHmkJzntKLjgIHlpJrpgInogZTliqhcclxuICovXHJcblxyXG5pbXBvcnQgeyBBcHAsIE1vZGFsLCBURmlsZSwgVEZvbGRlciwgTm90aWNlIH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcbmltcG9ydCB7IGlzU3VwcG9ydGVkTWVkaWFFeHRlbnNpb24sIGNhbGN1bGF0ZU5vdGVQYXRocyB9IGZyb20gJy4vdXRpbHMnO1xyXG5cclxuaW50ZXJmYWNlIFRyZWVOb2RlIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGlzRm9sZGVyOiBib29sZWFuO1xyXG4gICAgZmlsZT86IFRGaWxlO1xyXG4gICAgY2hpbGRyZW46IE1hcDxzdHJpbmcsIFRyZWVOb2RlPjtcclxuICAgIC8qKiDor6Xmlofku7blpLnkuIvmiYDmnInlqpLkvZPmlofku7bvvIjpgJLlvZLvvIkgKi9cclxuICAgIGFsbEZpbGVzOiBURmlsZVtdO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQmF0Y2hUcmFuc2NyaWJlTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgICBwcml2YXRlIHNlbGVjdGVkRmlsZXM6IFNldDxURmlsZT4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIGFsbE1lZGlhRmlsZXM6IFRGaWxlW10gPSBbXTtcclxuICAgIHByaXZhdGUgZmlsdGVySW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRyZWVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBzdGFydEJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIG9uQ29uZmlybTogKGZpbGVzOiBURmlsZVtdKSA9PiB2b2lkO1xyXG4gICAgcHJpdmF0ZSBzaG93T25seVVudHJhbnNjcmliZWQgPSBmYWxzZTtcclxuICAgIHByaXZhdGUgY29sbGFwc2VkUGF0aHM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gICAgcHJpdmF0ZSBpbml0aWFsaXplZCA9IGZhbHNlO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBvbkNvbmZpcm06IChmaWxlczogVEZpbGVbXSkgPT4gdm9pZCkge1xyXG4gICAgICAgIHN1cGVyKGFwcCk7XHJcbiAgICAgICAgdGhpcy5vbkNvbmZpcm0gPSBvbkNvbmZpcm07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbmplY3RTdHlsZXMoKSB7XHJcbiAgICAgICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xyXG4gICAgICAgIHN0eWxlLmlkID0gJ2JhdGNoLXRyYW5zY3JpYmUtc3R5bGVzJztcclxuICAgICAgICAvLyDlpoLmnpzlt7LlrZjlnKjlhYjnp7vpmaRcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYmF0Y2gtdHJhbnNjcmliZS1zdHlsZXMnKT8ucmVtb3ZlKCk7XHJcbiAgICAgICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIHsgd2lkdGg6IDcwMHB4OyBtYXgtd2lkdGg6IDkwdnc7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LWhlYWRlciBoMiB7IG1hcmdpbjogMCAwIDRweCAwOyBmb250LXNpemU6IDEuM2VtOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1zdGF0cyB7IGRpc3BsYXk6IGZsZXg7IGdhcDogMTJweDsgbWFyZ2luLWJvdHRvbTogMTBweDsgZm9udC1zaXplOiAwLjg1ZW07IGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsgfVxyXG4uYmF0Y2gtdHJhbnNjcmliZS1tb2RhbCAuYnQtdGFnLWRvbmUgeyBjb2xvcjogdmFyKC0tY29sb3ItZ3JlZW4pOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC10YWctcGVuZGluZyB7IGNvbG9yOiB2YXIoLS1jb2xvci1vcmFuZ2UpOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC10b29sYmFyIHsgZGlzcGxheTogZmxleDsgZ2FwOiA2cHg7IG1hcmdpbi1ib3R0b206IDhweDsgZmxleC13cmFwOiB3cmFwOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1zZWFyY2ggeyBmbGV4OiAxOyBtaW4td2lkdGg6IDIwMHB4OyBwYWRkaW5nOiA0cHggOHB4OyBib3JkZXItcmFkaXVzOiA0cHg7IGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyKTsgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnkpOyBjb2xvcjogdmFyKC0tdGV4dC1ub3JtYWwpOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1idG4geyBwYWRkaW5nOiA0cHggMTBweDsgYm9yZGVyLXJhZGl1czogNHB4OyBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KTsgY29sb3I6IHZhcigtLXRleHQtbm9ybWFsKTsgY3Vyc29yOiBwb2ludGVyOyBmb250LXNpemU6IDAuODVlbTsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgfVxyXG4uYmF0Y2gtdHJhbnNjcmliZS1tb2RhbCAuYnQtYnRuOmhvdmVyIHsgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ob3Zlcik7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LWJ0bi5pcy1hY3RpdmUgeyBiYWNrZ3JvdW5kOiB2YXIoLS1pbnRlcmFjdGl2ZS1hY2NlbnQpOyBjb2xvcjogdmFyKC0tdGV4dC1vbi1hY2NlbnQpOyBib3JkZXItY29sb3I6IHZhcigtLWludGVyYWN0aXZlLWFjY2VudCk7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LXRyZWUgeyBoZWlnaHQ6IDQwMHB4OyBvdmVyZmxvdy15OiBhdXRvOyBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7IGJvcmRlci1yYWRpdXM6IDZweDsgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnkpOyBwYWRkaW5nOiA0cHg7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LXJvdyB7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGdhcDogNnB4OyBwYWRkaW5nOiAzcHggOHB4OyBib3JkZXItcmFkaXVzOiA0cHg7IGN1cnNvcjogcG9pbnRlcjsgdXNlci1zZWxlY3Q6IG5vbmU7IGxpbmUtaGVpZ2h0OiAxLjg7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LXJvdzpob3ZlciB7IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItaG92ZXIpOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1mb2xkZXItcm93IHsgZm9udC13ZWlnaHQ6IDYwMDsgfVxyXG4uYmF0Y2gtdHJhbnNjcmliZS1tb2RhbCAuYnQtZmlsZS1yb3cgeyBmb250LXdlaWdodDogNDAwOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1maWxlLXJvdy5pcy1zZWxlY3RlZCB7IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItc3VjY2Vzcy1ob3Zlcik7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LWFycm93IHsgZGlzcGxheTogaW5saW5lLWJsb2NrOyB3aWR0aDogMTRweDsgdGV4dC1hbGlnbjogY2VudGVyOyBmb250LXNpemU6IDAuN2VtOyBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7IGZsZXgtc2hyaW5rOiAwOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1hcnJvdy1wbGFjZWhvbGRlciB7IHZpc2liaWxpdHk6IGhpZGRlbjsgfVxyXG4uYmF0Y2gtdHJhbnNjcmliZS1tb2RhbCAuYnQtY2hlY2tib3ggeyBtYXJnaW46IDA7IGZsZXgtc2hyaW5rOiAwOyB3aWR0aDogMTRweDsgaGVpZ2h0OiAxNHB4OyBjdXJzb3I6IHBvaW50ZXI7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LWljb24geyBmb250LXNpemU6IDAuOTVlbTsgZmxleC1zaHJpbms6IDA7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LWZvbGRlci1uYW1lIHsgZmxleDogMTsgb3ZlcmZsb3c6IGhpZGRlbjsgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7IHdoaXRlLXNwYWNlOiBub3dyYXA7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LWZpbGUtbmFtZSB7IGZsZXg6IDE7IG92ZXJmbG93OiBoaWRkZW47IHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzOyB3aGl0ZS1zcGFjZTogbm93cmFwOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1mb2xkZXItY291bnQgeyBmb250LXNpemU6IDAuNzVlbTsgY29sb3I6IHZhcigtLXRleHQtbXV0ZWQpOyBmbGV4LXNocmluazogMDsgfVxyXG4uYmF0Y2gtdHJhbnNjcmliZS1tb2RhbCAuYnQtdGFnIHsgZm9udC1zaXplOiAwLjhlbTsgZmxleC1zaHJpbms6IDA7IH1cclxuLmJhdGNoLXRyYW5zY3JpYmUtbW9kYWwgLmJ0LWZpbGUtc2l6ZSB7IGZvbnQtc2l6ZTogMC43NWVtOyBjb2xvcjogdmFyKC0tdGV4dC1mYWludCk7IGZsZXgtc2hyaW5rOiAwOyBtaW4td2lkdGg6IDUwcHg7IHRleHQtYWxpZ246IHJpZ2h0OyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1lbXB0eSB7IHRleHQtYWxpZ246IGNlbnRlcjsgcGFkZGluZzogMzBweDsgY29sb3I6IHZhcigtLXRleHQtbXV0ZWQpOyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1mb290ZXIgeyBkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGFsaWduLWl0ZW1zOiBjZW50ZXI7IG1hcmdpbi10b3A6IDEwcHg7IGdhcDogOHB4OyB9XHJcbi5iYXRjaC10cmFuc2NyaWJlLW1vZGFsIC5idC1jb3VudCB7IGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTsgZm9udC1zaXplOiAwLjllbTsgfVxyXG4gICAgICAgIGA7XHJcbiAgICAgICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgb25PcGVuKCkge1xyXG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gICAgICAgIGNvbnRlbnRFbC5hZGRDbGFzcygnYmF0Y2gtdHJhbnNjcmliZS1tb2RhbCcpO1xyXG5cclxuICAgICAgICAvLyDilIDilIAg5rOo5YWl5YaF6IGU5qC35byPIOKUgOKUgFxyXG4gICAgICAgIHRoaXMuaW5qZWN0U3R5bGVzKCk7XHJcblxyXG4gICAgICAgIC8vIOKUgOKUgCDmoIfpopgg4pSA4pSAXHJcbiAgICAgICAgY29uc3QgaGVhZGVyID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogJ2J0LWhlYWRlcicgfSk7XHJcbiAgICAgICAgaGVhZGVyLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ/Cfk4sg5om56YeP5pm66IO96L2s5YaZJyB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5hbGxNZWRpYUZpbGVzID0gdGhpcy5jb2xsZWN0TWVkaWFGaWxlcygpO1xyXG4gICAgICAgIGNvbnN0IHRyYW5zY3JpYmVkID0gdGhpcy5hbGxNZWRpYUZpbGVzLmZpbHRlcihmID0+IHRoaXMuaXNBbHJlYWR5VHJhbnNjcmliZWQoZikpLmxlbmd0aDtcclxuXHJcbiAgICAgICAgLy8g4pSA4pSAIOe7n+iuoSDilIDilIBcclxuICAgICAgICBjb25zdCBzdGF0cyA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICdidC1zdGF0cycgfSk7XHJcbiAgICAgICAgc3RhdHMuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6IGDlhbEgJHt0aGlzLmFsbE1lZGlhRmlsZXMubGVuZ3RofSDkuKpgIH0pO1xyXG4gICAgICAgIHN0YXRzLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiBg5bey6L2s5YaZICR7dHJhbnNjcmliZWR9YCwgY2xzOiAnYnQtdGFnLWRvbmUnIH0pO1xyXG4gICAgICAgIHN0YXRzLmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiBg5pyq6L2s5YaZICR7dGhpcy5hbGxNZWRpYUZpbGVzLmxlbmd0aCAtIHRyYW5zY3JpYmVkfWAsIGNsczogJ2J0LXRhZy1wZW5kaW5nJyB9KTtcclxuXHJcbiAgICAgICAgLy8g4pSA4pSAIOW3peWFt+agjyDilIDilIBcclxuICAgICAgICBjb25zdCB0b29sYmFyID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogJ2J0LXRvb2xiYXInIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmZpbHRlcklucHV0ID0gdG9vbGJhci5jcmVhdGVFbCgnaW5wdXQnLCB7XHJcbiAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcclxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICfwn5SNIOaQnOe0ouaWh+S7tuWQjeaIlui3r+W+hOKApicsXHJcbiAgICAgICAgICAgIGNsczogJ2J0LXNlYXJjaCdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmZpbHRlcklucHV0Lm9uaW5wdXQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIC8vIOi+k+WFpeaQnOe0ouaXtuiHquWKqOWxleW8gOS4gOasoe+8jOS5i+WQjueUqOaIt+WPr+iHqueUseaKmOWPoFxyXG4gICAgICAgICAgICBpZiAodGhpcy5maWx0ZXJJbnB1dC52YWx1ZS50cmltKCkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGFwc2VkUGF0aHMuY2xlYXIoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnJlbmRlclRyZWUoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBidG5VbnRyYW5zY3JpYmVkID0gdG9vbGJhci5jcmVhdGVFbCgnYnV0dG9uJywge1xyXG4gICAgICAgICAgICB0ZXh0OiAn5LuF5pyq6L2s5YaZJyxcclxuICAgICAgICAgICAgY2xzOiAnYnQtYnRuJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGJ0blVudHJhbnNjcmliZWQub25jbGljayA9ICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zaG93T25seVVudHJhbnNjcmliZWQgPSAhdGhpcy5zaG93T25seVVudHJhbnNjcmliZWQ7XHJcbiAgICAgICAgICAgIGJ0blVudHJhbnNjcmliZWQuY2xhc3NMaXN0LnRvZ2dsZSgnaXMtYWN0aXZlJywgdGhpcy5zaG93T25seVVudHJhbnNjcmliZWQpO1xyXG4gICAgICAgICAgICBidG5VbnRyYW5zY3JpYmVkLnRleHRDb250ZW50ID0gdGhpcy5zaG93T25seVVudHJhbnNjcmliZWQgPyAn4pyFIOaYvuekuuWFqOmDqCcgOiAn5LuF5pyq6L2s5YaZJztcclxuICAgICAgICAgICAgLy8g5YiH5o2i5YiwXCLku4XmnKrovazlhplcIuaXtuiHquWKqOWxleW8gOaJgOacieebruW9lVxyXG4gICAgICAgICAgICBpZiAodGhpcy5zaG93T25seVVudHJhbnNjcmliZWQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGFwc2VkUGF0aHMuY2xlYXIoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnJlbmRlclRyZWUoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBidG5FeHBhbmRBbGwgPSB0b29sYmFyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICflhajpg6jlsZXlvIAnLCBjbHM6ICdidC1idG4nIH0pO1xyXG4gICAgICAgIGJ0bkV4cGFuZEFsbC5vbmNsaWNrID0gKCkgPT4geyB0aGlzLmNvbGxhcHNlZFBhdGhzLmNsZWFyKCk7IHRoaXMucmVuZGVyVHJlZSgpOyB9O1xyXG5cclxuICAgICAgICBjb25zdCBidG5Db2xsYXBzZUFsbCA9IHRvb2xiYXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ+WFqOmDqOaKmOWPoCcsIGNsczogJ2J0LWJ0bicgfSk7XHJcbiAgICAgICAgYnRuQ29sbGFwc2VBbGwub25jbGljayA9ICgpID0+IHtcclxuICAgICAgICAgICAgLy8g5pS26ZuG5omA5pyJ5paH5Lu25aS56Lev5b6EXHJcbiAgICAgICAgICAgIGNvbnN0IHJvb3QgPSB0aGlzLmJ1aWxkVHJlZSh0aGlzLmFsbE1lZGlhRmlsZXMpO1xyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RGb2xkZXJQYXRocyhyb290KS5mb3JFYWNoKHAgPT4gdGhpcy5jb2xsYXBzZWRQYXRocy5hZGQocCkpO1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlclRyZWUoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBidG5TZWxlY3RBbGwgPSB0b29sYmFyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICflhajpgIknLCBjbHM6ICdidC1idG4nIH0pO1xyXG4gICAgICAgIGJ0blNlbGVjdEFsbC5vbmNsaWNrID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB2aXNpYmxlID0gdGhpcy5nZXRWaXNpYmxlRmlsZXMoKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc2VsZWN0ZWRGaWxlcy5zaXplID09PSB2aXNpYmxlLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgdmlzaWJsZS5mb3JFYWNoKGYgPT4gdGhpcy5zZWxlY3RlZEZpbGVzLmRlbGV0ZShmKSk7XHJcbiAgICAgICAgICAgICAgICBidG5TZWxlY3RBbGwudGV4dENvbnRlbnQgPSAn5YWo6YCJJztcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHZpc2libGUuZm9yRWFjaChmID0+IHRoaXMuc2VsZWN0ZWRGaWxlcy5hZGQoZikpO1xyXG4gICAgICAgICAgICAgICAgYnRuU2VsZWN0QWxsLnRleHRDb250ZW50ID0gJ+WPlua2iOWFqOmAiSc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJUcmVlKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8g4pSA4pSAIOagkeWuueWZqCDilIDilIBcclxuICAgICAgICB0aGlzLnRyZWVDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiAnYnQtdHJlZScgfSk7XHJcblxyXG4gICAgICAgIC8vIOKUgOKUgCDlupXpg6gg4pSA4pSAXHJcbiAgICAgICAgY29uc3QgZm9vdGVyID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogJ2J0LWZvb3RlcicgfSk7XHJcbiAgICAgICAgY29uc3QgY291bnRFbCA9IGZvb3Rlci5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAnYnQtY291bnQnLCB0ZXh0OiAn5bey6YCJ5oupIDAg5LiqJyB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5zdGFydEJ0biA9IGZvb3Rlci5jcmVhdGVFbCgnYnV0dG9uJywge1xyXG4gICAgICAgICAgICB0ZXh0OiAn8J+agCDlvIDlp4vmibnph4/ovazlhpknLFxyXG4gICAgICAgICAgICBjbHM6ICdtb2QtY3RhJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuc3RhcnRCdG4uZGlzYWJsZWQgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuc3RhcnRCdG4ub25jbGljayA9ICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc2VsZWN0ZWRGaWxlcy5zaXplID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCfor7foh7PlsJHpgInmi6nkuIDkuKrmlofku7YnKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLm9uQ29uZmlybShBcnJheS5mcm9tKHRoaXMuc2VsZWN0ZWRGaWxlcykpO1xyXG4gICAgICAgICAgICB0aGlzLmNsb3NlKCk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FuY2VsQnRuID0gZm9vdGVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICflj5bmtognIH0pO1xyXG4gICAgICAgIGNhbmNlbEJ0bi5vbmNsaWNrID0gKCkgPT4gdGhpcy5jbG9zZSgpO1xyXG5cclxuICAgICAgICAvLyDlrprml7bliLfmlrDorqHmlbBcclxuICAgICAgICAodGhpcyBhcyBhbnkpLl9idEludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xyXG4gICAgICAgICAgICBjb3VudEVsLnRleHRDb250ZW50ID0gYOW3sumAieaLqSAke3RoaXMuc2VsZWN0ZWRGaWxlcy5zaXplfSDkuKpgO1xyXG4gICAgICAgIH0sIDE1MCk7XHJcblxyXG4gICAgICAgIC8vIOmmluasoeWKoOi9ve+8mum7mOiupOaKmOWPoOaJgOaciemdnuagueebruW9lVxyXG4gICAgICAgIGlmICghdGhpcy5pbml0aWFsaXplZCkge1xyXG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgY29uc3Qgcm9vdCA9IHRoaXMuYnVpbGRUcmVlKHRoaXMuYWxsTWVkaWFGaWxlcyk7XHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdEZvbGRlclBhdGhzKHJvb3QpLmZvckVhY2gocCA9PiB0aGlzLmNvbGxhcHNlZFBhdGhzLmFkZChwKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlbmRlclRyZWUoKTtcclxuICAgIH1cclxuXHJcbiAgICBvbkNsb3NlKCkge1xyXG4gICAgICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbCgodGhpcyBhcyBhbnkpLl9idEludGVydmFsKTtcclxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYmF0Y2gtdHJhbnNjcmliZS1zdHlsZXMnKT8ucmVtb3ZlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXHJcbiAgICAvLyDmlbDmja7mlLbpm4ZcclxuICAgIC8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxyXG5cclxuICAgIHByaXZhdGUgY29sbGVjdE1lZGlhRmlsZXMoKTogVEZpbGVbXSB7XHJcbiAgICAgICAgLy8g5L2/55SoIGZzIOmBjeWOhuaWh+S7tuezu+e7n++8jOiDveato+ehrui3n+maj+espuWPt+mTvuaOpeWSjCBKdW5jdGlvblxyXG4gICAgICAgIGNvbnN0IGFkYXB0ZXIgPSB0aGlzLmFwcC52YXVsdC5hZGFwdGVyIGFzIGFueTtcclxuICAgICAgICBpZiAoIWFkYXB0ZXI/LmdldEJhc2VQYXRoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3RWaWFPYnNpZGlhbigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgYmFzZVBhdGggPSBhZGFwdGVyLmdldEJhc2VQYXRoKCkgYXMgc3RyaW5nO1xyXG4gICAgICAgIGNvbnN0IG1lZGlhRXh0cyA9IFsnbXA0JywgJ21wMycsICd3YXYnLCAnbTRhJywgJ21vdiddO1xyXG4gICAgICAgIGNvbnN0IHJlc3VsdHM6IFRGaWxlW10gPSBbXTtcclxuICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHdhbGtEaXIgPSAoZGlyUGF0aDogc3RyaW5nLCByZWxhdGl2ZVBhdGg6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgICBsZXQgZW50cmllczogZnMuRGlyZW50W107XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBlbnRyaWVzID0gZnMucmVhZGRpclN5bmMoZGlyUGF0aCwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICB9IGNhdGNoIHsgcmV0dXJuOyB9XHJcblxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChlbnRyeS5uYW1lLnN0YXJ0c1dpdGgoJy4nKSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgZnVsbENoaWxkUGF0aCA9IHBhdGguam9pbihkaXJQYXRoLCBlbnRyeS5uYW1lKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlbENoaWxkUGF0aCA9IHJlbGF0aXZlUGF0aCA/IGAke3JlbGF0aXZlUGF0aH0vJHtlbnRyeS5uYW1lfWAgOiBlbnRyeS5uYW1lO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpIHx8IGVudHJ5LmlzU3ltYm9saWNMaW5rKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgaXNEaXIgPSBlbnRyeS5pc0RpcmVjdG9yeSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChlbnRyeS5pc1N5bWJvbGljTGluaygpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0RpciA9IGZzLnN0YXRTeW5jKGZ1bGxDaGlsZFBhdGgpLmlzRGlyZWN0b3J5KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggeyBjb250aW51ZTsgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNEaXIpIHdhbGtEaXIoZnVsbENoaWxkUGF0aCwgcmVsQ2hpbGRQYXRoKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZW50cnkuaXNGaWxlKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBleHQgPSBlbnRyeS5uYW1lLnNwbGl0KCcuJykucG9wKCk/LnRvTG93ZXJDYXNlKCkgfHwgJyc7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFtZWRpYUV4dHMuaW5jbHVkZXMoZXh0KSB8fCBzZWVuLmhhcyhyZWxDaGlsZFBhdGgpKSBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICBzZWVuLmFkZChyZWxDaGlsZFBhdGgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyDkvJjlhYjnlKggT2JzaWRpYW4g5bey57Si5byV55qEIFRGaWxlXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocmVsQ2hpbGRQYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2godGZpbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE9ic2lkaWFuIOacque0ouW8le+8iOW4uOingeS6juespuWPt+mTvuaOpeebruW9le+8ie+8jOWIm+W7uuS7o+eQhiBURmlsZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgc3RhdDogeyBzaXplOiBudW1iZXIgfTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXQgPSBmcy5zdGF0U3luYyhmdWxsQ2hpbGRQYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ID0geyBzaXplOiAwIH07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJveHkgPSBPYmplY3QuY3JlYXRlKFRGaWxlLnByb3RvdHlwZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3h5LnBhdGggPSByZWxDaGlsZFBhdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3h5Lm5hbWUgPSBlbnRyeS5uYW1lO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm94eS5iYXNlbmFtZSA9IGVudHJ5Lm5hbWUucmVwbGFjZSgvXFwuW14uXSskLywgJycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm94eS5leHRlbnNpb24gPSBleHQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3h5LnN0YXQgPSB7IHNpemU6IHN0YXQuc2l6ZSwgbXRpbWU6IERhdGUubm93KCksIGN0aW1lOiBEYXRlLm5vdygpIH07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3h5LnZhdWx0ID0gdGhpcy5hcHAudmF1bHQ7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3h5LnBhcmVudCA9IHRoaXMuZ2V0Rm9sZGVyUHJveHkocmVsYXRpdmVQYXRoLCB0aGlzLmFwcCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChwcm94eSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgd2Fsa0RpcihiYXNlUGF0aCwgJycpO1xyXG5cclxuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLmNvbGxlY3RWaWFPYnNpZGlhbigpO1xyXG4gICAgICAgIHJldHVybiByZXN1bHRzLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKiDlm57pgIDvvJrkvb/nlKggT2JzaWRpYW4gdmF1bHQuZ2V0RmlsZXMoKSAqL1xyXG4gICAgcHJpdmF0ZSBjb2xsZWN0VmlhT2JzaWRpYW4oKTogVEZpbGVbXSB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuYXBwLnZhdWx0LmdldEZpbGVzKClcclxuICAgICAgICAgICAgLmZpbHRlcihmID0+IGlzU3VwcG9ydGVkTWVkaWFFeHRlbnNpb24oZi5leHRlbnNpb24pICYmICFmLnBhdGguaW5jbHVkZXMoJy5vYnNpZGlhbi9wbHVnaW5zLycpKVxyXG4gICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5wYXRoLmxvY2FsZUNvbXBhcmUoYi5wYXRoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIOiOt+WPluaIluWIm+W7uuaWh+S7tuWkueS7o+eQhuWvueixoSAqL1xyXG4gICAgcHJpdmF0ZSBnZXRGb2xkZXJQcm94eShmb2xkZXJQYXRoOiBzdHJpbmcsIGFwcDogQXBwKTogVEZvbGRlciB8IG51bGwge1xyXG4gICAgICAgIGNvbnN0IGZvbGRlciA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZm9sZGVyUGF0aCk7XHJcbiAgICAgICAgaWYgKGZvbGRlciBpbnN0YW5jZW9mIFRGb2xkZXIpIHJldHVybiBmb2xkZXI7XHJcbiAgICAgICAgY29uc3QgcHJveHkgPSBPYmplY3QuY3JlYXRlKFRGb2xkZXIucHJvdG90eXBlKTtcclxuICAgICAgICBwcm94eS5wYXRoID0gZm9sZGVyUGF0aDtcclxuICAgICAgICBwcm94eS5uYW1lID0gZm9sZGVyUGF0aC5zcGxpdCgnLycpLnBvcCgpIHx8IGZvbGRlclBhdGg7XHJcbiAgICAgICAgcHJveHkucGFyZW50ID0gbnVsbDtcclxuICAgICAgICBwcm94eS52YXVsdCA9IGFwcC52YXVsdDtcclxuICAgICAgICByZXR1cm4gcHJveHk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpc0FscmVhZHlUcmFuc2NyaWJlZChmaWxlOiBURmlsZSk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IGRpciA9IGZpbGUucGFyZW50Py5wYXRoID09PSAnLycgPyAnJyA6IGZpbGUucGFyZW50Py5wYXRoIHx8ICcnO1xyXG4gICAgICAgIGNvbnN0IHsgbm90ZVBhdGggfSA9IGNhbGN1bGF0ZU5vdGVQYXRocyhkaXIsIGZpbGUuYmFzZW5hbWUpO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm90ZVBhdGgpIGluc3RhbmNlb2YgVEZpbGU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXHJcbiAgICAvLyDmoJHmnoTlu7pcclxuICAgIC8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxyXG5cclxuICAgIHByaXZhdGUgYnVpbGRUcmVlKGZpbGVzOiBURmlsZVtdKTogVHJlZU5vZGUge1xyXG4gICAgICAgIGNvbnN0IHJvb3Q6IFRyZWVOb2RlID0ge1xyXG4gICAgICAgICAgICBuYW1lOiAnJywgcGF0aDogJycsIGlzRm9sZGVyOiB0cnVlLFxyXG4gICAgICAgICAgICBjaGlsZHJlbjogbmV3IE1hcCgpLCBhbGxGaWxlczogW11cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcclxuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBmaWxlLnBhdGguc3BsaXQoJy8nKTtcclxuICAgICAgICAgICAgbGV0IGN1cnJlbnQgPSByb290O1xyXG4gICAgICAgICAgICBsZXQgY3VycmVudFBhdGggPSAnJztcclxuXHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnQgPSBwYXJ0c1tpXTtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRQYXRoID0gY3VycmVudFBhdGggPyBgJHtjdXJyZW50UGF0aH0vJHtwYXJ0fWAgOiBwYXJ0O1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaXNMYXN0ID0gaSA9PT0gcGFydHMubGVuZ3RoIC0gMTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoaXNMYXN0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5paH5Lu26IqC54K5XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZU5vZGU6IFRyZWVOb2RlID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBwYXJ0LCBwYXRoOiBmaWxlLnBhdGgsIGlzRm9sZGVyOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZSwgY2hpbGRyZW46IG5ldyBNYXAoKSwgYWxsRmlsZXM6IFtmaWxlXVxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudC5jaGlsZHJlbi5zZXQocGFydCwgZmlsZU5vZGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnQuYWxsRmlsZXMucHVzaChmaWxlKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5paH5Lu25aS56IqC54K5XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjdXJyZW50LmNoaWxkcmVuLmhhcyhwYXJ0KSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmb2xkZXJOb2RlOiBUcmVlTm9kZSA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHBhcnQsIHBhdGg6IGN1cnJlbnRQYXRoLCBpc0ZvbGRlcjogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuOiBuZXcgTWFwKCksIGFsbEZpbGVzOiBbXVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50LmNoaWxkcmVuLnNldChwYXJ0LCBmb2xkZXJOb2RlKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQuY2hpbGRyZW4uZ2V0KHBhcnQpITtcclxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50LmFsbEZpbGVzLnB1c2goZmlsZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIOmAkuW9kuaUtumbhiBhbGxGaWxlc++8iOW3suWcqOS4iumdoiBwdXNoIOS6hu+8jOS9huS4remXtOiKgueCueS5n+mcgOimge+8iVxyXG4gICAgICAgIHRoaXMuZmluYWxpemVBbGxGaWxlcyhyb290KTtcclxuICAgICAgICByZXR1cm4gcm9vdDtcclxuICAgIH1cclxuXHJcbiAgICAvKiog6YCS5b2S56Gu5L+dIGFsbEZpbGVzIOato+ehriAqL1xyXG4gICAgcHJpdmF0ZSBmaW5hbGl6ZUFsbEZpbGVzKG5vZGU6IFRyZWVOb2RlKTogVEZpbGVbXSB7XHJcbiAgICAgICAgaWYgKCFub2RlLmlzRm9sZGVyKSByZXR1cm4gbm9kZS5hbGxGaWxlcztcclxuICAgICAgICBjb25zdCBjb2xsZWN0ZWQ6IFRGaWxlW10gPSBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4udmFsdWVzKCkpIHtcclxuICAgICAgICAgICAgY29sbGVjdGVkLnB1c2goLi4udGhpcy5maW5hbGl6ZUFsbEZpbGVzKGNoaWxkKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG5vZGUuYWxsRmlsZXMgPSBjb2xsZWN0ZWQ7XHJcbiAgICAgICAgcmV0dXJuIGNvbGxlY3RlZDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNvbGxlY3RGb2xkZXJQYXRocyhub2RlOiBUcmVlTm9kZSk6IHN0cmluZ1tdIHtcclxuICAgICAgICBjb25zdCBwYXRoczogc3RyaW5nW10gPSBbXTtcclxuICAgICAgICBpZiAobm9kZS5pc0ZvbGRlciAmJiBub2RlLnBhdGgpIHtcclxuICAgICAgICAgICAgcGF0aHMucHVzaChub2RlLnBhdGgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4udmFsdWVzKCkpIHtcclxuICAgICAgICAgICAgcGF0aHMucHVzaCguLi50aGlzLmNvbGxlY3RGb2xkZXJQYXRocyhjaGlsZCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcGF0aHM7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXHJcbiAgICAvLyDmoJHmuLLmn5NcclxuICAgIC8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyVHJlZSgpIHtcclxuICAgICAgICB0aGlzLnRyZWVDb250YWluZXIuZW1wdHkoKTtcclxuXHJcbiAgICAgICAgY29uc3QgZmlsdGVyVGV4dCA9IHRoaXMuZmlsdGVySW5wdXQudmFsdWUudG9Mb3dlckNhc2UoKS50cmltKCk7XHJcbiAgICAgICAgbGV0IGZpbGVzID0gdGhpcy5hbGxNZWRpYUZpbGVzO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zaG93T25seVVudHJhbnNjcmliZWQpIHtcclxuICAgICAgICAgICAgZmlsZXMgPSBmaWxlcy5maWx0ZXIoZiA9PiAhdGhpcy5pc0FscmVhZHlUcmFuc2NyaWJlZChmKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChmaWx0ZXJUZXh0KSB7XHJcbiAgICAgICAgICAgIGZpbGVzID0gZmlsZXMuZmlsdGVyKGYgPT5cclxuICAgICAgICAgICAgICAgIGYucGF0aC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGZpbHRlclRleHQpIHx8XHJcbiAgICAgICAgICAgICAgICBmLmJhc2VuYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZmlsdGVyVGV4dClcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy50cmVlQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0OiAn8J+TrSDmsqHmnInljLnphY3nmoTmlofku7YnLCBjbHM6ICdidC1lbXB0eSdcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlU3RhcnRCdG4oKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY29sbGFwc2VkID0gdGhpcy5jb2xsYXBzZWRQYXRocztcclxuXHJcbiAgICAgICAgY29uc3QgdHJlZSA9IHRoaXMuYnVpbGRUcmVlKGZpbGVzKTtcclxuICAgICAgICAvLyDov4fmu6Tmjonlj6rmnInnqbrlrZDmlofku7blpLnnmoToioLngrlcclxuICAgICAgICBjb25zdCBwcnVuZWQgPSB0aGlzLnBydW5lRW1wdHlGb2xkZXJzKHRyZWUpO1xyXG4gICAgICAgIGlmIChwcnVuZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJOb2RlKHRyZWUsIHRoaXMudHJlZUNvbnRhaW5lciwgMCwgY29sbGFwc2VkKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlU3RhcnRCdG4oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBydW5lRW1wdHlGb2xkZXJzKG5vZGU6IFRyZWVOb2RlKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKCFub2RlLmlzRm9sZGVyKSByZXR1cm4gdHJ1ZTtcclxuICAgICAgICBjb25zdCB0b0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcclxuICAgICAgICBmb3IgKGNvbnN0IFtuYW1lLCBjaGlsZF0gb2Ygbm9kZS5jaGlsZHJlbikge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMucHJ1bmVFbXB0eUZvbGRlcnMoY2hpbGQpKSB7XHJcbiAgICAgICAgICAgICAgICB0b0RlbGV0ZS5wdXNoKG5hbWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRvRGVsZXRlLmZvckVhY2gobiA9PiBub2RlLmNoaWxkcmVuLmRlbGV0ZShuKSk7XHJcbiAgICAgICAgcmV0dXJuIG5vZGUuY2hpbGRyZW4uc2l6ZSA+IDAgfHwgIW5vZGUuaXNGb2xkZXI7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJOb2RlKFxyXG4gICAgICAgIG5vZGU6IFRyZWVOb2RlLFxyXG4gICAgICAgIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXHJcbiAgICAgICAgZGVwdGg6IG51bWJlcixcclxuICAgICAgICBjb2xsYXBzZWQ6IFNldDxzdHJpbmc+XHJcbiAgICApIHtcclxuICAgICAgICBjb25zdCBzb3J0ZWRDaGlsZHJlbiA9IEFycmF5LmZyb20obm9kZS5jaGlsZHJlbi52YWx1ZXMoKSkuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgICAgICAvLyDmlofku7blpLnlnKjliY1cclxuICAgICAgICAgICAgaWYgKGEuaXNGb2xkZXIgIT09IGIuaXNGb2xkZXIpIHJldHVybiBhLmlzRm9sZGVyID8gLTEgOiAxO1xyXG4gICAgICAgICAgICByZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBzb3J0ZWRDaGlsZHJlbikge1xyXG4gICAgICAgICAgICBpZiAoY2hpbGQuaXNGb2xkZXIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyRm9sZGVyTm9kZShjaGlsZCwgY29udGFpbmVyLCBkZXB0aCwgY29sbGFwc2VkKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyRmlsZU5vZGUoY2hpbGQsIGNvbnRhaW5lciwgZGVwdGgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyRm9sZGVyTm9kZShcclxuICAgICAgICBub2RlOiBUcmVlTm9kZSxcclxuICAgICAgICBjb250YWluZXI6IEhUTUxFbGVtZW50LFxyXG4gICAgICAgIGRlcHRoOiBudW1iZXIsXHJcbiAgICAgICAgY29sbGFwc2VkOiBTZXQ8c3RyaW5nPlxyXG4gICAgKSB7XHJcbiAgICAgICAgY29uc3QgaXNDb2xsYXBzZWQgPSBjb2xsYXBzZWQuaGFzKG5vZGUucGF0aCk7XHJcbiAgICAgICAgY29uc3QgZm9sZGVyRmlsZXMgPSBub2RlLmFsbEZpbGVzO1xyXG4gICAgICAgIGNvbnN0IHNlbGVjdGVkQ291bnQgPSBmb2xkZXJGaWxlcy5maWx0ZXIoZiA9PiB0aGlzLnNlbGVjdGVkRmlsZXMuaGFzKGYpKS5sZW5ndGg7XHJcbiAgICAgICAgY29uc3QgYWxsU2VsZWN0ZWQgPSBzZWxlY3RlZENvdW50ID09PSBmb2xkZXJGaWxlcy5sZW5ndGg7XHJcbiAgICAgICAgY29uc3Qgc29tZVNlbGVjdGVkID0gc2VsZWN0ZWRDb3VudCA+IDAgJiYgIWFsbFNlbGVjdGVkO1xyXG5cclxuICAgICAgICBjb25zdCByb3cgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiAnYnQtcm93IGJ0LWZvbGRlci1yb3cnIH0pO1xyXG4gICAgICAgIHJvdy5zdHlsZS5wYWRkaW5nTGVmdCA9IGAke2RlcHRoICogMjAgKyA4fXB4YDtcclxuXHJcbiAgICAgICAgLy8g5bGV5byAL+aKmOWPoOeureWktFxyXG4gICAgICAgIGNvbnN0IGFycm93ID0gcm93LmNyZWF0ZUVsKCdzcGFuJywgeyBjbHM6ICdidC1hcnJvdycgfSk7XHJcbiAgICAgICAgYXJyb3cudGV4dENvbnRlbnQgPSBpc0NvbGxhcHNlZCA/ICfilrYnIDogJ+KWvCc7XHJcblxyXG4gICAgICAgIC8vIOWkjemAieahhlxyXG4gICAgICAgIGNvbnN0IGNiID0gcm93LmNyZWF0ZUVsKCdpbnB1dCcsIHsgdHlwZTogJ2NoZWNrYm94JywgY2xzOiAnYnQtY2hlY2tib3gnIH0pO1xyXG4gICAgICAgIGNiLmNoZWNrZWQgPSBhbGxTZWxlY3RlZDtcclxuICAgICAgICBjYi5pbmRldGVybWluYXRlID0gc29tZVNlbGVjdGVkO1xyXG4gICAgICAgIGNiLm9uY2xpY2sgPSAoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICBjYi5vbmNoYW5nZSA9ICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKGNiLmNoZWNrZWQpIHtcclxuICAgICAgICAgICAgICAgIGZvbGRlckZpbGVzLmZvckVhY2goZiA9PiB0aGlzLnNlbGVjdGVkRmlsZXMuYWRkKGYpKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGZvbGRlckZpbGVzLmZvckVhY2goZiA9PiB0aGlzLnNlbGVjdGVkRmlsZXMuZGVsZXRlKGYpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnJlbmRlclRyZWUoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyDmlofku7blpLnlkI1cclxuICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfwn5OBJywgY2xzOiAnYnQtaWNvbicgfSk7XHJcbiAgICAgICAgcm93LmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiBub2RlLm5hbWUsIGNsczogJ2J0LWZvbGRlci1uYW1lJyB9KTtcclxuXHJcbiAgICAgICAgLy8g5paH5Lu26K6h5pWwXHJcbiAgICAgICAgcm93LmNyZWF0ZUVsKCdzcGFuJywge1xyXG4gICAgICAgICAgICB0ZXh0OiBgJHtzZWxlY3RlZENvdW50fS8ke2ZvbGRlckZpbGVzLmxlbmd0aH1gLFxyXG4gICAgICAgICAgICBjbHM6ICdidC1mb2xkZXItY291bnQnXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIOeCueWHu+WIh+aNouaKmOWPoFxyXG4gICAgICAgIHJvdy5vbmNsaWNrID0gKGUpID0+IHtcclxuICAgICAgICAgICAgLy8g5LiN6KaB5Zyo54K5IGNoZWNrYm94IOaXtuinpuWPkeaKmOWPoFxyXG4gICAgICAgICAgICBpZiAoKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS50YWdOYW1lID09PSAnSU5QVVQnKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChpc0NvbGxhcHNlZCkge1xyXG4gICAgICAgICAgICAgICAgY29sbGFwc2VkLmRlbGV0ZShub2RlLnBhdGgpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY29sbGFwc2VkLmFkZChub2RlLnBhdGgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyVHJlZSgpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIOWtkOiKgueCuVxyXG4gICAgICAgIGlmICghaXNDb2xsYXBzZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJOb2RlKG5vZGUsIGNvbnRhaW5lciwgZGVwdGggKyAxLCBjb2xsYXBzZWQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlckZpbGVOb2RlKFxyXG4gICAgICAgIG5vZGU6IFRyZWVOb2RlLFxyXG4gICAgICAgIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXHJcbiAgICAgICAgZGVwdGg6IG51bWJlclxyXG4gICAgKSB7XHJcbiAgICAgICAgY29uc3QgZmlsZSA9IG5vZGUuZmlsZSE7XHJcbiAgICAgICAgY29uc3QgaXNUcmFuc2NyaWJlZCA9IHRoaXMuaXNBbHJlYWR5VHJhbnNjcmliZWQoZmlsZSk7XHJcbiAgICAgICAgY29uc3QgaXNTZWxlY3RlZCA9IHRoaXMuc2VsZWN0ZWRGaWxlcy5oYXMoZmlsZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJvdyA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6ICdidC1yb3cgYnQtZmlsZS1yb3cnIH0pO1xyXG4gICAgICAgIGlmIChpc1NlbGVjdGVkKSByb3cuYWRkQ2xhc3MoJ2lzLXNlbGVjdGVkJyk7XHJcbiAgICAgICAgaWYgKGlzVHJhbnNjcmliZWQpIHJvdy5hZGRDbGFzcygnaXMtdHJhbnNjcmliZWQnKTtcclxuICAgICAgICByb3cuc3R5bGUucGFkZGluZ0xlZnQgPSBgJHtkZXB0aCAqIDIwICsgOH1weGA7XHJcblxyXG4gICAgICAgIC8vIOWNoOS9jeeureWktO+8iOS/neaMgeWvuem9kO+8iVxyXG4gICAgICAgIHJvdy5jcmVhdGVFbCgnc3BhbicsIHsgY2xzOiAnYnQtYXJyb3cgYnQtYXJyb3ctcGxhY2Vob2xkZXInIH0pO1xyXG5cclxuICAgICAgICAvLyDlpI3pgInmoYZcclxuICAgICAgICBjb25zdCBjYiA9IHJvdy5jcmVhdGVFbCgnaW5wdXQnLCB7IHR5cGU6ICdjaGVja2JveCcsIGNsczogJ2J0LWNoZWNrYm94JyB9KTtcclxuICAgICAgICBjYi5jaGVja2VkID0gaXNTZWxlY3RlZDtcclxuICAgICAgICBjYi5vbmNsaWNrID0gKGUpID0+IGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgY2Iub25jaGFuZ2UgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChjYi5jaGVja2VkKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkRmlsZXMuYWRkKGZpbGUpO1xyXG4gICAgICAgICAgICAgICAgcm93LmFkZENsYXNzKCdpcy1zZWxlY3RlZCcpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3RlZEZpbGVzLmRlbGV0ZShmaWxlKTtcclxuICAgICAgICAgICAgICAgIHJvdy5yZW1vdmVDbGFzcygnaXMtc2VsZWN0ZWQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVN0YXJ0QnRuKCk7XHJcbiAgICAgICAgICAgIC8vIOWQjOatpeabtOaWsOeItuaWh+S7tuWkueeahOeKtuaAge+8iOmHjeaWsOa4suafk++8iVxyXG4gICAgICAgICAgICB0aGlzLnJlbmRlclRyZWUoKTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyDmlofku7blm77moIdcclxuICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfwn46sJywgY2xzOiAnYnQtaWNvbicgfSk7XHJcblxyXG4gICAgICAgIC8vIOaWh+S7tuWQjVxyXG4gICAgICAgIHJvdy5jcmVhdGVFbCgnc3BhbicsIHsgdGV4dDogZmlsZS5uYW1lLCBjbHM6ICdidC1maWxlLW5hbWUnIH0pO1xyXG5cclxuICAgICAgICAvLyDnirbmgIHmoIfnrb5cclxuICAgICAgICBpZiAoaXNUcmFuc2NyaWJlZCkge1xyXG4gICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6ICfinIUnLCBjbHM6ICdidC10YWcnLCB0aXRsZTogJ+W3sui9rOWGmScgfSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgcm93LmNyZWF0ZUVsKCdzcGFuJywgeyB0ZXh0OiAn4o+zJywgY2xzOiAnYnQtdGFnJywgdGl0bGU6ICfmnKrovazlhpknIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g5paH5Lu25aSn5bCPXHJcbiAgICAgICAgY29uc3Qgc2l6ZUtCID0gZmlsZS5zdGF0LnNpemUgLyAxMDI0O1xyXG4gICAgICAgIGxldCBzaXplU3RyOiBzdHJpbmc7XHJcbiAgICAgICAgaWYgKHNpemVLQiA+IDEwMjQgKiAxMDI0KSBzaXplU3RyID0gYCR7KHNpemVLQiAvIDEwMjQgLyAxMDI0KS50b0ZpeGVkKDEpfSBHQmA7XHJcbiAgICAgICAgZWxzZSBpZiAoc2l6ZUtCID4gMTAyNCkgc2l6ZVN0ciA9IGAkeyhzaXplS0IgLyAxMDI0KS50b0ZpeGVkKDApfSBNQmA7XHJcbiAgICAgICAgZWxzZSBzaXplU3RyID0gYCR7c2l6ZUtCLnRvRml4ZWQoMCl9IEtCYDtcclxuICAgICAgICByb3cuY3JlYXRlRWwoJ3NwYW4nLCB7IHRleHQ6IHNpemVTdHIsIGNsczogJ2J0LWZpbGUtc2l6ZScgfSk7XHJcblxyXG4gICAgICAgIC8vIOaVtOihjOeCueWHu+WIh+aNolxyXG4gICAgICAgIHJvdy5vbmNsaWNrID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBjYi5jaGVja2VkID0gIWNiLmNoZWNrZWQ7XHJcbiAgICAgICAgICAgIGNiLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjaGFuZ2UnKSk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZBcclxuICAgIC8vIOi+heWKqVxyXG4gICAgLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXHJcblxyXG4gICAgcHJpdmF0ZSBnZXRWaXNpYmxlRmlsZXMoKTogVEZpbGVbXSB7XHJcbiAgICAgICAgY29uc3QgZmlsdGVyVGV4dCA9IHRoaXMuZmlsdGVySW5wdXQudmFsdWUudG9Mb3dlckNhc2UoKS50cmltKCk7XHJcbiAgICAgICAgbGV0IGZpbGVzID0gdGhpcy5hbGxNZWRpYUZpbGVzO1xyXG4gICAgICAgIGlmICh0aGlzLnNob3dPbmx5VW50cmFuc2NyaWJlZCkge1xyXG4gICAgICAgICAgICBmaWxlcyA9IGZpbGVzLmZpbHRlcihmID0+ICF0aGlzLmlzQWxyZWFkeVRyYW5zY3JpYmVkKGYpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGZpbHRlclRleHQpIHtcclxuICAgICAgICAgICAgZmlsZXMgPSBmaWxlcy5maWx0ZXIoZiA9PlxyXG4gICAgICAgICAgICAgICAgZi5wYXRoLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZmlsdGVyVGV4dCkgfHxcclxuICAgICAgICAgICAgICAgIGYuYmFzZW5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmaWx0ZXJUZXh0KVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmlsZXM7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVTdGFydEJ0bigpIHtcclxuICAgICAgICB0aGlzLnN0YXJ0QnRuLmRpc2FibGVkID0gdGhpcy5zZWxlY3RlZEZpbGVzLnNpemUgPT09IDA7XHJcbiAgICAgICAgdGhpcy5zdGFydEJ0bi50ZXh0Q29udGVudCA9IHRoaXMuc2VsZWN0ZWRGaWxlcy5zaXplID4gMFxyXG4gICAgICAgICAgICA/IGDwn5qAIOW8gOWni+aJuemHj+i9rOWGmSAoJHt0aGlzLnNlbGVjdGVkRmlsZXMuc2l6ZX0g5LiqKWBcclxuICAgICAgICAgICAgOiAn8J+agCDlvIDlp4vmibnph4/ovazlhpknO1xyXG4gICAgfVxyXG5cclxufVxyXG4iXX0=