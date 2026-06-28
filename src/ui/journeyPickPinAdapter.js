import {
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} from '../lib/fetch.js';

export const createJourneyPickPinElement = async ({ label = '', type = 'origin' } = {}) => {
    const rawType = String(type || 'origin').trim().toLowerCase();
    const pinType = rawType === 'destination' || rawType.startsWith('waypoint-')
        ? rawType
        : 'origin';
    const outer = document.createElement('div');
    outer.className = `journey-pick-pin-marker journey-pick-pin-${pinType}`;
    const labelText = String(label ?? '').trim();
    if (labelText) {
        const labelEl = document.createElement('div');
        labelEl.className = 'journey-pick-pin-label';
        labelEl.textContent = labelText;
        outer.appendChild(labelEl);
    }
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
