# 思维导图链接节点修复工作流程

## 问题背景

当思维导图文件（`*-rich.md`）中的链接节点指向笔记文件中的标题时，如果标题内容不匹配，点击链接将无法正确定位到对应位置。

### 问题示例

- 思维导图链接中的标题：`⏱️ 00:58 解析式分类体系`
- 笔记文件实际标题：`⏱️ 00:58 解析式结构`

## 修复流程

### 第一步：对比分析

1. **读取笔记文件**，提取所有实际标题
2. **读取思维导图文件**，找出所有链接节点中的 `heading=` 参数
3. **对比两者差异**，确定需要修改的内容

### 第二步：准备替换映射

将需要替换的标题转换为URL编码格式：

```javascript
// JavaScript URL编码示例
encodeURIComponent('⏱️ 00:58 解析式结构')
// 输出: '%E2%8F%B1%EF%B8%8F%2000%3A58%20%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%BB%93%E6%9E%84'
```

### 第三步：创建修复脚本

创建 Node.js 脚本 `fix-mindmap-links.js`：

```javascript
const fs = require('fs');
const path = require('path');

// 读取思维导图文件
const mindmapPath = './XX🧠-rich.md';
let content = fs.readFileSync(mindmapPath, 'utf8');

// 定义需要替换的heading映射
// 格式: [错误的URL编码标题, 正确的URL编码标题]
const replacements = [
    // 示例：⏱️ 00:58 解析式分类体系 → ⏱️ 00:58 解析式结构
    ['%E2%8F%B1%EF%B8%8F%2000%3A58%20%E8%A7%A3%E6%9E%90%E5%BC%8F%E5%88%86%E7%B1%BB%E4%BD%93%E7%B3%BB', 
     '%E2%8F%B1%EF%B8%8F%2000%3A58%20%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%BB%93%E6%9E%84'],
    // 添加更多替换规则...
];

// 执行替换
let modified = false;
replacements.forEach(([oldHeading, newHeading]) => {
    if (content.includes(oldHeading)) {
        content = content.split(oldHeading).join(newHeading);
        console.log(`已替换: ${decodeURIComponent(oldHeading)} → ${decodeURIComponent(newHeading)}`);
        modified = true;
    } else {
        console.log(`未找到: ${decodeURIComponent(oldHeading)}`);
    }
});

if (modified) {
    // 写回文件，确保UTF-8编码
    fs.writeFileSync(mindmapPath, content, 'utf8');
    console.log('\n文件已成功更新！');
} else {
    console.log('\n没有需要修改的内容。');
}
```

### 第四步：运行脚本

```bash
node fix-mindmap-links.js
```

### 第五步：验证结果

```bash
# 提取所有heading参数并解码显示
node -e "const fs=require('fs'); const c=fs.readFileSync('XX🧠-rich.md','utf8'); const m=c.match(/heading=[^&]+/g); if(m) m.forEach(h => console.log(decodeURIComponent(h.replace('heading=',''))));"
```

### 第六步：更新节点显示文本

修改完URL后，还需要更新节点的显示文本（即链接节点的 `text` 字段），使其与笔记中的实际标题内容一致。

**节点结构示例**：
```json
{"id":"xxx","text":"<a href=\"obsidian://silicon-jump?file=...&heading=...\">📌显示文本</a>"}
```

**修改方法**：

1. 手动修改：直接编辑JSON中的显示文本部分
2. 脚本修改：

```javascript
// 更新节点显示文本
const textReplacements = [
    // [旧显示文本, 新显示文本]
    ['📌层级关系', '📌解析式结构'],
    ['📌加减法规则', '📌整式加减法运算'],
    // 更多替换规则...
];

textReplacements.forEach(([oldText, newText]) => {
    if (content.includes(oldText)) {
        content = content.split(oldText).join(newText);
        console.log(`已更新显示文本: ${oldText} → ${newText}`);
    }
});
```

