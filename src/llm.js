"use strict";
/**
 * 🧠 LLM 大语言模型模块
 * 处理 AI 章节分析和思维导图生成
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBatchSummary = getBatchSummary;
exports.getGlobalCorrectionSummary = getGlobalCorrectionSummary;
exports.generateMindmapContent = generateMindmapContent;
exports.rewriteSelection = rewriteSelection;
exports.generateTaskReport = generateTaskReport;
const http_direct_1 = require("./http-direct");
const config_1 = require("./config");
const utils_1 = require("./utils");
const latex_protect_1 = require("./latex-protect");
/**
 * 🛡️ 修复 JSON 字符串中的非法反斜杠转义 (全面保护版)
 *
 * ## 问题背景
 * JSON 中合法的转义符有：\", \\, \/, \b, \f, \n, \r, \t, \uXXXX
 *
 * 这导致 LaTeX 命令会被错误处理：
 * - \b 开头: \beta, \bar, \big, \begin, \bigg, \bm, \boxed, \bf
 * - \f 开头: \frac, \forall, \flat, \footnote
 * - \n 开头: \nabla, \neq, \nu, \not, \norm, \neg, \natural
 * - \r 开头: \rho, \right, \rangle, \sqrt, \rule
 * - \t 开头: \theta, \tau, \times, \to, \tilde, \text, \top, \tan
 *
 * ## 解决方案
 * 采用"精准打击 + 通用扫描"两阶段策略：
 * 1. 阶段一：保护所有以 JSON 转义符开头的 LaTeX 命令
 * 2. 阶段二：逐字符扫描处理其他非法转义
 *
 * @param content 待修复的 JSON 字符串
 * @returns 修复后的字符串
 */
function fixJsonBackslashes(content) {
    // 阶段一：【精准打击】保护所有以 JSON 转义符开头的 LaTeX 命令
    //
    // 原理：LaTeX 命令格式为 \commandName（反斜杠后跟字母）
    // 而 JSON 转义符 \b, \f, \n, \r, \t 后面不跟字母
    // 因此，当检测到 \[bfnrt] 后跟字母时，说明这是 LaTeX 命令，需要保护
    //
    // 正则说明：
    // (?<!\\) - 前面不是反斜杠（避免重复转义已保护的命令如 \\frac）
    // \\ - 匹配单个反斜杠
    // ([bfnrt]) - 捕获 JSON 转义符首字母
    // (?=[a-zA-Z]) - 正向预查，确保后面是字母（LaTeX 命令特征）
    //
    // 覆盖的考研数学常用命令示例：
    // \b: \beta, \bar, \big, \begin, \bm, \boxed, \bf, \bigg, \bigl, \bigr
    // \f: \frac, \forall, \flat, \footnote, \fallingdotseq
    // \n: \nabla, \neq, \nu, \not, \norm, \neg, \natural, \nearrow
    // \r: \rho, \right, \rangle, \sqrt (注意: \sqrt 以 \s 开头，阶段二处理)
    // \t: \theta, \tau, \times, \to, \tilde, \text, \top, \tan, \therefore
    let result = content.replace(/(?<!\\)\\([bfnrt])(?=[a-zA-Z])/g, '\\\\$1');
    // 阶段二：【通用扫描】逐字符扫描，处理所有剩余的非法转义
    //
    // 这个阶段处理不以 JSON 转义符开头的 LaTeX 命令，如：
    // \alpha, \sum, \int, \leq, \infty, \partial, \omega 等
    //
    // 同时正确保留合法的 JSON 转义符：\n, \t, \r, \b, \f（当它们后面不跟字母时）
    let fixed = '';
    let i = 0;
    while (i < result.length) {
        if (result[i] === '\\') {
            const next = result[i + 1];
            // 合法的 JSON 转义序列
            // 注意：这里 \b, \f, \n, \r, \t 只有在不跟字母时才是真正的 JSON 转义符
            // 跟字母的情况已在阶段一处理，这里只会遇到真正的 JSON 转义符
            if (next === '"' || next === '\\' || next === '/' ||
                next === 'b' || next === 'f' || next === 'n' ||
                next === 'r' || next === 't') {
                fixed += result[i] + next;
                i += 2;
            }
            else if (next === '\\') {
                // 特殊处理连续反斜杠 \\：两个反斜杠一起跳过，不双写
                // 这是因为阶段一已经处理过 LaTeX 命令，双反斜杠表示保护后的命令前缀
                fixed += result[i];
                i += 2;
            }
            else if (next === 'u') {
                // 检查 \uXXXX 格式
                const hexPart = result.slice(i + 2, i + 6);
                if (/^[0-9a-fA-F]{4}$/.test(hexPart)) {
                    fixed += result.slice(i, i + 6);
                    i += 6;
                }
                else {
                    // 非法 \u 序列，双写反斜杠
                    fixed += '\\\\';
                    i += 1;
                }
            }
            else if (next === undefined) {
                // 字符串末尾的孤立反斜杠
                fixed += '\\\\';
                i += 1;
            }
            else {
                // 所有其他情况（LaTeX 命令如 \alpha, \sum, \int 等）
                // 双写反斜杠进行保护
                fixed += '\\\\';
                i += 1;
            }
        }
        else {
            fixed += result[i];
            i += 1;
        }
    }
    return fixed;
}
/**
 * 从可能包含额外内容的响应中提取 JSON 数组
 * @param content AI 响应内容
 * @returns 提取的 JSON 字符串，或 null
 */
function extractJsonArray(content) {
    // 尝试找到 JSON 数组的起始和结束位置
    const start = content.indexOf('[');
    if (start === -1)
        return null;
    let depth = 0;
    let end = -1;
    for (let i = start; i < content.length; i++) {
        if (content[i] === '[')
            depth++;
        else if (content[i] === ']') {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    if (end === -1)
        return null;
    return content.slice(start, end + 1);
}
/**
 * 清洗畸形 JSON 字符串，修复常见 AI 输出问题
 * - 中文全角引号「」"" → 安全替换（不破坏 JSON 结构）
 * - 裸键名（无引号）→ 自动加引号
 *
 * 【关键修复】之前全角引号直接替换成半角 "，当全角引号出现在 JSON
 * 字符串值内部时（如 summary: "...围绕"根号复杂"来设置..."），
 * 会被 JSON 解析器误认为字符串提前结束，导致解析失败。
 * 现在替换为全角引号的 Unicode 转义形式，不干扰 JSON 语法。
 */
function sanitizeJsonString(raw) {
    let s = raw;
    // 1. 全角引号替换为 Unicode 转义（不干扰 JSON 语法）
    //    " → \u201c, " → \u201d, 「 → \u300c, 」 → \u300d
    //    这样 JSON.parse 后还原为全角引号字符，不影响 JSON 结构
    s = s.replace(/\u201c/g, '\\u201c')
        .replace(/\u201d/g, '\\u201d')
        .replace(/\u300c/g, '\\u300c')
        .replace(/\u300d/g, '\\u300d');
    // 2. 裸键名加引号：匹配 {, 或 , 后跟标识符再跟 :
    //   正则说明：
    //   ([{,]\s*)  - 匹配 { 或 , 及其后的空白
    //   ([a-zA-Z_][a-zA-Z0-9_]*) - 匹配键名
    //   (\s*:)     - 匹配冒号（允许前导空格）
    //  注意：不会破坏引号内的值（如时间戳 "10:01" 中的冒号在引号内）
    s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
    return s;
}
/**
 * 尝试解析被截断的 JSON
 * 当 LLM 输出被 max_tokens 限制截断时，JSON 会在字符串值中间断裂
 * 此函数尝试通过补全引号和闭合括号来抢救已解析的 segments
 *
 * 策略：
 * 1. 找到最后一个完整的对象（通过寻找最后一个 "summary" 或 "timestamp" 键的完整值）
 * 2. 从最后一个完整对象之后截断
 * 3. 补全闭合括号 } ] 和顶层 } 来闭合 JSON
 */
function tryParseTruncatedJson(raw) {
    try {
        let s = raw.trim();
        // 确保从第一个 { 开始
        const start = s.indexOf('{');
        if (start === -1)
            return null;
        s = s.substring(start);
        // 找到最后一个完整的 segment 对象的结尾
        // 策略：从后向前找 "summary": "..." 模式，如果找到一个被引号包裹的值
        // 后面可能跟 } 或 , 表示对象结束
        // 找到最后一个完整的 } （segment 对象的闭合）
        let lastCompleteObjEnd = -1;
        let braceDepth = 0;
        let inString = false;
        let escape = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\' && inString) {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = !inString;
                continue;
            }
            if (inString)
                continue;
            if (ch === '{')
                braceDepth++;
            else if (ch === '}') {
                braceDepth--;
                // braceDepth == 1 表示这是 segments 数组里的一个对象闭合
                if (braceDepth === 1) {
                    lastCompleteObjEnd = i;
                }
            }
        }
        if (lastCompleteObjEnd === -1) {
            // 可能连第一个对象都没写完，尝试修复单个对象
            // 尝试在字符串值中间截断的情况：补全引号和括号
            // 先用 sanitize 处理
            const sanitized = sanitizeJsonString(s);
            // 尝试找到最后一个完整的键值对
            // 模式: "key": "value" 其中 value 可能被截断
            // 策略：找到最后一个 "summary": " 的位置，然后从那里往后找
            // 如果后面没有闭合的 "，说明 summary 的值被截断了
            const summaryMatch = sanitized.match(/"summary"\s*:\s*"/g);
            if (!summaryMatch)
                return null;
            // 找最后一个 summary 键的位置
            let lastSummaryIdx = -1;
            let searchIdx = 0;
            while (true) {
                const idx = sanitized.indexOf('"summary"', searchIdx);
                if (idx === -1)
                    break;
                lastSummaryIdx = idx;
                searchIdx = idx + 1;
            }
            if (lastSummaryIdx === -1)
                return null;
            // 从 summary 键开始往后找引号
            const afterSummary = sanitized.substring(lastSummaryIdx);
            const colonIdx = afterSummary.indexOf(':');
            if (colonIdx === -1)
                return null;
            const valueStart = colonIdx + 1;
            // 找到 value 的开始引号
            let valueQuoteStart = -1;
            for (let i = valueStart; i < afterSummary.length; i++) {
                if (afterSummary[i] === '"') {
                    valueQuoteStart = i;
                    break;
                }
                if (afterSummary[i] !== ' ' && afterSummary[i] !== '\t' && afterSummary[i] !== '\n' && afterSummary[i] !== '\r') {
                    // 不是空白也不是引号，可能不是字符串值
                    break;
                }
            }
            if (valueQuoteStart === -1)
                return null;
            // 从 value 开始引号往后，找是否有闭合引号
            const valueContent = afterSummary.substring(valueQuoteStart + 1);
            // 查找未转义的闭合引号
            let closingQuoteIdx = -1;
            let esc = false;
            for (let i = 0; i < valueContent.length; i++) {
                if (esc) {
                    esc = false;
                    continue;
                }
                if (valueContent[i] === '\\') {
                    esc = true;
                    continue;
                }
                if (valueContent[i] === '"') {
                    closingQuoteIdx = i;
                    break;
                }
            }
            if (closingQuoteIdx !== -1) {
                // summary 值有闭合引号，但整体 JSON 可能缺少后续内容
                // 截取到这里然后补全
                const cutPos = lastSummaryIdx + valueQuoteStart + 1 + closingQuoteIdx + 1;
                s = sanitized.substring(0, cutPos);
            }
            else {
                // summary 值被截断：补一个闭合引号
                const cutPos = lastSummaryIdx + valueQuoteStart + 1;
                s = sanitized.substring(0, cutPos) + '"'; // 补全闭合引号
            }
            // 补全括号
            // 统计需要的闭合括号
            let openBraces = 0, openBrackets = 0;
            let inStr = false, esc2 = false;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (esc2) {
                    esc2 = false;
                    continue;
                }
                if (ch === '\\' && inStr) {
                    esc2 = true;
                    continue;
                }
                if (ch === '"') {
                    inStr = !inStr;
                    continue;
                }
                if (inStr)
                    continue;
                if (ch === '{')
                    openBraces++;
                else if (ch === '}')
                    openBraces--;
                else if (ch === '[')
                    openBrackets++;
                else if (ch === ']')
                    openBrackets--;
            }
            // 补全缺失的闭合括号
            let closing = '';
            for (let i = 0; i < openBrackets; i++)
                closing += ']';
            for (let i = 0; i < openBraces; i++)
                closing += '}';
            s += closing;
            // 确保末尾没有多余的逗号
            s = s.replace(/,\s*([}\]])/g, '$1');
            try {
                const result = JSON.parse(s);
                if (result && result.segments && Array.isArray(result.segments)) {
                    return result.segments;
                }
            }
            catch (_a) {
                return null;
            }
            return null;
        }
        // 有完整的对象，从最后一个完整对象之后截断
        s = s.substring(0, lastCompleteObjEnd + 1);
        // 补全闭合括号
        let openBraces = 0, openBrackets = 0;
        let inStr = false, esc3 = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (esc3) {
                esc3 = false;
                continue;
            }
            if (ch === '\\' && inStr) {
                esc3 = true;
                continue;
            }
            if (ch === '"') {
                inStr = !inStr;
                continue;
            }
            if (inStr)
                continue;
            if (ch === '{')
                openBraces++;
            else if (ch === '}')
                openBraces--;
            else if (ch === '[')
                openBrackets++;
            else if (ch === ']')
                openBrackets--;
        }
        let closing = '';
        for (let i = 0; i < openBrackets; i++)
            closing += ']';
        for (let i = 0; i < openBraces; i++)
            closing += '}';
        s += closing;
        // 清理多余逗号
        s = s.replace(/,\s*([}\]])/g, '$1');
        try {
            const result = JSON.parse(s);
            if (result && result.segments && Array.isArray(result.segments)) {
                return result.segments;
            }
            if (Array.isArray(result)) {
                return result;
            }
        }
        catch (_b) {
            return null;
        }
        return null;
    }
    catch (_c) {
        return null;
    }
}
/**
 * 📝 分隔符格式解析器
 *
 * 解析 LLM 使用 ===SEGMENT=== / ===END=== / ===LEFTOVER=== 标记输出的内容。
 * 这种格式不使用 JSON，因此不存在引号转义、反斜杠转义等问题。
 *
 * 格式示例：
 * ===SEGMENT===
 * timestamp: 05:30
 * title: 极限的定义
 * summary: 详细记录...
 * ===END===
 * ===SEGMENT===
 * timestamp: 12:00
 * title: 例题1
 * summary: 详细记录...
 * ===END===
 * ===LEFTOVER===
 * 被截断的原始文本
 * ===END===
 *
 * @param content LLM 原始响应（经过 LaTeX 保护后的内容）
 * @returns 解析出的 segments 数组、leftover 字符串和 metaData
 */
/**
 * 解析 ===EX===timestamp|topic|method===END=== 格式的例题数据
 */
function parseExamples(raw) {
    const examples = [];
    // 匹配 ===EX=== 内容 ===END=== 或 ===EX=== 内容（未闭合）
    // 注意：不使用 s flag (dotAll)，改用 [\s\S] 代替
    const exRegex = /={3,}\s*EX\s*={3,}\s*([\s\S]*?)(?=={3,}\s*END\s*={3,}|$)/gi;
    let match;
    while ((match = exRegex.exec(raw)) !== null) {
        const content = match[1].trim();
        const parts = content.split('|').map(p => p.trim());
        if (parts.length >= 3) {
            examples.push({
                timestamp: parts[0],
                topic: parts[1],
                method: parts.slice(2).join('|') // method 可能包含 |
            });
        }
    }
    return examples;
}
function parseSegmentFormat(content) {
    const segments = [];
    let leftover = "";
    let metaData = null;
    // 按行分割，容忍 \r\n 和 \n
    const lines = content.split(/\r?\n/);
    let currentState = 'none';
    let currentFields = {};
    let currentMultiLineField = null; // 当前正在收集的多行字段名
    let currentMultiLineValue = []; // 多行字段的累积值
    let currentMetaFields = {};
    // key_points 临时存储：在 segment 状态下收集 - 开头的要点行
    let currentKeyPoints = [];
    const flushMultiLine = () => {
        // 如果当前多行字段是 key_points，特殊处理为数组
        if (currentMultiLineField === 'key_points') {
            // key_points 已经在逐行收集到 currentKeyPoints 中了，这里不做 join
            return;
        }
        if (currentMultiLineField && currentMultiLineValue.length > 0) {
            currentFields[currentMultiLineField] = currentMultiLineValue.join('\n').trim();
        }
        currentMultiLineField = null;
        currentMultiLineValue = [];
    };
    const flushSegment = () => {
        flushMultiLine();
        // 如果有收集到的 key_points，设置到字段中
        if (currentKeyPoints.length > 0) {
            currentFields.key_points = [...currentKeyPoints];
        }
        if (currentState === 'segment' && currentFields.timestamp && currentFields.title) {
            segments.push({
                timestamp: currentFields.timestamp,
                title: currentFields.title,
                summary: currentFields.summary || "",
                key_points: currentFields.key_points
            });
        }
        currentFields = {};
        currentKeyPoints = [];
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        // 检测 ===SEGMENT=== 开始标记
        if (/^={3,}\s*SEGMENT\s*={3,}/i.test(trimmedLine)) {
            flushSegment();
            currentState = 'segment';
            currentFields = {};
            currentMultiLineField = null;
            currentMultiLineValue = [];
            continue;
        }
        // 检测 ===LEFTOVER=== 开始标记
        if (/^={3,}\s*LEFTOVER\s*={3,}/i.test(trimmedLine)) {
            flushSegment();
            currentState = 'leftover';
            currentMultiLineField = 'leftover';
            currentMultiLineValue = [];
            continue;
        }
        // 检测 ===META=== 开始标记
        if (/^={3,}\s*META\s*={3,}/i.test(trimmedLine)) {
            flushSegment();
            currentState = 'meta';
            currentMetaFields = {};
            currentMultiLineField = null;
            currentMultiLineValue = [];
            continue;
        }
        // 检测 ===END=== 结束标记
        if (/^={3,}\s*END\s*={3,}/i.test(trimmedLine)) {
            if (currentState === 'segment') {
                flushSegment();
            }
            else if (currentState === 'leftover') {
                flushMultiLine();
                leftover = currentMultiLineValue.join('\n').trim();
            }
            else if (currentState === 'meta') {
                flushMultiLine();
                // 构建 metaData
                metaData = {
                    exam_focus: currentMetaFields.exam_focus || "",
                    emphasis: (() => {
                        const raw = currentMetaFields.emphasis || "";
                        return raw.split('|').map(e => e.trim()).filter(e => e.length > 0);
                    })(),
                    examples: parseExamples(currentMetaFields.examples || "")
                };
                console.log(`📝 [分隔符解析] META 块解析完成: exam_focus=${metaData.exam_focus.length}字符, emphasis=${metaData.emphasis.length}个, examples=${metaData.examples.length}个`);
            }
            currentState = 'none';
            currentFields = {};
            currentMultiLineField = null;
            currentMultiLineValue = [];
            continue;
        }
        // 在 segment 状态下，解析字段
        if (currentState === 'segment') {
            // 检测 "key_points:" 字段行（特殊处理：后面可能没有值，直接开始收集 - 行）
            if (/^key_points\s*:\s*$/i.test(line.trim())) {
                flushMultiLine();
                currentMultiLineField = 'key_points';
                currentMultiLineValue = [];
                continue;
            }
            // 检测 "key_points: 某值" 格式（同一行有值的情况）
            const kpMatch = line.match(/^key_points\s*:\s*(.+)$/i);
            if (kpMatch) {
                flushMultiLine();
                currentMultiLineField = 'key_points';
                // 如果值以 - 开头，说明是第一个要点
                if (kpMatch[1].trim().startsWith('-')) {
                    const point = kpMatch[1].trim().replace(/^[-*+]\s*/, '');
                    if (point)
                        currentKeyPoints.push(point);
                }
                else {
                    // 单行 key_points 值
                    currentKeyPoints.push(kpMatch[1].trim());
                }
                continue;
            }
            // 检测以 - 开头的要点行（在 key_points 字段上下文中）
            if (currentMultiLineField === 'key_points') {
                const pointMatch = line.match(/^\s*[-*+]\s+(.+)$/);
                if (pointMatch) {
                    // 这是一个 key_points 要点行
                    currentKeyPoints.push(pointMatch[1].trim());
                    continue;
                }
                // 不是 - 开头但也不是字段行 → 可能是 key_points 要点的续行
                const fieldCheck = line.match(/^(\w+)\s*:\s*(.*)$/);
                if (!fieldCheck && line.trim()) {
                    // 续行：追加到最后一个 key_point
                    if (currentKeyPoints.length > 0) {
                        currentKeyPoints[currentKeyPoints.length - 1] += '\n' + line.trim();
                    }
                    continue;
                }
                // 如果是新的字段行，正常走下面的逻辑
            }
            // 检测 "key: value" 格式的字段行
            const fieldMatch = line.match(/^(\w+)\s*:\s*(.*)$/);
            if (fieldMatch) {
                // 先保存之前的字段
                flushMultiLine();
                const key = fieldMatch[1].toLowerCase();
                const value = fieldMatch[2];
                currentFields[key] = value;
                // 设置当前多行字段，后续非字段行会追加到此字段
                currentMultiLineField = key;
                currentMultiLineValue = [value];
            }
            else if (currentMultiLineField && currentMultiLineField !== 'key_points') {
                // 这是当前字段的续行（多行值）
                currentMultiLineValue.push(line);
            }
            continue;
        }
        // 在 meta 状态下，解析 exam_focus、emphasis、examples 字段
        if (currentState === 'meta') {
            // 检测 ===EX=== 例题子标记
            if (/^={3,}\s*EX\s*={3,}/i.test(trimmedLine)) {
                flushMultiLine();
                currentMultiLineField = 'examples';
                currentMultiLineValue = [trimmedLine];
                continue;
            }
            // 检测 "key: value" 格式的字段行
            const fieldMatch = line.match(/^(\w+)\s*:\s*(.*)$/);
            if (fieldMatch) {
                flushMultiLine();
                const key = fieldMatch[1].toLowerCase();
                const value = fieldMatch[2];
                currentMetaFields[key] = value;
                currentMultiLineField = key;
                currentMultiLineValue = [value];
            }
            else if (currentMultiLineField) {
                // 续行
                currentMultiLineValue.push(line);
                // 同步更新到 currentMetaFields
                currentMetaFields[currentMultiLineField] = currentMultiLineValue.join('\n').trim();
            }
            continue;
        }
        // 在 leftover 状态下，所有行都是 leftover 内容
        if (currentState === 'leftover') {
            currentMultiLineValue.push(line);
            continue;
        }
    }
    // 处理未闭合的最后一个块（LLM 输出被截断时的容错）
    if (currentState === 'segment') {
        // 最后一个 segment 可能没有 ===END===，尝试保存
        flushMultiLine();
        if (currentKeyPoints.length > 0) {
            currentFields.key_points = [...currentKeyPoints];
        }
        if (currentFields.timestamp && currentFields.title) {
            segments.push({
                timestamp: currentFields.timestamp,
                title: currentFields.title,
                summary: currentFields.summary || "",
                key_points: currentFields.key_points
            });
            console.log(`📝 [分隔符解析] 最后一个 segment 未闭合，已抢救保存`);
        }
    }
    else if (currentState === 'leftover') {
        leftover = currentMultiLineValue.join('\n').trim();
        console.log(`📝 [分隔符解析] leftover 块未闭合，已抢救保存 (长度: ${leftover.length})`);
    }
    else if (currentState === 'meta') {
        flushMultiLine();
        metaData = {
            exam_focus: currentMetaFields.exam_focus || "",
            emphasis: (() => {
                const raw = currentMetaFields.emphasis || "";
                return raw.split('|').map(e => e.trim()).filter(e => e.length > 0);
            })(),
            examples: parseExamples(currentMetaFields.examples || "")
        };
        console.log(`📝 [分隔符解析] META 块未闭合，已抢救保存`);
    }
    return { segments, leftover, metaData };
}
/**
 * 🔁 OpenCode V4 请求带自动重试
 * 仅在真正网络错误时重试（ERR_CONNECTION_RESET / CLOSED / REFUSED / ECONNRESET 等）
 * 超时一律不重试，向上抛错
 * 最多重试 2 次（共 3 次尝试），reasoning_effort 始终保持原始值
 */
