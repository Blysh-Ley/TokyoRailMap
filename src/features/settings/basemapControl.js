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
            { value: 'osm-3d', label: '3D' },
            { value: 'transparent', label: '透明' }
        ]
    });
    const btnWhite = row.buttons.get('osm-white');
    const btnDetailed = row.buttons.get('osm-detailed');
    const btn3d = row.buttons.get('osm-3d');
    const btnTransparent = row.buttons.get('transparent');

    const setMode = (mode) => {
        const next = writeBasemapMode(mode);
        row.setActive(next);
        onModeChanged?.(next);
    };

    btnWhite.addEventListener('click', () => setMode('osm-white'));
    btnDetailed.addEventListener('click', () => setMode('osm-detailed'));
    btn3d.addEventListener('click', () => setMode('osm-3d'));
    btnTransparent.addEventListener('click', () => setMode('transparent'));

    setMode(readBasemapMode());

    return {
        setMode
    };
};
