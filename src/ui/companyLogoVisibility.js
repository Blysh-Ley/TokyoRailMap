const COMPANY_LOGO_SELECTOR = [
    '.RW-company-logo',
    '.mobile-menu-company-logo',
    '.panel-company-logo',
    '.station-hover-company-logo',
    '.search-result-icon--company',
    '.selection-badge-company-logo'
].join(',');

const removeEmptyLogoHost = (host) => {
    if (!host) return;
    if (host.classList?.contains?.('selection-badge-icon') && !host.children.length) {
        host.style.display = 'none';
    }
};

export const hideMissingCompanyLogo = (img) => {
    if (!img?.matches?.(COMPANY_LOGO_SELECTOR)) return false;

    const slot = img.closest?.('.mobile-menu-company-logo-slot');
    if (slot) {
        slot.remove();
        return true;
    }

    const searchIcon = img.closest?.('.search-result-icon');
    if (searchIcon && img.classList?.contains?.('search-result-icon--company')) {
        searchIcon.remove();
        return true;
    }

    const parent = img.parentElement;
    img.remove();
    removeEmptyLogoHost(parent);
    return true;
};

export const bindCompanyLogoFailure = (img) => {
    if (!img?.addEventListener) return img;
    img.addEventListener('error', () => {
        hideMissingCompanyLogo(img);
    }, { once: true });
    return img;
};

export const installCompanyLogoFailureVisibility = ({
    doc = globalThis.document
} = {}) => {
    if (!doc?.addEventListener || doc.__tokyoRailCompanyLogoFailureVisibilityInstalled) {
        return false;
    }
    doc.__tokyoRailCompanyLogoFailureVisibilityInstalled = true;
    doc.addEventListener('error', (event) => {
        hideMissingCompanyLogo(event?.target);
    }, true);
    return true;
};
