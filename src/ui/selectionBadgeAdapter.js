const toText = (value) => String(value ?? '').trim();

const createLineBadgeIconModel = ({ routeId, code = '', color = '' } = {}) => ({
    kind: 'line-icon',
    routeId: toText(routeId),
    code: toText(code),
    color: toText(color)
});

export const buildSelectionBadgeViewModel = ({
    companyLogoMap = {},
    getLineColor = () => '',
    getLineName = () => '',
    getThroughCategory = () => '',
    getThroughDisplay = () => null,
    isDarkThemeActive = () => false,
    resolveRailColor = (color) => color,
    selectedCompany = null,
    selectedLineId = null,
    throughServiceConfigs = {}
} = {}) => {
    const lineId = toText(selectedLineId);
    if (lineId) {
        const throughDisplay = getThroughDisplay(lineId);
        const throughCategory = getThroughCategory(lineId);
        const throughConfig = throughServiceConfigs?.[throughCategory];
        const rawColor = toText(throughDisplay?.color || getLineColor(lineId) || '#111') || '#111';
        const iconModels = [];

        if (throughConfig) {
            for (const code of throughConfig.codes || []) {
                iconModels.push(createLineBadgeIconModel({
                    routeId: throughConfig.routeIds?.[0] || '',
                    code,
                    color: throughConfig.color || ''
                }));
            }
        } else {
            iconModels.push(createLineBadgeIconModel({
                routeId: lineId,
                color: getLineColor(lineId) || ''
            }));
        }

        return {
            kind: 'line',
            text: toText(throughDisplay?.name || getLineName(lineId) || lineId),
            color: resolveRailColor(rawColor) || '#111',
            icons: iconModels
        };
    }

    const companyKey = toText(selectedCompany);
    if (companyKey) {
        const companyMeta = companyLogoMap?.[companyKey] || {};
        const companyZh = toText(companyMeta.zh);
        const logoFile = companyMeta.img?.[0];
        const icons = logoFile
            ? [{
                kind: 'company-logo',
                file: toText(logoFile),
                alt: companyZh || companyKey
            }]
            : [];

        return {
            kind: 'company',
            text: companyZh || companyKey,
            color: isDarkThemeActive() ? '#f2f2f2' : '#111',
            icons
        };
    }

    return { kind: 'empty' };
};

export const createSelectionBadgeAdapter = ({
    badge,
    createLineIconElement,
    getCompanyLogoCandidates = () => [],
    setImageElementFromCache = () => Promise.resolve()
} = {}) => {
    if (!badge) {
        throw new Error('selectionBadgeAdapter requires badge');
    }

    const createBadgeIcon = ({ routeId, code, color } = {}) => {
        const icon = createLineIconElement?.({ routeId, code, color });
        if (!icon) return null;
        icon.style.marginRight = '0';
        return icon;
    };

    const createCompanyLogo = ({ file, alt } = {}) => {
        const logoFile = toText(file);
        if (!logoFile) return null;

        const logoIcon = document.createElement('img');
        logoIcon.className = 'selection-badge-company-logo';
        logoIcon.alt = toText(alt);
        logoIcon.decoding = 'async';
        logoIcon.loading = 'eager';
        logoIcon.style.height = '25px';
        logoIcon.style.width = 'auto';
        logoIcon.style.maxWidth = '80px';
        logoIcon.style.display = 'block';
        logoIcon.style.objectFit = 'contain';
        setImageElementFromCache(logoIcon, getCompanyLogoCandidates(logoFile), {
            cacheKey: `companyLogo:${logoFile}`
        }).catch(() => null);
        return logoIcon;
    };

    const createIconNode = (iconModel) => {
        if (iconModel?.kind === 'line-icon') return createBadgeIcon(iconModel);
        if (iconModel?.kind === 'company-logo') return createCompanyLogo(iconModel);
        return null;
    };

    const render = (viewModel = {}) => {
        if (!viewModel || viewModel.kind === 'empty') {
            badge.clear();
            return;
        }

        const icons = Array.isArray(viewModel.icons)
            ? viewModel.icons.map(createIconNode).filter(Boolean)
            : [];
        const payload = {
            text: viewModel.text,
            color: viewModel.color,
            icons
        };

        if (viewModel.kind === 'company') {
            badge.showCompany(payload);
            return;
        }

        badge.showLine(payload);
    };

    return { render };
};
