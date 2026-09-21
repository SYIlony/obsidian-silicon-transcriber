/**
 * 🛡️ 定点补齐缺失分块脚本（复用插件自身模块，管线与 silicon-transcriber 完全一致）
 * 用法：
 *   node repair-missing.cjs --dry   # 只解析分块参数与笔记样式，不跑 ASR/LLM
 *   node repair-missing.cjs         # 实际执行
 * REPAIR_ONLY=<笔记名子串> 可只跑某一篇
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PLUGIN = __dirname;
const DRY = process.argv.includes('--dry');
const ONLY = process.env.REPAIR_ONLY || '';

// Node 环境下把 'obsidian' 重定向到本地桩（插件模块仅将其用作类型）
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'obsidian') return require.resolve('./obsidian-stub.cjs');
  return origResolve.call(this, request, ...args);
};

// ---- 复用插件运行时（与 Obsidian 内运行完全同源） ----
const { updateConfigsFromSettings, ASR_CONFIG, LLM_PROVIDERS } = require('./src/config.js');
const settings = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'data.json'), 'utf8'));
updateConfigsFromSettings(settings);
const { getVideoDuration, convertChunkToMp3, formatTime, parseTime } = require('./src/utils.js');
const { uploadToASR } = require('./src/asr.js');
const { getBatchSummary } = require('./src/llm.js');

const FFMPEG = path.join(PLUGIN, 'ffmpeg.exe');
const Z = process.env.REPAIR_ROOT || 'Z:\\Z_27数学';
const noticeShim = { setMessage() {}, hide() {} };
const LOG = path.join(PLUGIN, 'repair-missing.log');
const STATE = path.join(PLUGIN, 'repair-missing.state.json');

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
}
function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } }
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); }

// ==================== 任务表 ====================
// parts: 笔记头部声明的分块数；cs: 分块秒数（null=按 duration 自动求解）
// targets: 缺失的批次下标（0 基）；all: 整篇全跑（按顺序链式）
// 支持通过环境变量 REPAIR_TASKS 注入任务（JSON 数组，字段同 TASKS），路径相对 REPAIR_ROOT
const TASKS = process.env.REPAIR_TASKS ? JSON.parse(process.env.REPAIR_TASKS) : [
  { note: '02.零基础/📝智能笔记/📝09.三、方程与不等式09.md', video: '02.零基础/09.三、方程与不等式09.mp4', parts: 8, cs: 600, targets: [6] },
  { note: '02.零基础/📝智能笔记/📝13.四、函数13.md', video: '02.零基础/13.四、函数13.mp4', parts: 7, cs: 600, targets: [6] },
  { note: '03.第01讲-函数极限与连续/📝智能笔记/📝02.第1讲一、函数的概念与特性02.md', video: '03.第01讲-函数极限与连续/02.第1讲一、函数的概念与特性02.mp4', parts: 6, cs: 600, targets: [5] },
  { note: '03.第01讲-函数极限与连续/📝智能笔记/📝08.第1讲三、函数极限的概念与性质08.md', video: '03.第01讲-函数极限与连续/08.第1讲三、函数极限的概念与性质08.mp4', parts: 4, cs: 600, targets: [3] },
  { note: '03.第01讲-函数极限与连续/📝智能笔记/📝09.第1讲三、函数极限的概念与性质09.md', video: '03.第01讲-函数极限与连续/09.第1讲三、函数极限的概念与性质09.mp4', parts: 4, cs: 600, targets: [3] },
  { note: '04.第02讲-数列收敛/📝智能笔记/📝04.第2讲基础内容精讲04.md', video: '04.第02讲-数列收敛/04.第2讲基础内容精讲04.mp4', parts: 9, cs: 600, targets: [6] },
  { note: '11.第09讲_计算-一元积分学/📝智能笔记/📝04.第9讲二、不定积分的积分法04.md', video: '11.第09讲_计算-一元积分学/04.第9讲二、不定积分的积分法04.mp4', parts: 12, cs: 420, targets: [10] },
  { note: '09.第07讲_物理应用-一元微分学/📝智能笔记/📝04.第7讲三、导数的经济应用（仅数学三）04.md', video: '09.第07讲_物理应用-一元微分学/04.第7讲三、导数的经济应用（仅数学三）04.mp4', parts: 4, cs: null, targets: null, all: true },
];

// 按当前插件的合并规则求解分块大小
function solveChunkSize(duration, parts) {
  for (const cs of [420, 600, 480, 360, 300, 900, 1200]) {
    let n = Math.ceil(duration / cs);
    if (n > 1) {
      const last = duration - (n - 1) * cs;
      if (last < 180) n -= 1;
    }
    if (n === parts) return cs;
  }
  return null;
}

// ---- 笔记读取/样式/历史 ----
function readNote(p) { return fs.readFileSync(p, 'utf8'); }
function sectionOf(note, anchorId) {
  const s = note.indexOf(`%%${anchorId}_START%%`);
  const e = note.indexOf(`%%${anchorId}_END%%`);
  if (s === -1 || e === -1 || e < s) return null;
  return note.substring(s, e);
}
function noteUsesRawQuote(note) { return note.includes('📜 原文'); }
// 从某个批次区间的笔记内容里提取历史摘要（模拟插件 newHistory 格式）
function historyFromSection(sec) {
  if (!sec) return '';
  const lines = sec.split('\n');
  let out = '', cur = null;
  for (const ln of lines) {
    const h = ln.match(/^#### ⏱️ (\d{2}:\d{2}(?::\d{2})?) (.+?)\s{2}🎬/);
    if (h) { if (cur) out += cur; cur = `[${h[1]}] ${h[2]}\n`; continue; }
    if (cur && ln.startsWith('- ')) cur += `描述: ${ln.slice(2).replace(/\*\*/g, '')}\n`;
  }
  if (cur) out += cur;
  return out;
}

// ---- 内容构建（与 runBatchAnalysis 阶段三一致 + 跟随笔记原文块样式） ----
function buildContent(topics, fileName, segments, includeRaw, chunkStart) {
  let content = '';
  for (const topic of topics) {
    content += `#### ⏱️ ${topic.timestamp} ${topic.title}  🎬 [[${fileName}#t=${topic.timestamp}|${topic.timestamp}]]\n`;
    if (topic.key_points && topic.key_points.length > 0) {
      topic.key_points.forEach(kp => { content += kp.startsWith('#') ? `${kp}\n` : `- ${kp}\n`; });
    } else if (topic.summary) {
      content += `${topic.summary}\n`;
    }
    content += '\n';
    if (includeRaw) {
      const t0 = parseTime(topic.timestamp);
      const idx = topics.indexOf(topic);
      const next = topics[idx + 1];
      const t1 = next ? parseTime(next.timestamp) : Infinity;
      // segs 的 start 已是绝对时间（processChunk 里加过 chunkStart），此处不可再加
      const own = segments.filter(s => s.start >= t0 - 1 && s.start < t1);
      if (own.length > 0) {
        content += '> [!quote]- 📜 原文\n';
        for (const s of own) {
          const ts = formatTime(s.start);
          content += `> **[[${fileName}#t=${ts}|${ts}]]** ${s.text}\n`;
        }
        content += '>\n\n';
      }
    }
  }
  return content;
}

