/**
 * 🔍 模糊搜索模块
 * 提供转写原文的模糊搜索和跳转功能
 */

import { App, FuzzySuggestModal, MarkdownView, WorkspaceLeaf, TFile } from 'obsidian';
import { SegmentLine } from './types';

/** 全局记录：展开的 Callout 信息 */
interface ExpandedCallout {
    filePath: string;
    lineNumber: number;
}

/** 全局展开的 Callout 列表 */
let expandedCallouts: ExpandedCallout[] = [];

/**
 * 恢复所有展开的 Callout 折叠状态
 * @param app Obsidian App 实例
 */
export async function restoreCalloutFolds(app: App): Promise<void> {
    console.log("🔄 restoreCalloutFolds 被调用，记录数量:", expandedCallouts.length);
    
    if (expandedCallouts.length === 0) {
        console.log("⚠️ 没有需要恢复的 Callout");
        return;
    }

    console.log("📋 需要恢复的 Callout:", expandedCallouts);

    for (const callout of expandedCallouts) {
        const file = app.vault.getAbstractFileByPath(callout.filePath);
        if (!(file instanceof TFile)) {
            console.log("❌ 文件未找到:", callout.filePath);
            continue;
        }

        console.log("✅ 找到文件:", file.path);

        // 查找该文件所有打开的 Markdown 视图
        const leaves = app.workspace.getLeavesOfType('markdown');
        console.log("📄 打开的 Markdown 视图数量:", leaves.length);
        
        for (const leaf of leaves) {
            const view = leaf.view as MarkdownView;
            if (view.file?.path !== callout.filePath) continue;
            
            console.log("🎯 找到匹配的视图，当前模式:", view.getMode());
            
            // 记录原始模式
            const originalMode = view.getMode();
            const wasReadingMode = originalMode !== 'source';
            
            // 如果是阅读模式，切换到编辑模式
            if (wasReadingMode) {
                console.log("🔄 从阅读模式切换到编辑模式");
                const state = leaf.getViewState();
                await leaf.setViewState({
                    ...state,
                    state: { ...state.state, mode: 'source' }
                });
                // 等待模式切换完成
                await new Promise(resolve => setTimeout(resolve, 150));
            }

            // 现在应该在编辑模式，执行折叠恢复
            if (view.editor) {
                const editor = view.editor;
                const lineContent = editor.getLine(callout.lineNumber);
                console.log(`📍 行 ${callout.lineNumber} 内容:`, lineContent);

                // 如果这一行是展开的 callout，恢复折叠
                if (lineContent && lineContent.includes('> [!quote]') && !lineContent.includes('> [!quote]-')) {
                    const newLine = lineContent.replace('> [!quote]', '> [!quote]-');
                    console.log("✏️ 替换为:", newLine);
                    editor.replaceRange(
                        newLine,
                        { line: callout.lineNumber, ch: 0 },
                        { line: callout.lineNumber, ch: lineContent.length }
                    );
                    console.log("✅ 折叠已恢复");
                } else {
                    console.log("⚠️ 行内容不符合恢复条件");
                }
            } else {
                console.log("❌ 编辑器不可用");
            }
            
            // 如果原来是阅读模式，切换回阅读模式
            if (wasReadingMode) {
                console.log("🔄 切换回阅读模式");
                await new Promise(resolve => setTimeout(resolve, 150));
                const state = leaf.getViewState();
                await leaf.setViewState({
                    ...state,
                    state: { ...state.state, mode: 'preview' }
                });
            }
        }
    }

    // 清空记录
    expandedCallouts = [];
    console.log("🧹 已清空记录");
}

/**
 * 转写原文模糊搜索模态框
 * 支持搜索并跳转到原文位置，自动展开折叠的 Callout
 */
export class TranscriptionSearchModal extends FuzzySuggestModal<SegmentLine> {
    targetLeaf: WorkspaceLeaf;
    lines: string[];
    isEditMode: boolean;
    cachedItems: SegmentLine[];
    currentFilePath: string;

    constructor(app: App, targetLeaf: WorkspaceLeaf) {
        super(app);
        this.targetLeaf = targetLeaf;
        this.setPlaceholder("🔍 搜索转写原文（支持模糊匹配）...");

        // 判断是否为编辑模式
        const view = this.targetLeaf.view as MarkdownView;
        this.isEditMode = view.getMode() === 'source';
        this.lines = [];
        this.cachedItems = [];
        this.currentFilePath = view.file?.path || '';

        // 预加载数据
        this.preloadItems();
    }

