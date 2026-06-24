const DEFAULT_ICON_SRC = './assets/icons/icon-android.png';

const createFallbackSplash = (doc, iconSrc) => {
    if (!doc?.body) return null;
    const root = doc.createElement('div');
    root.id = 'mobile-startup-splash';
    root.className = 'mobile-startup-splash';
    root.setAttribute('aria-hidden', 'true');

    const icon = doc.createElement('img');
    icon.className = 'mobile-startup-splash-icon';
    icon.alt = '';
    icon.decoding = 'async';
    icon.src = iconSrc;
    root.appendChild(icon);
    doc.body.prepend(root);
    return root;
};

export const createMobileStartupSplashView = ({
    doc = globalThis.document,
    iconSrc = DEFAULT_ICON_SRC
} = {}) => {
    const root = doc?.getElementById?.('mobile-startup-splash')
        || createFallbackSplash(doc, iconSrc);
    const icon = root?.querySelector?.('.mobile-startup-splash-icon');
    if (icon && !icon.getAttribute('src')) {
        icon.setAttribute('src', iconSrc);
    }

    const setEnabled = (enabled) => {
        if (!root?.classList) return false;
        root.classList.toggle('is-disabled', enabled !== true);
        return true;
    };

    const dismiss = () => {
        if (!root?.classList) return false;
        root.classList.add('is-hidden');
        root.setAttribute('aria-hidden', 'true');
        return true;
    };

    return {
        dismiss,
        setEnabled,
        getElement: () => root
    };
};