// ---- 写入（带验证） ----
function spliceNote(notePath, anchorId, content) {
  const note = fs.readFileSync(notePath, 'utf8');
  const s = note.indexOf(`%%${anchorId}_START%%`);
  const e = note.indexOf(`%%${anchorId}_END%%`);
  if (s === -1 || e === -1 || e < s) throw new Error(`锚点未找到: ${anchorId}`);
  const startMarker = `%%${anchorId}_START%%`;
  const newNote = note.slice(0, s + startMarker.length) + '\n' + content + '\n' + note.slice(e);
  fs.writeFileSync(notePath, newNote);
  // 验证
  const verify = fs.readFileSync(notePath, 'utf8');
  const sec = sectionOf(verify, anchorId) || '';
  const probe = content.replace(/\n/g, ' ').trim().slice(0, 50);
  if (!sec.includes(probe)) throw new Error(`写入验证失败: ${anchorId}`);
  return true;
}

// ---- 单分块管线：ffmpeg → ASR → LLM ----
async function processChunk(task, idx, chunkStart, chunkDur, history, incomingLeftover, fileName) {
  const prefix = `[${task.videoName} #${idx}]`;
  log(`${prefix} 抽取音频 ${formatTime(chunkStart)} +${Math.round(chunkDur)}s ...`);
  const mp3 = await convertChunkToMp3(FFMPEG, task.videoPath, chunkStart, chunkDur, noticeShim, prefix);
  log(`${prefix} 音频 ${(mp3.length / 1048576).toFixed(1)}MB，上传 ASR ...`);
  const asr = await uploadToASR(mp3, `repair_p${idx}.mp3`, noticeShim, prefix, ASR_CONFIG.API_KEYS[0]);
  const segs = (asr.segments || []).map(s => ({ start: s.start + chunkStart, end: s.end + chunkStart, text: (s.text || '').trim() }));
  log(`${prefix} ASR 完成：${segs.length} 段`);

  let rawText = incomingLeftover ? `[上一批次截断内容]\n${incomingLeftover}\n\n[本批次内容]\n` : '';
  segs.forEach(s => { rawText += `[${formatTime(s.start)}] ${s.text}\n`; });

  let topics = null, leftover = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await getBatchSummary(rawText, history, chunkStart, 0, false);
    if (r.chapters && r.chapters.length > 0) { topics = r.chapters; leftover = r.leftover || ''; break; }
    log(`${prefix} LLM 返回空，重试 ${attempt}/2`);
    await new Promise(r2 => setTimeout(r2, 2000));
  }
  if (!topics) throw new Error(`${prefix} LLM 两次均返回空`);

  // 幻觉过滤 + 排序（与插件一致）
  // 时间戳修复策略（按优先级）：
  //   1) 原值就在分块窗口内 → 直接采用
  //   2) 模型把 01:17:00 截断成 17:00（丢整点小时）→ 保留 MM:SS 找回正确小时
  //   3) 模型给的是相对本分块的时间 → 加上 chunkStart
  const chunkEnd = chunkStart + chunkDur;
  const inWindow = (v) => v >= chunkStart - 5 && v <= chunkEnd + 300;
  topics = topics.map(t => {
    const ts = parseTime(t.timestamp);
    if (inWindow(ts)) return t;
    const mmss = ((ts % 3600) + 3600) % 3600;
    for (let h = 0; h <= 8; h++) {
      const cand = h * 3600 + mmss;
      if (inWindow(cand)) {
        log(`${prefix} 时间戳修正(补小时): ${t.timestamp} -> ${formatTime(cand)}`);
        return { ...t, timestamp: formatTime(cand) };
      }
    }
    const rel = ts + chunkStart;
    if (inWindow(rel)) {
      log(`${prefix} 时间戳修正(相对->绝对): ${t.timestamp} -> ${formatTime(rel)}`);
      return { ...t, timestamp: formatTime(rel) };
    }
    log(`${prefix} 丢弃越界时间戳: ${t.timestamp}`);
    return null;
  }).filter(Boolean);
  if (topics.length === 0) throw new Error(`${prefix} 过滤后无有效知识点（时间戳越界且无法修正）`);
  topics.sort((a, b) => parseTime(a.timestamp) - parseTime(b.timestamp));
  log(`${prefix} LLM 完成：${topics.length} 个知识点`);
  return { topics, leftover, segs };
}

