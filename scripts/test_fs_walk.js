/**
 * 测试 fs 遍历 vs Obsidian vault 索引
 * 运行: node scripts/test_fs_walk.js
 */
const fs = require('fs');
const path = require('path');

const vaultPath = 'E:\\Obsidian_Hub\\Quick Mark';
const mediaExts = ['mp4', 'mp3', 'wav', 'm4a', 'mov'];

const results = [];
const seen = new Set();

function walkDir(dirPath, relativePath) {
    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) {
        return;
    }

    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const fullChildPath = path.join(dirPath, entry.name);
        const relChildPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory() || entry.isSymbolicLink()) {
            let isDir = entry.isDirectory();
            if (entry.isSymbolicLink()) {
                try {
                    isDir = fs.statSync(fullChildPath).isDirectory();
                } catch {
                    console.log(`[SYMLINK ERROR] ${fullChildPath}`);
                    continue;
                }
            }
            if (isDir) {
                walkDir(fullChildPath, relChildPath);
            }
        } else if (entry.isFile()) {
            const ext = entry.name.split('.').pop()?.toLowerCase() || '';
            if (!mediaExts.includes(ext) || seen.has(relChildPath)) continue;
            seen.add(relChildPath);

            let stat;
            try {
                stat = fs.statSync(fullChildPath);
            } catch {
                stat = { size: 0 };
            }

            results.push({
                path: relChildPath,
                name: entry.name,
                size: stat.size,
                sizeStr: formatSize(stat.size)
            });
        }
    }
}

function formatSize(bytes) {
    const kb = bytes / 1024;
    if (kb > 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
    if (kb > 1024) return `${(kb / 1024).toFixed(0)} MB`;
    return `${kb.toFixed(0)} KB`;
}

walkDir(vaultPath, '');

console.log(`\n═══════════════════════════════════════════`);
console.log(`📊 fs 遍历结果: 共找到 ${results.length} 个媒体文件`);
console.log(`═══════════════════════════════════════════\n`);

// 按顶级目录分组统计
const byTopDir = {};
for (const f of results) {
    const top = f.path.split('/')[0];
    if (!byTopDir[top]) byTopDir[top] = [];
    byTopDir[top].push(f);
}

console.log('📁 按顶级目录分组:');
for (const [dir, files] of Object.entries(byTopDir).sort()) {
    console.log(`   ${dir}: ${files.length} 个文件`);
}

console.log(`\n📄 前20个文件:`);
for (const f of results.slice(0, 20)) {
    console.log(`   ${f.path}  (${f.sizeStr})`);
}

if (results.length > 20) {
    console.log(`   ... 还有 ${results.length - 20} 个`);
}