function requestOpenCodeV4WithRetry(provider_1, body_1, fallbackApiKey_1) {
    return __awaiter(this, arguments, void 0, function* (provider, body, fallbackApiKey, timeoutMs = 1800000) {
        var _a, _b, _c;
        const maxRetries = 2;
        const delays = [2000, 5000]; // 指数退避：2 秒, 5 秒
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = yield (0, http_direct_1.requestDirect)({
                    url: provider.BASE_URL,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${provider.API_KEY || fallbackApiKey || ''}`
                    },
                    body: JSON.stringify(body),
                    timeoutMs
                });
                // 🔍 调试：打印 HTTP 状态码和原始响应文本（截断），帮助定位空响应问题
                console.log(`📊 [LLM] HTTP ${response.status} | response.text 长度: ${response.text.length} | 前500字符: ${response.text.slice(0, 500)}`);
                // 检查 HTTP 状态码，非 200 直接报错
                if (response.status < 200 || response.status >= 300) {
                    console.error(`❌ [LLM] HTTP ${response.status} 错误，原始响应: ${response.text.slice(0, 1000)}`);
                    throw new Error(`HTTP ${response.status}: ${response.text.slice(0, 200)}`);
                }
                // 检查 response.json 是否有效
                if (!response.json || typeof response.json !== 'object') {
                    console.error(`❌ [LLM] 响应不是有效 JSON，原始文本: ${response.text.slice(0, 500)}`);
                    throw new Error(`响应不是有效 JSON: ${response.text.slice(0, 200)}`);
                }
                const message = (_c = (_b = (_a = response.json.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) !== null && _c !== void 0 ? _c : {};
                const rawContent = typeof message.content === 'string' ? message.content : '';
                const rawReasoning = (typeof message.reasoning_content === 'string' ? message.reasoning_content : '') ||
                    (typeof message.reasoning === 'string' ? message.reasoning : '');
                // content 有值就直接用；否则回退 reasoning_content / reasoning
                if (rawContent && rawContent.trim() !== '') {
                    return rawContent;
                }
                if (rawReasoning && rawReasoning.trim() !== '') {
                    console.warn(`⚠️ content 字段为空，回退使用 reasoning 字段（长度: ${rawReasoning.length}）`);
                    return rawReasoning;
                }
                // 两个字段都为空，返回空字符串（上层会判定为空数据）
                console.warn('⚠️ response content 和 reasoning_content 均为空，原始 message:', JSON.stringify(message).slice(0, 500));
                console.warn('⚠️ 完整 response.json 结构:', JSON.stringify(response.json).slice(0, 1000));
                return '';
            }
            catch (e) {
                const errMsg = e.message || String(e);
                // 仅识别真正的网络断连类错误
                const isNetworkError = errMsg.includes('ERR_CONNECTION_RESET') ||
                    errMsg.includes('ERR_CONNECTION_CLOSED') ||
                    errMsg.includes('ERR_CONNECTION_REFUSED') ||
                    errMsg.includes('ERR_NETWORK_CHANGED') ||
                    errMsg.includes('Failed to fetch') ||
                    errMsg.includes('net::ERR_') ||
                    errMsg.includes('ECONNRESET');
                if (isNetworkError && attempt < maxRetries) {
                    const retryCount = attempt + 1;
                    console.log(`🔁 [OpenCode-V4] 网络异常重试 (第 ${retryCount}/${maxRetries} 次)，错误: ${errMsg}`);
                    yield new Promise(resolve => setTimeout(resolve, delays[attempt]));
                    continue;
                }
                // 区分最终失败类型
                if (isNetworkError) {
                    console.error(`❌ [OpenCode-V4] 网络异常重试 ${maxRetries} 次仍失败: ${errMsg}`);
                }
                else {
                    console.error(`❌ [OpenCode-V4] 请求失败: ${errMsg}`);
                }
                throw e;
            }
        }
        // 不会到达这里
        throw new Error('requestOpenCodeV4WithRetry: 重试耗尽');
    });
}
/**
 * 调用 LLM API 获取批次摘要
 * 使用 providerIndex 指定的 LLM_PROVIDERS 配置（含 EXTRA_BODY）
 * @param currentRaw 当前批次的原文
 * @param history 历史摘要（用于上下文）
 * @param batchStartTime 批次起始时间（秒）
 * @param providerIndex 指定使用的 provider 索引（保留参数兼容性，忽略，始终使用 idx=0）
 * @param trySiliconFlow 已弃用（保留参数兼容性）
 * @returns 包含章节摘要数组和未总结文本的对象
 */
function getBatchSummary(currentRaw, history, batchStartTime, providerIndex, trySiliconFlow) {
    return __awaiter(this, void 0, void 0, function* () {
        // 使用传入的 providerIndex（缺省为 0），不再硬编码 OpenCode
        const idx = (typeof providerIndex === 'number' && providerIndex >= 0 && providerIndex < config_1.LLM_PROVIDERS.length) ? providerIndex : 0;
        const selectedProvider = config_1.LLM_PROVIDERS[idx];
        console.log(`🔑 使用 ${selectedProvider.NAME} (model=${selectedProvider.MODEL})`);
        return yield getBatchSummaryInternal(currentRaw, history, batchStartTime, idx, false);
    });
}
/**
 * 内部函数：使用指定 provider 索引调用 API
 */
function getBatchSummaryInternal(currentRaw_1, history_1, batchStartTime_1, providerIndex_1) {
    return __awaiter(this, arguments, void 0, function* (currentRaw, history, batchStartTime, providerIndex, fallbackToSecond = true) {
        const batchStartStr = (0, utils_1.formatTime)(batchStartTime);
        const prompt = `
目标：对转写文本进行**详细的知识提取与课堂原始记录**的整理，输出考研背诵级笔记。
输入：这是一段课堂录音转写的片段（从约 ${batchStartStr} 开始）。
输出：使用以下标记格式输出（不要输出 JSON，不要使用反引号或代码块）。

${history ? `前情提要参考：\n${history.slice(-2000)}\n---` : ""}

**核心要求（极为重要）：**
1. **角色转换**：你不再是一个只写几句宏观概括的"总结机器"，而是一位**详细、负责的听课笔记员**。输出的是看完就能直接去背诵和做题的高密度知识笔记。
2. **知识层面的详尽与留存**：整理出这段话里老师讲过的每一个具体知识点、每一道例题的题意、具体的推导过程、易错点坑点。不能遗漏任何专业知识信息。保留完整的定义、条件、适用范围；保留核心推导步骤链；保留所有公式定理。
3. **降噪流水账**：剔除"同学们看黑板"、"接下来我们讲"、"大家懂了吧"等毫无信息量的口语废话，把长篇大论用高密度的笔记体梳理出来。
4. **结构切分**：如果在该时段内转移了具体话题（如从"例题1"讲到了"例题2"，或进入了新的知识点推导），必须把它们切分成不同的 segments 记录块，时间戳要精确对应。
5. **处理截断**：**如果最后一部分内容被截断（例如话只讲了一半，或知识点未讲完），请不要勉强总结它。将其原封不动放在 LEFTOVER 标记中。**

输出格式（严格使用以下行首标记，每行一个字段，不要使用 JSON）：
===SEGMENT===
timestamp: MM:SS
title: 具体知识名 或 例题名
key_points:
- 要点1（完整的推导步骤、定义条件或结论，有可以拿去背诵的实质内容）
- 要点2
- 要点3（数量根据内容自然决定，不要干瘪的短句，也不要强行凑数）
===END===

（可以有多个 ===SEGMENT===...===END=== 块，每个块代表一个知识点）

===LEFTOVER===
这里放末尾被截断的原始转写片段（如果完整则留空）
===END===

**重要提示**：数学公式必须使用 LaTeX 语法，用行内 $...$ 包裹。例如：$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$、$\\int_0^\\infty e^{-x^2} dx$。

### 待提取课堂片段
${currentRaw} 
`;
        // 使用 LLM_PROVIDERS[0]（设置同步入口）；reasoning_effort / thinking 由 EXTRA_BODY 展开
        const provider = config_1.LLM_PROVIDERS[providerIndex];
        const providerName = provider.NAME;
        try {
            const body = Object.assign({ model: provider.MODEL, messages: [
                    { role: "system", content: "You are a professional lecture note-taker. Your task is to extract detailed knowledge points from classroom transcripts and organize them into structured notes. 输出要求：1. 每个知识点都要详细记录推导过程、定义条件、关键结论，不能遗漏任何专业知识信息；2. key_points 要有可以拿去背诵的实质内容，不要只写概括性描述；3. 数学公式使用 LaTeX 语法用 $...$ 包裹；4. 使用中文输出，专业术语可保留英文。不要输出 JSON，使用 ===SEGMENT=== 标记格式。" },
                    { role: "user", content: prompt }
                ], stream: false, temperature: 0.1, max_tokens: 65536 }, (provider.EXTRA_BODY || {}));
            // 🔁 使用带重试+降级的请求函数
            let content = yield requestOpenCodeV4WithRetry(provider, body, config_1.LLM_CONFIG.API_KEY);
            // 🔍 日志：记录 LLM 原始响应的关键特征，用于诊断
            console.log(`📝 [LLM诊断] 原始响应长度: ${content.length} 字符 | 前100字符: ${content.slice(0, 100)} | 后100字符: ${content.slice(-100)}`);
            // 去掉思考过程
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            // 🛡️ 使用 LaTeX 保护器处理内容
            const latexProtect = new latex_protect_1.LatexProtect();
            const protectedContent = latexProtect.protect(content);
            // 📝 使用分隔符格式解析（不再使用 JSON）
            const parseResult = parseSegmentFormat(protectedContent);
            let parsed = parseResult.segments;
            let leftover = parseResult.leftover;
            console.log(`📝 [LLM解析] 分隔符格式解析结果: ${parsed.length} 个 segments, leftover 长度: ${leftover.length}`);
            // 🛡️ 还原 LaTeX 公式中的占位符，并修复双反斜杠问题
            if (parsed.length > 0) {
                parsed = parsed.map(item => {
                    const restored = latexProtect.restoreAndFixFields(item, ['title', 'summary']);
                    // 还原 key_points 中的 LaTeX 占位符
                    if (restored.key_points && restored.key_points.length > 0) {
                        restored.key_points = restored.key_points.map(kp => latexProtect.restoreAndFix(kp));
                    }
                    return restored;
                });
                if (leftover) {
                    leftover = latexProtect.restoreAndFix(leftover);
                }
                latexProtect.reset();
            }
            // 🛡️ 严格检查 AI 返回数据是否为空
            if (!parsed || parsed.length === 0) {
                console.error(`❌ [${providerName}] AI 返回空数据 (parsed 为空)`);
                console.error(`❌ 原始响应内容（前500字符）: ${content.slice(0, 500)}`);
                console.error(`❌ 原始响应内容（后500字符）: ${content.slice(-500)}`);
                throw new Error(`AI 返回空数据`);
            }
            // 成功获取数据，返回结果
            console.log(`✅ [${providerName}] 批次分析成功，返回 ${parsed.length} 个章节`);
            return { chapters: parsed, leftover };
        }
        catch (e) {
            console.error(`API Error from ${providerName}:`, e);
            return { chapters: [], leftover: "" };
        }
    });
}
/**
 * 调用 LLM API 根据全局上下文对初步的章节总结进行修正
 * @param preliminarySummaries 初步的章节总结文本
 * @returns 修正后的所有章节总结
 */
function getGlobalCorrectionSummary(preliminarySummaries) {
    return __awaiter(this, void 0, void 0, function* () {
        const prompt = `
目标：基于所有分片的初步笔记，进行**全局结构微调**。不压缩信息，只做结构调整。
输入：由分块阶段生成的详细知识点笔记。
输出：微调后的最终知识结构（使用标记格式，不要输出 JSON）。

**核心要求（轻调微调，重点是结构调整，不压缩信息）：**
1. **信息保全第一**：输入中所有知识点、定义、公式、定理、推导过程、例题题意都必须在输出中保留。你可以重新组织语言和调整顺序，但不能丢弃知识内容。
2. **合并与拆分**：合并被时间切片硬性切断的同一知识点；拆分被揉在一起的不同知识点。只有在被时间切片硬性切断的同一句话或同一种解题过程才需要合并。如果内容已经是新题型、新知识点，务必切分成新的章节条目。
3. **调整标题和方向**：使标题更具体、更符合知识点实际内容。把控全局方向的统一性。
4. **梳理逻辑**：确保各知识点之间的逻辑顺序通顺，衔接自然。
5. **key_points 详实**：每个知识点的 key_points 要包含具体的推导步骤、定义条件、关键结论。不要只写概括性描述，要有可以拿去背诵的实质内容。
6. **保留公式定理**：所有数学公式必须使用 LaTeX 语法，用行内 $...$ 包裹。
7. **时间顺序**：按时间戳从小到大排列，保留原始时间戳。

输出格式（严格使用以下行首标记，每行一个字段，不要使用 JSON）：
===SEGMENT===
timestamp: MM:SS
title: 具体的知识点/例题标题
key_points:
- 要点1（详细的推导步骤、定义条件或结论）
- 要点2
- 要点3
===END===

（可以有多个 ===SEGMENT===...===END=== 块）

===META===
exam_focus: 用自然流畅的一段话概括本课核心内容，帮助快速回顾。涵盖老师讲过的所有主要知识点和考试重点。
emphasis: 老师口头强调的注意点1 | 注意点2 | 注意点3（用 | 分隔多个注意点）
examples: ===EX===timestamp|例题标题|解题方法===END=== ===EX===timestamp|例题标题|解题方法===END===
===END===

### 分块笔记列表（请进行结构微调，保留所有知识细节）
${preliminarySummaries}
`;
        // 使用 LLM_GLOBAL_CONFIG（全局校验专用配置）；reasoning_effort / thinking 由 EXTRA_BODY 展开
        const provider = {
            NAME: 'Global LLM',
            API_KEY: config_1.LLM_GLOBAL_CONFIG.API_KEY,
            BASE_URL: config_1.LLM_GLOBAL_CONFIG.BASE_URL,
            MODEL: config_1.LLM_GLOBAL_CONFIG.MODEL,
            EXTRA_BODY: config_1.LLM_PROVIDERS[0].EXTRA_BODY || {}
        };
        console.log(`🔑 使用全局校验专用配置 (model=${provider.MODEL}, base=${provider.BASE_URL})`);
        try {
            const body = Object.assign({ model: provider.MODEL, messages: [
                    { role: "system", content: "You are a document outline editor. Fix the document outlines. Output mathematical formulas using LaTeX syntax wrapped in inline $...$. 请使用中文输出内容。专业术语可保留英文原文，但整体表述应以中文为主，避免大段英文。不要输出 JSON，使用 ===SEGMENT=== 标记格式。" },
                    { role: "user", content: prompt }
                ], stream: false, temperature: 0.2, max_tokens: 65536 }, (provider.EXTRA_BODY || {}));
            // 🔁 使用带重试+降级的请求函数
            let content = yield requestOpenCodeV4WithRetry(provider, body, provider.API_KEY);
            console.log(`📊 [OpenCode-V4] 全局校验原始响应长度: ${content.length} 字符`);
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            // 🛡️ 使用 LaTeX 保护器处理内容
            const latexProtect = new latex_protect_1.LatexProtect();
            const protectedContent = latexProtect.protect(content);
            // 📝 使用分隔符格式解析（不再使用 JSON）
            const segResult = parseSegmentFormat(protectedContent);
            let parsed = segResult.segments;
            const metaData = segResult.metaData;
            console.log(`📝 [全局校验解析] 分隔符格式解析结果: ${parsed.length} 个 segments, metaData: ${metaData ? '有' : '无'}`);
            // 🛡️ 还原 LaTeX 公式中的占位符，并修复双反斜杠问题
            if (parsed.length > 0) {
                parsed = parsed.map(item => {
                    const restored = latexProtect.restoreAndFixFields(item, ['title', 'summary']);
                    // 还原 key_points 中的 LaTeX 占位符
                    if (restored.key_points && restored.key_points.length > 0) {
                        restored.key_points = restored.key_points.map(kp => latexProtect.restoreAndFix(kp));
                    }
                    return restored;
                });
                // 所有内容还原完成后，重置保护器状态
                latexProtect.reset();
            }
            // 🛡️ 严格检查 AI 返回数据是否为空
            if (parsed.length === 0) {
                console.error(`❌ [OpenCode-V4] 全局校验 AI 返回空数据`);
                console.error("原始响应内容:", content.slice(0, 500));
                return { chapters: [], metaData: { exam_focus: '', emphasis: [], examples: [] } };
            }
            // 构建默认 metaData（如果 LLM 没有输出 META 块）
            const finalMetaData = metaData || {
                exam_focus: '',
                emphasis: [],
                examples: []
            };
            // 成功获取数据，返回结果
            console.log(`✅ [OpenCode-V4] 全局校验成功，返回 ${parsed.length} 个章节, metaData: exam_focus=${finalMetaData.exam_focus.length}字符, emphasis=${finalMetaData.emphasis.length}个, examples=${finalMetaData.examples.length}个`);
            return { chapters: parsed, metaData: finalMetaData };
        }
        catch (e) {
            console.error(`Global Correction API Error from OpenCode-V4:`, e);
            return { chapters: [], metaData: { exam_focus: '', emphasis: [], examples: [] } };
        }
    });
}
/**
 * 🛡️ 降级思维导图构建器
 * 当 LLM 被 content_filter 拦截或返回空数据时，用章节摘要直接构建一个简化版思维导图
 * 保证用户至少有一个可用的思维导图，而不是完全失败
 */
function buildFallbackMindmap(chapters, videoName, encodedNotePath) {
    console.log('🛡️ [降级思维导图] 开始构建，章节数:', chapters.length);
    let content = `# ${videoName}\n`;
    // 按时间顺序遍历章节，构建二级和三级节点
    for (const chapter of chapters) {
        const targetHeading = `⏱️ ${chapter.timestamp} ${chapter.title}`;
        const encodedHeading = encodeURIComponent(targetHeading);
        const cleanTitle = chapter.title.length > 8 ? chapter.title.substring(0, 8) : chapter.title;
        // 三级节点：章节标题（带跳转链接）
        content += `### <a href="obsidian://silicon-jump?file=${encodedNotePath}&heading=${encodedHeading}">📌${cleanTitle}</a>\n`;
        // 如果有 key_points，用作子节点
        if (chapter.key_points && chapter.key_points.length > 0) {
            for (const kp of chapter.key_points) {
                const trimmed = kp.trim();
                if (trimmed && !trimmed.startsWith('===')) {
                    const cleanLine = trimmed.replace(/^[-*+]\s*/, '').replace(/^\d+\.\s*/, '');
                    if (cleanLine) {
                        content += `- ${cleanLine}\n`;
                    }
                }
            }
        }
        else if (chapter.summary) {
            const lines = chapter.summary.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('===')) {
                    // 去掉 markdown 列表标记前缀，统一用 - 重新缩进
                    const cleanLine = trimmed.replace(/^[-*+]\s*/, '').replace(/^\d+\.\s*/, '');
                    if (cleanLine) {
                        content += `- ${cleanLine}\n`;
                    }
                }
            }
        }
        content += '\n';
    }
    console.log('🛡️ [降级思维导图] 构建完成，内容长度:', content.length);
    return content;
}
/**
 * 调用 LLM API 生成思维导图内容 (本地正则替换链接方案)
 * @param chapters 所有章节数据
 * @param noteFile 笔记的 TFile 对象
 * @param app The Obsidian App instance
 * @returns Markdown 格式的思维导图内容
 */
function generateMindmapContent(chapters, noteFile, app) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        // 从笔记文件名中提取视频名（去掉 "📝" 前缀）
        const videoName = noteFile.basename.replace(/^📝/, '');
        // 编码文件路径用于后续本地替换
        const encodedNotePath = encodeURIComponent(noteFile.path);
        // 💡 改进：大幅简化 Prompt，只要求输出干净的 [MM:SS] 标记
        // 注意：不再传入完整笔记原文（noteContent），只用 key_points，避免 prompt 过长触发内容过滤
        const prompt = `
你是一位**知识体系架构师**。请根据以下视频章节数据，为名为 \`${videoName}\` 的笔记构建一个**逻辑清晰、结构化**的思维导图。

## 核心任务与定位
1. **修正转写错误**：输入内容来源于语音识别，包含一定的同音错别字（尤其是专业术语）。请根据上下文和逻辑**静默修正**这些错误，确保生成的思维导图节点文字准确、专业。
2. **结构化总结**：思维导图的定位是**知识框架与核心逻辑的梳理**。你需要从提供的章节要点中提取**核心概念、关键步骤和重要结论**，将其转化为层次分明的树状结构。
3. **清晰易懂**：节点内容应是**精炼且表意完整的短句或核心要点**，不要过于追求极致的简短而导致语义不明。拒绝长篇大论，但也必须让人一眼看懂该节点的具体含义。
4. **逻辑递进**：根据知识的内在逻辑，构建多层级的树状结构（如 主题 -> 子主题 -> 核心概念 -> 具体展开），展现知识点之间的包含、并列或因果关系。
5. **公式渲染**：对于数学公式，必须使用 LaTeX 语法，并用行内 $...$ 包裹。例如：$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$、$\\int_0^\\infty e^{-x^2} dx$
6. **章节标记（严格遵守）**：在引用具体章节时，必须且只能使用 \`### [时间戳] 标题\` 的格式作为二级或三级节点。**绝对不要生成任何 HTML、链接或代码块！**
7. **尊重原始切分（重要）**：输入数据中的每个章节已经是一个独立的知识点。你的任务是把它们组织成树状结构，**而不是把不同的知识点强行合并成一个大节点**。
   - 可以按学科逻辑分组（如"概念基础"、"计算方法"、"例题"），这是组织层次的合并
   - 但**不要把不同知识点的具体内容揉进同一个叶子节点**
   - 每个原始知识点在思维导图中都应该有自己独立的分支
   - 简单说：你可以加"文件夹"把文件归类，但不要把文件内容混在一起

🔴 链接节点标题规则（极其重要）：\`### [MM:SS] 标题\` 中的标题部分必须是2-8字的凝练概括短语，像思维导图的一级节点一样简短。禁止罗列子标题、禁止写成完整句、禁止展开解释。这个标题是给读者点击跳转用的入口文字，不是内容摘要。

## 输出格式示例（严格参照）
# ${videoName}
## 🎯概念基础
### [00:00] 极限定义
- 核心思想
  - 描述函数在某一点的趋近行为
- 严格定义
  - 使用 ε-δ 语言进行严密表述
## 📐计算方法
### [08:00] 洛必达法则
- 适用场景
  - 专门处理 0/0 型和 ∞/∞ 型未定式
- 核心步骤
  - 对分子分母分别求导后再求极限

🔴 错误示范（禁止这样做）：
## 🎯概念基础
### [00:00] 极限与洛必达
- 极限定义和洛必达法则混在一起  ← 错误！两个独立知识点被强行合并

✅ 正确做法：
## 🎯概念基础
### [00:00] 极限定义
- 核心思想
  - 描述函数在某一点的趋近行为
## 📐计算方法
### [08:00] 洛必达法则
- 适用场景
  - 专门处理 0/0 型和 ∞/∞ 型未定式

---
## 章节结构总结（格式：[时间戳] 标题 + 要点）
${chapters.map(c => {
            const detail = c.key_points
                ? c.key_points.map(kp => `  - ${kp}`).join('\n')
                : c.summary;
            return `[${c.timestamp}] ${c.title}\n${detail}`;
        }).join('\n\n')}
`;
        // 使用 LLM_MINDMAP_CONFIG（思维导图专用配置）；reasoning_effort / thinking 由 EXTRA_BODY 展开
        const mindmapProvider = {
            NAME: 'Mindmap LLM',
            API_KEY: config_1.LLM_MINDMAP_CONFIG.API_KEY,
            BASE_URL: config_1.LLM_MINDMAP_CONFIG.BASE_URL,
            MODEL: config_1.LLM_MINDMAP_CONFIG.MODEL,
            EXTRA_BODY: config_1.LLM_MINDMAP_CONFIG.EXTRA_BODY
        };
        console.log(`🔑 使用思维导图专用配置生成思维导图 (model=${mindmapProvider.MODEL}, base=${mindmapProvider.BASE_URL})`);
        const response = yield (0, http_direct_1.requestDirect)({
            url: mindmapProvider.BASE_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mindmapProvider.API_KEY}`
            },
            timeoutMs: 1800000,
            body: JSON.stringify(Object.assign({ model: mindmapProvider.MODEL, messages: [
                    { role: "system", content: "You are a mindmap outline generator. Output pure Markdown. NEVER output HTML tags. Keep nodes structured, logical, and easy to understand using concise but meaningful phrases. Respect the input knowledge points as independent units — do not merge different topics into one node. 请使用中文输出内容。专业术语可保留英文原文，但整体表述应以中文为主，避免大段英文。" },
                    { role: "user", content: prompt }
                ], stream: false, temperature: 0.3 }, (mindmapProvider.EXTRA_BODY || {})))
        });
        // 🪵 保留完整原始响应日志（截断 2000 字符），方便未来诊断
        try {
            console.log('🧾 思维导图 raw response:', JSON.stringify(response.json).slice(0, 2000));
        }
        catch (logErr) {
            console.warn('思维导图 raw response 序列化失败:', logErr);
        }
        // 🛡️ 检测 content_filter（火山引擎内容安全过滤）
        const finishReason = ((_b = (_a = response.json.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.finish_reason) || '';
        if (finishReason === 'content_filter') {
            console.warn('⚠️ 思维导图被 content_filter 拦截，尝试降级构建简化版思维导图');
            // 降级：用章节摘要直接构建思维导图
            return buildFallbackMindmap(chapters, videoName, encodedNotePath);
        }
        const message = (_e = (_d = (_c = response.json.choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) !== null && _e !== void 0 ? _e : {};
        const rawContent = typeof message.content === 'string' ? message.content : "";
        // 🔁 兼容 DeepSeek reasoning 模型 (reasoning_effort=max) 把最终答案放在 reasoning_content / reasoning 字段的情况
        const rawReasoning = (typeof message.reasoning_content === 'string' ? message.reasoning_content : "") ||
            (typeof message.reasoning === 'string' ? message.reasoning : "");
        let content = "";
        let usedField = 'none';
        if (rawContent && rawContent.trim() !== '') {
            content = rawContent;
            usedField = 'content';
        }
        else if (rawReasoning && rawReasoning.trim() !== '') {
            content = rawReasoning;
            usedField = (typeof message.reasoning_content === 'string' && message.reasoning_content) ? 'reasoning_content' : 'reasoning';
            console.warn(`⚠️ 思维导图 content 字段为空，回退使用 ${usedField} 字段（长度: ${content.length}）`);
        }
        // 🛡️ 严格检查 AI 返回数据是否为空（仅在 content 与 reasoning_content/reasoning 均为空时才判定失败）
        if (!content || content.trim() === '') {
            console.error("❌ 思维导图 AI 返回空数据（content / reasoning_content / reasoning 均为空）");
            // 降级：用章节摘要直接构建思维导图
            return buildFallbackMindmap(chapters, videoName, encodedNotePath);
        }
        console.log(`✅ 思维导图内容提取自字段: ${usedField}（长度: ${content.length}）`);
        // 清理思考过程和代码块标记（对 content 与 reasoning 回退分支统一处理）
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        content = content.replace(/^```(markdown|markmap)?\s*/im, '').replace(/\s*```$/m, '');
        // 自动为非叶子节点（有子节点的列表项）加粗
        const lines = content.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            const match = line.match(/^(\s*)([-*+]\s+)(.*)$/);
            if (match) {
                const currentIndent = match[1].length;
                let isParent = false;
                // 向后查找以判定是否含有子节点
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j];
                    if (nextLine.trim() === '')
                        continue; // 跳过空行
                    const nextMatch = nextLine.match(/^(\s*)([-*+]\s+)(.*)$/);
                    if (nextMatch) {
                        const nextIndent = nextMatch[1].length;
                        if (nextIndent > currentIndent) {
                            isParent = true;
                        }
                        break; // 找到同级、高级或低级相邻节点，退出查找
                    }
                    else if (nextLine.match(/^#+\s/)) {
                        // 遇到标题，停止分析子节点
                        break;
                    }
                    else {
                        // 普通文本（可能是换行内容）
                        const textIndentMatch = nextLine.match(/^(\s*)/);
                        const textIndent = textIndentMatch ? textIndentMatch[1].length : 0;
                        if (textIndent <= currentIndent) {
                            break; // 缩进小于等于当前节点，说明并非其子内容
                        }
                    }
                }
                if (isParent) {
                    let text = match[3];
                    // 剔除已有的加粗标记，避免嵌套
                    text = text.replace(/\*\*/g, '');
                    lines[i] = `${match[1]}${match[2]}**${text}**`;
                }
            }
        }
        content = lines.join('\n');
        // 💡 改进点 2：本地硬编程替换。拦截 "### [MM:SS] 标题" 并转换为精确跳转链接
        // 正则解释：匹配以 1-6个#开头，后跟 [时间戳]，最后是标题的行
        const nodeRegex = /^(#+)\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/gm;
        content = content.replace(nodeRegex, (match, hashes, timestamp, displayTitle) => {
            // 1. 通过时间戳，反查原本真实的章节数据
            const originalChapter = chapters.find(c => c.timestamp === timestamp);
            // 2. 获取真实的标题（防止 AI 幻觉乱改标题导致跳转不到正确的 Heading）
            const realTitle = originalChapter ? originalChapter.title : displayTitle.trim();
            // 3. 构建目标笔记中真实的 Heading 字符串 (对应 main.ts 里的 `#### ⏱️ MM:SS 标题`)
            const targetHeading = `⏱️ ${timestamp} ${realTitle}`;
            const encodedHeading = encodeURIComponent(targetHeading);
            // 4. 清理显示的标题，强制加上 📌 图标 (按你的需求，不带空格)
            let cleanDisplayTitle = displayTitle.trim();
            if (!cleanDisplayTitle.startsWith('📌')) {
                cleanDisplayTitle = `📌${cleanDisplayTitle}`;
            }
            // 5. 返回拼接好的完美 HTML 链接
            return `${hashes} <a href="obsidian://silicon-jump?file=${encodedNotePath}&heading=${encodedHeading}">${cleanDisplayTitle}</a>`;
        });
        return content;
    });
}
/**
 * 调用 LLM API 根据用户指令重写或总结选中的文本
 * @param selectedText 选中的原始文本
 * @param instruction 用户的自定义要求
 * @param provider 使用的 LLM 配置
 * @returns 修改后的文本
 */
