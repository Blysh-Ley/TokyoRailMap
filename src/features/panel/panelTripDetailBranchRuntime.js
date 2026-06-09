const defaultToText = (value) => String(value ?? '').trim();

export const resolvePanelTripDetailBranchRefIds = async ({
    refIds,
    token,
    key,
    resolveFirstMultiRefsAlongChain = async () => [],
    isTokenCurrent = () => true,
    toText = defaultToText
} = {}) => {
    const ids = Array.isArray(refIds) ? refIds.map((value) => toText(value)).filter(Boolean) : [];
    if (ids.length !== 1) return ids;
    const found = await resolveFirstMultiRefsAlongChain(ids[0], token, key);
    if (!isTokenCurrent()) return null;
    return Array.isArray(found) && found.length >= 2 ? found : ids;
};

export const derivePanelTripDetailBranchRuntime = ({
    ntBranchLanes,
    ptBranchLanes
} = {}) => {
    const ntLanes = Array.isArray(ntBranchLanes) ? ntBranchLanes : [];
    const ptLanes = Array.isArray(ptBranchLanes) ? ptBranchLanes : [];
    const hasNtBranch = ntLanes.length >= 2;
    const hasPtBranch = ptLanes.length >= 2;
    const activeBranchLanes = hasNtBranch ? ntLanes : (hasPtBranch ? ptLanes : []);
    return {
        activeBranchLanes,
        branchCount: activeBranchLanes.length,
        branchMode: hasNtBranch ? 'split' : (hasPtBranch ? 'merge' : '')
    };
};
