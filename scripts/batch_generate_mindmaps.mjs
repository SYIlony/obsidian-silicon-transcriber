#!/usr/bin/env node
/**
 * batch_generate_mindmaps.mjs
 * 
 * 批量调用 gemini-3.8-flash-high，为 12 大考点逐一生成二轮思维导图，
 * 并直接输出至 Z:\Z_27电路\00.电路_水木\02.综合提升阶段\
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateMindmapOutline } from './agent_mindmap_generator.mjs';

const DESKTOP_DRAFTS_DIR = 'C:/Users/17329/Desktop/电路二轮考点解析';
const TARGET_OUTPUT_DIR = 'Z:/Z_27电路/00.电路_水木/02.综合提升阶段';
const BASE_NOTES_DIR = 'Z:/Z_27电路/00.电路_水木/01.电桥哥基础课';

const TASKS = [
  {
    num: '01',
    draft: '考点01_等效电路.md',
    outFile: '01.考点01_等效电路🧠.md',
    title: '考点01 等效电路二轮复习思维导图',
    refDirs: ['01_第一章-电路模型及电路定律', '02_第二章-电阻电路的等效变换']
  },
  {
    num: '02',
    draft: '考点02_电路方程.md',
    outFile: '02.考点02_电路方程🧠.md',
    title: '考点02 电路方程二轮复习思维导图',
    refDirs: ['03_第三章-电路方程']
  },
  {
    num: '03',
    draft: '考点03_电路定理.md',
    outFile: '03.考点03_电路定理🧠.md',
    title: '考点03 电路定理二轮复习思维导图',
    refDirs: ['04_第四章-电路定理']
  },
  {
    num: '04',
    draft: '考点04_运放.md',
    outFile: '04.考点04_运放电路🧠.md',
    title: '考点04 运算放大器二轮复习思维导图',
    refDirs: ['05_第五章-理想运放']
  },
  {
    num: '05',
    draft: '考点05_动态电路时域法.md',
    outFile: '05.考点05_动态电路时域法🧠.md',
    title: '考点05 动态电路时域法二轮复习思维导图',
    refDirs: ['06_第六章-动态电路之基本元件', '07_第七章-动态电路之时域分析']
  },
  {
    num: '06',
    draft: '考点06_动态电路运算法.md',
    outFile: '06.考点06_动态电路运算法🧠.md',
    title: '考点06 动态电路运算法二轮复习思维导图',
    refDirs: ['14_第十四章-拉普拉斯变换']
  },
  {
    num: '07',
    draft: '考点07_正弦稳态电路.md',
    outFile: '07.考点07_正弦稳态电路🧠.md',
    title: '考点07 正弦稳态电路二轮复习思维导图',
    refDirs: ['08_第八章-相量法', '09_第九章-正弦稳态电路']
  },
  {
    num: '08',
    draft: '考点08_谐振电路.md',
    outFile: '08.考点08_谐振电路🧠.md',
    title: '考点08 谐振电路二轮复习思维导图',
    refDirs: ['11_第十一章-电路的频率响应']
  },
  {
    num: '09',
    draft: '考点09_耦合电感与变压器.md',
    outFile: '09.考点09_耦合电感与变压器🧠.md',
    title: '考点09 耦合电感与变压器二轮复习思维导图',
    refDirs: ['10_第十章-耦合电感电路分析']
  },
  {
    num: '10',
    draft: '考点10_非正弦周期电路.md',
    outFile: '10.考点10_非正弦周期电路🧠.md',
    title: '考点10 非正弦周期电路二轮复习思维导图',
    refDirs: ['13_第十三章-非正弦周期电路']
  },
  {
    num: '11',
    draft: '考点11_三相电路.md',
    outFile: '11.考点11_三相电路🧠.md',
    title: '考点11 三相电路二轮复习思维导图',
    refDirs: ['12_第十二章-三相电路']
  },
  {
    num: '12',
    draft: '考点12_二端口网络.md',
    outFile: '12.考点12_二端口网络🧠.md',
    title: '考点12 二端口网络二轮复习思维导图',
    refDirs: ['16_第十六章-二端口网络']
  }
];

// 提取关联目录中的所有 .md 关键文本摘要
function gatherRefNotes(refDirs) {
  let combined = '';
  for (const d of refDirs) {
    const fullDir = path.join(BASE_NOTES_DIR, d);
    if (!fs.existsSync(fullDir)) continue;
    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md') && !f.includes('-rich'));
    for (const f of files.slice(0, 5)) {
      try {
        const text = fs.readFileSync(path.join(fullDir, f), 'utf-8');
        // 取前 800 字作为背景知识
        combined += `\n--- [${f}] ---\n` + text.slice(0, 800) + '\n';
      } catch (e) {
        // ignore
      }
    }
  }
  return combined;
}

async function main() {
  fs.mkdirSync(TARGET_OUTPUT_DIR, { recursive: true });
  console.log(`🚀 开始批量生成 12 大考点二轮思维导图...`);
  console.log(`📁 输出目录: ${TARGET_OUTPUT_DIR}`);
  console.log(`🤖 使用模型: gemini-3.8-flash-high\n`);

  for (let i = 0; i < TASKS.length; i++) {
    const task = TASKS[i];
    const draftPath = path.join(DESKTOP_DRAFTS_DIR, task.draft);
    const outPath = path.join(TARGET_OUTPUT_DIR, task.outFile);

    console.log(`[${i + 1}/12] 处理 ${task.draft} -> ${task.outFile}...`);

    if (!fs.existsSync(draftPath)) {
      console.error(`  ❌ 缺失解析稿: ${draftPath}`);
      continue;
    }

    const content = fs.readFileSync(draftPath, 'utf-8');
    const refNotes = gatherRefNotes(task.refDirs);

    let retries = 3;
    let success = false;
    while (retries > 0 && !success) {
      try {
        const outline = await generateMindmapOutline({
          title: task.title,
          content,
          referenceNotes: refNotes,
          customPrompt: "严格按照考研二轮思维导图规范输出，以题型和考点二轮总结为主，必须附带做题技巧与避坑指南，结构清晰工整，严禁混乱。"
        });

        // 写入文件
        fs.writeFileSync(outPath, outline, 'utf-8');
        console.log(`  ✅ 成功保存: ${task.outFile} (${outline.length} 字符)`);
        success = true;
      } catch (err) {
        retries--;
        console.warn(`  ⚠️ 生成失败 (${err.message})，剩余重试次数: ${retries}`);
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 3000));
        } else {
          console.error(`  ❌ 该考点最终失败: ${task.outFile}`);
        }
      }
    }

    // 适当间隔避免速率受限
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n🎉 批量生成流程执行完毕！`);
}

main().catch(e => {
  console.error(`全局异常: ${e.message}`);
  process.exit(1);
});
