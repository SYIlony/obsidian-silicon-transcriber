/**
 * 🧠 思维导图分支组装与迁移交互弹窗
 *
 * 功能：
 * 1. 打开当前思维导图，实时进行全覆盖拓扑解析与不重不漏校验
 * 2. 清晰展示所有二级分支与独立游离分支列表及所含节点总数
 * 3. 勾选需要组装/复制的分支
 * 4. 搜索或选择目标思维导图文件
 * 5. 选择操作模式（复制追加 vs 剪切迁移）并原子执行
 */

import { App, FuzzySuggestModal, Modal, Notice, Setting, TFile } from 'obsidian';
import {
    parseAndAnalyzeRichMindmap,
    migrateMindmapGroups,
    MindmapAnalysisResult,
    MindmapGroup,
    MigrateMode,
    isMindmapFile
} from './rich-mindmap-manager';

/**
 * 目标思维导图全库模糊选择器
 */
export class TargetMindmapPickerModal extends FuzzySuggestModal<TFile> {
    private onPick: (file: TFile) => void;
    private excludeFile?: TFile | null;

    constructor(app: App, excludeFile: TFile | null | undefined, onPick: (file: TFile) => void) {
        super(app);
        this.excludeFile = excludeFile;
        this.onPick = onPick;
        this.setPlaceholder('搜索思维导图（输入关键词搜索全库导图，支持已重命名文件）…');
    }

    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles()
            .filter(f => (!this.excludeFile || f.path !== this.excludeFile.path) && isMindmapFile(this.app, f))
            .sort((a, b) => (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0));
    }

    getItemText(item: TFile): string {
        const cache = this.app.metadataCache.getFileCache(item);
        const fmPlugin = cache?.frontmatter?.['mindmap-plugin'];
        const tag = fmPlugin === 'rich' ? '🧠 [Rich]' : (fmPlugin === 'basic' ? '📝 [Basic]' : '🧠 [导图]');
        return `${tag} ${item.path}`;
    }

    onChooseItem(item: TFile): void {
        this.onPick(item);
    }
}

/**
 * 思维导图组装迁移主弹窗
 */
export class MindmapBranchMigrateModal extends Modal {
    private sourceFile: TFile;
    private analysis: MindmapAnalysisResult | null = null;
    private selectedGroupIds = new Set<string>();
    private targetFile: TFile | null = null;
    private mode: MigrateMode = 'copy';

    private targetDisplayEl!: HTMLElement;
    private summaryCountEl!: HTMLElement;
    private executeBtn!: HTMLButtonElement;
    private groupsContainerEl!: HTMLElement;

    constructor(app: App, sourceFile: TFile) {
        super(app);
        this.sourceFile = sourceFile;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mindmap-branch-migrate-modal');

        this.injectStyles();

        contentEl.createEl('h2', { text: '🧠 思维导图分支组装与迁移' });
        contentEl.createEl('div', {
            cls: 'mbm-note-path',
            text: `源文件：${this.sourceFile.path}`
        });

        // 异步加载与分析源文件
        const loadingEl = contentEl.createEl('div', {
            cls: 'mbm-loading',
            text: '⏳ 正在解析思维导图节点拓扑与分支结构…'
        });

        try {
            const content = await this.app.vault.read(this.sourceFile);
            this.analysis = parseAndAnalyzeRichMindmap(content);
            loadingEl.remove();
            this.renderMainContent(contentEl);
        } catch (err: unknown) {
            loadingEl.remove();
            const errorMsg = err instanceof Error ? err.message : String(err);
            contentEl.createEl('div', {
                cls: 'mbm-error',
                text: `❌ 无法解析该思维导图：${errorMsg}`
            });
        }
    }

