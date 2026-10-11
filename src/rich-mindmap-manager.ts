/**
 * 🧠 Rich 思维导图管理引擎 (MarkMind 格式)
 *
 * 核心能力：
 * 1. 拓扑分析与分类：识别主根节点，按次级节点提取完整分支子树，兜底闭包提取独立游离节点（保证 100% 不漏不拿）
 * 2. 跨图组装迁移/复制：防冲突 ID 全局重映射、关联元数据继承 (induce/wireFrame/relateLink)
 * 3. 2D 几何坐标自适应重排：防重叠、同侧最低点对齐、分支树动态递归排版、配色循环继承
 * 4. 原子合并与文件同步：支持复制模式 (Copy) 与 剪切迁移模式 (Move)
 */

import { App, TFile } from 'obsidian';

/* ==================== 基础数据类型 ==================== */

export interface MarkmindNode {
    id: string;
    pid?: string;
    text?: string;
    x?: number;
    y?: number;
    stroke?: string;
    isRoot?: boolean;
    isExpand?: boolean;
    hasMark?: unknown;
    collapseMark?: boolean;
    style?: Record<string, unknown>;
    layout?: unknown;
    main?: boolean;
    useHandMode?: boolean;
    useScale?: boolean;
    [key: string]: unknown;
}

export interface MarkmindRichDoc {
    theme?: string;
    mindData: MarkmindNode[][];
    induceData?: Array<Record<string, unknown>>;
    wireFrameData?: Array<Record<string, unknown>>;
    relateLinkData?: Array<Record<string, unknown>>;
    calloutData?: Array<Record<string, unknown>>;
    version?: string;
    opt?: unknown;
    [key: string]: unknown;
}

export interface MindmapGroup {
    id: string;                    // 分组标识（次级节点 ID 或独立组 ID）
    rootNodeId: string;            // 本组顶层节点 ID
    title: string;                 // 显示名称（节点文本或默认名称）
    type: 'secondary' | 'orphan';  // 'secondary' = 次级节点分支, 'orphan' = 独立游离节点组
    nodes: MarkmindNode[];         // 该组包含的所有节点（按拓扑顺序）
    nodeCount: number;             // 节点总数（包含该分支下所有后代）
    relatedInduce: Array<Record<string, unknown>>;
    relatedWireFrames: Array<Record<string, unknown>>;
    relatedRelateLinks: Array<Record<string, unknown>>;
}

export interface MindmapAnalysisResult {
    rootNode: MarkmindNode | null;
    groups: MindmapGroup[];
    totalNodeCount: number;
    accountedNodeCount: number;
    isComplete: boolean;           // 是否严格满足：Root + 所有组节点数 === 节点总数
    doc: MarkmindRichDoc;
    fenceStart: number;
    fenceEnd: number;
    rawJsonText: string;
}

export type MigrateMode = 'copy' | 'move';

export interface MigrateOptions {
    sourceFile: TFile;
    targetFile: TFile;
    groupIds: string[];            // 选中的分组 ID 列表
    mode: MigrateMode;             // 'copy' (保留源导图) 或 'move' (从源导图移除)
}

export interface MigrateResult {
    migratedGroupCount: number;
    migratedNodeCount: number;
    targetUpdatedContent: string;
    sourceUpdatedContent?: string; // 仅在 move 模式下返回修改后的源文本
}

/* ==================== 常量与工具函数 ==================== */

const RICH_FENCE_RE = /^```[ ]?json[ ]?\n([\s\S]*?)\n```[ ]*$/m;
const LEAF_GAP = 34;          // 叶子节点纵向间距
const LEVEL_DX = 170;         // 每层横向缩进
const DEFAULT_PALETTE = ['#00E5FF', '#76FF03', '#FFEA00', '#FF4081', '#B2FF59', '#E040FB', '#00E676'];

/** 生成 MarkMind 8-4-4 十六进制 ID */
export function genMarkmindId(): string {
    const t = () => ((65536 * (1 + Math.random())) | 0).toString(16).substring(1);
    return t() + t() + '-' + t() + '-' + t();
}

/** 清洗节点 HTML 标签供显示 */
export function sanitizeNodeDisplayTitle(text: string | undefined): string {
    if (!text) return '(无标题节点)';
    const cleaned = text
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
    return cleaned.length > 0 ? cleaned : '(空白节点)';
}

