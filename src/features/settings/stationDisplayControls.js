import { readStationOffsetMode } from '../../services/appSettings.js';
import { normalizeStationLabelMode, STATION_LABEL_MODES } from '../../domain/stationLabelDisplay.js';
import { createSegmentedSettingRow } from './settingRows.js';

export const mountStationOffsetToggle = ({ hostEl, onModeChanged } = {}) => {
    const normalizeMode = (mode) => (
        String(mode || '').trim().toLowerCase() === 'performance' ? 'performance' : 'dynamic'
    );

    const setMode = (mode) => {
        return onModeChanged?.(mode) || normalizeMode(mode);
    };

    setMode(readStationOffsetMode());

    return {
        setMode
    };
};

export const mountStationLabelToggle = ({
    hostEl,
    initialMode = 'auto',
    onModeChanged,
    onUserModeChanged
} = {}) => {
    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-station-label',
        title: '站名显示',
        options: [
            { value: STATION_LABEL_MODES.OFF, label: '隐藏' },
            { value: STATION_LABEL_MODES.FOCUS, label: '重点' },
            { value: STATION_LABEL_MODES.AUTO, label: '自动' },
            { value: STATION_LABEL_MODES.ALL, label: '全显' }
        ]
    });
    const btnOff = row.buttons.get(STATION_LABEL_MODES.OFF);
    const btnFocus = row.buttons.get(STATION_LABEL_MODES.FOCUS);
    const btnAuto = row.buttons.get(STATION_LABEL_MODES.AUTO);
    const btnAll = row.buttons.get(STATION_LABEL_MODES.ALL);
    let modeState = normalizeStationLabelMode(initialMode);

    const setMode = (mode, options = {}) => {
        if (options?.fromUser !== true) return false;
        const next = normalizeStationLabelMode(mode);
        if (modeState === next) return false;
        modeState = next;
        row.setActive(modeState);
        onModeChanged?.(modeState);
        if (options?.fromUser === true) onUserModeChanged?.(modeState);
        return true;
    };

    btnOff.addEventListener('click', () => setMode(STATION_LABEL_MODES.OFF, { fromUser: true }));
    btnFocus.addEventListener('click', () => setMode(STATION_LABEL_MODES.FOCUS, { fromUser: true }));
    btnAuto.addEventListener('click', () => setMode(STATION_LABEL_MODES.AUTO, { fromUser: true }));
    btnAll.addEventListener('click', () => setMode(STATION_LABEL_MODES.ALL, { fromUser: true }));

    row.setActive(modeState);

    return {
        setMode
    };
};
