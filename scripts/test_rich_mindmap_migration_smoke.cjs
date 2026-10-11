/**
 * 🧪 思维导图拆分组装、跨图迁移与自定义要求功能端到端自动化测试
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');

// 注入 Obsidian API 全局桩
globalThis.HTMLElement = class HTMLElement {};
globalThis.document = {
    addEventListener() {},
    removeEventListener() {},
    getElementById() { return null; },
    createElement() {
        return {
            id: '',
            textContent: '',
            appendChild() {},
            empty() {},
            addClass() {},
            createEl() { return this; },
            createDiv() { return this; },
        };
    },
    head: { appendChild() {} }
};

class TFile {
    constructor(p) {
        this.path = p;
        const i = p.lastIndexOf('/');
        this.basename = (i < 0 ? p : p.slice(i + 1)).replace(/\.[^.]+$/, '');
        this.name = (i < 0 ? p : p.slice(i + 1));
        this.extension = p.split('.').pop();
        this.parent = i < 0 ? null : { path: p.slice(0, i) };
    }
}
class TFolder { constructor() { this.children = []; } }
class Notice { constructor() {} hide() {} setMessage() {} }
class Plugin {
    constructor(app, manifest) { this.app = app; this.manifest = manifest; }
    registerEvent() {}
    registerDomEvent() {}
    register() {}
    addCommand(c) {
        this._commands = this._commands || [];
        this._commands.push(c);
    }
    addSettingTab() {}
    registerObsidianProtocolHandler() {}
    async loadData() { return {}; }
    async saveData() {}
}
class Modal {
    constructor(app) {
        this.app = app;
        this.contentEl = {
            empty() {},
            addClass() {},
            createEl() { return this; },
            createDiv() { return this; },
        };
    }
    open() {}
    close() {}
}
class FuzzySuggestModal extends Modal {
    setPlaceholder() {}
}
class Setting {
    setName() { return this; }
    setDesc() { return this; }
    addDropdown(cb) {
        cb({
            addOption() { return this; },
            setValue() { return this; },
            onChange() { return this; }
        });
        return this;
    }
}

const stubs = { Plugin, Notice, TFile, TFolder, Modal, FuzzySuggestModal, Setting };
const obsidianModule = new Proxy(stubs, {
    get(t, k) {
        if (k in t) return t[k];
        if (k === '__esModule') return true;
        return class StubClass {};
    }
});

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'obsidian') return obsidianModule;
    return originalLoad.apply(this, arguments);
};

console.log('🚀 开始思维导图新功能自动化端到端测试...\n');

// 1. 读取库内真实 rich 思维导图
const sampleFileA = 'C:/Obsidian_Hub/Quick_Mark/.obsidian/plugins/silicon-transcriber/.backup-timestamp-fix-20260921/00.电路_水木/01.电桥哥基础课/03_第三章-电路方程/3.1电路的图🧠-rich.md';
const sampleFileB = 'C:/Obsidian_Hub/Quick_Mark/.obsidian/plugins/silicon-transcriber/.backup-timestamp-fix-20260921/00.信号_梦马/02.信号与卷积/01 第2节 四种奇异信号（表达式视角）🧠-rich.md';

assert(fs.existsSync(sampleFileA), `样例文档 A 不存在: ${sampleFileA}`);
assert(fs.existsSync(sampleFileB), `样例文档 B 不存在: ${sampleFileB}`);

const contentA = fs.readFileSync(sampleFileA, 'utf8');
const contentB = fs.readFileSync(sampleFileB, 'utf8');

console.log(`📄 样例文档 A 大小: ${contentA.length} 字节`);
console.log(`📄 样例文档 B 大小: ${contentB.length} 字节`);

// 加载构建产物 main.js
const TranscribePlugin = require('../main.js').default;
const mockApp = {
    workspace: {
        getActiveFile() { return new TFile(sampleFileA); },
        on() { return {}; },
        onLayoutReady(cb) { cb(); }
    },
    vault: {
        adapter: { exists: async () => false },
        getMarkdownFiles() { return [new TFile(sampleFileA), new TFile(sampleFileB)]; },
        read: async (file) => fs.readFileSync(file.path, 'utf8'),
        modify: async () => {}
    }
};

const plugin = new TranscribePlugin(mockApp, { id: 'obsidian-siliconflow-transcriber', version: '1.0.0' });

// 验证 API 挂载与命令注册
assert(plugin.mindmapAPI, '插件实例上必须成功挂载 mindmapAPI');
assert.strictEqual(typeof plugin.mindmapAPI.parseAndAnalyze, 'function', 'mindmapAPI 必须暴露 parseAndAnalyze 方法');
assert.strictEqual(typeof plugin.mindmapAPI.migrateGroups, 'function', 'mindmapAPI 必须暴露 migrateGroups 方法');
console.log('✓ mindmapAPI 接口成功暴露在插件实例上，供外部/AI 直接调用');

const { parseAndAnalyze, migrateGroups } = plugin.mindmapAPI;

// ==================== 测试用例 1: 真实导图 A 拓扑解析与不漏不拿校验 ====================
console.log('\n--- [测试 1] 真实导图 A 拓扑解析与不漏不拿校验 ---');
const analysisA = parseAndAnalyze(contentA);

console.log(`✓ 主根节点: "${analysisA.rootNode ? analysisA.rootNode.text : '无'}" (id: ${analysisA.rootNode?.id})`);
console.log(`✓ 节点总数: ${analysisA.totalNodeCount}`);
console.log(`✓ 识别分支数: ${analysisA.groups.length}`);
analysisA.groups.forEach((g, i) => {
    console.log(`  [${i + 1}] ${g.type === 'secondary' ? '次级分支' : '独立分支'}: "${g.title}" (包含 ${g.nodeCount} 个节点)`);
});

assert.strictEqual(analysisA.isComplete, true, '拓扑检验失败：节点未实现 100% 覆盖');
assert.strictEqual(
    (analysisA.rootNode ? 1 : 0) + analysisA.groups.reduce((acc, g) => acc + g.nodeCount, 0),
    analysisA.totalNodeCount,
    '守恒检验失败：根节点 + 各分支节点总和 !== 原始节点总数'
);
console.log('✅ 测试 1 通过：真实导图 A 解析成功，100% 节点覆盖，无一遗漏无一重复！');

// ==================== 测试用例 2: 真实导图 B 解析 ====================
console.log('\n--- [测试 2] 真实导图 B 解析 ---');
const analysisB = parseAndAnalyze(contentB);
console.log(`✓ 导图 B 主根节点: "${analysisB.rootNode?.text}"`);
console.log(`✓ 导图 B 节点总数: ${analysisB.totalNodeCount}`);
console.log(`✓ 导图 B 分支数: ${analysisB.groups.length}`);
assert.strictEqual(analysisB.isComplete, true, '导图 B 拓扑覆盖检验必须为 true');
console.log('✅ 测试 2 通过：真实导图 B 解析成功！');

// ==================== 测试用例 3: 独立游离节点（Orphan Nodes）闭包测试 ====================
console.log('\n--- [测试 3] 独立游离节点闭包归类测试 ---');
const rawDocA = JSON.parse(analysisA.rawJsonText);
const modifiedDocWithOrphans = JSON.parse(JSON.stringify(rawDocA));

const orphanRootId = 'orphan-root-test-01';
const orphanChildId = 'orphan-child-test-02';
modifiedDocWithOrphans.mindData[0].push({
    id: orphanRootId,
    text: '🧩 我的独立游离想法',
    x: -500,
    y: 200,
    isRoot: false
});
modifiedDocWithOrphans.mindData[0].push({
    id: orphanChildId,
    pid: orphanRootId,
    text: '独立想法的补充要点',
    x: -300,
    y: 200
});

const contentWithOrphans = contentA.replace(analysisA.rawJsonText, JSON.stringify(modifiedDocWithOrphans));
const analysisOrphans = parseAndAnalyze(contentWithOrphans);

console.log(`✓ 含独立节点总数: ${analysisOrphans.totalNodeCount}`);
const orphanGroup = analysisOrphans.groups.find(g => g.type === 'orphan');
assert(orphanGroup, '必须成功将游离节点提取为 orphan 分组');
console.log(`✓ 独立节点分组识别为: "${orphanGroup.title}" (包含 ${orphanGroup.nodeCount} 个节点)`);
assert.strictEqual(orphanGroup.nodeCount, 2, '独立分支应包含孤立根及所有子孙节点');
assert.strictEqual(analysisOrphans.isComplete, true, '含独立节点时依然必须 100% 完整覆盖');
console.log('✅ 测试 3 通过：独立游离节点成功识别并归类，信息完整守恒！');

// ==================== 测试用例 4: 跨图复制迁移测试 (Copy Mode) ====================
console.log('\n--- [测试 4] 跨图分支复制 (Copy Mode) ---');
const groupToMigrate = analysisA.groups[1];
console.log(`👉 计划将导图 A 分支 "${groupToMigrate.title}" (${groupToMigrate.nodeCount} 个节点) 复制追加到导图 B`);

const copyResult = migrateGroups(contentA, contentB, [groupToMigrate.id], 'copy');

assert.strictEqual(copyResult.migratedGroupCount, 1, '迁移分支数应为 1');
assert.strictEqual(copyResult.migratedNodeCount, groupToMigrate.nodeCount, '迁移节点数应与原分支完全一致');
assert.strictEqual(copyResult.sourceUpdatedContent, undefined, '复制模式下不应修改源文本');

const updatedAnalysisB = parseAndAnalyze(copyResult.targetUpdatedContent);
console.log(`✓ 目标导图 B 原始节点数: ${analysisB.totalNodeCount}`);
console.log(`✓ 目标导图 B 追加后节点数: ${updatedAnalysisB.totalNodeCount}`);
assert.strictEqual(
    updatedAnalysisB.totalNodeCount,
    analysisB.totalNodeCount + groupToMigrate.nodeCount,
    '目标导图节点数必须精确增加迁移节点的数量'
);

const newBranchInB = updatedAnalysisB.groups[updatedAnalysisB.groups.length - 1];
console.log(`✓ 目标导图 B 新增末尾分支: "${newBranchInB.title}" (包含 ${newBranchInB.nodeCount} 个节点)`);
assert.strictEqual(newBranchInB.nodes[0].pid, updatedAnalysisB.rootNode.id, '新分支顶层的 pid 必须严格指向目标根节点');

// 检验 ID 全局唯一性
const allIdsInB = updatedAnalysisB.doc.mindData[0].map(n => n.id);
const uniqueIdsInB = new Set(allIdsInB);
assert.strictEqual(allIdsInB.length, uniqueIdsInB.size, '目标导图内部绝对不能存在任何重复 ID');
console.log(`✓ 目标导图所有 ${allIdsInB.length} 个节点 ID 全局唯一，无任何碰撞`);

// 检验几何排布（无坐标重叠）
const originalLastGroupB = analysisB.groups[analysisB.groups.length - 1];
const originalBottomY = Math.max(...originalLastGroupB.nodes.map(n => n.y || 0));
const newBranchTopY = newBranchInB.nodes[0].y || 0;
console.log(`✓ 目标导图原有最低点 Y: ${originalBottomY}, 新追加分支 Y: ${newBranchTopY}`);
assert(newBranchTopY > originalBottomY, '新追加分支必须排在目标导图原有分支下方，杜绝几何重叠');
console.log('✅ 测试 4 通过：跨图复制追加成功，坐标自适应且无碰撞重叠！');

// ==================== 测试用例 5: 跨图剪切迁移测试 (Move Mode) ====================
console.log('\n--- [测试 5] 跨图分支剪切 (Move Mode) ---');
console.log(`👉 计划将导图 A 分支 "${groupToMigrate.title}" (${groupToMigrate.nodeCount} 个节点) 剪切到导图 B`);

const moveResult = migrateGroups(contentA, contentB, [groupToMigrate.id], 'move');
assert(moveResult.sourceUpdatedContent, '剪切模式下必须输出修改后的源导图文本');

const updatedAnalysisA = parseAndAnalyze(moveResult.sourceUpdatedContent);
console.log(`✓ 源导图 A 原始节点数: ${analysisA.totalNodeCount}`);
console.log(`✓ 源导图 A 剪切后节点数: ${updatedAnalysisA.totalNodeCount}`);
assert.strictEqual(
    updatedAnalysisA.totalNodeCount,
    analysisA.totalNodeCount - groupToMigrate.nodeCount,
    '源导图节点数必须精确扣除被剪切的节点数'
);

const remainingIdsInA = new Set(updatedAnalysisA.doc.mindData[0].map(n => n.id));
for (const n of groupToMigrate.nodes) {
    assert(!remainingIdsInA.has(n.id), `被剪切的节点 ${n.id} 不应残留在源导图中`);
}
console.log('✅ 测试 5 通过：剪切迁移成功，源导图干净剔除，目标导图无损接收！');

async function testCommands() {
    await plugin.onload();
    const registeredCommandIds = (plugin._commands || []).map(c => c.id);
    console.log(`✓ 插件已注册命令清单 (${registeredCommandIds.length} 个): ${registeredCommandIds.join(', ')}`);
    assert(registeredCommandIds.includes('migrate-rich-mindmap-branches'), '必须成功注册 migrate-rich-mindmap-branches 命令');
    console.log('✅ 测试 6 通过：命令 migrate-rich-mindmap-branches 成功注册入 Obsidian！');
    console.log('\n🎉 ================================================');
    console.log('🎉 所有 6 项严苛端到端与边界自动化测试 100% 全部通过！');
    console.log('🎉 ================================================\n');
}
testCommands();
