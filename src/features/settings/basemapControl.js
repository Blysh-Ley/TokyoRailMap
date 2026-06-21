import { readBasemapMode, writeBasemapMode } from '../../services/appSettings.js';
import { createSegmentedSettingRow } from './settingRows.js';

export const mountBasemapToggle = ({ hostEl, onModeChanged } = {}) => {
    const row = createSegmentedSettingRow({
        hostEl,
        className: 'settings-item-basemap',
        title: '地图底图',
        options: [
            { value: 'osm-white', label: '极简' },
            { value: 'osm-detailed', label: '详细' },
            { value: 'transparent', label: '透明' }
        ]
    });
    const btnWhite = row.buttons.get('osm-white');
    const btnDetailed = row.buttons.get('osm-detailed');
    const btnTransparent = row.buttons.get('transparent');

    const setMode = (mode) => {
        const next = writeBasemapMode(mode);
        row.setActive(next);
        onModeChanged?.(next);
    };

    btnWhite.addEventListener('click', () => setMode('osm-white'));
    btnDetailed.addEventListener('click', () => setMode('osm-detailed'));
    btnTransparent.addEventListener('click', () => setMode('transparent'));

    setMode(readBasemapMode());

    return {
        setMode
    };
};
