const defaultToText = (value) => String(value ?? '').trim();
const UNKNOWN_DESTINATION_LABEL = '\u672a\u77e5\u65b9\u5411';
const TOWARD_PREFIX = '\u5f80';

export const buildPanelTripDetailTitleHtml = async ({
    trip,
    stationsIndex,
    trainTypesIndex,
    trainTypeColorIndex,
    resolveThroughServiceEndpointIds = async () => ({ terminalIds: [] }),
    getStationIds = () => [],
    buildTerminalDisplayLabel = () => '',
    getTripDestName = () => '',
    resolveTrainTypeColorForTheme = (value) => value,
    collectTripSpecialNames = async () => [],
    escapeHtml = (value) => String(value ?? ''),
    toText = defaultToText
} = {}) => {
    const titleThroughEndpoints = await resolveThroughServiceEndpointIds(trip);
    const titleResolvedTerminalIds = Array.isArray(titleThroughEndpoints?.terminalIds)
        ? titleThroughEndpoints.terminalIds.map((value) => toText(value)).filter(Boolean)
        : [];
    const fallbackTitleTerminalIds = getStationIds(trip?.ds);
    const titleTerminalIds = titleResolvedTerminalIds.length ? titleResolvedTerminalIds : fallbackTitleTerminalIds;
    const titleTerminalNames = Array.from(new Set(
        titleTerminalIds.map((id) => toText(stationsIndex?.idToNameZh?.get?.(id) || id)).filter(Boolean)
    ));
    const destName = buildTerminalDisplayLabel(titleTerminalNames) || getTripDestName(trip, stationsIndex) || UNKNOWN_DESTINATION_LABEL;
    const typeId = toText(trip?.y);
    const typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';
    const typeColor = typeId ? resolveTrainTypeColorForTheme(trainTypeColorIndex.get(typeId)) : '';
    const titlePrefix = `${TOWARD_PREFIX} ${destName}`.trim();
    const safeTypeName = toText(typeName);
    const safeTypeColor = toText(typeColor);
    const titleSpecialNames = await collectTripSpecialNames(trip);
    const titleSpecialText = Array.from(new Set(
        (Array.isArray(titleSpecialNames) ? titleSpecialNames : [])
            .map((value) => toText(value))
            .filter(Boolean)
    )).join(' / ');
    const titleMainHtml = safeTypeName
        ? `${escapeHtml(titlePrefix)} <span class="panel-trip-detail-title-type"${safeTypeColor ? ` style="color:${escapeHtml(safeTypeColor)}"` : ''}>${escapeHtml(safeTypeName)}</span>`
        : escapeHtml(titlePrefix);
    const titleSpecialHtml = titleSpecialText
        ? `<div class="panel-trip-detail-title-special">${escapeHtml(titleSpecialText)}</div>`
        : '';
    return `<div class="panel-trip-detail-title-main">${titleMainHtml}</div>${titleSpecialHtml}`;
};