### 第七步：清理临时文件

```bash
del fix-mindmap-links.js
```

### 第八步：输出未使用的链接

对比笔记中的所有标题与思维导图中已使用的标题，输出未使用的链接供参考：

```javascript
const fs = require('fs');

// 读取笔记文件，提取所有标题
const noteContent = fs.readFileSync('📝笔记文件.md', 'utf8');
const noteHeadings = (noteContent.match(/^####\s+.+/gm) || [])
    .map(h => h.replace(/^####\s+/, '').split('🎬')[0].trim());

// 读取思维导图文件，提取已使用的标题
const mindmapContent = fs.readFileSync('XX🧠-rich.md', 'utf8');
const usedHeadings = [];
const matches = mindmapContent.match(/heading=[^&"']+/g) || [];
matches.forEach(h => usedHeadings.push(decodeURIComponent(h.replace('heading=', ''))));

// 找出未使用的标题
const unusedHeadings = noteHeadings.filter(h => !usedHeadings.includes(h));

console.log('=== 未使用的标题 ===');
unusedHeadings.forEach(h => {
    console.log(`标题: ${h}`);
    console.log(`URL编码: ${encodeURIComponent(h)}`);
    console.log(`链接格式: obsidian://silicon-jump?file=笔记文件路径.md&heading=${encodeURIComponent(h)}`);
    console.log('---');
});
```

## 注意事项

### 1. 编码问题

**重要**：必须使用 UTF-8 编码处理文件，否则中文字符会乱码。

- ✅ 使用 Node.js 的 `fs.readFileSync(path, 'utf8')` 读取
- ✅ 使用 `fs.writeFileSync(path, content, 'utf8')` 写入
- ❌ 避免使用 PowerShell 直接处理中文内容（容易导致编码问题）

### 2. URL编码转换

标题需要转换为URL编码格式才能在链接中正确使用：

```javascript
// 编码
encodeURIComponent('⏱️ 00:58 解析式结构')

// 解码
decodeURIComponent('%E2%8F%B1%EF%B8%8F%2000%3A58%20%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%BB%93%E6%9E%84')
```

### 3. 替换方法

使用 `split().join()` 而非 `replace()`，确保替换所有匹配项：

```javascript
// 推荐
content = content.split(oldStr).join(newStr);

// 不推荐（只替换第一个匹配项）
content = content.replace(oldStr, newStr);

// 如果使用replace，需要正则表达式
content = content.replace(new RegExp(oldStr, 'g'), newStr);
```

## 常见问题

### Q: 如何快速获取URL编码？

```javascript
// 在浏览器控制台或Node.js中运行
console.log(encodeURIComponent('你的标题内容'));
```

### Q: 如何批量处理多个文件？

```javascript
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('.').filter(f => f.endsWith('🧠-rich.md'));

files.forEach(file => {
    console.log(`处理文件: ${file}`);
    // 对每个文件执行相同的替换逻辑
});
```

### Q: 如何从笔记文件自动提取标题？

```javascript
const fs = require('fs');

