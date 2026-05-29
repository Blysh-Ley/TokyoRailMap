import {
    readAdaptiveViewportEnabled,
    readBasemapMode,
    readHoverPreviewEnabled,
    writeAdaptiveViewportEnabled,
    writeBasemapMode,
    writeHoverPreviewEnabled
} from '../../services/appSettings.js';
import { createSegmentedSettingRow } from './settingRows.js';

export const mountBasemapToggle = ({ hostEl, onModeChanged } = {}) => {
    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-basemap',
        title: '地图底图',
        options: [
            { value: 'carto', label: 'Carto' },
            { value: 'ost', label: 'OST' },
            { value: 'transparent', label: '透明' }
        ]
    });
    const btnCarto = row.buttons.get('carto');
    const btnOst = row.buttons.get('ost');
    const btnTransparent = row.buttons.get('transparent');

    const setMode = (mode) => {
        const next = writeBasemapMode(mode);
        row.setActive(next);
        onModeChanged?.(next);
    };

    btnCarto.addEventListener('click', () => setMode('carto'));
    btnOst.addEventListener('click', () => setMode('ost'));
    btnTransparent.addEventListener('click', () => setMode('transparent'));

    setMode(readBasemapMode());

    return {
        setMode
    };
};

export const mountHoverPreviewToggle = ({ hostEl, onEnabledChanged } = {}) => {
    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-hover-preview',
        title: '自动预览',
        options: [
            { value: 'on', label: '开启' },
            { value: 'off', label: '关闭' }
        ]
    });
    const btnOn = row.buttons.get('on');
    const btnOff = row.buttons.get('off');

    const setEnabled = (enabled, { persistStorage = true } = {}) => {
        const next = enabled !== false;
        row.setActive(next ? 'on' : 'off');
        onEnabledChanged?.(next);
        if (persistStorage) {
            writeHoverPreviewEnabled(next);
        }
    };

    const setDisabled = (disabled) => {
        row.setDisabled(disabled === true);
    };

    btnOn.addEventListener('click', () => setEnabled(true));
    btnOff.addEventListener('click', () => setEnabled(false));

    setEnabled(readHoverPreviewEnabled());

    return {
        setEnabled,
        setDisabled
    };
};

export const mountAdaptiveViewportToggle = ({ hostEl, onEnabledChanged } = {}) => {
    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-adaptive-viewport',
        title: '自适应视野',
        options: [
            { value: 'on', label: '开启' },
            { value: 'off', label: '关闭' }
        ]
    });
    const btnOn = row.buttons.get('on');
    const btnOff = row.buttons.get('off');

    const setEnabled = (enabled, { persistStorage = true } = {}) => {
        const next = enabled !== false;
        row.setActive(next ? 'on' : 'off');
        onEnabledChanged?.(next);
        if (persistStorage) {
            writeAdaptiveViewportEnabled(next);
        }
    };

    btnOn.addEventListener('click', () => setEnabled(true));
    btnOff.addEventListener('click', () => setEnabled(false));

    setEnabled(readAdaptiveViewportEnabled());

    return {
        setEnabled
    };
};