// ==================== 主流程 ====================
(async () => {
  const state = loadState();
  log(`=== 定点补齐启动 (dry=${DRY}) ===`);

  // --fixts 模式：修正已写入分块的原文时间戳双倍偏移（t >= 2*chunkStart 则减去 chunkStart）
  if (process.argv.includes('--fixts')) {
    const FIXES = [
      ['02.零基础/📝智能笔记/📝09.三、方程与不等式09.md', 'BATCH_6', 3600],
      ['02.零基础/📝智能笔记/📝13.四、函数13.md', 'BATCH_6', 3600],
      ['03.第01讲-函数极限与连续/📝智能笔记/📝02.第1讲一、函数的概念与特性02.md', 'BATCH_5', 3000],
      ['03.第01讲-函数极限与连续/📝智能笔记/📝08.第1讲三、函数极限的概念与性质08.md', 'BATCH_3', 1800],
      ['03.第01讲-函数极限与连续/📝智能笔记/📝09.第1讲三、函数极限的概念与性质09.md', 'BATCH_3', 1800],
    ];
    for (const [rel, anchor, cs] of FIXES) {
      const p = path.join(Z, rel);
      let note = fs.readFileSync(p, 'utf8');
      const s = note.indexOf(`%%${anchor}_START%%`);
      const e = note.indexOf(`%%${anchor}_END%%`);
      if (s === -1 || e === -1) { log(`fixts 跳过（无锚点）: ${rel}`); continue; }
      let sec = note.substring(s, e);
      let fixed = 0;
      sec = sec.replace(/\[\[[^\]]*#t=(\d{2,3}:\d{2}(?::\d{2})?)\|/g, (m, ts) => {
        const t = parseTime(ts);
        if (t >= 2 * cs) { fixed++; return m.replace(ts, formatTime(t - cs)); }
        return m;
      });
      note = note.slice(0, s) + sec + note.slice(e);
      fs.writeFileSync(p, note);
      log(`fixts ${path.basename(rel)} ${anchor}: 修正 ${fixed} 处时间戳`);
    }
    log('=== fixts 完成 ===');
    return;
  }

  // --addraw 模式：给指定笔记的已补分块追加「📜 原文」引用块（仅重跑 ASR，不再调 LLM）
  if (process.argv.includes('--addraw')) {
    const ADDRAW = [
      { note: '09.第07讲_物理应用-一元微分学/📝智能笔记/📝04.第7讲三、导数的经济应用（仅数学三）04.md', video: '09.第07讲_物理应用-一元微分学/04.第7讲三、导数的经济应用（仅数学三）04.mp4', parts: 4, cs: 600 },
    ];
    for (const t of ADDRAW) {
      t.videoPath = path.join(Z, t.video);
      t.notePath = path.join(Z, t.note);
      t.fileName = path.basename(t.videoPath);
      const dur = await getVideoDuration(FFMPEG, t.videoPath);
      for (let i = 0; i < t.parts; i++) {
        const anchorId = `BATCH_${i}`;
        const start = i * t.cs;
        const isLast = i === t.parts - 1;
        const cd = isLast ? dur - start + 5 : t.cs;
        log(`addraw ${path.basename(t.note)} ${anchorId}: 抽取 ASR ...`);
        const mp3 = await convertChunkToMp3(FFMPEG, t.videoPath, start, cd, noticeShim, '');
        const asr = await uploadToASR(mp3, `raw_p${i}.mp3`, noticeShim, '', ASR_CONFIG.API_KEYS[0]);
        const segs = (asr.segments || []).map(s => ({ start: s.start + start, text: (s.text || '').trim() }));

        const note = fs.readFileSync(t.notePath, 'utf8');
        const s = note.indexOf(`%%${anchorId}_START%%`);
        const e = note.indexOf(`%%${anchorId}_END%%`);
        if (s === -1 || e === -1) { log(`addraw ${anchorId} 无锚点，跳过`); continue; }
        const sec = note.substring(s + `%%${anchorId}_START%%`.length, e);
        // 解析该区间的知识点块（每个 ###/#### 标题 + 后续非空行为 body）
        const topics = [];
        let cur = null;
        for (const ln of sec.split('\n')) {
          const h = ln.match(/^(#### ⏱️ \S+)/);
          if (h) { if (cur) topics.push(cur); cur = { head: ln, body: [] }; continue; }
          if (cur) {
            if (ln.trim() === '') { if (cur.body.length) { topics.push(cur); cur = null; } continue; }
            cur.body.push(ln);
          }
        }
        if (cur) topics.push(cur);

        let out = '';
        for (let ti = 0; ti < topics.length; ti++) {
          const tp = topics[ti];
          out += tp.head + '\n' + tp.body.join('\n') + '\n\n';
          const m = tp.head.match(/^#### ⏱️ (\S+)/);
          if (m) {
            const t0 = parseTime(m[1]);
            const next = topics[ti + 1];
            const t1 = next ? parseTime(next.head.match(/^#### ⏱️ (\S+)/)[1]) : Infinity;
            const own = segs.filter(x => x.start >= t0 - 1 && x.start < t1);
            if (own.length) {
              out += '> [!quote]- 📜 原文\n';
              for (const x of own) { const ts = formatTime(x.start); out += `> **[[${t.fileName}#t=${ts}|${ts}]]** ${x.text}\n`; }
              out += '>\n\n';
            }
          }
        }
        const newNote = note.slice(0, s + `%%${anchorId}_START%%`.length) + '\n' + out + '\n' + note.slice(e);
        fs.writeFileSync(t.notePath, newNote);
        log(`addraw ${anchorId}: 追加 ${segs.length} 段原文 -> ${topics.length} 个知识点`);
      }
    }
    log('=== addraw 完成 ===');
    return;
  }

  if (!fs.existsSync(FFMPEG)) { log('❌ ffmpeg.exe 不存在'); process.exit(1); }

  for (const task of TASKS) {
    const shortNote = path.basename(task.note);
    if (ONLY && !shortNote.includes(ONLY)) continue;
    task.videoPath = path.join(Z, task.video);
    task.videoName = path.basename(task.videoPath);
    task.notePath = path.join(Z, task.note);
    task.fileName = task.videoName; // 笔记内链接使用带扩展名的文件名
    if (!fs.existsSync(task.videoPath)) { log(`❌ 视频缺失: ${task.videoPath}`); continue; }
    if (!fs.existsSync(task.notePath)) { log(`❌ 笔记缺失: ${task.notePath}`); continue; }

    const duration = await getVideoDuration(FFMPEG, task.videoPath);
    const cs = task.cs || solveChunkSize(duration, task.parts);
    log(`\n=== ${shortNote} | 时长 ${formatTime(duration)} | parts=${task.parts} | cs=${cs}s ===`);
    if (!cs) { log('❌ 无法求解分块大小，跳过'); continue; }

    const totalChunks = task.parts;
    const note0 = readNote(task.notePath);
    const includeRaw = noteUsesRawQuote(note0);
    log(`笔记样式: ${includeRaw ? '含📜原文块（跟随旧版样式）' : '纯知识点（新版样式）'}`);

    const indices = task.all ? Array.from({ length: totalChunks }, (_, i) => i) : task.targets;
    let history = '', leftover = '';

    for (const i of indices) {
      const anchorId = `BATCH_${i}`;
      const key = `${shortNote}#${anchorId}`;
      const chunkStart = i * cs;
      const isLast = i === totalChunks - 1;
      const chunkDur = isLast ? (duration - chunkStart) + 5 : cs;
      const rangeStr = `${formatTime(chunkStart)}~${formatTime(Math.min(chunkStart + chunkDur, duration + 5))}`;

      if (DRY) { log(`  [dry] ${anchorId}: ${rangeStr}`); continue; }
      if (state[key]) { log(`  ⏭️ ${anchorId} 已完成，跳过`); continue; }

      // 单批补齐任务：历史取笔记中前一批次的内容；整篇任务：链式累积
      const prevSection = i > 0 ? historyFromSection(sectionOf(note0, `BATCH_${i - 1}`)) : '';
      const hist = task.all ? history : prevSection;

      try {
        const { topics, leftover: lo, segs } = await processChunk(task, i, chunkStart, chunkDur, hist, task.all ? leftover : '', task.fileName);
        const content = buildContent(topics, task.fileName, segs, includeRaw, chunkStart);
        spliceNote(task.notePath, anchorId, content);
        state[key] = { done: true, at: Date.now(), topics: topics.length };
        saveState(state);
        log(`  ✅ ${anchorId} (${rangeStr}) 写入 ${topics.length} 个知识点`);

        // 整篇任务：链式更新 history 与 leftover（与插件逻辑一致）
        if (task.all) {
          for (const t of topics) {
            const detail = t.key_points ? t.key_points.join('；') : (t.summary || '');
            history += `[${t.timestamp}] ${t.title}\n${detail ? `描述: ${detail.replace(/\*\*/g, '')}\n` : ''}`;
          }
          leftover = lo || '';
        }
      } catch (e) {
        log(`  ❌ ${anchorId} 失败: ${e.message}`);
        state[key] = { done: false, error: e.message, at: Date.now() };
        saveState(state);
      }
    }
  }
  log('=== 定点补齐结束 ===');
})().catch(e => { log(`❌ 致命错误: ${e.stack || e}`); process.exit(1); });
