/**
 * 📋 批量转写选择模态框（文件树版）
 * 以树形结构展示 Vault 中的视频/音频文件，支持展开/折叠、搜索、多选联动
 */

import { App, Modal, TFile, TFolder, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { isSupportedMediaExtension, calculateNotePaths } from './utils';

interface TreeNode {
    name: string;
    path: string;
    isFolder: boolean;
    file?: TFile;
    children: Map<string, TreeNode>;
    /** 该文件夹下所有媒体文件（递归） */
    allFiles: TFile[];
}

export class BatchTranscribeModal extends Modal {
    private selectedFiles: Set<TFile> = new Set();
    private allMediaFiles: TFile[] = [];
    private filterInput: HTMLInputElement;
    private treeContainer: HTMLDivElement;
    private startBtn: HTMLButtonElement;
    private onConfirm: (files: TFile[]) => void;
    private showOnlyUntranscribed = false;
    private collapsedPaths: Set<string> = new Set();
    private initialized = false;

    constructor(app: App, onConfirm: (files: TFile[]) => void) {
        super(app);
        this.onConfirm = onConfirm;
    }

    private injectStyles() {
        const style = document.createElement('style');
        style.id = 'batch-transcribe-styles';
        // 如果已存在先移除
        document.getElementById('batch-transcribe-styles')?.remove();
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
            } else {
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
                new Notice('请至少选择一个文件');
                return;
            }
            this.onConfirm(Array.from(this.selectedFiles));
            this.close();
        };

        const cancelBtn = footer.createEl('button', { text: '取消' });
        cancelBtn.onclick = () => this.close();

        // 定时刷新计数
        (this as any)._btInterval = setInterval(() => {
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
        this.contentEl.empty();
        clearInterval((this as any)._btInterval);
        document.getElementById('batch-transcribe-styles')?.remove();
    }

    // ════════════════════════════════════════════════════
    // 数据收集
    // ════════════════════════════════════════════════════

    private collectMediaFiles(): TFile[] {
        // 使用 fs 遍历文件系统，能正确跟随符号链接和 Junction
        const adapter = this.app.vault.adapter as any;
        if (!adapter?.getBasePath) {
            return this.collectViaObsidian();
        }

        const basePath = adapter.getBasePath() as string;
        const mediaExts = ['mp4', 'mp3', 'wav', 'm4a', 'mov'];
        const results: TFile[] = [];
        const seen = new Set<string>();

        const walkDir = (dirPath: string, relativePath: string) => {
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dirPath, { withFileTypes: true });
            } catch { return; }

            for (const entry of entries) {
                if (entry.name.startsWith('.')) continue;

                const fullChildPath = path.join(dirPath, entry.name);
                const relChildPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

                if (entry.isDirectory() || entry.isSymbolicLink()) {
                    let isDir = entry.isDirectory();
                    if (entry.isSymbolicLink()) {
                        try {
                            isDir = fs.statSync(fullChildPath).isDirectory();
                        } catch { continue; }
                    }
                    if (isDir) walkDir(fullChildPath, relChildPath);
                } else if (entry.isFile()) {
                    const ext = entry.name.split('.').pop()?.toLowerCase() || '';
                    if (!mediaExts.includes(ext) || seen.has(relChildPath)) continue;
                    seen.add(relChildPath);

                    // 优先用 Obsidian 已索引的 TFile
                    const tfile = this.app.vault.getAbstractFileByPath(relChildPath);
                    if (tfile instanceof TFile) {
                        results.push(tfile);
                    } else {
                        // Obsidian 未索引（常见于符号链接目录），创建代理 TFile
                        let stat: { size: number };
                        try {
                            stat = fs.statSync(fullChildPath);
                        } catch {
                            stat = { size: 0 };
                        }
                        const proxy = Object.create(TFile.prototype);
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

        if (results.length === 0) return this.collectViaObsidian();
        return results.sort((a, b) => a.path.localeCompare(b.path));
    }

    /** 回退：使用 Obsidian vault.getFiles() */
    private collectViaObsidian(): TFile[] {
        return this.app.vault.getFiles()
            .filter(f => isSupportedMediaExtension(f.extension) && !f.path.includes('.obsidian/plugins/'))
            .sort((a, b) => a.path.localeCompare(b.path));
    }

    /** 获取或创建文件夹代理对象 */
    private getFolderProxy(folderPath: string, app: App): TFolder | null {
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof TFolder) return folder;
        const proxy = Object.create(TFolder.prototype);
        proxy.path = folderPath;
        proxy.name = folderPath.split('/').pop() || folderPath;
        proxy.parent = null;
        proxy.vault = app.vault;
        return proxy;
    }

    private isAlreadyTranscribed(file: TFile): boolean {
        const dir = file.parent?.path === '/' ? '' : file.parent?.path || '';
        const { notePath } = calculateNotePaths(dir, file.basename);
        const noteFile = this.app.vault.getAbstractFileByPath(notePath);
        if (!(noteFile instanceof TFile)) return false;
        // 🔑 防止误判：文件存在但内容为空（仅有初始嵌入或完全空）不算已转写
        // 批量转写开始时会创建初始笔记文件，里面只有视频嵌入链接，不是真正的转写内容
        const cache = this.app.metadataCache.getFileCache(noteFile);
        if (!cache) return false;
        // 检查文件内容：如果只有嵌入链接没有正文内容，视为未转写
        // 正常转写完成后笔记会有大量文本（至少 > 500 字符），初始文件通常 < 200 字符
        // 使用同步的文件大小判断，避免 async 污染所有调用链
        const fileSize = noteFile.stat.size;
        // 初始文件通常只有嵌入链接 + callout + 批次占位符，大约 200-800 字节
        // 转写完成后笔记通常 > 2000 字节
        // 阈值设为 1000 字节，低于此值视为未转写
        return fileSize > 1000;
    }

    // ════════════════════════════════════════════════════
    // 树构建
    // ════════════════════════════════════════════════════

    private buildTree(files: TFile[]): TreeNode {
        const root: TreeNode = {
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
                    const fileNode: TreeNode = {
                        name: part, path: file.path, isFolder: false,
                        file, children: new Map(), allFiles: [file]
                    };
                    current.children.set(part, fileNode);
                    current.allFiles.push(file);
                } else {
                    // 文件夹节点
                    if (!current.children.has(part)) {
                        const folderNode: TreeNode = {
                            name: part, path: currentPath, isFolder: true,
                            children: new Map(), allFiles: []
                        };
                        current.children.set(part, folderNode);
                    }
                    current = current.children.get(part)!;
                    current.allFiles.push(file);
                }
            }
        }

        // 递归收集 allFiles（已在上面 push 了，但中间节点也需要）
        this.finalizeAllFiles(root);
        return root;
    }

    /** 递归确保 allFiles 正确 */
    private finalizeAllFiles(node: TreeNode): TFile[] {
        if (!node.isFolder) return node.allFiles;
        const collected: TFile[] = [];
        for (const child of node.children.values()) {
            collected.push(...this.finalizeAllFiles(child));
        }
        node.allFiles = collected;
        return collected;
    }

    private collectFolderPaths(node: TreeNode): string[] {
        const paths: string[] = [];
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

    private renderTree() {
        this.treeContainer.empty();

        const filterText = this.filterInput.value.toLowerCase().trim();
        let files = this.allMediaFiles;

        if (this.showOnlyUntranscribed) {
            files = files.filter(f => !this.isAlreadyTranscribed(f));
        }
        if (filterText) {
            files = files.filter(f =>
                f.path.toLowerCase().includes(filterText) ||
                f.basename.toLowerCase().includes(filterText)
            );
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

    private pruneEmptyFolders(node: TreeNode): boolean {
        if (!node.isFolder) return true;
        const toDelete: string[] = [];
        for (const [name, child] of node.children) {
            if (!this.pruneEmptyFolders(child)) {
                toDelete.push(name);
            }
        }
        toDelete.forEach(n => node.children.delete(n));
        return node.children.size > 0 || !node.isFolder;
    }

    private renderNode(
        node: TreeNode,
        container: HTMLElement,
        depth: number,
        collapsed: Set<string>
    ) {
        const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
            // 文件夹在前
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        for (const child of sortedChildren) {
            if (child.isFolder) {
                this.renderFolderNode(child, container, depth, collapsed);
            } else {
                this.renderFileNode(child, container, depth);
            }
        }
    }

    private renderFolderNode(
        node: TreeNode,
        container: HTMLElement,
        depth: number,
        collapsed: Set<string>
    ) {
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
            } else {
                folderFiles.forEach(f => this.selectedFiles.delete(f));
            }
            // 🔑 局部更新：不重新渲染整棵树，只更新当前文件夹的子节点 checkbox 和计数
            this.updateFolderCheckbox(row, folderFiles);
            this.updateStartBtn();
        };

        // 文件夹名
        row.createEl('span', { text: '📁', cls: 'bt-icon' });
        row.createEl('span', { text: node.name, cls: 'bt-folder-name' });

        // 文件计数
        const countEl = row.createEl('span', {
            text: `${selectedCount}/${folderFiles.length}`,
            cls: 'bt-folder-count'
        });
        // 保存引用以便局部更新
        row.dataset.folderCountEl = '';
        (row as any)._countEl = countEl;

        // 点击切换折叠
        row.onclick = (e) => {
            // 不要在点 checkbox 时触发折叠
            if ((e.target as HTMLElement).tagName === 'INPUT') return;
            if (isCollapsed) {
                collapsed.delete(node.path);
            } else {
                collapsed.add(node.path);
            }
            this.renderTree();
        };

        // 子节点
        if (!isCollapsed) {
            this.renderNode(node, container, depth + 1, collapsed);
        }
    }

    /**
     * 🔑 局部更新文件夹及其子节点的 checkbox 状态，不重新渲染整棵树
     * 避免滚动位置丢失
     */
    private updateFolderCheckbox(folderRow: HTMLElement, folderFiles: TFile[]) {
        const selectedCount = folderFiles.filter(f => this.selectedFiles.has(f)).length;
        const allSelected = selectedCount === folderFiles.length;
        const someSelected = selectedCount > 0 && !allSelected;

        // 更新文件夹的 checkbox
        const cb = folderRow.querySelector('input.bt-checkbox') as HTMLInputElement;
        if (cb) {
            cb.checked = allSelected;
            cb.indeterminate = someSelected;
        }

        // 更新计数显示
        const countEl = (folderRow as any)._countEl as HTMLElement;
        if (countEl) {
            countEl.textContent = `${selectedCount}/${folderFiles.length}`;
        }

        // 更新该文件夹下所有文件行的 checkbox 和选中状态
        // 遍历 DOM 中的子文件行
        let sibling = folderRow.nextElementSibling as HTMLElement | null;
        while (sibling) {
            // 如果遇到另一个文件夹行，说明当前文件夹的子文件已结束
            if (sibling.classList.contains('bt-folder-row')) break;
            if (sibling.classList.contains('bt-file-row')) {
                const fileCb = sibling.querySelector('input.bt-checkbox') as HTMLInputElement;
                if (fileCb) {
                    // 通过 data-path 找到对应的文件
                    const filePath = sibling.dataset.path;
                    if (filePath) {
                        const file = folderFiles.find(f => f.path === filePath);
                        if (file) {
                            const isSel = this.selectedFiles.has(file);
                            fileCb.checked = isSel;
                            if (isSel) sibling.addClass('is-selected');
                            else sibling.removeClass('is-selected');
                        }
                    }
                }
            }
            sibling = sibling.nextElementSibling as HTMLElement | null;
        }
    }

    private renderFileNode(
        node: TreeNode,
        container: HTMLElement,
        depth: number
    ) {
        const file = node.file!;
        const isTranscribed = this.isAlreadyTranscribed(file);
        const isSelected = this.selectedFiles.has(file);

        const row = container.createDiv({ cls: 'bt-row bt-file-row' });
        // 🔑 保存文件路径到 dataset，便于局部更新时查找
        row.dataset.path = file.path;
        if (isSelected) row.addClass('is-selected');
        if (isTranscribed) row.addClass('is-transcribed');
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
            } else {
                this.selectedFiles.delete(file);
                row.removeClass('is-selected');
            }
            this.updateStartBtn();
            // 🔑 局部更新父文件夹的 checkbox 和计数，不重新渲染整棵树
            this.updateParentFolderStatus(row);
        };

        // 文件图标
        row.createEl('span', { text: '🎬', cls: 'bt-icon' });

        // 文件名
        row.createEl('span', { text: file.name, cls: 'bt-file-name' });

        // 状态标签
        if (isTranscribed) {
            row.createEl('span', { text: '✅', cls: 'bt-tag', title: '已转写' });
        } else {
            row.createEl('span', { text: '⏳', cls: 'bt-tag', title: '未转写' });
        }

        // 文件大小
        const sizeKB = file.stat.size / 1024;
        let sizeStr: string;
        if (sizeKB > 1024 * 1024) sizeStr = `${(sizeKB / 1024 / 1024).toFixed(1)} GB`;
        else if (sizeKB > 1024) sizeStr = `${(sizeKB / 1024).toFixed(0)} MB`;
        else sizeStr = `${sizeKB.toFixed(0)} KB`;
        row.createEl('span', { text: sizeStr, cls: 'bt-file-size' });

        // 整行点击切换
        row.onclick = () => {
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        };
    }

    /**
     * 🔑 向上查找父文件夹行并局部更新其 checkbox 和计数
     * 避免全量 renderTree() 导致滚动位置丢失
     */
    private updateParentFolderStatus(fileRow: HTMLElement) {
        // 向上查找最近的文件夹行
        // 由于 DOM 结构是平铺的（文件夹行后面跟着它的子文件行），
        // 需要向前找到最近的 bt-folder-row
        let prev = fileRow.previousElementSibling as HTMLElement | null;
        // 向上回溯，跳过同级的文件行，找到包含此文件的父文件夹行
        // 策略：从当前行往前找，找到第一个 bt-folder-row 即为最近的父文件夹
        // 但要注意缩进深度（paddingLeft）——父文件夹的 depth 应该比当前文件小
        const currentDepth = parseInt(fileRow.style.paddingLeft || '0');
        while (prev) {
            if (prev.classList.contains('bt-folder-row')) {
                const folderDepth = parseInt(prev.style.paddingLeft || '0');
                if (folderDepth < currentDepth) {
                    // 找到了父文件夹行，更新它的状态
                    this.updateFolderCountOnly(prev);
                    // 继续向上找更上层的文件夹（祖父也需要更新）
                    const grandparent = this.findPrevFolderRow(prev, folderDepth);
                    if (grandparent) this.updateFolderCountOnly(grandparent);
                    break;
                }
            }
            prev = prev.previousElementSibling as HTMLElement | null;
        }
    }

    /**
     * 向前查找指定深度的上一个文件夹行
     */
    private findPrevFolderRow(currentRow: HTMLElement, currentDepth: number): HTMLElement | null {
        let prev = currentRow.previousElementSibling as HTMLElement | null;
        while (prev) {
            if (prev.classList.contains('bt-folder-row')) {
                const depth = parseInt(prev.style.paddingLeft || '0');
                if (depth < currentDepth) return prev;
            }
            prev = prev.previousElementSibling as HTMLElement | null;
        }
        return null;
    }

    /**
     * 只更新文件夹行的计数和 checkbox 状态（不更新子节点）
     */
    private updateFolderCountOnly(folderRow: HTMLElement) {
        // 从该文件夹行向下收集所有子文件行，直到遇到同级或更浅的文件夹行
        const folderDepth = parseInt(folderRow.style.paddingLeft || '0');
        const childFiles: TFile[] = [];
        let sibling = folderRow.nextElementSibling as HTMLElement | null;
        while (sibling) {
            const siblingDepth = parseInt(sibling.style.paddingLeft || '0');
            // 遇到同级或更浅的文件夹行，说明子文件范围结束
            if (sibling.classList.contains('bt-folder-row') && siblingDepth <= folderDepth) break;
            if (sibling.classList.contains('bt-file-row')) {
                const filePath = (sibling as HTMLElement).dataset.path;
                if (filePath) {
                    // 从 allMediaFiles 中查找
                    const file = this.allMediaFiles.find(f => f.path === filePath);
                    if (file) childFiles.push(file);
                }
            }
            sibling = sibling.nextElementSibling as HTMLElement | null;
        }
        // 复用 updateFolderCheckbox 的计数和 checkbox 逻辑
        this.updateFolderCheckbox(folderRow, childFiles);
    }

    // ════════════════════════════════════════════════════
    // 辅助
    // ════════════════════════════════════════════════════

    private getVisibleFiles(): TFile[] {
        const filterText = this.filterInput.value.toLowerCase().trim();
        let files = this.allMediaFiles;
        if (this.showOnlyUntranscribed) {
            files = files.filter(f => !this.isAlreadyTranscribed(f));
        }
        if (filterText) {
            files = files.filter(f =>
                f.path.toLowerCase().includes(filterText) ||
                f.basename.toLowerCase().includes(filterText)
            );
        }
        return files;
    }

    private updateStartBtn() {
        this.startBtn.disabled = this.selectedFiles.size === 0;
        this.startBtn.textContent = this.selectedFiles.size > 0
            ? `🚀 开始批量转写 (${this.selectedFiles.size} 个)`
            : '🚀 开始批量转写';
    }

}