    /**
     * 预加载搜索数据
     * 扫描所有以 "> **" 开头的行（转写原文）
     */
    async preloadItems() {
        const items: SegmentLine[] = [];
        const view = this.targetLeaf.view as MarkdownView;
        const file = view.file;

        if (!file) {
            this.cachedItems = items;
            return;
        }

        // 根据模式读取内容
        if (this.isEditMode) {
            // 编辑模式：使用 editor
            const editor = view.editor;
            const lineCount = editor.lineCount();
            this.lines = [];

            for (let i = 0; i < lineCount; i++) {
                const lineText = editor.getLine(i);
                this.lines.push(lineText);

                // 只搜索原文块内的内容（以 > ** 开头的行）
                if (lineText.trim().startsWith('> **')) {
                    // 提取纯文本内容（移除 Markdown 格式）
                    const cleanText = lineText
                        .replace(/^>\s*\*\*.*?\|.*?\]\]\*\*\s*/, '') // 移除时间戳链接
                        .trim();

                    if (cleanText.length > 0) {
                        items.push({
                            line: i,
                            text: cleanText,
                            preview: lineText.substring(0, 100)
                        });
                    }
                }
            }
        } else {
            // 阅读模式：读取文件内容
            const content = await this.app.vault.read(file);
            this.lines = content.split('\n');

            for (let i = 0; i < this.lines.length; i++) {
                const lineText = this.lines[i];

                if (lineText.trim().startsWith('> **')) {
                    const cleanText = lineText
                        .replace(/^>\s*\*\*.*?\|.*?\]\]\*\*\s*/, '')
                        .trim();

                    if (cleanText.length > 0) {
                        items.push({
                            line: i,
                            text: cleanText,
                            preview: lineText.substring(0, 100)
                        });
                    }
                }
            }
        }

        this.cachedItems = items;
    }

    getItems(): SegmentLine[] {
        return this.cachedItems;
    }

    getItemText(item: SegmentLine): string {
        return item.text;
    }

    onChooseItem(item: SegmentLine, evt: MouseEvent | KeyboardEvent) {
        const targetLine = item.line;
        const view = this.targetLeaf.view as MarkdownView;

        // 🔓 先查找 Callout 头部位置
        let calloutHeaderLine = -1;
        for (let i = targetLine; i >= 0; i--) {
            const lineContent = this.lines[i];
            if (lineContent && lineContent.includes('> [!quote]-')) {
                calloutHeaderLine = i;
                break;
            }
            // 优化：如果遇到另一个callout头或章节头，就停止搜索
            if (lineContent && (lineContent.startsWith('#### ') || i < targetLine - 50)) break;
        }

        // 🔄 如果是阅读模式，先切换到编辑模式
        const switchToEditMode = async () => {
            if (!this.isEditMode) {
                const state = this.targetLeaf.getViewState();
                await this.targetLeaf.setViewState({
                    ...state,
                    state: { ...state.state, mode: 'source' }
                });
                // 等待模式切换完成
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        };

        // 🛠️ 执行展开和跳转
        switchToEditMode().then(() => {
            const editor = view.editor;

            // 展开折叠的 Callout
            if (calloutHeaderLine !== -1) {
                const originalHeader = editor.getLine(calloutHeaderLine);
                console.log(`🔓 找到折叠的 Callout (行 ${calloutHeaderLine}):`, originalHeader);
                
                if (originalHeader.includes('> [!quote]-')) {
                    const newHeader = originalHeader.replace('> [!quote]-', '> [!quote]');
                    console.log("📝 展开为:", newHeader);
                    
                    editor.replaceRange(
                        newHeader,
                        { line: calloutHeaderLine, ch: 0 },
                        { line: calloutHeaderLine, ch: originalHeader.length }
                    );
                    
                    // 记录展开的 Callout，以便保存时恢复
                    if (this.currentFilePath) {
                        // 检查是否已记录，避免重复
                        const exists = expandedCallouts.some(
                            c => c.filePath === this.currentFilePath && c.lineNumber === calloutHeaderLine
                        );
                        if (!exists) {
                            expandedCallouts.push({
                                filePath: this.currentFilePath,
                                lineNumber: calloutHeaderLine
                            });
                            console.log("✅ 已记录展开的 Callout:", { 
                                filePath: this.currentFilePath, 
                                lineNumber: calloutHeaderLine 
                            });
                            console.log("📊 当前记录总数:", expandedCallouts.length);
                        } else {
                            console.log("⚠️ 该 Callout 已记录，跳过");
                        }
                    } else {
                        console.log("❌ currentFilePath 为空，无法记录");
                    }
                }
            }

            // 跳转到目标行
            editor.setCursor({ line: targetLine, ch: 0 });
            editor.focus();
            
            // 如果原来是阅读模式，延迟切换回阅读模式
            if (!this.isEditMode) {
                setTimeout(async () => {
                    const state = this.targetLeaf.getViewState();
                    await this.targetLeaf.setViewState({
                        ...state,
                        state: { ...state.state, mode: 'preview' }
                    });
                    console.log('📖 已切换回阅读模式');
                }, 200);
            }
        });
    }
}