/**
 * 智能判定文件是否为思维导图（不依赖死板的 -rich.md 后缀，穿透识别 frontmatter 元数据与内容结构）
 */
export function isMindmapFile(app: App, file: TFile, content?: string): boolean {
    if (file.extension !== 'md') return false;

    // 1. 优先查 Obsidian 内存中的 MetadataCache frontmatter（零耗时，改名后依然精准识别）
    const cache = app.metadataCache.getFileCache(file);
    const fmPlugin = cache?.frontmatter?.['mindmap-plugin'];
    if (fmPlugin === 'rich' || fmPlugin === 'basic') return true;

    // 2. 宽松文件名匹配（包含 🧠 或 rich）
    if (file.basename.includes('🧠') || file.name.includes('rich') || file.name.endsWith('-rich.md')) {
        return true;
    }

    // 3. 内容特征检测（若提供了文本，检查是否包含 MarkMind 的核心 JSON 数据块）
    if (content) {
        if (content.includes('mindmap-plugin: rich') || content.includes('mindmap-plugin: basic')) {
            return true;
        }
        if (content.includes('```json') && content.includes('"mindData"')) {
            return true;
        }
    }

    return false;
}

/* ==================== 1. 思维导图解析与全覆盖分组算法 ==================== */

/**
 * 解析并分析 rich 格式思维导图的所有节点与拓扑分组。
 * 严格按照：
 * 1. 查找全局主根节点
 * 2. 依次按次级节点提取所有子孙节点
 * 3. 闭包提取所有独立游离节点
 * 保证 100% 完整覆盖，不漏不拿任何一个节点。
 */
