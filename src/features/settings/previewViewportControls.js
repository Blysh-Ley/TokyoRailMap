import {
    readAdaptiveViewportEnabled,
    readHoverPreviewEnabled,
    readLineNameLabelsEnabled,
    readTripPastDimmingEnabled,
    writeAdaptiveViewportEnabled,
    writeHoverPreviewEnabled,
    writeLineNameLabelsEnabled,
    writeTripPastDimmingEnabled
} from '../../services/appSettings.js';
import { createSegmentedSettingRow } from './settingRows.js';

const mountBooleanToggle = ({
    hostEl,
    className,
    title,
    readEnabled,
    writeEnabled,
    onEnabledChanged
} = {}) => {
    const row = createSegmentedSettingRow({
        hostEl,
        className,
        title,
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
        if (persistStorage) writeEnabled?.(next);
    };

    btnOn.addEventListener('click', () => setEnabled(true));
    btnOff.addEventListener('click', () => setEnabled(false));

    setEnabled(readEnabled?.() !== false);

    return {
        setEnabled,
        setDisabled: (disabled) => row.setDisabled(disabled === true)
    };
};

export const mountHoverPreviewToggle = ({ hostEl, onEnabledChanged } = {}) => (
    mountBooleanToggle({
        hostEl,
        className: 'settings-item-hover-preview',
        title: '鼠标悬浮预览',
        readEnabled: readHoverPreviewEnabled,
        writeEnabled: writeHoverPreviewEnabled,
        onEnabledChanged
    })
);

export const mountTripPastDimmingToggle = ({ hostEl, onEnabledChanged } = {}) => (
    mountBooleanToggle({
        hostEl,
        className: 'settings-item-trip-past-dimming',
        title: '班次过站淡化',
        readEnabled: readTripPastDimmingEnabled,
        writeEnabled: writeTripPastDimmingEnabled,
        onEnabledChanged
    })
);

export const mountAdaptiveViewportToggle = ({ hostEl, onEnabledChanged } = {}) => {
    const controller = mountBooleanToggle({
        hostEl,
        className: 'settings-item-adaptive-viewport',
        title: '自适应视野',
        readEnabled: readAdaptiveViewportEnabled,
        writeEnabled: writeAdaptiveViewportEnabled,
        onEnabledChanged
    });

    return {
        setEnabled: controller.setEnabled
    };
};

export const mountLineNameLabelsToggle = ({ hostEl, onEnabledChanged } = {}) => (
    mountBooleanToggle({
        hostEl,
        className: 'settings-item-line-name-labels',
        title: '显示线路名',
        readEnabled: readLineNameLabelsEnabled,
        writeEnabled: writeLineNameLabelsEnabled,
        onEnabledChanged
    })
);
