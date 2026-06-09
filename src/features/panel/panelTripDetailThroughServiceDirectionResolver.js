import { collectPanelTripDetailTripChainByTrip } from './panelTripDetailTripChainWalker.js';

const defaultToText = (value) => String(value ?? '').trim();

const getStationToken = (stationId, toText = defaultToText) => {
    const sid = toText(stationId);
    if (!sid) return '';
    const parts = sid.split('.').map((value) => value.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
};

export const derivePanelTripDetailThroughServiceDirection = async ({
    trip = null,
    displayLineId = '',
    throughServiceConfigs = [],
    loadTripByRefId = async () => null,
    isTokenCurrent = () => true,
    toText = defaultToText
} = {}) => {
    const lineId = toText(displayLineId);
    const targetInfo = (Array.isArray(throughServiceConfigs) ? throughServiceConfigs : [])
        .find((info) => info?.tempId === lineId);
    const directionRule = targetInfo?.directionRule;
    if (!directionRule) return '';

    const ptChain = await collectPanelTripDetailTripChainByTrip({
        startTrip: trip,
        key: 'pt',
        loadTripByRefId,
        isTokenCurrent,
        toText
    });
    if (!isTokenCurrent()) return null;

    const ntChain = await collectPanelTripDetailTripChainByTrip({
        startTrip: trip,
        key: 'nt',
        loadTripByRefId,
        isTokenCurrent,
        toText
    });
    if (!isTokenCurrent()) return null;

    const orderedTrips = [
        ...(Array.isArray(ptChain) ? ptChain.slice().reverse() : []),
        trip,
        ...(Array.isArray(ntChain) ? ntChain : [])
    ];

    let southIdx = -1;
    let northIdx = -1;
    let currentStationIdx = 0;

    for (const chainTrip of orderedTrips) {
        const tt = Array.isArray(chainTrip?.tt) ? chainTrip.tt : [];
        for (const stop of tt) {
            const token = getStationToken(stop?.s, toText);
            if (!token) {
                currentStationIdx += 1;
                continue;
            }

            if (token === directionRule.southNode && southIdx === -1) {
                southIdx = currentStationIdx;
            }
            if (token === directionRule.northNode && northIdx === -1) {
                northIdx = currentStationIdx;
            }
            if (southIdx !== -1 && northIdx !== -1) {
                return southIdx < northIdx ? 'Northbound' : 'Southbound';
            }

            currentStationIdx += 1;
        }
    }

    return '';
};
