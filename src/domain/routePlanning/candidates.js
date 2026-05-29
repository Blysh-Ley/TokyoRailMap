const getPlanLegs = (plan) => Array.isArray(plan?.legs) ? plan.legs : [];

export const getPlanSignature = (plan) => [
    getPlanLegs(plan).map((leg) => `${leg?.lineId || ''}:${leg?.typeId || ''}`).join('->'),
    String(Math.round((plan?.firstDepMs || 0) / 60000)),
    String(Math.round((plan?.arrivalMs || 0) / 60000))
].join('||');

export const dedupePlans = (plans) => {
    const seen = new Set();
    const out = [];
    for (const plan of Array.isArray(plans) ? plans : []) {
        const sig = getPlanSignature(plan);
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(plan);
    }
    return out;
};

export const sortPlansByArrivalThenDuration = (plans) => {
    return (Array.isArray(plans) ? plans.slice() : [])
        .sort((a, b) => a.arrivalMs - b.arrivalMs || a.durationMs - b.durationMs);
};

export const isSurchargeTypeId = ({ typeId, explicitSurcharge } = {}) => {
    const id = String(typeId ?? '').trim();
    if (!id) return false;
    if (explicitSurcharge === true) return true;

    const lower = id.toLowerCase();
    if (lower.includes('liner')) return true;
    if (lower.includes('limited') && explicitSurcharge !== false) return true;

    return false;
};

export const planContainsSurcharge = ({ plan, isTypeIdSurcharge } = {}) => {
    const isType = typeof isTypeIdSurcharge === 'function' ? isTypeIdSurcharge : () => false;
    for (const leg of getPlanLegs(plan)) {
        if (leg?.hasNm) return true;
        if (isType(leg?.typeId)) return true;
    }
    return false;
};

export const markPlansWithSurcharge = ({ plans, hasSurcharge } = {}) => {
    const list = Array.isArray(plans) ? plans : [];
    const checker = typeof hasSurcharge === 'function' ? hasSurcharge : () => false;
    for (const plan of list) {
        plan.hasSurcharge = checker(plan);
    }
    return list;
};

export const pickPlanBuckets = (plans) => {
    const list = Array.isArray(plans) ? plans : [];
    if (!list.length) return [];

    const shortest = list.slice().sort((a, b) => a.durationMs - b.durationMs || a.transfers - b.transfers || a.arrivalMs - b.arrivalMs)[0];
    const fewestTransfers = list.slice().sort((a, b) => a.transfers - b.transfers || a.durationMs - b.durationMs || a.arrivalMs - b.arrivalMs)[0];
    const earliestDeparture = list.slice().sort((a, b) => a.firstDepMs - b.firstDepMs || a.arrivalMs - b.arrivalMs)[0];

    const picked = [];
    const pickedSignatures = new Set();
    const addUnique = (plan, label) => {
        if (!plan) return;
        const sig = getPlanSignature(plan);
        if (pickedSignatures.has(sig)) return;
        pickedSignatures.add(sig);
        picked.push({ label, plan });
    };
    addUnique(shortest, '\u6700\u77ed\u7528\u65f6');
    addUnique(fewestTransfers, '\u6700\u5c11\u6362\u4e58');
    addUnique(earliestDeparture, '\u6700\u65e9\u51fa\u53d1');

    const backup = sortPlansByArrivalThenDuration(list)
        .filter((plan) => !pickedSignatures.has(getPlanSignature(plan)))
        .slice(0, 3)
        .map((plan, idx) => ({ label: `\u5907\u7528\u65b9\u6848${idx + 1}`, plan }));

    const directSimple = shortest && shortest.transfers === 0 && list.length <= 2;
    if (directSimple) {
        const directPicked = [];
        addUnique(shortest, '\u6700\u77ed\u7528\u65f6');
        addUnique(earliestDeparture, '\u6700\u65e9\u51fa\u53d1');
        for (const item of picked) {
            if (item.label === '\u6700\u77ed\u7528\u65f6' || item.label === '\u6700\u65e9\u51fa\u53d1') {
                if (!directPicked.some((row) => row.plan === item.plan)) directPicked.push(item);
            }
        }
        return directPicked;
    }

    return [...picked, ...backup];
};