    private renderMainContent(container: HTMLElement): void {
        if (!this.analysis) return;

        // 1. 结构与覆盖率信息条
        const infoBar = container.createEl('div', { cls: 'mbm-info-bar' });
        const rootTitle = this.analysis.rootNode?.text || '(未定义主标题)';
        infoBar.createEl('div', {
            cls: 'mbm-info-item',
            text: `🎯 主根节点：${rootTitle}`
        });

        const coverageText = this.analysis.isComplete
            ? `✅ 节点覆盖率：${this.analysis.totalNodeCount}/${this.analysis.totalNodeCount}（100% 完整，无遗漏）`
            : `⚠️ 节点统计：已解析 ${this.analysis.accountedNodeCount}/${this.analysis.totalNodeCount} 个节点`;

        infoBar.createEl('div', {
            cls: `mbm-info-item ${this.analysis.isComplete ? 'mbm-success' : 'mbm-warning'}`,
            text: coverageText
        });

        // 2. 分支选择区域工具条
        const branchHeader = container.createEl('div', { cls: 'mbm-section-header' });
        branchHeader.createEl('h3', { text: `📋 分支列表（共 ${this.analysis.groups.length} 个分类）` });

        const quickActions = branchHeader.createEl('div', { cls: 'mbm-quick-actions' });
        const selectAllBtn = quickActions.createEl('button', { text: '全选', cls: 'mod-small' });
        const deselectAllBtn = quickActions.createEl('button', { text: '清空', cls: 'mod-small' });

        selectAllBtn.onclick = () => {
            this.analysis?.groups.forEach(g => this.selectedGroupIds.add(g.id));
            this.refreshSelectionState();
        };

        deselectAllBtn.onclick = () => {
            this.selectedGroupIds.clear();
            this.refreshSelectionState();
        };

        // 3. 分支卡片列表容器
        this.groupsContainerEl = container.createEl('div', { cls: 'mbm-groups-list' });
        this.renderGroupCards();

        // 4. 目标思维导图选择器
        const targetSection = container.createEl('div', { cls: 'mbm-target-section' });
        targetSection.createEl('h4', { text: '🎯 目标思维导图' });

        const targetRow = targetSection.createEl('div', { cls: 'mbm-target-row' });
        this.targetDisplayEl = targetRow.createEl('span', {
            cls: 'mbm-target-path',
            text: this.targetFile ? this.targetFile.path : '尚未选择目标导图文件'
        });

        const pickTargetBtn = targetRow.createEl('button', { text: '🔍 浏览全库导图…' });
        pickTargetBtn.onclick = () => {
            new TargetMindmapPickerModal(this.app, this.sourceFile, (chosen) => {
                this.targetFile = chosen;
                this.targetDisplayEl.setText(`已选择：${chosen.path}`);
                this.targetDisplayEl.addClass('is-selected');
                this.updateExecuteButtonState();
            }).open();
        };

        // 5. 操作模式设置 (复制 vs 迁移)
        new Setting(container)
            .setName('操作模式')
            .setDesc('复制模式会保留源导图的内容；迁移模式会在成功追加后从当前导图中移除所选分支。')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('copy', '📋 复制并追加 (推荐，原导图保留)')
                    .addOption('move', '✂️ 剪切并迁移 (原导图彻底移除)')
                    .setValue(this.mode)
                    .onChange(val => {
                        this.mode = val === 'move' ? 'move' : 'copy';
                        this.updateExecuteButtonState();
                    });
            });

        // 6. 底部统计与执行操作条
        const footerEl = container.createEl('div', { cls: 'mbm-footer' });
        this.summaryCountEl = footerEl.createEl('div', { cls: 'mbm-summary-count' });

        const btnRow = footerEl.createEl('div', { cls: 'mbm-btn-row' });
        const cancelBtn = btnRow.createEl('button', { text: '取消' });
        cancelBtn.onclick = () => this.close();

        this.executeBtn = btnRow.createEl('button', {
            text: '开始执行迁移',
            cls: 'mod-cta'
        });
        this.executeBtn.onclick = () => this.handleExecute();

        // 默认全选所有次级分支
        this.analysis.groups.forEach(g => this.selectedGroupIds.add(g.id));
        this.refreshSelectionState();
    }

    private renderGroupCards(): void {
        if (!this.analysis || !this.groupsContainerEl) return;
        this.groupsContainerEl.empty();

        for (const group of this.analysis.groups) {
            const cardEl = this.groupsContainerEl.createEl('div', {
                cls: `mbm-group-card ${this.selectedGroupIds.has(group.id) ? 'is-checked' : ''}`
            });

            const topRow = cardEl.createEl('label', { cls: 'mbm-card-top-row' });
            const checkbox = topRow.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.selectedGroupIds.has(group.id);

            checkbox.onchange = () => {
                if (checkbox.checked) {
                    this.selectedGroupIds.add(group.id);
                } else {
                    this.selectedGroupIds.delete(group.id);
                }
                this.refreshSelectionState();
            };

            const badgeCls = group.type === 'secondary' ? 'mbm-badge-secondary' : 'mbm-badge-orphan';
            const badgeLabel = group.type === 'secondary' ? '次级分支' : '独立节点组';
            topRow.createEl('span', { cls: `mbm-badge ${badgeCls}`, text: badgeLabel });

            topRow.createEl('span', { cls: 'mbm-card-title', text: group.title });
            topRow.createEl('span', {
                cls: 'mbm-card-nodes-count',
                text: `${group.nodeCount} 个节点`
            });

            // 如果该组节点多于 1 个，提供子节点文本缩略预览
            if (group.nodes.length > 1) {
                const previewSubs = group.nodes
                    .slice(1, 4)
                    .map(n => n.text?.replace(/<[^>]*>/g, '').trim() || '')
                    .filter(t => t.length > 0);

                if (previewSubs.length > 0) {
                    const previewEl = cardEl.createEl('div', { cls: 'mbm-card-preview' });
                    previewEl.setText(`包含：${previewSubs.join('  |  ')}${group.nodes.length > 4 ? ' …' : ''}`);
                }
            }
        }
    }

    private refreshSelectionState(): void {
        if (!this.analysis) return;

        // 更新卡片视觉样式
        const cards = this.groupsContainerEl.querySelectorAll<HTMLElement>('.mbm-group-card');
        let cardIdx = 0;
        for (const group of this.analysis.groups) {
            const card = cards[cardIdx];
            if (card) {
                const isSelected = this.selectedGroupIds.has(group.id);
                if (isSelected) {
                    card.addClass('is-checked');
                } else {
                    card.removeClass('is-checked');
                }
                const input = card.querySelector<HTMLInputElement>('input[type="checkbox"]');
                if (input) input.checked = isSelected;
            }
            cardIdx++;
        }

        // 计算选中节点总数
        let selectedNodeCount = 0;
        for (const g of this.analysis.groups) {
            if (this.selectedGroupIds.has(g.id)) {
                selectedNodeCount += g.nodeCount;
            }
        }

        this.summaryCountEl.setText(
            `已选 ${this.selectedGroupIds.size} / ${this.analysis.groups.length} 个分支，共计 ${selectedNodeCount} 个节点`
        );

        this.updateExecuteButtonState();
    }

    private updateExecuteButtonState(): void {
        const canExecute = this.selectedGroupIds.size > 0 && this.targetFile !== null;
        this.executeBtn.disabled = !canExecute;
        const actionVerb = this.mode === 'move' ? '剪切迁移' : '复制追加';
        this.executeBtn.setText(`${actionVerb}所选分支`);
    }

    private async handleExecute(): Promise<void> {
        if (!this.targetFile || this.selectedGroupIds.size === 0) return;

        this.executeBtn.disabled = true;
        this.executeBtn.setText('⏳ 正在组装与重排坐标…');

        try {
            const sourceMarkdown = await this.app.vault.read(this.sourceFile);
            const targetMarkdown = await this.app.vault.read(this.targetFile);

            const result = migrateMindmapGroups(
                sourceMarkdown,
                targetMarkdown,
                Array.from(this.selectedGroupIds),
                this.mode
            );

            // 1. 写入目标思维导图
            await this.app.vault.modify(this.targetFile, result.targetUpdatedContent);

            // 2. 若为剪切模式，更新源思维导图
            if (this.mode === 'move' && result.sourceUpdatedContent) {
                await this.app.vault.modify(this.sourceFile, result.sourceUpdatedContent);
            }

            const actionVerb = this.mode === 'move' ? '迁移' : '复制';
            new Notice(
                `🎉 成功${actionVerb} ${result.migratedGroupCount} 个分支（共 ${result.migratedNodeCount} 个节点）至 ${this.targetFile.basename}！`,
                6000
            );

            this.close();
        } catch (err: unknown) {
            this.executeBtn.disabled = false;
            this.updateExecuteButtonState();
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`❌ 组装迁移失败: ${msg}`, 8000);
        }
    }

    private injectStyles(): void {
        const id = 'silicon-transcriber-migrate-modal-styles';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
            .mindmap-branch-migrate-modal {
                max-width: 680px;
                padding: 10px 14px;
            }
            .mbm-note-path {
                color: var(--text-muted);
                font-size: 12px;
                margin-bottom: 12px;
                word-break: break-all;
            }
            .mbm-info-bar {
                background: var(--background-secondary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 8px;
                padding: 10px 14px;
                margin-bottom: 16px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                font-size: 13px;
            }
            .mbm-success {
                color: var(--text-success, #4caf50);
                font-weight: 500;
            }
            .mbm-warning {
                color: var(--text-warning, #ff9800);
            }
            .mbm-section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            .mbm-section-header h3 {
                margin: 0;
                font-size: 14px;
            }
            .mbm-quick-actions {
                display: flex;
                gap: 6px;
            }
            .mbm-groups-list {
                max-height: 240px;
                overflow-y: auto;
                border: 1px solid var(--background-modifier-border);
                border-radius: 8px;
                padding: 8px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-bottom: 16px;
            }
            .mbm-group-card {
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                padding: 8px 10px;
                transition: all 0.15s ease;
            }
            .mbm-group-card.is-checked {
                border-color: var(--interactive-accent);
                background: var(--background-secondary-alt, var(--background-secondary));
            }
            .mbm-card-top-row {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                user-select: none;
            }
            .mbm-badge {
                font-size: 11px;
                padding: 1px 6px;
                border-radius: 4px;
                font-weight: 500;
            }
            .mbm-badge-secondary {
                background: rgba(0, 229, 255, 0.15);
                color: #00bcd4;
            }
            .mbm-badge-orphan {
                background: rgba(255, 152, 0, 0.15);
                color: #ff9800;
            }
            .mbm-card-title {
                flex: 1;
                font-weight: 500;
                font-size: 13px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mbm-card-nodes-count {
                font-size: 12px;
                color: var(--text-muted);
            }
            .mbm-card-preview {
                margin-top: 4px;
                margin-left: 26px;
                font-size: 11px;
                color: var(--text-muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mbm-target-section {
                margin-bottom: 12px;
            }
            .mbm-target-section h4 {
                margin: 0 0 6px 0;
                font-size: 13px;
            }
            .mbm-target-row {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .mbm-target-path {
                flex: 1;
                font-size: 12px;
                color: var(--text-muted);
                background: var(--background-secondary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                padding: 6px 10px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mbm-target-path.is-selected {
                color: var(--text-normal);
                border-color: var(--interactive-accent);
            }
            .mbm-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 16px;
                padding-top: 12px;
                border-top: 1px solid var(--background-modifier-border);
            }
            .mbm-summary-count {
                font-size: 12px;
                color: var(--text-muted);
            }
            .mbm-btn-row {
                display: flex;
                gap: 8px;
            }
        `;
        document.head.appendChild(style);
    }
}
