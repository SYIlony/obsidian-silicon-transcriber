"use strict";
/**
 * 🔍 模糊搜索模块
 * 提供转写原文的模糊搜索和跳转功能
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranscriptionSearchModal = void 0;
exports.restoreCalloutFolds = restoreCalloutFolds;
const obsidian_1 = require("obsidian");
/** 全局展开的 Callout 列表 */
let expandedCallouts = [];
/**
 * 恢复所有展开的 Callout 折叠状态
 * @param app Obsidian App 实例
 */
function restoreCalloutFolds(app) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log("🔄 restoreCalloutFolds 被调用，记录数量:", expandedCallouts.length);
        if (expandedCallouts.length === 0) {
            console.log("⚠️ 没有需要恢复的 Callout");
            return;
        }
        console.log("📋 需要恢复的 Callout:", expandedCallouts);
        for (const callout of expandedCallouts) {
            const file = app.vault.getAbstractFileByPath(callout.filePath);
            if (!(file instanceof obsidian_1.TFile)) {
                console.log("❌ 文件未找到:", callout.filePath);
                continue;
            }
            console.log("✅ 找到文件:", file.path);
            // 查找该文件所有打开的 Markdown 视图
            const leaves = app.workspace.getLeavesOfType('markdown');
            console.log("📄 打开的 Markdown 视图数量:", leaves.length);
            for (const leaf of leaves) {
                const view = leaf.view;
                if (((_a = view.file) === null || _a === void 0 ? void 0 : _a.path) !== callout.filePath)
                    continue;
                console.log("🎯 找到匹配的视图，当前模式:", view.getMode());
                // 记录原始模式
                const originalMode = view.getMode();
                const wasReadingMode = originalMode !== 'source';
                // 如果是阅读模式，切换到编辑模式
                if (wasReadingMode) {
                    console.log("🔄 从阅读模式切换到编辑模式");
                    const state = leaf.getViewState();
                    yield leaf.setViewState(Object.assign(Object.assign({}, state), { state: Object.assign(Object.assign({}, state.state), { mode: 'source' }) }));
                    // 等待模式切换完成
                    yield new Promise(resolve => setTimeout(resolve, 150));
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
                        editor.replaceRange(newLine, { line: callout.lineNumber, ch: 0 }, { line: callout.lineNumber, ch: lineContent.length });
                        console.log("✅ 折叠已恢复");
                    }
                    else {
                        console.log("⚠️ 行内容不符合恢复条件");
                    }
                }
                else {
                    console.log("❌ 编辑器不可用");
                }
                // 如果原来是阅读模式，切换回阅读模式
                if (wasReadingMode) {
                    console.log("🔄 切换回阅读模式");
                    yield new Promise(resolve => setTimeout(resolve, 150));
                    const state = leaf.getViewState();
                    yield leaf.setViewState(Object.assign(Object.assign({}, state), { state: Object.assign(Object.assign({}, state.state), { mode: 'preview' }) }));
                }
            }
        }
        // 清空记录
        expandedCallouts = [];
        console.log("🧹 已清空记录");
    });
}
/**
 * 转写原文模糊搜索模态框
 * 支持搜索并跳转到原文位置，自动展开折叠的 Callout
 */
