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
        const result = Object.assign({}, obj);
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
        const result = Object.assign({}, obj);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF0ZXgtcHJvdGVjdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxhdGV4LXByb3RlY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBc0JHOzs7QUFFSCxNQUFhLFlBQVk7SUFBekI7UUFDWSxpQkFBWSxHQUF3QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzlDLFlBQU8sR0FBRyxDQUFDLENBQUM7SUErSHhCLENBQUM7SUE3SEc7Ozs7OztPQU1HO0lBQ0gsT0FBTyxDQUFDLE9BQWU7UUFDbkIsK0JBQStCO1FBQy9CLCtCQUErQjtRQUMvQiw2Q0FBNkM7UUFDN0Msd0NBQXdDO1FBQ3hDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxvQ0FBb0MsRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDbkYsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLE1BQU0sQ0FBQztZQUN0QyxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUU7Z0JBQ3BELE1BQU0sV0FBVyxHQUFHLFVBQVUsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUM7Z0JBQ2pELElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDekMsT0FBTyxXQUFXLENBQUM7WUFDdkIsQ0FBQyxDQUFDLENBQUM7WUFDSCxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILE9BQU8sQ0FBQyxPQUFlO1FBQ25CLElBQUksTUFBTSxHQUFHLE9BQU8sQ0FBQztRQUNyQix5Q0FBeUM7UUFDekMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDeEQsS0FBSyxNQUFNLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQzVDLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0RCxDQUFDO1FBQ0QsMkNBQTJDO1FBQzNDLDRCQUE0QjtRQUM1QixPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQ7Ozs7Ozs7O09BUUc7SUFDSCxrQkFBa0IsQ0FBQyxPQUFlO1FBQzlCLG9CQUFvQjtRQUNwQixPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUM5RCw2QkFBNkI7WUFDN0IsbUNBQW1DO1lBQ25DLGtDQUFrQztZQUNsQyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3ZELE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQztRQUMxQixDQUFDLENBQUMsQ0FBQztRQUVILDJCQUEyQjtRQUMzQixPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyw4QkFBOEIsRUFBRSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUN2RSxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3ZELE9BQU8sSUFBSSxLQUFLLEdBQUcsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sT0FBTyxDQUFDO0lBQ25CLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSCxhQUFhLENBQUMsT0FBZTtRQUN6QixJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ25DLE1BQU0sR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDekMsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILGFBQWEsQ0FBZ0MsR0FBTSxFQUFFLE1BQW1CO1FBQ3BFLE1BQU0sTUFBTSxxQkFBUSxHQUFHLENBQUUsQ0FBQztRQUMxQixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQ3pCLElBQUksT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQVEsQ0FBUSxDQUFDO1lBQzlELENBQUM7UUFDTCxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVEOzs7Ozs7T0FNRztJQUNILG1CQUFtQixDQUFnQyxHQUFNLEVBQUUsTUFBbUI7UUFDMUUsTUFBTSxNQUFNLHFCQUFRLEdBQUcsQ0FBRSxDQUFDO1FBQzFCLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7WUFDekIsSUFBSSxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDcEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBUSxDQUFRLENBQUM7WUFDcEUsQ0FBQztRQUNMLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDMUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUM7SUFDckIsQ0FBQztDQUNKO0FBaklELG9DQWlJQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiDwn5uh77iPIExhVGVYIOWNoOS9jeespuS/neaKpOWZqFxyXG4gKiBcclxuICogIyMg6Zeu6aKY6IOM5pmvXHJcbiAqIEpTT04g5Lit5ZCI5rOV55qE6L2s5LmJ56ym5pyJ77yaXFxcIiwgXFxcXCwgXFwvLCBcXGIsIFxcZiwgXFxuLCBcXHIsIFxcdCwgXFx1WFhYWFxyXG4gKiDov5nlr7zoh7QgTGFUZVgg5ZG95Luk5Lya6KKr6ZSZ6K+v5aSE55CG77yI5aaCIFxcYiwgXFxmLCBcXG4sIFxcciwgXFx0IOW8gOWktOetie+8iVxyXG4gKiBcclxuICogIyMg5Y+M5Y+N5pac5p2g6Zeu6aKYXHJcbiAqIOW9kyBMYVRlWCDlhazlvI/nu4/ov4cgSlNPTiDluo/liJfljJbmiJblrZfnrKbkuLLovazkuYnlkI7vvIzljZXlj43mlpzmnaDkvJrlj5jmiJDlj4zlj43mlpzmnaDvvJpcclxuICogLSDljp/lp4vvvJpgXFxmcmFjYCDihpIg5bqP5YiX5YyW5ZCO77yaYFxcXFxmcmFjYFxyXG4gKiAtIOWOn+Wni++8mmBcXGxlZnRgIOKGkiDluo/liJfljJblkI7vvJpgXFxcXGxlZnRgXHJcbiAqIOi/meS8muWvvOiHtOWFrOW8j+a4suafk+Wksei0peOAglxyXG4gKiBcclxuICogIyMg6Kej5Yaz5pa55qGIXHJcbiAqIDEuIOWcqCBKU09OIOino+aekOWJje+8jOWwhuaJgOaciSAkLi4uJCDlkowgJCQuLi4kJCDljIXoo7nnmoQgTGFUZVgg5YWs5byP5YaF55qE5Y+N5pac5p2g5pu/5o2i5Li65Y2g5L2N56ymXHJcbiAqIDIuIOino+aekOWQjui/mOWOn+aXtu+8jOajgOa1i+W5tuS/ruWkjeWPjOWPjeaWnOadoOmXrumimFxyXG4gKiBcclxuICogIyMg5LyY5Yq/XHJcbiAqIC0g5b275bqV5oCn77ya5L+d5oqk5omA5pyJICQuLi4kIOWMheijueeahOWFrOW8j++8jOaXoOmBl+a8j1xyXG4gKiAtIOWPr+mAhuaAp++8muWujOWFqOi/mOWOn+WOn+Wni+WGheWuuVxyXG4gKiAtIOWFvOWuueaAp++8muS4jeaUueWPmCBBUEkg6LCD55So5pa55byPXHJcbiAqIC0g5L+u5aSN5oCn77ya6Ieq5Yqo5L+u5aSN5bey5a2Y5Zyo55qE5Y+M5Y+N5pac5p2g6Zeu6aKYXHJcbiAqL1xyXG5cclxuZXhwb3J0IGNsYXNzIExhdGV4UHJvdGVjdCB7XHJcbiAgICBwcml2YXRlIHBsYWNlaG9sZGVyczogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgY291bnRlciA9IDA7XHJcbiAgICBcclxuICAgIC8qKlxyXG4gICAgICog5L+d5oqkIExhVGVYIOWFrOW8j+S4reeahOWPjeaWnOadoFxyXG4gICAgICog5bCGICQuLi4kIOaIliAkJC4uLiQkIOWGheeahOWPjeaWnOadoOabv+aNouS4uuWNoOS9jeesplxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0gY29udGVudCDljp/lp4vlhoXlrrlcclxuICAgICAqIEByZXR1cm5zIOS/neaKpOWQjueahOWGheWuuVxyXG4gICAgICovXHJcbiAgICBwcm90ZWN0KGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICAgICAgLy8g5L2/55SoIFwiIyNcIiDkvZzkuLrljaDkvY3nrKbnmoTovrnnlYzmoIforrDvvIzpgb/lhY3kuI7mma7pgJrmlofmnKzlhrLnqoFcclxuICAgICAgICAvLyDljaDkvY3nrKbmoLzlvI/vvJojI0xBVEVYe059IyPvvIzlhbbkuK0gTiDmmK/orqHmlbDlmahcclxuICAgICAgICAvLyDkvb/nlKggW1xcc1xcU10g5pu/5LujIC4g5p2l5Yy56YWN5omA5pyJ5a2X56ym77yI5YyF5ous5o2i6KGM77yJ77yM6YG/5YWNIEVTMjAxOCsg6ZyA5rGCXHJcbiAgICAgICAgLy8g5rOo5oSP77ya5LiN6IO95L2/55SoIFxcdTAwMDEg562J5o6n5Yi25a2X56ym77yM5Zug5Li65a6D5Lus5piv6Z2e5rOV55qEIEpTT04g5a2X56ymXHJcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQucmVwbGFjZSgvXFwkXFwkKFtcXHNcXFNdKj8pXFwkXFwkfFxcJChbXFxzXFxTXSo/KVxcJC9nLCAobWF0Y2gsIGdyb3VwMSwgZ3JvdXAyKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGlubmVyQ29udGVudCA9IGdyb3VwMSB8fCBncm91cDI7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb3RlY3RlZElubmVyID0gaW5uZXJDb250ZW50LnJlcGxhY2UoL1xcXFwvZywgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGxhY2Vob2xkZXIgPSBgIyNMQVRFWCR7dGhpcy5jb3VudGVyKyt9IyNgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGFjZWhvbGRlcnMuc2V0KHBsYWNlaG9sZGVyLCAnXFxcXCcpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHBsYWNlaG9sZGVyO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoLnJlcGxhY2UoaW5uZXJDb250ZW50LCBwcm90ZWN0ZWRJbm5lcik7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8qKlxyXG4gICAgICog6L+Y5Y6fIExhVGVYIOWFrOW8j+S4reeahOWPjeaWnOadoFxyXG4gICAgICog5bCG5Y2g5L2N56ym5pu/5o2i5Zue5Y6f5aeL55qE5Y+N5pac5p2gXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIGNvbnRlbnQg5YyF5ZCr5Y2g5L2N56ym55qE5YaF5a65XHJcbiAgICAgKiBAcmV0dXJucyDov5jljp/lkI7nmoTlhoXlrrlcclxuICAgICAqL1xyXG4gICAgcmVzdG9yZShjb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBjb250ZW50O1xyXG4gICAgICAgIC8vIOS9v+eUqCBBcnJheS5mcm9tIOmBv+WFjSBkb3dubGV2ZWxJdGVyYXRpb24g6Zeu6aKYXHJcbiAgICAgICAgY29uc3QgZW50cmllcyA9IEFycmF5LmZyb20odGhpcy5wbGFjZWhvbGRlcnMuZW50cmllcygpKTtcclxuICAgICAgICBmb3IgKGNvbnN0IFtwbGFjZWhvbGRlciwgb3JpZ2luYWxdIG9mIGVudHJpZXMpIHtcclxuICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LnNwbGl0KHBsYWNlaG9sZGVyKS5qb2luKG9yaWdpbmFsKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8g5rOo5oSP77ya5LiN5YaN6Ieq5Yqo5riF56m6IHBsYWNlaG9sZGVyc++8jOS7peS+v+aUr+aMgeWkmuasoSByZXN0b3JlIOiwg+eUqFxyXG4gICAgICAgIC8vIOiwg+eUqOiAheW6lOWcqOWkhOeQhuWujOaJgOacieWGheWuueWQjuaJi+WKqOiwg+eUqCByZXNldCgpXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgLyoqXHJcbiAgICAgKiDwn5SnIOS/ruWkjeWPjOWPjeaWnOadoOmXrumimFxyXG4gICAgICog5bCGICQuLi4kIOWSjCAkJC4uLiQkIOS4reeahOWPjOWPjeaWnOadoO+8iFxcXFxjb21tYW5k77yJ5L+u5aSN5Li65Y2V5Y+N5pac5p2g77yIXFxjb21tYW5k77yJXHJcbiAgICAgKiBcclxuICAgICAqIOi/meaYr+WkhOeQhiBKU09OIOW6j+WIl+WMluaIluWtl+espuS4sui9rOS5ieWvvOiHtOeahOWPjeaWnOadoOe/u+WAjemXrumimOOAglxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0gY29udGVudCDlj6/og73ljIXlkKvlj4zlj43mlpzmnaDnmoTlhoXlrrlcclxuICAgICAqIEByZXR1cm5zIOS/ruWkjeWQjueahOWGheWuuVxyXG4gICAgICovXHJcbiAgICBmaXhEb3VibGVCYWNrc2xhc2goY29udGVudDogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgICAgICAvLyDkv67lpI0gJCQuLi4kJCDkuK3nmoTlj4zlj43mlpzmnaBcclxuICAgICAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlKC9cXCRcXCQoW1xcc1xcU10qPylcXCRcXCQvZywgKG1hdGNoLCBpbm5lcikgPT4ge1xyXG4gICAgICAgICAgICAvLyDlsIYgXFxcXHgg5pu/5o2i5Li6IFxceO+8iOS9huS/neeVmeecn+ato+eahOaNouihjOespiBcXFxc77yJXHJcbiAgICAgICAgICAgIC8vIExhVGVYIOWRveS7pOagvOW8j++8mlxcY29tbWFuZE5hbWXvvIjlj43mlpzmnaDlkI7ot5/lrZfmr43vvIlcclxuICAgICAgICAgICAgLy8g5Y+M5Y+N5pac5p2g6Zeu6aKY77yaXFxcXGNvbW1hbmROYW1l77yI5Lik5Liq5Y+N5pac5p2g5ZCO6Lef5a2X5q+N77yJXHJcbiAgICAgICAgICAgIGNvbnN0IGZpeGVkID0gaW5uZXIucmVwbGFjZSgvXFxcXFxcXFwoW2EtekEtWl0pL2csICdcXFxcJDEnKTtcclxuICAgICAgICAgICAgcmV0dXJuIGAkJCR7Zml4ZWR9JCRgO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIOS/ruWkjSAkLi4uJCDkuK3nmoTlj4zlj43mlpzmnaDvvIjpgb/lhY3ljLnphY0gJCTvvIlcclxuICAgICAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlKC8oPzwhXFwkKVxcJCg/IVxcJCkoW1xcc1xcU10qPylcXCQvZywgKG1hdGNoLCBpbm5lcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBmaXhlZCA9IGlubmVyLnJlcGxhY2UoL1xcXFxcXFxcKFthLXpBLVpdKS9nLCAnXFxcXCQxJyk7XHJcbiAgICAgICAgICAgIHJldHVybiBgJCR7Zml4ZWR9JGA7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8qKlxyXG4gICAgICog6L+Y5Y6f5bm25L+u5aSNXHJcbiAgICAgKiDlhYjov5jljp/ljaDkvY3nrKbvvIzlho3kv67lpI3lj6/og73lrZjlnKjnmoTlj4zlj43mlpzmnaDpl67pophcclxuICAgICAqIFxyXG4gICAgICogQHBhcmFtIGNvbnRlbnQg5YyF5ZCr5Y2g5L2N56ym55qE5YaF5a65XHJcbiAgICAgKiBAcmV0dXJucyDov5jljp/lubbkv67lpI3lkI7nmoTlhoXlrrlcclxuICAgICAqL1xyXG4gICAgcmVzdG9yZUFuZEZpeChjb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzLnJlc3RvcmUoY29udGVudCk7XHJcbiAgICAgICAgcmVzdWx0ID0gdGhpcy5maXhEb3VibGVCYWNrc2xhc2gocmVzdWx0KTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvKipcclxuICAgICAqIOaJuemHj+i/mOWOn+WkmuS4quWtl+autVxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0gb2JqIOWMheWQq+mcgOimgei/mOWOn+Wtl+auteeahOWvueixoVxyXG4gICAgICogQHBhcmFtIGZpZWxkcyDpnIDopoHov5jljp/nmoTlrZfmrrXlkI3mlbDnu4RcclxuICAgICAqIEByZXR1cm5zIOi/mOWOn+WQjueahOaWsOWvueixoe+8iOS4jeS/ruaUueWOn+Wvueixoe+8iVxyXG4gICAgICovXHJcbiAgICByZXN0b3JlRmllbGRzPFQgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBhbnk+PihvYmo6IFQsIGZpZWxkczogKGtleW9mIFQpW10pOiBUIHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSB7IC4uLm9iaiB9O1xyXG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0W2ZpZWxkXSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdFtmaWVsZF0gPSB0aGlzLnJlc3RvcmUocmVzdWx0W2ZpZWxkXSBhcyBhbnkpIGFzIGFueTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvKipcclxuICAgICAqIOaJuemHj+i/mOWOn+W5tuS/ruWkjeWkmuS4quWtl+autVxyXG4gICAgICogXHJcbiAgICAgKiBAcGFyYW0gb2JqIOWMheWQq+mcgOimgei/mOWOn+Wtl+auteeahOWvueixoVxyXG4gICAgICogQHBhcmFtIGZpZWxkcyDpnIDopoHov5jljp/nmoTlrZfmrrXlkI3mlbDnu4RcclxuICAgICAqIEByZXR1cm5zIOi/mOWOn+W5tuS/ruWkjeWQjueahOaWsOWvueixoe+8iOS4jeS/ruaUueWOn+Wvueixoe+8iVxyXG4gICAgICovXHJcbiAgICByZXN0b3JlQW5kRml4RmllbGRzPFQgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBhbnk+PihvYmo6IFQsIGZpZWxkczogKGtleW9mIFQpW10pOiBUIHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSB7IC4uLm9iaiB9O1xyXG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgZmllbGRzKSB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcmVzdWx0W2ZpZWxkXSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdFtmaWVsZF0gPSB0aGlzLnJlc3RvcmVBbmRGaXgocmVzdWx0W2ZpZWxkXSBhcyBhbnkpIGFzIGFueTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvKipcclxuICAgICAqIOmHjee9ruWGhemDqOeKtuaAgVxyXG4gICAgICog55So5LqO5Zyo5aSE55CG5aSa5LiqIEpTT04g5a+56LGh5pe25riF55CG54q25oCBXHJcbiAgICAgKi9cclxuICAgIHJlc2V0KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucGxhY2Vob2xkZXJzLmNsZWFyKCk7XHJcbiAgICAgICAgdGhpcy5jb3VudGVyID0gMDtcclxuICAgIH1cclxufSJdfQ==