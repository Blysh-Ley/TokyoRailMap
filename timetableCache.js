/**
 * Timetable cache (virtual memory)
 * - Given line ids, loads ./data/train-timetables/{id}.json (after replacing '.' -> '-')
 * - Stores parsed JSON in memory for later reads
 * - Uses approximate byte size (JSON string length) with LRU eviction
 */

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
        .replace(/^JR-Central\b/i, 'JRCentral');

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

class LruTimetableCache {
    constructor({ maxBytes = 50 * 1024 * 1024 } = {}) {
        this.maxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 50 * 1024 * 1024;
        this.bytes = 0;
        this.map = new Map(); // key(lineId) -> { data, bytes, at }
        this.pending = new Map(); // key(lineId) -> Promise<data|null>
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
        this.bytes = 0;
    }

    has(lineId) {
        const key = normalizeId(lineId);
        return this.map.has(key);
    }

    get(lineId) {
        const key = normalizeId(lineId);
        const entry = this.map.get(key);
        if (!entry) return null;
        this._touch(key);
        return entry.data;
    }

    async _loadOne(lineId) {
        const key = normalizeId(lineId);
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
                const stem = toFileStem(key);
                if (!stem) return null;
                const url = `./data/train-timetables/${encodeURIComponent(stem)}.json`;
                const resp = await fetch(url);
                if (!resp.ok) return null;
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
            } catch {
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
