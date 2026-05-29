export const loadSettingsIcon = ({
    img,
    iconName,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} = {}) => {
    if (
        !img ||
        !iconName ||
        typeof setImageElementFromCache !== 'function' ||
        typeof getIconCandidates !== 'function' ||
        typeof getPreferredCachedImageSrc !== 'function'
    ) {
        return null;
    }

    const cacheKey = `icon:${iconName}`;
    return setImageElementFromCache(img, getIconCandidates(iconName), {
        cacheKey,
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates(iconName), { cacheKey })
    }).catch(() => null);
};

export const createSettingsIconButton = ({
    ariaLabel = '',
    buttonClassName = '',
    iconClassName = '',
    iconName = '',
    title = '',
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = buttonClassName;
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    if (title) button.title = title;

    const icon = document.createElement('img');
    icon.className = iconClassName;
    icon.alt = '';
    loadSettingsIcon({
        img: icon,
        iconName,
        getIconCandidates,
        getPreferredCachedImageSrc,
        setImageElementFromCache
    });
    button.appendChild(icon);

    return {
        button,
        icon
    };
};
