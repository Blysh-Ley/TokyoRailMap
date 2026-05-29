import {
    readTimetableViewMode,
    writeTimetableViewMode
} from '../../services/appSettings.js';
import { appendSettingRow } from './settingRows.js';
import { createSettingsIconButton } from './settingsIconLoader.js';

export const mountTimetableViewToggle = ({
    hostEl,
    getIconCandidates,
    getPreferredCachedImageSrc,
    onModeChanged,
    setImageElementFromCache
} = {}) => {
    const container = document.createElement('div');
    container.className = 'settings-item settings-item-timetable-view';

    const text = document.createElement('span');
    text.className = 'settings-item-title';
    text.textContent = '班次视图';

    const seg = document.createElement('div');
    seg.className = 'settings-item-control settings-view-seg';

    const makeButton = ({ value, ariaLabel, iconName, className }) => {
        const { button } = createSettingsIconButton({
            ariaLabel,
            buttonClassName: className,
            iconClassName: 'settings-view-btn-icon',
            iconName,
            getIconCandidates,
            getPreferredCachedImageSrc,
            setImageElementFromCache
        });
        button.dataset.value = value;
        return button;
    };

    const btnList = makeButton({
        value: 'list',
        ariaLabel: '列表视图',
        iconName: 'list.svg',
        className: 'settings-view-btn settings-view-btn-list'
    });
    const btnGrid = makeButton({
        value: 'grid',
        ariaLabel: '网格视图',
        iconName: 'grid.svg',
        className: 'settings-view-btn settings-view-btn-grid'
    });

    seg.appendChild(btnList);
    seg.appendChild(btnGrid);
    container.appendChild(text);
    container.appendChild(seg);
    appendSettingRow(hostEl, container);

    const setMode = (mode) => {
        const next = writeTimetableViewMode(mode);
        btnList.classList.toggle('is-active', next === 'list');
        btnGrid.classList.toggle('is-active', next === 'grid');
        onModeChanged?.(next);
    };

    btnList.addEventListener('click', () => setMode('list'));
    btnGrid.addEventListener('click', () => setMode('grid'));

    setMode(readTimetableViewMode());

    return {
        setMode
    };
};
