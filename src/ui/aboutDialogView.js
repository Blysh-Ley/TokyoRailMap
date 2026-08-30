import { getAboutNoticeModel } from '../config/aboutNotices.js';

const ABOUT_DIALOG_ID = 'tokyo-rail-about-dialog';

const createEl = (doc, tagName, className = '', text = '') => {
    const el = doc.createElement(tagName);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
};

const appendLink = (doc, parent, label, href) => {
    const link = createEl(doc, 'a', 'about-dialog-link', label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    parent.appendChild(link);
    return link;
};

const appendNoticeList = (doc, parent, title, items) => {
    const section = createEl(doc, 'section', 'about-dialog-section');
    section.appendChild(createEl(doc, 'h3', 'about-dialog-section-title', title));

    const list = createEl(doc, 'ul', 'about-dialog-notice-list');
    for (const item of items) {
        const row = createEl(doc, 'li', 'about-dialog-notice-item');
        appendLink(doc, row, item.name, item.url);
        const meta = [item.role, item.license].filter(Boolean).join(' · ');
        if (meta) {
            row.appendChild(createEl(doc, 'span', 'about-dialog-notice-meta', meta));
        }
        list.appendChild(row);
    }

    section.appendChild(list);
    parent.appendChild(section);
};

const buildAboutDialog = ({ doc, model, onClose }) => {
    const overlay = createEl(doc, 'div', 'about-dialog-overlay');
    overlay.id = ABOUT_DIALOG_ID;
    overlay.setAttribute('role', 'presentation');

    const dialog = createEl(doc, 'section', 'about-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'about-dialog-title');
    dialog.tabIndex = -1;

    const header = createEl(doc, 'header', 'about-dialog-header');
    const titleGroup = createEl(doc, 'div', 'about-dialog-title-group');
    const title = createEl(doc, 'h2', 'about-dialog-title', '关于');
    title.id = 'about-dialog-title';
    titleGroup.appendChild(title);
    titleGroup.appendChild(createEl(doc, 'p', 'about-dialog-subtitle', `${model.project.displayName} / ${model.project.name}`));
    const currentVersion = String(model.project.version ?? '').trim().replace(/^v/i, '');
    if (currentVersion) {
        titleGroup.appendChild(createEl(doc, 'p', 'about-dialog-version', `当前版本 v${currentVersion}`));
    }

    const closeButton = createEl(doc, 'button', 'about-dialog-close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', '关闭关于');
    header.appendChild(titleGroup);
    header.appendChild(closeButton);

    const body = createEl(doc, 'div', 'about-dialog-body');
    const projectSection = createEl(doc, 'section', 'about-dialog-section about-dialog-project');
    projectSection.appendChild(createEl(doc, 'h3', 'about-dialog-section-title', '项目声明'));
    projectSection.appendChild(createEl(doc, 'p', 'about-dialog-project-line', model.project.copyright));
    projectSection.appendChild(createEl(doc, 'p', 'about-dialog-project-line', model.project.license));
    projectSection.appendChild(createEl(doc, 'p', 'about-dialog-project-summary', model.project.licenseSummary));
    if (model.project.privacyPolicyUrl) {
        const privacyLine = createEl(doc, 'p', 'about-dialog-project-line');
        appendLink(doc, privacyLine, '隐私政策', model.project.privacyPolicyUrl);
        projectSection.appendChild(privacyLine);
    }
    body.appendChild(projectSection);

    appendNoticeList(doc, body, '地图与数据来源', model.dataSources);
    appendNoticeList(doc, body, '开源库 License', model.libraries);

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);

    closeButton.addEventListener('click', onClose);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) onClose();
    });

    return { dialog, overlay };
};

export const openAboutDialog = ({
    doc = globalThis.document,
    model = getAboutNoticeModel()
} = {}) => {
    const body = doc?.body;
    if (!doc?.createElement || !body?.appendChild) return null;

    const existing = doc.getElementById?.(ABOUT_DIALOG_ID);
    if (existing?.__tokyoRailAboutDialogController) {
        existing.__tokyoRailAboutDialogController.focus();
        return existing.__tokyoRailAboutDialogController;
    }

    let controller = null;
    const previouslyActive = doc.activeElement;
    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault?.();
            controller?.close();
        }
    };
    const close = () => {
        doc.removeEventListener?.('keydown', onKeyDown, true);
        controller?.overlay?.remove?.();
        previouslyActive?.focus?.();
    };

    const { dialog, overlay } = buildAboutDialog({ doc, model, onClose: close });
    controller = {
        close,
        dialog,
        overlay,
        focus: () => dialog.focus?.()
    };
    overlay.__tokyoRailAboutDialogController = controller;

    body.appendChild(overlay);
    doc.addEventListener?.('keydown', onKeyDown, true);
    controller.focus();
    return controller;
};
