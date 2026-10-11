/**
 * 🧠 LLM 大语言模型模块
 * 处理 AI 章节分析和思维导图生成
 */

import { App, Notice, TFile } from 'obsidian';
import { requestDirect } from './http-direct';
import { LLM_CONFIG, LLM_GLOBAL_CONFIG, LLM_MINDMAP_CONFIG, LLM_REPORT_CONFIG, LLM_REPORT_FALLBACK, LLMProvider, LLM_PROVIDERS } from './config';
import { ChapterSummary, NoteMetaData, ExampleItem, GlobalCorrectionResult } from './types';
import { formatTime, parseTime } from './utils';
import { LatexProtect } from './latex-protect';

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
function fixJsonBackslashes(content: string): string {
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
            } else if (next === '\\') {
                // 特殊处理连续反斜杠 \\：两个反斜杠一起跳过，不双写
                // 这是因为阶段一已经处理过 LaTeX 命令，双反斜杠表示保护后的命令前缀
                fixed += result[i];
                i += 2;
            } else if (next === 'u') {
                // 检查 \uXXXX 格式
                const hexPart = result.slice(i + 2, i + 6);
                if (/^[0-9a-fA-F]{4}$/.test(hexPart)) {
                    fixed += result.slice(i, i + 6);
                    i += 6;
                } else {
                    // 非法 \u 序列，双写反斜杠
                    fixed += '\\\\';
                    i += 1;
                }
            } else if (next === undefined) {
                // 字符串末尾的孤立反斜杠
                fixed += '\\\\';
                i += 1;
            } else {
                // 所有其他情况（LaTeX 命令如 \alpha, \sum, \int 等）
                // 双写反斜杠进行保护
                fixed += '\\\\';
                i += 1;
            }
        } else {
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
function extractJsonArray(content: string): string | null {
    // 尝试找到 JSON 数组的起始和结束位置
    const start = content.indexOf('[');
    if (start === -1) return null;
    
    let depth = 0;
    let end = -1;
    
    for (let i = start; i < content.length; i++) {
        if (content[i] === '[') depth++;
        else if (content[i] === ']') {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    
    if (end === -1) return null;
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
  function sanitizeJsonString(raw: string): string {
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
  function tryParseTruncatedJson(raw: string): ChapterSummary[] | null {
    try {
      let s = raw.trim();

      // 确保从第一个 { 开始
      const start = s.indexOf('{');
      if (start === -1) return null;
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
        if (inString) continue;

        if (ch === '{') braceDepth++;
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
        if (!summaryMatch) return null;

        // 找最后一个 summary 键的位置
        let lastSummaryIdx = -1;
        let searchIdx = 0;
        while (true) {
          const idx = sanitized.indexOf('"summary"', searchIdx);
          if (idx === -1) break;
          lastSummaryIdx = idx;
          searchIdx = idx + 1;
        }

        if (lastSummaryIdx === -1) return null;

        // 从 summary 键开始往后找引号
        const afterSummary = sanitized.substring(lastSummaryIdx);
        const colonIdx = afterSummary.indexOf(':');
        if (colonIdx === -1) return null;

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

        if (valueQuoteStart === -1) return null;

        // 从 value 开始引号往后，找是否有闭合引号
        const valueContent = afterSummary.substring(valueQuoteStart + 1);
        // 查找未转义的闭合引号
        let closingQuoteIdx = -1;
        let esc = false;
        for (let i = 0; i < valueContent.length; i++) {
          if (esc) { esc = false; continue; }
          if (valueContent[i] === '\\') { esc = true; continue; }
          if (valueContent[i] === '"') { closingQuoteIdx = i; break; }
        }

        if (closingQuoteIdx !== -1) {
          // summary 值有闭合引号，但整体 JSON 可能缺少后续内容
          // 截取到这里然后补全
          const cutPos = lastSummaryIdx + valueQuoteStart + 1 + closingQuoteIdx + 1;
          s = sanitized.substring(0, cutPos);
        } else {
          // summary 值被截断：补一个闭合引号
          const cutPos = lastSummaryIdx + valueQuoteStart + 1;
          s = sanitized.substring(0, cutPos) + '"';  // 补全闭合引号
        }

        // 补全括号
        // 统计需要的闭合括号
        let openBraces = 0, openBrackets = 0;
        let inStr = false, esc2 = false;
        for (let i = 0; i < s.length; i++) {
          const ch = s[i];
          if (esc2) { esc2 = false; continue; }
          if (ch === '\\' && inStr) { esc2 = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (ch === '{') openBraces++;
          else if (ch === '}') openBraces--;
          else if (ch === '[') openBrackets++;
          else if (ch === ']') openBrackets--;
        }

        // 补全缺失的闭合括号
        let closing = '';
        for (let i = 0; i < openBrackets; i++) closing += ']';
        for (let i = 0; i < openBraces; i++) closing += '}';
        s += closing;

        // 确保末尾没有多余的逗号
        s = s.replace(/,\s*([}\]])/g, '$1');

        try {
          const result = JSON.parse(s);
          if (result && result.segments && Array.isArray(result.segments)) {
            return result.segments as ChapterSummary[];
          }
        } catch {
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
        if (esc3) { esc3 = false; continue; }
        if (ch === '\\' && inStr) { esc3 = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') openBraces++;
        else if (ch === '}') openBraces--;
        else if (ch === '[') openBrackets++;
        else if (ch === ']') openBrackets--;
      }

      let closing = '';
      for (let i = 0; i < openBrackets; i++) closing += ']';
      for (let i = 0; i < openBraces; i++) closing += '}';
      s += closing;

      // 清理多余逗号
      s = s.replace(/,\s*([}\]])/g, '$1');

      try {
        const result = JSON.parse(s);
        if (result && result.segments && Array.isArray(result.segments)) {
          return result.segments as ChapterSummary[];
        }
        if (Array.isArray(result)) {
          return result as ChapterSummary[];
        }
      } catch {
        return null;
      }
      return null;
    } catch {
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
  function parseExamples(raw: string): ExampleItem[] {
    const examples: ExampleItem[] = [];
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
          method: parts.slice(2).join('|')  // method 可能包含 |
        });
      }
    }
    return examples;
  }

  function parseSegmentFormat(content: string): { segments: ChapterSummary[]; leftover: string; metaData: NoteMetaData | null } {
    const segments: ChapterSummary[] = [];
    let leftover = "";
    let metaData: NoteMetaData | null = null;

    // 按行分割，容忍 \r\n 和 \n
    const lines = content.split(/\r?\n/);
    
    let currentState: 'none' | 'segment' | 'leftover' | 'meta' = 'none';
    let currentFields: Partial<ChapterSummary> = {};
    let currentMultiLineField: string | null = null;  // 当前正在收集的多行字段名
    let currentMultiLineValue: string[] = [];  // 多行字段的累积值
    let currentMetaFields: Partial<NoteMetaData> = {};
    // key_points 临时存储：在 segment 状态下收集 - 开头的要点行
    let currentKeyPoints: string[] = [];

    const flushMultiLine = () => {
      // 如果当前多行字段是 key_points，特殊处理为数组
      if (currentMultiLineField === 'key_points') {
        // key_points 已经在逐行收集到 currentKeyPoints 中了，这里不做 join
        return;
      }
      if (currentMultiLineField && currentMultiLineValue.length > 0) {
        (currentFields as any)[currentMultiLineField] = currentMultiLineValue.join('\n').trim();
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
        } else if (currentState === 'leftover') {
          flushMultiLine();
          leftover = currentMultiLineValue.join('\n').trim();
        } else if (currentState === 'meta') {
          flushMultiLine();
          // 构建 metaData
          metaData = {
            exam_focus: (currentMetaFields.exam_focus as string) || "",
            emphasis: (() => {
              const raw = ((currentMetaFields as any).emphasis as string) || "";
              return raw.split('|').map(e => e.trim()).filter(e => e.length > 0);
            })(),
            examples: parseExamples(((currentMetaFields as any).examples as string) || "")
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
            if (point) currentKeyPoints.push(point);
          } else {
            // 单行 key_points 值
            currentKeyPoints.push(kpMatch[1].trim());
          }
          continue;
        }

        // 检测以 - 开头的要点行（在 key_points 字段上下文中）
        if (currentMultiLineField === 'key_points') {
          // 先检测有缩进的子列表行（如 "  - 子点" 或 "  1. 子点"）
          const subListMatch = line.match(/^(\s{2,})[-*+]\s+(.+)$/);
          const subOrderedMatch = line.match(/^(\s{2,})\d+\.\s+(.+)$/);
          if (subListMatch) {
            // 缩进子列表项 → 追加到上一个 key_point，保留缩进
            if (currentKeyPoints.length > 0) {
              currentKeyPoints[currentKeyPoints.length - 1] += '\n' + line;
            }
            continue;
          }
          if (subOrderedMatch) {
            // 缩进序号子项 → 追加到上一个 key_point，保留缩进
            if (currentKeyPoints.length > 0) {
              currentKeyPoints[currentKeyPoints.length - 1] += '\n' + line;
            }
            continue;
          }
          // 无缩进的顶层要点行
          const pointMatch = line.match(/^\s*[-*+]\s+(.+)$/);
          if (pointMatch) {
            // 这是一个新的顶层 key_points 要点行
            currentKeyPoints.push(pointMatch[1].trim());
            continue;
          }
          // 检测 ### 小标题行（块内分节）
          const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);
          if (headingMatch) {
            // 作为一个独立的 key_points 行（不带 - 前缀，写入时直接渲染为标题）
            currentKeyPoints.push(line.trim());
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
          (currentFields as any)[key] = value;
          // 设置当前多行字段，后续非字段行会追加到此字段
          currentMultiLineField = key;
          currentMultiLineValue = [value];
        } else if (currentMultiLineField && currentMultiLineField !== 'key_points') {
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
          (currentMetaFields as any)[key] = value;
          currentMultiLineField = key;
          currentMultiLineValue = [value];
        } else if (currentMultiLineField) {
          // 续行
          currentMultiLineValue.push(line);
          // 同步更新到 currentMetaFields
          (currentMetaFields as any)[currentMultiLineField] = currentMultiLineValue.join('\n').trim();
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
    } else if (currentState === 'leftover') {
      leftover = currentMultiLineValue.join('\n').trim();
      console.log(`📝 [分隔符解析] leftover 块未闭合，已抢救保存 (长度: ${leftover.length})`);
    } else if (currentState === 'meta') {
      flushMultiLine();
      metaData = {
        exam_focus: (currentMetaFields.exam_focus as string) || "",
        emphasis: (() => {
          const raw = ((currentMetaFields as any).emphasis as string) || "";
          return raw.split('|').map(e => e.trim()).filter(e => e.length > 0);
        })(),
        examples: parseExamples(((currentMetaFields as any).examples as string) || "")
      };
      console.log(`📝 [分隔符解析] META 块未闭合，已抢救保存`);
    }

    return { segments, leftover, metaData };
  }

  /**
   * 📦 SSE 流式响应解析器
   * 将 Gateway 返回的 SSE 格式（多行 data: {...}）解析为完整的 content 和 reasoning_content。
   *
   * SSE 格式示例：
   *   data: {"choices":[{"delta":{"content":"你好"}}]}
   *   data: {"choices":[{"delta":{"reasoning_content":"思考中..."}}]}
   *   data: [DONE]
   *
   * 兼容性：如果响应不是 SSE 格式（比如非流式 JSON），则回退到 JSON 解析。
   */
  function parseSSEResponse(rawText: string): { content: string; reasoning: string } {
    let content = '';
    let reasoning = '';

    // 检测是否为 SSE 格式（以 "data:" 开头）
    if (!rawText.trimStart().startsWith('data:')) {
      // 非流式 JSON 回退
      try {
        const json = JSON.parse(rawText);
        const msg = json.choices?.[0]?.message ?? json.choices?.[0]?.delta ?? {};
        content = typeof msg.content === 'string' ? msg.content : '';
        reasoning =
          (typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '') ||
          (typeof msg.reasoning === 'string' ? msg.reasoning : '');
      } catch {
        // 不是 JSON 也不是 SSE，当作纯文本
        content = rawText;
      }
      return { content, reasoning };
    }

    // 逐行解析 SSE
    const lines = rawText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta ?? chunk.choices?.[0]?.message ?? {};
        if (typeof delta.content === 'string') content += delta.content;
        if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
        if (typeof delta.reasoning === 'string' && !reasoning) reasoning += delta.reasoning;
      } catch {
        // 单行 JSON 解析失败，跳过
      }
    }

    return { content, reasoning };
  }

  /**
   * 🔁 OpenCode V4 请求带自动重试
   * 网络错误和超时都会触发重试（超时意味着模型 reasoning 太长，重试可能换个 key/模型）
   * 最多重试 2 次（共 3 次尝试），每次重试之间延迟 10s/20s
   *
   * 🔑 流式保活策略：强制 stream=true 发送给 Gateway，Gateway 再以流式调上游 API。
   * 这样 httpx 的 read timeout 会在每次收到 SSE chunk 时被重置，避免长推理超时。
   * 插件端收到的也是 SSE 格式，由 onSSEData 回调实时拼接为完整文本。
   *
   * 📊 诊断日志：每次请求分配唯一 requestId，每 1000 个 chunk 打一次进度日志，
   * 重试时打印已收到的部分内容量，帮助定位"哪个批次慢"和"为什么超时"。
   */
  async function requestOpenCodeV4WithRetry(
    provider: { BASE_URL: string; API_KEY?: string },
    body: Record<string, any>,
    fallbackApiKey?: string,
    timeoutMs: number = 1_800_000
  ): Promise<string> {
    const maxRetries = 2;
    const delays = [10000, 20000];

    // 强制流式请求，避免非流式长推理导致 read timeout
    body.stream = true;

    // 生成唯一请求 ID，用于在日志中区分不同请求
    const requestId = Math.random().toString(36).slice(2, 8);
    const requestStart = Date.now();
    const msgCount = body.messages?.length || 0;
    console.log(`🆔 [LLM] 请求开始 | id=${requestId} | timeout=${timeoutMs}ms(${timeoutMs / 1000}s) | model=${body.model} | messages=${msgCount}`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // SSE 实时拼接缓冲区
      let sseContent = '';
      let sseReasoning = '';
      let chunkCount = 0;
      const attemptStart = Date.now();

      try {
        const response = await requestDirect({
          url: provider.BASE_URL,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.API_KEY || fallbackApiKey || ''}`
          },
          body: JSON.stringify(body),
          timeoutMs,
          // 首字节超时：60秒内必须收到第一个 chunk
          firstByteTimeoutMs: 60_000,
          // 无数据超时：两个 chunk 之间最多 120 秒间隔
          idleTimeoutMs: 120_000,
          // SSE 逐行回调：实时拼接 content 和 reasoning_content
          onSSEData: (data: string) => {
            chunkCount++;
            // 每 1000 个 chunk 打一次进度日志
            if (chunkCount % 1000 === 0) {
              const elapsed = ((Date.now() - attemptStart) / 1000).toFixed(1);
              console.log(`📊 [LLM] id=${requestId} | chunks=${chunkCount} | content=${sseContent.length} | reasoning=${sseReasoning.length} | elapsed=${elapsed}s`);
            }
            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta ?? chunk.choices?.[0]?.message ?? {};
              if (typeof delta.content === 'string') sseContent += delta.content;
              if (typeof delta.reasoning_content === 'string') sseReasoning += delta.reasoning_content;
              if (typeof delta.reasoning === 'string' && !sseReasoning) sseReasoning += delta.reasoning;
            } catch {
              // 单行 JSON 解析失败，跳过
            }
          }
        });

        const attemptDuration = ((Date.now() - attemptStart) / 1000).toFixed(1);
        const totalDuration = ((Date.now() - requestStart) / 1000).toFixed(1);

        // 🔍 调试日志
        console.log(`✅ [LLM] id=${requestId} | HTTP ${response.status} | chunks=${chunkCount} | content=${sseContent.length} | reasoning=${sseReasoning.length} | attempt=${attempt + 1}/${maxRetries + 1} | duration=${attemptDuration}s(total ${totalDuration}s)`);

        // 检查 HTTP 状态码，非 200 直接报错
        if (response.status < 200 || response.status >= 300) {
          console.error(`❌ [LLM] HTTP ${response.status} 错误，原始响应: ${response.text.slice(0, 1000)}`);
          throw new Error(`HTTP ${response.status}: ${response.text.slice(0, 200)}`);
        }

        // 优先使用 content；为空则回退 reasoning
        if (sseContent && sseContent.trim() !== '') {
          return sseContent;
        }
        if (sseReasoning && sseReasoning.trim() !== '') {
          console.warn(`⚠️ content 字段为空，回退使用 reasoning 字段（长度: ${sseReasoning.length}）`);
          return sseReasoning;
        }

        // 两个字段都为空 — 可能是 SSE 回调没触发（如非 SSE 响应），回退到 parseSSEResponse
        console.warn('⚠️ SSE 实时拼接为空，尝试 parseSSEResponse 回退解析');
        const { content: fallbackContent, reasoning: fallbackReasoning } = parseSSEResponse(response.text);
        if (fallbackContent && fallbackContent.trim() !== '') return fallbackContent;
        if (fallbackReasoning && fallbackReasoning.trim() !== '') return fallbackReasoning;

        console.warn('⚠️ SSE 解析后 content 和 reasoning_content 均为空');
        return '';
      } catch (e: any) {
        const errMsg = e.message || String(e);
        const isNetworkError =
          errMsg.includes('ERR_CONNECTION_RESET') ||
          errMsg.includes('ERR_CONNECTION_CLOSED') ||
          errMsg.includes('ERR_CONNECTION_REFUSED') ||
          errMsg.includes('ERR_NETWORK_CHANGED') ||
          errMsg.includes('Failed to fetch') ||
          errMsg.includes('net::ERR_') ||
          errMsg.includes('ECONNRESET');
        const isTimeoutError =
          errMsg.includes('超时') ||
          errMsg.includes('timeout') ||
          errMsg.includes('Timeout') ||
          errMsg.includes('TIMEDOUT');

        const isRetryable = isNetworkError || isTimeoutError;

        // 超时/网络错误时打印已收到的部分内容，帮助诊断
        if (chunkCount > 0) {
          console.warn(`📋 [LLM] 错误前已收到 ${chunkCount} 个 SSE chunks | content: ${sseContent.length} 字符 | reasoning: ${sseReasoning.length} 字符`);
        }

        if (isRetryable && attempt < maxRetries) {
          const retryCount = attempt + 1;
          const errorType = isTimeoutError ? '超时' : '网络异常';
          const attemptDuration = ((Date.now() - attemptStart) / 1000).toFixed(1);
          console.error(`❌ [LLM] id=${requestId} | ${errorType}，准备重试 (第 ${retryCount}/${maxRetries} 次) | attempt_duration=${attemptDuration}s | 错误: ${errMsg}`);
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          continue;
        }

        if (isNetworkError) {
          console.error(`❌ [LLM] id=${requestId} | 网络异常重试 ${maxRetries} 次仍失败: ${errMsg}`);
        } else if (isTimeoutError) {
          console.error(`❌ [LLM] id=${requestId} | 超时重试 ${maxRetries} 次仍失败: ${errMsg}`);
        } else {
          console.error(`❌ [LLM] id=${requestId} | 请求失败（不可重试）: ${errMsg}`);
        }
        throw e;
      }
    }

    throw new Error('requestOpenCodeV4WithRetry: 重试耗尽');
  }

  export interface BatchSummaryResult {
    chapters: ChapterSummary[];
    leftover: string;
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
export async function getBatchSummary(
  currentRaw: string,
  history: string,
  batchStartTime: number,
  providerIndex?: number,
  trySiliconFlow?: boolean
): Promise<BatchSummaryResult> {
  // 使用传入的 providerIndex（缺省为 0），不再硬编码 OpenCode
  const idx = (typeof providerIndex === 'number' && providerIndex >= 0 && providerIndex < LLM_PROVIDERS.length) ? providerIndex : 0;
  const selectedProvider = LLM_PROVIDERS[idx];
  console.log(`🔑 使用 ${selectedProvider.NAME} (model=${selectedProvider.MODEL})`);
  return await getBatchSummaryInternal(currentRaw, history, batchStartTime, idx, false);
}

/**
 * 内部函数：使用指定 provider 索引调用 API
 */
async function getBatchSummaryInternal(
  currentRaw: string,
  history: string,
  batchStartTime: number,
  providerIndex: number,
  fallbackToSecond: boolean = true
): Promise<BatchSummaryResult> {
    const batchStartStr = formatTime(batchStartTime);
    
    const prompt = `
目标：对转写文本进行**详细的知识提取与课堂原始记录**的整理，输出考研背诵级笔记。
输入：这是一段课堂录音转写的片段（从约 ${batchStartStr} 开始，约 7 分钟）。输入中每行形如 [时间] 正文。
输出：使用以下标记格式输出（不要输出 JSON，不要使用反引号或代码块）。

${history ? `前情提要参考：\n${history.slice(-2000)}\n---` : ""}

**核心要求（极为重要）：**
1. **角色转换**：你不再是一个只写几句宏观概括的"总结机器"，而是一位**详细、负责的听课笔记员**。输出的是看完就能直接去背诵和做题的高密度知识笔记。
2. **知识层面的详尽与留存**：整理出这段话里老师讲过的每一个具体知识点、每一道例题的题意、具体的推导过程、易错点坑点。不能遗漏任何专业知识信息。保留完整的定义、条件、适用范围；保留核心推导步骤链；保留所有公式定理。
3. **降噪流水账**：剔除"同学们看黑板"、"接下来我们讲"、"大家懂了吧"等毫无信息量的口语废话，把长篇大论用高密度的笔记体梳理出来。
4. **结构切分**：如果在该时段内转移了具体话题（如从"例题1"讲到了"例题2"，或进入了新的知识点推导），必须把它们切分成不同的 segments 记录块，时间戳要精确对应。
5. **处理截断**：**如果最后一部分内容被截断（例如话只讲了一半，或知识点未讲完），请不要勉强总结它。将其原封不动放在 LEFTOVER 标记中。**
6. **块内结构化**：key_points 内可以自由使用 Markdown 语法（缩进子列表、序号、### 子标题、**加粗**等）来组织内容，让它有清晰的层次结构，而不是一大片平铺的条目。

**时间戳硬性约束（违反会导致笔记错乱）：**
- 本段音频从 ${batchStartStr} 开始，每个 timestamp 都必须 ≥ ${batchStartStr}。
- timestamp 必须与输入中该知识点首行方括号里的时间**完全一致**（原样照抄，不要改写格式）。
- **绝对不要省略小时位**：输入是 [01:24:35] 就必须写 01:24:35；写成 24:35、24:01 之类都是严重错误。

输出格式（严格使用以下行首标记，每行一个字段，不要使用 JSON）：
===SEGMENT===
timestamp: 照抄输入中该知识点首行方括号里的时间（含小时位，原样复制）
title: 具体知识名 或 例题名
key_points:
- **加粗核心词** 后面跟详细内容（保留完整的推导步骤、定义条件或结论，有可以拿去背诵的实质内容。内容中重点概念也用 ** 加粗）
  （可根据需要自由使用 Markdown 缩进子列表、序号、### 子标题等组织内容）
- **加粗核心词** 后面跟详细内容（数量根据内容自然决定，不要干瘪的短句，也不要强行凑数）
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
    const provider = LLM_PROVIDERS[providerIndex];
    const providerName = provider.NAME;
    
    try {
      const body: Record<string, any> = {
        model: provider.MODEL,
        messages: [
          { role: "system", content: "You are a professional lecture note-taker. Your task is to extract detailed knowledge points from classroom transcripts and organize them into structured notes. 输出要求：1. 每个知识点都要详细记录推导过程、定义条件、关键结论，不能遗漏任何专业知识信息；2. key_points 要有可以拿去背诵的实质内容，不要只写概括性描述；3. 数学公式使用 LaTeX 语法用 $...$ 包裹；4. 使用中文输出，专业术语可保留英文。不要输出 JSON，使用 ===SEGMENT=== 标记格式。" },
          { role: "user", content: prompt }
        ],
        stream: false,
        temperature: 0.1,
        max_tokens: 65536,  // 显式设置足够大的输出空间，防止 JSON 被截断
        ...(provider.EXTRA_BODY || {})
      };

      // 🔁 使用带重试+降级的请求函数
      let content = await requestOpenCodeV4WithRetry(provider, body, LLM_CONFIG.API_KEY);

      // 🔍 日志：记录 LLM 原始响应的关键特征，用于诊断
      console.log(`📝 [LLM诊断] 原始响应长度: ${content.length} 字符 | 前100字符: ${content.slice(0, 100)} | 后100字符: ${content.slice(-100)}`);

      // 去掉思考过程
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      // 🛡️ 使用 LaTeX 保护器处理内容
      const latexProtect = new LatexProtect();
      const protectedContent = latexProtect.protect(content);

      // 📝 使用分隔符格式解析（不再使用 JSON）
      const parseResult = parseSegmentFormat(protectedContent);
      let parsed: ChapterSummary[] = parseResult.segments;
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
      
    } catch (e: any) {
      console.error(`❌ [${providerName}] 批次分析异常: ${e.message || e}`);
      console.error(`❌ [${providerName}] 错误堆栈:`, e.stack || '(无堆栈)');
      throw e;
    }
}

/**
 * 调用 LLM API 根据全局上下文对初步的章节总结进行修正
 * @param preliminarySummaries 初步的章节总结文本
 * @returns 修正后的所有章节总结
 */
export async function getGlobalCorrectionSummary(
    preliminarySummaries: string
): Promise<GlobalCorrectionResult> {
    const prompt = `
目标：基于所有分片的初步笔记，进行**块间微调**，不压缩信息，不重写块内内容。
输入：由分块阶段生成的详细知识点笔记（含 key_points）。
输出：微调后的最终知识结构（使用标记格式，不要输出 JSON）。

**核心要求：**
1. **块内内容尽量不修改**：分块阶段已经做得很好了，你不要重写或压缩 key_points 的内容。保留原始的推导步骤、定义、例题题意、公式等。只允许在格式上做微调（如调整加粗体位置）。
2. **加粗体格式（强制执行）**：每个 key_point 里面必须有加粗体（用两个星号 ** 包裹）。加粗体的作用是让读者扫一眼就能快速了解这个要点的核心逻辑。加粗体相当于序号的作用，替代序号。如果原内容已有加粗体，保留；如果没有，添加。**重要**：除了开头的核心词加粗外，内容中老师强调的重点概念、关键结论、易错点等也要用 ** 加粗，让读者快速抓住重点。例如："考试中题目**不会提示**这是反常积分"、"必须**取极限**而不是直接代入"。
3. **块间合并**：如果两个相邻的块明显讲的是同一个知识点的上下半部分（被时间切片硬性切断），就合并成一个块。合并时保留两块的所有 key_points，不压缩。
4. **块间拆分**：如果一个块里明显揉了两个不同知识点，拆分成两个块。
5. **标题调整**：把控全局统一性，让各块标题逻辑一致、风格统一。因为分块时各自为战，标题可能不一致。
6. **块数量优化**：如果感觉分块太多或太婆嗦，可以适当合并。但不要为了减少数量而压缩内容。
7. **保留公式定理**：所有数学公式必须使用 LaTeX 语法，用行内 $...$ 包裹。
8. **时间顺序**：按时间戳从小到大排列，保留原始时间戳。
9. **块内结构化**：保留分块阶段已有的 Markdown 结构（缩进子列表、序号、子标题等）。如果原内容是平面的但逻辑上有层次，可以适当补充。

输出格式（严格使用以下行首标记，每行一个字段，不要使用 JSON）：
===SEGMENT===
timestamp: 照抄输入中该块原有的时间戳（含小时位，原样复制，不要省略、不要改写）
title: 具体的知识点/例题标题
key_points:
- **加粗核心词** 后面跟详细内容（保留原始的推导步骤、定义条件或结论，内容中重点概念也用 ** 加粗）
  （可根据需要自由使用 Markdown 缩进子列表、序号、### 子标题等组织内容）
- **加粗核心词** 后面跟详细内容（有逻辑层次时用缩进子列表或序号组织）
===END===

（可以有多个 ===SEGMENT===...===END=== 块）

===META===
exam_focus: 用自然流畅的一段话概括本课核心内容，帮助快速回顾。涵盖老师讲过的所有主要知识点和考试重点。每句话聚焦一个知识点，用分号分隔。重要：段落中的关键概念、知识点名称、考试重点等关键词必须用 ** 加粗，让读者扫一眼就能抓住重点。
emphasis: 老师口头强调的注意点1（简述原因） | 注意点2（简述原因） | 注意点3（简述原因）（用 | 分隔多个注意点，每个注意点附带简短原因说明。注意点中的关键词用 ** 加粗）
examples: ===EX===timestamp|例题标题|解题方法===END=== ===EX===timestamp|例题标题|解题方法===END===
===END===

### 分块笔记列表（请进行块间微调，保留所有知识细节，添加加粗体）
${preliminarySummaries}
`;

    // 使用 LLM_GLOBAL_CONFIG（全局校验专用配置）；reasoning_effort / thinking 由 EXTRA_BODY 展开
    const provider = {
      NAME: 'Global LLM',
      API_KEY: LLM_GLOBAL_CONFIG.API_KEY,
      BASE_URL: LLM_GLOBAL_CONFIG.BASE_URL,
      MODEL: LLM_GLOBAL_CONFIG.MODEL,
      EXTRA_BODY: LLM_PROVIDERS[0].EXTRA_BODY || {}
    };
    console.log(`🔑 使用全局校验专用配置 (model=${provider.MODEL}, base=${provider.BASE_URL})`);
    
    try {
        const body: Record<string, any> = {
          model: provider.MODEL,
          messages: [
            { role: "system", content: "You are a document outline editor. Your task is to do light inter-block adjustments (merge/split/retitle) while preserving all intra-block content. Every key_point must contain bold text (**word**). Do NOT compress or rewrite the knowledge content. Output mathematical formulas using LaTeX syntax wrapped in inline $...$. 请使用中文输出内容。不要输出 JSON，使用 ===SEGMENT=== 标记格式。" },
            { role: "user", content: prompt }
          ],
          stream: false,
          temperature: 0.2,
          max_tokens: 65536,  // 显式设置足够大的输出空间，防止 JSON 被截断
          ...(provider.EXTRA_BODY || {})
        };

        // 🔁 使用带重试+降级的请求函数（全局校验超时 10 分钟，给模型足够 reasoning 时间）
        console.log(`📊 [全局校验] 准备发送请求 | prompt 长度: ${prompt.length} 字符 | EXTRA_BODY: ${JSON.stringify(provider.EXTRA_BODY || {})} | base: ${provider.BASE_URL}`);
        const reqStartTime = Date.now();
        let content = await requestOpenCodeV4WithRetry(provider, body, provider.API_KEY, 600000);
        const reqDuration = ((Date.now() - reqStartTime) / 1000).toFixed(1);
        console.log(`📊 [OpenCode-V4] 全局校验请求完成 | 耗时: ${reqDuration}s | 响应长度: ${content.length} 字符`);
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        // 🛡️ 使用 LaTeX 保护器处理内容
        const latexProtect = new LatexProtect();
        const protectedContent = latexProtect.protect(content);

        // 📝 使用分隔符格式解析（不再使用 JSON）
        const segResult = parseSegmentFormat(protectedContent);
        let parsed: ChapterSummary[] = segResult.segments;
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
        }

        // 🛡️ 还原 metaData 中的 LaTeX 占位符（exam_focus / emphasis / examples）
        if (metaData) {
          metaData.exam_focus = latexProtect.restoreAndFix(metaData.exam_focus);
          if (metaData.emphasis && metaData.emphasis.length > 0) {
            metaData.emphasis = metaData.emphasis.map(e => latexProtect.restoreAndFix(e));
          }
          if (metaData.examples && metaData.examples.length > 0) {
            metaData.examples = metaData.examples.map(ex => ({
              timestamp: ex.timestamp,
              topic: latexProtect.restoreAndFix(ex.topic),
              method: latexProtect.restoreAndFix(ex.method)
            }));
          }
        }

        // 所有内容还原完成后，重置保护器状态
        latexProtect.reset();
        
        // 🛡️ 严格检查 AI 返回数据是否为空
        if (parsed.length === 0) {
          console.error(`❌ [OpenCode-V4] 全局校验 AI 返回空数据`);
          console.error("原始响应内容:", content.slice(0, 500));
          return { chapters: [], metaData: { exam_focus: '', emphasis: [], examples: [] } };
        }
        
        // 构建默认 metaData（如果 LLM 没有输出 META 块）
        const finalMetaData: NoteMetaData = metaData || {
          exam_focus: '',
          emphasis: [],
          examples: []
        };
        
        // 成功获取数据，返回结果
        console.log(`✅ [OpenCode-V4] 全局校验成功，返回 ${parsed.length} 个章节, metaData: exam_focus=${finalMetaData.exam_focus.length}字符, emphasis=${finalMetaData.emphasis.length}个, examples=${finalMetaData.examples.length}个`);
        return { chapters: parsed, metaData: finalMetaData };
        
      } catch (e: any) {
        console.error(`❌ [全局校验] 异常: ${e.message || e}`);
        console.error(`❌ [全局校验] 错误堆栈:`, e.stack || '(无堆栈)');
        // 重新 throw，让调用方能看到真实错误并决定是否重试
        throw e;
      }
}

/**
 * 🛡️ 降级思维导图构建器
 * 当 LLM 被 content_filter 拦截或返回空数据时，用章节摘要直接构建一个简化版思维导图
 * 保证用户至少有一个可用的思维导图，而不是完全失败
 */
function buildFallbackMindmap(
    chapters: ChapterSummary[],
    videoName: string,
    encodedNotePath: string
): string {
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
        } else if (chapter.summary) {
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

/** 思维导图 LLM 通用系统提示词 */
const MINDMAP_SYSTEM_PROMPT = "You are a mindmap outline generator. Output pure Markdown. NEVER output HTML tags. Keep nodes structured, logical, and easy to understand using concise but meaningful phrases. Respect the input knowledge points as independent units — do not merge different topics into one node. 请使用中文输出内容。专业术语可保留英文原文，但整体表述应以中文为主，避免大段英文。";

interface MindmapRawResponse {
    /** 清理后的纯文本内容（空串表示失败） */
    text: string;
    /** 是否被 content_filter 拦截 */
    hadContentFilter: boolean;
}

/**
 * 调用思维导图专用 LLM（流式），返回清理后的纯文本内容
 */
async function requestMindmapLLMText(prompt: string, logTag: string): Promise<MindmapRawResponse> {
    const mindmapProvider = {
      NAME: 'Mindmap LLM',
      API_KEY: LLM_MINDMAP_CONFIG.API_KEY,
      BASE_URL: LLM_MINDMAP_CONFIG.BASE_URL,
      MODEL: LLM_MINDMAP_CONFIG.MODEL,
      EXTRA_BODY: LLM_MINDMAP_CONFIG.EXTRA_BODY
    };
    console.log(`🔑 [${logTag}] 使用思维导图专用配置 (model=${mindmapProvider.MODEL}, base=${mindmapProvider.BASE_URL})`);

    // SSE 实时拼接缓冲区
    let mmContent = '';
    let mmReasoning = '';
    let mmChunkCount = 0;
    let mmHasContentFilter = false;
    let mmHitLength = false;

    const response = await requestDirect({
        url: mindmapProvider.BASE_URL,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mindmapProvider.API_KEY}`
        },
        timeoutMs: 1_800_000,
        firstByteTimeoutMs: 60_000,
        idleTimeoutMs: 120_000,
        body: JSON.stringify({
            model: mindmapProvider.MODEL,
            messages: [
                { role: "system", content: MINDMAP_SYSTEM_PROMPT },
                { role: "user", content: prompt }
            ],
            stream: true,
            temperature: 0.3,
            // 显式设置足够大的输出空间：长视频（100+ 章节）的导图大纲长度可观，
            // 旧代码未设置曾导致大纲尾段被网关默认上限截断（导图末尾章节缺失）
            max_tokens: 65536,
            ...(mindmapProvider.EXTRA_BODY || {})
        }),
        onSSEData: (data: string) => {
            mmChunkCount++;
            try {
                const chunk = JSON.parse(data);
                const delta = chunk.choices?.[0]?.delta ?? chunk.choices?.[0]?.message ?? {};
                if (typeof delta.content === 'string') mmContent += delta.content;
                if (typeof delta.reasoning_content === 'string') mmReasoning += delta.reasoning_content;
                if (typeof delta.reasoning === 'string' && !mmReasoning) mmReasoning += delta.reasoning;
                // 检测 content_filter / 输出长度截断
                const fr = chunk.choices?.[0]?.finish_reason;
                if (fr === 'content_filter') mmHasContentFilter = true;
                if (fr === 'length') mmHitLength = true;
            } catch {
                // 单行 JSON 解析失败，跳过
            }
        }
    });

    console.log(`📊 [${logTag}] HTTP ${response.status} | SSE chunks: ${mmChunkCount} | content 长度: ${mmContent.length} | reasoning 长度: ${mmReasoning.length}`);

    if (mmHitLength) {
        console.warn(`⚠️ [${logTag}] 输出达到 max_tokens 上限（finish_reason=length），内容可能被截断`);
        new Notice('⚠️ 思维导图输出达到模型长度上限，末尾可能不完整（可尝试重新生成）', 8000);
    }

    // 🛡️ 检测 content_filter
    if (mmHasContentFilter || response.text.includes('content_filter')) {
      return { text: '', hadContentFilter: true };
    }

    let content = "";
    let usedField: 'content' | 'reasoning_content' | 'reasoning' | 'none' = 'none';
    if (mmContent && mmContent.trim() !== '') {
      content = mmContent;
      usedField = 'content';
    } else if (mmReasoning && mmReasoning.trim() !== '') {
      content = mmReasoning;
      usedField = 'reasoning_content';
      console.warn(`⚠️ [${logTag}] content 字段为空，回退使用 reasoning_content 字段（长度: ${content.length}）`);
    } else {
      // 回退到 parseSSEResponse
      const { content: fbContent, reasoning: fbReasoning } = parseSSEResponse(response.text);
      if (fbContent && fbContent.trim() !== '') {
        content = fbContent;
        usedField = 'content';
      } else if (fbReasoning && fbReasoning.trim() !== '') {
        content = fbReasoning;
        usedField = 'reasoning_content';
      }
    }

    // 🛡️ 严格检查 AI 返回数据是否为空（仅在 content 与 reasoning_content/reasoning 均为空时才判定失败）
    if (!content || content.trim() === '') {
      console.error(`❌ [${logTag}] AI 返回空数据（content / reasoning_content / reasoning 均为空）`);
      return { text: '', hadContentFilter: false };
    }

    console.log(`✅ [${logTag}] 内容提取自字段: ${usedField}（长度: ${content.length}）`);

    // 清理思考过程和代码块标记（对 content 与 reasoning 回退分支统一处理）
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    content = content.replace(/^```(markdown|markmap)?\s*/im, '').replace(/\s*```$/m, '');
    return { text: content, hadContentFilter: false };
}

/**
 * 思维导图 Markdown 后处理：父节点加粗 + [MM:SS] 链接本地替换
 */
function postProcessMindmapMarkdown(content: string, chapters: ChapterSummary[], encodedNotePath: string): string {
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
                if (nextLine.trim() === '') continue; // 跳过空行
                
                const nextMatch = nextLine.match(/^(\s*)([-*+]\s+)(.*)$/);
                if (nextMatch) {
                    const nextIndent = nextMatch[1].length;
                    if (nextIndent > currentIndent) {
                        isParent = true;
                    }
                    break; // 找到同级、高级或低级相邻节点，退出查找
                } else if (nextLine.match(/^#+\s/)) {
                    // 遇到标题，停止分析子节点
                    break;
                } else {
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
    // 正则解释：匹配以 1-6个#开头，后跟 [时间戳]（允许 3 位分钟、方括号内含空格），最后是标题的行
    const nodeRegex = /^(#+)\s*\[\s*(\d{1,3}:\d{2}(?::\d{2})?)\s*\]\s*(.*)$/gm;

    content = content.replace(nodeRegex, (match: string, hashes: string, rawTimestamp: string, displayTitle: string) => {
        // 0. 时间戳归一化（容忍 119:03 这类非规范写法）；无法解析则保持原样，绝不生成错误链接
        const tsSec = parseTime(rawTimestamp);
        if (!Number.isFinite(tsSec)) return match;
        const timestamp = formatTime(tsSec);

        // 1. 通过时间戳，反查原本真实的章节数据。
        //    同一时间戳可能有多个章节（例如结构梳理型课程老师一口气罗列多个模块），
        //    此时优先选择标题与模型输出最接近的那个，避免链接全部指向同一章节
        const sameTimeChapters = chapters.filter(c => c.timestamp === timestamp);
        const originalChapter = sameTimeChapters.length > 1
            ? pickBestTitleMatch(sameTimeChapters, displayTitle)
            : sameTimeChapters[0];

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
}

/**
 * 在多个同时间戳章节中挑选标题最接近的一个（标题匹配 → 包含关系 → 二元组相似度）
 */
function pickBestTitleMatch(candidates: ChapterSummary[], displayTitle: string): ChapterSummary {
    const bigrams = (s: string): Set<string> => {
        const out = new Set<string>();
        for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
        return out;
    };
    const target = displayTitle
        .replace(/^📌/, '')
        .replace(/[\s*`\\()[\]（）【】:：、，。!！?？"'“”‘’\-—]/g, '')
        .toLowerCase();
    let best = candidates[0];
    let bestScore = -1;
    for (const c of candidates) {
        const t = c.title
            .replace(/^📌/, '')
            .replace(/[\s*`\\()[\]（）【】:：、，。!！?？"'“”‘’\-—]/g, '')
            .toLowerCase();
        let score: number;
        if (t.length > 0 && t === target) score = 3;
        else if (target.length > 1 && (t.includes(target) || target.includes(t))) score = 2;
        else {
            const ta = bigrams(target);
            const tb = bigrams(t);
            let inter = 0;
            for (const x of ta) if (tb.has(x)) inter++;
            const union = ta.size + tb.size - inter;
            score = union > 0 ? inter / union : 0;
        }
        if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
}

/**
 * 调用 LLM API 生成思维导图内容 (本地正则替换链接方案)
 * @param chapters 所有章节数据
 * @param noteFile 笔记的 TFile 对象
 * @param app The Obsidian App instance
 * @returns Markdown 格式的思维导图内容
 */
export async function generateMindmapContent(
    chapters: ChapterSummary[],
    noteFile: TFile,
    app: App,
    customRequirements?: string
): Promise<string> {
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
${customRequirements && customRequirements.trim() ? `\n## 💡 用户增添的特别生成要求（最高优先级，严格遵循）\n${customRequirements.trim()}\n` : ''}
`;
    const raw = await requestMindmapLLMText(prompt, '思维导图');

    // 🛡️ content_filter 或空数据 → 降级构建简化版思维导图
    if (raw.hadContentFilter) {
        console.warn('⚠️ 思维导图被 content_filter 拦截，尝试降级构建简化版思维导图');
        return buildFallbackMindmap(chapters, videoName, encodedNotePath);
    }
    if (!raw.text) {
        // 降级：用章节摘要直接构建思维导图
        return buildFallbackMindmap(chapters, videoName, encodedNotePath);
    }

    return postProcessMindmapMarkdown(raw.text, chapters, encodedNotePath);
}

/**
 * 生成局部思维导图分支（内容仅含二级及以下节点，`## ` 开头），用于追加到已有导图
 *
 * @param chapters 所选分块中解析出的章节数据
 * @param noteFile 智能笔记文件（用于生成跳转链接与标题）
 * @param existingOutline 现有导图的二级/三级骨架（供 LLM 参考命名风格）
 * @param chunkLabel 所选分块的说明（如 "第 5–6 部分"）
 */
export async function generatePartialMindmapContent(
    chapters: ChapterSummary[],
    noteFile: TFile,
    existingOutline: string,
    chunkLabel: string,
    customRequirements?: string
): Promise<string> {
    const videoName = noteFile.basename.replace(/^📝/, '');
    const encodedNotePath = encodeURIComponent(noteFile.path);

    const prompt = `
你是一位**知识体系架构师**。请为笔记 \`${videoName}\` 的**局部内容**（${chunkLabel}）生成一段**局部思维导图分支**，稍后会被追加到已有思维导图的末尾。

## 现有思维导图骨架（命名风格与分类粒度参考；不要重复其中已有的内容）
${existingOutline || '（暂无骨架，可自由组织）'}

## 本次局部内容（格式：[时间戳] 标题 + 要点）
${chapters.map(c => {
  const detail = c.key_points
    ? c.key_points.map(kp => `  - ${kp}`).join('\n')
    : c.summary;
  return `[${c.timestamp}] ${c.title}\n${detail}`;
}).join('\n\n')}

## 输出要求（严格遵守）
1. 只输出 **二级分支**（以 \`## \` 开头），**不要输出根节点标题（\`# \`）**，不要输出任何解释性文字。
2. 分支数量 1~3 条：所选内容属于同一主题时输出 1 条；确实跨主题时按逻辑拆成多条。分支命名可呼应骨架的命名风格（如 emoji 前缀、粒度），但不要与现有分支完全同名；命名要能概括该组内容。
3. 具体章节必须使用 \`### [时间戳] 标题\` 格式（时间戳沿用数据中的 [MM:SS]；标题为 2-8 字凝练概括）。
4. \`### [时间戳]\` 节点下用 \`- \` 列表展开要点，最多再嵌套一层缩进（两个空格 + \`- \`）。
5. 数学公式使用行内 LaTeX（$...$ 包裹）；静默修正语音识别错别字。
6. 不要输出 HTML、链接或代码块。
7. 尊重原始章节切分，不要把不同知识点合并进同一个叶子节点。

## 输出格式示例（严格参照）
## 📦 局部：体积公式推导
### [00:03] 旋转体定义
- 核心定义
  - 曲线绕轴旋转所扫出的立体
### [04:42] 例题10.5
- 定义域陷阱
  - $\\sqrt{\\sin x}$ 要求 $\\sin x \\ge 0$
${customRequirements && customRequirements.trim() ? `\n## 💡 用户增添的特别生成要求（最高优先级，严格遵循）\n${customRequirements.trim()}\n` : ''}
`;
    const raw = await requestMindmapLLMText(prompt, '局部思维导图');
    if (raw.hadContentFilter) {
        throw new Error('内容被模型 content_filter 拦截，请调整所选分块后重试');
    }
    if (!raw.text) {
        throw new Error('模型返回空内容，请重试或更换分块');
    }
    return postProcessMindmapMarkdown(raw.text, chapters, encodedNotePath);
}

/**
 * 调用 LLM API 根据用户指令重写或总结选中的文本
 * @param selectedText 选中的原始文本
 * @param instruction 用户的自定义要求
 * @param provider 使用的 LLM 配置
 * @returns 修改后的文本
 */
export async function rewriteSelection(
    selectedText: string,
    instruction: string,
    provider: LLMProvider
): Promise<string> {
    const prompt = `
你是一个专业的笔记整理助手。请根据用户的【特定要求】，对提供的【选中文本】进行重构、润色或总结。

【特定要求】：
${instruction}

【选中文本】：
${selectedText}

请直接输出处理后的结果，不要包含任何寒暄语、解释性话语或多余的代码块标记（除非用户要求输出代码块）。
`;

    try {
        const response = await requestDirect({
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

        let content = response.json.choices?.[0]?.message?.content || "";
        // 去掉思考过程
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        return content;
    } catch (e) {
        console.error("Rewrite Selection API Error:", e);
        throw e;
    }
}
/**
 * 单次 LLM 调用记录
 */
export interface LLMCallRecord {
    batchIndex: number;      // 批次索引 (-1 表示全局分析/思维导图)
    phase: 'batch' | 'global' | 'mindmap' | 'report';  // 调用阶段
    provider: string;        // Provider 名称
    model: string;           // 模型名称
    attempt: number;         // 尝试次数
    success: boolean;        // 是否成功
    error?: string;          // 错误信息
    durationMs?: number;     // 耗时（毫秒）
}

/**
 * LLM 使用统计摘要
 */
export interface LLMUsageStats {
    totalCalls: number;           // 总调用次数
    successCalls: number;         // 成功次数
    failedCalls: number;          // 失败次数
    providersUsed: string[];      // 使用的 Provider 列表
    modelsUsed: string[];         // 使用的模型列表
    totalDurationMs: number;      // 总耗时（毫秒）
    errorSummary: string[];       // 错误摘要
}

/**
 * 任务报告接口
 */
export interface TaskReportData {
    videoFileName: string;
    totalDuration: number;
    totalBatches: number;
    successBatches: number;
    failedBatches: number;
    apiUsageLog: string[];
    errorLog: string[];
    llmCallRecords: LLMCallRecord[];  // 结构化 LLM 调用记录
    globalAnalysisSuccess: boolean;
    mindmapSuccess: boolean;
    durationSeconds: number;
    generatedNoteContent?: string;  // 生成的笔记内容，用于检查 LaTeX 问题
}

/**
 * 计算 LLM 使用统计
 */
function calculateLLMStats(records: LLMCallRecord[]): LLMUsageStats {
    const stats: LLMUsageStats = {
        totalCalls: records.length,
        successCalls: 0,
        failedCalls: 0,
        providersUsed: [],
        modelsUsed: [],
        totalDurationMs: 0,
        errorSummary: []
    };
    
    const providerSet = new Set<string>();
    const modelSet = new Set<string>();
    
    for (const record of records) {
        if (record.success) {
            stats.successCalls++;
        } else {
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
export async function generateTaskReport(reportData: TaskReportData): Promise<string> {
    const llmStats = calculateLLMStats(reportData.llmCallRecords || []);
    const durationMin = Math.floor(reportData.durationSeconds / 60);
    const durationSec = reportData.durationSeconds % 60;
    const totalDurationMin = Math.floor(reportData.totalDuration / 60);
    const totalDurationSec = Math.floor(reportData.totalDuration % 60);

    // 按阶段分组 LLM 调用记录
    const batchCalls = reportData.llmCallRecords.filter(r => r.phase === 'batch');
    const globalCalls = reportData.llmCallRecords.filter(r => r.phase === 'global');
    const mindmapCalls = reportData.llmCallRecords.filter(r => r.phase === 'mindmap');

    // 构建批次耗时表格
    let batchTable = '';
    if (batchCalls.length > 0) {
        batchTable = '| 批次 | 尝试 | 耗时 | 状态 |\n|------|------|------|------|\n';
        const batchGroups: { [key: number]: LLMCallRecord[] } = {};
        for (const r of batchCalls) {
            if (!batchGroups[r.batchIndex]) batchGroups[r.batchIndex] = [];
            batchGroups[r.batchIndex].push(r);
        }
        for (const idx of Object.keys(batchGroups).map(Number).sort((a, b) => a - b)) {
            const records = batchGroups[idx];
            for (const r of records) {
                const dur = r.durationMs ? (r.durationMs / 1000).toFixed(1) + 's' : '-';
                const status = r.success ? '✅' : '❌';
                batchTable += `| ${idx + 1} | ${r.attempt} | ${dur} | ${status} |\n`;
            }
        }
    }

    // 构建全局校验调用信息
    let globalSection = '';
    if (globalCalls.length > 0) {
        globalSection = `**全局校验** (${globalCalls.length} 次调用)\n`;
        for (const r of globalCalls) {
            const dur = r.durationMs ? (r.durationMs / 1000).toFixed(1) + 's' : '-';
            globalSection += `- 尝试 ${r.attempt}: ${r.success ? '✅' : '❌'} ${dur}${r.error ? ' — ' + r.error.slice(0, 60) : ''}\n`;
        }
    }

    // 构建思维导图调用信息
    let mindmapSection = '';
    if (mindmapCalls.length > 0) {
        mindmapSection = `**思维导图** (${mindmapCalls.length} 次调用)\n`;
        for (const r of mindmapCalls) {
            const dur = r.durationMs ? (r.durationMs / 1000).toFixed(1) + 's' : '-';
            mindmapSection += `- 尝试 ${r.attempt}: ${r.success ? '✅' : '❌'} ${dur}${r.error ? ' — ' + r.error.slice(0, 60) : ''}\n`;
        }
    }

    // 整体状态判断
    const allSuccess = reportData.failedBatches === 0 && reportData.globalAnalysisSuccess && reportData.mindmapSuccess;
    const hasErrors = reportData.errorLog.length > 0 || llmStats.failedCalls > 0;

    const report = `> [!summary] 📋 任务完成报告
> 生成时间: ${new Date().toLocaleString('zh-CN')}

## 执行概览

| 指标 | 数据 |
|------|------|
| 视频文件 | ${reportData.videoFileName} |
| 视频时长 | ${totalDurationMin}分${totalDurationSec}秒 |
| 批次数量 | ${reportData.successBatches}/${reportData.totalBatches} 成功 |
| 全局校验 | ${reportData.globalAnalysisSuccess ? '✅ 成功' : '❌ 失败'} |
| 思维导图 | ${reportData.mindmapSuccess ? '✅ 成功' : '❌ 失败'} |
| 任务总耗时 | ${durationMin}分${durationSec}秒 |

**状态**: ${allSuccess ? '✅ 所有环节顺利完成' : '⚠️ 部分环节存在问题'}${hasErrors ? '（详见下方）' : ''}

## LLM 调用统计

- **总调用次数**: ${llmStats.totalCalls} 次（成功 ${llmStats.successCalls} / 失败 ${llmStats.failedCalls}）
- **使用模型**: ${llmStats.modelsUsed.join(', ') || '无记录'}
- **LLM 总耗时**: ${(llmStats.totalDurationMs / 1000).toFixed(1)} 秒

${batchTable ? `### 批次耗时明细\n\n${batchTable}` : ''}
${globalSection ? `### 全局校验\n\n${globalSection}` : ''}
${mindmapSection ? `### 思维导图\n\n${mindmapSection}` : ''}
${llmStats.failedCalls > 0 ? `### ⚠️ 失败详情\n\n${llmStats.errorSummary.slice(0, 10).map(e => `- ${e}`).join('\n')}` : ''}
${reportData.errorLog.length > 0 ? `### 错误日志\n\n${reportData.errorLog.slice(0, 5).map(e => `- ${e}`).join('\n')}` : ''}
`;

    console.log('✅ 任务完成报告已生成（本地统计模式）');
    return '\n\n---\n\n' + report;
}
