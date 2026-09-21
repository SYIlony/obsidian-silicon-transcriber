"use strict";
/**
 * 🛡️ LaTeX 占位符保护器
 *
 * ## 问题背景
 * JSON 中合法的转义符有：\", \\, \/, \b, \f, \n, \r, \t, \uXXXX
 * 这导致 LaTeX 命令会被错误处理（如 \b, \f, \n, \r, \t 开头等）
 *
 * ## 双反斜杠问题
 * 当 LaTeX 公式经过 JSON 序列化或字符串转义后，单反斜杠会变成双反斜杠：
 * - 原始：`\frac` → 序列化后：`\\frac`
 * - 原始：`\left` → 序列化后：`\\left`
 * 这会导致公式渲染失败。
 *
 * ## 解决方案
 * 1. 在 JSON 解析前，将所有 $...$ 和 $$...$$ 包裹的 LaTeX 公式内的反斜杠替换为占位符
 * 2. 解析后还原时，检测并修复双反斜杠问题
 *
 * ## 优势
 * - 彻底性：保护所有 $...$ 包裹的公式，无遗漏
 * - 可逆性：完全还原原始内容
 * - 兼容性：不改变 API 调用方式
 * - 修复性：自动修复已存在的双反斜杠问题
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LatexProtect = void 0;
class LatexProtect {
    constructor() {
        this.placeholders = new Map();
        this.counter = 0;
    }
    /**
     * 保护 LaTeX 公式中的反斜杠
     * 将 $...$ 或 $$...$$ 内的反斜杠替换为占位符
     *
     * @param content 原始内容
     * @returns 保护后的内容
     */
    protect(content) {
        // 使用 "##" 作为占位符的边界标记，避免与普通文本冲突
        // 占位符格式：##LATEX{N}##，其中 N 是计数器
        // 使用 [\s\S] 替代 . 来匹配所有字符（包括换行），避免 ES2018+ 需求
        // 注意：不能使用 \u0001 等控制字符，因为它们是非法的 JSON 字符
        return content.replace(/\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$/g, (match, group1, group2) => {
            const innerContent = group1 || group2;
            const protectedInner = innerContent.replace(/\\/g, () => {
                const placeholder = `##LATEX${this.counter++}##`;
                this.placeholders.set(placeholder, '\\');
                return placeholder;
            });
            return match.replace(innerContent, protectedInner);
        });
    }
    /**
     * 还原 LaTeX 公式中的反斜杠
     * 将占位符替换回原始的反斜杠
     *
     * @param content 包含占位符的内容
     * @returns 还原后的内容
     */
    restore(content) {
        let result = content;
        // 使用 Array.from 避免 downlevelIteration 问题
        const entries = Array.from(this.placeholders.entries());
        for (const [placeholder, original] of entries) {
            result = result.split(placeholder).join(original);
        }
        // 注意：不再自动清空 placeholders，以便支持多次 restore 调用
        // 调用者应在处理完所有内容后手动调用 reset()
        return result;
    }
    /**
     * 🔧 修复双反斜杠问题
     * 将 $...$ 和 $$...$$ 中的双反斜杠（\\command）修复为单反斜杠（\command）
     *
     * 这是处理 JSON 序列化或字符串转义导致的反斜杠翻倍问题。
     *
     * @param content 可能包含双反斜杠的内容
     * @returns 修复后的内容
     */
    fixDoubleBackslash(content) {
        // 修复 $$...$$ 中的双反斜杠
        content = content.replace(/\$\$([\s\S]*?)\$\$/g, (match, inner) => {
            // 将 \\x 替换为 \x（但保留真正的换行符 \\）
            // LaTeX 命令格式：\commandName（反斜杠后跟字母）
            // 双反斜杠问题：\\commandName（两个反斜杠后跟字母）
            const fixed = inner.replace(/\\\\([a-zA-Z])/g, '\\$1');
            return `$$${fixed}$$`;
        });
        // 修复 $...$ 中的双反斜杠（避免匹配 $$）
        content = content.replace(/(?<!\$)\$(?!\$)([\s\S]*?)\$/g, (match, inner) => {
            const fixed = inner.replace(/\\\\([a-zA-Z])/g, '\\$1');
            return `$${fixed}$`;
        });
        return content;
    }
    /**
     * 还原并修复
     * 先还原占位符，再修复可能存在的双反斜杠问题
     *
     * @param content 包含占位符的内容
     * @returns 还原并修复后的内容
     */
    restoreAndFix(content) {
        let result = this.restore(content);
        result = this.fixDoubleBackslash(result);
        return result;
    }
    /**
     * 批量还原多个字段
     *
     * @param obj 包含需要还原字段的对象
     * @param fields 需要还原的字段名数组
     * @returns 还原后的新对象（不修改原对象）
     */
    restoreFields(obj, fields) {
        const result = { ...obj };
        for (const field of fields) {
            if (typeof result[field] === 'string') {
                result[field] = this.restore(result[field]);
            }
        }
        return result;
    }
    /**
     * 批量还原并修复多个字段
     *
     * @param obj 包含需要还原字段的对象
     * @param fields 需要还原的字段名数组
     * @returns 还原并修复后的新对象（不修改原对象）
     */
    restoreAndFixFields(obj, fields) {
        const result = { ...obj };
        for (const field of fields) {
            if (typeof result[field] === 'string') {
                result[field] = this.restoreAndFix(result[field]);
            }
        }
        return result;
    }
    /**
     * 重置内部状态
     * 用于在处理多个 JSON 对象时清理状态
     */
    reset() {
        this.placeholders.clear();
        this.counter = 0;
    }
}
exports.LatexProtect = LatexProtect;
