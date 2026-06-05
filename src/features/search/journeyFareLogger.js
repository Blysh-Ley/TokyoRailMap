import { estimateFareForJourneyPlan } from '../../domain/fareEstimate.js';
import { loadFareGraph } from '../../services/fareDataService.js';

const normalizeText = (value) => String(value ?? '').trim();

const getLogger = (logger) => logger && typeof logger === 'object' ? logger : console;

const callLogger = (logger, method, ...args) => {
    const fn = logger?.[method];
    if (typeof fn === 'function') {
        try {
            fn.apply(logger, args);
        } catch {
            // ignore logging failures
        }
    }
};

const createPlanTitle = (row, index, estimate) => {
    const fallbackLabel = `plan ${index + 1}`;
    const label = normalizeText(row?.label || row?.tagLabels?.[0] || fallbackLabel) || fallbackLabel;
    const amount = estimate?.totalAmount;
    const amountText = typeof amount === 'number' && Number.isFinite(amount)
        ? `JPY ${amount}`
        : estimate?.confidence || 'unknown';
    return `[TokyoRailMap] fare ${index + 1}: ${label} ${amountText}`;
};

export const logJourneyFareEstimates = async ({
    rows,
    getDisplayPlanForRow,
    logger = console,
    loadFareGraphResult = loadFareGraph
} = {}) => {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length || typeof getDisplayPlanForRow !== 'function') return [];

    const targetLogger = getLogger(logger);
    let fareData = null;
    try {
        fareData = await loadFareGraphResult();
    } catch (error) {
        fareData = {
            fareGraph: null,
            status: 'missing',
            errorMessage: String(error?.message || error || '')
        };
    }

    const results = [];
    callLogger(targetLogger, 'groupCollapsed', '[TokyoRailMap] journey fare estimates');
    callLogger(targetLogger, 'log', 'fareData', {
        status: fareData?.status || 'missing',
        url: fareData?.url || '',
        errorMessage: fareData?.errorMessage || ''
    });

    try {
        for (let index = 0; index < list.length; index += 1) {
            const row = list[index];
            let displayPlan = null;
            try {
                displayPlan = await getDisplayPlanForRow(row);
            } catch (error) {
                const failure = {
                    row,
                    estimate: null,
                    errorMessage: String(error?.message || error || '')
                };
                results.push(failure);
                callLogger(targetLogger, 'warn', `[TokyoRailMap] fare ${index + 1}: display plan failed`, failure.errorMessage);
                continue;
            }

            const estimate = estimateFareForJourneyPlan({
                displayPlan,
                fareGraph: fareData?.fareGraph || null,
                fareType: 'ic_card_fare'
            });
            const result = { row, displayPlan, estimate, fareDataStatus: fareData?.status || 'missing' };
            row.fareEstimate = estimate;
            results.push(result);

            callLogger(targetLogger, 'groupCollapsed', createPlanTitle(row, index, estimate));
            callLogger(targetLogger, 'log', 'summary', {
                index: index + 1,
                label: normalizeText(row?.label || ''),
                originStationId: normalizeText(row?.originStationId || ''),
                destinationStationId: normalizeText(row?.destinationStationId || ''),
                totalAmount: estimate.totalAmount,
                currency: estimate.currency,
                fareType: estimate.fareType,
                confidence: estimate.confidence,
                fareDataStatus: fareData?.status || 'missing'
            });
            callLogger(targetLogger, 'log', 'segments', estimate.segments);
            if (estimate.missingSegments.length) {
                callLogger(targetLogger, 'warn', 'missingSegments', estimate.missingSegments);
            }
            callLogger(targetLogger, 'groupEnd');
        }
    } finally {
        callLogger(targetLogger, 'groupEnd');
    }

    return results;
};
