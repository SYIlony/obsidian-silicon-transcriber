/* 冒烟测试：主从视图联动触发层（离线，直接加载构建产物 main.js）
 *
 * 验证目标：
 *  - 打开视频（WorkspaceLeaf.openFile：资源管理器点开 / 链接跳转 / 拖拽 / 新窗口）→ 联动右侧智能笔记
 *  - 在播放画面上右击（contextmenu capture）→ 联动
 *  - 启动恢复工作区（onLayoutReady 兜底）→ 联动
 *  - 点击播放画面暂停/播放、点标签页、点文件列表（只 setActiveLeaf 激活窗格）→ 不联动
 *  - 右侧已显示同笔记 → 不重复切换、不抢焦点
 *  - 卸载时原型方法还原（且不覆盖其它插件的包装）
 *
 * 复跑：node scripts/test_media_linkage_smoke.cjs
 * 背景：不要改回 workspace.on('file-open')！Obsidian 的 file-open 实际语义是"活动文件变化"
 *      （app.js activeLeafEvents: activeFile 变了就 trigger），点击播放画面把活动文件从
 *      侧栏笔记切回视频时同样触发，会导致"点一下暂停右侧内容就切换 + 焦点被抢"。
 */
const Module = require('module');
const nodePath = require('path');

const PLUGIN_DIR = nodePath.join(__dirname, '..');

// ---------- DOM 全局桩 ----------
globalThis.HTMLElement = class HTMLElement {};
globalThis.document = { addEventListener() {}, removeEventListener() {} };

// ---------- obsidian 桩 ----------
class TFile {
  constructor(p) {
    this.path = p;
    const i = p.lastIndexOf('/');
    this.basename = (i < 0 ? p : p.slice(i + 1)).replace(/\.[^.]+$/, '');
    this.extension = p.split('.').pop();
    this.parent = i < 0 ? null : { path: p.slice(0, i) };
  }
}
class TFolder {}
class WorkspaceLeaf {
  constructor(app) { this.app = app; this.view = null; this._root = undefined; }
  openFile(...args) {
    this.openFileCalls = (this.openFileCalls || 0) + 1;
    if (this._reject) return Promise.reject(new Error('simulated open failure'));
    const f = args[0];
    if (!this._noBind && f && typeof f.path === 'string') {
      this.view = Object.assign({}, this.view, { file: f });
    }
    return Promise.resolve();
  }
  getRoot() { if (this._root === undefined) throw new Error('leaf not attached'); return this._root; }
  detach() {}
  getViewState() { return { type: 'markdown', state: {} }; }
  setViewState() { return Promise.resolve(); }
}
class Notice { constructor() {} hide() {} setMessage() {} }
class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; }
  registerEvent(e) { (this._events = this._events || []).push(e); }
  registerDomEvent(el, type, cb, opts) { (this._dom = this._dom || []).push({ el, type, cb, opts }); }
  register(cb) { (this._cleanups = this._cleanups || []).push(cb); }
  addCommand(c) { (this._commands = this._commands || []).push(c); }
  addSettingTab() {}
  registerObsidianProtocolHandler(id) { (this._protocols = this._protocols || []).push(id); }
  async loadData() { return {}; }
  async saveData() {}
}
class PluginSettingTab { constructor() {} }
class Setting { constructor() {} }
class MarkdownView {}
class Editor {}
class FileSystemAdapter {}

const stubs = { Plugin, Notice, MarkdownView, Editor, FileSystemAdapter, WorkspaceLeaf, TFile, TFolder, PluginSettingTab, Setting };
const obsidianModule = new Proxy(stubs, {
  get(t, k) { if (k in t) return t[k]; if (k === '__esModule') return true; return function Any() {}; }
});

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'obsidian') return obsidianModule;
  if (request === 'electron') return {};
  return origLoad.apply(this, arguments);
};

// ---------- app 桩 ----------
function makeApp() {
  const rightSplit = { name: 'rightSplit' };
  const leftSplit = { name: 'leftSplit' };
  const rootSplit = { name: 'rootSplit' };
  const app = { workspace: null, vault: null, metadataCache: {} };
  const workspace = {
    rightSplit, leftSplit, rootSplit,
    _leaves: [], _events: [], _activeFile: null, _revealCalls: [], _setActiveLeafCalls: [],
    on(name, cb) { this._events.push({ name, cb }); return { name }; },
    onLayoutReady(cb) { this._onLayoutReady = cb; },
    getLeavesOfType(type) { return this._leaves.filter(l => l._type === type); },
    iterateAllLeaves(cb) { this._leaves.forEach(cb); },
    getActiveFile() { return this._activeFile; },
    getRightLeaf() { return this._rightLeaf || null; },
    getLeaf() { const l = new WorkspaceLeaf(app); l._root = rootSplit; this._leaves.push(l); return l; },
    setActiveLeaf(leaf, opts) { this._setActiveLeafCalls.push({ leaf, opts }); },
    revealLeaf(leaf) { this._revealCalls.push(leaf); },
    trigger() {},
  };
  app.workspace = workspace;
  const vaultFiles = {};
  app.vault = {
    getAbstractFileByPath(p) { return vaultFiles[p] || null; },
    adapter: { exists: async () => false, read: async () => '{}' },
    on() { return {}; },
    read: async () => '',
    getFiles() { return Object.values(vaultFiles); },
  };
  return { app, workspace, vaultFiles };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
}

