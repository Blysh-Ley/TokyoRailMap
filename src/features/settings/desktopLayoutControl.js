import {
    readDesktopLayoutEnabled,
    writeDesktopLayoutEnabled
} from '../../services/appSettings.js';
import { isDesktopLayoutPreferenceAvailableForCurrentDevice } from '../../services/deviceFormFactorService.js';
import { createSegmentedSettingRow } from './settingRows.js';

export const mountDesktopLayoutToggle = ({
    hostEl,
    isAvailable = isDesktopLayoutPreferenceAvailableForCurrentDevice,
    onEnabledChanged
} = {}) => {
    if (isAvailable?.() !== true) return null;

    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-desktop-layout',
        title: '使用桌面端',
        options: [
            { value: 'on', label: '开启' },
            { value: 'off', label: '关闭' }
        ]
    });
    const btnOn = row.buttons.get('on');
    const btnOff = row.buttons.get('off');

    const setEnabled = (enabled, { persistStorage = true, notify = true } = {}) => {
        const next = enabled === true;
        row.setActive(next ? 'on' : 'off');
        if (persistStorage) writeDesktopLayoutEnabled(next);
        if (notify) onEnabledChanged?.(next);
        return next;
    };

    btnOn.addEventListener('click', () => setEnabled(true));
    btnOff.addEventListener('click', () => setEnabled(false));

    setEnabled(readDesktopLayoutEnabled(), {
        notify: false,
        persistStorage: false
    });

    return {
        setEnabled
    };
};
