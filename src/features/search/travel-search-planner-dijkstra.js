import { ensurePlannerStaticData, plannerState, getGroupStops, filterNearbyStops, normalizeText, getTransferPenaltyMs, loadTripsForLineAndDay } from './travel-search-planner-raptor.js';
import { collectRefChainTrips } from '../route-map/route-map.js';

const MIN_TRANSFER_MS = 5 * 60 * 1000;

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
            const groups = await fetch('./data/station-groups.json').then(r => r.json());
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
    
    // 状态记录表: stopId -> Map<chainId, { arrMin, remainMin }>
    // 这里落实规则三：不随时间丢失此前较差抵达时刻的其他班次记录
    const stopStates = new Map();
    const getStates = (stopId) => {
        if (!stopStates.has(stopId)) stopStates.set(stopId, new Map());
        return stopStates.get(stopId);
    };

    // 工具函数：缓存步行换乘矩阵结果，极大降低内循环消耗 (落实规则五)
    const transferCache = new Map();
    const getTransfersToMemo = (targetId) => {
        if (transferCache.has(targetId)) return transferCache.get(targetId);
        let walkStops = getGroupStops(targetId);
        walkStops.add(targetId);
        walkStops = filterNearbyStops(targetId, walkStops, 800);
        
        const results = [];
        for (const u of walkStops) {
            let penaltyMs;
            if (u === targetId) {
                // 如果是同一个站台/站点，赋予基础同站换乘时间 (比如3分钟)
                penaltyMs = MIN_TRANSFER_MS; 
            } else {
                // 如果是跨站台/跨站步行，取 步行计算时间 和 保底时间 的最大值
                const walkMs = getTransferPenaltyMs(u, targetId) ;
                penaltyMs = Math.max(MIN_TRANSFER_MS, walkMs);
            }
            results.push({ stopId: u, penaltyMin: penaltyMs / 60000 });
        }
        transferCache.set(targetId, results);
        return results;
    };

    for (const conn of connections) {
        const { chainId, fromStopId, toStopId, depMin, arrMin } = conn;
        const rideTimeMin = arrMin - depMin;
        let bestPath = [];
        
        let bestTransferRemain = -1;

        // 规则一：起点上车零等待 (仅扣减本身乘车时间)
        if (sourceStops.has(fromStopId)) {
            let walkToSourceMin = 0;
            
            // 如果当前上车的站不是用户选择的【绝对起点】，并且开启了严格校验
            if (CLAMP_CONFIG.ENABLE_ORIGIN_WALK_PENALTY && fromStopId !== originId) {
                // 获取从绝对起点走到这个邻近起点的耗时
                const walkMs = Math.max(MIN_TRANSFER_MS,  getTransferPenaltyMs(originId, fromStopId));
                walkToSourceMin = walkMs / 60000;
            }

            // 核心扣减逻辑：总预算 - 走过去的步时 - 乘车时间
            const remainIfStartHere = durationBudgetMin - walkToSourceMin - rideTimeMin;
            
            // 确保就算在起点附近，如果走过去就已经超时了，也不能算作有效上车
            if (remainIfStartHere > bestTransferRemain && (durationBudgetMin - walkToSourceMin >= 0)) {
                bestTransferRemain = remainIfStartHere;
                bestPath = [{ 
                action: 'START', 
                stop: fromStopId, 
                walkPenalty: walkToSourceMin,
                budgetLeft: durationBudgetMin - walkToSourceMin
            }];
            }
        }

        // 规则二 & 五：通过步行矩阵回溯上车站的可能到达态
        const transfers = getTransfersToMemo(fromStopId);
        
        for (const { stopId: walkFrom, penaltyMin } of transfers) {
            const prevStates = getStates(walkFrom);
            
            for (const [prevChainId, state] of prevStates.entries()) {
                // 重点逻辑：如果是同直通班次 (nt链) 的延续，换乘惩罚强制归零
                const isSameChain = (prevChainId === chainId) && (walkFrom === fromStopId);
                const actualPenalty = isSameChain ? 0 : penaltyMin;
                
                // 时空合法性校验
                if (state.arrMin + actualPenalty <= depMin) {
                    // 新剩余时间 = 历史到达时的剩余时间 - (此次到站绝对时间 - 历史到站绝对时间)
                    // 后半段括号完美囊括了：换乘步时 + 等车发呆时间 + 本次乘坐时间
                    const newRemain = state.remainMin - (conn.arrMin - state.arrMin);
                    if (newRemain > bestTransferRemain) {
                        bestTransferRemain = newRemain;
                        bestPath = [
                        ...(state.path || []), // 继承上一站的完整路径
                        { 
                            action: isSameChain ? 'STAY' : 'WALK_TRANSFER', 
                            from: walkFrom, 
                            to: fromStopId, 
                            penaltyMin: actualPenalty,
                            waitMin: depMin - (state.arrMin + actualPenalty) // 等车发呆时间
                        }
                    ];
                    }
                }
            }
        }

        // 规则四：基于班次 (chainId) 的去重与更新
        if (bestTransferRemain >= 0) {
            const toStates = getStates(toStopId);
            const existing = toStates.get(chainId);
            if (!existing || bestTransferRemain > existing.remainMin) {
                toStates.set(chainId, { 
                    arrMin: conn.arrMin, 
                    remainMin: bestTransferRemain,
                    path: [
                        ...bestPath,
                        { action: 'RIDE', chainId, from: fromStopId, to: toStopId, depMin, arrMin }
                    ] });
            }
        }
    }

    // ============================================================================
    // 阶段 3: 同组并集合并、分钟归一化与强制截断输出
    // ============================================================================
    const sg = await getStationGroupsIndex();
    
    // 临时合并表: stopId -> Map<remainMs, Set<chainId>>
    const remainingMsByStopInternal = new Map();
    
    for (const [stopId, chainMap] of stopStates.entries()) {
        const msMap = new Map();
        for (const [chainId, state] of chainMap.entries()) {
            
            // 需求：将同分钟的零碎时间算作同一分钟（抹零计算）
            let remainMs = Math.floor(state.remainMin) * 60000;
            
            // 调试用强制截断
            if (CLAMP_CONFIG.ENABLE_CLAMP) {
                remainMs = Math.min(CLAMP_CONFIG.MAX_RADIUS_MS, Math.max(CLAMP_CONFIG.MIN_RADIUS_MS, remainMs));
            }
            
            if (!msMap.has(remainMs)) msMap.set(remainMs, new Set());
            msMap.get(remainMs).add(chainId); // 利用 Set 实现自动按班次去重
        }
        if (msMap.size > 0) remainingMsByStopInternal.set(stopId, msMap);
    }

    // 聚合物理同站组的最终输出
    const mergedGroups = new Map();
    for (const [stopId, msMap] of remainingMsByStopInternal.entries()) {
        const group = sg.get(stopId) || [stopId];
        const groupKey = [...group].sort().join('|');

        if (!mergedGroups.has(groupKey)) {
            mergedGroups.set(groupKey, new Map());
        }
        const combinedMsMap = mergedGroups.get(groupKey);

        for (const [remainMs, chainSet] of msMap.entries()) {
            if (!combinedMsMap.has(remainMs)) combinedMsMap.set(remainMs, new Set());
            const targetSet = combinedMsMap.get(remainMs);
            // 这里取并集，同一站组不同入口进来的同一班车会自动由于 Set 机制不再增加 count
            for (const cid of chainSet) targetSet.add(cid); 
        }
    }

    const finalMap = new Map();
    for (const stopId of remainingMsByStopInternal.keys()) {
        const group = sg.get(stopId) || [stopId];
        const groupKey = [...group].sort().join('|');
        const combinedMsMap = mergedGroups.get(groupKey);

        finalMap.set(stopId, Array.from(combinedMsMap.entries()).map(([remainMs, chainSet]) => ({
            remainMs,
            count: chainSet.size,
            tripId: Array.from(chainSet)[0] // 需求约定：保留第一个作为特征 id 即可
        })));
    }

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
    return {
        reachableStops: Array.from(finalMap.keys()),
        remainingMsByStop: finalMap,
    };
};