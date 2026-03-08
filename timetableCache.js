/**
 * Timetable cache (virtual memory)
 * - Given line ids, loads ./data/train-timetables/{id}.json (after replacing '.' -> '-')
 * - Stores parsed JSON in memory for later reads
 * - Uses approximate byte size (JSON string length) with LRU eviction
 */

import { cachedFetch } from './fetch.js';

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

const normalizeId = (v) => String(v ?? '').trim();

const toFileStem = (lineId) => {
    // File naming convention in ./data/train-timetables is lowercase.
    // Special case: JR-East / JR-Central are stored as jreast / jrcentral (no hyphen).
    // Also tolerate JR.east / JR.central variants.
    const raw = normalizeId(lineId);
    if (!raw) return '';

    const normalized = raw
        .replace(/^JR[.-]East\b/i, 'JREast')
        .replace(/^JR[.-]Central\b/i, 'JRCentral')
        .replace(/^JR-East\b/i, 'JREast')
        .replace(/^JR-Central\b/i, 'JRCentral')
        .replace(/^Seibu.S-Yurakucho\b/i, 'Seibu.SYurakucho')
        .replace(/^Seibu.S-Fukutoshin\b/i, 'Seibu.SFukutoshin'); // 特例：西武有乐町线

    return normalized.replace(/\./g, '-').toLowerCase();
};

const estimateBytes = (value) => {
    try {
        // Approximate UTF-16 bytes; good enough for eviction
        return JSON.stringify(value).length * 2;
    } catch {
        return 0;
    }
};

const toCacheKey = (lineId) => {
    const stem = toFileStem(lineId);
    return stem ? stem : normalizeId(lineId);
};

const deriveBaseLineIdFromPtNt = (value) => {
    const s = normalizeId(value);
    if (!s) return '';
    const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    // 前两段用 '-' 连接（例：Tokyu.Toyoko.xxx -> Tokyu-Toyoko）
    return `${parts[0]}-${parts[1]}`;
};

const collectPtNtRefs = (data, { maxNodes = 20000 } = {}) => {
    // 深度遍历对象/数组，抽取任意层级的 pt/nt 字段；用节点上限避免超大数据卡死。
    const refs = new Set();
    const seen = new Set();
    const stack = [data];
    let visited = 0;

    const addRef = (v) => {
        if (typeof v === 'string' && v.trim()) refs.add(v.trim());
    };

    const addRefsFromValue = (v) => {
        if (typeof v === 'string') {
            addRef(v);
            return;
        }
        if (Array.isArray(v)) {
            for (const item of v) addRef(item);
        }
    };

    while (stack.length && visited < maxNodes) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;

        // 防循环引用（理论上 JSON 不会有，但保险）
        if (seen.has(node)) continue;
        seen.add(node);
        visited += 1;

        if (Array.isArray(node)) {
            for (let i = node.length - 1; i >= 0; i -= 1) stack.push(node[i]);
            continue;
        }

        // plain object
        const pt = node.pt;
        const nt = node.nt;
        addRefsFromValue(pt);
        addRefsFromValue(nt);

        for (const v of Object.values(node)) {
            if (v && typeof v === 'object') stack.push(v);
        }
    }

    return Array.from(refs);
};

class LruTimetableCache {
    constructor({ maxBytes = 50 * 1024 * 1024, logFetch = false, logDiscover = false } = {}) {
        this.maxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 50 * 1024 * 1024;
        this.logFetch = logFetch === true;
        this.logDiscover = logDiscover === true;
        this.bytes = 0;
        this.map = new Map(); // key(lineId) -> { data, bytes, at }
        this.pending = new Map(); // key(lineId) -> Promise<data|null>
        // key -> true: this line has already been recursively scanned for pt/nt and expanded.
        // This prevents repeated station selections from re-running recursion for the same line.
        this.expanded = new Set();
    }

    _touch(key) {
        const entry = this.map.get(key);
        if (!entry) return;
        this.map.delete(key);
        entry.at = nowMs();
        this.map.set(key, entry);
    }

    _evictUntilFree(requiredBytes) {
        const need = Number.isFinite(requiredBytes) && requiredBytes > 0 ? requiredBytes : 0;
        // LRU: map insertion order is LRU->MRU
        while (this.map.size && this.bytes + need > this.maxBytes) {
            const oldestKey = this.map.keys().next().value;
            const entry = this.map.get(oldestKey);
            this.map.delete(oldestKey);
            this.bytes -= entry?.bytes || 0;
        }

        // If still cannot fit even after evicting everything
        if (this.bytes + need > this.maxBytes) {
            this.clear();
        }
    }

    clear() {
        this.map.clear();
        this.pending.clear();
        this.expanded.clear();
        this.bytes = 0;
    }

    has(lineId) {
        const key = toCacheKey(lineId);
        return !!key && this.map.has(key);
    }

