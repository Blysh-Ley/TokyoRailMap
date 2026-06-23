import {
    readAutoUpdateCheckEnabled,
    writeAutoUpdateCheckEnabled
} from '../../services/appSettings.js';
import { createSettingsIconButton } from './settingsIconLoader.js';

export const mountAutoUpdateToggle = ({
    hostEl,
    updateApi = globalThis.window?.TokyoRailUpdate ?? globalThis.window?.TokyoRailElectron,
    electronApi,
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} = {}) => {
    const updateBridge = updateApi ?? electronApi;
    const hasUpdateCapability = !!(
        updateBridge &&
        typeof updateBridge.setAutoUpdateCheckEnabled === 'function' &&
        typeof updateBridge.checkForUpdatesNow === 'function'
    );
    if (!hasUpdateCapability) return null;

    const container = document.createElement('div');
    container.className = 'settings-item settings-item-auto-update';

    const { button: left } = createSettingsIconButton({
        ariaLabel: '立即检查更新',
        title: '立即检查更新',
        buttonClassName: 'settings-update-check-now',
        iconClassName: 'settings-update-check-now-icon',
        iconName: 'clockwise.svg',
        getIconCandidates,
        getPreferredCachedImageSrc,
        setImageElementFromCache
    });

    const text = document.createElement('span');
    text.className = 'settings-item-title';
    text.textContent = '自动检查更新';

    const controls = document.createElement('div');
    controls.className = 'settings-auto-update-controls';

    const seg = document.createElement('div');
    seg.className = 'settings-item-control settings-seg';

    const btnOn = document.createElement('button');
    btnOn.type = 'button';
    btnOn.textContent = '开启';

    const btnOff = document.createElement('button');
    btnOff.type = 'button';
    btnOff.textContent = '关闭';

    seg.appendChild(btnOn);
    seg.appendChild(btnOff);
    controls.appendChild(left);
    controls.appendChild(seg);
    container.appendChild(text);
    container.appendChild(controls);

    const host = (hostEl && hostEl.appendChild) ? hostEl : document.body;
    const appearanceRow = host.querySelector('.settings-item.settings-item-appearance');
    if (appearanceRow && appearanceRow.parentElement === host && appearanceRow.nextSibling) {
        host.insertBefore(container, appearanceRow.nextSibling);
    } else if (appearanceRow && appearanceRow.parentElement === host) {
        host.appendChild(container);
    } else if (host.firstChild) {
        host.insertBefore(container, host.firstChild);
    } else {
        host.appendChild(container);
    }

    const setEnabled = (enabled) => {
        const next = enabled !== false;
        btnOn.classList.toggle('is-active', next);
        btnOff.classList.toggle('is-active', !next);
        writeAutoUpdateCheckEnabled(next);
        updateBridge.setAutoUpdateCheckEnabled(next).catch(() => null);
    };

    btnOn.addEventListener('click', () => setEnabled(true));
    btnOff.addEventListener('click', () => setEnabled(false));

    left.addEventListener('click', async () => {
        if (left.disabled) return;
        left.disabled = true;
        try {
            await updateBridge.checkForUpdatesNow();
        } catch {
            // ignore
        } finally {
            left.disabled = false;
        }
    });

    setEnabled(readAutoUpdateCheckEnabled());

    return {
        setEnabled
    };
};
