"use strict";
/**
 * 🧠 局部思维导图模块
 *
 * 从智能笔记的 %%BATCH_N_START%% / %%BATCH_N_END%% 分块中选取若干块，
 * 生成局部思维导图分支，并追加到已有导图文件：
 *  - rich 格式（MarkMind）：直接编辑 ```json 数据块中的 mindData 节点数组
 *  - basic 格式：在最后一个 ## 分支之后追加 Markdown 大纲
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartialMindmapModal = exports.MindmapTargetPickerModal = void 0;
exports.parseNoteChunks = parseNoteChunks;
exports.formatChunkLabel = formatChunkLabel;
exports.formatChunkRangeLabel = formatChunkRangeLabel;
exports.parseChaptersFromMarkdown = parseChaptersFromMarkdown;
exports.parseOutlineMarkdown = parseOutlineMarkdown;
exports.detectMindmapFormat = detectMindmapFormat;
exports.extractRichOutline = extractRichOutline;
exports.extractBasicOutline = extractBasicOutline;
exports.appendBranchesToRichMindmap = appendBranchesToRichMindmap;
exports.appendBranchesToBasicMindmap = appendBranchesToBasicMindmap;
exports.collectCandidateMindmaps = collectCandidateMindmaps;
exports.openPartialMindmapModal = openPartialMindmapModal;
const obsidian_1 = require("obsidian");
const CHAPTER_HEAD_RE = /^#{2,4}\s+⏱️\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*?)(?:\s+🎬|$)/;
/**
 * 解析智能笔记中的 %%BATCH_N_START/END%% 分块
 */
function parseNoteChunks(noteContent) {
    const chunks = [];
    const re = /%%BATCH_(\d+)_START%%([\s\S]*?)%%BATCH_\1_END%%/g;
    let m;
    while ((m = re.exec(noteContent)) !== null) {
        const index = parseInt(m[1], 10);
        const text = m[2];
        const heads = [];
        for (const line of text.split('\n')) {
            const h = line.match(CHAPTER_HEAD_RE);
            if (h)
                heads.push({ timestamp: h[1], title: h[2].trim() });
        }
        chunks.push({
            index,
            text,
            firstTimestamp: heads.length > 0 ? heads[0].timestamp : '',
            lastTimestamp: heads.length > 0 ? heads[heads.length - 1].timestamp : '',
            firstTitle: heads.length > 0 ? heads[0].title : '',
            chapterCount: heads.length,
        });
    }
    chunks.sort((a, b) => a.index - b.index);
    return chunks;
}
function formatChunkLabel(chunk) {
    return `第 ${chunk.index + 1} 部分`;
}
/**
 * 生成选中分块的范围标签（连续时用 5–6，不连续时用 2、5）
 */
function formatChunkRangeLabel(chunks) {
    const nums = chunks.map(c => c.index + 1).sort((a, b) => a - b);
    if (nums.length === 0)
        return '';
    const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    if (contiguous && nums.length > 1)
        return `第 ${nums[0]}–${nums[nums.length - 1]} 部分`;
    return `第 ${nums.join('、')} 部分`;
}
/**
 * 从 Markdown 文本解析章节数据（与笔记中 '#### ⏱️ MM:SS 标题' 格式一致）
 */
function parseChaptersFromMarkdown(content) {
    const chapters = [];
    const lines = content.split('\n');
    let currentChapter = null;
    let keyPointsBuffer = [];
    const headerRegex = /^#{2,4}\s+⏱️\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(.*?)(?:\s+🎬|$)/;
    const finalizeChapter = () => {
        if (currentChapter && currentChapter.timestamp && currentChapter.title) {
            if (keyPointsBuffer.length > 0) {
                currentChapter.key_points = [...keyPointsBuffer];
                currentChapter.summary = keyPointsBuffer.join('\n');
            }
            else {
                currentChapter.summary = '';
            }
            chapters.push(currentChapter);
        }
    };
    for (const line of lines) {
        const match = line.match(headerRegex);
        if (match) {
            finalizeChapter();
            currentChapter = { timestamp: match[1], title: match[2].trim() };
            keyPointsBuffer = [];
            continue;
        }
        if (currentChapter) {
            if (line.trim().startsWith('>'))
                continue; // 忽略引用
            if (!line.trim())
                continue;
            const pointMatch = line.match(/^\s*[-*+]\s+(.+)$/);
            if (pointMatch)
                keyPointsBuffer.push(pointMatch[1].trim());
        }
    }
    finalizeChapter();
    return chapters;
}
/**
 * 把思维导图 Markdown 大纲解析为分支树。
 * ## → 第一层，### → 第二层，列表项按缩进继续分层。
 */
