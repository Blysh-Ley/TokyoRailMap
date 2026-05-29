import {
    readAppearanceMode,
    resolveThemeFromAppearance,
    writeAppearanceMode
} from '../../services/appSettings.js';
import { createSegmentedSettingRow } from './settingRows.js';

export const mountAppearanceToggle = ({ hostEl, onThemeChanged } = {}) => {
    const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-appearance',
        title: '外观',
        options: [
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
            { value: 'system', label: '跟随系统' }
        ]
    });
    const btnLight = row.buttons.get('light');
    const btnDark = row.buttons.get('dark');
    const btnSystem = row.buttons.get('system');

    const setThemeMode = (mode) => {
        const nextMode = writeAppearanceMode(mode);
        row.setActive(nextMode);
        onThemeChanged?.({
            mode: nextMode,
            theme: resolveThemeFromAppearance(nextMode)
        });
    };

    btnLight.addEventListener('click', () => setThemeMode('light'));
    btnDark.addEventListener('click', () => setThemeMode('dark'));
    btnSystem.addEventListener('click', () => setThemeMode('system'));

    const onSystemThemeChange = () => {
        const currentMode = readAppearanceMode();
        if (currentMode === 'system') setThemeMode('system');
    };

    if (media && typeof media.addEventListener === 'function') {
        media.addEventListener('change', onSystemThemeChange);
    } else if (media && typeof media.addListener === 'function') {
        media.addListener(onSystemThemeChange);
    }

    setThemeMode(readAppearanceMode());

    return {
        setThemeMode
    };
};