export function parseAndAnalyzeRichMindmap(markdownContent: string): MindmapAnalysisResult {
    const match = markdownContent.match(RICH_FENCE_RE);
    if (!match || match.index === undefined) {
        throw new Error('未找到 ```json 代码块，该文件不是有效的 rich 思维导图');
    }

    const rawJsonText = match[1];
    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(rawJsonText);
    } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        throw new Error('解析思维导图 JSON 失败: ' + errorMsg);
    }

    if (!parsedJson || typeof parsedJson !== 'object') {
        throw new Error('思维导图数据格式无效');
    }

    const rawDocRecord = parsedJson as Record<string, unknown>;
    const mindDataCandidate = rawDocRecord.mindData;
    if (!Array.isArray(mindDataCandidate) || !Array.isArray(mindDataCandidate[0])) {
        throw new Error('思维导图数据结构异常，缺少 mindData[0] 节点数组');
    }

    const rawNodes: MarkmindNode[] = mindDataCandidate[0] as MarkmindNode[];
    const doc: MarkmindRichDoc = {
        theme: typeof rawDocRecord.theme === 'string' ? rawDocRecord.theme : '',
        mindData: [rawNodes],
        induceData: Array.isArray(rawDocRecord.induceData) ? (rawDocRecord.induceData as Array<Record<string, unknown>>) : [],
        wireFrameData: Array.isArray(rawDocRecord.wireFrameData) ? (rawDocRecord.wireFrameData as Array<Record<string, unknown>>) : [],
        relateLinkData: Array.isArray(rawDocRecord.relateLinkData) ? (rawDocRecord.relateLinkData as Array<Record<string, unknown>>) : [],
        calloutData: Array.isArray(rawDocRecord.calloutData) ? (rawDocRecord.calloutData as Array<Record<string, unknown>>) : [],
        version: typeof rawDocRecord.version === 'string' ? rawDocRecord.version : undefined,
        opt: rawDocRecord.opt,
    };

    const totalNodeCount = rawNodes.length;
    if (totalNodeCount === 0) {
        return {
            rootNode: null,
            groups: [],
            totalNodeCount: 0,
            accountedNodeCount: 0,
            isComplete: true,
            doc,
            fenceStart: match.index,
            fenceEnd: match.index + match[0].length,
            rawJsonText
        };
    }

    // 构建 ID 字典与父子关系映射
    const idMap = new Map<string, MarkmindNode>();
    const childrenMap = new Map<string, MarkmindNode[]>();

    for (const node of rawNodes) {
        if (!node.id) continue;
        idMap.set(node.id, node);
        if (node.pid) {
            const list = childrenMap.get(node.pid) || [];
            list.push(node);
            childrenMap.set(node.pid, list);
        }
    }

    // 1. 寻找主根节点
    // 规则：isRoot === true 或 main === true 或 (没有 pid 且不是孤儿节点)
    let rootNode = rawNodes.find(n => n.isRoot === true);
    if (!rootNode) rootNode = rawNodes.find(n => n.main === true);
    if (!rootNode) rootNode = rawNodes.find(n => !n.pid || n.pid.trim() === '');
    if (!rootNode && rawNodes.length > 0) rootNode = rawNodes[0];

    const visitedNodeIds = new Set<string>();
    if (rootNode) {
        visitedNodeIds.add(rootNode.id);
    }

    const groups: MindmapGroup[] = [];

    // 辅助函数：收集属于某节点的元数据关联对象
    const extractAssociatedData = (subtreeNodeIds: Set<string>) => {
        const relatedInduce = (doc.induceData || []).filter(item => {
            const nodeId = typeof item.nodeId === 'string' ? item.nodeId : undefined;
            return nodeId !== undefined && subtreeNodeIds.has(nodeId);
        });
        const relatedWireFrames = (doc.wireFrameData || []).filter(item => {
            const nodeId = typeof item.nodeId === 'string' ? item.nodeId : undefined;
            return nodeId !== undefined && subtreeNodeIds.has(nodeId);
        });
        const relatedRelateLinks = (doc.relateLinkData || []).filter(item => {
            const from = typeof item.from === 'string' ? item.from : undefined;
            const to = typeof item.to === 'string' ? item.to : undefined;
            return from !== undefined && to !== undefined && subtreeNodeIds.has(from) && subtreeNodeIds.has(to);
        });
        return { relatedInduce, relatedWireFrames, relatedRelateLinks };
    };

    // 2. 根据次级节点进行分类分组 (Secondary Nodes)
    const secondaryNodes = rootNode ? (childrenMap.get(rootNode.id) || []) : [];
    for (const secNode of secondaryNodes) {
        const subtreeNodes: MarkmindNode[] = [];
        const subtreeIds = new Set<string>();

        // 深度优先遍历收集整棵子树
        const collect = (current: MarkmindNode) => {
            subtreeNodes.push(current);
            subtreeIds.add(current.id);
            visitedNodeIds.add(current.id);
            const children = childrenMap.get(current.id) || [];
            for (const child of children) {
                collect(child);
            }
        };

        collect(secNode);

        const meta = extractAssociatedData(subtreeIds);
        groups.push({
            id: secNode.id,
            rootNodeId: secNode.id,
            title: sanitizeNodeDisplayTitle(secNode.text),
            type: 'secondary',
            nodes: subtreeNodes,
            nodeCount: subtreeNodes.length,
            relatedInduce: meta.relatedInduce,
            relatedWireFrames: meta.relatedWireFrames,
            relatedRelateLinks: meta.relatedRelateLinks,
        });
    }

    // 3. 处理独立节点与游离分支 (Orphan / Free Nodes)
    // 找出所有既不是全局根节点、又未被任何次级节点子树覆盖的节点
    const remainingNodes = rawNodes.filter(n => !visitedNodeIds.has(n.id));

    if (remainingNodes.length > 0) {
        // 构建剩余节点的连通分支
        const remainingIdSet = new Set(remainingNodes.map(n => n.id));
        const orphanRoots = remainingNodes.filter(n => !n.pid || !remainingIdSet.has(n.pid) || !idMap.has(n.pid));

        let orphanGroupIndex = 1;
        for (const orphanRoot of orphanRoots) {
            const subtreeNodes: MarkmindNode[] = [];
            const subtreeIds = new Set<string>();

            const collectOrphan = (current: MarkmindNode) => {
                if (visitedNodeIds.has(current.id)) return;
                subtreeNodes.push(current);
                subtreeIds.add(current.id);
                visitedNodeIds.add(current.id);
                const children = (childrenMap.get(current.id) || []).filter(c => remainingIdSet.has(c.id));
                for (const child of children) {
                    collectOrphan(child);
                }
            };

            collectOrphan(orphanRoot);

            if (subtreeNodes.length > 0) {
                const meta = extractAssociatedData(subtreeIds);
                groups.push({
                    id: orphanRoot.id,
                    rootNodeId: orphanRoot.id,
                    title: `🧩 独立分支 ${orphanGroupIndex}: ${sanitizeNodeDisplayTitle(orphanRoot.text)}`,
                    type: 'orphan',
                    nodes: subtreeNodes,
                    nodeCount: subtreeNodes.length,
                    relatedInduce: meta.relatedInduce,
                    relatedWireFrames: meta.relatedWireFrames,
                    relatedRelateLinks: meta.relatedRelateLinks,
                });
                orphanGroupIndex++;
            }
        }

        // 若仍有任何因环状或异常父子关系未被遍历到的死角节点，全部统一兜底收入独立散落组
        const unvisitedRemainder = rawNodes.filter(n => !visitedNodeIds.has(n.id));
        if (unvisitedRemainder.length > 0) {
            const subtreeIds = new Set(unvisitedRemainder.map(n => n.id));
            unvisitedRemainder.forEach(n => visitedNodeIds.add(n.id));
            const meta = extractAssociatedData(subtreeIds);
            groups.push({
                id: `orphan-fallback-${Date.now()}`,
                rootNodeId: unvisitedRemainder[0].id,
                title: `🧩 散落节点集合 (${unvisitedRemainder.length}个节点)`,
                type: 'orphan',
                nodes: unvisitedRemainder,
                nodeCount: unvisitedRemainder.length,
                relatedInduce: meta.relatedInduce,
                relatedWireFrames: meta.relatedWireFrames,
                relatedRelateLinks: meta.relatedRelateLinks,
            });
        }
    }

    // 4. 信息完整性检验 (Conservation Check)
    // 统计所有分组所含节点数之和 + 根节点
    const accountedNodeCount = (rootNode ? 1 : 0) + groups.reduce((acc, g) => acc + g.nodeCount, 0);
    const isComplete = (accountedNodeCount === totalNodeCount);

    return {
        rootNode: rootNode || null,
        groups,
        totalNodeCount,
        accountedNodeCount,
        isComplete,
        doc,
        fenceStart: match.index,
        fenceEnd: match.index + match[0].length,
        rawJsonText
    };
}

/* ==================== 2. 坐标自适应排版与子树空间重绘 ==================== */

interface SubtreeLayoutNode {
    node: MarkmindNode;
    children: SubtreeLayoutNode[];
}

/**
 * 递归计算子树最低点 Y 坐标
 */
function getSubtreeMaxBottom(node: MarkmindNode, childrenMap: Map<string, MarkmindNode[]>): number {
    let bottom = node.y ?? 0;
    const children = childrenMap.get(node.id) || [];
    for (const child of children) {
        bottom = Math.max(bottom, getSubtreeMaxBottom(child, childrenMap));
    }
    return bottom;
}

/**
 * 构建子树的层级树结构
 */
function buildSubtreeHierarchy(nodes: MarkmindNode[], groupRootId: string): SubtreeLayoutNode {
    const nodeMap = new Map<string, MarkmindNode>();
    const childListMap = new Map<string, MarkmindNode[]>();

    for (const n of nodes) {
        nodeMap.set(n.id, n);
        if (n.pid) {
            const list = childListMap.get(n.pid) || [];
            list.push(n);
            childListMap.set(n.pid, list);
        }
    }

    const buildNode = (curr: MarkmindNode): SubtreeLayoutNode => {
        const children = (childListMap.get(curr.id) || []).map(buildNode);
        return { node: curr, children };
    };

    const root = nodeMap.get(groupRootId) || nodes[0];
    return buildNode(root);
}

/**
 * 对即将追加的一组节点执行自适应 2D 树形坐标排版
 * 确保叶子节点纵向对齐、父节点居中、层级递增、并且完全排在目标导图所有同侧分支的最底端下方，零重叠
 */
function layoutRelocatedSubtree(
    nodes: MarkmindNode[],
    groupRootId: string,
    baseX: number,
    startY: number,
    side: 1 | -1
): { startY: number; nextStartY: number } {
    const rootTree = buildSubtreeHierarchy(nodes, groupRootId);
    let cursorY = startY;

    const assign = (curr: SubtreeLayoutNode, depth: number): void => {
        if (curr.children.length === 0) {
            curr.node.y = cursorY;
            cursorY += LEAF_GAP;
        } else {
            curr.children.forEach(c => assign(c, depth + 1));
            const firstY = curr.children[0].node.y ?? cursorY;
            const lastY = curr.children[curr.children.length - 1].node.y ?? cursorY;
            curr.node.y = Math.round(((firstY + lastY) / 2) * 100) / 100;
        }
        curr.node.x = Math.round((baseX + side * depth * LEVEL_DX) * 100) / 100;
    };

    assign(rootTree, 0);
    return { startY, nextStartY: cursorY + 56 };
}

/* ==================== 3. 跨图迁移/复制核心引擎 ==================== */

/**
 * 将指定的一个或多个分组从源思维导图迁移/复制到目标思维导图
 */
export function migrateMindmapGroups(
    sourceMarkdown: string,
    targetMarkdown: string,
    selectedGroupIds: string[],
    mode: MigrateMode = 'copy'
): MigrateResult {
    if (selectedGroupIds.length === 0) {
        throw new Error('未选择任何待迁移的分组');
    }

    const sourceAnalysis = parseAndAnalyzeRichMindmap(sourceMarkdown);
    const targetAnalysis = parseAndAnalyzeRichMindmap(targetMarkdown);

    if (!targetAnalysis.rootNode) {
        throw new Error('目标思维导图缺少主根节点，无法追加分支');
    }

    const targetRoot = targetAnalysis.rootNode;
    const targetDoc = targetAnalysis.doc;
    const targetRawNodes: MarkmindNode[] = targetDoc.mindData[0];

    // 获取目标导图的所有次级分支与布局基准
    const targetChildrenMap = new Map<string, MarkmindNode[]>();
    for (const n of targetRawNodes) {
        if (n.pid) {
            const arr = targetChildrenMap.get(n.pid) || [];
            arr.push(n);
            targetChildrenMap.set(n.pid, arr);
        }
    }

    const targetExistingSecondaries = targetChildrenMap.get(targetRoot.id) || [];
    const rootX = targetRoot.x ?? 0;
    const rootY = targetRoot.y ?? 0;

    // 确定追加方向与纵向排布起点
    let side: 1 | -1 = 1;
    let baseX: number;
    let startY: number;

    if (targetExistingSecondaries.length > 0) {
        const last = targetExistingSecondaries[targetExistingSecondaries.length - 1];
        side = (last.x !== undefined && last.x < rootX) ? -1 : 1;
        baseX = last.x ?? (rootX + side * 300);

        let maxBottom = rootY;
        for (const child of targetExistingSecondaries) {
            const childSide: 1 | -1 = (child.x !== undefined && child.x < rootX) ? -1 : 1;
            if (childSide !== side) continue;
            maxBottom = Math.max(maxBottom, getSubtreeMaxBottom(child, targetChildrenMap));
        }
        startY = maxBottom + 56;
    } else {
        baseX = rootX + 300;
        startY = rootY - 40;
    }

    // 配色池获取：继承目标导图的调色板循环
    const existingColors = Array.from(new Set(
        targetExistingSecondaries.map(c => (c.stroke ?? '').trim()).filter(s => s.length > 0)
    ));
    const palette = existingColors.length > 0 ? existingColors : DEFAULT_PALETTE;

    // 过滤出选中的分组
    const targetGroups = sourceAnalysis.groups.filter(g => selectedGroupIds.includes(g.id));
    if (targetGroups.length === 0) {
        throw new Error('在源导图中未找到匹配的分组');
    }

    let totalMigratedNodes = 0;
    let currentYCursor = startY;

    // 记录在 move 模式下需要从源导图删除的节点 ID
    const removedSourceNodeIds = new Set<string>();

    targetGroups.forEach((group, groupIdx) => {
        // 1. 全局 ID 防冲突重映射字典
        const idMapping = new Map<string, string>();
        for (const node of group.nodes) {
            idMapping.set(node.id, genMarkmindId());
            if (mode === 'move') {
                removedSourceNodeIds.add(node.id);
            }
        }

        const branchColor = palette[(targetExistingSecondaries.length + groupIdx) % palette.length];

        // 2. 深度克隆节点并绑定到目标根节点
        const clonedNodes: MarkmindNode[] = group.nodes.map(originalNode => {
            const isGroupRoot = (originalNode.id === group.rootNodeId);
            const newId = idMapping.get(originalNode.id)!;
            const newPid = isGroupRoot
                ? targetRoot.id
                : (originalNode.pid ? (idMapping.get(originalNode.pid) || targetRoot.id) : targetRoot.id);

            const clone: MarkmindNode = {
                ...JSON.parse(JSON.stringify(originalNode)),
                id: newId,
                pid: newPid,
                stroke: branchColor, // 统一子树对比色
            };

            // 如果是分支顶层，设置显著字号
            if (isGroupRoot) {
                clone.style = {
                    ...(clone.style || {}),
                    'font-size': '20',
                    'font-weight': 'bold',
                };
            }

            return clone;
        });

        // 3. 对克隆子树重新计算排版坐标
        const layoutRes = layoutRelocatedSubtree(
            clonedNodes,
            idMapping.get(group.rootNodeId)!,
            baseX,
            currentYCursor,
            side
        );
        currentYCursor = layoutRes.nextStartY;

        // 4. 追加节点到目标思维导图
        for (const newNode of clonedNodes) {
            targetRawNodes.push(newNode);
            totalMigratedNodes++;
        }

        // 5. 迁移元数据关联对象 (induceData / wireFrameData / relateLinkData)
        if (!targetDoc.induceData) targetDoc.induceData = [];
        if (!targetDoc.wireFrameData) targetDoc.wireFrameData = [];
        if (!targetDoc.relateLinkData) targetDoc.relateLinkData = [];

        for (const ind of group.relatedInduce) {
            const nodeId = typeof ind.nodeId === 'string' ? ind.nodeId : undefined;
            if (nodeId && idMapping.has(nodeId)) {
                targetDoc.induceData.push({
                    ...ind,
                    id: genMarkmindId(),
                    nodeId: idMapping.get(nodeId)
                });
            }
        }

        for (const wf of group.relatedWireFrames) {
            const nodeId = typeof wf.nodeId === 'string' ? wf.nodeId : undefined;
            if (nodeId && idMapping.has(nodeId)) {
                targetDoc.wireFrameData.push({
                    ...wf,
                    id: genMarkmindId(),
                    nodeId: idMapping.get(nodeId)
                });
            }
        }

        for (const rl of group.relatedRelateLinks) {
            const from = typeof rl.from === 'string' ? rl.from : undefined;
            const to = typeof rl.to === 'string' ? rl.to : undefined;
            if (from && to && idMapping.has(from) && idMapping.has(to)) {
                targetDoc.relateLinkData.push({
                    ...rl,
                    id: genMarkmindId(),
                    from: idMapping.get(from),
                    to: idMapping.get(to)
                });
            }
        }
    });

    // 序列化生成新的目标导图文本（使用函数式替换，防止 $ 字符被作为替换模板）
    const newTargetJson = JSON.stringify(targetDoc);
    const targetUpdatedContent = targetMarkdown.replace(
        targetAnalysis.rawJsonText,
        () => newTargetJson
    );

    let sourceUpdatedContent: string | undefined = undefined;

    // 如果是 move 剪切模式，从源导图中清理掉被迁移的节点及其元数据
    if (mode === 'move') {
        const sourceDoc = sourceAnalysis.doc;
        sourceDoc.mindData[0] = sourceDoc.mindData[0].filter(n => !removedSourceNodeIds.has(n.id));

        if (sourceDoc.induceData) {
            sourceDoc.induceData = sourceDoc.induceData.filter(i => {
                const nodeId = typeof i.nodeId === 'string' ? i.nodeId : undefined;
                return !nodeId || !removedSourceNodeIds.has(nodeId);
            });
        }
        if (sourceDoc.wireFrameData) {
            sourceDoc.wireFrameData = sourceDoc.wireFrameData.filter(w => {
                const nodeId = typeof w.nodeId === 'string' ? w.nodeId : undefined;
                return !nodeId || !removedSourceNodeIds.has(nodeId);
            });
        }
        if (sourceDoc.relateLinkData) {
            sourceDoc.relateLinkData = sourceDoc.relateLinkData.filter(r => {
                const from = typeof r.from === 'string' ? r.from : undefined;
                const to = typeof r.to === 'string' ? r.to : undefined;
                return (!from || !removedSourceNodeIds.has(from)) && (!to || !removedSourceNodeIds.has(to));
            });
        }

        const newSourceJson = JSON.stringify(sourceDoc);
        sourceUpdatedContent = sourceMarkdown.replace(
            sourceAnalysis.rawJsonText,
            () => newSourceJson
        );
    }

    return {
        migratedGroupCount: targetGroups.length,
        migratedNodeCount: totalMigratedNodes,
        targetUpdatedContent,
        sourceUpdatedContent
    };
}