(async () => {
  const { app, workspace, vaultFiles } = makeApp();
  const mainMod = require(nodePath.join(PLUGIN_DIR, 'main.js'));
  const PluginClass = mainMod.default || mainMod;
  const baseOpenFile = WorkspaceLeaf.prototype.openFile;

  const plugin = new PluginClass(app, { id: 'obsidian-siliconflow-transcriber', dir: PLUGIN_DIR });
  await plugin.onload();

  // ===== 1. 注册项 =====
  const wsNames = workspace._events.map(e => e.name);
  check("不再订阅 workspace 'file-open'（根因：file-open=活动文件变化，点击会误触发）", !wsNames.includes('file-open'));
  check("保留 'window-open'（弹出窗右键联动）", wsNames.includes('window-open'));
  check('注册 document contextmenu（capture 阶段）', (() => {
    const cm = (plugin._dom || []).find(d => d.type === 'contextmenu');
    return !!cm && !!cm.opts && cm.opts.capture === true;
  })());
  const wrappedOpenFile = WorkspaceLeaf.prototype.openFile;
  check('WorkspaceLeaf.prototype.openFile 已被包装', wrappedOpenFile !== baseOpenFile);

  // ===== fixtures =====
  const videoA = new TFile('课程/lesson1.mp4');
  const videoB = new TFile('课程/lesson2.mp4');
  const videoC = new TFile('课程/nonote.mp4');
  const noteA = new TFile('课程/📝智能笔记/📝lesson1.md');
  const noteB = new TFile('课程/📝智能笔记/📝lesson2.md');
  vaultFiles[noteA.path] = noteA;
  vaultFiles[noteB.path] = noteB;

  const mkLeaf = (file, root, type) => {
    const l = new WorkspaceLeaf(app);
    l._root = root; l._type = type;
    l.view = { file, containerEl: { contains: () => false } };
    workspace._leaves.push(l);
    return l;
  };
  const videoLeaf = mkLeaf(videoA, workspace.rootSplit, 'mx-file');

  const rightLeaf = new WorkspaceLeaf(app);
  rightLeaf._root = workspace.rightSplit;
  rightLeaf._type = 'markdown';
  rightLeaf.view = { file: null };
  workspace._rightLeaf = rightLeaf;
  workspace._leaves.push(rightLeaf);

  // spy：右侧切换调用
  const sidebarCalls = [];
  const realOpenNote = plugin.openNoteInRightSidebar.bind(plugin);
  plugin.openNoteInRightSidebar = async (f) => { sidebarCalls.push(f.path); return realOpenNote(f); };

  // ===== 2. 点击播放画面暂停/播放（只 setActiveLeaf，不 openFile）→ 不联动 =====
  workspace.setActiveLeaf(videoLeaf, { focus: true });
  await sleep(10);
  check('点击播放画面（暂停/播放）不联动', sidebarCalls.length === 0);
  check('点击不联动时也不会切侧栏', workspace._revealCalls.length === 0 && (rightLeaf.openFileCalls || 0) === 0);

  // ===== 3. 真正打开视频 → 联动 =====
  const sacBefore3 = workspace._setActiveLeafCalls.length;
  await videoLeaf.openFile(videoA);
  await sleep(10);
  check('打开视频（openFile）→ 联动到智能笔记', sidebarCalls.length === 1 && sidebarCalls[0] === noteA.path);
  check('联动：右侧窗口打开了对应笔记', rightLeaf.view.file === noteA && (rightLeaf.openFileCalls || 0) === 1);
  check('联动：不把焦点从播放画面抢走（联动过程未调用 setActiveLeaf）', workspace._setActiveLeafCalls.length === sacBefore3);

  // ===== 4. 右侧已显示该笔记 → 打开同视频：不重复打开文件，改为激活/聚焦已有笔记 =====
  const openCallsBefore4 = rightLeaf.openFileCalls || 0;
  const sacBefore4 = workspace._setActiveLeafCalls.length;
  await videoLeaf.openFile(videoA);
  await sleep(10);
  check('右侧已显示同笔记 → 打开同视频不再重复打开文件', (rightLeaf.openFileCalls || 0) === openCallsBefore4);
  check('右侧已显示同笔记 → 激活并聚焦该笔记（标签页会被选中）',
    workspace._setActiveLeafCalls.length === sacBefore4 + 1 &&
    workspace._setActiveLeafCalls[sacBefore4].leaf === rightLeaf &&
    workspace._setActiveLeafCalls[sacBefore4].opts && workspace._setActiveLeafCalls[sacBefore4].opts.focus === true);

  // ===== 5. 打开无对应笔记的视频 → 不切换 =====
  const leafC = mkLeaf(videoC, workspace.rootSplit, 'mx-file');
  const before5 = sidebarCalls.length;
  await leafC.openFile(videoC);
  await sleep(10);
  check('打开无智能笔记的视频 → 不切换', sidebarCalls.length === before5);

  // ===== 6. 打开 md 文件 → 不联动 =====
  const mdLeaf = mkLeaf(null, workspace.rootSplit, 'markdown');
  const before6 = sidebarCalls.length;
  await mdLeaf.openFile(noteA);
  await sleep(10);
  check('打开 .md 笔记 → 不联动', sidebarCalls.length === before6);

  // ===== 7. 在侧边栏打开视频 → 不联动 =====
  const sbLeaf = mkLeaf(videoB, workspace.rightSplit, 'mx-file');
  const before7 = sidebarCalls.length;
  await sbLeaf.openFile(videoB);
  await sleep(10);
  check('在侧边栏打开视频 → 不联动', sidebarCalls.length === before7);

  // ===== 8. 打开失败（view 未换成该文件）→ 不联动 =====
  const leafX = mkLeaf(noteA, workspace.rootSplit, 'mx-file');
  leafX._noBind = true;
  const before8 = sidebarCalls.length;
  await leafX.openFile(videoA);
  await sleep(10);
  check('打开失败/视图未切换 → 不联动', sidebarCalls.length === before8);

  // ===== 9. openFile reject → 不联动、异常不外抛 =====
  const leafR = mkLeaf(null, workspace.rootSplit, 'mx-file');
  leafR._reject = true;
  const before9 = sidebarCalls.length;
  let rejected = false;
  await leafR.openFile(videoB).catch(() => { rejected = true; });
  await sleep(10);
  check('openFile 失败 → 不联动且异常被吞掉不外抛', sidebarCalls.length === before9 && rejected === true);

  // ===== 10. 启动兜底（onLayoutReady）：当前激活是视频 → 联动 =====
  rightLeaf.view = { file: null };  // 模拟侧栏不是这篇笔记
  const before10 = sidebarCalls.length;
  workspace._activeFile = videoA;
  workspace._onLayoutReady();
  await sleep(10);
  check('启动恢复：激活文件是视频 → 联动', sidebarCalls.length === before10 + 1 && sidebarCalls[sidebarCalls.length - 1] === noteA.path);
  const before10b = sidebarCalls.length;
  workspace._activeFile = noteA;   // 激活是笔记 → 不联动
  workspace._onLayoutReady();
  await sleep(10);
  check('启动恢复：激活文件是笔记 → 不联动', sidebarCalls.length === before10b);

  // ===== 11. 右键播放画面 → 联动（原有触发方式保留） =====
  const contentEl = {};
  const videoLeafB = mkLeaf(videoB, workspace.rootSplit, 'mx-file');
  videoLeafB.view.containerEl = { contains: (el) => el === contentEl };
  const target = new HTMLElement();
  target.closest = (sel) => (sel === '.view-content' ? contentEl : null);
  const cmCb = (plugin._dom || []).find(d => d.type === 'contextmenu').cb;
  const before11 = sidebarCalls.length;
  cmCb({ target });
  await sleep(10);
  check('右键播放画面 → 联动', sidebarCalls.length === before11 + 1 && sidebarCalls[sidebarCalls.length - 1] === noteB.path);
  const openCallsBefore11b = rightLeaf.openFileCalls || 0;
  const sacBefore11b = workspace._setActiveLeafCalls.length;
  cmCb({ target });   // 右侧已显示 noteB → 不重复打开文件，改为激活
  await sleep(10);
  check('右键且右侧已显示该笔记 → 不重复打开文件、改为激活聚焦',
    (rightLeaf.openFileCalls || 0) === openCallsBefore11b &&
    workspace._setActiveLeafCalls.length === sacBefore11b + 1);

  // ===== 12. 卸载清理：自己不在外层时不覆盖他人包装 =====
  const top = function (...a) { return wrappedOpenFile.apply(this, a); };
  WorkspaceLeaf.prototype.openFile = top;
  (plugin._cleanups || []).forEach(f => f());
  check('卸载：自己不在外层时不覆盖他人包装', WorkspaceLeaf.prototype.openFile === top);

  // ===== 13. 卸载清理：自己在外层时还原 =====
  WorkspaceLeaf.prototype.openFile = baseOpenFile;
  const plugin2 = new PluginClass(app, { id: 'obsidian-siliconflow-transcriber', dir: PLUGIN_DIR });
  await plugin2.onload();
  check('二次装配：包装生效', WorkspaceLeaf.prototype.openFile !== baseOpenFile);
  (plugin2._cleanups || []).forEach(f => f());
  check('卸载：自己在外层时还原原型方法', WorkspaceLeaf.prototype.openFile === baseOpenFile);

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exitCode = fail === 0 ? 0 : 1;
})().catch(err => { console.error('HARNESS ERROR:', err); process.exitCode = 2; });