class TranscriptionSearchModal extends obsidian_1.FuzzySuggestModal {
    constructor(app, targetLeaf) {
        var _a;
        super(app);
        this.targetLeaf = targetLeaf;
        this.setPlaceholder("🔍 搜索转写原文（支持模糊匹配）...");
        // 判断是否为编辑模式
        const view = this.targetLeaf.view;
        this.isEditMode = view.getMode() === 'source';
        this.lines = [];
        this.cachedItems = [];
        this.currentFilePath = ((_a = view.file) === null || _a === void 0 ? void 0 : _a.path) || '';
        // 预加载数据
        this.preloadItems();
    }
    /**
     * 预加载搜索数据
     * 扫描所有以 "> **" 开头的行（转写原文）
     */
    preloadItems() {
        return __awaiter(this, void 0, void 0, function* () {
            const items = [];
            const view = this.targetLeaf.view;
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
            }
            else {
                // 阅读模式：读取文件内容
                const content = yield this.app.vault.read(file);
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
        });
    }
    getItems() {
        return this.cachedItems;
    }
    getItemText(item) {
        return item.text;
    }
    onChooseItem(item, evt) {
        const targetLine = item.line;
        const view = this.targetLeaf.view;
        // 🔓 先查找 Callout 头部位置
        let calloutHeaderLine = -1;
        for (let i = targetLine; i >= 0; i--) {
            const lineContent = this.lines[i];
            if (lineContent && lineContent.includes('> [!quote]-')) {
                calloutHeaderLine = i;
                break;
            }
            // 优化：如果遇到另一个callout头或章节头，就停止搜索
            if (lineContent && (lineContent.startsWith('#### ') || i < targetLine - 50))
                break;
        }
        // 🔄 如果是阅读模式，先切换到编辑模式
        const switchToEditMode = () => __awaiter(this, void 0, void 0, function* () {
            if (!this.isEditMode) {
                const state = this.targetLeaf.getViewState();
                yield this.targetLeaf.setViewState(Object.assign(Object.assign({}, state), { state: Object.assign(Object.assign({}, state.state), { mode: 'source' }) }));
                // 等待模式切换完成
                yield new Promise(resolve => setTimeout(resolve, 100));
            }
        });
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
                    editor.replaceRange(newHeader, { line: calloutHeaderLine, ch: 0 }, { line: calloutHeaderLine, ch: originalHeader.length });
                    // 记录展开的 Callout，以便保存时恢复
                    if (this.currentFilePath) {
                        // 检查是否已记录，避免重复
                        const exists = expandedCallouts.some(c => c.filePath === this.currentFilePath && c.lineNumber === calloutHeaderLine);
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
                        }
                        else {
                            console.log("⚠️ 该 Callout 已记录，跳过");
                        }
                    }
                    else {
                        console.log("❌ currentFilePath 为空，无法记录");
                    }
                }
            }
            // 跳转到目标行
            editor.setCursor({ line: targetLine, ch: 0 });
            editor.focus();
            // 如果原来是阅读模式，延迟切换回阅读模式
            if (!this.isEditMode) {
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    const state = this.targetLeaf.getViewState();
                    yield this.targetLeaf.setViewState(Object.assign(Object.assign({}, state), { state: Object.assign(Object.assign({}, state.state), { mode: 'preview' }) }));
                    console.log('📖 已切换回阅读模式');
                }), 200);
            }
        });
    }
}
exports.TranscriptionSearchModal = TranscriptionSearchModal;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoLW1vZGFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2VhcmNoLW1vZGFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7Ozs7Ozs7Ozs7OztBQWtCSCxrREFvRkM7QUFwR0QsdUNBQXNGO0FBU3RGLHVCQUF1QjtBQUN2QixJQUFJLGdCQUFnQixHQUFzQixFQUFFLENBQUM7QUFFN0M7OztHQUdHO0FBQ0gsU0FBc0IsbUJBQW1CLENBQUMsR0FBUTs7O1FBQzlDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLEVBQUUsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFekUsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDaEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1lBQ2xDLE9BQU87UUFDWCxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBRW5ELEtBQUssTUFBTSxPQUFPLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUNyQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMvRCxJQUFJLENBQUMsQ0FBQyxJQUFJLFlBQVksZ0JBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzNCLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDMUMsU0FBUztZQUNiLENBQUM7WUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFbEMseUJBQXlCO1lBQ3pCLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3pELE9BQU8sQ0FBQyxHQUFHLENBQUMs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QVEsRUFBRSxJQUFJLENBQUMsZUFBZTtnQ0FDOUIsVUFBVSxFQUFFLGlCQUFpQjs2QkFDaEMsQ0FBQyxDQUFDOzRCQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUN2RCxDQUFDOzZCQUFNLENBQUM7NEJBQ0osT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO3dCQUN2QyxDQUFDO29CQUNMLENBQUM7eUJBQU0sQ0FBQzt3QkFDSixPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUFDLENBQUM7b0JBQzdDLENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUM7WUFFRCxTQUFTO1lBQ1QsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDOUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBRWYsc0JBQXNCO1lBQ3RCLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ25CLFVBQVUsQ0FBQyxHQUFTLEVBQUU7b0JBQ2xCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBQzdDLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLGlDQUMzQixLQUFLLEtBQ1IsS0FBSyxrQ0FBTyxLQUFLLENBQUMsS0FBSyxLQUFFLElBQUksRUFBRSxTQUFTLE9BQzFDLENBQUM7b0JBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDL0IsQ0FBQyxDQUFBLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDWixDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUE3TEQsNERBNkxDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIPCflI0g5qih57OK5pCc57Si5qih5Z2XXHJcbiAqIOaPkOS+m+i9rOWGmeWOn+aWh+eahOaooeeziuaQnOe0ouWSjOi3s+i9rOWKn+iDvVxyXG4gKi9cclxuXHJcbmltcG9ydCB7IEFwcCwgRnV6enlTdWdnZXN0TW9kYWwsIE1hcmtkb3duVmlldywgV29ya3NwYWNlTGVhZiwgVEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XHJcbmltcG9ydCB7IFNlZ21lbnRMaW5lIH0gZnJvbSAnLi90eXBlcyc7XHJcblxyXG4vKiog5YWo5bGA6K6w5b2V77ya5bGV5byA55qEIENhbGxvdXQg5L+h5oGvICovXHJcbmludGVyZmFjZSBFeHBhbmRlZENhbGxvdXQge1xyXG4gICAgZmlsZVBhdGg6IHN0cmluZztcclxuICAgIGxpbmVOdW1iZXI6IG51bWJlcjtcclxufVxyXG5cclxuLyoqIOWFqOWxgOWxleW8gOeahCBDYWxsb3V0IOWIl+ihqCAqL1xyXG5sZXQgZXhwYW5kZWRDYWxsb3V0czogRXhwYW5kZWRDYWxsb3V0W10gPSBbXTtcclxuXHJcbi8qKlxyXG4gKiDmgaLlpI3miYDmnInlsZXlvIDnmoQgQ2FsbG91dCDmipjlj6DnirbmgIFcclxuICogQHBhcmFtIGFwcCBPYnNpZGlhbiBBcHAg5a6e5L6LXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzdG9yZUNhbGxvdXRGb2xkcyhhcHA6IEFwcCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coXCLwn5SEIHJlc3RvcmVDYWxsb3V0Rm9sZHMg6KKr6LCD55So77yM6K6w5b2V5pWw6YePOlwiLCBleHBhbmRlZENhbGxvdXRzLmxlbmd0aCk7XHJcbiAgICBcclxuICAgIGlmIChleHBhbmRlZENhbGxvdXRzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwi4pqg77iPIOayoeaciemcgOimgeaBouWkjeeahCBDYWxsb3V0XCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhcIvCfk4sg6ZyA6KaB5oGi5aSN55qEIENhbGxvdXQ6XCIsIGV4cGFuZGVkQ2FsbG91dHMpO1xyXG5cclxuICAgIGZvciAoY29uc3QgY2FsbG91dCBvZiBleHBhbmRlZENhbGxvdXRzKSB7XHJcbiAgICAgICAgY29uc3QgZmlsZSA9IGFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoY2FsbG91dC5maWxlUGF0aCk7XHJcbiAgICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIuKdjCDmlofku7bmnKrmib7liLA6XCIsIGNhbGxvdXQuZmlsZVBhdGgpO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKFwi4pyFIOaJvuWIsOaWh+S7tjpcIiwgZmlsZS5wYXRoKTtcclxuXHJcbiAgICAgICAgLy8g5p+l5om+6K+l5paH5Lu25omA5pyJ5omT5byA55qEIE1hcmtkb3duIOinhuWbvlxyXG4gICAgICAgIGNvbnN0IGxlYXZlcyA9IGFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKCdtYXJrZG93bicpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwi8J+ThCDmiZPlvIDnmoQgTWFya2Rvd24g6KeG5Zu+5pWw6YePOlwiLCBsZWF2ZXMubGVuZ3RoKTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHZpZXcgPSBsZWFmLnZpZXcgYXMgTWFya2Rvd25WaWV3O1xyXG4gICAgICAgICAgICBpZiAodmlldy5maWxlPy5wYXRoICE9PSBjYWxsb3V0LmZpbGVQYXRoKSBjb250aW51ZTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwi8J+OryDmib7liLDljLnphY3nmoTop4blm77vvIzlvZPliY3mqKHlvI86XCIsIHZpZXcuZ2V0TW9kZSgpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIOiusOW9leWOn+Wni+aooeW8j1xyXG4gICAgICAgICAgICBjb25zdCBvcmlnaW5hbE1vZGUgPSB2aWV3LmdldE1vZGUoKTtcclxuICAgICAgICAgICAgY29uc3Qgd2FzUmVhZGluZ01vZGUgPSBvcmlnaW5hbE1vZGUgIT09ICdzb3VyY2UnO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8g5aaC5p6c5piv6ZiF6K+75qih5byP77yM5YiH5o2i5Yiw57yW6L6R5qih5byPXHJcbiAgICAgICAgICAgIGlmICh3YXNSZWFkaW5nTW9kZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCLwn5SEIOS7jumYheivu+aooeW8j+WIh+aNouWIsOe8lui+keaooeW8j1wiKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gbGVhZi5nZXRWaWV3U3RhdGUoKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IGxlYWYuc2V0Vmlld1N0YXRlKHtcclxuICAgICAgICAgICAgICAgICAgICAuLi5zdGF0ZSxcclxuICAgICAgICAgICAgICAgICAgICBzdGF0ZTogeyAuLi5zdGF0ZS5zdGF0ZSwgbW9kZTogJ3NvdXJjZScgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAvLyDnrYnlvoXmqKHlvI/liIfmjaLlrozmiJBcclxuICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxNTApKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8g546w5Zyo5bqU6K+l5Zyo57yW6L6R5qih5byP77yM5omn6KGM5oqY5Y+g5oGi5aSNXHJcbiAgICAgICAgICAgIGlmICh2aWV3LmVkaXRvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZWRpdG9yID0gdmlldy5lZGl0b3I7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lQ29udGVudCA9IGVkaXRvci5nZXRMaW5lKGNhbGxvdXQubGluZU51bWJlcik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TjSDooYwgJHtjYWxsb3V0LmxpbmVOdW1iZXJ9IOWGheWuuTpgLCBsaW5lQ29udGVudCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8g5aaC5p6c6L+Z5LiA6KGM5piv5bGV5byA55qEIGNhbGxvdXTvvIzmgaLlpI3mipjlj6BcclxuICAgICAgICAgICAgICAgIGlmIChsaW5lQ29udGVudCAmJiBsaW5lQ29udGVudC5pbmNsdWRlcygnPiBbIXF1b3RlXScpICYmICFsaW5lQ29udGVudC5pbmNsdWRlcygnPiBbIXF1b3RlXS0nKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0xpbmUgPSBsaW5lQ29udGVudC5yZXBsYWNlKCc+IFshcXVvdGVdJywgJz4gWyFxdW90ZV0tJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCLinI/vuI8g5pu/5o2i5Li6OlwiLCBuZXdMaW5lKTtcclxuICAgICAgICAgICAgICAgICAgICBlZGl0b3IucmVwbGFjZVJhbmdlKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdMaW5lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7IGxpbmU6IGNhbGxvdXQubGluZU51bWJlciwgY2g6IDAgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyBsaW5lOiBjYWxsb3V0LmxpbmVOdW1iZXIsIGNoOiBsaW5lQ29udGVudC5sZW5ndGggfVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCLinIUg5oqY5Y+g5bey5oGi5aSNXCIpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIuKaoO+4jyDooYzlhoXlrrnkuI3nrKblkIjmgaLlpI3mnaHku7ZcIik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIuKdjCDnvJbovpHlmajkuI3lj6/nlKhcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIOWmguaenOWOn+adpeaYr+mYheivu+aooeW8j++8jOWIh+aNouWbnumYheivu+aooeW8j1xyXG4gICAgICAgICAgICBpZiAod2FzUmVhZGluZ01vZGUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwi8J+UhCDliIfmjaLlm57pmIXor7vmqKHlvI9cIik7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTUwKSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGxlYWYuZ2V0Vmlld1N0YXRlKCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBsZWFmLnNldFZpZXdTdGF0ZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgLi4uc3RhdGUsXHJcbiAgICAgICAgICAgICAgICAgICAgc3RhdGU6IHsgLi4uc3RhdGUuc3RhdGUsIG1vZGU6ICdwcmV2aWV3JyB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyDmuIXnqbrorrDlvZVcclxuICAgIGV4cGFuZGVkQ2FsbG91dHMgPSBbXTtcclxuICAgIGNvbnNvbGUubG9nKFwi8J+nuSDlt7LmuIXnqbrorrDlvZVcIik7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDovazlhpnljp/mlofmqKHns4rmkJzntKLmqKHmgIHmoYZcclxuICog5pSv5oyB5pCc57Si5bm26Lez6L2s5Yiw5Y6f5paH5L2N572u77yM6Ieq5Yqo5bGV5byA5oqY5Y+g55qEIENhbGxvdXRcclxuICovXHJcbmV4cG9ydCBjbGFzcyBUcmFuc2NyaXB0aW9uU2VhcmNoTW9kYWwgZXh0ZW5kcyBGdXp6eVN1Z2dlc3RNb2RhbDxTZWdtZW50TGluZT4ge1xyXG4gICAgdGFyZ2V0TGVhZjogV29ya3NwYWNlTGVhZjtcclxuICAgIGxpbmVzOiBzdHJpbmdbXTtcclxuICAgIGlzRWRpdE1vZGU6IGJvb2xlYW47XHJcbiAgICBjYWNoZWRJdGVtczogU2VnbWVudExpbmVbXTtcclxuICAgIGN1cnJlbnRGaWxlUGF0aDogc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLCB0YXJnZXRMZWFmOiBXb3Jrc3BhY2VMZWFmKSB7XHJcbiAgICAgICAgc3VwZXIoYXBwKTtcclxuICAgICAgICB0aGlzLnRhcmdldExlYWYgPSB0YXJnZXRMZWFmO1xyXG4gICAgICAgIHRoaXMuc2V0UGxhY2Vob2xkZXIoXCLwn5SNIOaQnOe0oui9rOWGmeWOn+aWh++8iOaUr+aMgeaooeeziuWMuemFje+8iS4uLlwiKTtcclxuXHJcbiAgICAgICAgLy8g5Yik5pat5piv5ZCm5Li657yW6L6R5qih5byPXHJcbiAgICAgICAgY29uc3QgdmlldyA9IHRoaXMudGFyZ2V0TGVhZi52aWV3IGFzIE1hcmtkb3duVmlldztcclxuICAgICAgICB0aGlzLmlzRWRpdE1vZGUgPSB2aWV3LmdldE1vZGUoKSA9PT0gJ3NvdXJjZSc7XHJcbiAgICAgICAgdGhpcy5saW5lcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuY2FjaGVkSXRlbXMgPSBbXTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRGaWxlUGF0aCA9IHZpZXcuZmlsZT8ucGF0aCB8fCAnJztcclxuXHJcbiAgICAgICAgLy8g6aKE5Yqg6L295pWw5o2uXHJcbiAgICAgICAgdGhpcy5wcmVsb2FkSXRlbXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOmihOWKoOi9veaQnOe0ouaVsOaNrlxyXG4gICAgICog5omr5o+P5omA5pyJ5LulIFwiPiAqKlwiIOW8gOWktOeahOihjO+8iOi9rOWGmeWOn+aWh++8iVxyXG4gICAgICovXHJcbiAgICBhc3luYyBwcmVsb2FkSXRlbXMoKSB7XHJcbiAgICAgICAgY29uc3QgaXRlbXM6IFNlZ21lbnRMaW5lW10gPSBbXTtcclxuICAgICAgICBjb25zdCB2aWV3ID0gdGhpcy50YXJnZXRMZWFmLnZpZXcgYXMgTWFya2Rvd25WaWV3O1xyXG4gICAgICAgIGNvbnN0IGZpbGUgPSB2aWV3LmZpbGU7XHJcblxyXG4gICAgICAgIGlmICghZmlsZSkge1xyXG4gICAgICAgICAgICB0aGlzLmNhY2hlZEl0ZW1zID0gaXRlbXM7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIOagueaNruaooeW8j+ivu+WPluWGheWuuVxyXG4gICAgICAgIGlmICh0aGlzLmlzRWRpdE1vZGUpIHtcclxuICAgICAgICAgICAgLy8g57yW6L6R5qih5byP77ya5L2/55SoIGVkaXRvclxyXG4gICAgICAgICAgICBjb25zdCBlZGl0b3IgPSB2aWV3LmVkaXRvcjtcclxuICAgICAgICAgICAgY29uc3QgbGluZUNvdW50ID0gZWRpdG9yLmxpbmVDb3VudCgpO1xyXG4gICAgICAgICAgICB0aGlzLmxpbmVzID0gW107XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVDb3VudDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lVGV4dCA9IGVkaXRvci5nZXRMaW5lKGkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5saW5lcy5wdXNoKGxpbmVUZXh0KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyDlj6rmkJzntKLljp/mloflnZflhoXnmoTlhoXlrrnvvIjku6UgPiAqKiDlvIDlpLTnmoTooYzvvIlcclxuICAgICAgICAgICAgICAgIGlmIChsaW5lVGV4dC50cmltKCkuc3RhcnRzV2l0aCgnPiAqKicpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g5o+Q5Y+W57qv5paH5pys5YaF5a6577yI56e76ZmkIE1hcmtkb3duIOagvOW8j++8iVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFuVGV4dCA9IGxpbmVUZXh0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9ePlxccypcXCpcXCouKj9cXHwuKj9cXF1cXF1cXCpcXCpcXHMqLywgJycpIC8vIOenu+mZpOaXtumXtOaIs+mTvuaOpVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAudHJpbSgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2xlYW5UZXh0Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiBpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGV4dDogY2xlYW5UZXh0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldmlldzogbGluZVRleHQuc3Vic3RyaW5nKDAsIDEwMClcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8g6ZiF6K+75qih5byP77ya6K+75Y+W5paH5Lu25YaF5a65XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xyXG4gICAgICAgICAgICB0aGlzLmxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGluZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmVUZXh0ID0gdGhpcy5saW5lc1tpXTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAobGluZVRleHQudHJpbSgpLnN0YXJ0c1dpdGgoJz4gKionKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFuVGV4dCA9IGxpbmVUZXh0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9ePlxccypcXCpcXCouKj9cXHwuKj9cXF1cXF1cXCpcXCpcXHMqLywgJycpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC50cmltKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbGVhblRleHQubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IGksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0OiBjbGVhblRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2aWV3OiBsaW5lVGV4dC5zdWJzdHJpbmcoMCwgMTAwKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY2FjaGVkSXRlbXMgPSBpdGVtcztcclxuICAgIH1cclxuXHJcbiAgICBnZXRJdGVtcygpOiBTZWdtZW50TGluZVtdIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5jYWNoZWRJdGVtcztcclxuICAgIH1cclxuXHJcbiAgICBnZXRJdGVtVGV4dChpdGVtOiBTZWdtZW50TGluZSk6IHN0cmluZyB7XHJcbiAgICAgICAgcmV0dXJuIGl0ZW0udGV4dDtcclxuICAgIH1cclxuXHJcbiAgICBvbkNob29zZUl0ZW0oaXRlbTogU2VnbWVudExpbmUsIGV2dDogTW91c2VFdmVudCB8IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXRMaW5lID0gaXRlbS5saW5lO1xyXG4gICAgICAgIGNvbnN0IHZpZXcgPSB0aGlzLnRhcmdldExlYWYudmlldyBhcyBNYXJrZG93blZpZXc7XHJcblxyXG4gICAgICAgIC8vIPCflJMg5YWI5p+l5om+IENhbGxvdXQg5aS06YOo5L2N572uXHJcbiAgICAgICAgbGV0IGNhbGxvdXRIZWFkZXJMaW5lID0gLTE7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IHRhcmdldExpbmU7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxpbmVDb250ZW50ID0gdGhpcy5saW5lc1tpXTtcclxuICAgICAgICAgICAgaWYgKGxpbmVDb250ZW50ICYmIGxpbmVDb250ZW50LmluY2x1ZGVzKCc+IFshcXVvdGVdLScpKSB7XHJcbiAgICAgICAgICAgICAgICBjYWxsb3V0SGVhZGVyTGluZSA9IGk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyDkvJjljJbvvJrlpoLmnpzpgYfliLDlj6bkuIDkuKpjYWxsb3V05aS05oiW56ug6IqC5aS077yM5bCx5YGc5q2i5pCc57SiXHJcbiAgICAgICAgICAgIGlmIChsaW5lQ29udGVudCAmJiAobGluZUNvbnRlbnQuc3RhcnRzV2l0aCgnIyMjIyAnKSB8fCBpIDwgdGFyZ2V0TGluZSAtIDUwKSkgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyDwn5SEIOWmguaenOaYr+mYheivu+aooeW8j++8jOWFiOWIh+aNouWIsOe8lui+keaooeW8j1xyXG4gICAgICAgIGNvbnN0IHN3aXRjaFRvRWRpdE1vZGUgPSBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5pc0VkaXRNb2RlKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0ZSA9IHRoaXMudGFyZ2V0TGVhZi5nZXRWaWV3U3RhdGUoKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFyZ2V0TGVhZi5zZXRWaWV3U3RhdGUoe1xyXG4gICAgICAgICAgICAgICAgICAgIC4uLnN0YXRlLFxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlOiB7IC4uLnN0YXRlLnN0YXRlLCBtb2RlOiAnc291cmNlJyB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIC8vIOetieW+heaooeW8j+WIh+aNouWujOaIkFxyXG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8g8J+boO+4jyDmiafooYzlsZXlvIDlkozot7PovaxcclxuICAgICAgICBzd2l0Y2hUb0VkaXRNb2RlKCkudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVkaXRvciA9IHZpZXcuZWRpdG9yO1xyXG5cclxuICAgICAgICAgICAgLy8g5bGV5byA5oqY5Y+g55qEIENhbGxvdXRcclxuICAgICAgICAgICAgaWYgKGNhbGxvdXRIZWFkZXJMaW5lICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxIZWFkZXIgPSBlZGl0b3IuZ2V0TGluZShjYWxsb3V0SGVhZGVyTGluZSk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UkyDmib7liLDmipjlj6DnmoQgQ2FsbG91dCAo6KGMICR7Y2FsbG91dEhlYWRlckxpbmV9KTpgLCBvcmlnaW5hbEhlYWRlcik7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChvcmlnaW5hbEhlYWRlci5pbmNsdWRlcygnPiBbIXF1b3RlXS0nKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0hlYWRlciA9IG9yaWdpbmFsSGVhZGVyLnJlcGxhY2UoJz4gWyFxdW90ZV0tJywgJz4gWyFxdW90ZV0nKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIvCfk50g5bGV5byA5Li6OlwiLCBuZXdIZWFkZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5yZXBsYWNlUmFuZ2UoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld0hlYWRlcixcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyBsaW5lOiBjYWxsb3V0SGVhZGVyTGluZSwgY2g6IDAgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyBsaW5lOiBjYWxsb3V0SGVhZGVyTGluZSwgY2g6IG9yaWdpbmFsSGVhZGVyLmxlbmd0aCB9XHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAvLyDorrDlvZXlsZXlvIDnmoQgQ2FsbG91dO+8jOS7peS+v+S/neWtmOaXtuaBouWkjVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRGaWxlUGF0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyDmo4Dmn6XmmK/lkKblt7LorrDlvZXvvIzpgb/lhY3ph43lpI1cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhpc3RzID0gZXhwYW5kZWRDYWxsb3V0cy5zb21lKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYyA9PiBjLmZpbGVQYXRoID09PSB0aGlzLmN1cnJlbnRGaWxlUGF0aCAmJiBjLmxpbmVOdW1iZXIgPT09IGNhbGxvdXRIZWFkZXJMaW5lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZXhpc3RzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBhbmRlZENhbGxvdXRzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoOiB0aGlzLmN1cnJlbnRGaWxlUGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lTnVtYmVyOiBjYWxsb3V0SGVhZGVyTGluZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIuKchSDlt7LorrDlvZXlsZXlvIDnmoQgQ2FsbG91dDpcIiwgeyBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aDogdGhpcy5jdXJyZW50RmlsZVBhdGgsIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVOdW1iZXI6IGNhbGxvdXRIZWFkZXJMaW5lIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIvCfk4og5b2T5YmN6K6w5b2V5oC75pWwOlwiLCBleHBhbmRlZENhbGxvdXRzLmxlbmd0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIuKaoO+4jyDor6UgQ2FsbG91dCDlt7LorrDlvZXvvIzot7Pov4dcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIuKdjCBjdXJyZW50RmlsZVBhdGgg5Li656m677yM5peg5rOV6K6w5b2VXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8g6Lez6L2s5Yiw55uu5qCH6KGMXHJcbiAgICAgICAgICAgIGVkaXRvci5zZXRDdXJzb3IoeyBsaW5lOiB0YXJnZXRMaW5lLCBjaDogMCB9KTtcclxuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyDlpoLmnpzljp/mnaXmmK/pmIXor7vmqKHlvI/vvIzlu7bov5/liIfmjaLlm57pmIXor7vmqKHlvI9cclxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzRWRpdE1vZGUpIHtcclxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gdGhpcy50YXJnZXRMZWFmLmdldFZpZXdTdGF0ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFyZ2V0TGVhZi5zZXRWaWV3U3RhdGUoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAuLi5zdGF0ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGU6IHsgLi4uc3RhdGUuc3RhdGUsIG1vZGU6ICdwcmV2aWV3JyB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ/Cfk5Yg5bey5YiH5o2i5Zue6ZiF6K+75qih5byPJyk7XHJcbiAgICAgICAgICAgICAgICB9LCAyMDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuIl19