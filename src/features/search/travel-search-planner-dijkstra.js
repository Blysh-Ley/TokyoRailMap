import { ensurePlannerStaticData, plannerState, getGroupStops, filterNearbyStops, normalizeText, getTransferPenaltyMs, loadTripsForLineAndDay } from './travel-search-planner-raptor.js';
import { collectRefChainTrips } from '../route-map/route-map.js';
import { getCachedStationGroups } from '../../lib/fetch.js';


class MaxHeap {
    constructor() { this.data = []; }
    push(item) {
        this.data.push(item);
        this.up(this.data.length - 1);
    }
    pop() {
        if (!this.data.length) return null;
        const top = this.data[0];
        const bottom = this.data.pop();
        if (this.data.length) {
            this.data[0] = bottom;
            this.down(0);
        }
        return top;
    }
    up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.data[p].remainingMs >= this.data[i].remainingMs) break;
            const tmp = this.data[p];
            this.data[p] = this.data[i];
            this.data[i] = tmp;
            i = p;
        }
    }
    down(i) {
        const len = this.data.length;
        while (true) {
            let left = (i << 1) + 1;
            let right = left + 1;
            let max = i;
            if (left < len && this.data[left].remainingMs > this.data[max].remainingMs) max = left;
            if (right < len && this.data[right].remainingMs > this.data[max].remainingMs) max = right;
            if (max === i) break;
            const tmp = this.data[i];
            this.data[i] = this.data[max];
            this.data[max] = tmp;
            i = max;
        }
    }
    isEmpty() { return this.data.length === 0; }
}

const getStationGroupsIndex = (() => {
    let cache = null;
    return async () => {
        if (cache) return cache;
        try {
            const groups = await getCachedStationGroups();
            cache = new Map();
            for (const g of (Array.isArray(groups) ? groups : [])) {
                if (!Array.isArray(g)) continue;
                const ids = [];
                for (const chunk of g) {
                    if (!Array.isArray(chunk)) continue;
                    for (const sid of chunk) {
                        const id = String(sid || '').trim();
                        if (id && !ids.includes(id)) ids.push(id);
                    }
                }
                if (ids.length) ids.forEach(id => cache.set(id, ids));
            }
            return cache;
        } catch {
            return new Map();
        }
    };
})();

export const getReachableStopsWithinMinutes = async ({ originStationId, minutes }) => {
    await ensurePlannerStaticData();
    const originId = normalizeText(originStationId);
    
    const durationBudgetMin = Number(minutes) + 5; 
    
    // ==========================================
    // 配置项与调试开关
    // ==========================================
    const CLAMP_CONFIG = {
        ENABLE_CLAMP: true, // 开启或关闭阈值截断，方便比对原始剩余时间与截断表现
        ENABLE_ORIGIN_WALK_PENALTY: true,
        MAX_RADIUS_MS: 1200000,
        MIN_RADIUS_MS: 300000
    };

    if (!originId || !Number.isFinite(durationBudgetMin) || durationBudgetMin < 0) {
        return { reachableStops: [], remainingMsByStop: new Map() };
    }

    // 初始化起点与邻近圈
    let sourceStops = getGroupStops(originId);
    sourceStops.add(originId);
    sourceStops = filterNearbyStops(originId, sourceStops, 800);

    if (!sourceStops.size) return { reachableStops: [], remainingMsByStop: new Map() };

    // ============================================================================
    // 阶段 1: 动态全量构建并排序 Connection 数组 (严格遵循 CSA 前提)
    // ============================================================================
    const connections = [];
    const processedTrips = new Set();
    const allLineIds = new Set();

    // 从全局状态拉取当前载入的所有有效线路 (避免漏扫)
    if (plannerState && plannerState.routeIdsByStop) {
        for (const lines of plannerState.routeIdsByStop.values()) {
            if (lines) lines.forEach(l => allLineIds.add(l));
        }
    }

    for (const lineId of allLineIds) {
        const trips = await loadTripsForLineAndDay({ lineId, serviceDay: 'Weekday' });
        for (const trip of (trips || [])) {
            const tripId = normalizeText(trip?.tripId) || normalizeText(trip?.rawTripId) || normalizeText(trip?.id) || normalizeText(trip?.t);
            if (!tripId || processedTrips.has(tripId)) continue;
            
            // 核心改造：顺着 nt 链提前组装直通运转的合并班次，全部统一在最初的 chainId 下
            const chainRaw = await collectRefChainTrips(trip, 'nt');
            const chainList = Array.isArray(chainRaw) ? chainRaw.slice() : [];
            const hasParsedStops = chainList.some((part) => Array.isArray(part?.stops) && part.stops.length >= 2);
            if (!hasParsedStops) chainList.push(trip);
            
            const chainId = normalizeText(trip?.tripId) || normalizeText(trip?.rawTripId) || normalizeText(chainList[0]?.tripId) || normalizeText(chainList[0]?.rawTripId) || normalizeText(chainList[0]?.id) || normalizeText(chainList[0]?.t);
            
            for (const chainPart of chainList) {
                const pTripId = normalizeText(chainPart?.tripId) || normalizeText(chainPart?.rawTripId) || normalizeText(chainPart?.id) || normalizeText(chainPart?.t);
                processedTrips.add(pTripId); 
                
                const stops = Array.isArray(chainPart.stops) ? chainPart.stops : [];
                for (let i = 0; i < stops.length - 1; i++) {
                    const s1 = stops[i];
                    const s2 = stops[i + 1];
                    const u = normalizeText(s1?.stopId);
                    const v = normalizeText(s2?.stopId);
                    
                    if (!u || !v || !Number.isFinite(s1.depMin) || !Number.isFinite(s2.arrMin)) continue;
                    if (s2.arrMin - s1.depMin < 0) continue; // 过滤数据异常
                    
                    connections.push({
                        chainId,      // 重点：跨站点的直通全部共用 chainId
                        fromStopId: u,
                        toStopId: v,
                        depMin: s1.depMin,
                        arrMin: s2.arrMin
                    });
                }
            }
        }
    }

    // 算法基石：严格按出发时间升序排序 O(N log N)
    connections.sort((a, b) => a.depMin - b.depMin);


    // ============================================================================
    // 阶段 2: 核心 CSA 线性扫描 O(N)
    // ============================================================================
    
// 状态记录表: stopId -> Map<chainId, state>
    const stopStates = new Map();
    const getStates = (stopId) => {
        if (!stopStates.has(stopId)) stopStates.set(stopId, new Map());
        return stopStates.get(stopId);
    };

    const transferCache = new Map();
    const getTransfersToMemo = (targetId) => {
        if (transferCache.has(targetId)) return transferCache.get(targetId);
        let walkStops = getGroupStops(targetId);
        walkStops.add(targetId);
        walkStops = filterNearbyStops(targetId, walkStops, 800);
        
        const results = [];
        for (const u of walkStops) {
            let penaltyMs =  getTransferPenaltyMs(u, targetId);
            results.push({ stopId: u, penaltyMin: penaltyMs / 60000 });
        }
        transferCache.set(targetId, results);
        return results;
    };

    // 获取某个站点对应的组的唯一 Key，用于防折返判断
    const sg = await getStationGroupsIndex(); // 确保你在这里能拿到分组数据
    const getGroupKey = (sid) => {
        const group = sg.get(sid) || [sid];
        return [...group].sort().join('|');
    };

    // 【配置：乘客理性约束参数】
    const MAX_WAIT_MINUTES = 30; // 换乘最多愿意等多久？超过则认为是无效班次/幽灵
    const MAX_TRANSFER_COUNT = 3; // 一趟旅程最多接受几次换乘？

    for (const conn of connections) {
        const { chainId, fromStopId, toStopId, depMin, arrMin } = conn;
        const rideTimeMin = arrMin - depMin;
        
        let bestTransferRemain = -1;
        let bestPath = [];
        let nextTransferCount = 0;
        let nextVisitedGroups = new Set();

        const toGroupKey = getGroupKey(toStopId);
        const fromGroupKey = getGroupKey(fromStopId);

        // 规则一：起点上车
        if (sourceStops.has(fromStopId)) {
            let walkToSourceMin = 0;
            if (CLAMP_CONFIG.ENABLE_ORIGIN_WALK_PENALTY && fromStopId !== originId) {
                const walkMs =  getTransferPenaltyMs(originId, fromStopId);
                walkToSourceMin = walkMs / 60000;
            }

            const remainIfStartHere = durationBudgetMin - walkToSourceMin - rideTimeMin;
            
            if (remainIfStartHere > bestTransferRemain && (durationBudgetMin - walkToSourceMin >= 0)) {
                bestTransferRemain = remainIfStartHere;
                nextTransferCount = 0; // 起点上车，换乘数为 0
                nextVisitedGroups = new Set([getGroupKey(originId), fromGroupKey, toGroupKey]); 
                bestPath = [{ 
                    action: 'START', 
                    stop: fromStopId, 
                    walkPenalty: walkToSourceMin,
                    budgetLeft: durationBudgetMin - walkToSourceMin
                }];
            }
        }

        // 规则二 & 五：换乘回溯
        const transfers = getTransfersToMemo(fromStopId);
        
        for (const { stopId: walkFrom, penaltyMin } of transfers) {
            const prevStates = getStates(walkFrom);
            
            for (const [prevChainId, state] of prevStates.entries()) {
                const isSameChain = (prevChainId === chainId) && (walkFrom === fromStopId);
                const actualPenalty = isSameChain ? 0 : penaltyMin;
                
                // 1. 时空合法性校验
                if (state.arrMin + actualPenalty <= depMin) {
                    const waitMin = depMin - (state.arrMin + actualPenalty);
                    
                    // ==========================================
                    // 核心拦截器：剔除幽灵与折返现象
                    // ==========================================
                    if (!isSameChain) {
                        // 拦截 1: 换乘等待时间过长 (消除 "发呆后往回坐" 的幽灵)
                        if (waitMin > MAX_WAIT_MINUTES) continue;

                        // 拦截 2: 换乘次数超标 (消除无限绕路的可能)
                        if ((state.transferCount || 0) >= MAX_TRANSFER_COUNT) continue;

                        // 拦截 3: 拓扑防折返校验 (消除绕圈圈的路线)
                        // 如果将要到达的站点组，在之前的历史里已经去过了，直接阻断
                        if (state.visitedGroups && state.visitedGroups.has(toGroupKey)) {
                            // 允许一种例外：当前上车点就在这个目标组里（站内移动不算折返）
                            if (toGroupKey !== fromGroupKey) {
                                continue; 
                            }
                        }
                    } else {
                        // 即使是同一班车(一直坐着)，中途停靠时间也不该离谱
                        if (waitMin > 30) continue; 
                    }
                    // ==========================================

                    const newRemain = state.remainMin - (conn.arrMin - state.arrMin);
                    
                    if (newRemain > bestTransferRemain) {
                        bestTransferRemain = newRemain;
                        // 更新换乘次数
                        nextTransferCount = isSameChain ? (state.transferCount || 0) : (state.transferCount || 0) + 1;
                        
                        // 继承并更新已访问的拓扑节点
                        nextVisitedGroups = new Set(state.visitedGroups || []);
                        nextVisitedGroups.add(toGroupKey);

                        bestPath = [
                            ...(state.path || []),
                            { 
                                action: isSameChain ? 'STAY' : 'WALK_TRANSFER', 
                                from: walkFrom, 
                                to: fromStopId, 
                                penaltyMin: actualPenalty,
                                waitMin: waitMin 
                            }
                        ];
                    }
                }
            }
        }

        // 规则四：基于班次的去重与更新
        if (bestTransferRemain >= 0) {
            const toStates = getStates(toStopId);
            const existing = toStates.get(chainId);
            
            // 只有当剩余时间更有优势时，才写入（或者如果没写过）
            if (!existing || bestTransferRemain > existing.remainMin) {
                toStates.set(chainId, { 
                    arrMin: conn.arrMin, 
                    remainMin: bestTransferRemain,
                    transferCount: nextTransferCount,     // 记录换乘次数
                    visitedGroups: nextVisitedGroups,     // 记录已访问过的站点组
                    path: [
                        ...bestPath,
                        { action: 'RIDE', chainId, from: fromStopId, to: toStopId, depMin, arrMin }
                    ] 
                });
            }
        }
    }

    // ============================================================================
    // 阶段 3: 同组并集合并、分钟归一化与强制截断输出
    // ============================================================================
    
    // 1. 定义自适应参数
    const BUCKET_COUNT = 15;
    const bucketSizeMin = Math.max(1, durationBudgetMin / BUCKET_COUNT); 
    const bucketSizeMs = bucketSizeMin * 60000;

    // 2. 分桶：将原始时间映射到档位，并进行同站组班次合并
    const mergedGroups = new Map();

    for (const [stopId, chainMap] of stopStates.entries()) {
        const group = sg.get(stopId) || [stopId];
        const groupKey = [...group].sort().join('|');

        if (!mergedGroups.has(groupKey)) {
            mergedGroups.set(groupKey, new Map());
        }
        const combinedMsMap = mergedGroups.get(groupKey);

        for (const [chainId, state] of chainMap.entries()) {
            const rawRemainMs = state.remainMin * 60000;
            
            // 计算档位基准线 (向下取整)
            const bucketedMs = Math.floor(rawRemainMs / bucketSizeMs) * bucketSizeMs;
            
            if (!combinedMsMap.has(bucketedMs)) combinedMsMap.set(bucketedMs, new Set());
            combinedMsMap.get(bucketedMs).add(chainId);
        }
    }

    // 3. 计算累加计数并生成最终输出
    const finalMap = new Map();
    
    for (const [groupKey, combinedMsMap] of mergedGroups.entries()) {
        const sortedEntries = Array.from(combinedMsMap.entries()).sort((a, b) => b[0] - a[0]);
        
        let cumulativeCount = 0;
        const seenChainsInGroup = new Set();
        const processedCircles = [];

        // --- DEBUG 触发器：统计一下这个站组总共有多少个疑似去重前的班次 ---
        let totalRawChains = 0;
        for (const [_, chainSet] of sortedEntries) totalRawChains += chainSet.size;
        
        // 阈值设定：如果一个站台单向超过 80 个班次（假设是异常偏高的阈值），开启审查
        // 你可以根据你的实际数据规模调低或调高这个值，比如改成 50
        const isSuspicious = totalRawChains > 80; 

        /*
        if (isSuspicious) {
            console.log(`\n🚨 [异常高频站组审查] GroupKey: ${groupKey}`);
            console.log(`包含物理站台数: ${groupKey.split('|').length} 个, 原始记录班次总和: ${totalRawChains} 个`);
        }*/

        for (const [remainMs, chainSet] of sortedEntries) {
            let newlyAddedCount = 0;
            const addedChainIdsThisBucket = [];
            
            for (const chainId of chainSet) {
                if (!seenChainsInGroup.has(chainId)) {
                    seenChainsInGroup.add(chainId);
                    newlyAddedCount++;
                    if (isSuspicious) addedChainIdsThisBucket.push(chainId);
                }
            }
            /*
            if (isSuspicious) {
                const minLabel = (remainMs / 60000).toFixed(1);
                console.log(`  ⏳ 剩余时间档位: ${minLabel} 分钟`);
                console.log(`     - 当前档位原始班次数: ${chainSet.size}`);
                console.log(`     - 跨档位去重后【实际新增】: ${newlyAddedCount}`);
                
                // 打印出具体是哪些 chainId 被加进去了，抽查前 5 个
                if (newlyAddedCount > 0) {
                    console.log(`     - 新增 ChainID 示例:`, addedChainIdsThisBucket.slice(0, 5));
                }
            }*/

            if (newlyAddedCount > 0) {
                cumulativeCount += newlyAddedCount;
                processedCircles.push({
                    remainMs,
                    count: cumulativeCount,
                    tripId: Array.from(chainSet)[0]
                });
            }
        }
/*
        if (isSuspicious) {
            console.log(`  🎯 该站组最终累计班次数 (count): ${cumulativeCount}`);
            console.log(`====================================================\n`);
        }
*/
        const stopIds = groupKey.split('|');
        for (const sid of stopIds) {
            finalMap.set(sid, processedCircles);
        }
    }

    return {
        reachableStops: Array.from(finalMap.keys()),
        remainingMsByStop: finalMap,
    };
    /*
        // ============================================================================
    // ✨✨✨ 插入调试代码：专门打印羽田机场的全链条溯源 ✨✨✨
    // ============================================================================
    const TARGET_DEBUG_STOP = 'Keikyu.Airport.HanedaAirportTerminal1and2';
    // 如果ID名称有变化，可以用模糊匹配，比如: 
    // const TARGET_DEBUG_STOP = Array.from(stopStates.keys()).find(id => id.includes('Haneda'));

    if (stopStates.has(TARGET_DEBUG_STOP)) {
        console.log(`\n========== 🚨 发现羽田机场到达记录 [${TARGET_DEBUG_STOP}] 🚨 ==========`);
        const hanedaStates = stopStates.get(TARGET_DEBUG_STOP);
        
        for (const [chainId, state] of hanedaStates.entries()) {
            console.log(`\n🎯 最终到达班次 ChainID: ${chainId}`);
            console.log(`⏳ 最终到达时间(arrMin): ${state.arrMin} | 算法计算出的剩余预算(remainMin): ${state.remainMin}`);
            console.log(`🛤️ 全链路溯源过程:`);
            
            state.path.forEach((step, idx) => {
                if (step.action === 'START') {
                    console.log(`  [${idx}] 🟢 起点进入: 站在 [${step.stop}], 步行扣减 ${step.walkPenalty}min, 当前预算剩 ${step.budgetLeft}min`);
                } else if (step.action === 'WALK_TRANSFER') {
                    console.log(`  [${idx}] 🚶 换乘步行: 从 [${step.from}] 走到 [${step.to}], 耗时 ${step.penaltyMin}min, 原地等车 ${step.waitMin}min`);
                } else if (step.action === 'STAY') {
                    console.log(`  [${idx}] 💺 直通免下车: 继续留在 [${step.from}], 等待发车 ${step.waitMin}min`);
                } else if (step.action === 'RIDE') {
                    console.log(`  [${idx}] 🚄 乘车: 乘坐 [${step.chainId}], 从 [${step.from}] (${step.depMin}) -> [${step.to}] (${step.arrMin}), 车程 ${step.arrMin - step.depMin}min`);
                }
            });
            console.log(`---------------------------------------------------------`);
        }
    } else {
        console.log(`\n========== ✅ 羽田机场在此次扫描中未被触达 ==========`);
    }

    */
};
