import { readBasemapMode, writeBasemapMode } from '../../services/appSettings.js';
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
