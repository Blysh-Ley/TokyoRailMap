import {
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} from '../lib/fetch.js';

export const createJourneyPickPinElement = async ({ type = 'origin' } = {}) => {
    const pinType = String(type || 'origin').trim().toLowerCase() === 'destination'
        ? 'destination'
        : 'origin';
    const outer = document.createElement('div');
    outer.className = `journey-pick-pin-marker journey-pick-pin-${pinType}`;
    const icon = document.createElement('img');
    icon.className = `journey-pick-pin-icon journey-pick-pin-icon-${pinType}`;
    icon.alt = '';
    outer.appendChild(icon);

    try {
        const candidates = getIconCandidates('pin.svg');
        await setImageElementFromCache(icon, candidates, {
            cacheKey: 'icon:pin.svg',
            fallbackSrc: getPreferredCachedImageSrc(candidates, { cacheKey: 'icon:pin.svg' })
        });
    } catch {
        // ignore icon cache failures; the marker element is still usable.
    }

    return outer;
};
