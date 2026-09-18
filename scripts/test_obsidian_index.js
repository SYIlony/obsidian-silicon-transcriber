/**
 * 测试 Obsidian vault 索引命中率
 * 通过 esbuild 打包后在 Obsidian 控制台运行
 * 
 * 使用方式：在 Obsidian 控制台粘贴运行
 */
const fs = require('fs');
const path = require('path');

const vaultPath = app.vault.adapter.getBasePath();
const mediaExts = ['mp4', 'mp3', 'wav', 'm4a', 'mov'];

const allFiles = [];
const seen = new Set();

function walkDir(dirPath, relativePath) {
    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) { return; }

    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullChildPath = path.join(dirPath, entry.name);
        const relChildPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory() || entry.isSymbolicLink()) {
            let isDir = entry.isDirectory();
            if (entry.isSymbolicLink()) {
                try { isDir = fs.statSync(fullChildPath).isDirectory(); }
                catch { continue; }
            }
            if (isDir) walkDir(fullChildPath, relChildPath);
        } else if (entry.isFile()) {
            const ext = entry.name.split('.').pop()?.toLowerCase() || '';
            if (!mediaExts.includes(ext) || seen.has(relChildPath)) continue;
            seen.add(relChildPath);

            // 检查 Obsidian 是否索引了
            const tfile = app.vault.getAbstractFileByPath(relChildPath);
            allFiles.push({
                path: relChildPath,
                hasTFile: tfile instanceof TFile,
                tfilePath: tfile?.path
            });
        }
    }
}

walkDir(vaultPath, '');

const total = allFiles.length;
const indexed = allFiles.filter(f => f.hasTFile).length;
const notIndexed = allFiles.filter(f => !f.hasTFile);

console.log(`\n═══════════════════════════════════════════`);
console.log(`📊 fs 找到 ${total} 个文件`);
console.log(`✅ Obsidian 索引命中: ${indexed}`);
console.log(`❌ Obsidian 未索引: ${notIndexed.length}`);
console.log(`═══════════════════════════════════════════\n`);

if (notIndexed.length > 0) {
    console.log(`❌ 未索引的文件 (前20个):`);
    for (const f of notIndexed.slice(0, 20)) {
        console.log(`   ${f.path}`);
    }
}

// 同时测试 vault.getFiles() 直接返回多少
const vaultFiles = app.vault.getFiles().filter(f => {
    const ext = f.extension?.toLowerCase();
    return mediaExts.includes(ext) && !f.path.includes('.obsidian/plugins/');
});
console.log(`\n📦 vault.getFiles() 直接返回: ${vaultFiles.length} 个媒体文件`);
console.log(`   前10个:`);
for (const f of vaultFiles.slice(0, 10)) {
    console.log(`   ${f.path}`);
}
