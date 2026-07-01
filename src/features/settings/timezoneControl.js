import {
    readTimezoneMode,
    writeTimezoneMode
} from '../../services/appSettings.js';
import { createSegmentedSettingRow } from './settingRows.js';

export const mountTimezoneToggle = ({ hostEl, onModeChanged } = {}) => {
    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-timezone',
        title: '时区',
        options: [
            { value: 'local', label: '当地' },
            { value: 'japan', label: '日本' }
        ]
    });
    const btnLocal = row.buttons.get('local');
    const btnJapan = row.buttons.get('japan');

    const setMode = (mode) => {
        const next = writeTimezoneMode(mode);
        row.setActive(next);
        onModeChanged?.(next);
    };

    btnLocal.addEventListener('click', () => setMode('local'));
    btnJapan.addEventListener('click', () => setMode('japan'));

    setMode(readTimezoneMode());

    return {
        setMode
    };
};