function parseOutlineMarkdown(markdown) {
    const roots = [];
    const stack = [];
    let currentHeadingLevel = 0;
    let inFence = false;
    const pushNode = (level, text) => {
        const node = { text, children: [] };
        while (stack.length > 0 && stack[stack.length - 1].level >= level)
            stack.pop();
        if (stack.length > 0)
            stack[stack.length - 1].node.children.push(node);
        else
            roots.push(node);
        stack.push({ level, node });
    };
    for (const rawLine of markdown.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        if (/^\s*```/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence)
            continue;
        if (!line.trim())
            continue;
        const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
        if (heading) {
            const level = heading[1].length;
            currentHeadingLevel = level;
            if (level === 1)
                continue; // 忽略根标题行
            const text = heading[2].trim();
            if (text)
                pushNode(level, text);
            continue;
        }
        const li = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
        if (li && currentHeadingLevel > 0) {
            const indent = li[1].replace(/\t/g, '  ').length;
            const level = currentHeadingLevel + 1 + Math.floor(indent / 2);
            const text = li[2].trim();
            if (text)
                pushNode(level, text);
        }
        // 其他普通文本行忽略
    }
    return roots;
}
const RICH_FENCE_RE = /^```[ ]?json[ ]?\n([\s\S]*?)\n```[ ]*$/m;
function toNodeView(value) {
    if (value === null || typeof value !== 'object')
        return null;
    if (!('id' in value) || typeof value.id !== 'string')
        return null;
    return {
        id: value.id,
        pid: 'pid' in value && typeof value.pid === 'string' ? value.pid : undefined,
        x: 'x' in value && typeof value.x === 'number' ? value.x : undefined,
        y: 'y' in value && typeof value.y === 'number' ? value.y : undefined,
        stroke: 'stroke' in value && typeof value.stroke === 'string' ? value.stroke : undefined,
        text: 'text' in value && typeof value.text === 'string' ? value.text : undefined,
        isRoot: 'isRoot' in value && value.isRoot === true,
    };
}
function stepMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function detectMindmapFormat(text) {
    const fence = text.match(RICH_FENCE_RE);
    if (fence) {
        try {
            const parsed = JSON.parse(fence[1]);
            if (parsed !== null && typeof parsed === 'object' && 'mindData' in parsed && Array.isArray(parsed.mindData))
                return 'rich';
        }
        catch {
            // JSON 损坏时继续走 basic 判断
        }
    }
    if (/^mindmap-plugin:\s*basic\s*$/m.test(text) || (/^#\s/m.test(text) && /^##\s/m.test(text)))
        return 'basic';
    return 'unknown';
}
function stripHtml(text) {
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
}
/**
 * 提取 rich 导图的骨架（二级分支 + 若干三级节点），供 LLM 参考命名风格
 */
function extractRichOutline(richText, maxSubPerBranch = 6, maxLines = 120) {
    const fence = richText.match(RICH_FENCE_RE);
    if (!fence)
        return '';
    let parsed;
    try {
        parsed = JSON.parse(fence[1]);
    }
    catch {
        return '';
    }
    const sheetsValue = parsed !== null && typeof parsed === 'object' && 'mindData' in parsed ? parsed.mindData : null;
    const rawNodes = Array.isArray(sheetsValue) && Array.isArray(sheetsValue[0]) ? sheetsValue[0] : [];
    const nodes = rawNodes.map(toNodeView).filter((n) => n !== null);
    const root = nodes.find(n => n.isRoot) || nodes.find(n => !n.pid);
    if (!root)
        return '';
    const childrenOf = new Map();
    for (const n of nodes) {
        if (n.pid) {
            const arr = childrenOf.get(n.pid) || [];
            arr.push(n);
            childrenOf.set(n.pid, arr);
        }
    }
    const lines = [];
    for (const child of childrenOf.get(root.id) || []) {
        lines.push(`## ${stripHtml(child.text ?? '').slice(0, 60)}`);
        const subs = childrenOf.get(child.id) || [];
        for (const sub of subs.slice(0, maxSubPerBranch)) {
            lines.push(`   · ${stripHtml(sub.text ?? '').slice(0, 60)}`);
        }
        if (subs.length > maxSubPerBranch)
            lines.push('   · …');
        if (lines.length >= maxLines)
            break;
    }
    return lines.join('\n');
}
/**
 * 提取 basic 导图的骨架（## / ### 标题）
 */
function extractBasicOutline(basicText, maxLines = 120) {
    const lines = [];
    for (const line of basicText.split('\n')) {
        const m = line.match(/^(#{2,3})\s+(.+)$/);
        if (!m)
            continue;
        lines.push(`${m[1]} ${stripHtml(m[2]).slice(0, 60)}`);
        if (lines.length >= maxLines)
            break;
    }
    return lines.join('\n');
}
/** 与 MarkMind 内部一致的三段式 ID 生成器（8-4-4 十六进制） */
function genMarkmindId() {
    const t = () => ((65536 * (1 + Math.random())) | 0).toString(16).substring(1);
    return t() + t() + '-' + t() + '-' + t();
}
const LEAF_GAP = 34; // 同层叶子节点纵向间距（实测现有导图约 32）
const LEVEL_DX = 170; // 每层横向步进
const DEFAULT_BRANCH_COLORS = ['#00E5FF', '#76FF03', '#FFEA00', '#FF4081', '#B2FF59'];
function subtreeBottom(node, childrenOf) {
    let bottom = node.y ?? 0;
    for (const child of childrenOf.get(node.id) || []) {
        bottom = Math.max(bottom, subtreeBottom(child, childrenOf));
    }
    return bottom;
}
/**
 * 将生成的分支追加到 rich 思维导图。
 * 新分支挂在根节点下、排在现有二级分支（同侧）最后，颜色沿用现有分支调色板循环。
 */
function appendBranchesToRichMindmap(richText, branches) {
    const fenceMatch = richText.match(RICH_FENCE_RE);
    if (!fenceMatch || fenceMatch.index === undefined)
        throw new Error('未找到 ```json 数据块，不是有效的 rich 思维导图');
    const jsonText = fenceMatch[1];
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch (e) {
        throw new Error('导图 JSON 解析失败: ' + stepMessage(e));
    }
    if (parsed === null || typeof parsed !== 'object' || !('mindData' in parsed) || !Array.isArray(parsed.mindData) || !Array.isArray(parsed.mindData[0])) {
        throw new Error('导图数据缺少 mindData 节点数组');
    }
    const rawNodes = parsed.mindData[0];
    const nodes = rawNodes.map(toNodeView).filter((n) => n !== null);
    const root = nodes.find(n => n.isRoot) || nodes.find(n => !n.pid);
    if (!root)
        throw new Error('导图缺少根节点');
    const childrenOf = new Map();
    for (const n of nodes) {
        if (n.pid) {
            const arr = childrenOf.get(n.pid) || [];
            arr.push(n);
            childrenOf.set(n.pid, arr);
        }
    }
    const existing = childrenOf.get(root.id) || [];
    const rootX = root.x ?? 0;
    const rootY = root.y ?? 0;
    // 1) 定位：与"最后一个二级分支"同侧，排在同侧所有子树的最低点之后
    let side = 1;
    let baseX;
    let startY;
    if (existing.length > 0) {
        const last = existing[existing.length - 1];
        side = last.x !== undefined && last.x < rootX ? -1 : 1;
        baseX = last.x ?? rootX + side * 300;
        let maxBottom = rootY;
        for (const child of existing) {
            const childSide = child.x !== undefined && child.x < rootX ? -1 : 1;
            if (childSide !== side)
                continue;
            maxBottom = Math.max(maxBottom, subtreeBottom(child, childrenOf));
        }
        startY = maxBottom + 56;
    }
    else {
        baseX = rootX + 300;
        startY = rootY - 40;
    }
    // 2) 配色：沿用现有二级分支颜色循环
    const existingColors = Array.from(new Set(existing.map(c => (c.stroke ?? '').trim()).filter(s => s.length > 0)));
    const palette = existingColors.length > 0 ? existingColors : DEFAULT_BRANCH_COLORS;
    // 3) 布局：叶子按 34px 游标排列，父节点居中于首尾子节点之间
    const positions = new Map();
    let cursor = startY;
    const assignLayout = (node, depth) => {
        let y;
        if (node.children.length === 0) {
            y = cursor;
            cursor += LEAF_GAP;
        }
        else {
            node.children.forEach(child => assignLayout(child, depth + 1));
            const first = positions.get(node.children[0])?.y ?? cursor;
            const last = positions.get(node.children[node.children.length - 1])?.y ?? cursor;
            y = (first + last) / 2;
        }
        positions.set(node, { x: baseX + side * depth * LEVEL_DX, y });
    };
    // 4) 生成节点并追加到 mindData[0]
    let addedCount = 0;
    branches.forEach((branch, i) => {
        assignLayout(branch, 0);
        const branchColor = palette[(existing.length + i) % palette.length];
        const walk = (node, pid, depth) => {
            const pos = positions.get(node);
            const newId = genMarkmindId();
            const newNode = {
                id: newId,
                text: node.text,
                isExpand: true,
                hasMark: null,
                stroke: branchColor,
                collapseMark: false,
                style: depth === 0 ? { 'font-size': '20', 'font-weight': 'bold' } : {},
                x: pos ? Math.round(pos.x * 100) / 100 : 0,
                y: pos ? Math.round(pos.y * 100) / 100 : 0,
                layout: null,
                pid,
            };
            rawNodes.push(newNode);
            addedCount++;
            for (const child of node.children)
                walk(child, newId, depth + 1);
        };
        walk(branch, root.id, 0);
    });
    const newJson = JSON.stringify(parsed);
    // 用函数式替换，避免 JSON 中的 $ 符号被当作替换模式
    const updated = richText.replace(jsonText, () => newJson);
    if (updated === richText && newJson !== jsonText)
        throw new Error('导图内容替换失败');
    return { updated, addedCount };
}
/* ==================== 追加到 basic 导图 ==================== */
/**
 * 将生成的 Markdown 分支追加到 basic 思维导图（最后一个 ## 分支之后）
 */
function appendBranchesToBasicMindmap(basicText, branchMarkdown) {
    const md = branchMarkdown.replace(/^#\s+.*$/gm, '').trim();
    if (!md)
        throw new Error('没有可写入的分支内容');
    const lines = basicText.split('\n');
    let lastH2 = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i]))
            lastH2 = i;
    }
    if (lastH2 === -1)
        throw new Error('basic 导图中未找到 ## 二级分支，无法定位追加位置');
    // 追加位置：最后一个 ## 分支之后、下一个一级标题之前（若有）
    let insertAt = lines.length;
    for (let i = lastH2 + 1; i < lines.length; i++) {
        if (/^#\s+/.test(lines[i])) {
            insertAt = i;
            break;
        }
    }
    const head = lines.slice(0, insertAt).join('\n').replace(/\s+$/, '');
    const tail = lines.slice(insertAt).join('\n').replace(/^\s+/, '');
    const updated = head + '\n\n' + md + (tail ? '\n\n' + tail : '\n');
    const addedCount = (md.match(/^(?:#{2,6}\s+|[-*+]\s+)/gm) || []).length;
    return { updated, addedCount };
}
/**
 * 收集候选导图：智能笔记同级目录下的 🧠 文件；自动匹配同名导图（-rich 优先）
 */
function collectCandidateMindmaps(app, noteFile) {
    const noteDir = noteFile.parent;
    let mapDir = noteDir;
    if (noteDir && noteDir.name.includes('智能笔记') && noteDir.parent instanceof obsidian_1.TFolder) {
        mapDir = noteDir.parent;
    }
    const candidates = [];
    if (mapDir) {
        for (const child of mapDir.children) {
            if (child instanceof obsidian_1.TFile && child.extension === 'md' && child.basename.includes('🧠')) {
                candidates.push(child);
            }
        }
    }
    candidates.sort((a, b) => {
        const aRich = a.basename.includes('-rich') ? 0 : 1;
        const bRich = b.basename.includes('-rich') ? 0 : 1;
        if (aRich !== bRich)
            return aRich - bRich;
        return (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0);
    });
    const base = noteFile.basename.replace(/^📝/, '');
    const wantRich = `${base}🧠-rich.md`;
    const wantPlain = `${base}🧠.md`;
    let defaultTarget = null;
    for (const c of candidates) {
        if (c.name === wantRich) {
            defaultTarget = c;
            break;
        }
    }
    if (!defaultTarget) {
        for (const c of candidates) {
            if (c.name === wantPlain) {
                defaultTarget = c;
                break;
            }
        }
    }
    if (!defaultTarget) {
        for (const f of app.vault.getMarkdownFiles()) {
            if (f.name === wantRich) {
                defaultTarget = f;
                break;
            }
        }
    }
    if (!defaultTarget) {
        for (const f of app.vault.getMarkdownFiles()) {
            if (f.name === wantPlain) {
                defaultTarget = f;
                break;
            }
        }
    }
    return { candidates, defaultTarget };
}
/* ==================== 全库导图选择器 ==================== */
class MindmapTargetPickerModal extends obsidian_1.FuzzySuggestModal {
    constructor(app, onPick) {
        super(app);
        this.onPick = onPick;
        this.setPlaceholder('搜索全库思维导图（文件名含 🧠）…');
    }
    getItems() {
        return this.app.vault.getMarkdownFiles()
            .filter(f => f.basename.includes('🧠'))
            .sort((a, b) => (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0));
    }
    getItemText(item) {
        return item.path;
    }
    onChooseItem(item) {
        this.onPick(item);
    }
}
exports.MindmapTargetPickerModal = MindmapTargetPickerModal;
class PartialMindmapModal extends obsidian_1.Modal {
    constructor(app, options, onChoice) {
        super(app);
        this.selectedIndexes = new Set();
        this.settled = false;
        this.options = options;
        this.onChoice = onChoice;
        this.target = options.defaultTarget;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('partial-mindmap-modal');
        this.injectStyles();
        contentEl.createEl('h2', { text: '🧠 局部思维导图 → 追加到已有导图' });
        contentEl.createEl('div', { cls: 'pmm-note', text: `笔记本：${this.options.noteFile.path}` });
        /* ── 目标导图 ── */
        const targetBox = contentEl.createDiv({ cls: 'pmm-box' });
        targetBox.createEl('div', { cls: 'pmm-box-title', text: '① 目标导图文件（生成的分支将追加到其末尾二级分支之后）' });
        const targetRow = targetBox.createDiv({ cls: 'pmm-target-row' });
        this.targetLabelEl = targetRow.createDiv({ cls: 'pmm-target-path' });
        if (this.options.candidates.length > 0) {
            const select = targetRow.createEl('select', { cls: 'dropdown' });
            select.createEl('option', { value: '', text: '— 更换为同目录候选 —' });
            for (const c of this.options.candidates) {
                select.createEl('option', { value: c.path, text: c.name });
            }
            const currentTarget = this.target;
            select.value = currentTarget && this.options.candidates.some(c => c.path === currentTarget.path)
                ? currentTarget.path
                : '';
            select.onchange = () => {
                const picked = this.options.candidates.find(c => c.path === select.value);
                if (picked)
                    this.setTarget(picked);
            };
        }
        const browseBtn = targetRow.createEl('button', { text: '🔍 全库选择…' });
        browseBtn.onclick = () => {
            new MindmapTargetPickerModal(this.app, (file) => this.setTarget(file)).open();
        };
        this.refreshTargetLabel();
        /* ── 分块列表 ── */
        const chunkBox = contentEl.createDiv({ cls: 'pmm-box' });
        const chunkHeader = chunkBox.createDiv({ cls: 'pmm-chunk-header' });
        chunkHeader.createEl('div', { cls: 'pmm-box-title', text: '② 选择用于生成的分块（可多选）' });
        const headerBtns = chunkHeader.createDiv({ cls: 'pmm-chunk-btns' });
        const selectAllBtn = headerBtns.createEl('button', { text: '全选' });
        const clearBtn = headerBtns.createEl('button', { text: '清空' });
        const listEl = chunkBox.createDiv({ cls: 'pmm-chunk-list' });
        const checkboxRefs = [];
        for (const chunk of this.options.chunks) {
            const row = listEl.createDiv({ cls: 'pmm-chunk-row' });
            const input = row.createEl('input', { type: 'checkbox' });
            input.onchange = () => {
                if (input.checked)
                    this.selectedIndexes.add(chunk.index);
                else
                    this.selectedIndexes.delete(chunk.index);
                this.refreshCount();
            };
            const labelEl = row.createEl('label', { cls: 'pmm-chunk-label' });
            const range = chunk.firstTimestamp && chunk.lastTimestamp
                ? (chunk.firstTimestamp === chunk.lastTimestamp ? chunk.firstTimestamp : `${chunk.firstTimestamp}–${chunk.lastTimestamp}`)
                : '无章节';
            const title = chunk.firstTitle ? ` · ${chunk.firstTitle}` : '';
            labelEl.setText(`${formatChunkLabel(chunk)} · ${range}${title}（${chunk.chapterCount} 节，${chunk.text.length} 字）`);
            labelEl.onclick = () => { input.click(); };
            checkboxRefs.push({ index: chunk.index, input });
        }
        selectAllBtn.onclick = () => {
            for (const ref of checkboxRefs) {
                ref.input.checked = true;
                this.selectedIndexes.add(ref.index);
            }
            this.refreshCount();
        };
        clearBtn.onclick = () => {
            for (const ref of checkboxRefs) {
                ref.input.checked = false;
            }
            this.selectedIndexes.clear();
            this.refreshCount();
        };
        /* ── 底部按钮 ── */
        const footer = contentEl.createDiv({ cls: 'pmm-footer' });
        this.countEl = footer.createEl('span', { cls: 'pmm-count' });
        const btnBox = footer.createDiv({ cls: 'pmm-footer-btns' });
        const cancelBtn = btnBox.createEl('button', { text: '取消' });
        cancelBtn.onclick = () => this.close();
        this.confirmBtn = btnBox.createEl('button', { cls: 'mod-cta', text: '🚀 开始生成并追加' });
        this.confirmBtn.onclick = () => {
            if (!this.target || this.selectedIndexes.size === 0)
                return;
            this.settled = true;
            const chunkIndexes = Array.from(this.selectedIndexes).sort((a, b) => a - b);
            const target = this.target;
            this.close();
            this.onChoice({ chunkIndexes, target });
        };
        this.refreshCount();
    }
    setTarget(file) {
        this.target = file;
        this.refreshTargetLabel();
        this.refreshCount();
    }
    refreshTargetLabel() {
        if (this.target) {
            this.targetLabelEl.setText(`📄 ${this.target.path}`);
            this.targetLabelEl.removeClass('is-missing');
        }
        else {
            this.targetLabelEl.setText('⚠️ 未自动匹配到导图文件，请手动选择（🔍 全库选择）');
            this.targetLabelEl.addClass('is-missing');
        }
    }
    refreshCount() {
        const n = this.selectedIndexes.size;
        this.countEl.setText(n > 0 ? `已选 ${n} 个分块` : '请勾选至少一个分块');
        this.confirmBtn.disabled = n === 0 || !this.target;
    }
    injectStyles() {
        const styleId = 'pmm-modal-styles';
        if (document.getElementById(styleId))
            return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .partial-mindmap-modal { min-width: 560px; }
            .partial-mindmap-modal .pmm-note { color: var(--text-muted); font-size: 12px; margin-bottom: 10px; word-break: break-all; }
            .partial-mindmap-modal .pmm-box { border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 10px; margin-bottom: 12px; }
            .partial-mindmap-modal .pmm-box-title { font-weight: 600; margin-bottom: 8px; }
            .partial-mindmap-modal .pmm-chunk-btns { display: flex; gap: 6px; }
            .partial-mindmap-modal .pmm-target-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .partial-mindmap-modal .pmm-target-path { flex: 1 1 100%; font-family: var(--font-monospace); font-size: 12px; word-break: break-all; }
            .partial-mindmap-modal .pmm-target-path.is-missing { color: var(--text-error); }
            .partial-mindmap-modal .pmm-chunk-header { display: flex; justify-content: space-between; align-items: center; }
            .partial-mindmap-modal .pmm-chunk-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
            .partial-mindmap-modal .pmm-chunk-row { display: flex; align-items: center; gap: 8px; padding: 3px 4px; border-radius: 4px; }
            .partial-mindmap-modal .pmm-chunk-row:hover { background: var(--background-modifier-hover); }
            .partial-mindmap-modal .pmm-chunk-label { flex: 1; cursor: pointer; font-size: 13px; }
            .partial-mindmap-modal .pmm-footer { display: flex; justify-content: space-between; align-items: center; }
            .partial-mindmap-modal .pmm-count { color: var(--text-muted); font-size: 12px; }
            .partial-mindmap-modal .pmm-footer-btns { display: flex; gap: 8px; }
        `;
        document.head.appendChild(style);
    }
    onClose() {
        this.contentEl.empty();
        if (!this.settled) {
            this.settled = true;
            this.onChoice(null);
        }
    }
}
exports.PartialMindmapModal = PartialMindmapModal;
/**
 * 打开分块选择弹窗；用户确认或取消后通过回调返回结果（取消为 null）
 */
function openPartialMindmapModal(app, options, onChoice) {
    new PartialMindmapModal(app, options, onChoice).open();
}
