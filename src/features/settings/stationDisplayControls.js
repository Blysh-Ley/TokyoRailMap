import { readStationOffsetMode } from '../../services/appSettings.js';
import { createSegmentedSettingRow } from './settingRows.js';

export const mountStationOffsetToggle = ({ hostEl, onModeChanged } = {}) => {
    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-station-offset',
        title: '站点位置纠正',
        options: [
            { value: 'dynamic', label: '动态' },
            { value: 'performance', label: '性能' }
        ]
    });
    const btnDynamic = row.buttons.get('dynamic');
    const btnPerformance = row.buttons.get('performance');

    const normalizeMode = (mode) => (
        String(mode || '').trim().toLowerCase() === 'performance' ? 'performance' : 'dynamic'
    );

    const setMode = (mode) => {
        const next = onModeChanged?.(mode) || normalizeMode(mode);
        row.setActive(next);
    };

    btnDynamic.addEventListener('click', () => setMode('dynamic'));
    btnPerformance.addEventListener('click', () => setMode('performance'));

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
            { value: 'off', label: '隐藏' },
            { value: 'auto', label: '自动' },
            { value: 'all', label: '全显' }
        ]
    });
    const btnOff = row.buttons.get('off');
    const btnAuto = row.buttons.get('auto');
    const btnAll = row.buttons.get('all');
    let modeState = initialMode === 'off' || initialMode === 'all' ? initialMode : 'auto';

    const normalizeMode = (mode) => (mode === 'off' || mode === 'all' ? mode : 'auto');

    const setMode = (mode, options = {}) => {
        if (options?.fromUser !== true) return false;
        const next = normalizeMode(mode);
        if (modeState === next) return false;
        modeState = next;
        row.setActive(modeState);
        onModeChanged?.(modeState);
        if (options?.fromUser === true) onUserModeChanged?.(modeState);
        return true;
    };

    btnOff.addEventListener('click', () => setMode('off', { fromUser: true }));
    btnAuto.addEventListener('click', () => setMode('auto', { fromUser: true }));
    btnAll.addEventListener('click', () => setMode('all', { fromUser: true }));

    row.setActive(modeState);

    return {
        setMode
    };
};
