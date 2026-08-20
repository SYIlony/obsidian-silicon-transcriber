# LaTeX JSON 转义问题根因分析报告

## 一、问题根因分析

### 1.1 JSON 转义规范冲突

JSON 规范定义了 8 个合法转义符：
| 转义符 | 含义 |
|--------|------|
| `\"` | 双引号 |
| `\\` | 反斜杠 |
| `\/` | 斜杠 |
| `\b` | 退格符 |
| `\f` | 换页符 |
| `\n` | 换行符 |
| `\r` | 回车符 |
| `\t` | 制表符 |

当 LaTeX 命令以这些字母开头时，会与 JSON 转义冲突：

| JSON 转义符 | 受影响的 LaTeX 命令 |
|-------------|---------------------|
| `\b` | `\bar`, `\begin`, `\beta`, `\bf`, `\big`, `\bm`, `\boxed`, `\box`, `\bigg` |
| `\f` | `\frac`, `\forall`, `\flat`, `\footnote` |
| `\n` | `\nabla`, `\neq`, `\nu`, `\not`, `\norm`, `\neg`, `\natural`, `\nearrow` |
| `\r` | `\rho`, `\right`, `\rangle`, `\root` |
| `\t` | `\theta`, `\tau`, `\times`, `\to`, `\tilde`, `\text`, `\top`, `\tan`, `\therefore` |

### 1.2 当前方案架构

当前 [`fixJsonBackslashes()`](src/llm.ts:32) 函数采用**两阶段处理**：

