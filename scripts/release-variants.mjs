export const STANDARD_RELEASE_VARIANT = Object.freeze({
    id: 'standard',
    displayName: '东京铁路图',
    basemapSource: 'pmtiles',
    appId: 'com.blysh.tokyorailmap',
    artifactSuffix: '',
    includePmtiles: true,
    gradleTaskName: ''
});

export const RELEASE_VARIANTS = Object.freeze({
    standard: STANDARD_RELEASE_VARIANT
});

export const RELEASE_VARIANT_ORDER = Object.freeze(['standard']);

export const resolveReleaseVariant = (value = process.env.TOKYO_RAIL_BUILD_VARIANT || 'standard') => {
    const id = String(value || 'standard').trim().toLowerCase();
    if (id === 'standard') return STANDARD_RELEASE_VARIANT;
    throw new Error(`Unknown TokyoRailMap release variant: ${value}`);
};

export const createRuntimeVariantScript = (variantInput) => {
    const variant = typeof variantInput === 'string'
        ? resolveReleaseVariant(variantInput)
        : resolveReleaseVariant(variantInput?.id || 'standard');
    return [
        '(function () {',
        `    window.TOKYO_RAIL_APP_VARIANT = '${variant.id}';`,
        `    window.TOKYO_RAIL_APP_DISPLAY_NAME = '${variant.displayName}';`,
        `    window.TOKYO_RAIL_BASEMAP_SOURCE = '${variant.basemapSource}';`,
        '}());',
        ''
    ].join('\n');
};
