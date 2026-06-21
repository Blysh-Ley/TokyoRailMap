import { getAboutNoticeModel } from '../../config/aboutNotices.js';
import { openAboutDialog } from '../../ui/aboutDialogView.js';
import { createActionSettingRow } from './settingRows.js';

export const mountAboutControl = ({ hostEl } = {}) => {
    const row = createActionSettingRow({
        hostEl,
        className: 'settings-item-about',
        title: '关于',
        actionLabel: '查看',
        actionAriaLabel: '查看关于与开源致谢'
    });

    row.button.addEventListener('click', () => {
        openAboutDialog({
            model: getAboutNoticeModel()
        });
    });

    return row;
};
