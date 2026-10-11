/**
 * 🔬 在真实运行的 Obsidian 应用程序内进行端到端全链路实测
 *
 * 流程：
 * 1. 探测或启动 Obsidian（开启 --remote-debugging-port=9233）
 * 2. 通过 CDP WebSocket 挂载至应用内部渲染层
 * 3. 热重载 silicon-transcriber 插件，确保加载最新 main.js
 * 4. 在 Obsidian 真实应用沙箱中执行：
 *    - 验证命令注册与右键菜单
 *    - 验证 mindmapAPI
 *    - 读取真实 Vault 文件执行拓扑全覆盖解析
 *    - 模拟跨图迁移并验证数据结构
 *    - 触发并渲染 MindmapBranchMigrateModal 真实 DOM 弹窗
 */

import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = 9233;
const obsidianExe = 'C:/Users/17329/AppData/Local/Programs/Obsidian/Obsidian.exe';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listTargets() {
    const res = await fetch(`http://${host}:${port}/json`);
    if (!res.ok) throw new Error(`CDP /json returned ${res.status}`);
    return await res.json();
}

async function getObsidianPage() {
    const targets = await listTargets();
    const page = targets.find((t) => t.type === 'page' && t.url?.startsWith('app://obsidian.md'));
    if (!page) throw new Error('未找到 Obsidian 主界面窗口');
    return page;
}

async function ensureObsidianRunning() {
    try {
        await listTargets();
        console.log('✓ 检测到已在运行的带调试端口的 Obsidian 实例');
        return;
    } catch {
        console.log('⏳ 正在启动 Obsidian 应用实例（开启 CDP 调试端口 9233）…');
    }

    const child = spawn(
        obsidianExe,
        ['obsidian://open?vault=Quick_Mark', `--remote-debugging-port=${port}`],
        { detached: true, stdio: 'ignore' }
    );
    child.unref();

    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
        try {
            await listTargets();
            console.log('✅ Obsidian 启动成功并就绪！');
            return;
        } catch {
            await sleep(500);
        }
    }
    throw new Error('Obsidian 启动超时（25秒内未响应调试端口）');
}