    get(lineId) {
        const key = toCacheKey(lineId);
        const entry = key ? this.map.get(key) : null;
        if (!entry) return null;
        this._touch(key);
        return entry.data;
    }

    async _loadOne(lineId) {
        const key = toCacheKey(lineId);
        if (!key) return null;

        if (this.map.has(key)) {
            this._touch(key);
            return this.map.get(key)?.data ?? null;
        }

        if (this.pending.has(key)) {
            return this.pending.get(key);
        }

        const promise = (async () => {
            try {
                const url = `./data/train-timetables/${encodeURIComponent(key)}.json`;
                const resp = await cachedFetch(url);
                if (!resp.ok) {
                    return null;
                }
                const data = await resp.json();

                const bytes = estimateBytes(data);
                // If one entry itself is absurdly big: clear cache and skip caching this entry
                if (bytes > this.maxBytes) {
                    this.clear();
                    return data;
                }

                // Make room if needed
                this._evictUntilFree(bytes);

                // Insert
                this.map.set(key, { data, bytes, at: nowMs() });
                this.bytes += bytes;
                this._evictUntilFree(0);

                return data;
            } catch (err) {
                if (this.logFetch) {
                    try {
                        console.log('[timetable] fetch error', key, err);
                    } catch {
                        // ignore
                    }
                }
                return null;
            } finally {
                this.pending.delete(key);
            }
        })();

        this.pending.set(key, promise);
        return promise;
    }

    async preloadByLineIds(lineIds) {
        const ids = Array.isArray(lineIds) ? lineIds.map(normalizeId).filter(Boolean) : [];
        if (!ids.length) return { loaded: 0, attempted: 0 };

        const unique = Array.from(new Set(ids));
        const tasks = unique.map((id) => this._loadOne(id));
        const results = await Promise.all(tasks);
        let loaded = 0;
        for (const r of results) {
            if (r != null) loaded += 1;
        }
        return { loaded, attempted: unique.length };
    }

    async preloadRecursiveByLineIds(lineIds, options = {}) {
        const maxIterations = Number.isFinite(options.maxIterations) ? options.maxIterations : 200;
        const maxNewLoads = Number.isFinite(options.maxNewLoads) ? options.maxNewLoads : 200;

        const queue = Array.isArray(lineIds) ? lineIds.map(normalizeId).filter(Boolean) : [];
        if (!queue.length) return { loaded: 0, attempted: 0, discovered: 0 };

        // seenKeys: 本次调用中已经“处理过”（出队并尝试 scan）
        const seenKeys = new Set();
        // scheduledKeys: 已经“调度过”（在 seenKeys 中 或 已经入队等待处理）
        const scheduledKeys = new Set();
        for (const id of queue) {
            const k = toCacheKey(id);
            if (k) scheduledKeys.add(k);
        }
        let attempted = 0;
        let loaded = 0;
        let discovered = 0;
        let iterations = 0;

        while (queue.length && iterations < maxIterations && attempted < maxNewLoads) {
            iterations += 1;
            const current = queue.shift();
            const cacheKey = toCacheKey(current);
            if (!cacheKey || seenKeys.has(cacheKey)) continue;
            seenKeys.add(cacheKey);

            // 如果该线路已经在历史调用中完成过递归展开，则直接跳过，避免重复递归读取。
            if (this.expanded.has(cacheKey)) {
                continue;
            }

            attempted += 1;
            // 若已在虚拟内存中，直接用缓存；否则再加载。
            const data = this.map.has(cacheKey) ? this.get(current) : await this._loadOne(current);
            if (data != null) loaded += 1;

            const refs = collectPtNtRefs(data, { maxNodes: 20000 });
            if (!refs.length) continue;


            for (const ref of refs) {
                const baseLineId = deriveBaseLineIdFromPtNt(ref);
                if (!baseLineId) continue;
                const baseKey = toCacheKey(baseLineId);
                if (!baseKey || scheduledKeys.has(baseKey) || this.expanded.has(baseKey)) continue;
                discovered += 1;
                scheduledKeys.add(baseKey);

                queue.push(baseLineId);
            }

            // 标记该线路已经完成过递归扫描（无论 refs 是否为空，上面已 continue 过滤）。
            this.expanded.add(cacheKey);
        }

        return { loaded, attempted, discovered };
    }

    // Useful for debugging
    stats() {
        return {
            maxBytes: this.maxBytes,
            bytes: this.bytes,
            entries: this.map.size,
            pending: this.pending.size
        };
    }
}

let globalCache = null;

export function getGlobalTimetableCache(options = {}) {
    if (globalCache) return globalCache;
    globalCache = new LruTimetableCache(options);

    // Optional bridge for later reads from other modules
    try {
        window.TokyoRailTimetableCache = globalCache;
    } catch {
        // ignore
    }

    return globalCache;
}