const noteContent = fs.readFileSync('📝笔记文件.md', 'utf8');
const headings = noteContent.match(/^#+\s+.+$/gm) || [];

headings.forEach(h => {
    // 提取标题内容（去除#号）
    const title = h.replace(/^#+\s+/, '').trim();
    console.log(`标题: ${title}`);
    console.log(`URL编码: ${encodeURIComponent(title)}`);
});
```

## 完整示例

### 本次修复的完整替换列表

| 原标题 | 修正后标题 |
|--------|-----------|
| ⏱️ 00:58 解析式分类体系 | ⏱️ 00:58 解析式结构 |
| ⏱️ 18:36 整式加减法规则与例题 | ⏱️ 18:36 整式加减法运算 |
| ⏱️ 20:54 单字母多项式乘法方法 | ⏱️ 20:54 整式乘法：单字母系数数式计算法 |

> **注意**：标题中的"系数数式"是正确的，不是"系数式"。URL编码为：
> `%E2%8F%B1%EF%B8%8F%2020%3A54%20%E6%95%B4%E5%BC%8F%E4%B9%98%E6%B3%95%EF%BC%9A%E5%8D%95%E5%AD%97%E6%AF%8D%E7%B3%BB%E6%95%B0%E6%95%B0%E5%BC%8F%E8%AE%A1%E7%AE%97%E6%B3%95`
| ⏱️ 27:15 双字母多项式乘法方法 | ⏱️ 27:15 整式乘法：双字母排列方法 |
| ⏱️ 07:30 整式与分式定义 | ⏱️ 07:30 整式与分式 |
| ⏱️ 46:59 多项式长除法预处理 | ⏱️ 46:52 分式化简预处理 |
| ⏱️ 03:57 多项式定义与性质 | ⏱️ 03:57 多项式 |
| ⏱️ 01:44 单项式定义与性质 | ⏱️ 01:44 单项式 |

---

## 未使用的链接列表

以下标题在笔记文件中存在，但思维导图中未使用。可直接复制HTML代码使用：

### 1. ⏱️ 00:03 解析式介绍

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2000%3A03%20%E8%A7%A3%E6%9E%90%E5%BC%8F%E4%BB%8B%E7%BB%8D">📌解析式介绍</a>
```

### 2. ⏱️ 10:00 有理式定义

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2010%3A00%20%E6%9C%89%E7%90%86%E5%BC%8F%E5%AE%9A%E4%B9%89">📌有理式定义</a>
```

### 3. ⏱️ 12:14 无理式定义

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2012%3A14%20%E6%97%A0%E7%90%86%E5%BC%8F%E5%AE%9A%E4%B9%89">📌无理式定义</a>
```

### 4. ⏱️ 13:35 代数式定义

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2013%3A35%20%E4%BB%A3%E6%95%B0%E5%BC%8F%E5%AE%9A%E4%B9%89">📌代数式定义</a>
```

### 5. ⏱️ 14:43 超越式定义

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2014%3A43%20%E8%B6%85%E8%B6%8A%E5%BC%8F%E5%AE%9A%E4%B9%89">📌超越式定义</a>
```

### 6. ⏱️ 17:35 代数式与超越式结构总结

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2017%3A35%20%E4%BB%A3%E6%95%B0%E5%BC%8F%E4%B8%8E%E8%B6%85%E8%B6%8A%E5%BC%8F%E7%BB%93%E6%9E%84%E6%80%BB%E7%BB%93">📌代数式与超越式结构总结</a>
```

### 7. ⏱️ 20:00 整式加减法推导完成

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2020%3A00%20%E6%95%B4%E5%BC%8F%E5%8A%A0%E5%87%8F%E6%B3%95%E6%8E%A8%E5%AF%BC%E5%AE%8C%E6%88%90">📌整式加减法推导完成</a>
```

### 8. ⏱️ 30:00 整式乘法竖式计算基础

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2030%3A00%20%E6%95%B4%E5%BC%8F%E4%B9%98%E6%B3%95%E7%AB%96%E5%BC%8F%E8%AE%A1%E7%AE%97%E5%9F%BA%E7%A1%80">📌整式乘法竖式计算基础</a>
```

### 9. ⏱️ 30:13 竖式计算步骤演示

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2030%3A13%20%E7%AB%96%E5%BC%8F%E8%AE%A1%E7%AE%97%E6%AD%A5%E9%AA%A4%E6%BC%94%E7%A4%BA">📌竖式计算步骤演示</a>
```

### 10. ⏱️ 30:46 乘积次数与缺项分析

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2030%3A46%20%E4%B9%98%E7%A7%AF%E6%AC%A1%E6%95%B0%E4%B8%8E%E7%BC%BA%E9%A1%B9%E5%88%86%E6%9E%90">📌乘积次数与缺项分析</a>
```

### 11. ⏱️ 32:04 缺项计算对比案例

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2032%3A04%20%E7%BC%BA%E9%A1%B9%E8%AE%A1%E7%AE%97%E5%AF%B9%E6%AF%94%E6%A1%88%E4%BE%8B">📌缺项计算对比案例</a>
```

### 12. ⏱️ 34:10 例题九（多项式乘法快速计算）

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2034%3A10%20%E4%BE%8B%E9%A2%98%E4%B9%9D%EF%BC%88%E5%A4%9A%E9%A1%B9%E5%BC%8F%E4%B9%98%E6%B3%95%E5%BF%AB%E9%80%9F%E8%AE%A1%E7%AE%97%EF%BC%89">📌例题九（多项式乘法快速计算）</a>
```

### 13. ⏱️ 36:28 一题一练（立方公式推导）

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2036%3A28%20%E4%B8%80%E9%A2%98%E4%B8%80%E7%BB%83%EF%BC%88%E7%AB%8B%E6%96%B9%E5%85%AC%E5%BC%8F%E6%8E%A8%E5%AF%BC%EF%BC%89">📌一题一练（立方公式推导）</a>
```

### 14. ⏱️ 39:32 立方差公式验证

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2039%3A32%20%E7%AB%8B%E6%96%B9%E5%B7%AE%E5%85%AC%E5%BC%8F%E9%AA%8C%E8%AF%81">📌立方差公式验证</a>
```

### 15. ⏱️ 40:00 多项式运算要点

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2040%3A00%20%E5%A4%9A%E9%A1%B9%E5%BC%8F%E8%BF%90%E7%AE%97%E8%A6%81%E7%82%B9">📌多项式运算要点</a>
```

### 16. ⏱️ 40:26 多项式分类情形

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2040%3A26%20%E5%A4%9A%E9%A1%B9%E5%BC%8F%E5%88%86%E7%B1%BB%E6%83%85%E5%BD%A2">📌多项式分类情形</a>
```

### 17. ⏱️ 41:02 异字母多项式乘法规则

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2041%3A02%20%E5%BC%82%E5%AD%97%E6%AF%8D%E5%A4%9A%E9%A1%B9%E5%BC%8F%E4%B9%98%E6%B3%95%E8%A7%84%E5%88%99">📌异字母多项式乘法规则</a>
```

### 18. ⏱️ 42:27 竖式乘法实操演示

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2042%3A27%20%E7%AB%96%E5%BC%8F%E4%B9%98%E6%B3%95%E5%AE%9E%E6%93%8D%E6%BC%94%E7%A4%BA">📌竖式乘法实操演示</a>
```

### 19. ⏱️ 44:25 分式运算引入

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2044%3A25%20%E5%88%86%E5%BC%8F%E8%BF%90%E7%AE%97%E5%BC%95%E5%85%A5">📌分式运算引入</a>
```

### 20. ⏱️ 48:19 例题十：分式化简

```html
<a href="obsidian://silicon-jump?file=z-MaxBin%2FZ_27%E6%95%B0%E5%AD%A6%2F02.%E9%9B%B6%E5%9F%BA%E7%A1%80%2F%F0%9F%93%9D%E6%99%BA%E8%83%BD%E7%AC%94%E8%AE%B0%2F%F0%9F%93%9D04.%E4%BA%8C%E3%80%81%E8%A7%A3%E6%9E%90%E5%BC%8F%E7%9A%84%E6%A6%82%E5%BF%B5%E4%B8%8E%E8%BF%90%E7%AE%9704.md&heading=%E2%8F%B1%EF%B8%8F%2048%3A19%20%E4%BE%8B%E9%A2%98%E5%8D%81%EF%BC%9A%E5%88%86%E5%BC%8F%E5%8C%96%E7%AE%80">📌例题十：分式化简</a>
```

---

*文档创建时间：2026-03-21*