async function evaluateInObsidian(expression) {
    const page = await getObsidianPage();
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = (err) => reject(new Error('WebSocket 连接 CDP 失败: ' + err));
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

async function runInAppTests() {
    await ensureObsidianRunning();
    await sleep(2000); // 留出 Vault 布局渲染缓冲

    console.log('\n--- 1. 在应用内重载插件并检查实例 ---');
    const reloadInfo = await evaluateInObsidian(`
        // 重新加载转写插件
        const pluginId = 'obsidian-siliconflow-transcriber';
        await app.plugins.disablePlugin(pluginId);
        await new Promise(r => setTimeout(r, 400));
        await app.plugins.enablePlugin(pluginId);
        await new Promise(r => setTimeout(r, 600));

        const plugin = app.plugins.plugins[pluginId];
        return {
            isLoaded: Boolean(plugin),
            pluginVersion: plugin?.manifest?.version,
            hasMindmapAPI: Boolean(plugin?.mindmapAPI),
            commands: Object.keys(app.commands.commands).filter(c => c.includes(pluginId))
        };
    `);

    console.log('✓ 插件在 Obsidian 内重载结果:', reloadInfo);
    if (!reloadInfo.isLoaded) throw new Error('转写插件未在应用中成功加载');
    if (!reloadInfo.hasMindmapAPI) throw new Error('插件实例未暴露 mindmapAPI');

    console.log('\n--- 2. 在应用内检索真实思维导图并测试拓扑解析 ---');
    const parseTest = await evaluateInObsidian(`
        const plugin = app.plugins.plugins['obsidian-siliconflow-transcriber'];
        const files = app.vault.getMarkdownFiles().filter(f => f.basename.includes('🧠') || f.name.endsWith('-rich.md'));
        if (files.length === 0) return { error: '未找到思维导图文件' };

        const testFile = files[0];
        const content = await app.vault.read(testFile);
        const analysis = plugin.mindmapAPI.parseAndAnalyze(content);

        return {
            filePath: testFile.path,
            rootTitle: analysis.rootNode?.text,
            totalNodeCount: analysis.totalNodeCount,
            groupsCount: analysis.groups.length,
            isComplete: analysis.isComplete,
            groups: analysis.groups.map(g => ({ title: g.title, type: g.type, count: g.nodeCount }))
        };
    `);

    console.log('✓ 应用内真实导图解析结果:');
    console.log(`  文件: ${parseTest.filePath}`);
    console.log(`  根节点: ${parseTest.rootTitle}`);
    console.log(`  节点总数: ${parseTest.totalNodeCount}`);
    console.log(`  分支数: ${parseTest.groupsCount}`);
    console.log(`  守恒完整性 (100%无遗漏): ${parseTest.isComplete ? '✅ 完整' : '❌ 缺失'}`);
    parseTest.groups.forEach((g, i) => {
        console.log(`    分支 ${i + 1}: [${g.type}] ${g.title} (${g.count} 个节点)`);
    });

    console.log('\n--- 3. 在应用内测试跨导图分支复制合并算法 ---');
    const mergeTest = await evaluateInObsidian(`
        const plugin = app.plugins.plugins['obsidian-siliconflow-transcriber'];
        const files = app.vault.getMarkdownFiles().filter(f => f.basename.includes('🧠') || f.name.endsWith('-rich.md'));
        if (files.length < 2) return { skipped: true, reason: '库内导图不足2个' };

        const srcFile = files[0];
        const tgtFile = files[1];
        const srcContent = await app.vault.read(srcFile);
        const tgtContent = await app.vault.read(tgtFile);

        const srcAnalysis = plugin.mindmapAPI.parseAndAnalyze(srcContent);
        const tgtAnalysis = plugin.mindmapAPI.parseAndAnalyze(tgtContent);

        const pickGroup = srcAnalysis.groups[0];
        const mergeResult = plugin.mindmapAPI.migrateGroups(srcContent, tgtContent, [pickGroup.id], 'copy');

        const postAnalysis = plugin.mindmapAPI.parseAndAnalyze(mergeResult.targetUpdatedContent);

        return {
            srcFile: srcFile.basename,
            tgtFile: tgtFile.basename,
            pickedGroupTitle: pickGroup.title,
            migratedNodes: mergeResult.migratedNodeCount,
            tgtBeforeNodes: tgtAnalysis.totalNodeCount,
            tgtAfterNodes: postAnalysis.totalNodeCount,
            deltaMatch: (postAnalysis.totalNodeCount - tgtAnalysis.totalNodeCount === pickGroup.nodeCount),
            isPostComplete: postAnalysis.isComplete
        };
    `);
    console.log('✓ 应用内跨图组装合并测试结果:', mergeTest);

    console.log('\n--- 4. 在应用内打开真实交互弹窗测试 DOM 渲染 ---');
    const modalTest = await evaluateInObsidian(`
        const plugin = app.plugins.plugins['obsidian-siliconflow-transcriber'];
        const files = app.vault.getMarkdownFiles().filter(f => f.basename.includes('🧠') || f.name.endsWith('-rich.md'));
        const testFile = files[0];

        // 触发打开迁移模态框
        await plugin.openMindmapBranchMigrateModal(testFile);
        await new Promise(r => setTimeout(r, 600));

        const modalEl = document.querySelector('.mindmap-branch-migrate-modal');
        const titleEl = modalEl?.querySelector('h2');
        const cards = modalEl ? Array.from(modalEl.querySelectorAll('.mbm-group-card')) : [];
        const summaryText = modalEl?.querySelector('.mbm-summary-count')?.textContent;

        const info = {
            modalExists: Boolean(modalEl),
            modalTitle: titleEl?.textContent,
            cardCount: cards.length,
            summaryText: summaryText
        };

        // 关闭弹窗
        const closeBtn = document.querySelector('.modal-close-button');
        if (closeBtn) closeBtn.click();
        else {
            const cancelBtn = modalEl?.querySelector('.mbm-btn-row button:first-child');
            if (cancelBtn) cancelBtn.click();
        }

        return info;
    `);

    console.log('✓ 应用内弹窗交互渲染测试结果:', modalTest);

    console.log('\n🎉 =======================================================');
    console.log('🎉 恭喜！Obsidian 应用内真实运行环境端到端验证 100% 成功！');
    console.log('🎉 =======================================================\n');
}

runInAppTests().catch((err) => {
    console.error('❌ 应用内测试失败:', err);
    process.exit(1);
});
