import {
    GOOGLE_UPDATE_PROBE_URL,
    UPDATE_PROBE_TIMEOUT_MS,
    RELEASE_UPDATE_SOURCES
} from '../config/releaseUpdateSources.mjs';

export const selectReleaseUpdateSource = async ({ fetchImpl, probeGoogleHttps, timeoutMs = UPDATE_PROBE_TIMEOUT_MS }) => {
    const controller = new AbortController();
    let timer;
    try {
        const probe = Promise.resolve().then(async () => {
            if (probeGoogleHttps) return (await probeGoogleHttps())?.reachable === true;
            const response = await fetchImpl(GOOGLE_UPDATE_PROBE_URL, {
                method: 'GET', cache: 'no-store', redirect: 'error', signal: controller.signal
            });
            return response.status === 204;
        });
        const timeout = new Promise((resolve) => {
            timer = setTimeout(() => { resolve(false); controller.abort(); }, timeoutMs);
        });
        const reachable = await Promise.race([probe, timeout]);
        return reachable ? RELEASE_UPDATE_SOURCES.github : RELEASE_UPDATE_SOURCES.atomgit;
    } catch {
        return RELEASE_UPDATE_SOURCES.atomgit;
    } finally {
        clearTimeout(timer);
    }
};

export const readLatestRelease = async ({ source, fetchImpl, readNativeRelease }) => {
    if (readNativeRelease) return readNativeRelease({ url: source.apiUrl });
    const response = await fetchImpl(source.apiUrl, {
        cache: 'no-store', headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${source.label} 版本查询失败（HTTP ${response.status}）`);
    return response.json();
};