function rewriteSelection(selectedText, instruction, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const prompt = `
你是一个专业的笔记整理助手。请根据用户的【特定要求】，对提供的【选中文本】进行重构、润色或总结。

【特定要求】：
${instruction}

【选中文本】：
${selectedText}

请直接输出处理后的结果，不要包含任何寒暄语、解释性话语或多余的代码块标记（除非用户要求输出代码块）。
`;
        try {
            const response = yield (0, http_direct_1.requestDirect)({
                url: provider.BASE_URL,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${provider.API_KEY}`
                },
                body: JSON.stringify({
                    model: provider.MODEL,
                    messages: [
                        { role: "system", content: "You are a professional writing and summarizing assistant. Provide direct results without conversational filler. Output mathematical formulas using LaTeX syntax wrapped in inline $...$." },
                        { role: "user", content: prompt }
                    ],
                    stream: false,
                    temperature: 0.3,
                    thinking: { type: "enabled" }
                })
            });
            let content = ((_c = (_b = (_a = response.json.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || "";
            // 去掉思考过程
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            return content;
        }
        catch (e) {
            console.error("Rewrite Selection API Error:", e);
            throw e;
        }
    });
}
/**
 * 计算 LLM 使用统计
 */
function calculateLLMStats(records) {
    const stats = {
        totalCalls: records.length,
        successCalls: 0,
        failedCalls: 0,
        providersUsed: [],
        modelsUsed: [],
        totalDurationMs: 0,
        errorSummary: []
    };
    const providerSet = new Set();
    const modelSet = new Set();
    for (const record of records) {
        if (record.success) {
            stats.successCalls++;
        }
        else {
            stats.failedCalls++;
            if (record.error) {
                stats.errorSummary.push(`[${record.phase}] 批次${record.batchIndex + 1}: ${record.error}`);
            }
        }
        providerSet.add(record.provider);
        modelSet.add(record.model);
        if (record.durationMs) {
            stats.totalDurationMs += record.durationMs;
        }
    }
    stats.providersUsed = Array.from(providerSet);
    stats.modelsUsed = Array.from(modelSet);
    return stats;
}
/**
 * 生成任务完成报告（使用商汤/京东云模型）
 * @param reportData 任务执行数据
 * @returns Markdown 格式的报告内容
 */
function generateTaskReport(reportData) {
    return __awaiter(this, void 0, void 0, function* () {
        // 提取笔记内容中的数学公式片段供 LLM 分析
        let formulaSection = '';
        if (reportData.generatedNoteContent) {
            // 提取所有 $...$ 和 $$...$$ 中的数学公式
            const inlineFormulas = reportData.generatedNoteContent.match(/\$[^$]+\$/g) || [];
            const displayFormulas = reportData.generatedNoteContent.match(/\$\$[^$]+\$\$/g) || [];
            const allFormulas = [...inlineFormulas, ...displayFormulas];
            if (allFormulas.length > 0) {
                // 取前 30 个公式进行分析
                formulaSection = `\n## 生成的数学公式（共 ${allFormulas.length} 个，展示前 30 个）\n${allFormulas.slice(0, 30).map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
            }
        }
        // 计算 LLM 使用统计
        const llmStats = calculateLLMStats(reportData.llmCallRecords || []);
        // 构建 LLM 使用情况部分
        let llmUsageSection = `
## LLM 调用统计
- 总调用次数: ${llmStats.totalCalls} 次
- 成功次数: ${llmStats.successCalls} 次
- 失败次数: ${llmStats.failedCalls} 次
- 使用的 Provider: ${llmStats.providersUsed.join(', ') || '无记录'}
- 使用的模型: ${llmStats.modelsUsed.join(', ') || '无记录'}
- LLM 总耗时: ${(llmStats.totalDurationMs / 1000).toFixed(1)} 秒`;
        // 如果有失败记录，添加详细信息
        if (llmStats.failedCalls > 0) {
            llmUsageSection += `\n- ⚠️ 失败详情:
${llmStats.errorSummary.slice(0, 5).map(e => `  - ${e}`).join('\n')}`;
        }
        const prompt = `你是专业的任务报告生成器和 LaTeX 格式检查专家。请根据以下数据生成报告：

## 任务执行数据
- 文件: ${reportData.videoFileName}
- 时长: ${Math.floor(reportData.totalDuration / 60)}分${Math.floor(reportData.totalDuration % 60)}秒
- 批次: ${reportData.successBatches}/${reportData.totalBatches} 成功
- 总耗时: ${reportData.durationSeconds}秒
- 全局分析: ${reportData.globalAnalysisSuccess ? '成功' : '失败'}
- 思维导图: ${reportData.mindmapSuccess ? '成功' : '失败'}
${llmUsageSection}
${reportData.errorLog.length > 0 ? '- 错误日志: ' + reportData.errorLog.slice(0, 5).join('\n  ') : ''}
${formulaSection}

## 报告要求

### 1. 执行概览
简要总结任务是否顺利完成（1-2 句话），并简要提及 LLM 使用情况（是否正常、有无异常）。

### 2. LaTeX 格式深度检查（最重要！）
仔细检查上面的每个数学公式，识别以下转义错误：

**常见错误类型：**
- **双反斜杠问题**：公式中出现 \`\\\\left\` \`\\\\frac\` \`\\\\partial\` 等，应为单反斜杠 \`\\left\` \`\\frac\` \`\\partial\`
- **希腊字母转义**：\`\\\\alpha\` \`\\\\beta\` \`\\\\epsilon\` 等，应为 \`\\alpha\` \`\\beta\` \`\\epsilon\`
- **其他命令**：\`\\\\sum\` \`\\\\int\` \`\\\\sqrt\` 等，应为 \`\\sum\` \`\\int\` \`\\sqrt\`

**输出格式（如果发现问题）：**
> [!danger] ⚠️ LaTeX 转义错误检测
> 发现 X 处问题：
> 
> | 序号 | 错误公式 | 正确写法 | 问题类型 |
> |-----|---------|---------|---------|
> | 1   | \`$\\\\left(x\\\\right)$\` | \`$\\left(x\\right)$\` | 双反斜杠 |
> | 2   | \`$\\\\frac{a}{b}$\` | \`$\\frac{a}{b}$\` | 双反斜杠 |
> 
> **根因分析**：[说明是 JSON 序列化、字符串转义还是其他原因导致]
> **修复建议**：[给程序员的具体代码修复建议，指出哪个模块需要修改]

如果所有公式都正确，写："✅ LaTeX 格式检查通过，无转义错误"

### 3. 问题与建议
仅在实际存在执行错误或格式问题时给出分析和建议。`;
        // 报告生成函数（内部实现）
        const generateReportWithProvider = (provider, providerName) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                console.log(`📋 尝试使用 ${providerName} 生成报告...`);
                const response = yield (0, http_direct_1.requestDirect)({
                    url: provider.BASE_URL,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${provider.API_KEY}`
                    },
                    body: JSON.stringify({
                        model: provider.MODEL,
                        messages: [
                            { role: "system", content: "你是一位专业的任务报告生成器和 LaTeX 格式检查专家。请客观、真实、详细地生成报告，特别关注 LaTeX 转义问题。使用中文输出。发现问题必须列出具体错误，帮助程序员定位和修复代码。" },
                            { role: "user", content: prompt }
                        ],
                        stream: false,
                        temperature: 0.1
                    })
                });
                let content = ((_c = (_b = (_a = response.json.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || "";
                content = content.replace(/<tool_call>[\s\S]*?<\/think>/g, '').trim();
                console.log(`✅ ${providerName} 报告生成成功`);
                return { content };
            }
            catch (e) {
                const errorMsg = e.message || String(e);
                console.warn(`⚠️ ${providerName} 报告生成失败:`, errorMsg);
                return { content: null, error: errorMsg };
            }
        });
        // 报告头（包含生成信息）
        const buildReportHeader = (providerName, usedFallback, primaryError) => {
            let header = `\n\n---\n\n> [!summary] 📋 任务完成报告\n> 生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
            // 添加报告生成模型信息
            header += `>\n> **报告生成模型**: ${providerName}`;
            if (usedFallback) {
                header += ` ⚠️(备用激活)`;
            }
            header += `\n`;
            if (primaryError) {
                // 截断过长的错误信息
                const shortError = primaryError.length > 80 ? primaryError.slice(0, 80) + '...' : primaryError;
                header += `> **主模型失败原因**: ${shortError}\n`;
            }
            return header + '\n';
        };
        // 优先使用商汤 DeepSeek-V4-Flash
        const primaryResult = yield generateReportWithProvider(config_1.LLM_REPORT_CONFIG, '商汤 DeepSeek-V4-Flash');
        let content = primaryResult.content;
        let usedFallback = false;
        let primaryError = primaryResult.error;
        // 如果商汤失败，回退到京东云 Kimi-K2.5
        if (!content) {
            console.log('🔄 切换到备用 Provider: 京东云 Kimi-K2.5');
            const fallbackResult = yield generateReportWithProvider(config_1.LLM_REPORT_FALLBACK, '京东云 Kimi-K2.5');
            content = fallbackResult.content;
            usedFallback = true;
        }
        if (content) {
            const providerName = usedFallback ? '京东云 Kimi-K2.5' : '商汤 DeepSeek-V4-Flash';
            return buildReportHeader(providerName, usedFallback, primaryError) + content;
        }
        // 两个都失败，返回简化版报告
        console.error('❌ 所有报告生成 Provider 均失败');
        const errorInfo = primaryError ? `商汤: ${primaryError.slice(0, 50)}...` : '未知错误';
        return `\n\n---\n\n> [!warning] 📋 任务完成报告 (简化版)\n> 生成时间: ${new Date().toLocaleString('zh-CN')}\n> \n> - 视频文件: ${reportData.videoFileName}\n> - 总批次: ${reportData.totalBatches}\n> - 成功批次: ${reportData.successBatches}\n> - 失败批次: ${reportData.failedBatches}\n> - 全局分析: ${reportData.globalAnalysisSuccess ? '✅' : '❌'}\n> - 思维导图: ${reportData.mindmapSuccess ? '✅' : '❌'}\n> \n> ❌ 详细报告生成失败: ${errorInfo}\n`;
        return `\n\n---\n\n> [!warning] 📋 任务完成报告 (简化版)\n> 生成时间: ${new Date().toLocaleString('zh-CN')}\n> \n> - 视频文件: ${reportData.videoFileName}\n> - 总批次: ${reportData.totalBatches}\n> - 成功批次: ${reportData.successBatches}\n> - 失败批次: ${reportData.failedBatches}\n> - 全局分析: ${reportData.globalAnalysisSuccess ? '✅' : '❌'}\n> - 思维导图: ${reportData.mindmapSuccess ? '✅' : '❌'}\n> \n> ⚠️ 详细报告生成失败，请检查日志。\n`;
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGxtLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGxtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7Ozs7Ozs7Ozs7O0FBMnZCSCwwQ0FZQztBQThIRCxnRUFpSEM7QUErREQsd0RBdU5DO0FBU0QsNENBNkNDO0FBMEZELGdEQTRKQztBQXJqREQsK0NBQThDO0FBQzlDLHFDQUFpSjtBQUVqSixtQ0FBcUM7QUFDckMsbURBQStDO0FBRS9DOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW9CRztBQUNILFNBQVMsa0JBQWtCLENBQUMsT0FBZTtJQUN2Qyx1Q0FBdUM7SUFDdkMsRUFBRTtJQUNGLHVDQUF1QztJQUN2Qyx1Q0FBdUM7SUFDdkMsNENBQTRDO0lBQzVDLEVBQUU7SUFDRixRQUFRO0lBQ1IsMENBQTBDO0lBQzFDLGVBQWU7SUFDZiw2QkFBNkI7SUFDN0IsMENBQTBDO0lBQzFDLEVBQUU7SUFDRixpQkFBaUI7SUFDakIsdUVBQXVFO0lBQ3ZFLHVEQUF1RDtJQUN2RCwrREFBK0Q7SUFDL0QsNkRBQTZEO0lBQzdELHVFQUF1RTtJQUN2RSxJQUFJLE1BQU0sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLGlDQUFpQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBRTFFLDhCQUE4QjtJQUM5QixFQUFFO0lBQ0YsbUNBQW1DO0lBQ25DLHVEQUF1RDtJQUN2RCxFQUFFO0lBQ0Ysb0RBQW9EO0lBQ3BELElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQztJQUNmLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNWLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN2QixJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRTNCLGdCQUFnQjtZQUNoQixrREFBa0Q7WUFDbEQsbUNBQW1DO1lB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WSxlQUFlLFVBQVUsQ0FBQyxjQUFjLGVBQWUsVUFBVSxDQUFDLGFBQWEsZUFBZSxVQUFVLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxlQUFlLFVBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyw4QkFBOEIsQ0FBQztJQUM5WSxDQUFDO0NBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICog8J+noCBMTE0g5aSn6K+t6KiA5qih5Z6L5qih5Z2XXHJcbiAqIOWkhOeQhiBBSSDnq6DoioLliIbmnpDlkozmgJ3nu7Tlr7zlm77nlJ/miJBcclxuICovXHJcblxyXG5pbXBvcnQgeyBBcHAsIFRGaWxlIH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgeyByZXF1ZXN0RGlyZWN0IH0gZnJvbSAnLi9odHRwLWRpcmVjdCc7XHJcbmltcG9ydCB7IExMTV9DT05GSUcsIExMTV9HTE9CQUxfQ09ORklHLCBMTE1fTUlORE1BUF9DT05GSUcsIExMTV9SRVBPUlRfQ09ORklHLCBMTE1fUkVQT1JUX0ZBTExCQUNLLCBMTE1Qcm92aWRlciwgTExNX1BST1ZJREVSUyB9IGZyb20gJy4vY29uZmlnJztcclxuaW1wb3J0IHsgQ2hhcHRlclN1bW1hcnksIE5vdGVNZXRhRGF0YSwgRXhhbXBsZUl0ZW0sIEdsb2JhbENvcnJlY3Rpb25SZXN1bHQgfSBmcm9tICcuL3R5cGVzJztcclxuaW1wb3J0IHsgZm9ybWF0VGltZSB9IGZyb20gJy4vdXRpbHMnO1xyXG5pbXBvcnQgeyBMYXRleFByb3RlY3QgfSBmcm9tICcuL2xhdGV4LXByb3RlY3QnO1xyXG5cclxuLyoqXHJcbiAqIPCfm6HvuI8g5L+u5aSNIEpTT04g5a2X56ym5Liy5Lit55qE6Z2e5rOV5Y+N5pac5p2g6L2s5LmJICjlhajpnaLkv53miqTniYgpXHJcbiAqXHJcbiAqICMjIOmXrumimOiDjOaZr1xyXG4gKiBKU09OIOS4reWQiOazleeahOi9rOS5ieespuacie+8mlxcXCIsIFxcXFwsIFxcLywgXFxiLCBcXGYsIFxcbiwgXFxyLCBcXHQsIFxcdVhYWFhcclxuICpcclxuICog6L+Z5a+86Ie0IExhVGVYIOWRveS7pOS8muiiq+mUmeivr+WkhOeQhu+8mlxyXG4gKiAtIFxcYiDlvIDlpLQ6IFxcYmV0YSwgXFxiYXIsIFxcYmlnLCBcXGJlZ2luLCBcXGJpZ2csIFxcYm0sIFxcYm94ZWQsIFxcYmZcclxuICogLSBcXGYg5byA5aS0OiBcXGZyYWMsIFxcZm9yYWxsLCBcXGZsYXQsIFxcZm9vdG5vdGVcclxuICogLSBcXG4g5byA5aS0OiBcXG5hYmxhLCBcXG5lcSwgXFxudSwgXFxub3QsIFxcbm9ybSwgXFxuZWcsIFxcbmF0dXJhbFxyXG4gKiAtIFxcciDlvIDlpLQ6IFxccmhvLCBcXHJpZ2h0LCBcXHJhbmdsZSwgXFxzcXJ0LCBcXHJ1bGVcclxuICogLSBcXHQg5byA5aS0OiBcXHRoZXRhLCBcXHRhdSwgXFx0aW1lcywgXFx0bywgXFx0aWxkZSwgXFx0ZXh0LCBcXHRvcCwgXFx0YW5cclxuICpcclxuICogIyMg6Kej5Yaz5pa55qGIXHJcbiAqIOmHh+eUqFwi57K+5YeG5omT5Ye7ICsg6YCa55So5omr5o+PXCLkuKTpmLbmrrXnrZbnlaXvvJpcclxuICogMS4g6Zi25q615LiA77ya5L+d5oqk5omA5pyJ5LulIEpTT04g6L2s5LmJ56ym5byA5aS055qEIExhVGVYIOWRveS7pFxyXG4gKiAyLiDpmLbmrrXkuozvvJrpgJDlrZfnrKbmiavmj4/lpITnkIblhbbku5bpnZ7ms5XovazkuYlcclxuICpcclxuICogQHBhcmFtIGNvbnRlbnQg5b6F5L+u5aSN55qEIEpTT04g5a2X56ym5LiyXHJcbiAqIEByZXR1cm5zIOS/ruWkjeWQjueahOWtl+espuS4slxyXG4gKi9cclxuZnVuY3Rpb24gZml4SnNvbkJhY2tzbGFzaGVzKGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICAvLyDpmLbmrrXkuIDvvJrjgJDnsr7lh4bmiZPlh7vjgJHkv53miqTmiYDmnInku6UgSlNPTiDovazkuYnnrKblvIDlpLTnmoQgTGFUZVgg5ZG95LukXHJcbiAgICAvL1xyXG4gICAgLy8g5Y6f55CG77yaTGFUZVgg5ZG95Luk5qC85byP5Li6IFxcY29tbWFuZE5hbWXvvIjlj43mlpzmnaDlkI7ot5/lrZfmr43vvIlcclxuICAgIC8vIOiAjCBKU09OIOi9rOS5ieespiBcXGIsIFxcZiwgXFxuLCBcXHIsIFxcdCDlkI7pnaLkuI3ot5/lrZfmr41cclxuICAgIC8vIOWboOatpO+8jOW9k+ajgOa1i+WIsCBcXFtiZm5ydF0g5ZCO6Lef5a2X5q+N5pe277yM6K+05piO6L+Z5pivIExhVGVYIOWRveS7pO+8jOmcgOimgeS/neaKpFxyXG4gICAgLy9cclxuICAgIC8vIOato+WImeivtOaYju+8mlxyXG4gICAgLy8gKD88IVxcXFwpIC0g5YmN6Z2i5LiN5piv5Y+N5pac5p2g77yI6YG/5YWN6YeN5aSN6L2s5LmJ5bey5L+d5oqk55qE5ZG95Luk5aaCIFxcXFxmcmFj77yJXHJcbiAgICAvLyBcXFxcIC0g5Yy56YWN5Y2V5Liq5Y+N5pac5p2gXHJcbiAgICAvLyAoW2JmbnJ0XSkgLSDmjZXojrcgSlNPTiDovazkuYnnrKbpppblrZfmr41cclxuICAgIC8vICg/PVthLXpBLVpdKSAtIOato+WQkemihOafpe+8jOehruS/neWQjumdouaYr+Wtl+avje+8iExhVGVYIOWRveS7pOeJueW+ge+8iVxyXG4gICAgLy9cclxuICAgIC8vIOimhueblueahOiAg+eglOaVsOWtpuW4uOeUqOWRveS7pOekuuS+i++8mlxyXG4gICAgLy8gXFxiOiBcXGJldGEsIFxcYmFyLCBcXGJpZywgXFxiZWdpbiwgXFxibSwgXFxib3hlZCwgXFxiZiwgXFxiaWdnLCBcXGJpZ2wsIFxcYmlnclxyXG4gICAgLy8gXFxmOiBcXGZyYWMsIFxcZm9yYWxsLCBcXGZsYXQsIFxcZm9vdG5vdGUsIFxcZmFsbGluZ2RvdHNlcVxyXG4gICAgLy8gXFxuOiBcXG5hYmxhLCBcXG5lcSwgXFxudSwgXFxub3QsIFxcbm9ybSwgXFxuZWcsIFxcbmF0dXJhbCwgXFxuZWFycm93XHJcbiAgICAvLyBcXHI6IFxccmhvLCBcXHJpZ2h0LCBcXHJhbmdsZSwgXFxzcXJ0ICjms6jmhI86IFxcc3FydCDku6UgXFxzIOW8gOWktO+8jOmYtuauteS6jOWkhOeQhilcclxuICAgIC8vIFxcdDogXFx0aGV0YSwgXFx0YXUsIFxcdGltZXMsIFxcdG8sIFxcdGlsZGUsIFxcdGV4dCwgXFx0b3AsIFxcdGFuLCBcXHRoZXJlZm9yZVxyXG4gICAgbGV0IHJlc3VsdCA9IGNvbnRlbnQucmVwbGFjZSgvKD88IVxcXFwpXFxcXChbYmZucnRdKSg/PVthLXpBLVpdKS9nLCAnXFxcXFxcXFwkMScpO1xyXG5cclxuICAgIC8vIOmYtuauteS6jO+8muOAkOmAmueUqOaJq+aPj+OAkemAkOWtl+espuaJq+aPj++8jOWkhOeQhuaJgOacieWJqeS9meeahOmdnuazlei9rOS5iVxyXG4gICAgLy9cclxuICAgIC8vIOi/meS4qumYtuauteWkhOeQhuS4jeS7pSBKU09OIOi9rOS5ieespuW8gOWktOeahCBMYVRlWCDlkb3ku6TvvIzlpoLvvJpcclxuICAgIC8vIFxcYWxwaGEsIFxcc3VtLCBcXGludCwgXFxsZXEsIFxcaW5mdHksIFxccGFydGlhbCwgXFxvbWVnYSDnrYlcclxuICAgIC8vXHJcbiAgICAvLyDlkIzml7bmraPnoa7kv53nlZnlkIjms5XnmoQgSlNPTiDovazkuYnnrKbvvJpcXG4sIFxcdCwgXFxyLCBcXGIsIFxcZu+8iOW9k+Wug+S7rOWQjumdouS4jei3n+Wtl+avjeaXtu+8iVxyXG4gICAgbGV0IGZpeGVkID0gJyc7XHJcbiAgICBsZXQgaSA9IDA7XHJcbiAgICB3aGlsZSAoaSA8IHJlc3VsdC5sZW5ndGgpIHtcclxuICAgICAgICBpZiAocmVzdWx0W2ldID09PSAnXFxcXCcpIHtcclxuICAgICAgICAgICAgY29uc3QgbmV4dCA9IHJlc3VsdFtpICsgMV07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyDlkIjms5XnmoQgSlNPTiDovazkuYnluo/liJdcclxuICAgICAgICAgICAgLy8g5rOo5oSP77ya6L+Z6YeMIFxcYiwgXFxmLCBcXG4sIFxcciwgXFx0IOWPquacieWcqOS4jei3n+Wtl+avjeaXtuaJjeaYr+ecn+ato+eahCBKU09OIOi9rOS5ieesplxyXG4gICAgICAgICAgICAvLyDot5/lrZfmr43nmoTmg4XlhrXlt7LlnKjpmLbmrrXkuIDlpITnkIbvvIzov5nph4zlj6rkvJrpgYfliLDnnJ/mraPnmoQgSlNPTiDovazkuYnnrKZcclxuICAgICAgICAgICAgaWYgKG5leHQgPT09ICdcIicgfHwgbmV4dCA9PT0gJ1xcXFwnIHx8IG5leHQgPT09ICcvJyB8fFxyXG4gICAgICAgICAgICAgICAgbmV4dCA9PT0gJ2InIHx8IG5leHQgPT09ICdmJyB8fCBuZXh0ID09PSAnbicgfHxcclxuICAgICAgICAgICAgICAgIG5leHQgPT09ICdyJyB8fCBuZXh0ID09PSAndCcpIHtcclxuICAgICAgICAgICAgICAgIGZpeGVkICs9IHJlc3VsdFtpXSArIG5leHQ7XHJcbiAgICAgICAgICAgICAgICBpICs9IDI7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobmV4dCA9PT0gJ1xcXFwnKSB7XHJcbiAgICAgICAgICAgICAgICAvLyDnibnmrorlpITnkIbov57nu63lj43mlpzmnaAgXFxcXO+8muS4pOS4quWPjeaWnOadoOS4gOi1t+i3s+i/h++8jOS4jeWPjOWGmVxyXG4gICAgICAgICAgICAgICAgLy8g6L+Z5piv5Zug5Li66Zi25q615LiA5bey57uP5aSE55CG6L+HIExhVGVYIOWRveS7pO+8jOWPjOWPjeaWnOadoOihqOekuuS/neaKpOWQjueahOWRveS7pOWJjee8gFxyXG4gICAgICAgICAgICAgICAgZml4ZWQgKz0gcmVzdWx0W2ldO1xyXG4gICAgICAgICAgICAgICAgaSArPSAyO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5leHQgPT09ICd1Jykge1xyXG4gICAgICAgICAgICAgICAgLy8g5qOA5p+lIFxcdVhYWFgg5qC85byPXHJcbiAgICAgICAgICAgICAgICBjb25zdCBoZXhQYXJ0ID0gcmVzdWx0LnNsaWNlKGkgKyAyLCBpICsgNik7XHJcbiAgICAgICAgICAgICAgICBpZiAoL15bMC05YS1mQS1GXXs0fSQvLnRlc3QoaGV4UGFydCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBmaXhlZCArPSByZXN1bHQuc2xpY2UoaSwgaSArIDYpO1xyXG4gICAgICAgICAgICAgICAgICAgIGkgKz0gNjtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8g6Z2e5rOVIFxcdSDluo/liJfvvIzlj4zlhpnlj43mlpzmnaBcclxuICAgICAgICAgICAgICAgICAgICBmaXhlZCArPSAnXFxcXFxcXFwnO1xyXG4gICAgICAgICAgICAgICAgICAgIGkgKz0gMTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmIChuZXh0ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIC8vIOWtl+espuS4suacq+WwvueahOWtpOeri+WPjeaWnOadoFxyXG4gICAgICAgICAgICAgICAgZml4ZWQgKz0gJ1xcXFxcXFxcJztcclxuICAgICAgICAgICAgICAgIGkgKz0gMTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIOaJgOacieWFtuS7luaDheWGte+8iExhVGVYIOWRveS7pOWmgiBcXGFscGhhLCBcXHN1bSwgXFxpbnQg562J77yJXHJcbiAgICAgICAgICAgICAgICAvLyDlj4zlhpnlj43mlpzmnaDov5vooYzkv53miqRcclxuICAgICAgICAgICAgICAgIGZpeGVkICs9ICdcXFxcXFxcXCc7XHJcbiAgICAgICAgICAgICAgICBpICs9IDE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmaXhlZCArPSByZXN1bHRbaV07XHJcbiAgICAgICAgICAgIGkgKz0gMTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBmaXhlZDtcclxufVxyXG5cclxuLyoqXHJcbiAqIOS7juWPr+iDveWMheWQq+mineWkluWGheWuueeahOWTjeW6lOS4reaPkOWPliBKU09OIOaVsOe7hFxyXG4gKiBAcGFyYW0gY29udGVudCBBSSDlk43lupTlhoXlrrlcclxuICogQHJldHVybnMg5o+Q5Y+W55qEIEpTT04g5a2X56ym5Liy77yM5oiWIG51bGxcclxuICovXHJcbmZ1bmN0aW9uIGV4dHJhY3RKc29uQXJyYXkoY29udGVudDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgICAvLyDlsJ3or5Xmib7liLAgSlNPTiDmlbDnu4TnmoTotbflp4vlkoznu5PmnZ/kvY3nva5cclxuICAgIGNvbnN0IHN0YXJ0ID0gY29udGVudC5pbmRleE9mKCdbJyk7XHJcbiAgICBpZiAoc3RhcnQgPT09IC0xKSByZXR1cm4gbnVsbDtcclxuICAgIFxyXG4gICAgbGV0IGRlcHRoID0gMDtcclxuICAgIGxldCBlbmQgPSAtMTtcclxuICAgIFxyXG4gICAgZm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgY29udGVudC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChjb250ZW50W2ldID09PSAnWycpIGRlcHRoKys7XHJcbiAgICAgICAgZWxzZSBpZiAoY29udGVudFtpXSA9PT0gJ10nKSB7XHJcbiAgICAgICAgICAgIGRlcHRoLS07XHJcbiAgICAgICAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgZW5kID0gaTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZW5kID09PSAtMSkgcmV0dXJuIG51bGw7XHJcbiAgICAgIHJldHVybiBjb250ZW50LnNsaWNlKHN0YXJ0LCBlbmQgKyAxKTtcclxuICB9XHJcbiAgXHJcbiAgLyoqXHJcbiAgICog5riF5rSX55W45b2iIEpTT04g5a2X56ym5Liy77yM5L+u5aSN5bi46KeBIEFJIOi+k+WHuumXrumimFxyXG4gICAqIC0g5Lit5paH5YWo6KeS5byV5Y+344CM44CNXCJcIiDihpIg5a6J5YWo5pu/5o2i77yI5LiN56C05Z2PIEpTT04g57uT5p6E77yJXHJcbiAgICogLSDoo7jplK7lkI3vvIjml6DlvJXlj7fvvInihpIg6Ieq5Yqo5Yqg5byV5Y+3XHJcbiAgICpcclxuICAgKiDjgJDlhbPplK7kv67lpI3jgJHkuYvliY3lhajop5LlvJXlj7fnm7TmjqXmm7/mjaLmiJDljYrop5IgXCLvvIzlvZPlhajop5LlvJXlj7flh7rnjrDlnKggSlNPTlxyXG4gICAqIOWtl+espuS4suWAvOWGhemDqOaXtu+8iOWmgiBzdW1tYXJ5OiBcIi4uLuWbtOe7lVwi5qC55Y+35aSN5p2CXCLmnaXorr7nva4uLi5cIu+8ie+8jFxyXG4gICAqIOS8muiiqyBKU09OIOino+aekOWZqOivr+iupOS4uuWtl+espuS4suaPkOWJjee7k+adn++8jOWvvOiHtOino+aekOWksei0peOAglxyXG4gICAqIOeOsOWcqOabv+aNouS4uuWFqOinkuW8leWPt+eahCBVbmljb2RlIOi9rOS5ieW9ouW8j++8jOS4jeW5suaJsCBKU09OIOivreazleOAglxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIHNhbml0aXplSnNvblN0cmluZyhyYXc6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICBsZXQgcyA9IHJhdztcclxuICAgIC8vIDEuIOWFqOinkuW8leWPt+abv+aNouS4uiBVbmljb2RlIOi9rOS5ie+8iOS4jeW5suaJsCBKU09OIOivreazle+8iVxyXG4gICAgLy8gICAgXCIg4oaSIFxcdTIwMWMsIFwiIOKGkiBcXHUyMDFkLCDjgIwg4oaSIFxcdTMwMGMsIOOAjSDihpIgXFx1MzAwZFxyXG4gICAgLy8gICAg6L+Z5qC3IEpTT04ucGFyc2Ug5ZCO6L+Y5Y6f5Li65YWo6KeS5byV5Y+35a2X56ym77yM5LiN5b2x5ZONIEpTT04g57uT5p6EXHJcbiAgICBzID0gcy5yZXBsYWNlKC9cXHUyMDFjL2csICdcXFxcdTIwMWMnKVxyXG4gICAgICAgICAucmVwbGFjZSgvXFx1MjAxZC9nLCAnXFxcXHUyMDFkJylcclxuICAgICAgICAgLnJlcGxhY2UoL1xcdTMwMGMvZywgJ1xcXFx1MzAwYycpXHJcbiAgICAgICAgIC5yZXBsYWNlKC9cXHUzMDBkL2csICdcXFxcdTMwMGQnKTtcclxuICAgIFxyXG4gICAgLy8gMi4g6KO46ZSu5ZCN5Yqg5byV5Y+377ya5Yy56YWNIHssIOaIliAsIOWQjui3n+agh+ivhuespuWGjei3nyA6XHJcbiAgICAvLyAgIOato+WImeivtOaYju+8mlxyXG4gICAgLy8gICAoW3ssXVxccyopICAtIOWMuemFjSB7IOaIliAsIOWPiuWFtuWQjueahOepuueZvVxyXG4gICAgLy8gICAoW2EtekEtWl9dW2EtekEtWjAtOV9dKikgLSDljLnphY3plK7lkI1cclxuICAgIC8vICAgKFxccyo6KSAgICAgLSDljLnphY3lhpLlj7fvvIjlhYHorrjliY3lr7znqbrmoLzvvIlcclxuICAgIC8vICDms6jmhI/vvJrkuI3kvJrnoLTlnY/lvJXlj7flhoXnmoTlgLzvvIjlpoLml7bpl7TmiLMgXCIxMDowMVwiIOS4reeahOWGkuWPt+WcqOW8leWPt+WGhe+8iVxyXG4gICAgcyA9IHMucmVwbGFjZSgvKFt7LF1cXHMqKShbYS16QS1aX11bYS16QS1aMC05X10qKShcXHMqOikvZywgJyQxXCIkMlwiJDMnKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHM7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDlsJ3or5Xop6PmnpDooqvmiKrmlq3nmoQgSlNPTlxyXG4gICAqIOW9kyBMTE0g6L6T5Ye66KKrIG1heF90b2tlbnMg6ZmQ5Yi25oiq5pat5pe277yMSlNPTiDkvJrlnKjlrZfnrKbkuLLlgLzkuK3pl7Tmlq3oo4JcclxuICAgKiDmraTlh73mlbDlsJ3or5XpgJrov4fooaXlhajlvJXlj7flkozpl63lkIjmi6zlj7fmnaXmiqLmlZHlt7Lop6PmnpDnmoQgc2VnbWVudHNcclxuICAgKlxyXG4gICAqIOetlueVpe+8mlxyXG4gICAqIDEuIOaJvuWIsOacgOWQjuS4gOS4quWujOaVtOeahOWvueixoe+8iOmAmui/h+Wvu+aJvuacgOWQjuS4gOS4qiBcInN1bW1hcnlcIiDmiJYgXCJ0aW1lc3RhbXBcIiDplK7nmoTlrozmlbTlgLzvvIlcclxuICAgKiAyLiDku47mnIDlkI7kuIDkuKrlrozmlbTlr7nosaHkuYvlkI7miKrmlq1cclxuICAgKiAzLiDooaXlhajpl63lkIjmi6zlj7cgfSBdIOWSjOmhtuWxgiB9IOadpemXreWQiCBKU09OXHJcbiAgICovXHJcbiAgZnVuY3Rpb24gdHJ5UGFyc2VUcnVuY2F0ZWRKc29uKHJhdzogc3RyaW5nKTogQ2hhcHRlclN1bW1hcnlbXSB8IG51bGwge1xyXG4gICAgdHJ5IHtcclxuICAgICAgbGV0IHMgPSByYXcudHJpbSgpO1xyXG5cclxuICAgICAgLy8g56Gu5L+d5LuO56ys5LiA5LiqIHsg5byA5aeLXHJcbiAgICAgIGNvbnN0IHN0YXJ0ID0gcy5pbmRleE9mKCd7Jyk7XHJcbiAgICAgIGlmIChzdGFydCA9PT0gLTEpIHJldHVybiBudWxsO1xyXG4gICAgICBzID0gcy5zdWJzdHJpbmcoc3RhcnQpO1xyXG5cclxuICAgICAgLy8g5om+5Yiw5pyA5ZCO5LiA5Liq5a6M5pW055qEIHNlZ21lbnQg5a+56LGh55qE57uT5bC+XHJcbiAgICAgIC8vIOetlueVpe+8muS7juWQjuWQkeWJjeaJviBcInN1bW1hcnlcIjogXCIuLi5cIiDmqKHlvI/vvIzlpoLmnpzmib7liLDkuIDkuKrooqvlvJXlj7fljIXoo7nnmoTlgLxcclxuICAgICAgLy8g5ZCO6Z2i5Y+v6IO96LefIH0g5oiWICwg6KGo56S65a+56LGh57uT5p2fXHJcblxyXG4gICAgICAvLyDmib7liLDmnIDlkI7kuIDkuKrlrozmlbTnmoQgfSDvvIhzZWdtZW50IOWvueixoeeahOmXreWQiO+8iVxyXG4gICAgICBsZXQgbGFzdENvbXBsZXRlT2JqRW5kID0gLTE7XHJcbiAgICAgIGxldCBicmFjZURlcHRoID0gMDtcclxuICAgICAgbGV0IGluU3RyaW5nID0gZmFsc2U7XHJcbiAgICAgIGxldCBlc2NhcGUgPSBmYWxzZTtcclxuXHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoID0gc1tpXTtcclxuICAgICAgICBpZiAoZXNjYXBlKSB7XHJcbiAgICAgICAgICBlc2NhcGUgPSBmYWxzZTtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2ggPT09ICdcXFxcJyAmJiBpblN0cmluZykge1xyXG4gICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoY2ggPT09ICdcIicpIHtcclxuICAgICAgICAgIGluU3RyaW5nID0gIWluU3RyaW5nO1xyXG4gICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpblN0cmluZykgY29udGludWU7XHJcblxyXG4gICAgICAgIGlmIChjaCA9PT0gJ3snKSBicmFjZURlcHRoKys7XHJcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09ICd9Jykge1xyXG4gICAgICAgICAgYnJhY2VEZXB0aC0tO1xyXG4gICAgICAgICAgLy8gYnJhY2VEZXB0aCA9PSAxIOihqOekuui/meaYryBzZWdtZW50cyDmlbDnu4Tph4znmoTkuIDkuKrlr7nosaHpl63lkIhcclxuICAgICAgICAgIGlmIChicmFjZURlcHRoID09PSAxKSB7XHJcbiAgICAgICAgICAgIGxhc3RDb21wbGV0ZU9iakVuZCA9IGk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAobGFzdENvbXBsZXRlT2JqRW5kID09PSAtMSkge1xyXG4gICAgICAgIC8vIOWPr+iDvei/nuesrOS4gOS4quWvueixoemDveayoeWGmeWujO+8jOWwneivleS/ruWkjeWNleS4quWvueixoVxyXG4gICAgICAgIC8vIOWwneivleWcqOWtl+espuS4suWAvOS4remXtOaIquaWreeahOaDheWGte+8muihpeWFqOW8leWPt+WSjOaLrOWPt1xyXG4gICAgICAgIC8vIOWFiOeUqCBzYW5pdGl6ZSDlpITnkIZcclxuICAgICAgICBjb25zdCBzYW5pdGl6ZWQgPSBzYW5pdGl6ZUpzb25TdHJpbmcocyk7XHJcblxyXG4gICAgICAgIC8vIOWwneivleaJvuWIsOacgOWQjuS4gOS4quWujOaVtOeahOmUruWAvOWvuVxyXG4gICAgICAgIC8vIOaooeW8jzogXCJrZXlcIjogXCJ2YWx1ZVwiIOWFtuS4rSB2YWx1ZSDlj6/og73ooqvmiKrmlq1cclxuICAgICAgICAvLyDnrZbnlaXvvJrmib7liLDmnIDlkI7kuIDkuKogXCJzdW1tYXJ5XCI6IFwiIOeahOS9jee9ru+8jOeEtuWQjuS7jumCo+mHjOW+gOWQjuaJvlxyXG4gICAgICAgIC8vIOWmguaenOWQjumdouayoeaciemXreWQiOeahCBcIu+8jOivtOaYjiBzdW1tYXJ5IOeahOWAvOiiq+aIquaWreS6hlxyXG4gICAgICAgIGNvbnN0IHN1bW1hcnlNYXRjaCA9IHNhbml0aXplZC5tYXRjaCgvXCJzdW1tYXJ5XCJcXHMqOlxccypcIi9nKTtcclxuICAgICAgICBpZiAoIXN1bW1hcnlNYXRjaCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIC8vIOaJvuacgOWQjuS4gOS4qiBzdW1tYXJ5IOmUrueahOS9jee9rlxyXG4gICAgICAgIGxldCBsYXN0U3VtbWFyeUlkeCA9IC0xO1xyXG4gICAgICAgIGxldCBzZWFyY2hJZHggPSAwO1xyXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XHJcbiAgICAgICAgICBjb25zdCBpZHggPSBzYW5pdGl6ZWQuaW5kZXhPZignXCJzdW1tYXJ5XCInLCBzZWFyY2hJZHgpO1xyXG4gICAgICAgICAgaWYgKGlkeCA9PT0gLTEpIGJyZWFrO1xyXG4gICAgICAgICAgbGFzdFN1bW1hcnlJZHggPSBpZHg7XHJcbiAgICAgICAgICBzZWFyY2hJZHggPSBpZHggKyAxO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGxhc3RTdW1tYXJ5SWR4ID09PSAtMSkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgICAgIC8vIOS7jiBzdW1tYXJ5IOmUruW8gOWni+W+gOWQjuaJvuW8leWPt1xyXG4gICAgICAgIGNvbnN0IGFmdGVyU3VtbWFyeSA9IHNhbml0aXplZC5zdWJzdHJpbmcobGFzdFN1bW1hcnlJZHgpO1xyXG4gICAgICAgIGNvbnN0IGNvbG9uSWR4ID0gYWZ0ZXJTdW1tYXJ5LmluZGV4T2YoJzonKTtcclxuICAgICAgICBpZiAoY29sb25JZHggPT09IC0xKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3QgdmFsdWVTdGFydCA9IGNvbG9uSWR4ICsgMTtcclxuICAgICAgICAvLyDmib7liLAgdmFsdWUg55qE5byA5aeL5byV5Y+3XHJcbiAgICAgICAgbGV0IHZhbHVlUXVvdGVTdGFydCA9IC0xO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSB2YWx1ZVN0YXJ0OyBpIDwgYWZ0ZXJTdW1tYXJ5Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBpZiAoYWZ0ZXJTdW1tYXJ5W2ldID09PSAnXCInKSB7XHJcbiAgICAgICAgICAgIHZhbHVlUXVvdGVTdGFydCA9IGk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKGFmdGVyU3VtbWFyeVtpXSAhPT0gJyAnICYmIGFmdGVyU3VtbWFyeVtpXSAhPT0gJ1xcdCcgJiYgYWZ0ZXJTdW1tYXJ5W2ldICE9PSAnXFxuJyAmJiBhZnRlclN1bW1hcnlbaV0gIT09ICdcXHInKSB7XHJcbiAgICAgICAgICAgIC8vIOS4jeaYr+epuueZveS5n+S4jeaYr+W8leWPt++8jOWPr+iDveS4jeaYr+Wtl+espuS4suWAvFxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh2YWx1ZVF1b3RlU3RhcnQgPT09IC0xKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgLy8g5LuOIHZhbHVlIOW8gOWni+W8leWPt+W+gOWQju+8jOaJvuaYr+WQpuaciemXreWQiOW8leWPt1xyXG4gICAgICAgIGNvbnN0IHZhbHVlQ29udGVudCA9IGFmdGVyU3VtbWFyeS5zdWJzdHJpbmcodmFsdWVRdW90ZVN0YXJ0ICsgMSk7XHJcbiAgICAgICAgLy8g5p+l5om+5pyq6L2s5LmJ55qE6Zet5ZCI5byV5Y+3XHJcbiAgICAgICAgbGV0IGNsb3NpbmdRdW90ZUlkeCA9IC0xO1xyXG4gICAgICAgIGxldCBlc2MgPSBmYWxzZTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlQ29udGVudC5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgaWYgKGVzYykgeyBlc2MgPSBmYWxzZTsgY29udGludWU7IH1cclxuICAgICAgICAgIGlmICh2YWx1ZUNvbnRlbnRbaV0gPT09ICdcXFxcJykgeyBlc2MgPSB0cnVlOyBjb250aW51ZTsgfVxyXG4gICAgICAgICAgaWYgKHZhbHVlQ29udGVudFtpXSA9PT0gJ1wiJykgeyBjbG9zaW5nUXVvdGVJZHggPSBpOyBicmVhazsgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGNsb3NpbmdRdW90ZUlkeCAhPT0gLTEpIHtcclxuICAgICAgICAgIC8vIHN1bW1hcnkg5YC85pyJ6Zet5ZCI5byV5Y+377yM5L2G5pW05L2TIEpTT04g5Y+v6IO957y65bCR5ZCO57ut5YaF5a65XHJcbiAgICAgICAgICAvLyDmiKrlj5bliLDov5nph4znhLblkI7ooaXlhahcclxuICAgICAgICAgIGNvbnN0IGN1dFBvcyA9IGxhc3RTdW1tYXJ5SWR4ICsgdmFsdWVRdW90ZVN0YXJ0ICsgMSArIGNsb3NpbmdRdW90ZUlkeCArIDE7XHJcbiAgICAgICAgICBzID0gc2FuaXRpemVkLnN1YnN0cmluZygwLCBjdXRQb3MpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAvLyBzdW1tYXJ5IOWAvOiiq+aIquaWre+8muihpeS4gOS4qumXreWQiOW8leWPt1xyXG4gICAgICAgICAgY29uc3QgY3V0UG9zID0gbGFzdFN1bW1hcnlJZHggKyB2YWx1ZVF1b3RlU3RhcnQgKyAxO1xyXG4gICAgICAgICAgcyA9IHNhbml0aXplZC5zdWJzdHJpbmcoMCwgY3V0UG9zKSArICdcIic7ICAvLyDooaXlhajpl63lkIjlvJXlj7dcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIOihpeWFqOaLrOWPt1xyXG4gICAgICAgIC8vIOe7n+iuoemcgOimgeeahOmXreWQiOaLrOWPt1xyXG4gICAgICAgIGxldCBvcGVuQnJhY2VzID0gMCwgb3BlbkJyYWNrZXRzID0gMDtcclxuICAgICAgICBsZXQgaW5TdHIgPSBmYWxzZSwgZXNjMiA9IGZhbHNlO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgY29uc3QgY2ggPSBzW2ldO1xyXG4gICAgICAgICAgaWYgKGVzYzIpIHsgZXNjMiA9IGZhbHNlOyBjb250aW51ZTsgfVxyXG4gICAgICAgICAgaWYgKGNoID09PSAnXFxcXCcgJiYgaW5TdHIpIHsgZXNjMiA9IHRydWU7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgICBpZiAoY2ggPT09ICdcIicpIHsgaW5TdHIgPSAhaW5TdHI7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgICBpZiAoaW5TdHIpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgaWYgKGNoID09PSAneycpIG9wZW5CcmFjZXMrKztcclxuICAgICAgICAgIGVsc2UgaWYgKGNoID09PSAnfScpIG9wZW5CcmFjZXMtLTtcclxuICAgICAgICAgIGVsc2UgaWYgKGNoID09PSAnWycpIG9wZW5CcmFja2V0cysrO1xyXG4gICAgICAgICAgZWxzZSBpZiAoY2ggPT09ICddJykgb3BlbkJyYWNrZXRzLS07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyDooaXlhajnvLrlpLHnmoTpl63lkIjmi6zlj7dcclxuICAgICAgICBsZXQgY2xvc2luZyA9ICcnO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb3BlbkJyYWNrZXRzOyBpKyspIGNsb3NpbmcgKz0gJ10nO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb3BlbkJyYWNlczsgaSsrKSBjbG9zaW5nICs9ICd9JztcclxuICAgICAgICBzICs9IGNsb3Npbmc7XHJcblxyXG4gICAgICAgIC8vIOehruS/neacq+WwvuayoeacieWkmuS9meeahOmAl+WPt1xyXG4gICAgICAgIHMgPSBzLnJlcGxhY2UoLyxcXHMqKFt9XFxdXSkvZywgJyQxJyk7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHMpO1xyXG4gICAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQuc2VnbWVudHMgJiYgQXJyYXkuaXNBcnJheShyZXN1bHQuc2VnbWVudHMpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQuc2VnbWVudHMgYXMgQ2hhcHRlclN1bW1hcnlbXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8g5pyJ5a6M5pW055qE5a+56LGh77yM5LuO5pyA5ZCO5LiA5Liq5a6M5pW05a+56LGh5LmL5ZCO5oiq5patXHJcbiAgICAgIHMgPSBzLnN1YnN0cmluZygwLCBsYXN0Q29tcGxldGVPYmpFbmQgKyAxKTtcclxuXHJcbiAgICAgIC8vIOihpeWFqOmXreWQiOaLrOWPt1xyXG4gICAgICBsZXQgb3BlbkJyYWNlcyA9IDAsIG9wZW5CcmFja2V0cyA9IDA7XHJcbiAgICAgIGxldCBpblN0ciA9IGZhbHNlLCBlc2MzID0gZmFsc2U7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGNoID0gc1tpXTtcclxuICAgICAgICBpZiAoZXNjMykgeyBlc2MzID0gZmFsc2U7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgaWYgKGNoID09PSAnXFxcXCcgJiYgaW5TdHIpIHsgZXNjMyA9IHRydWU7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgaWYgKGNoID09PSAnXCInKSB7IGluU3RyID0gIWluU3RyOyBjb250aW51ZTsgfVxyXG4gICAgICAgIGlmIChpblN0cikgY29udGludWU7XHJcbiAgICAgICAgaWYgKGNoID09PSAneycpIG9wZW5CcmFjZXMrKztcclxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gJ30nKSBvcGVuQnJhY2VzLS07XHJcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09ICdbJykgb3BlbkJyYWNrZXRzKys7XHJcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09ICddJykgb3BlbkJyYWNrZXRzLS07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCBjbG9zaW5nID0gJyc7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgb3BlbkJyYWNrZXRzOyBpKyspIGNsb3NpbmcgKz0gJ10nO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9wZW5CcmFjZXM7IGkrKykgY2xvc2luZyArPSAnfSc7XHJcbiAgICAgIHMgKz0gY2xvc2luZztcclxuXHJcbiAgICAgIC8vIOa4heeQhuWkmuS9memAl+WPt1xyXG4gICAgICBzID0gcy5yZXBsYWNlKC8sXFxzKihbfVxcXV0pL2csICckMScpO1xyXG5cclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHMpO1xyXG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnNlZ21lbnRzICYmIEFycmF5LmlzQXJyYXkocmVzdWx0LnNlZ21lbnRzKSkge1xyXG4gICAgICAgICAgcmV0dXJuIHJlc3VsdC5zZWdtZW50cyBhcyBDaGFwdGVyU3VtbWFyeVtdO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XHJcbiAgICAgICAgICByZXR1cm4gcmVzdWx0IGFzIENoYXB0ZXJTdW1tYXJ5W107XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIPCfk50g5YiG6ZqU56ym5qC85byP6Kej5p6Q5ZmoXHJcbiAgICogXHJcbiAgICog6Kej5p6QIExMTSDkvb/nlKggPT09U0VHTUVOVD09PSAvID09PUVORD09PSAvID09PUxFRlRPVkVSPT09IOagh+iusOi+k+WHuueahOWGheWuueOAglxyXG4gICAqIOi/meenjeagvOW8j+S4jeS9v+eUqCBKU09O77yM5Zug5q2k5LiN5a2Y5Zyo5byV5Y+36L2s5LmJ44CB5Y+N5pac5p2g6L2s5LmJ562J6Zeu6aKY44CCXHJcbiAgICogXHJcbiAgICog5qC85byP56S65L6L77yaXHJcbiAgICogPT09U0VHTUVOVD09PVxyXG4gICAqIHRpbWVzdGFtcDogMDU6MzBcclxuICAgKiB0aXRsZTog5p6B6ZmQ55qE5a6a5LmJXHJcbiAgICogc3VtbWFyeTog6K+m57uG6K6w5b2VLi4uXHJcbiAgICogPT09RU5EPT09XHJcbiAgICogPT09U0VHTUVOVD09PVxyXG4gICAqIHRpbWVzdGFtcDogMTI6MDBcclxuICAgKiB0aXRsZTog5L6L6aKYMVxyXG4gICAqIHN1bW1hcnk6IOivpue7huiusOW9lS4uLlxyXG4gICAqID09PUVORD09PVxyXG4gICAqID09PUxFRlRPVkVSPT09XHJcbiAgICog6KKr5oiq5pat55qE5Y6f5aeL5paH5pysXHJcbiAgICogPT09RU5EPT09XHJcbiAgICogXHJcbiAgICogQHBhcmFtIGNvbnRlbnQgTExNIOWOn+Wni+WTjeW6lO+8iOe7j+i/hyBMYVRlWCDkv53miqTlkI7nmoTlhoXlrrnvvIlcclxuICAgKiBAcmV0dXJucyDop6PmnpDlh7rnmoQgc2VnbWVudHMg5pWw57uE44CBbGVmdG92ZXIg5a2X56ym5Liy5ZKMIG1ldGFEYXRhXHJcbiAgICovXHJcblxyXG4gIC8qKlxyXG4gICAqIOino+aekCA9PT1FWD09PXRpbWVzdGFtcHx0b3BpY3xtZXRob2Q9PT1FTkQ9PT0g5qC85byP55qE5L6L6aKY5pWw5o2uXHJcbiAgICovXHJcbiAgZnVuY3Rpb24gcGFyc2VFeGFtcGxlcyhyYXc6IHN0cmluZyk6IEV4YW1wbGVJdGVtW10ge1xyXG4gICAgY29uc3QgZXhhbXBsZXM6IEV4YW1wbGVJdGVtW10gPSBbXTtcclxuICAgIC8vIOWMuemFjSA9PT1FWD09PSDlhoXlrrkgPT09RU5EPT09IOaIliA9PT1FWD09PSDlhoXlrrnvvIjmnKrpl63lkIjvvIlcclxuICAgIC8vIOazqOaEj++8muS4jeS9v+eUqCBzIGZsYWcgKGRvdEFsbCnvvIzmlLnnlKggW1xcc1xcU10g5Luj5pu/XHJcbiAgICBjb25zdCBleFJlZ2V4ID0gLz17Myx9XFxzKkVYXFxzKj17Myx9XFxzKihbXFxzXFxTXSo/KSg/PT17Myx9XFxzKkVORFxccyo9ezMsfXwkKS9naTtcclxuICAgIGxldCBtYXRjaDtcclxuICAgIHdoaWxlICgobWF0Y2ggPSBleFJlZ2V4LmV4ZWMocmF3KSkgIT09IG51bGwpIHtcclxuICAgICAgY29uc3QgY29udGVudCA9IG1hdGNoWzFdLnRyaW0oKTtcclxuICAgICAgY29uc3QgcGFydHMgPSBjb250ZW50LnNwbGl0KCd8JykubWFwKHAgPT4gcC50cmltKCkpO1xyXG4gICAgICBpZiAocGFydHMubGVuZ3RoID49IDMpIHtcclxuICAgICAgICBleGFtcGxlcy5wdXNoKHtcclxuICAgICAgICAgIHRpbWVzdGFtcDogcGFydHNbMF0sXHJcbiAgICAgICAgICB0b3BpYzogcGFydHNbMV0sXHJcbiAgICAgICAgICBtZXRob2Q6IHBhcnRzLnNsaWNlKDIpLmpvaW4oJ3wnKSAgLy8gbWV0aG9kIOWPr+iDveWMheWQqyB8XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBleGFtcGxlcztcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIHBhcnNlU2VnbWVudEZvcm1hdChjb250ZW50OiBzdHJpbmcpOiB7IHNlZ21lbnRzOiBDaGFwdGVyU3VtbWFyeVtdOyBsZWZ0b3Zlcjogc3RyaW5nOyBtZXRhRGF0YTogTm90ZU1ldGFEYXRhIHwgbnVsbCB9IHtcclxuICAgIGNvbnN0IHNlZ21lbnRzOiBDaGFwdGVyU3VtbWFyeVtdID0gW107XHJcbiAgICBsZXQgbGVmdG92ZXIgPSBcIlwiO1xyXG4gICAgbGV0IG1ldGFEYXRhOiBOb3RlTWV0YURhdGEgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAvLyDmjInooYzliIblibLvvIzlrrnlv40gXFxyXFxuIOWSjCBcXG5cclxuICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xyXG4gICAgXHJcbiAgICBsZXQgY3VycmVudFN0YXRlOiAnbm9uZScgfCAnc2VnbWVudCcgfCAnbGVmdG92ZXInIHwgJ21ldGEnID0gJ25vbmUnO1xyXG4gICAgbGV0IGN1cnJlbnRGaWVsZHM6IFBhcnRpYWw8Q2hhcHRlclN1bW1hcnk+ID0ge307XHJcbiAgICBsZXQgY3VycmVudE11bHRpTGluZUZpZWxkOiBzdHJpbmcgfCBudWxsID0gbnVsbDsgIC8vIOW9k+WJjeato+WcqOaUtumbhueahOWkmuihjOWtl+auteWQjVxyXG4gICAgbGV0IGN1cnJlbnRNdWx0aUxpbmVWYWx1ZTogc3RyaW5nW10gPSBbXTsgIC8vIOWkmuihjOWtl+auteeahOe0r+enr+WAvFxyXG4gICAgbGV0IGN1cnJlbnRNZXRhRmllbGRzOiBQYXJ0aWFsPE5vdGVNZXRhRGF0YT4gPSB7fTtcclxuICAgIC8vIGtleV9wb2ludHMg5Li05pe25a2Y5YKo77ya5ZyoIHNlZ21lbnQg54q25oCB5LiL5pS26ZuGIC0g5byA5aS055qE6KaB54K56KGMXHJcbiAgICBsZXQgY3VycmVudEtleVBvaW50czogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICBjb25zdCBmbHVzaE11bHRpTGluZSA9ICgpID0+IHtcclxuICAgICAgLy8g5aaC5p6c5b2T5YmN5aSa6KGM5a2X5q615pivIGtleV9wb2ludHPvvIznibnmrorlpITnkIbkuLrmlbDnu4RcclxuICAgICAgaWYgKGN1cnJlbnRNdWx0aUxpbmVGaWVsZCA9PT0gJ2tleV9wb2ludHMnKSB7XHJcbiAgICAgICAgLy8ga2V5X3BvaW50cyDlt7Lnu4/lnKjpgJDooYzmlLbpm4bliLAgY3VycmVudEtleVBvaW50cyDkuK3kuobvvIzov5nph4zkuI3lgZogam9pblxyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG4gICAgICBpZiAoY3VycmVudE11bHRpTGluZUZpZWxkICYmIGN1cnJlbnRNdWx0aUxpbmVWYWx1ZS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgKGN1cnJlbnRGaWVsZHMgYXMgYW55KVtjdXJyZW50TXVsdGlMaW5lRmllbGRdID0gY3VycmVudE11bHRpTGluZVZhbHVlLmpvaW4oJ1xcbicpLnRyaW0oKTtcclxuICAgICAgfVxyXG4gICAgICBjdXJyZW50TXVsdGlMaW5lRmllbGQgPSBudWxsO1xyXG4gICAgICBjdXJyZW50TXVsdGlMaW5lVmFsdWUgPSBbXTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgZmx1c2hTZWdtZW50ID0gKCkgPT4ge1xyXG4gICAgICBmbHVzaE11bHRpTGluZSgpO1xyXG4gICAgICAvLyDlpoLmnpzmnInmlLbpm4bliLDnmoQga2V5X3BvaW50c++8jOiuvue9ruWIsOWtl+auteS4rVxyXG4gICAgICBpZiAoY3VycmVudEtleVBvaW50cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgY3VycmVudEZpZWxkcy5rZXlfcG9pbnRzID0gWy4uLmN1cnJlbnRLZXlQb2ludHNdO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChjdXJyZW50U3RhdGUgPT09ICdzZWdtZW50JyAmJiBjdXJyZW50RmllbGRzLnRpbWVzdGFtcCAmJiBjdXJyZW50RmllbGRzLnRpdGxlKSB7XHJcbiAgICAgICAgc2VnbWVudHMucHVzaCh7XHJcbiAgICAgICAgICB0aW1lc3RhbXA6IGN1cnJlbnRGaWVsZHMudGltZXN0YW1wLFxyXG4gICAgICAgICAgdGl0bGU6IGN1cnJlbnRGaWVsZHMudGl0bGUsXHJcbiAgICAgICAgICBzdW1tYXJ5OiBjdXJyZW50RmllbGRzLnN1bW1hcnkgfHwgXCJcIixcclxuICAgICAgICAgIGtleV9wb2ludHM6IGN1cnJlbnRGaWVsZHMua2V5X3BvaW50c1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGN1cnJlbnRGaWVsZHMgPSB7fTtcclxuICAgICAgY3VycmVudEtleVBvaW50cyA9IFtdO1xyXG4gICAgfTtcclxuXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcclxuICAgICAgY29uc3QgdHJpbW1lZExpbmUgPSBsaW5lLnRyaW0oKTtcclxuXHJcbiAgICAgIC8vIOajgOa1iyA9PT1TRUdNRU5UPT09IOW8gOWni+agh+iusFxyXG4gICAgICBpZiAoL149ezMsfVxccypTRUdNRU5UXFxzKj17Myx9L2kudGVzdCh0cmltbWVkTGluZSkpIHtcclxuICAgICAgICBmbHVzaFNlZ21lbnQoKTtcclxuICAgICAgICBjdXJyZW50U3RhdGUgPSAnc2VnbWVudCc7XHJcbiAgICAgICAgY3VycmVudEZpZWxkcyA9IHt9O1xyXG4gICAgICAgIGN1cnJlbnRNdWx0aUxpbmVGaWVsZCA9IG51bGw7XHJcbiAgICAgICAgY3VycmVudE11bHRpTGluZVZhbHVlID0gW107XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIOajgOa1iyA9PT1MRUZUT1ZFUj09PSDlvIDlp4vmoIforrBcclxuICAgICAgaWYgKC9ePXszLH1cXHMqTEVGVE9WRVJcXHMqPXszLH0vaS50ZXN0KHRyaW1tZWRMaW5lKSkge1xyXG4gICAgICAgIGZsdXNoU2VnbWVudCgpO1xyXG4gICAgICAgIGN1cnJlbnRTdGF0ZSA9ICdsZWZ0b3Zlcic7XHJcbiAgICAgICAgY3VycmVudE11bHRpTGluZUZpZWxkID0gJ2xlZnRvdmVyJztcclxuICAgICAgICBjdXJyZW50TXVsdGlMaW5lVmFsdWUgPSBbXTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8g5qOA5rWLID09PU1FVEE9PT0g5byA5aeL5qCH6K6wXHJcbiAgICAgIGlmICgvXj17Myx9XFxzKk1FVEFcXHMqPXszLH0vaS50ZXN0KHRyaW1tZWRMaW5lKSkge1xyXG4gICAgICAgIGZsdXNoU2VnbWVudCgpO1xyXG4gICAgICAgIGN1cnJlbnRTdGF0ZSA9ICdtZXRhJztcclxuICAgICAgICBjdXJyZW50TWV0YUZpZWxkcyA9IHt9O1xyXG4gICAgICAgIGN1cnJlbnRNdWx0aUxpbmVGaWVsZCA9IG51bGw7XHJcbiAgICAgICAgY3VycmVudE11bHRpTGluZVZhbHVlID0gW107XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIOajgOa1iyA9PT1FTkQ9PT0g57uT5p2f5qCH6K6wXHJcbiAgICAgIGlmICgvXj17Myx9XFxzKkVORFxccyo9ezMsfS9pLnRlc3QodHJpbW1lZExpbmUpKSB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ3NlZ21lbnQnKSB7XHJcbiAgICAgICAgICBmbHVzaFNlZ21lbnQoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ2xlZnRvdmVyJykge1xyXG4gICAgICAgICAgZmx1c2hNdWx0aUxpbmUoKTtcclxuICAgICAgICAgIGxlZnRvdmVyID0gY3VycmVudE11bHRpTGluZVZhbHVlLmpvaW4oJ1xcbicpLnRyaW0oKTtcclxuICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ21ldGEnKSB7XHJcbiAgICAgICAgICBmbHVzaE11bHRpTGluZSgpO1xyXG4gICAgICAgICAgLy8g5p6E5bu6IG1ldGFEYXRhXHJcbiAgICAgICAgICBtZXRhRGF0YSA9IHtcclxuICAgICAgICAgICAgZXhhbV9mb2N1czogKGN1cnJlbnRNZXRhRmllbGRzLmV4YW1fZm9jdXMgYXMgc3RyaW5nKSB8fCBcIlwiLFxyXG4gICAgICAgICAgICBlbXBoYXNpczogKCgpID0+IHtcclxuICAgICAgICAgICAgICBjb25zdCByYXcgPSAoKGN1cnJlbnRNZXRhRmllbGRzIGFzIGFueSkuZW1waGFzaXMgYXMgc3RyaW5nKSB8fCBcIlwiO1xyXG4gICAgICAgICAgICAgIHJldHVybiByYXcuc3BsaXQoJ3wnKS5tYXAoZSA9PiBlLnRyaW0oKSkuZmlsdGVyKGUgPT4gZS5sZW5ndGggPiAwKTtcclxuICAgICAgICAgICAgfSkoKSxcclxuICAgICAgICAgICAgZXhhbXBsZXM6IHBhcnNlRXhhbXBsZXMoKChjdXJyZW50TWV0YUZpZWxkcyBhcyBhbnkpLmV4YW1wbGVzIGFzIHN0cmluZykgfHwgXCJcIilcclxuICAgICAgICAgIH07XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TnSBb5YiG6ZqU56ym6Kej5p6QXSBNRVRBIOWdl+ino+aekOWujOaIkDogZXhhbV9mb2N1cz0ke21ldGFEYXRhLmV4YW1fZm9jdXMubGVuZ3RofeWtl+espiwgZW1waGFzaXM9JHttZXRhRGF0YS5lbXBoYXNpcy5sZW5ndGh95LiqLCBleGFtcGxlcz0ke21ldGFEYXRhLmV4YW1wbGVzLmxlbmd0aH3kuKpgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY3VycmVudFN0YXRlID0gJ25vbmUnO1xyXG4gICAgICAgIGN1cnJlbnRGaWVsZHMgPSB7fTtcclxuICAgICAgICBjdXJyZW50TXVsdGlMaW5lRmllbGQgPSBudWxsO1xyXG4gICAgICAgIGN1cnJlbnRNdWx0aUxpbmVWYWx1ZSA9IFtdO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyDlnKggc2VnbWVudCDnirbmgIHkuIvvvIzop6PmnpDlrZfmrrVcclxuICAgICAgaWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ3NlZ21lbnQnKSB7XHJcbiAgICAgICAgLy8g5qOA5rWLIFwia2V5X3BvaW50czpcIiDlrZfmrrXooYzvvIjnibnmrorlpITnkIbvvJrlkI7pnaLlj6/og73msqHmnInlgLzvvIznm7TmjqXlvIDlp4vmlLbpm4YgLSDooYzvvIlcclxuICAgICAgICBpZiAoL15rZXlfcG9pbnRzXFxzKjpcXHMqJC9pLnRlc3QobGluZS50cmltKCkpKSB7XHJcbiAgICAgICAgICBmbHVzaE11bHRpTGluZSgpO1xyXG4gICAgICAgICAgY3VycmVudE11bHRpTGluZUZpZWxkID0gJ2tleV9wb2ludHMnO1xyXG4gICAgICAgICAgY3VycmVudE11bHRpTGluZVZhbHVlID0gW107XHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8g5qOA5rWLIFwia2V5X3BvaW50czog5p+Q5YC8XCIg5qC85byP77yI5ZCM5LiA6KGM5pyJ5YC855qE5oOF5Ya177yJXHJcbiAgICAgICAgY29uc3Qga3BNYXRjaCA9IGxpbmUubWF0Y2goL15rZXlfcG9pbnRzXFxzKjpcXHMqKC4rKSQvaSk7XHJcbiAgICAgICAgaWYgKGtwTWF0Y2gpIHtcclxuICAgICAgICAgIGZsdXNoTXVsdGlMaW5lKCk7XHJcbiAgICAgICAgICBjdXJyZW50TXVsdGlMaW5lRmllbGQgPSAna2V5X3BvaW50cyc7XHJcbiAgICAgICAgICAvLyDlpoLmnpzlgLzku6UgLSDlvIDlpLTvvIzor7TmmI7mmK/nrKzkuIDkuKropoHngrlcclxuICAgICAgICAgIGlmIChrcE1hdGNoWzFdLnRyaW0oKS5zdGFydHNXaXRoKCctJykpIHtcclxuICAgICAgICAgICAgY29uc3QgcG9pbnQgPSBrcE1hdGNoWzFdLnRyaW0oKS5yZXBsYWNlKC9eWy0qK11cXHMqLywgJycpO1xyXG4gICAgICAgICAgICBpZiAocG9pbnQpIGN1cnJlbnRLZXlQb2ludHMucHVzaChwb2ludCk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyDljZXooYwga2V5X3BvaW50cyDlgLxcclxuICAgICAgICAgICAgY3VycmVudEtleVBvaW50cy5wdXNoKGtwTWF0Y2hbMV0udHJpbSgpKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g5qOA5rWL5LulIC0g5byA5aS055qE6KaB54K56KGM77yI5ZyoIGtleV9wb2ludHMg5a2X5q615LiK5LiL5paH5Lit77yJXHJcbiAgICAgICAgaWYgKGN1cnJlbnRNdWx0aUxpbmVGaWVsZCA9PT0gJ2tleV9wb2ludHMnKSB7XHJcbiAgICAgICAgICBjb25zdCBwb2ludE1hdGNoID0gbGluZS5tYXRjaCgvXlxccypbLSorXVxccysoLispJC8pO1xyXG4gICAgICAgICAgaWYgKHBvaW50TWF0Y2gpIHtcclxuICAgICAgICAgICAgLy8g6L+Z5piv5LiA5LiqIGtleV9wb2ludHMg6KaB54K56KGMXHJcbiAgICAgICAgICAgIGN1cnJlbnRLZXlQb2ludHMucHVzaChwb2ludE1hdGNoWzFdLnRyaW0oKSk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgLy8g5LiN5pivIC0g5byA5aS05L2G5Lmf5LiN5piv5a2X5q616KGMIOKGkiDlj6/og73mmK8ga2V5X3BvaW50cyDopoHngrnnmoTnu63ooYxcclxuICAgICAgICAgIGNvbnN0IGZpZWxkQ2hlY2sgPSBsaW5lLm1hdGNoKC9eKFxcdyspXFxzKjpcXHMqKC4qKSQvKTtcclxuICAgICAgICAgIGlmICghZmllbGRDaGVjayAmJiBsaW5lLnRyaW0oKSkge1xyXG4gICAgICAgICAgICAvLyDnu63ooYzvvJrov73liqDliLDmnIDlkI7kuIDkuKoga2V5X3BvaW50XHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50S2V5UG9pbnRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICBjdXJyZW50S2V5UG9pbnRzW2N1cnJlbnRLZXlQb2ludHMubGVuZ3RoIC0gMV0gKz0gJ1xcbicgKyBsaW5lLnRyaW0oKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIC8vIOWmguaenOaYr+aWsOeahOWtl+auteihjO+8jOato+W4uOi1sOS4i+mdoueahOmAu+i+kVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g5qOA5rWLIFwia2V5OiB2YWx1ZVwiIOagvOW8j+eahOWtl+auteihjFxyXG4gICAgICAgIGNvbnN0IGZpZWxkTWF0Y2ggPSBsaW5lLm1hdGNoKC9eKFxcdyspXFxzKjpcXHMqKC4qKSQvKTtcclxuICAgICAgICBpZiAoZmllbGRNYXRjaCkge1xyXG4gICAgICAgICAgLy8g5YWI5L+d5a2Y5LmL5YmN55qE5a2X5q61XHJcbiAgICAgICAgICBmbHVzaE11bHRpTGluZSgpO1xyXG4gICAgICAgICAgY29uc3Qga2V5ID0gZmllbGRNYXRjaFsxXS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBmaWVsZE1hdGNoWzJdO1xyXG4gICAgICAgICAgKGN1cnJlbnRGaWVsZHMgYXMgYW55KVtrZXldID0gdmFsdWU7XHJcbiAgICAgICAgICAvLyDorr7nva7lvZPliY3lpJrooYzlrZfmrrXvvIzlkI7nu63pnZ7lrZfmrrXooYzkvJrov73liqDliLDmraTlrZfmrrVcclxuICAgICAgICAgIGN1cnJlbnRNdWx0aUxpbmVGaWVsZCA9IGtleTtcclxuICAgICAgICAgIGN1cnJlbnRNdWx0aUxpbmVWYWx1ZSA9IFt2YWx1ZV07XHJcbiAgICAgICAgfSBlbHNlIGlmIChjdXJyZW50TXVsdGlMaW5lRmllbGQgJiYgY3VycmVudE11bHRpTGluZUZpZWxkICE9PSAna2V5X3BvaW50cycpIHtcclxuICAgICAgICAgIC8vIOi/meaYr+W9k+WJjeWtl+auteeahOe7reihjO+8iOWkmuihjOWAvO+8iVxyXG4gICAgICAgICAgY3VycmVudE11bHRpTGluZVZhbHVlLnB1c2gobGluZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyDlnKggbWV0YSDnirbmgIHkuIvvvIzop6PmnpAgZXhhbV9mb2N1c+OAgWVtcGhhc2lz44CBZXhhbXBsZXMg5a2X5q61XHJcbiAgICAgIGlmIChjdXJyZW50U3RhdGUgPT09ICdtZXRhJykge1xyXG4gICAgICAgIC8vIOajgOa1iyA9PT1FWD09PSDkvovpopjlrZDmoIforrBcclxuICAgICAgICBpZiAoL149ezMsfVxccypFWFxccyo9ezMsfS9pLnRlc3QodHJpbW1lZExpbmUpKSB7XHJcbiAgICAgICAgICBmbHVzaE11bHRpTGluZSgpO1xyXG4gICAgICAgICAgY3VycmVudE11bHRpTGluZUZpZWxkID0gJ2V4YW1wbGVzJztcclxuICAgICAgICAgIGN1cnJlbnRNdWx0aUxpbmVWYWx1ZSA9IFt0cmltbWVkTGluZV07XHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8g5qOA5rWLIFwia2V5OiB2YWx1ZVwiIOagvOW8j+eahOWtl+auteihjFxyXG4gICAgICAgIGNvbnN0IGZpZWxkTWF0Y2ggPSBsaW5lLm1hdGNoKC9eKFxcdyspXFxzKjpcXHMqKC4qKSQvKTtcclxuICAgICAgICBpZiAoZmllbGRNYXRjaCkge1xyXG4gICAgICAgICAgZmx1c2hNdWx0aUxpbmUoKTtcclxuICAgICAgICAgIGNvbnN0IGtleSA9IGZpZWxkTWF0Y2hbMV0udG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgIGNvbnN0IHZhbHVlID0gZmllbGRNYXRjaFsyXTtcclxuICAgICAgICAgIChjdXJyZW50TWV0YUZpZWxkcyBhcyBhbnkpW2tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgIGN1cnJlbnRNdWx0aUxpbmVGaWVsZCA9IGtleTtcclxuICAgICAgICAgIGN1cnJlbnRNdWx0aUxpbmVWYWx1ZSA9IFt2YWx1ZV07XHJcbiAgICAgICAgfSBlbHNlIGlmIChjdXJyZW50TXVsdGlMaW5lRmllbGQpIHtcclxuICAgICAgICAgIC8vIOe7reihjFxyXG4gICAgICAgICAgY3VycmVudE11bHRpTGluZVZhbHVlLnB1c2gobGluZSk7XHJcbiAgICAgICAgICAvLyDlkIzmraXmm7TmlrDliLAgY3VycmVudE1ldGFGaWVsZHNcclxuICAgICAgICAgIChjdXJyZW50TWV0YUZpZWxkcyBhcyBhbnkpW2N1cnJlbnRNdWx0aUxpbmVGaWVsZF0gPSBjdXJyZW50TXVsdGlMaW5lVmFsdWUuam9pbignXFxuJykudHJpbSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8g5ZyoIGxlZnRvdmVyIOeKtuaAgeS4i++8jOaJgOacieihjOmDveaYryBsZWZ0b3ZlciDlhoXlrrlcclxuICAgICAgaWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ2xlZnRvdmVyJykge1xyXG4gICAgICAgIGN1cnJlbnRNdWx0aUxpbmVWYWx1ZS5wdXNoKGxpbmUpO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8g5aSE55CG5pyq6Zet5ZCI55qE5pyA5ZCO5LiA5Liq5Z2X77yITExNIOi+k+WHuuiiq+aIquaWreaXtueahOWuuemUme+8iVxyXG4gICAgaWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ3NlZ21lbnQnKSB7XHJcbiAgICAgIC8vIOacgOWQjuS4gOS4qiBzZWdtZW50IOWPr+iDveayoeaciSA9PT1FTkQ9PT3vvIzlsJ3or5Xkv53lrZhcclxuICAgICAgZmx1c2hNdWx0aUxpbmUoKTtcclxuICAgICAgaWYgKGN1cnJlbnRLZXlQb2ludHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGN1cnJlbnRGaWVsZHMua2V5X3BvaW50cyA9IFsuLi5jdXJyZW50S2V5UG9pbnRzXTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoY3VycmVudEZpZWxkcy50aW1lc3RhbXAgJiYgY3VycmVudEZpZWxkcy50aXRsZSkge1xyXG4gICAgICAgIHNlZ21lbnRzLnB1c2goe1xyXG4gICAgICAgICAgdGltZXN0YW1wOiBjdXJyZW50RmllbGRzLnRpbWVzdGFtcCxcclxuICAgICAgICAgIHRpdGxlOiBjdXJyZW50RmllbGRzLnRpdGxlLFxyXG4gICAgICAgICAgc3VtbWFyeTogY3VycmVudEZpZWxkcy5zdW1tYXJ5IHx8IFwiXCIsXHJcbiAgICAgICAgICBrZXlfcG9pbnRzOiBjdXJyZW50RmllbGRzLmtleV9wb2ludHNcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+TnSBb5YiG6ZqU56ym6Kej5p6QXSDmnIDlkI7kuIDkuKogc2VnbWVudCDmnKrpl63lkIjvvIzlt7LmiqLmlZHkv53lrZhgKTtcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIGlmIChjdXJyZW50U3RhdGUgPT09ICdsZWZ0b3ZlcicpIHtcclxuICAgICAgbGVmdG92ZXIgPSBjdXJyZW50TXVsdGlMaW5lVmFsdWUuam9pbignXFxuJykudHJpbSgpO1xyXG4gICAgICBjb25zb2xlLmxvZyhg8J+TnSBb5YiG6ZqU56ym6Kej5p6QXSBsZWZ0b3ZlciDlnZfmnKrpl63lkIjvvIzlt7LmiqLmlZHkv53lrZggKOmVv+W6pjogJHtsZWZ0b3Zlci5sZW5ndGh9KWApO1xyXG4gICAgfSBlbHNlIGlmIChjdXJyZW50U3RhdGUgPT09ICdtZXRhJykge1xyXG4gICAgICBmbHVzaE11bHRpTGluZSgpO1xyXG4gICAgICBtZXRhRGF0YSA9IHtcclxuICAgICAgICBleGFtX2ZvY3VzOiAoY3VycmVudE1ldGFGaWVsZHMuZXhhbV9mb2N1cyBhcyBzdHJpbmcpIHx8IFwiXCIsXHJcbiAgICAgICAgZW1waGFzaXM6ICgoKSA9PiB7XHJcbiAgICAgICAgICBjb25zdCByYXcgPSAoKGN1cnJlbnRNZXRhRmllbGRzIGFzIGFueSkuZW1waGFzaXMgYXMgc3RyaW5nKSB8fCBcIlwiO1xyXG4gICAgICAgICAgcmV0dXJuIHJhdy5zcGxpdCgnfCcpLm1hcChlID0+IGUudHJpbSgpKS5maWx0ZXIoZSA9PiBlLmxlbmd0aCA+IDApO1xyXG4gICAgICAgIH0pKCksXHJcbiAgICAgICAgZXhhbXBsZXM6IHBhcnNlRXhhbXBsZXMoKChjdXJyZW50TWV0YUZpZWxkcyBhcyBhbnkpLmV4YW1wbGVzIGFzIHN0cmluZykgfHwgXCJcIilcclxuICAgICAgfTtcclxuICAgICAgY29uc29sZS5sb2coYPCfk50gW+WIhumalOespuino+aekF0gTUVUQSDlnZfmnKrpl63lkIjvvIzlt7LmiqLmlZHkv53lrZhgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4geyBzZWdtZW50cywgbGVmdG92ZXIsIG1ldGFEYXRhIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiDwn5SBIE9wZW5Db2RlIFY0IOivt+axguW4puiHquWKqOmHjeivlVxyXG4gICAqIOS7heWcqOecn+ato+e9kee7nOmUmeivr+aXtumHjeivle+8iEVSUl9DT05ORUNUSU9OX1JFU0VUIC8gQ0xPU0VEIC8gUkVGVVNFRCAvIEVDT05OUkVTRVQg562J77yJXHJcbiAgICog6LaF5pe25LiA5b6L5LiN6YeN6K+V77yM5ZCR5LiK5oqb6ZSZXHJcbiAgICog5pyA5aSa6YeN6K+VIDIg5qyh77yI5YWxIDMg5qyh5bCd6K+V77yJ77yMcmVhc29uaW5nX2VmZm9ydCDlp4vnu4jkv53mjIHljp/lp4vlgLxcclxuICAgKi9cclxuICBhc3luYyBmdW5jdGlvbiByZXF1ZXN0T3BlbkNvZGVWNFdpdGhSZXRyeShcclxuICAgIHByb3ZpZGVyOiB7IEJBU0VfVVJMOiBzdHJpbmc7IEFQSV9LRVk/OiBzdHJpbmcgfSxcclxuICAgIGJvZHk6IFJlY29yZDxzdHJpbmcsIGFueT4sXHJcbiAgICBmYWxsYmFja0FwaUtleT86IHN0cmluZyxcclxuICAgIHRpbWVvdXRNczogbnVtYmVyID0gMV84MDBfMDAwXHJcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IG1heFJldHJpZXMgPSAyO1xyXG4gICAgY29uc3QgZGVsYXlzID0gWzIwMDAsIDUwMDBdOyAvLyDmjIfmlbDpgIDpgb/vvJoyIOenkiwgNSDnp5JcclxuXHJcbiAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8PSBtYXhSZXRyaWVzOyBhdHRlbXB0KyspIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3REaXJlY3Qoe1xyXG4gICAgICAgICAgdXJsOiBwcm92aWRlci5CQVNFX1VSTCxcclxuICAgICAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtwcm92aWRlci5BUElfS0VZIHx8IGZhbGxiYWNrQXBpS2V5IHx8ICcnfWBcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShib2R5KSxcclxuICAgICAgICAgIHRpbWVvdXRNc1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyDwn5SNIOiwg+ivle+8muaJk+WNsCBIVFRQIOeKtuaAgeeggeWSjOWOn+Wni+WTjeW6lOaWh+acrO+8iOaIquaWre+8ie+8jOW4ruWKqeWumuS9jeepuuWTjeW6lOmXrumimFxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5OKIFtMTE1dIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9IHwgcmVzcG9uc2UudGV4dCDplb/luqY6ICR7cmVzcG9uc2UudGV4dC5sZW5ndGh9IHwg5YmNNTAw5a2X56ymOiAke3Jlc3BvbnNlLnRleHQuc2xpY2UoMCwgNTAwKX1gKTtcclxuXHJcbiAgICAgICAgLy8g5qOA5p+lIEhUVFAg54q25oCB56CB77yM6Z2eIDIwMCDnm7TmjqXmiqXplJlcclxuICAgICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzIDwgMjAwIHx8IHJlc3BvbnNlLnN0YXR1cyA+PSAzMDApIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBbTExNXSBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfSDplJnor6/vvIzljp/lp4vlk43lupQ6ICR7cmVzcG9uc2UudGV4dC5zbGljZSgwLCAxMDAwKX1gKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7cmVzcG9uc2UudGV4dC5zbGljZSgwLCAyMDApfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8g5qOA5p+lIHJlc3BvbnNlLmpzb24g5piv5ZCm5pyJ5pWIXHJcbiAgICAgICAgaWYgKCFyZXNwb25zZS5qc29uIHx8IHR5cGVvZiByZXNwb25zZS5qc29uICE9PSAnb2JqZWN0Jykge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIFtMTE1dIOWTjeW6lOS4jeaYr+acieaViCBKU09O77yM5Y6f5aeL5paH5pysOiAke3Jlc3BvbnNlLnRleHQuc2xpY2UoMCwgNTAwKX1gKTtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihg5ZON5bqU5LiN5piv5pyJ5pWIIEpTT046ICR7cmVzcG9uc2UudGV4dC5zbGljZSgwLCAyMDApfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IHJlc3BvbnNlLmpzb24uY2hvaWNlcz8uWzBdPy5tZXNzYWdlID8/IHt9O1xyXG4gICAgICAgIGNvbnN0IHJhd0NvbnRlbnQgPSB0eXBlb2YgbWVzc2FnZS5jb250ZW50ID09PSAnc3RyaW5nJyA/IG1lc3NhZ2UuY29udGVudCA6ICcnO1xyXG4gICAgICAgIGNvbnN0IHJhd1JlYXNvbmluZyA9XHJcbiAgICAgICAgICAodHlwZW9mIG1lc3NhZ2UucmVhc29uaW5nX2NvbnRlbnQgPT09ICdzdHJpbmcnID8gbWVzc2FnZS5yZWFzb25pbmdfY29udGVudCA6ICcnKSB8fFxyXG4gICAgICAgICAgKHR5cGVvZiBtZXNzYWdlLnJlYXNvbmluZyA9PT0gJ3N0cmluZycgPyBtZXNzYWdlLnJlYXNvbmluZyA6ICcnKTtcclxuXHJcbiAgICAgICAgLy8gY29udGVudCDmnInlgLzlsLHnm7TmjqXnlKjvvJvlkKbliJnlm57pgIAgcmVhc29uaW5nX2NvbnRlbnQgLyByZWFzb25pbmdcclxuICAgICAgICBpZiAocmF3Q29udGVudCAmJiByYXdDb250ZW50LnRyaW0oKSAhPT0gJycpIHtcclxuICAgICAgICAgIHJldHVybiByYXdDb250ZW50O1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAocmF3UmVhc29uaW5nICYmIHJhd1JlYXNvbmluZy50cmltKCkgIT09ICcnKSB7XHJcbiAgICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBjb250ZW50IOWtl+auteS4uuepuu+8jOWbnumAgOS9v+eUqCByZWFzb25pbmcg5a2X5q6177yI6ZW/5bqmOiAke3Jhd1JlYXNvbmluZy5sZW5ndGh977yJYCk7XHJcbiAgICAgICAgICByZXR1cm4gcmF3UmVhc29uaW5nO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyDkuKTkuKrlrZfmrrXpg73kuLrnqbrvvIzov5Tlm57nqbrlrZfnrKbkuLLvvIjkuIrlsYLkvJrliKTlrprkuLrnqbrmlbDmja7vvIlcclxuICAgICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyByZXNwb25zZSBjb250ZW50IOWSjCByZWFzb25pbmdfY29udGVudCDlnYfkuLrnqbrvvIzljp/lp4sgbWVzc2FnZTonLCBKU09OLnN0cmluZ2lmeShtZXNzYWdlKS5zbGljZSgwLCA1MDApKTtcclxuICAgICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyDlrozmlbQgcmVzcG9uc2UuanNvbiDnu5PmnoQ6JywgSlNPTi5zdHJpbmdpZnkocmVzcG9uc2UuanNvbikuc2xpY2UoMCwgMTAwMCkpO1xyXG4gICAgICAgIHJldHVybiAnJztcclxuICAgICAgfSBjYXRjaCAoZTogYW55KSB7XHJcbiAgICAgICAgY29uc3QgZXJyTXNnID0gZS5tZXNzYWdlIHx8IFN0cmluZyhlKTtcclxuICAgICAgICAvLyDku4Xor4bliKvnnJ/mraPnmoTnvZHnu5zmlq3ov57nsbvplJnor69cclxuICAgICAgICBjb25zdCBpc05ldHdvcmtFcnJvciA9XHJcbiAgICAgICAgICBlcnJNc2cuaW5jbHVkZXMoJ0VSUl9DT05ORUNUSU9OX1JFU0VUJykgfHxcclxuICAgICAgICAgIGVyck1zZy5pbmNsdWRlcygnRVJSX0NPTk5FQ1RJT05fQ0xPU0VEJykgfHxcclxuICAgICAgICAgIGVyck1zZy5pbmNsdWRlcygnRVJSX0NPTk5FQ1RJT05fUkVGVVNFRCcpIHx8XHJcbiAgICAgICAgICBlcnJNc2cuaW5jbHVkZXMoJ0VSUl9ORVRXT1JLX0NIQU5HRUQnKSB8fFxyXG4gICAgICAgICAgZXJyTXNnLmluY2x1ZGVzKCdGYWlsZWQgdG8gZmV0Y2gnKSB8fFxyXG4gICAgICAgICAgZXJyTXNnLmluY2x1ZGVzKCduZXQ6OkVSUl8nKSB8fFxyXG4gICAgICAgICAgZXJyTXNnLmluY2x1ZGVzKCdFQ09OTlJFU0VUJyk7XHJcblxyXG4gICAgICAgIGlmIChpc05ldHdvcmtFcnJvciAmJiBhdHRlbXB0IDwgbWF4UmV0cmllcykge1xyXG4gICAgICAgICAgY29uc3QgcmV0cnlDb3VudCA9IGF0dGVtcHQgKyAxO1xyXG4gICAgICAgICAgY29uc29sZS5sb2coYPCflIEgW09wZW5Db2RlLVY0XSDnvZHnu5zlvILluLjph43or5UgKOesrCAke3JldHJ5Q291bnR9LyR7bWF4UmV0cmllc30g5qyhKe+8jOmUmeivrzogJHtlcnJNc2d9YCk7XHJcbiAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXlzW2F0dGVtcHRdKSk7XHJcbiAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIOWMuuWIhuacgOe7iOWksei0peexu+Wei1xyXG4gICAgICAgIGlmIChpc05ldHdvcmtFcnJvcikge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIFtPcGVuQ29kZS1WNF0g572R57uc5byC5bi46YeN6K+VICR7bWF4UmV0cmllc30g5qyh5LuN5aSx6LSlOiAke2Vyck1zZ31gKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIFtPcGVuQ29kZS1WNF0g6K+35rGC5aSx6LSlOiAke2Vyck1zZ31gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhyb3cgZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIOS4jeS8muWIsOi+vui/memHjFxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdyZXF1ZXN0T3BlbkNvZGVWNFdpdGhSZXRyeTog6YeN6K+V6ICX5bC9Jyk7XHJcbiAgfVxyXG5cclxuICBleHBvcnQgaW50ZXJmYWNlIEJhdGNoU3VtbWFyeVJlc3VsdCB7XHJcbiAgICBjaGFwdGVyczogQ2hhcHRlclN1bW1hcnlbXTtcclxuICAgIGxlZnRvdmVyOiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDosIPnlKggTExNIEFQSSDojrflj5bmibnmrKHmkZjopoFcclxuICog5L2/55SoIHByb3ZpZGVySW5kZXgg5oyH5a6a55qEIExMTV9QUk9WSURFUlMg6YWN572u77yI5ZCrIEVYVFJBX0JPRFnvvIlcclxuICogQHBhcmFtIGN1cnJlbnRSYXcg5b2T5YmN5om55qyh55qE5Y6f5paHXHJcbiAqIEBwYXJhbSBoaXN0b3J5IOWOhuWPsuaRmOimge+8iOeUqOS6juS4iuS4i+aWh++8iVxyXG4gKiBAcGFyYW0gYmF0Y2hTdGFydFRpbWUg5om55qyh6LW35aeL5pe26Ze077yI56eS77yJXHJcbiAqIEBwYXJhbSBwcm92aWRlckluZGV4IOaMh+WumuS9v+eUqOeahCBwcm92aWRlciDntKLlvJXvvIjkv53nlZnlj4LmlbDlhbzlrrnmgKfvvIzlv73nlaXvvIzlp4vnu4jkvb/nlKggaWR4PTDvvIlcclxuICogQHBhcmFtIHRyeVNpbGljb25GbG93IOW3suW8g+eUqO+8iOS/neeVmeWPguaVsOWFvOWuueaAp++8iVxyXG4gKiBAcmV0dXJucyDljIXlkKvnq6DoioLmkZjopoHmlbDnu4TlkozmnKrmgLvnu5PmlofmnKznmoTlr7nosaFcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRCYXRjaFN1bW1hcnkoXHJcbiAgY3VycmVudFJhdzogc3RyaW5nLFxyXG4gIGhpc3Rvcnk6IHN0cmluZyxcclxuICBiYXRjaFN0YXJ0VGltZTogbnVtYmVyLFxyXG4gIHByb3ZpZGVySW5kZXg/OiBudW1iZXIsXHJcbiAgdHJ5U2lsaWNvbkZsb3c/OiBib29sZWFuXHJcbik6IFByb21pc2U8QmF0Y2hTdW1tYXJ5UmVzdWx0PiB7XHJcbiAgLy8g5L2/55So5Lyg5YWl55qEIHByb3ZpZGVySW5kZXjvvIjnvLrnnIHkuLogMO+8ie+8jOS4jeWGjeehrOe8lueggSBPcGVuQ29kZVxyXG4gIGNvbnN0IGlkeCA9ICh0eXBlb2YgcHJvdmlkZXJJbmRleCA9PT0gJ251bWJlcicgJiYgcHJvdmlkZXJJbmRleCA+PSAwICYmIHByb3ZpZGVySW5kZXggPCBMTE1fUFJPVklERVJTLmxlbmd0aCkgPyBwcm92aWRlckluZGV4IDogMDtcclxuICBjb25zdCBzZWxlY3RlZFByb3ZpZGVyID0gTExNX1BST1ZJREVSU1tpZHhdO1xyXG4gIGNvbnNvbGUubG9nKGDwn5SRIOS9v+eUqCAke3NlbGVjdGVkUHJvdmlkZXIuTkFNRX0gKG1vZGVsPSR7c2VsZWN0ZWRQcm92aWRlci5NT0RFTH0pYCk7XHJcbiAgcmV0dXJuIGF3YWl0IGdldEJhdGNoU3VtbWFyeUludGVybmFsKGN1cnJlbnRSYXcsIGhpc3RvcnksIGJhdGNoU3RhcnRUaW1lLCBpZHgsIGZhbHNlKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIOWGhemDqOWHveaVsO+8muS9v+eUqOaMh+WumiBwcm92aWRlciDntKLlvJXosIPnlKggQVBJXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBnZXRCYXRjaFN1bW1hcnlJbnRlcm5hbChcclxuICBjdXJyZW50UmF3OiBzdHJpbmcsXHJcbiAgaGlzdG9yeTogc3RyaW5nLFxyXG4gIGJhdGNoU3RhcnRUaW1lOiBudW1iZXIsXHJcbiAgcHJvdmlkZXJJbmRleDogbnVtYmVyLFxyXG4gIGZhbGxiYWNrVG9TZWNvbmQ6IGJvb2xlYW4gPSB0cnVlXHJcbik6IFByb21pc2U8QmF0Y2hTdW1tYXJ5UmVzdWx0PiB7XHJcbiAgICBjb25zdCBiYXRjaFN0YXJ0U3RyID0gZm9ybWF0VGltZShiYXRjaFN0YXJ0VGltZSk7XHJcbiAgICBcclxuICAgIGNvbnN0IHByb21wdCA9IGBcclxu55uu5qCH77ya5a+56L2s5YaZ5paH5pys6L+b6KGMKiror6bnu4bnmoTnn6Xor4bmj5Dlj5bkuI7or77loILljp/lp4vorrDlvZUqKueahOaVtOeQhu+8jOi+k+WHuuiAg+eglOiDjOivtee6p+eslOiusOOAglxyXG7ovpPlhaXvvJrov5nmmK/kuIDmrrXor77loILlvZXpn7PovazlhpnnmoTniYfmrrXvvIjku47nuqYgJHtiYXRjaFN0YXJ0U3RyfSDlvIDlp4vvvInjgIJcclxu6L6T5Ye677ya5L2/55So5Lul5LiL5qCH6K6w5qC85byP6L6T5Ye677yI5LiN6KaB6L6T5Ye6IEpTT07vvIzkuI3opoHkvb/nlKjlj43lvJXlj7fmiJbku6PnoIHlnZfvvInjgIJcclxuXHJcbiR7aGlzdG9yeSA/IGDliY3mg4Xmj5DopoHlj4LogIPvvJpcXG4ke2hpc3Rvcnkuc2xpY2UoLTIwMDApfVxcbi0tLWAgOiBcIlwifVxyXG5cclxuKirmoLjlv4PopoHmsYLvvIjmnoHkuLrph43opoHvvInvvJoqKlxyXG4xLiAqKuinkuiJsui9rOaNoioq77ya5L2g5LiN5YaN5piv5LiA5Liq5Y+q5YaZ5Yeg5Y+l5a6P6KeC5qaC5ous55qEXCLmgLvnu5PmnLrlmahcIu+8jOiAjOaYr+S4gOS9jSoq6K+m57uG44CB6LSf6LSj55qE5ZCs6K++56yU6K6w5ZGYKirjgILovpPlh7rnmoTmmK/nnIvlrozlsLHog73nm7TmjqXljrvog4zor7XlkozlgZrpopjnmoTpq5jlr4bluqbnn6Xor4bnrJTorrDjgIJcclxuMi4gKirnn6Xor4blsYLpnaLnmoTor6blsL3kuI7nlZnlrZgqKu+8muaVtOeQhuWHuui/meauteivnemHjOiAgeW4iOiusui/h+eahOavj+S4gOS4quWFt+S9k+efpeivhueCueOAgeavj+S4gOmBk+S+i+mimOeahOmimOaEj+OAgeWFt+S9k+eahOaOqOWvvOi/h+eoi+OAgeaYk+mUmeeCueWdkeeCueOAguS4jeiDvemBl+a8j+S7u+S9leS4k+S4muefpeivhuS/oeaBr+OAguS/neeVmeWujOaVtOeahOWumuS5ieOAgeadoeS7tuOAgemAgueUqOiMg+WbtO+8m+S/neeVmeaguOW/g+aOqOWvvOatpemqpOmTvu+8m+S/neeVmeaJgOacieWFrOW8j+WumueQhuOAglxyXG4zLiAqKumZjeWZqua1geawtOi0pioq77ya5YmU6ZmkXCLlkIzlrabku6znnIvpu5Hmnb9cIuOAgVwi5o6l5LiL5p2l5oiR5Lus6K6yXCLjgIFcIuWkp+WutuaHguS6huWQp1wi562J5q+r5peg5L+h5oGv6YeP55qE5Y+j6K+t5bqf6K+d77yM5oqK6ZW/56+H5aSn6K6655So6auY5a+G5bqm55qE56yU6K6w5L2T5qKz55CG5Ye65p2l44CCXHJcbjQuICoq57uT5p6E5YiH5YiGKirvvJrlpoLmnpzlnKjor6Xml7bmrrXlhoXovaznp7vkuoblhbfkvZPor53popjvvIjlpoLku45cIuS+i+mimDFcIuiusuWIsOS6hlwi5L6L6aKYMlwi77yM5oiW6L+b5YWl5LqG5paw55qE55+l6K+G54K55o6o5a+877yJ77yM5b+F6aG75oqK5a6D5Lus5YiH5YiG5oiQ5LiN5ZCM55qEIHNlZ21lbnRzIOiusOW9leWdl++8jOaXtumXtOaIs+imgeeyvuehruWvueW6lOOAglxyXG41LiAqKuWkhOeQhuaIquaWrSoq77yaKirlpoLmnpzmnIDlkI7kuIDpg6jliIblhoXlrrnooqvmiKrmlq3vvIjkvovlpoLor53lj6rorrLkuobkuIDljYrvvIzmiJbnn6Xor4bngrnmnKrorrLlrozvvInvvIzor7fkuI3opoHli4nlvLrmgLvnu5PlroPjgILlsIblhbbljp/lsIHkuI3liqjmlL7lnKggTEVGVE9WRVIg5qCH6K6w5Lit44CCKipcclxuXHJcbui+k+WHuuagvOW8j++8iOS4peagvOS9v+eUqOS7peS4i+ihjOmmluagh+iusO+8jOavj+ihjOS4gOS4quWtl+aute+8jOS4jeimgeS9v+eUqCBKU09O77yJ77yaXHJcbj09PVNFR01FTlQ9PT1cclxudGltZXN0YW1wOiBNTTpTU1xyXG50aXRsZTog5YW35L2T55+l6K+G5ZCNIOaIliDkvovpopjlkI1cclxua2V5X3BvaW50czpcclxuLSDopoHngrkx77yI5a6M5pW055qE5o6o5a+85q2l6aqk44CB5a6a5LmJ5p2h5Lu25oiW57uT6K6677yM5pyJ5Y+v5Lul5ou/5Y676IOM6K+155qE5a6e6LSo5YaF5a6577yJXHJcbi0g6KaB54K5MlxyXG4tIOimgeeCuTPvvIjmlbDph4/moLnmja7lhoXlrrnoh6rnhLblhrPlrprvvIzkuI3opoHlubLnmKrnmoTnn63lj6XvvIzkuZ/kuI3opoHlvLrooYzlh5HmlbDvvIlcclxuPT09RU5EPT09XHJcblxyXG7vvIjlj6/ku6XmnInlpJrkuKogPT09U0VHTUVOVD09PS4uLj09PUVORD09PSDlnZfvvIzmr4/kuKrlnZfku6PooajkuIDkuKrnn6Xor4bngrnvvIlcclxuXHJcbj09PUxFRlRPVkVSPT09XHJcbui/memHjOaUvuacq+Wwvuiiq+aIquaWreeahOWOn+Wni+i9rOWGmeeJh+aute+8iOWmguaenOWujOaVtOWImeeVmeepuu+8iVxyXG49PT1FTkQ9PT1cclxuXHJcbioq6YeN6KaB5o+Q56S6KirvvJrmlbDlrablhazlvI/lv4Xpobvkvb/nlKggTGFUZVgg6K+t5rOV77yM55So6KGM5YaFICQuLi4kIOWMheijueOAguS+i+Wmgu+8miR4ID0gXFxcXGZyYWN7LWIgXFxcXHBtIFxcXFxzcXJ0e2JeMi00YWN9fXsyYX0k44CBJFxcXFxpbnRfMF5cXFxcaW5mdHkgZV57LXheMn0gZHgk44CCXHJcblxyXG4jIyMg5b6F5o+Q5Y+W6K++5aCC54mH5q61XHJcbiR7Y3VycmVudFJhd30gXHJcbmA7XHJcblxyXG4gICAgLy8g5L2/55SoIExMTV9QUk9WSURFUlNbMF3vvIjorr7nva7lkIzmraXlhaXlj6PvvInvvJtyZWFzb25pbmdfZWZmb3J0IC8gdGhpbmtpbmcg55SxIEVYVFJBX0JPRFkg5bGV5byAXHJcbiAgICBjb25zdCBwcm92aWRlciA9IExMTV9QUk9WSURFUlNbcHJvdmlkZXJJbmRleF07XHJcbiAgICBjb25zdCBwcm92aWRlck5hbWUgPSBwcm92aWRlci5OQU1FO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBib2R5OiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge1xyXG4gICAgICAgIG1vZGVsOiBwcm92aWRlci5NT0RFTCxcclxuICAgICAgICBtZXNzYWdlczogW1xyXG4gICAgICAgICAgeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBcIllvdSBhcmUgYSBwcm9mZXNzaW9uYWwgbGVjdHVyZSBub3RlLXRha2VyLiBZb3VyIHRhc2sgaXMgdG8gZXh0cmFjdCBkZXRhaWxlZCBrbm93bGVkZ2UgcG9pbnRzIGZyb20gY2xhc3Nyb29tIHRyYW5zY3JpcHRzIGFuZCBvcmdhbml6ZSB0aGVtIGludG8gc3RydWN0dXJlZCBub3Rlcy4g6L6T5Ye66KaB5rGC77yaMS4g5q+P5Liq55+l6K+G54K56YO96KaB6K+m57uG6K6w5b2V5o6o5a+86L+H56iL44CB5a6a5LmJ5p2h5Lu244CB5YWz6ZSu57uT6K6677yM5LiN6IO96YGX5ryP5Lu75L2V5LiT5Lia55+l6K+G5L+h5oGv77ybMi4ga2V5X3BvaW50cyDopoHmnInlj6/ku6Xmi7/ljrvog4zor7XnmoTlrp7otKjlhoXlrrnvvIzkuI3opoHlj6rlhpnmpoLmi6zmgKfmj4/ov7DvvJszLiDmlbDlrablhazlvI/kvb/nlKggTGFUZVgg6K+t5rOV55SoICQuLi4kIOWMheijue+8mzQuIOS9v+eUqOS4reaWh+i+k+WHuu+8jOS4k+S4muacr+ivreWPr+S/neeVmeiLseaWh+OAguS4jeimgei+k+WHuiBKU09O77yM5L2/55SoID09PVNFR01FTlQ9PT0g5qCH6K6w5qC85byP44CCXCIgfSxcclxuICAgICAgICAgIHsgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHByb21wdCB9XHJcbiAgICAgICAgXSxcclxuICAgICAgICBzdHJlYW06IGZhbHNlLFxyXG4gICAgICAgIHRlbXBlcmF0dXJlOiAwLjEsXHJcbiAgICAgICAgbWF4X3Rva2VuczogNjU1MzYsICAvLyDmmL7lvI/orr7nva7otrPlpJ/lpKfnmoTovpPlh7rnqbrpl7TvvIzpmLLmraIgSlNPTiDooqvmiKrmlq1cclxuICAgICAgICAuLi4ocHJvdmlkZXIuRVhUUkFfQk9EWSB8fCB7fSlcclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIPCflIEg5L2/55So5bim6YeN6K+VK+mZjee6p+eahOivt+axguWHveaVsFxyXG4gICAgICBsZXQgY29udGVudCA9IGF3YWl0IHJlcXVlc3RPcGVuQ29kZVY0V2l0aFJldHJ5KHByb3ZpZGVyLCBib2R5LCBMTE1fQ09ORklHLkFQSV9LRVkpO1xyXG5cclxuICAgICAgLy8g8J+UjSDml6Xlv5fvvJrorrDlvZUgTExNIOWOn+Wni+WTjeW6lOeahOWFs+mUrueJueW+ge+8jOeUqOS6juiviuaWrVxyXG4gICAgICBjb25zb2xlLmxvZyhg8J+TnSBbTExN6K+K5patXSDljp/lp4vlk43lupTplb/luqY6ICR7Y29udGVudC5sZW5ndGh9IOWtl+espiB8IOWJjTEwMOWtl+espjogJHtjb250ZW50LnNsaWNlKDAsIDEwMCl9IHwg5ZCOMTAw5a2X56ymOiAke2NvbnRlbnQuc2xpY2UoLTEwMCl9YCk7XHJcblxyXG4gICAgICAvLyDljrvmjonmgJ3ogIPov4fnqItcclxuICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZSgvPHRoaW5rPltcXHNcXFNdKj88XFwvdGhpbms+L2csICcnKS50cmltKCk7XHJcblxyXG4gICAgICAvLyDwn5uh77iPIOS9v+eUqCBMYVRlWCDkv53miqTlmajlpITnkIblhoXlrrlcclxuICAgICAgY29uc3QgbGF0ZXhQcm90ZWN0ID0gbmV3IExhdGV4UHJvdGVjdCgpO1xyXG4gICAgICBjb25zdCBwcm90ZWN0ZWRDb250ZW50ID0gbGF0ZXhQcm90ZWN0LnByb3RlY3QoY29udGVudCk7XHJcblxyXG4gICAgICAvLyDwn5OdIOS9v+eUqOWIhumalOespuagvOW8j+ino+aekO+8iOS4jeWGjeS9v+eUqCBKU09O77yJXHJcbiAgICAgIGNvbnN0IHBhcnNlUmVzdWx0ID0gcGFyc2VTZWdtZW50Rm9ybWF0KHByb3RlY3RlZENvbnRlbnQpO1xyXG4gICAgICBsZXQgcGFyc2VkOiBDaGFwdGVyU3VtbWFyeVtdID0gcGFyc2VSZXN1bHQuc2VnbWVudHM7XHJcbiAgICAgIGxldCBsZWZ0b3ZlciA9IHBhcnNlUmVzdWx0LmxlZnRvdmVyO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coYPCfk50gW0xMTeino+aekF0g5YiG6ZqU56ym5qC85byP6Kej5p6Q57uT5p6cOiAke3BhcnNlZC5sZW5ndGh9IOS4qiBzZWdtZW50cywgbGVmdG92ZXIg6ZW/5bqmOiAke2xlZnRvdmVyLmxlbmd0aH1gKTtcclxuXHJcbiAgICAgIC8vIPCfm6HvuI8g6L+Y5Y6fIExhVGVYIOWFrOW8j+S4reeahOWNoOS9jeespu+8jOW5tuS/ruWkjeWPjOWPjeaWnOadoOmXrumimFxyXG4gICAgICBpZiAocGFyc2VkLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBwYXJzZWQgPSBwYXJzZWQubWFwKGl0ZW0gPT4ge1xyXG4gICAgICAgICAgY29uc3QgcmVzdG9yZWQgPSBsYXRleFByb3RlY3QucmVzdG9yZUFuZEZpeEZpZWxkcyhpdGVtLCBbJ3RpdGxlJywgJ3N1bW1hcnknXSk7XHJcbiAgICAgICAgICAvLyDov5jljp8ga2V5X3BvaW50cyDkuK3nmoQgTGFUZVgg5Y2g5L2N56ymXHJcbiAgICAgICAgICBpZiAocmVzdG9yZWQua2V5X3BvaW50cyAmJiByZXN0b3JlZC5rZXlfcG9pbnRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgcmVzdG9yZWQua2V5X3BvaW50cyA9IHJlc3RvcmVkLmtleV9wb2ludHMubWFwKGtwID0+IGxhdGV4UHJvdGVjdC5yZXN0b3JlQW5kRml4KGtwKSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICByZXR1cm4gcmVzdG9yZWQ7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWYgKGxlZnRvdmVyKSB7XHJcbiAgICAgICAgICBsZWZ0b3ZlciA9IGxhdGV4UHJvdGVjdC5yZXN0b3JlQW5kRml4KGxlZnRvdmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGF0ZXhQcm90ZWN0LnJlc2V0KCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIPCfm6HvuI8g5Lil5qC85qOA5p+lIEFJIOi/lOWbnuaVsOaNruaYr+WQpuS4uuepulxyXG4gICAgICBpZiAoIXBhcnNlZCB8fCBwYXJzZWQubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIFske3Byb3ZpZGVyTmFtZX1dIEFJIOi/lOWbnuepuuaVsOaNriAocGFyc2VkIOS4uuepuilgKTtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwg5Y6f5aeL5ZON5bqU5YaF5a6577yI5YmNNTAw5a2X56ym77yJOiAke2NvbnRlbnQuc2xpY2UoMCwgNTAwKX1gKTtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwg5Y6f5aeL5ZON5bqU5YaF5a6577yI5ZCONTAw5a2X56ym77yJOiAke2NvbnRlbnQuc2xpY2UoLTUwMCl9YCk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBSSDov5Tlm57nqbrmlbDmja5gKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8g5oiQ5Yqf6I635Y+W5pWw5o2u77yM6L+U5Zue57uT5p6cXHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgWyR7cHJvdmlkZXJOYW1lfV0g5om55qyh5YiG5p6Q5oiQ5Yqf77yM6L+U5ZueICR7cGFyc2VkLmxlbmd0aH0g5Liq56ug6IqCYCk7XHJcbiAgICAgIHJldHVybiB7IGNoYXB0ZXJzOiBwYXJzZWQsIGxlZnRvdmVyIH07XHJcbiAgICAgIFxyXG4gICAgfSBjYXRjaCAoZTogYW55KSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYEFQSSBFcnJvciBmcm9tICR7cHJvdmlkZXJOYW1lfTpgLCBlKTtcclxuICAgICAgcmV0dXJuIHsgY2hhcHRlcnM6IFtdLCBsZWZ0b3ZlcjogXCJcIiB9O1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICog6LCD55SoIExMTSBBUEkg5qC55o2u5YWo5bGA5LiK5LiL5paH5a+55Yid5q2l55qE56ug6IqC5oC757uT6L+b6KGM5L+u5q2jXHJcbiAqIEBwYXJhbSBwcmVsaW1pbmFyeVN1bW1hcmllcyDliJ3mraXnmoTnq6DoioLmgLvnu5PmlofmnKxcclxuICogQHJldHVybnMg5L+u5q2j5ZCO55qE5omA5pyJ56ug6IqC5oC757uTXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0R2xvYmFsQ29ycmVjdGlvblN1bW1hcnkoXHJcbiAgICBwcmVsaW1pbmFyeVN1bW1hcmllczogc3RyaW5nXHJcbik6IFByb21pc2U8R2xvYmFsQ29ycmVjdGlvblJlc3VsdD4ge1xyXG4gICAgY29uc3QgcHJvbXB0ID0gYFxyXG7nm67moIfvvJrln7rkuo7miYDmnInliIbniYfnmoTliJ3mraXnrJTorrDvvIzov5vooYwqKuWFqOWxgOe7k+aehOW+ruiwgyoq44CC5LiN5Y6L57yp5L+h5oGv77yM5Y+q5YGa57uT5p6E6LCD5pW044CCXHJcbui+k+WFpe+8mueUseWIhuWdl+mYtuauteeUn+aIkOeahOivpue7huefpeivhueCueeslOiusOOAglxyXG7ovpPlh7rvvJrlvq7osIPlkI7nmoTmnIDnu4jnn6Xor4bnu5PmnoTvvIjkvb/nlKjmoIforrDmoLzlvI/vvIzkuI3opoHovpPlh7ogSlNPTu+8ieOAglxyXG5cclxuKirmoLjlv4PopoHmsYLvvIjovbvosIPlvq7osIPvvIzph43ngrnmmK/nu5PmnoTosIPmlbTvvIzkuI3ljovnvKnkv6Hmga/vvInvvJoqKlxyXG4xLiAqKuS/oeaBr+S/neWFqOesrOS4gCoq77ya6L6T5YWl5Lit5omA5pyJ55+l6K+G54K544CB5a6a5LmJ44CB5YWs5byP44CB5a6a55CG44CB5o6o5a+86L+H56iL44CB5L6L6aKY6aKY5oSP6YO95b+F6aG75Zyo6L6T5Ye65Lit5L+d55WZ44CC5L2g5Y+v5Lul6YeN5paw57uE57uH6K+t6KiA5ZKM6LCD5pW06aG65bqP77yM5L2G5LiN6IO95Lii5byD55+l6K+G5YaF5a6544CCXHJcbjIuICoq5ZCI5bm25LiO5ouG5YiGKirvvJrlkIjlubbooqvml7bpl7TliIfniYfnoazmgKfliIfmlq3nmoTlkIzkuIDnn6Xor4bngrnvvJvmi4bliIbooqvmj4nlnKjkuIDotbfnmoTkuI3lkIznn6Xor4bngrnjgILlj6rmnInlnKjooqvml7bpl7TliIfniYfnoazmgKfliIfmlq3nmoTlkIzkuIDlj6Xor53miJblkIzkuIDnp43op6Ppopjov4fnqIvmiY3pnIDopoHlkIjlubbjgILlpoLmnpzlhoXlrrnlt7Lnu4/mmK/mlrDpopjlnovjgIHmlrDnn6Xor4bngrnvvIzliqHlv4XliIfliIbmiJDmlrDnmoTnq6DoioLmnaHnm67jgIJcclxuMy4gKirosIPmlbTmoIfpopjlkozmlrnlkJEqKu+8muS9v+agh+mimOabtOWFt+S9k+OAgeabtOespuWQiOefpeivhueCueWunumZheWGheWuueOAguaKiuaOp+WFqOWxgOaWueWQkeeahOe7n+S4gOaAp+OAglxyXG40LiAqKuais+eQhumAu+i+kSoq77ya56Gu5L+d5ZCE55+l6K+G54K55LmL6Ze055qE6YC76L6R6aG65bqP6YCa6aG677yM6KGU5o6l6Ieq54S244CCXHJcbjUuICoqa2V5X3BvaW50cyDor6blrp4qKu+8muavj+S4quefpeivhueCueeahCBrZXlfcG9pbnRzIOimgeWMheWQq+WFt+S9k+eahOaOqOWvvOatpemqpOOAgeWumuS5ieadoeS7tuOAgeWFs+mUrue7k+iuuuOAguS4jeimgeWPquWGmeamguaLrOaAp+aPj+i/sO+8jOimgeacieWPr+S7peaLv+WOu+iDjOivteeahOWunui0qOWGheWuueOAglxyXG42LiAqKuS/neeVmeWFrOW8j+WumueQhioq77ya5omA5pyJ5pWw5a2m5YWs5byP5b+F6aG75L2/55SoIExhVGVYIOivreazle+8jOeUqOihjOWGhSAkLi4uJCDljIXoo7njgIJcclxuNy4gKirml7bpl7Tpobrluo8qKu+8muaMieaXtumXtOaIs+S7juWwj+WIsOWkp+aOkuWIl++8jOS/neeVmeWOn+Wni+aXtumXtOaIs+OAglxyXG5cclxu6L6T5Ye65qC85byP77yI5Lil5qC85L2/55So5Lul5LiL6KGM6aaW5qCH6K6w77yM5q+P6KGM5LiA5Liq5a2X5q6177yM5LiN6KaB5L2/55SoIEpTT07vvInvvJpcclxuPT09U0VHTUVOVD09PVxyXG50aW1lc3RhbXA6IE1NOlNTXHJcbnRpdGxlOiDlhbfkvZPnmoTnn6Xor4bngrkv5L6L6aKY5qCH6aKYXHJcbmtleV9wb2ludHM6XHJcbi0g6KaB54K5Me+8iOivpue7hueahOaOqOWvvOatpemqpOOAgeWumuS5ieadoeS7tuaIlue7k+iuuu+8iVxyXG4tIOimgeeCuTJcclxuLSDopoHngrkzXHJcbj09PUVORD09PVxyXG5cclxu77yI5Y+v5Lul5pyJ5aSa5LiqID09PVNFR01FTlQ9PT0uLi49PT1FTkQ9PT0g5Z2X77yJXHJcblxyXG49PT1NRVRBPT09XHJcbmV4YW1fZm9jdXM6IOeUqOiHqueEtua1geeVheeahOS4gOauteivneamguaLrOacrOivvuaguOW/g+WGheWuue+8jOW4ruWKqeW/q+mAn+WbnumhvuOAgua2teebluiAgeW4iOiusui/h+eahOaJgOacieS4u+imgeefpeivhueCueWSjOiAg+ivlemHjeeCueOAglxyXG5lbXBoYXNpczog6ICB5biI5Y+j5aS05by66LCD55qE5rOo5oSP54K5MSB8IOazqOaEj+eCuTIgfCDms6jmhI/ngrkz77yI55SoIHwg5YiG6ZqU5aSa5Liq5rOo5oSP54K577yJXHJcbmV4YW1wbGVzOiA9PT1FWD09PXRpbWVzdGFtcHzkvovpopjmoIfpoph86Kej6aKY5pa55rOVPT09RU5EPT09ID09PUVYPT09dGltZXN0YW1wfOS+i+mimOagh+mimHzop6Ppopjmlrnms5U9PT1FTkQ9PT1cclxuPT09RU5EPT09XHJcblxyXG4jIyMg5YiG5Z2X56yU6K6w5YiX6KGo77yI6K+36L+b6KGM57uT5p6E5b6u6LCD77yM5L+d55WZ5omA5pyJ55+l6K+G57uG6IqC77yJXHJcbiR7cHJlbGltaW5hcnlTdW1tYXJpZXN9XHJcbmA7XHJcblxyXG4gICAgLy8g5L2/55SoIExMTV9HTE9CQUxfQ09ORklH77yI5YWo5bGA5qCh6aqM5LiT55So6YWN572u77yJ77ybcmVhc29uaW5nX2VmZm9ydCAvIHRoaW5raW5nIOeUsSBFWFRSQV9CT0RZIOWxleW8gFxyXG4gICAgY29uc3QgcHJvdmlkZXIgPSB7XHJcbiAgICAgIE5BTUU6ICdHbG9iYWwgTExNJyxcclxuICAgICAgQVBJX0tFWTogTExNX0dMT0JBTF9DT05GSUcuQVBJX0tFWSxcclxuICAgICAgQkFTRV9VUkw6IExMTV9HTE9CQUxfQ09ORklHLkJBU0VfVVJMLFxyXG4gICAgICBNT0RFTDogTExNX0dMT0JBTF9DT05GSUcuTU9ERUwsXHJcbiAgICAgIEVYVFJBX0JPRFk6IExMTV9QUk9WSURFUlNbMF0uRVhUUkFfQk9EWSB8fCB7fVxyXG4gICAgfTtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SRIOS9v+eUqOWFqOWxgOagoemqjOS4k+eUqOmFjee9riAobW9kZWw9JHtwcm92aWRlci5NT0RFTH0sIGJhc2U9JHtwcm92aWRlci5CQVNFX1VSTH0pYCk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgYm9keTogUmVjb3JkPHN0cmluZywgYW55PiA9IHtcclxuICAgICAgICAgIG1vZGVsOiBwcm92aWRlci5NT0RFTCxcclxuICAgICAgICAgIG1lc3NhZ2VzOiBbXHJcbiAgICAgICAgICAgIHsgcm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogXCJZb3UgYXJlIGEgZG9jdW1lbnQgb3V0bGluZSBlZGl0b3IuIEZpeCB0aGUgZG9jdW1lbnQgb3V0bGluZXMuIE91dHB1dCBtYXRoZW1hdGljYWwgZm9ybXVsYXMgdXNpbmcgTGFUZVggc3ludGF4IHdyYXBwZWQgaW4gaW5saW5lICQuLi4kLiDor7fkvb/nlKjkuK3mlofovpPlh7rlhoXlrrnjgILkuJPkuJrmnK/or63lj6/kv53nlZnoi7Hmlofljp/mlofvvIzkvYbmlbTkvZPooajov7DlupTku6XkuK3mlofkuLrkuLvvvIzpgb/lhY3lpKfmrrXoi7HmlofjgILkuI3opoHovpPlh7ogSlNPTu+8jOS9v+eUqCA9PT1TRUdNRU5UPT09IOagh+iusOagvOW8j+OAglwiIH0sXHJcbiAgICAgICAgICAgIHsgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHByb21wdCB9XHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgc3RyZWFtOiBmYWxzZSxcclxuICAgICAgICAgIHRlbXBlcmF0dXJlOiAwLjIsXHJcbiAgICAgICAgICBtYXhfdG9rZW5zOiA2NTUzNiwgIC8vIOaYvuW8j+iuvue9rui2s+Wkn+Wkp+eahOi+k+WHuuepuumXtO+8jOmYsuatoiBKU09OIOiiq+aIquaWrVxyXG4gICAgICAgICAgLi4uKHByb3ZpZGVyLkVYVFJBX0JPRFkgfHwge30pXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8g8J+UgSDkvb/nlKjluKbph43or5Ur6ZmN57qn55qE6K+35rGC5Ye95pWwXHJcbiAgICAgICAgbGV0IGNvbnRlbnQgPSBhd2FpdCByZXF1ZXN0T3BlbkNvZGVWNFdpdGhSZXRyeShwcm92aWRlciwgYm9keSwgcHJvdmlkZXIuQVBJX0tFWSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfk4ogW09wZW5Db2RlLVY0XSDlhajlsYDmoKHpqozljp/lp4vlk43lupTplb/luqY6ICR7Y29udGVudC5sZW5ndGh9IOWtl+espmApO1xyXG4gICAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCAnJykudHJpbSgpO1xyXG5cclxuICAgICAgICAvLyDwn5uh77iPIOS9v+eUqCBMYVRlWCDkv53miqTlmajlpITnkIblhoXlrrlcclxuICAgICAgICBjb25zdCBsYXRleFByb3RlY3QgPSBuZXcgTGF0ZXhQcm90ZWN0KCk7XHJcbiAgICAgICAgY29uc3QgcHJvdGVjdGVkQ29udGVudCA9IGxhdGV4UHJvdGVjdC5wcm90ZWN0KGNvbnRlbnQpO1xyXG5cclxuICAgICAgICAvLyDwn5OdIOS9v+eUqOWIhumalOespuagvOW8j+ino+aekO+8iOS4jeWGjeS9v+eUqCBKU09O77yJXHJcbiAgICAgICAgY29uc3Qgc2VnUmVzdWx0ID0gcGFyc2VTZWdtZW50Rm9ybWF0KHByb3RlY3RlZENvbnRlbnQpO1xyXG4gICAgICAgIGxldCBwYXJzZWQ6IENoYXB0ZXJTdW1tYXJ5W10gPSBzZWdSZXN1bHQuc2VnbWVudHM7XHJcbiAgICAgICAgY29uc3QgbWV0YURhdGEgPSBzZWdSZXN1bHQubWV0YURhdGE7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfk50gW+WFqOWxgOagoemqjOino+aekF0g5YiG6ZqU56ym5qC85byP6Kej5p6Q57uT5p6cOiAke3BhcnNlZC5sZW5ndGh9IOS4qiBzZWdtZW50cywgbWV0YURhdGE6ICR7bWV0YURhdGEgPyAn5pyJJyA6ICfml6AnfWApO1xyXG5cclxuICAgICAgICAvLyDwn5uh77iPIOi/mOWOnyBMYVRlWCDlhazlvI/kuK3nmoTljaDkvY3nrKbvvIzlubbkv67lpI3lj4zlj43mlpzmnaDpl67pophcclxuICAgICAgICBpZiAocGFyc2VkLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHBhcnNlZCA9IHBhcnNlZC5tYXAoaXRlbSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3RvcmVkID0gbGF0ZXhQcm90ZWN0LnJlc3RvcmVBbmRGaXhGaWVsZHMoaXRlbSwgWyd0aXRsZScsICdzdW1tYXJ5J10pO1xyXG4gICAgICAgICAgICAvLyDov5jljp8ga2V5X3BvaW50cyDkuK3nmoQgTGFUZVgg5Y2g5L2N56ymXHJcbiAgICAgICAgICAgIGlmIChyZXN0b3JlZC5rZXlfcG9pbnRzICYmIHJlc3RvcmVkLmtleV9wb2ludHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgIHJlc3RvcmVkLmtleV9wb2ludHMgPSByZXN0b3JlZC5rZXlfcG9pbnRzLm1hcChrcCA9PiBsYXRleFByb3RlY3QucmVzdG9yZUFuZEZpeChrcCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiByZXN0b3JlZDtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgLy8g5omA5pyJ5YaF5a656L+Y5Y6f5a6M5oiQ5ZCO77yM6YeN572u5L+d5oqk5Zmo54q25oCBXHJcbiAgICAgICAgICBsYXRleFByb3RlY3QucmVzZXQoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8g8J+boe+4jyDkuKXmoLzmo4Dmn6UgQUkg6L+U5Zue5pWw5o2u5piv5ZCm5Li656m6XHJcbiAgICAgICAgaWYgKHBhcnNlZC5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBbT3BlbkNvZGUtVjRdIOWFqOWxgOagoemqjCBBSSDov5Tlm57nqbrmlbDmja5gKTtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLljp/lp4vlk43lupTlhoXlrrk6XCIsIGNvbnRlbnQuc2xpY2UoMCwgNTAwKSk7XHJcbiAgICAgICAgICByZXR1cm4geyBjaGFwdGVyczogW10sIG1ldGFEYXRhOiB7IGV4YW1fZm9jdXM6ICcnLCBlbXBoYXNpczogW10sIGV4YW1wbGVzOiBbXSB9IH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIOaehOW7uum7mOiupCBtZXRhRGF0Ye+8iOWmguaenCBMTE0g5rKh5pyJ6L6T5Ye6IE1FVEEg5Z2X77yJXHJcbiAgICAgICAgY29uc3QgZmluYWxNZXRhRGF0YTogTm90ZU1ldGFEYXRhID0gbWV0YURhdGEgfHwge1xyXG4gICAgICAgICAgZXhhbV9mb2N1czogJycsXHJcbiAgICAgICAgICBlbXBoYXNpczogW10sXHJcbiAgICAgICAgICBleGFtcGxlczogW11cclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIOaIkOWKn+iOt+WPluaVsOaNru+8jOi/lOWbnue7k+aenFxyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgW09wZW5Db2RlLVY0XSDlhajlsYDmoKHpqozmiJDlip/vvIzov5Tlm54gJHtwYXJzZWQubGVuZ3RofSDkuKrnq6DoioIsIG1ldGFEYXRhOiBleGFtX2ZvY3VzPSR7ZmluYWxNZXRhRGF0YS5leGFtX2ZvY3VzLmxlbmd0aH3lrZfnrKYsIGVtcGhhc2lzPSR7ZmluYWxNZXRhRGF0YS5lbXBoYXNpcy5sZW5ndGh95LiqLCBleGFtcGxlcz0ke2ZpbmFsTWV0YURhdGEuZXhhbXBsZXMubGVuZ3RofeS4qmApO1xyXG4gICAgICAgIHJldHVybiB7IGNoYXB0ZXJzOiBwYXJzZWQsIG1ldGFEYXRhOiBmaW5hbE1ldGFEYXRhIH07XHJcbiAgICAgICAgXHJcbiAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYEdsb2JhbCBDb3JyZWN0aW9uIEFQSSBFcnJvciBmcm9tIE9wZW5Db2RlLVY0OmAsIGUpO1xyXG4gICAgICAgIHJldHVybiB7IGNoYXB0ZXJzOiBbXSwgbWV0YURhdGE6IHsgZXhhbV9mb2N1czogJycsIGVtcGhhc2lzOiBbXSwgZXhhbXBsZXM6IFtdIH0gfTtcclxuICAgICAgfVxyXG59XHJcblxyXG4vKipcclxuICog8J+boe+4jyDpmY3nuqfmgJ3nu7Tlr7zlm77mnoTlu7rlmahcclxuICog5b2TIExMTSDooqsgY29udGVudF9maWx0ZXIg5oum5oiq5oiW6L+U5Zue56m65pWw5o2u5pe277yM55So56ug6IqC5pGY6KaB55u05o6l5p6E5bu65LiA5Liq566A5YyW54mI5oCd57u05a+85Zu+XHJcbiAqIOS/neivgeeUqOaIt+iHs+WwkeacieS4gOS4quWPr+eUqOeahOaAnee7tOWvvOWbvu+8jOiAjOS4jeaYr+WujOWFqOWksei0pVxyXG4gKi9cclxuZnVuY3Rpb24gYnVpbGRGYWxsYmFja01pbmRtYXAoXHJcbiAgICBjaGFwdGVyczogQ2hhcHRlclN1bW1hcnlbXSxcclxuICAgIHZpZGVvTmFtZTogc3RyaW5nLFxyXG4gICAgZW5jb2RlZE5vdGVQYXRoOiBzdHJpbmdcclxuKTogc3RyaW5nIHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5uh77iPIFvpmY3nuqfmgJ3nu7Tlr7zlm75dIOW8gOWni+aehOW7uu+8jOeroOiKguaVsDonLCBjaGFwdGVycy5sZW5ndGgpO1xyXG4gICAgXHJcbiAgICBsZXQgY29udGVudCA9IGAjICR7dmlkZW9OYW1lfVxcbmA7XHJcbiAgICBcclxuICAgIC8vIOaMieaXtumXtOmhuuW6j+mBjeWOhueroOiKgu+8jOaehOW7uuS6jOe6p+WSjOS4iee6p+iKgueCuVxyXG4gICAgZm9yIChjb25zdCBjaGFwdGVyIG9mIGNoYXB0ZXJzKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0SGVhZGluZyA9IGDij7HvuI8gJHtjaGFwdGVyLnRpbWVzdGFtcH0gJHtjaGFwdGVyLnRpdGxlfWA7XHJcbiAgICAgICAgY29uc3QgZW5jb2RlZEhlYWRpbmcgPSBlbmNvZGVVUklDb21wb25lbnQodGFyZ2V0SGVhZGluZyk7XHJcbiAgICAgICAgY29uc3QgY2xlYW5UaXRsZSA9IGNoYXB0ZXIudGl0bGUubGVuZ3RoID4gOCA/IGNoYXB0ZXIudGl0bGUuc3Vic3RyaW5nKDAsIDgpIDogY2hhcHRlci50aXRsZTtcclxuICAgICAgICBcclxuICAgICAgICAvLyDkuInnuqfoioLngrnvvJrnq6DoioLmoIfpopjvvIjluKbot7Povazpk77mjqXvvIlcclxuICAgICAgICBjb250ZW50ICs9IGAjIyMgPGEgaHJlZj1cIm9ic2lkaWFuOi8vc2lsaWNvbi1qdW1wP2ZpbGU9JHtlbmNvZGVkTm90ZVBhdGh9JmhlYWRpbmc9JHtlbmNvZGVkSGVhZGluZ31cIj7wn5OMJHtjbGVhblRpdGxlfTwvYT5cXG5gO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIOWmguaenOaciSBrZXlfcG9pbnRz77yM55So5L2c5a2Q6IqC54K5XHJcbiAgICAgICAgaWYgKGNoYXB0ZXIua2V5X3BvaW50cyAmJiBjaGFwdGVyLmtleV9wb2ludHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtwIG9mIGNoYXB0ZXIua2V5X3BvaW50cykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdHJpbW1lZCA9IGtwLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0cmltbWVkICYmICF0cmltbWVkLnN0YXJ0c1dpdGgoJz09PScpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xlYW5MaW5lID0gdHJpbW1lZC5yZXBsYWNlKC9eWy0qK11cXHMqLywgJycpLnJlcGxhY2UoL15cXGQrXFwuXFxzKi8sICcnKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2xlYW5MaW5lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQgKz0gYC0gJHtjbGVhbkxpbmV9XFxuYDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGNoYXB0ZXIuc3VtbWFyeSkge1xyXG4gICAgICAgICAgICBjb25zdCBsaW5lcyA9IGNoYXB0ZXIuc3VtbWFyeS5zcGxpdCgnXFxuJyk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdHJpbW1lZCA9IGxpbmUudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRyaW1tZWQgJiYgIXRyaW1tZWQuc3RhcnRzV2l0aCgnPT09JykpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyDljrvmjokgbWFya2Rvd24g5YiX6KGo5qCH6K6w5YmN57yA77yM57uf5LiA55SoIC0g6YeN5paw57yp6L+bXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xlYW5MaW5lID0gdHJpbW1lZC5yZXBsYWNlKC9eWy0qK11cXHMqLywgJycpLnJlcGxhY2UoL15cXGQrXFwuXFxzKi8sICcnKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2xlYW5MaW5lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQgKz0gYC0gJHtjbGVhbkxpbmV9XFxuYDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgY29udGVudCArPSAnXFxuJztcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJ/Cfm6HvuI8gW+mZjee6p+aAnee7tOWvvOWbvl0g5p6E5bu65a6M5oiQ77yM5YaF5a656ZW/5bqmOicsIGNvbnRlbnQubGVuZ3RoKTtcclxuICAgIHJldHVybiBjb250ZW50O1xyXG59XHJcblxyXG4vKipcclxuICog6LCD55SoIExMTSBBUEkg55Sf5oiQ5oCd57u05a+85Zu+5YaF5a65ICjmnKzlnLDmraPliJnmm7/mjaLpk77mjqXmlrnmoYgpXHJcbiAqIEBwYXJhbSBjaGFwdGVycyDmiYDmnInnq6DoioLmlbDmja5cclxuICogQHBhcmFtIG5vdGVGaWxlIOeslOiusOeahCBURmlsZSDlr7nosaFcclxuICogQHBhcmFtIGFwcCBUaGUgT2JzaWRpYW4gQXBwIGluc3RhbmNlXHJcbiAqIEByZXR1cm5zIE1hcmtkb3duIOagvOW8j+eahOaAnee7tOWvvOWbvuWGheWuuVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlTWluZG1hcENvbnRlbnQoXHJcbiAgICBjaGFwdGVyczogQ2hhcHRlclN1bW1hcnlbXSxcclxuICAgIG5vdGVGaWxlOiBURmlsZSxcclxuICAgIGFwcDogQXBwXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICAvLyDku47nrJTorrDmlofku7blkI3kuK3mj5Dlj5bop4bpopHlkI3vvIjljrvmjokgXCLwn5OdXCIg5YmN57yA77yJXHJcbiAgICBjb25zdCB2aWRlb05hbWUgPSBub3RlRmlsZS5iYXNlbmFtZS5yZXBsYWNlKC9e8J+TnS8sICcnKTtcclxuICAgIC8vIOe8lueggeaWh+S7tui3r+W+hOeUqOS6juWQjue7reacrOWcsOabv+aNolxyXG4gICAgY29uc3QgZW5jb2RlZE5vdGVQYXRoID0gZW5jb2RlVVJJQ29tcG9uZW50KG5vdGVGaWxlLnBhdGgpO1xyXG5cclxuICAgIC8vIPCfkqEg5pS56L+b77ya5aSn5bmF566A5YyWIFByb21wdO+8jOWPquimgeaxgui+k+WHuuW5suWHgOeahCBbTU06U1NdIOagh+iusFxyXG4gICAgLy8g5rOo5oSP77ya5LiN5YaN5Lyg5YWl5a6M5pW056yU6K6w5Y6f5paH77yIbm90ZUNvbnRlbnTvvInvvIzlj6rnlKgga2V5X3BvaW50c++8jOmBv+WFjSBwcm9tcHQg6L+H6ZW/6Kem5Y+R5YaF5a656L+H5rukXHJcbiAgICBjb25zdCBwcm9tcHQgPSBgXHJcbuS9oOaYr+S4gOS9jSoq55+l6K+G5L2T57O75p625p6E5biIKirjgILor7fmoLnmja7ku6XkuIvop4bpopHnq6DoioLmlbDmja7vvIzkuLrlkI3kuLogXFxgJHt2aWRlb05hbWV9XFxgIOeahOeslOiusOaehOW7uuS4gOS4qioq6YC76L6R5riF5pmw44CB57uT5p6E5YyWKirnmoTmgJ3nu7Tlr7zlm77jgIJcclxuXHJcbiMjIOaguOW/g+S7u+WKoeS4juWumuS9jVxyXG4xLiAqKuS/ruato+i9rOWGmemUmeivryoq77ya6L6T5YWl5YaF5a655p2l5rqQ5LqO6K+t6Z+z6K+G5Yir77yM5YyF5ZCr5LiA5a6a55qE5ZCM6Z+z6ZSZ5Yir5a2X77yI5bCk5YW25piv5LiT5Lia5pyv6K+t77yJ44CC6K+35qC55o2u5LiK5LiL5paH5ZKM6YC76L6RKirpnZnpu5jkv67mraMqKui/meS6m+mUmeivr++8jOehruS/neeUn+aIkOeahOaAnee7tOWvvOWbvuiKgueCueaWh+Wtl+WHhuehruOAgeS4k+S4muOAglxyXG4yLiAqKue7k+aehOWMluaAu+e7kyoq77ya5oCd57u05a+85Zu+55qE5a6a5L2N5pivKirnn6Xor4bmoYbmnrbkuI7moLjlv4PpgLvovpHnmoTmorPnkIYqKuOAguS9oOmcgOimgeS7juaPkOS+m+eahOeroOiKguimgeeCueS4reaPkOWPlioq5qC45b+D5qaC5b+144CB5YWz6ZSu5q2l6aqk5ZKM6YeN6KaB57uT6K66KirvvIzlsIblhbbovazljJbkuLrlsYLmrKHliIbmmI7nmoTmoJHnirbnu5PmnoTjgIJcclxuMy4gKirmuIXmmbDmmJPmh4IqKu+8muiKgueCueWGheWuueW6lOaYryoq57K+54K85LiU6KGo5oSP5a6M5pW055qE55+t5Y+l5oiW5qC45b+D6KaB54K5KirvvIzkuI3opoHov4fkuo7ov73msYLmnoHoh7TnmoTnroDnn63ogIzlr7zoh7Tor63kuYnkuI3mmI7jgILmi5Lnu53plb/nr4flpKforrrvvIzkvYbkuZ/lv4XpobvorqnkurrkuIDnnLznnIvmh4Lor6XoioLngrnnmoTlhbfkvZPlkKvkuYnjgIJcclxuNC4gKirpgLvovpHpgJLov5sqKu+8muagueaNruefpeivhueahOWGheWcqOmAu+i+ke+8jOaehOW7uuWkmuWxgue6p+eahOagkeeKtue7k+aehO+8iOWmgiDkuLvpopggLT4g5a2Q5Li76aKYIC0+IOaguOW/g+amguW/tSAtPiDlhbfkvZPlsZXlvIDvvInvvIzlsZXnjrDnn6Xor4bngrnkuYvpl7TnmoTljIXlkKvjgIHlubbliJfmiJblm6DmnpzlhbPns7vjgIJcclxuNS4gKirlhazlvI/muLLmn5MqKu+8muWvueS6juaVsOWtpuWFrOW8j++8jOW/hemhu+S9v+eUqCBMYVRlWCDor63ms5XvvIzlubbnlKjooYzlhoUgJC4uLiQg5YyF6KO544CC5L6L5aaC77yaJHggPSBcXFxcZnJhY3stYiBcXFxccG0gXFxcXHNxcnR7Yl4yLTRhY319ezJhfSTjgIEkXFxcXGludF8wXlxcXFxpbmZ0eSBlXnsteF4yfSBkeCRcclxuNi4gKirnq6DoioLmoIforrDvvIjkuKXmoLzpgbXlrojvvIkqKu+8muWcqOW8leeUqOWFt+S9k+eroOiKguaXtu+8jOW/hemhu+S4lOWPquiDveS9v+eUqCBcXGAjIyMgW+aXtumXtOaIs10g5qCH6aKYXFxgIOeahOagvOW8j+S9nOS4uuS6jOe6p+aIluS4iee6p+iKgueCueOAgioq57ud5a+55LiN6KaB55Sf5oiQ5Lu75L2VIEhUTUzjgIHpk77mjqXmiJbku6PnoIHlnZfvvIEqKlxyXG43LiAqKuWwiumHjeWOn+Wni+WIh+WIhu+8iOmHjeimge+8iSoq77ya6L6T5YWl5pWw5o2u5Lit55qE5q+P5Liq56ug6IqC5bey57uP5piv5LiA5Liq54us56uL55qE55+l6K+G54K544CC5L2g55qE5Lu75Yqh5piv5oqK5a6D5Lus57uE57uH5oiQ5qCR54q257uT5p6E77yMKirogIzkuI3mmK/miorkuI3lkIznmoTnn6Xor4bngrnlvLrooYzlkIjlubbmiJDkuIDkuKrlpKfoioLngrkqKuOAglxyXG4gICAtIOWPr+S7peaMieWtpuenkemAu+i+keWIhue7hO+8iOWmglwi5qaC5b+15Z+656GAXCLjgIFcIuiuoeeul+aWueazlVwi44CBXCLkvovpophcIu+8ie+8jOi/meaYr+e7hOe7h+WxguasoeeahOWQiOW5tlxyXG4gICAtIOS9hioq5LiN6KaB5oqK5LiN5ZCM55+l6K+G54K555qE5YW35L2T5YaF5a655o+J6L+b5ZCM5LiA5Liq5Y+25a2Q6IqC54K5KipcclxuICAgLSDmr4/kuKrljp/lp4vnn6Xor4bngrnlnKjmgJ3nu7Tlr7zlm77kuK3pg73lupTor6XmnInoh6rlt7Hni6znq4vnmoTliIbmlK9cclxuICAgLSDnroDljZXor7TvvJrkvaDlj6/ku6XliqBcIuaWh+S7tuWkuVwi5oqK5paH5Lu25b2S57G777yM5L2G5LiN6KaB5oqK5paH5Lu25YaF5a655re35Zyo5LiA6LW3XHJcblxyXG7wn5S0IOmTvuaOpeiKgueCueagh+mimOinhOWIme+8iOaegeWFtumHjeimge+8ie+8mlxcYCMjIyBbTU06U1NdIOagh+mimFxcYCDkuK3nmoTmoIfpopjpg6jliIblv4XpobvmmK8yLTjlrZfnmoTlh53nu4PmpoLmi6znn63or63vvIzlg4/mgJ3nu7Tlr7zlm77nmoTkuIDnuqfoioLngrnkuIDmoLfnroDnn63jgILnpoHmraLnvZfliJflrZDmoIfpopjjgIHnpoHmraLlhpnmiJDlrozmlbTlj6XjgIHnpoHmraLlsZXlvIDop6Pph4rjgILov5nkuKrmoIfpopjmmK/nu5nor7vogIXngrnlh7vot7PovaznlKjnmoTlhaXlj6PmloflrZfvvIzkuI3mmK/lhoXlrrnmkZjopoHjgIJcclxuXHJcbiMjIOi+k+WHuuagvOW8j+ekuuS+i++8iOS4peagvOWPgueFp++8iVxyXG4jICR7dmlkZW9OYW1lfVxyXG4jIyDwn46v5qaC5b+15Z+656GAXHJcbiMjIyBbMDA6MDBdIOaegemZkOWumuS5iVxyXG4tIOaguOW/g+aAneaDs1xyXG4gIC0g5o+P6L+w5Ye95pWw5Zyo5p+Q5LiA54K555qE6LaL6L+R6KGM5Li6XHJcbi0g5Lil5qC85a6a5LmJXHJcbiAgLSDkvb/nlKggzrUtzrQg6K+t6KiA6L+b6KGM5Lil5a+G6KGo6L+wXHJcbiMjIPCfk5DorqHnrpfmlrnms5VcclxuIyMjIFswODowMF0g5rSb5b+F6L6+5rOV5YiZXHJcbi0g6YCC55So5Zy65pmvXHJcbiAgLSDkuJPpl6jlpITnkIYgMC8wIOWei+WSjCDiiJ4v4oieIOWei+acquWumuW8j1xyXG4tIOaguOW/g+atpemqpFxyXG4gIC0g5a+55YiG5a2Q5YiG5q+N5YiG5Yir5rGC5a+85ZCO5YaN5rGC5p6B6ZmQXHJcblxyXG7wn5S0IOmUmeivr+ekuuiMg++8iOemgeatoui/meagt+WBmu+8ie+8mlxyXG4jIyDwn46v5qaC5b+15Z+656GAXHJcbiMjIyBbMDA6MDBdIOaegemZkOS4jua0m+W/hei+vlxyXG4tIOaegemZkOWumuS5ieWSjOa0m+W/hei+vuazleWImea3t+WcqOS4gOi1tyAg4oaQIOmUmeivr++8geS4pOS4queLrOeri+efpeivhueCueiiq+W8uuihjOWQiOW5tlxyXG5cclxu4pyFIOato+ehruWBmuazle+8mlxyXG4jIyDwn46v5qaC5b+15Z+656GAXHJcbiMjIyBbMDA6MDBdIOaegemZkOWumuS5iVxyXG4tIOaguOW/g+aAneaDs1xyXG4gIC0g5o+P6L+w5Ye95pWw5Zyo5p+Q5LiA54K555qE6LaL6L+R6KGM5Li6XHJcbiMjIPCfk5DorqHnrpfmlrnms5VcclxuIyMjIFswODowMF0g5rSb5b+F6L6+5rOV5YiZXHJcbi0g6YCC55So5Zy65pmvXHJcbiAgLSDkuJPpl6jlpITnkIYgMC8wIOWei+WSjCDiiJ4v4oieIOWei+acquWumuW8j1xyXG5cclxuLS0tXHJcbiMjIOeroOiKgue7k+aehOaAu+e7k++8iOagvOW8j++8mlvml7bpl7TmiLNdIOagh+mimCArIOimgeeCue+8iVxyXG4ke2NoYXB0ZXJzLm1hcChjID0+IHtcclxuICBjb25zdCBkZXRhaWwgPSBjLmtleV9wb2ludHMgXHJcbiAgICA/IGMua2V5X3BvaW50cy5tYXAoa3AgPT4gYCAgLSAke2twfWApLmpvaW4oJ1xcbicpXHJcbiAgICA6IGMuc3VtbWFyeTtcclxuICByZXR1cm4gYFske2MudGltZXN0YW1wfV0gJHtjLnRpdGxlfVxcbiR7ZGV0YWlsfWA7XHJcbn0pLmpvaW4oJ1xcblxcbicpfVxyXG5gO1xyXG5cclxuICAgIC8vIOS9v+eUqCBMTE1fTUlORE1BUF9DT05GSUfvvIjmgJ3nu7Tlr7zlm77kuJPnlKjphY3nva7vvInvvJtyZWFzb25pbmdfZWZmb3J0IC8gdGhpbmtpbmcg55SxIEVYVFJBX0JPRFkg5bGV5byAXHJcbiAgICBjb25zdCBtaW5kbWFwUHJvdmlkZXIgPSB7XHJcbiAgICAgIE5BTUU6ICdNaW5kbWFwIExMTScsXHJcbiAgICAgIEFQSV9LRVk6IExMTV9NSU5ETUFQX0NPTkZJRy5BUElfS0VZLFxyXG4gICAgICBCQVNFX1VSTDogTExNX01JTkRNQVBfQ09ORklHLkJBU0VfVVJMLFxyXG4gICAgICBNT0RFTDogTExNX01JTkRNQVBfQ09ORklHLk1PREVMLFxyXG4gICAgICBFWFRSQV9CT0RZOiBMTE1fTUlORE1BUF9DT05GSUcuRVhUUkFfQk9EWVxyXG4gICAgfTtcclxuICAgIGNvbnNvbGUubG9nKGDwn5SRIOS9v+eUqOaAnee7tOWvvOWbvuS4k+eUqOmFjee9rueUn+aIkOaAnee7tOWvvOWbviAobW9kZWw9JHttaW5kbWFwUHJvdmlkZXIuTU9ERUx9LCBiYXNlPSR7bWluZG1hcFByb3ZpZGVyLkJBU0VfVVJMfSlgKTtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdERpcmVjdCh7XHJcbiAgICAgICAgdXJsOiBtaW5kbWFwUHJvdmlkZXIuQkFTRV9VUkwsXHJcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHttaW5kbWFwUHJvdmlkZXIuQVBJX0tFWX1gXHJcbiAgICAgICAgfSxcclxuICAgICAgICB0aW1lb3V0TXM6IDFfODAwXzAwMCxcclxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgICAgIG1vZGVsOiBtaW5kbWFwUHJvdmlkZXIuTU9ERUwsXHJcbiAgICAgICAgICAgIG1lc3NhZ2VzOiBbXHJcbiAgICAgICAgICAgICAgICB7IHJvbGU6IFwic3lzdGVtXCIsIGNvbnRlbnQ6IFwiWW91IGFyZSBhIG1pbmRtYXAgb3V0bGluZSBnZW5lcmF0b3IuIE91dHB1dCBwdXJlIE1hcmtkb3duLiBORVZFUiBvdXRwdXQgSFRNTCB0YWdzLiBLZWVwIG5vZGVzIHN0cnVjdHVyZWQsIGxvZ2ljYWwsIGFuZCBlYXN5IHRvIHVuZGVyc3RhbmQgdXNpbmcgY29uY2lzZSBidXQgbWVhbmluZ2Z1bCBwaHJhc2VzLiBSZXNwZWN0IHRoZSBpbnB1dCBrbm93bGVkZ2UgcG9pbnRzIGFzIGluZGVwZW5kZW50IHVuaXRzIOKAlCBkbyBub3QgbWVyZ2UgZGlmZmVyZW50IHRvcGljcyBpbnRvIG9uZSBub2RlLiDor7fkvb/nlKjkuK3mlofovpPlh7rlhoXlrrnjgILkuJPkuJrmnK/or63lj6/kv53nlZnoi7Hmlofljp/mlofvvIzkvYbmlbTkvZPooajov7DlupTku6XkuK3mlofkuLrkuLvvvIzpgb/lhY3lpKfmrrXoi7HmlofjgIJcIiB9LFxyXG4gICAgICAgICAgICAgICAgeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogcHJvbXB0IH1cclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgc3RyZWFtOiBmYWxzZSxcclxuICAgICAgICAgICAgdGVtcGVyYXR1cmU6IDAuMywgIC8vIOmZjeS9juWIm+mAoOaAp++8jOaPkOmrmOe7k+aehOS/neecn+W6plxyXG4gICAgICAgICAgICAuLi4obWluZG1hcFByb3ZpZGVyLkVYVFJBX0JPRFkgfHwge30pXHJcbiAgICAgICAgfSlcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIPCfqrUg5L+d55WZ5a6M5pW05Y6f5aeL5ZON5bqU5pel5b+X77yI5oiq5patIDIwMDAg5a2X56ym77yJ77yM5pa55L6/5pyq5p2l6K+K5patXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zb2xlLmxvZygn8J+nviDmgJ3nu7Tlr7zlm74gcmF3IHJlc3BvbnNlOicsIEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlLmpzb24pLnNsaWNlKDAsIDIwMDApKTtcclxuICAgIH0gY2F0Y2ggKGxvZ0Vycikge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ+aAnee7tOWvvOWbviByYXcgcmVzcG9uc2Ug5bqP5YiX5YyW5aSx6LSlOicsIGxvZ0Vycik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g8J+boe+4jyDmo4DmtYsgY29udGVudF9maWx0ZXLvvIjngavlsbHlvJXmk47lhoXlrrnlronlhajov4fmu6TvvIlcclxuICAgIGNvbnN0IGZpbmlzaFJlYXNvbjogc3RyaW5nID0gcmVzcG9uc2UuanNvbi5jaG9pY2VzPy5bMF0/LmZpbmlzaF9yZWFzb24gfHwgJyc7XHJcbiAgICBpZiAoZmluaXNoUmVhc29uID09PSAnY29udGVudF9maWx0ZXInKSB7XHJcbiAgICAgIGNvbnNvbGUud2Fybign4pqg77iPIOaAnee7tOWvvOWbvuiiqyBjb250ZW50X2ZpbHRlciDmi6bmiKrvvIzlsJ3or5XpmY3nuqfmnoTlu7rnroDljJbniYjmgJ3nu7Tlr7zlm74nKTtcclxuICAgICAgLy8g6ZmN57qn77ya55So56ug6IqC5pGY6KaB55u05o6l5p6E5bu65oCd57u05a+85Zu+XHJcbiAgICAgIHJldHVybiBidWlsZEZhbGxiYWNrTWluZG1hcChjaGFwdGVycywgdmlkZW9OYW1lLCBlbmNvZGVkTm90ZVBhdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG1lc3NhZ2UgPSByZXNwb25zZS5qc29uLmNob2ljZXM/LlswXT8ubWVzc2FnZSA/PyB7fTtcclxuICAgIGNvbnN0IHJhd0NvbnRlbnQ6IHN0cmluZyA9IHR5cGVvZiBtZXNzYWdlLmNvbnRlbnQgPT09ICdzdHJpbmcnID8gbWVzc2FnZS5jb250ZW50IDogXCJcIjtcclxuICAgIC8vIPCflIEg5YW85a65IERlZXBTZWVrIHJlYXNvbmluZyDmqKHlnosgKHJlYXNvbmluZ19lZmZvcnQ9bWF4KSDmiormnIDnu4jnrZTmoYjmlL7lnKggcmVhc29uaW5nX2NvbnRlbnQgLyByZWFzb25pbmcg5a2X5q6155qE5oOF5Ya1XHJcbiAgICBjb25zdCByYXdSZWFzb25pbmc6IHN0cmluZyA9XHJcbiAgICAgICh0eXBlb2YgbWVzc2FnZS5yZWFzb25pbmdfY29udGVudCA9PT0gJ3N0cmluZycgPyBtZXNzYWdlLnJlYXNvbmluZ19jb250ZW50IDogXCJcIikgfHxcclxuICAgICAgKHR5cGVvZiBtZXNzYWdlLnJlYXNvbmluZyA9PT0gJ3N0cmluZycgPyBtZXNzYWdlLnJlYXNvbmluZyA6IFwiXCIpO1xyXG5cclxuICAgIGxldCBjb250ZW50ID0gXCJcIjtcclxuICAgIGxldCB1c2VkRmllbGQ6ICdjb250ZW50JyB8ICdyZWFzb25pbmdfY29udGVudCcgfCAncmVhc29uaW5nJyB8ICdub25lJyA9ICdub25lJztcclxuICAgIGlmIChyYXdDb250ZW50ICYmIHJhd0NvbnRlbnQudHJpbSgpICE9PSAnJykge1xyXG4gICAgICBjb250ZW50ID0gcmF3Q29udGVudDtcclxuICAgICAgdXNlZEZpZWxkID0gJ2NvbnRlbnQnO1xyXG4gICAgfSBlbHNlIGlmIChyYXdSZWFzb25pbmcgJiYgcmF3UmVhc29uaW5nLnRyaW0oKSAhPT0gJycpIHtcclxuICAgICAgY29udGVudCA9IHJhd1JlYXNvbmluZztcclxuICAgICAgdXNlZEZpZWxkID0gKHR5cGVvZiBtZXNzYWdlLnJlYXNvbmluZ19jb250ZW50ID09PSAnc3RyaW5nJyAmJiBtZXNzYWdlLnJlYXNvbmluZ19jb250ZW50KSA/ICdyZWFzb25pbmdfY29udGVudCcgOiAncmVhc29uaW5nJztcclxuICAgICAgY29uc29sZS53YXJuKGDimqDvuI8g5oCd57u05a+85Zu+IGNvbnRlbnQg5a2X5q615Li656m677yM5Zue6YCA5L2/55SoICR7dXNlZEZpZWxkfSDlrZfmrrXvvIjplb/luqY6ICR7Y29udGVudC5sZW5ndGh977yJYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g8J+boe+4jyDkuKXmoLzmo4Dmn6UgQUkg6L+U5Zue5pWw5o2u5piv5ZCm5Li656m677yI5LuF5ZyoIGNvbnRlbnQg5LiOIHJlYXNvbmluZ19jb250ZW50L3JlYXNvbmluZyDlnYfkuLrnqbrml7bmiY3liKTlrprlpLHotKXvvIlcclxuICAgIGlmICghY29udGVudCB8fCBjb250ZW50LnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIuKdjCDmgJ3nu7Tlr7zlm74gQUkg6L+U5Zue56m65pWw5o2u77yIY29udGVudCAvIHJlYXNvbmluZ19jb250ZW50IC8gcmVhc29uaW5nIOWdh+S4uuepuu+8iVwiKTtcclxuICAgICAgLy8g6ZmN57qn77ya55So56ug6IqC5pGY6KaB55u05o6l5p6E5bu65oCd57u05a+85Zu+XHJcbiAgICAgIHJldHVybiBidWlsZEZhbGxiYWNrTWluZG1hcChjaGFwdGVycywgdmlkZW9OYW1lLCBlbmNvZGVkTm90ZVBhdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUg5oCd57u05a+85Zu+5YaF5a655o+Q5Y+W6Ieq5a2X5q61OiAke3VzZWRGaWVsZH3vvIjplb/luqY6ICR7Y29udGVudC5sZW5ndGh977yJYCk7XHJcblxyXG4gICAgLy8g5riF55CG5oCd6ICD6L+H56iL5ZKM5Luj56CB5Z2X5qCH6K6w77yI5a+5IGNvbnRlbnQg5LiOIHJlYXNvbmluZyDlm57pgIDliIbmlK/nu5/kuIDlpITnkIbvvIlcclxuICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoLzx0aGluaz5bXFxzXFxTXSo/PFxcL3RoaW5rPi9nLCAnJykudHJpbSgpO1xyXG4gICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZSgvXmBgYChtYXJrZG93bnxtYXJrbWFwKT9cXHMqL2ltLCAnJykucmVwbGFjZSgvXFxzKmBgYCQvbSwgJycpO1xyXG5cclxuICAgIC8vIOiHquWKqOS4uumdnuWPtuWtkOiKgueCue+8iOacieWtkOiKgueCueeahOWIl+ihqOmhue+8ieWKoOeyl1xyXG4gICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoIC0gMTsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgbGluZSA9IGxpbmVzW2ldO1xyXG4gICAgICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCgvXihcXHMqKShbLSorXVxccyspKC4qKSQvKTtcclxuICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudEluZGVudCA9IG1hdGNoWzFdLmxlbmd0aDtcclxuICAgICAgICAgICAgbGV0IGlzUGFyZW50ID0gZmFsc2U7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyDlkJHlkI7mn6Xmib7ku6XliKTlrprmmK/lkKblkKvmnInlrZDoioLngrlcclxuICAgICAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgbGluZXMubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5leHRMaW5lID0gbGluZXNbal07XHJcbiAgICAgICAgICAgICAgICBpZiAobmV4dExpbmUudHJpbSgpID09PSAnJykgY29udGludWU7IC8vIOi3s+i/h+epuuihjFxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBjb25zdCBuZXh0TWF0Y2ggPSBuZXh0TGluZS5tYXRjaCgvXihcXHMqKShbLSorXVxccyspKC4qKSQvKTtcclxuICAgICAgICAgICAgICAgIGlmIChuZXh0TWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXh0SW5kZW50ID0gbmV4dE1hdGNoWzFdLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobmV4dEluZGVudCA+IGN1cnJlbnRJbmRlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNQYXJlbnQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBicmVhazsgLy8g5om+5Yiw5ZCM57qn44CB6auY57qn5oiW5L2O57qn55u46YK76IqC54K577yM6YCA5Ye65p+l5om+XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG5leHRMaW5lLm1hdGNoKC9eIytcXHMvKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIOmBh+WIsOagh+mimO+8jOWBnOatouWIhuaekOWtkOiKgueCuVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyDmma7pgJrmlofmnKzvvIjlj6/og73mmK/mjaLooYzlhoXlrrnvvIlcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0ZXh0SW5kZW50TWF0Y2ggPSBuZXh0TGluZS5tYXRjaCgvXihcXHMqKS8pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRleHRJbmRlbnQgPSB0ZXh0SW5kZW50TWF0Y2ggPyB0ZXh0SW5kZW50TWF0Y2hbMV0ubGVuZ3RoIDogMDtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGV4dEluZGVudCA8PSBjdXJyZW50SW5kZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrOyAvLyDnvKnov5vlsI/kuo7nrYnkuo7lvZPliY3oioLngrnvvIzor7TmmI7lubbpnZ7lhbblrZDlhoXlrrlcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpc1BhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgbGV0IHRleHQgPSBtYXRjaFszXTtcclxuICAgICAgICAgICAgICAgIC8vIOWJlOmZpOW3suacieeahOWKoOeyl+agh+iusO+8jOmBv+WFjeW1jOWll1xyXG4gICAgICAgICAgICAgICAgdGV4dCA9IHRleHQucmVwbGFjZSgvXFwqXFwqL2csICcnKTtcclxuICAgICAgICAgICAgICAgIGxpbmVzW2ldID0gYCR7bWF0Y2hbMV19JHttYXRjaFsyXX0qKiR7dGV4dH0qKmA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjb250ZW50ID0gbGluZXMuam9pbignXFxuJyk7XHJcblxyXG4gICAgLy8g8J+SoSDmlLnov5vngrkgMu+8muacrOWcsOehrOe8lueoi+abv+aNouOAguaLpuaIqiBcIiMjIyBbTU06U1NdIOagh+mimFwiIOW5tui9rOaNouS4uueyvuehrui3s+i9rOmTvuaOpVxyXG4gICAgLy8g5q2j5YiZ6Kej6YeK77ya5Yy56YWN5LulIDEtNuS4qiPlvIDlpLTvvIzlkI7ot58gW+aXtumXtOaIs13vvIzmnIDlkI7mmK/moIfpopjnmoTooYxcclxuICAgIGNvbnN0IG5vZGVSZWdleCA9IC9eKCMrKVxccypcXFsoXFxkezEsMn06XFxkezJ9KD86OlxcZHsyfSk/KVxcXVxccyooLiopJC9nbTtcclxuXHJcbiAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlKG5vZGVSZWdleCwgKG1hdGNoOiBzdHJpbmcsIGhhc2hlczogc3RyaW5nLCB0aW1lc3RhbXA6IHN0cmluZywgZGlzcGxheVRpdGxlOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAvLyAxLiDpgJrov4fml7bpl7TmiLPvvIzlj43mn6Xljp/mnKznnJ/lrp7nmoTnq6DoioLmlbDmja5cclxuICAgICAgICBjb25zdCBvcmlnaW5hbENoYXB0ZXIgPSBjaGFwdGVycy5maW5kKGMgPT4gYy50aW1lc3RhbXAgPT09IHRpbWVzdGFtcCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gMi4g6I635Y+W55yf5a6e55qE5qCH6aKY77yI6Ziy5q2iIEFJIOW5u+inieS5seaUueagh+mimOWvvOiHtOi3s+i9rOS4jeWIsOato+ehrueahCBIZWFkaW5n77yJXHJcbiAgICAgICAgY29uc3QgcmVhbFRpdGxlID0gb3JpZ2luYWxDaGFwdGVyID8gb3JpZ2luYWxDaGFwdGVyLnRpdGxlIDogZGlzcGxheVRpdGxlLnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gMy4g5p6E5bu655uu5qCH56yU6K6w5Lit55yf5a6e55qEIEhlYWRpbmcg5a2X56ym5LiyICjlr7nlupQgbWFpbi50cyDph4znmoQgYCMjIyMg4o+x77iPIE1NOlNTIOagh+mimGApXHJcbiAgICAgICAgY29uc3QgdGFyZ2V0SGVhZGluZyA9IGDij7HvuI8gJHt0aW1lc3RhbXB9ICR7cmVhbFRpdGxlfWA7XHJcbiAgICAgICAgY29uc3QgZW5jb2RlZEhlYWRpbmcgPSBlbmNvZGVVUklDb21wb25lbnQodGFyZ2V0SGVhZGluZyk7XHJcblxyXG4gICAgICAgIC8vIDQuIOa4heeQhuaYvuekuueahOagh+mimO+8jOW8uuWItuWKoOS4iiDwn5OMIOWbvuaghyAo5oyJ5L2g55qE6ZyA5rGC77yM5LiN5bim56m65qC8KVxyXG4gICAgICAgIGxldCBjbGVhbkRpc3BsYXlUaXRsZSA9IGRpc3BsYXlUaXRsZS50cmltKCk7XHJcbiAgICAgICAgaWYgKCFjbGVhbkRpc3BsYXlUaXRsZS5zdGFydHNXaXRoKCfwn5OMJykpIHtcclxuICAgICAgICAgICAgY2xlYW5EaXNwbGF5VGl0bGUgPSBg8J+TjCR7Y2xlYW5EaXNwbGF5VGl0bGV9YDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDUuIOi/lOWbnuaLvOaOpeWlveeahOWujOe+jiBIVE1MIOmTvuaOpVxyXG4gICAgICAgIHJldHVybiBgJHtoYXNoZXN9IDxhIGhyZWY9XCJvYnNpZGlhbjovL3NpbGljb24tanVtcD9maWxlPSR7ZW5jb2RlZE5vdGVQYXRofSZoZWFkaW5nPSR7ZW5jb2RlZEhlYWRpbmd9XCI+JHtjbGVhbkRpc3BsYXlUaXRsZX08L2E+YDtcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiBjb250ZW50O1xyXG59XHJcblxyXG4vKipcclxuICog6LCD55SoIExMTSBBUEkg5qC55o2u55So5oi35oyH5Luk6YeN5YaZ5oiW5oC757uT6YCJ5Lit55qE5paH5pysXHJcbiAqIEBwYXJhbSBzZWxlY3RlZFRleHQg6YCJ5Lit55qE5Y6f5aeL5paH5pysXHJcbiAqIEBwYXJhbSBpbnN0cnVjdGlvbiDnlKjmiLfnmoToh6rlrprkuYnopoHmsYJcclxuICogQHBhcmFtIHByb3ZpZGVyIOS9v+eUqOeahCBMTE0g6YWN572uXHJcbiAqIEByZXR1cm5zIOS/ruaUueWQjueahOaWh+acrFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJld3JpdGVTZWxlY3Rpb24oXHJcbiAgICBzZWxlY3RlZFRleHQ6IHN0cmluZyxcclxuICAgIGluc3RydWN0aW9uOiBzdHJpbmcsXHJcbiAgICBwcm92aWRlcjogTExNUHJvdmlkZXJcclxuKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IHByb21wdCA9IGBcclxu5L2g5piv5LiA5Liq5LiT5Lia55qE56yU6K6w5pW055CG5Yqp5omL44CC6K+35qC55o2u55So5oi355qE44CQ54m55a6a6KaB5rGC44CR77yM5a+55o+Q5L6b55qE44CQ6YCJ5Lit5paH5pys44CR6L+b6KGM6YeN5p6E44CB5ram6Imy5oiW5oC757uT44CCXHJcblxyXG7jgJDnibnlrpropoHmsYLjgJHvvJpcclxuJHtpbnN0cnVjdGlvbn1cclxuXHJcbuOAkOmAieS4reaWh+acrOOAke+8mlxyXG4ke3NlbGVjdGVkVGV4dH1cclxuXHJcbuivt+ebtOaOpei+k+WHuuWkhOeQhuWQjueahOe7k+aenO+8jOS4jeimgeWMheWQq+S7u+S9leWvkuaahOivreOAgeino+mHiuaAp+ivneivreaIluWkmuS9meeahOS7o+eggeWdl+agh+iusO+8iOmZpOmdnueUqOaIt+imgeaxgui+k+WHuuS7o+eggeWdl++8ieOAglxyXG5gO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0RGlyZWN0KHtcclxuICAgICAgICAgICAgdXJsOiBwcm92aWRlci5CQVNFX1VSTCxcclxuICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtwcm92aWRlci5BUElfS0VZfWBcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgICAgICAgbW9kZWw6IHByb3ZpZGVyLk1PREVMLFxyXG4gICAgICAgICAgICAgICAgbWVzc2FnZXM6IFtcclxuICAgICAgICAgICAgICAgIHsgcm9sZTogXCJzeXN0ZW1cIiwgY29udGVudDogXCJZb3UgYXJlIGEgcHJvZmVzc2lvbmFsIHdyaXRpbmcgYW5kIHN1bW1hcml6aW5nIGFzc2lzdGFudC4gUHJvdmlkZSBkaXJlY3QgcmVzdWx0cyB3aXRob3V0IGNvbnZlcnNhdGlvbmFsIGZpbGxlci4gT3V0cHV0IG1hdGhlbWF0aWNhbCBmb3JtdWxhcyB1c2luZyBMYVRlWCBzeW50YXggd3JhcHBlZCBpbiBpbmxpbmUgJC4uLiQuXCIgfSxcclxuICAgICAgICAgICAgICAgICAgICB7IHJvbGU6IFwidXNlclwiLCBjb250ZW50OiBwcm9tcHQgfVxyXG4gICAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgICAgIHN0cmVhbTogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICB0ZW1wZXJhdHVyZTogMC4zLFxyXG4gICAgICAgICAgICAgICAgdGhpbmtpbmc6IHsgdHlwZTogXCJlbmFibGVkXCIgfVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBsZXQgY29udGVudCA9IHJlc3BvbnNlLmpzb24uY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50IHx8IFwiXCI7XHJcbiAgICAgICAgLy8g5Y675o6J5oCd6ICD6L+H56iLXHJcbiAgICAgICAgY29udGVudCA9IGNvbnRlbnQucmVwbGFjZSgvPHRoaW5rPltcXHNcXFNdKj88XFwvdGhpbms+L2csICcnKS50cmltKCk7XHJcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlJld3JpdGUgU2VsZWN0aW9uIEFQSSBFcnJvcjpcIiwgZSk7XHJcbiAgICAgICAgdGhyb3cgZTtcclxuICAgIH1cclxufVxyXG4vKipcclxuICog5Y2V5qyhIExMTSDosIPnlKjorrDlvZVcclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgTExNQ2FsbFJlY29yZCB7XHJcbiAgICBiYXRjaEluZGV4OiBudW1iZXI7ICAgICAgLy8g5om55qyh57Si5byVICgtMSDooajnpLrlhajlsYDliIbmnpAv5oCd57u05a+85Zu+KVxyXG4gICAgcGhhc2U6ICdiYXRjaCcgfCAnZ2xvYmFsJyB8ICdtaW5kbWFwJyB8ICdyZXBvcnQnOyAgLy8g6LCD55So6Zi25q61XHJcbiAgICBwcm92aWRlcjogc3RyaW5nOyAgICAgICAgLy8gUHJvdmlkZXIg5ZCN56ewXHJcbiAgICBtb2RlbDogc3RyaW5nOyAgICAgICAgICAgLy8g5qih5Z6L5ZCN56ewXHJcbiAgICBhdHRlbXB0OiBudW1iZXI7ICAgICAgICAgLy8g5bCd6K+V5qyh5pWwXHJcbiAgICBzdWNjZXNzOiBib29sZWFuOyAgICAgICAgLy8g5piv5ZCm5oiQ5YqfXHJcbiAgICBlcnJvcj86IHN0cmluZzsgICAgICAgICAgLy8g6ZSZ6K+v5L+h5oGvXHJcbiAgICBkdXJhdGlvbk1zPzogbnVtYmVyOyAgICAgLy8g6ICX5pe277yI5q+r56eS77yJXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBMTE0g5L2/55So57uf6K6h5pGY6KaBXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIExMTVVzYWdlU3RhdHMge1xyXG4gICAgdG90YWxDYWxsczogbnVtYmVyOyAgICAgICAgICAgLy8g5oC76LCD55So5qyh5pWwXHJcbiAgICBzdWNjZXNzQ2FsbHM6IG51bWJlcjsgICAgICAgICAvLyDmiJDlip/mrKHmlbBcclxuICAgIGZhaWxlZENhbGxzOiBudW1iZXI7ICAgICAgICAgIC8vIOWksei0peasoeaVsFxyXG4gICAgcHJvdmlkZXJzVXNlZDogc3RyaW5nW107ICAgICAgLy8g5L2/55So55qEIFByb3ZpZGVyIOWIl+ihqFxyXG4gICAgbW9kZWxzVXNlZDogc3RyaW5nW107ICAgICAgICAgLy8g5L2/55So55qE5qih5Z6L5YiX6KGoXHJcbiAgICB0b3RhbER1cmF0aW9uTXM6IG51bWJlcjsgICAgICAvLyDmgLvogJfml7bvvIjmr6vnp5LvvIlcclxuICAgIGVycm9yU3VtbWFyeTogc3RyaW5nW107ICAgICAgIC8vIOmUmeivr+aRmOimgVxyXG59XHJcblxyXG4vKipcclxuICog5Lu75Yqh5oql5ZGK5o6l5Y+jXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIFRhc2tSZXBvcnREYXRhIHtcclxuICAgIHZpZGVvRmlsZU5hbWU6IHN0cmluZztcclxuICAgIHRvdGFsRHVyYXRpb246IG51bWJlcjtcclxuICAgIHRvdGFsQmF0Y2hlczogbnVtYmVyO1xyXG4gICAgc3VjY2Vzc0JhdGNoZXM6IG51bWJlcjtcclxuICAgIGZhaWxlZEJhdGNoZXM6IG51bWJlcjtcclxuICAgIGFwaVVzYWdlTG9nOiBzdHJpbmdbXTtcclxuICAgIGVycm9yTG9nOiBzdHJpbmdbXTtcclxuICAgIGxsbUNhbGxSZWNvcmRzOiBMTE1DYWxsUmVjb3JkW107ICAvLyDnu5PmnoTljJYgTExNIOiwg+eUqOiusOW9lVxyXG4gICAgZ2xvYmFsQW5hbHlzaXNTdWNjZXNzOiBib29sZWFuO1xyXG4gICAgbWluZG1hcFN1Y2Nlc3M6IGJvb2xlYW47XHJcbiAgICBkdXJhdGlvblNlY29uZHM6IG51bWJlcjtcclxuICAgIGdlbmVyYXRlZE5vdGVDb250ZW50Pzogc3RyaW5nOyAgLy8g55Sf5oiQ55qE56yU6K6w5YaF5a6577yM55So5LqO5qOA5p+lIExhVGVYIOmXrumimFxyXG59XHJcblxyXG4vKipcclxuICog6K6h566XIExMTSDkvb/nlKjnu5/orqFcclxuICovXHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZUxMTVN0YXRzKHJlY29yZHM6IExMTUNhbGxSZWNvcmRbXSk6IExMTVVzYWdlU3RhdHMge1xyXG4gICAgY29uc3Qgc3RhdHM6IExMTVVzYWdlU3RhdHMgPSB7XHJcbiAgICAgICAgdG90YWxDYWxsczogcmVjb3Jkcy5sZW5ndGgsXHJcbiAgICAgICAgc3VjY2Vzc0NhbGxzOiAwLFxyXG4gICAgICAgIGZhaWxlZENhbGxzOiAwLFxyXG4gICAgICAgIHByb3ZpZGVyc1VzZWQ6IFtdLFxyXG4gICAgICAgIG1vZGVsc1VzZWQ6IFtdLFxyXG4gICAgICAgIHRvdGFsRHVyYXRpb25NczogMCxcclxuICAgICAgICBlcnJvclN1bW1hcnk6IFtdXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBjb25zdCBwcm92aWRlclNldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG4gICAgY29uc3QgbW9kZWxTZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuICAgIFxyXG4gICAgZm9yIChjb25zdCByZWNvcmQgb2YgcmVjb3Jkcykge1xyXG4gICAgICAgIGlmIChyZWNvcmQuc3VjY2Vzcykge1xyXG4gICAgICAgICAgICBzdGF0cy5zdWNjZXNzQ2FsbHMrKztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBzdGF0cy5mYWlsZWRDYWxscysrO1xyXG4gICAgICAgICAgICBpZiAocmVjb3JkLmVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICBzdGF0cy5lcnJvclN1bW1hcnkucHVzaChgWyR7cmVjb3JkLnBoYXNlfV0g5om55qyhJHtyZWNvcmQuYmF0Y2hJbmRleCArIDF9OiAke3JlY29yZC5lcnJvcn1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBwcm92aWRlclNldC5hZGQocmVjb3JkLnByb3ZpZGVyKTtcclxuICAgICAgICBtb2RlbFNldC5hZGQocmVjb3JkLm1vZGVsKTtcclxuICAgICAgICBpZiAocmVjb3JkLmR1cmF0aW9uTXMpIHtcclxuICAgICAgICAgICAgc3RhdHMudG90YWxEdXJhdGlvbk1zICs9IHJlY29yZC5kdXJhdGlvbk1zO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgc3RhdHMucHJvdmlkZXJzVXNlZCA9IEFycmF5LmZyb20ocHJvdmlkZXJTZXQpO1xyXG4gICAgc3RhdHMubW9kZWxzVXNlZCA9IEFycmF5LmZyb20obW9kZWxTZXQpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gc3RhdHM7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiDnlJ/miJDku7vliqHlrozmiJDmiqXlkYrvvIjkvb/nlKjllYbmsaQv5Lqs5Lic5LqR5qih5Z6L77yJXHJcbiAqIEBwYXJhbSByZXBvcnREYXRhIOS7u+WKoeaJp+ihjOaVsOaNrlxyXG4gKiBAcmV0dXJucyBNYXJrZG93biDmoLzlvI/nmoTmiqXlkYrlhoXlrrlcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVRhc2tSZXBvcnQocmVwb3J0RGF0YTogVGFza1JlcG9ydERhdGEpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgLy8g5o+Q5Y+W56yU6K6w5YaF5a655Lit55qE5pWw5a2m5YWs5byP54mH5q615L6bIExMTSDliIbmnpBcclxuICAgIGxldCBmb3JtdWxhU2VjdGlvbiA9ICcnO1xyXG4gICAgaWYgKHJlcG9ydERhdGEuZ2VuZXJhdGVkTm90ZUNvbnRlbnQpIHtcclxuICAgICAgICAvLyDmj5Dlj5bmiYDmnIkgJC4uLiQg5ZKMICQkLi4uJCQg5Lit55qE5pWw5a2m5YWs5byPXHJcbiAgICAgICAgY29uc3QgaW5saW5lRm9ybXVsYXMgPSByZXBvcnREYXRhLmdlbmVyYXRlZE5vdGVDb250ZW50Lm1hdGNoKC9cXCRbXiRdK1xcJC9nKSB8fCBbXTtcclxuICAgICAgICBjb25zdCBkaXNwbGF5Rm9ybXVsYXMgPSByZXBvcnREYXRhLmdlbmVyYXRlZE5vdGVDb250ZW50Lm1hdGNoKC9cXCRcXCRbXiRdK1xcJFxcJC9nKSB8fCBbXTtcclxuICAgICAgICBjb25zdCBhbGxGb3JtdWxhcyA9IFsuLi5pbmxpbmVGb3JtdWxhcywgLi4uZGlzcGxheUZvcm11bGFzXTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYWxsRm9ybXVsYXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAvLyDlj5bliY0gMzAg5Liq5YWs5byP6L+b6KGM5YiG5p6QXHJcbiAgICAgICAgICAgIGZvcm11bGFTZWN0aW9uID0gYFxcbiMjIOeUn+aIkOeahOaVsOWtpuWFrOW8j++8iOWFsSAke2FsbEZvcm11bGFzLmxlbmd0aH0g5Liq77yM5bGV56S65YmNIDMwIOS4qu+8iVxcbiR7YWxsRm9ybXVsYXMuc2xpY2UoMCwgMzApLm1hcCgoZiwgaSkgPT4gYCR7aSArIDF9LiAke2Z9YCkuam9pbignXFxuJyl9YDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIOiuoeeulyBMTE0g5L2/55So57uf6K6hXHJcbiAgICBjb25zdCBsbG1TdGF0cyA9IGNhbGN1bGF0ZUxMTVN0YXRzKHJlcG9ydERhdGEubGxtQ2FsbFJlY29yZHMgfHwgW10pO1xyXG4gICAgXHJcbiAgICAvLyDmnoTlu7ogTExNIOS9v+eUqOaDheWGtemDqOWIhlxyXG4gICAgbGV0IGxsbVVzYWdlU2VjdGlvbiA9IGBcclxuIyMgTExNIOiwg+eUqOe7n+iuoVxyXG4tIOaAu+iwg+eUqOasoeaVsDogJHtsbG1TdGF0cy50b3RhbENhbGxzfSDmrKFcclxuLSDmiJDlip/mrKHmlbA6ICR7bGxtU3RhdHMuc3VjY2Vzc0NhbGxzfSDmrKFcclxuLSDlpLHotKXmrKHmlbA6ICR7bGxtU3RhdHMuZmFpbGVkQ2FsbHN9IOasoVxyXG4tIOS9v+eUqOeahCBQcm92aWRlcjogJHtsbG1TdGF0cy5wcm92aWRlcnNVc2VkLmpvaW4oJywgJykgfHwgJ+aXoOiusOW9lSd9XHJcbi0g5L2/55So55qE5qih5Z6LOiAke2xsbVN0YXRzLm1vZGVsc1VzZWQuam9pbignLCAnKSB8fCAn5peg6K6w5b2VJ31cclxuLSBMTE0g5oC76ICX5pe2OiAkeyhsbG1TdGF0cy50b3RhbER1cmF0aW9uTXMgLyAxMDAwKS50b0ZpeGVkKDEpfSDnp5JgO1xyXG4gICAgXHJcbiAgICAvLyDlpoLmnpzmnInlpLHotKXorrDlvZXvvIzmt7vliqDor6bnu4bkv6Hmga9cclxuICAgIGlmIChsbG1TdGF0cy5mYWlsZWRDYWxscyA+IDApIHtcclxuICAgICAgICBsbG1Vc2FnZVNlY3Rpb24gKz0gYFxcbi0g4pqg77iPIOWksei0peivpuaDhTpcclxuJHtsbG1TdGF0cy5lcnJvclN1bW1hcnkuc2xpY2UoMCwgNSkubWFwKGUgPT4gYCAgLSAke2V9YCkuam9pbignXFxuJyl9YDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgY29uc3QgcHJvbXB0ID0gYOS9oOaYr+S4k+S4mueahOS7u+WKoeaKpeWRiueUn+aIkOWZqOWSjCBMYVRlWCDmoLzlvI/mo4Dmn6XkuJPlrrbjgILor7fmoLnmja7ku6XkuIvmlbDmja7nlJ/miJDmiqXlkYrvvJpcclxuXHJcbiMjIOS7u+WKoeaJp+ihjOaVsOaNrlxyXG4tIOaWh+S7tjogJHtyZXBvcnREYXRhLnZpZGVvRmlsZU5hbWV9XHJcbi0g5pe26ZW/OiAke01hdGguZmxvb3IocmVwb3J0RGF0YS50b3RhbER1cmF0aW9uIC8gNjApfeWIhiR7TWF0aC5mbG9vcihyZXBvcnREYXRhLnRvdGFsRHVyYXRpb24gJSA2MCl956eSXHJcbi0g5om55qyhOiAke3JlcG9ydERhdGEuc3VjY2Vzc0JhdGNoZXN9LyR7cmVwb3J0RGF0YS50b3RhbEJhdGNoZXN9IOaIkOWKn1xyXG4tIOaAu+iAl+aXtjogJHtyZXBvcnREYXRhLmR1cmF0aW9uU2Vjb25kc33np5JcclxuLSDlhajlsYDliIbmnpA6ICR7cmVwb3J0RGF0YS5nbG9iYWxBbmFseXNpc1N1Y2Nlc3MgPyAn5oiQ5YqfJyA6ICflpLHotKUnfVxyXG4tIOaAnee7tOWvvOWbvjogJHtyZXBvcnREYXRhLm1pbmRtYXBTdWNjZXNzID8gJ+aIkOWKnycgOiAn5aSx6LSlJ31cclxuJHtsbG1Vc2FnZVNlY3Rpb259XHJcbiR7cmVwb3J0RGF0YS5lcnJvckxvZy5sZW5ndGggPiAwID8gJy0g6ZSZ6K+v5pel5b+XOiAnICsgcmVwb3J0RGF0YS5lcnJvckxvZy5zbGljZSgwLCA1KS5qb2luKCdcXG4gICcpIDogJyd9XHJcbiR7Zm9ybXVsYVNlY3Rpb259XHJcblxyXG4jIyDmiqXlkYropoHmsYJcclxuXHJcbiMjIyAxLiDmiafooYzmpoLop4hcclxu566A6KaB5oC757uT5Lu75Yqh5piv5ZCm6aG65Yip5a6M5oiQ77yIMS0yIOWPpeivne+8ie+8jOW5tueugOimgeaPkOWPiiBMTE0g5L2/55So5oOF5Ya177yI5piv5ZCm5q2j5bi444CB5pyJ5peg5byC5bi477yJ44CCXHJcblxyXG4jIyMgMi4gTGFUZVgg5qC85byP5rex5bqm5qOA5p+l77yI5pyA6YeN6KaB77yB77yJXHJcbuS7lOe7huajgOafpeS4iumdoueahOavj+S4quaVsOWtpuWFrOW8j++8jOivhuWIq+S7peS4i+i9rOS5iemUmeivr++8mlxyXG5cclxuKirluLjop4HplJnor6/nsbvlnovvvJoqKlxyXG4tICoq5Y+M5Y+N5pac5p2g6Zeu6aKYKirvvJrlhazlvI/kuK3lh7rnjrAgXFxgXFxcXFxcXFxsZWZ0XFxgIFxcYFxcXFxcXFxcZnJhY1xcYCBcXGBcXFxcXFxcXHBhcnRpYWxcXGAg562J77yM5bqU5Li65Y2V5Y+N5pac5p2gIFxcYFxcXFxsZWZ0XFxgIFxcYFxcXFxmcmFjXFxgIFxcYFxcXFxwYXJ0aWFsXFxgXHJcbi0gKirluIzohYrlrZfmr43ovazkuYkqKu+8mlxcYFxcXFxcXFxcYWxwaGFcXGAgXFxgXFxcXFxcXFxiZXRhXFxgIFxcYFxcXFxcXFxcZXBzaWxvblxcYCDnrYnvvIzlupTkuLogXFxgXFxcXGFscGhhXFxgIFxcYFxcXFxiZXRhXFxgIFxcYFxcXFxlcHNpbG9uXFxgXHJcbi0gKirlhbbku5blkb3ku6QqKu+8mlxcYFxcXFxcXFxcc3VtXFxgIFxcYFxcXFxcXFxcaW50XFxgIFxcYFxcXFxcXFxcc3FydFxcYCDnrYnvvIzlupTkuLogXFxgXFxcXHN1bVxcYCBcXGBcXFxcaW50XFxgIFxcYFxcXFxzcXJ0XFxgXHJcblxyXG4qKui+k+WHuuagvOW8j++8iOWmguaenOWPkeeOsOmXrumimO+8ie+8mioqXHJcbj4gWyFkYW5nZXJdIOKaoO+4jyBMYVRlWCDovazkuYnplJnor6/mo4DmtYtcclxuPiDlj5HnjrAgWCDlpITpl67popjvvJpcclxuPiBcclxuPiB8IOW6j+WPtyB8IOmUmeivr+WFrOW8jyB8IOato+ehruWGmeazlSB8IOmXrumimOexu+WeiyB8XHJcbj4gfC0tLS0tfC0tLS0tLS0tLXwtLS0tLS0tLS18LS0tLS0tLS0tfFxyXG4+IHwgMSAgIHwgXFxgJFxcXFxcXFxcbGVmdCh4XFxcXFxcXFxyaWdodCkkXFxgIHwgXFxgJFxcXFxsZWZ0KHhcXFxccmlnaHQpJFxcYCB8IOWPjOWPjeaWnOadoCB8XHJcbj4gfCAyICAgfCBcXGAkXFxcXFxcXFxmcmFje2F9e2J9JFxcYCB8IFxcYCRcXFxcZnJhY3thfXtifSRcXGAgfCDlj4zlj43mlpzmnaAgfFxyXG4+IFxyXG4+ICoq5qC55Zug5YiG5p6QKirvvJpb6K+05piO5pivIEpTT04g5bqP5YiX5YyW44CB5a2X56ym5Liy6L2s5LmJ6L+Y5piv5YW25LuW5Y6f5Zug5a+86Ie0XVxyXG4+ICoq5L+u5aSN5bu66K6uKirvvJpb57uZ56iL5bqP5ZGY55qE5YW35L2T5Luj56CB5L+u5aSN5bu66K6u77yM5oyH5Ye65ZOq5Liq5qih5Z2X6ZyA6KaB5L+u5pS5XVxyXG5cclxu5aaC5p6c5omA5pyJ5YWs5byP6YO95q2j56Gu77yM5YaZ77yaXCLinIUgTGFUZVgg5qC85byP5qOA5p+l6YCa6L+H77yM5peg6L2s5LmJ6ZSZ6K+vXCJcclxuXHJcbiMjIyAzLiDpl67popjkuI7lu7rorq5cclxu5LuF5Zyo5a6e6ZmF5a2Y5Zyo5omn6KGM6ZSZ6K+v5oiW5qC85byP6Zeu6aKY5pe257uZ5Ye65YiG5p6Q5ZKM5bu66K6u44CCYDtcclxuXHJcbiAgICAvLyDmiqXlkYrnlJ/miJDlh73mlbDvvIjlhoXpg6jlrp7njrDvvIlcclxuICAgIGNvbnN0IGdlbmVyYXRlUmVwb3J0V2l0aFByb3ZpZGVyID0gYXN5bmMgKHByb3ZpZGVyOiB0eXBlb2YgTExNX1JFUE9SVF9DT05GSUcsIHByb3ZpZGVyTmFtZTogc3RyaW5nKTogUHJvbWlzZTx7IGNvbnRlbnQ6IHN0cmluZyB8IG51bGw7IGVycm9yPzogc3RyaW5nIH0+ID0+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TiyDlsJ3or5Xkvb/nlKggJHtwcm92aWRlck5hbWV9IOeUn+aIkOaKpeWRii4uLmApO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0RGlyZWN0KHtcclxuICAgICAgICAgICAgICAgIHVybDogcHJvdmlkZXIuQkFTRV9VUkwsXHJcbiAgICAgICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3Byb3ZpZGVyLkFQSV9LRVl9YFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICAgICAgICAgICAgICBtb2RlbDogcHJvdmlkZXIuTU9ERUwsXHJcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZXM6IFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBcIuS9oOaYr+S4gOS9jeS4k+S4mueahOS7u+WKoeaKpeWRiueUn+aIkOWZqOWSjCBMYVRlWCDmoLzlvI/mo4Dmn6XkuJPlrrbjgILor7flrqLop4LjgIHnnJ/lrp7jgIHor6bnu4blnLDnlJ/miJDmiqXlkYrvvIznibnliKvlhbPms6ggTGFUZVgg6L2s5LmJ6Zeu6aKY44CC5L2/55So5Lit5paH6L6T5Ye644CC5Y+R546w6Zeu6aKY5b+F6aG75YiX5Ye65YW35L2T6ZSZ6K+v77yM5biu5Yqp56iL5bqP5ZGY5a6a5L2N5ZKM5L+u5aSN5Luj56CB44CCXCIgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyByb2xlOiBcInVzZXJcIiwgY29udGVudDogcHJvbXB0IH1cclxuICAgICAgICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICAgICAgICAgIHN0cmVhbTogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgICAgdGVtcGVyYXR1cmU6IDAuMVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBsZXQgY29udGVudCA9IHJlc3BvbnNlLmpzb24uY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50IHx8IFwiXCI7XHJcbiAgICAgICAgICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoLzx0b29sX2NhbGw+W1xcc1xcU10qPzxcXC90aGluaz4vZywgJycpLnRyaW0oKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgJHtwcm92aWRlck5hbWV9IOaKpeWRiueUn+aIkOaIkOWKn2ApO1xyXG4gICAgICAgICAgICByZXR1cm4geyBjb250ZW50IH07XHJcbiAgICAgICAgfSBjYXRjaCAoZTogYW55KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVycm9yTXNnID0gZS5tZXNzYWdlIHx8IFN0cmluZyhlKTtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gJHtwcm92aWRlck5hbWV9IOaKpeWRiueUn+aIkOWksei0pTpgLCBlcnJvck1zZyk7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGNvbnRlbnQ6IG51bGwsIGVycm9yOiBlcnJvck1zZyB9O1xyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgLy8g5oql5ZGK5aS077yI5YyF5ZCr55Sf5oiQ5L+h5oGv77yJXHJcbiAgICBjb25zdCBidWlsZFJlcG9ydEhlYWRlciA9IChwcm92aWRlck5hbWU6IHN0cmluZywgdXNlZEZhbGxiYWNrOiBib29sZWFuLCBwcmltYXJ5RXJyb3I/OiBzdHJpbmcpID0+IHtcclxuICAgICAgICBsZXQgaGVhZGVyID0gYFxcblxcbi0tLVxcblxcbj4gWyFzdW1tYXJ5XSDwn5OLIOS7u+WKoeWujOaIkOaKpeWRilxcbj4g55Sf5oiQ5pe26Ze0OiAke25ldyBEYXRlKCkudG9Mb2NhbGVTdHJpbmcoJ3poLUNOJyl9XFxuYDtcclxuICAgICAgICBcclxuICAgICAgICAvLyDmt7vliqDmiqXlkYrnlJ/miJDmqKHlnovkv6Hmga9cclxuICAgICAgICBoZWFkZXIgKz0gYD5cXG4+ICoq5oql5ZGK55Sf5oiQ5qih5Z6LKio6ICR7cHJvdmlkZXJOYW1lfWA7XHJcbiAgICAgICAgaWYgKHVzZWRGYWxsYmFjaykge1xyXG4gICAgICAgICAgICBoZWFkZXIgKz0gYCDimqDvuI8o5aSH55So5r+A5rS7KWA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGhlYWRlciArPSBgXFxuYDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAocHJpbWFyeUVycm9yKSB7XHJcbiAgICAgICAgICAgIC8vIOaIquaWrei/h+mVv+eahOmUmeivr+S/oeaBr1xyXG4gICAgICAgICAgICBjb25zdCBzaG9ydEVycm9yID0gcHJpbWFyeUVycm9yLmxlbmd0aCA+IDgwID8gcHJpbWFyeUVycm9yLnNsaWNlKDAsIDgwKSArICcuLi4nIDogcHJpbWFyeUVycm9yO1xyXG4gICAgICAgICAgICBoZWFkZXIgKz0gYD4gKirkuLvmqKHlnovlpLHotKXljp/lm6AqKjogJHtzaG9ydEVycm9yfVxcbmA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBoZWFkZXIgKyAnXFxuJztcclxuICAgIH07XHJcblxyXG4gICAgLy8g5LyY5YWI5L2/55So5ZWG5rGkIERlZXBTZWVrLVY0LUZsYXNoXHJcbiAgICBjb25zdCBwcmltYXJ5UmVzdWx0ID0gYXdhaXQgZ2VuZXJhdGVSZXBvcnRXaXRoUHJvdmlkZXIoTExNX1JFUE9SVF9DT05GSUcsICfllYbmsaQgRGVlcFNlZWstVjQtRmxhc2gnKTtcclxuICAgIGxldCBjb250ZW50ID0gcHJpbWFyeVJlc3VsdC5jb250ZW50O1xyXG4gICAgbGV0IHVzZWRGYWxsYmFjayA9IGZhbHNlO1xyXG4gICAgbGV0IHByaW1hcnlFcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkID0gcHJpbWFyeVJlc3VsdC5lcnJvcjtcclxuICAgIFxyXG4gICAgLy8g5aaC5p6c5ZWG5rGk5aSx6LSl77yM5Zue6YCA5Yiw5Lqs5Lic5LqRIEtpbWktSzIuNVxyXG4gICAgaWYgKCFjb250ZW50KSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ/CflIQg5YiH5o2i5Yiw5aSH55SoIFByb3ZpZGVyOiDkuqzkuJzkupEgS2ltaS1LMi41Jyk7XHJcbiAgICAgICAgY29uc3QgZmFsbGJhY2tSZXN1bHQgPSBhd2FpdCBnZW5lcmF0ZVJlcG9ydFdpdGhQcm92aWRlcihMTE1fUkVQT1JUX0ZBTExCQUNLLCAn5Lqs5Lic5LqRIEtpbWktSzIuNScpO1xyXG4gICAgICAgIGNvbnRlbnQgPSBmYWxsYmFja1Jlc3VsdC5jb250ZW50O1xyXG4gICAgICAgIHVzZWRGYWxsYmFjayA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNvbnRlbnQpIHtcclxuICAgICAgICBjb25zdCBwcm92aWRlck5hbWUgPSB1c2VkRmFsbGJhY2sgPyAn5Lqs5Lic5LqRIEtpbWktSzIuNScgOiAn5ZWG5rGkIERlZXBTZWVrLVY0LUZsYXNoJztcclxuICAgICAgICByZXR1cm4gYnVpbGRSZXBvcnRIZWFkZXIocHJvdmlkZXJOYW1lLCB1c2VkRmFsbGJhY2ssIHByaW1hcnlFcnJvcikgKyBjb250ZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIOS4pOS4qumDveWksei0pe+8jOi/lOWbnueugOWMlueJiOaKpeWRilxyXG4gICAgY29uc29sZS5lcnJvcign4p2MIOaJgOacieaKpeWRiueUn+aIkCBQcm92aWRlciDlnYflpLHotKUnKTtcclxuICAgIGNvbnN0IGVycm9ySW5mbyA9IHByaW1hcnlFcnJvciA/IGDllYbmsaQ6ICR7cHJpbWFyeUVycm9yLnNsaWNlKDAsIDUwKX0uLi5gIDogJ+acquefpemUmeivryc7XHJcbiAgICByZXR1cm4gYFxcblxcbi0tLVxcblxcbj4gWyF3YXJuaW5nXSDwn5OLIOS7u+WKoeWujOaIkOaKpeWRiiAo566A5YyW54mIKVxcbj4g55Sf5oiQ5pe26Ze0OiAke25ldyBEYXRlKCkudG9Mb2NhbGVTdHJpbmcoJ3poLUNOJyl9XFxuPiBcXG4+IC0g6KeG6aKR5paH5Lu2OiAke3JlcG9ydERhdGEudmlkZW9GaWxlTmFtZX1cXG4+IC0g5oC75om55qyhOiAke3JlcG9ydERhdGEudG90YWxCYXRjaGVzfVxcbj4gLSDmiJDlip/mibnmrKE6ICR7cmVwb3J0RGF0YS5zdWNjZXNzQmF0Y2hlc31cXG4+IC0g5aSx6LSl5om55qyhOiAke3JlcG9ydERhdGEuZmFpbGVkQmF0Y2hlc31cXG4+IC0g5YWo5bGA5YiG5p6QOiAke3JlcG9ydERhdGEuZ2xvYmFsQW5hbHlzaXNTdWNjZXNzID8gJ+KchScgOiAn4p2MJ31cXG4+IC0g5oCd57u05a+85Zu+OiAke3JlcG9ydERhdGEubWluZG1hcFN1Y2Nlc3MgPyAn4pyFJyA6ICfinYwnfVxcbj4gXFxuPiDinYwg6K+m57uG5oql5ZGK55Sf5oiQ5aSx6LSlOiAke2Vycm9ySW5mb31cXG5gO1xyXG4gICAgcmV0dXJuIGBcXG5cXG4tLS1cXG5cXG4+IFshd2FybmluZ10g8J+TiyDku7vliqHlrozmiJDmiqXlkYogKOeugOWMlueJiClcXG4+IOeUn+aIkOaXtumXtDogJHtuZXcgRGF0ZSgpLnRvTG9jYWxlU3RyaW5nKCd6aC1DTicpfVxcbj4gXFxuPiAtIOinhumikeaWh+S7tjogJHtyZXBvcnREYXRhLnZpZGVvRmlsZU5hbWV9XFxuPiAtIOaAu+aJueasoTogJHtyZXBvcnREYXRhLnRvdGFsQmF0Y2hlc31cXG4+IC0g5oiQ5Yqf5om55qyhOiAke3JlcG9ydERhdGEuc3VjY2Vzc0JhdGNoZXN9XFxuPiAtIOWksei0peaJueasoTogJHtyZXBvcnREYXRhLmZhaWxlZEJhdGNoZXN9XFxuPiAtIOWFqOWxgOWIhuaekDogJHtyZXBvcnREYXRhLmdsb2JhbEFuYWx5c2lzU3VjY2VzcyA/ICfinIUnIDogJ+KdjCd9XFxuPiAtIOaAnee7tOWvvOWbvjogJHtyZXBvcnREYXRhLm1pbmRtYXBTdWNjZXNzID8gJ+KchScgOiAn4p2MJ31cXG4+IFxcbj4g4pqg77iPIOivpue7huaKpeWRiueUn+aIkOWksei0pe+8jOivt+ajgOafpeaXpeW/l+OAglxcbmA7XHJcbn0iXX0=