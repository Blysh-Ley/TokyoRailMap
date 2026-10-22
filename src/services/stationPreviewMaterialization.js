import { getCachedJson } from '../lib/fetch.js';
import {
    createStationPreviewAtlasReader,
    getStationPreviewTargets,
    stationPreviewVariantKey
} from '../domain/stationPreviewMaterialization.js';

let eligibleStationIds = new Set();
let activeProfile;
let atlasReader = null;
let preloadPromise = null;
const preparedByVariant = new Map();

export const preloadPreparedStationPreviews = ({ stationFeatures = [], profile, enabled = true } = {}) => {
    activeProfile = profile;
    eligibleStationIds = new Set(getStationPreviewTargets(stationFeatures)
        .map((feature) => String(feature.properties.id)));
    if (!enabled) return Promise.resolve();
    if (!preloadPromise) {
        preloadPromise = getCachedJson('./data/station-previews/atlas.json')
            .then((atlas) => { atlasReader = createStationPreviewAtlasReader(atlas); })
            .catch((error) => { console.warn('站点预览预计算数据未能载入，继续使用实时计算。', error); });
    }
    return preloadPromise;
};

export const getPreparedStationPreview = (stationId, serviceDay, theme) => {
    if (!eligibleStationIds.has(String(stationId))) return null;
    const key = stationPreviewVariantKey(stationId, serviceDay, theme, activeProfile);
    return preparedByVariant.get(key) || atlasReader?.get(stationId, serviceDay, theme, activeProfile) || null;
};

// 只由首次选站、已清空方向筛选的默认渲染写入，内容不随交互取消而失效。
export const rememberPreparedStationPreview = ({ stationId, serviceDay, theme, requestsSignature, snapshot }) => {
    if (!eligibleStationIds.has(String(stationId))) return;
    preparedByVariant.set(stationPreviewVariantKey(stationId, serviceDay, theme, activeProfile), { requestsSignature, snapshot });
};
