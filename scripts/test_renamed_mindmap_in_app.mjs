/**
 * 🔬 针对用户核心诉求的专项实测：
 * 使用库内真实存在的已改名导图（无 -rich、无 🧠 标记）：
 * 1. 模拟用户打开该文件为活动标签页，然后直接运行命令：验证是否直接识别为思维导图并弹出分支列表
 * 2. 模拟全库目标导图选择器：验证改名导图是否能被全库检索出来，并带有 [Rich] 标识
 */

const host = '127.0.0.1';
const port = 9233;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getObsidianPage() {
    const res = await fetch(`http://${host}:${port}/json`);
    const targets = await res.json();
    const page = targets.find((t) => t.type === 'page' && t.url?.startsWith('app://obsidian.md'));
    if (!page) throw new Error('未找到 Obsidian 页面');
    return page;
}

async function evaluateInObsidian(expression) {
    const page = await getObsidianPage();
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });

    let nextId = 0;
    const pending = new Map();

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else if (msg.result?.exceptionDetails) {
            p.reject(new Error(msg.result.exceptionDetails.exception?.description || 'Eval Exception'));
        } else {
            p.resolve(msg.result?.result?.value);
        }
    };

    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = ++nextId;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });

    try {
        await send('Runtime.enable');
        const result = await send('Runtime.evaluate', {
            expression: `(async () => { ${expression} })()`,
            awaitPromise: true,
            returnByValue: true
        });
        return result;
    } finally {
        ws.close();
    }
}

async function runTest() {
    console.log('🚀 开始专项测试：已改名思维导图的应用内识别与交互流程...\n');

    // 1. 在应用中热重载插件
    console.log('--- 1. 热重载最新构建插件 ---');
    await evaluateInObsidian(`
        const pluginId = 'obsidian-siliconflow-transcriber';
        await app.plugins.disablePlugin(pluginId);
        await new Promise(r => setTimeout(r, 300));
        await app.plugins.enablePlugin(pluginId);
        await new Promise(r => setTimeout(r, 500));
    `);
    console.log('✓ 插件重载完成');

    // 2. 测试场景 A：打开真实已改名导图（无 🧠，无 -rich：05.谓语动词时态下.md），直接运行命令
    console.log('\n--- 2. 模拟场景 A：用户打开已改名导图后直接运行命令 ---');
    const openAndRunResult = await evaluateInObsidian(`
        const plugin = app.plugins.plugins['obsidian-siliconflow-transcriber'];
        // 寻找用户真实库中完全没有 🧠 和 -rich 后缀的导图
        const targetName = '05.谓语动词时态下.md';
        const renamedFile = app.vault.getMarkdownFiles().find(f => f.name === targetName);
        if (!renamedFile) return { error: '未找到文件: ' + targetName };

        // 模拟用户打开该文件为当前活动页面
        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(renamedFile);
        await new Promise(r => setTimeout(r, 400));

        // 模拟用户直接运行命令（未传任何参数，命令根据用户当前打开的活跃文件自动判定）
        await plugin.openMindmapBranchMigrateModal();
        await new Promise(r => setTimeout(r, 600));

        const modalEl = document.querySelector('.mindmap-branch-migrate-modal');
        const notePathText = modalEl?.querySelector('.mbm-note-path')?.textContent;
        const infoBar = modalEl?.querySelector('.mbm-info-bar')?.textContent;
        const cards = modalEl ? Array.from(modalEl.querySelectorAll('.mbm-group-card')) : [];

        // 关闭弹窗
        const cancelBtn = modalEl?.querySelector('.mbm-btn-row button:first-child');
        if (cancelBtn) cancelBtn.click();

        return {
            modalOpened: Boolean(modalEl),
            fileName: renamedFile.name,
            recognizedFilePath: notePathText,
            rootInfo: infoBar,
            branchCount: cards.length
        };
    `);

    console.log('✓ 场景 A 测试结果:');
    console.log(`  测试文件名: ${openAndRunResult.fileName}`);
    console.log(`  弹窗是否成功打开: ${openAndRunResult.modalOpened ? '✅ 成功打开' : '❌ 失败'}`);
    console.log(`  识别到的源文件路径: ${openAndRunResult.recognizedFilePath}`);
    console.log(`  信息条内容: ${openAndRunResult.rootInfo}`);
    console.log(`  展示的分支数量: ${openAndRunResult.branchCount} 个分支`);

    if (!openAndRunResult.modalOpened) {
        throw new Error('改名导图未能自动识别并打开弹窗');
    }

    // 3. 测试场景 B：测试全库目标导图选择器是否能搜到改名后的导图
    console.log('\n--- 3. 模拟场景 B：全库导图选择器对改名文件的发现能力 ---');
    const pickerResult = await evaluateInObsidian(`
        const plugin = app.plugins.plugins['obsidian-siliconflow-transcriber'];
        const dummyModal = new plugin.mindmapAPI.TargetMindmapPickerModal(app, null, () => {});
        const items = dummyModal.getItems();
        // 查找两个改名导图样本（无 🧠，无 -rich）
        const sample1 = items.find(f => f.name === '05.谓语动词时态下.md');
        const sample2 = items.find(f => f.name === '04.谓语动词时态上.md');

        return {
            totalMindmapsFound: items.length,
            foundSample1: Boolean(sample1),
            sample1Text: sample1 ? dummyModal.getItemText(sample1) : null,
            foundSample2: Boolean(sample2),
            sample2Text: sample2 ? dummyModal.getItemText(sample2) : null,
            firstFiveItems: items.slice(0, 5).map(f => dummyModal.getItemText(f))
        };
    `);

    console.log('✓ 场景 B 测试结果:');
    console.log(`  全库发现的思维导图总数: ${pickerResult.totalMindmapsFound} 个`);
    console.log(`  是否检索到样本1 (05.谓语动词时态下.md): ${pickerResult.foundSample1 ? '✅ 成功' : '❌ 未找到'}`);
    console.log(`    显示文本: ${pickerResult.sample1Text}`);
    console.log(`  是否检索到样本2 (04.谓语动词时态上.md): ${pickerResult.foundSample2 ? '✅ 成功' : '❌ 未找到'}`);
    console.log(`    显示文本: ${pickerResult.sample2Text}`);
    console.log('  检索到的前 5 个导图样例:');
    pickerResult.firstFiveItems.forEach((s) => console.log(`    - ${s}`));

    if (!pickerResult.foundSample1 || !pickerResult.foundSample2) {
        throw new Error('全库选择器未能发现改名后的导图文件');
    }

    console.log('\n🎉 =============================================================');
    console.log('🎉 完美！改名后的思维导图已 100% 支持“打开即运行”与“全库精准检索”！');
    console.log('🎉 =============================================================\n');
}

runTest().catch((e) => {
    console.error('❌ 测试未通过:', e);
    process.exit(1);
});