```
┌─────────────────────────────────────────────────────────────────┐
│  阶段一：精准打击                                                 │
│  正则: /(?<!\\)\\([bfnrt])(?=[a-zA-Z])/g                        │
│  作用: 匹配 \[bfnrt] 后跟字母的 LaTeX 命令，双写反斜杠保护         │
│  示例: \frac → \\frac                                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  阶段二：通用扫描                                                 │
│  方式: 逐字符扫描                                                │
│  作用: 处理 Unicode 转义、孤立反斜杠、其他 LaTeX 命令             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、当前方案健壮性问题

### 2.1 代码与注释不一致

查看 [`src/llm.ts:49`](src/llm.ts:49)：
```typescript
// \r: \rho, \right, \rangle, \sqrt (注意: \sqrt 以 \s 开头，阶段二处理)
```

但正则 `([bfnrt])` 匹配的是**单个字符**。`\rho` 的首字母是 `r`，所以 `\rho` 会被阶段一匹配（双写反斜杠后变成 `\\rho`）。然而注释却说"阶段二处理"，这是错误的。

### 2.2 阶段一覆盖不完整

正则 `(?<!\\)\\([bfnrt])(?=[a-zA-Z])` 只覆盖了以 `[bfnrt]` 开头的命令。

**遗漏的命令示例**（不以 `[bfnrt]` 开头）：
- `\alpha`, `\beta`, `\gamma`, `\delta` - 希腊字母
- `\sum`, `\int`, `\partial`, `\infty` - 数学符号
- `\leq`, `\geq`, `\approx`, `\equiv` - 关系符号
- `\omega`, `\phi`, `\psi`, `\sigma` - 更多希腊字母

这些命令由阶段二处理，但阶段二的双写反斜杠逻辑是 `fixed += '\\\\'`，会将 `\alpha` 变成 `\\alpha`。

### 2.3 复杂边界情况处理风险

逐字符扫描在遇到连续反斜杠时（如 `\\frac`）的逻辑：
```typescript
} else if (next === '\\') {
    // 特殊处理连续反斜杠
    fixed += result[i];
    i += 2;
}
```

如果输入是 `\\\frac`（三重反斜杠），处理逻辑会变得复杂且容易出错。

### 2.4 多阶段处理的交互问题

代码中有多处调用 `fixJsonBackslashes`：
- 第 276 行：首次清洗响应
- 第 298 行：从 `{` 位置提取后再次清洗
- 第 433、448 行：全局修正模块中也有类似调用

每次清洗都可能改变字符串结构，多阶段调用可能导致不一致的结果。

---

## 三、解决方案评估

### 3.1 方案A：LaTeX 占位符保护（Early Protection）

**原理**：在 JSON 序列化前，将所有 LaTeX 命令替换为占位符，API 返回后再还原。

**评估**：
| 维度 | 评分 | 说明 |
|------|------|------|
| 彻底性 | ★★★★★ | 能从根本上解决转义冲突 |
| 实现复杂度 | ★★★☆☆ | 需要枚举 LaTeX 命令或使用通用模式匹配 |
| 风险 | ★★☆☆☆ | 占位符需要保证不与内容冲突 |

**关键问题**：当前的问题在于 **AI 返回的 JSON 字符串**中包含 LaTeX，而不是发送给 AI 的 prompt 中。所以需要在两个地方处理：
1. **发送前**：对 prompt 中的 LaTeX 进行保护（可选，因为 prompt 是我们构造的）
2. **接收后**：对 AI 返回的 LaTeX 进行保护（核心问题）

### 3.2 方案B：使用 Raw String / Text 格式

**原理**：不使用 JSON 格式，改用纯文本传输内容。

**评估**：
| 维度 | 评分 | 说明 |
|------|------|------|
| 彻底性 | ★★★★★ | 彻底绕过 JSON 转义问题 |
| API 兼容性 | ★☆☆☆☆ | 魔搭社区和火山引擎 API 都强制要求 JSON |
| 实现复杂度 | ★★☆☆☆ | 需要修改 API 调用层 |

**结论**：**不可行**，LLM API 不支持非 JSON 格式。

### 3.3 方案C：Markdown 替代 LaTeX

**原理**：在传输过程中用 Markdown 格式替代 LaTeX（如 `$x^2$` 替代 `\frax{1}{2}`）。

**评估**：
| 维度 | 评分 | 说明 |
|------|------|------|
| 彻底性 | ★★☆☆☆ | 部分 LaTeX 无法用 Markdown 表示 |
| AI 理解度 | ★★★☆☆ | AI 可以理解两种格式，但 Markdown 数学格式有限 |
| 用户体验 | ★★★★☆ | 对于简单公式，Markdown 更通用 |

**关键问题**：
- `\frac{1}{2}` 无法用 Markdown 表示
- `\begin{cases}` 等复杂环境无法表示
- AI 返回的格式会与输入格式不一致

**结论**：**部分场景可用，但不能完全替代**。

### 3.4 方案D：Base64 编码

**原理**：将包含 LaTeX 的内容 Base64 编码后传输。

**评估**：
| 维度 | 评分 | 说明 |
|------|------|------|
| 彻底性 | ★★★★★ | 完全绕过转义问题 |
| AI 理解度 | ☆☆☆☆☆ | AI 无法理解 Base64 编码的数学公式 |
| 实现复杂度 | ★★☆☆☆ | 编码解码都很简单 |

**结论**：**完全不可行**，AI 无法理解和处理编码内容。

### 3.5 方案E：统一、简化的正则表达式

**原理**：简化当前两阶段处理为一个更强大的正则表达式。

**评估**：
| 维度 | 评分 | 说明 |
|------|------|------|
| 彻底性 | ★★★☆☆ | 仍属于"穷举"方式，难以覆盖所有边界 |
| 性能 | ★★★★☆ | 单次正则匹配比逐字符扫描更快 |
| 可维护性 | ★★☆☆☆ | 复杂正则难以理解和维护 |

**当前正则问题**：
```typescript
/(?<!\\)\\([bfnrt])(?=[a-zA-Z])/g
```
这个正则本身就有歧义性，难以扩展。

**结论**：**不能根本解决问题**，只是优化了现有方案。

### 3.6 方案F：FormData / Multipart

**原理**：使用 `multipart/form-data` 格式传输内容。

**评估**：
| 维度 | 评分 | 说明 |
|------|------|------|
| 彻底性 | ★★★★★ | 完全绕过 JSON 转义问题 |
| API 兼容性 | ☆☆☆☆☆ | LLM API 通常只接受 JSON body |
| 实现复杂度 | ★★★☆☆ | 需要修改整个 API 调用层 |

**结论**：**不可行**，LLM API 不支持 multipart 格式。

---

## 四、推荐方案：增强型占位符保护（方案A的改进版）

### 4.1 为什么选择方案A

1. **唯一能根本解决问题**：在 JSON 解析前进行保护，解析后还原，完全绕开转义冲突
2. **API 兼容**：不改变 API 调用方式
3. **可逆性**：保护-还原过程可逆，不丢失信息

### 4.2 改进思路

当前方案的问题在于：
- **枚举式**：试图列举所有 `[bfnrt]` 开头的命令
- **被动式**：问题发生后才修复

改进方案：
1. **主动式保护**：使用通用模式匹配所有 LaTeX 命令，而非枚举
2. **双向保护**：在 API 返回后立即进行保护处理
3. **单次处理**：避免多次调用导致的状态混乱

### 4.3 改进后的算法

```typescript
/**
 * LaTeX 占位符保护函数
 * 
 * 策略：
 * 1. 提取所有 $...$ 包裹的 LaTeX 公式
 * 2. 将公式内的反斜杠暂时替换为特殊占位符
 * 3. JSON 解析
 * 4. 还原公式中的反斜杠
 */
function protectLatexForJsonParse(content: string): { protected: string; latexMap: Map<string, string> } {
    const latexMap = new Map<string, string>();
    let counter = 0;
    
    // 匹配 $...$ 或 $$...$$ 包裹的 LaTeX 公式
    const protectedContent = content.replace(/\$\$(.*?)\$\$|\$(.*?)\$/gs, (match) => {
        // 将公式内的反斜杠替换为占位符
        const normalized = match.replace(/\\/g, `\u0000LATEX_BACKSLASH_${counter++}\u0000`);
        latexMap.set(normalized, match); // 存储原始版本
        return normalized;
    });
    
    return { protected: protectedContent, latexMap };
}

function restoreLatex(protected: string, latexMap: Map<string, string>): string {
    let result = protected;
    latexMap.forEach((original, protected_) => {
        result = result.replace(protected_, original);
    });
    return result;
}
```

### 4.4 核心优势

| 优势 | 说明 |
|------|------|
| **彻底性** | 保护所有 LaTeX 公式，无遗漏 |
| **简洁性** | 算法简单清晰，易于理解和维护 |
| **可逆性** | 完全还原原始内容 |
| **无枚举** | 不需要列举任何 LaTeX 命令 |
| **单次处理** | 避免多次调用导致的问题 |

---

## 五、实现计划

### 第一步：创建独立的 LaTeX 保护模块

创建新文件 `src/latex-protect.ts`：

```typescript
/**
 * LaTeX JSON 保护模块
 * 提供 LaTeX 公式的保护和还原功能
 */

export class LatexProtect {
    private placeholders: Map<string, string> = new Map();
    private counter = 0;
    
    // 匹配 LaTeX 公式：$...$ 或 $$...$$
    private latexPattern = /\$\$(.*?)\$\$|\$(.*?)\$/gs;
    
    /**
     * 保护 LaTeX 公式，替换反斜杠为占位符
     */
    protect(content: string): string {
        this.placeholders.clear();
        this.counter = 0;
        
        return content.replace(this.latexPattern, (match) => {
            // 保护公式内的反斜杠
            const protected_ = match.replace(/\\/g, () => {
                const placeholder = `\u0000LATEX${this.counter++}\u0000`;
                this.placeholders.set(placeholder, '\\');
                return placeholder;
            });
            return protected_;
        });
    }
    
    /**
     * 还原 LaTeX 公式
     */
    restore(content: string): string {
        let result = content;
        for (let i = 0; i < this.counter; i++) {
            const placeholder = `\u0000LATEX${i}\u0000`;
            result = result.split(placeholder).join(this.placeholders.get(placeholder) || '');
        }
        return result;
    }
}
```

### 第二步：修改 `src/llm.ts`

1. 导入新的保护模块
2. 在 JSON 解析前使用保护功能
3. 在 JSON 解析后还原 LaTeX

```typescript
import { LatexProtect } from './latex-protect';

const latexProtect = new LatexProtect();

// 在 getBatchSummary 中修改：
let content = response.json.choices?.[0]?.message?.content || "";
content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

// 使用新的保护机制
const { protected: safeContent, latexMap } = latexProtect.protect(content);

try {
    const result = JSON.parse(safeContent);
    // 还原 LaTeX
    const restored = latexProtect.restore(JSON.stringify(result));
    parseResult(JSON.parse(restored));
} catch {
    // 降级到原有方案
    content = fixJsonBackslashes(content);
    // ... 其余逻辑
}
```

### 第三步：验证

1. **单元测试**：使用包含各种 LaTeX 命令的测试用例验证
2. **集成测试**：使用真实 API 调用验证
3. **边界测试**：
   - 空的 LaTeX 公式
   - 多层嵌套公式
   - 转义符组合（如 `\\frac`）
   - Unicode 字符混合

### 验证方法

```typescript
// 测试用例
const testCases = [
    { input: '{"summary": "$x = \\frac{1}{2}$"}', expected: '{"summary": "$x = \\frac{1}{2}$"}' },
    { input: '{"title": "$\\alpha + \\beta = \\gamma$"}', expected: '{"title": "$\\alpha + \\beta = \\gamma$"}' },
    { input: '{"formula": "$\\int_0^\\infty e^{x^2} dx$"}', expected: '{"formula": "$\\int_0^\\infty e^{x^2} dx$"}' },
];
```

---

## 六、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 占位符与内容冲突 | 低 | 高 | 使用 Unicode 不可见字符作为边界 |
| 多层嵌套公式处理失败 | 中 | 中 | 增加测试覆盖 |
| 性能下降 | 低 | 低 | 占位符替换是 O(n) 操作 |

---

## 七、总结

当前方案的根因是 **JSON 转义规范与 LaTeX 命令的字母开头冲突**。推荐的**增强型占位符保护方案**通过：

1. 在 JSON 解析前保护所有 `$...$` 包裹的 LaTeX 公式
2. 解析后还原公式内容
3. 避免枚举任何 LaTeX 命令

这种方式彻底解决了转义冲突问题，同时保持了代码的简洁性和可维护性。