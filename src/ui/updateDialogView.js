// Presentation only: keep the existing button indexes and confirmation results.
const createEl = (doc, tag, className, text = '') => {
    const el = doc.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
};

const readDialogContent = ({ title = '版本更新', message = '', detail = '' }) => {
    const [messageHead, ...messageNotes] = String(message).split(/\r?\n\s*\r?\n/);
    const lines = messageHead.split(/\r?\n/);
    const latest = lines.find((line) => line.startsWith('发现新版本：'));
    const current = lines.find((line) => line.startsWith('当前版本：'));
    const upToDate = lines[0] === '已是最新版本';
    const hint = '国内网络请选择手动下载';
    const notes = latest
        ? [messageNotes.join('\n\n'), String(detail).replace(new RegExp(`\\s*${hint}$`), '')].filter(Boolean).join('\n\n')
        : '';
    const description = lines.filter((line) => line !== latest && line !== current && (!upToDate || line !== lines[0]));
    if (!latest && messageNotes.length) description.push('', messageNotes.join('\n\n'));
    if (String(detail).endsWith(hint)) description.push(hint);
    if (!latest && detail) description.push(detail);

    return {
        title: latest ? '发现新版本' : upToDate ? '已是最新版本' : title,
        current: current?.replace('当前版本：', '').replace(/^v/i, '').trim(),
        latest: latest?.replace('发现新版本：', '').replace(/^v/i, '').trim(),
        description: description.join('\n').replace(
            '是否从 GitHub 下载并安装更新？\n下载完成后将打开 Android 系统安装界面。',
            '国内环境需手动下载安装包'
        ),
        notes,
        upToDate
    };
};

export const showUpdateDialog = (options = {}, { doc = globalThis.document } = {}) => {
    const buttons = options.buttons || ['确定'];
    const cancelId = options.cancelId ?? buttons.length - 1;
    const defaultId = options.defaultId ?? 0;
    if (!doc?.body) return Promise.resolve({ response: cancelId });

    const content = readDialogContent(options);
    const previouslyActive = doc.activeElement;
    const dialog = createEl(doc, 'dialog', 'update-dialog');
    dialog.setAttribute('aria-label', content.title);
    dialog.setAttribute('aria-modal', 'true');

    const header = createEl(doc, 'header', 'update-dialog-header');
    const mark = createEl(doc, 'span', 'update-dialog-mark', content.upToDate ? '✓' : '↑');
    mark.setAttribute('aria-hidden', 'true');
    const heading = createEl(doc, 'div', 'update-dialog-heading');
    heading.appendChild(createEl(doc, 'p', 'update-dialog-eyebrow', '东京铁路图 · 版本更新'));
    heading.appendChild(createEl(doc, 'h2', 'update-dialog-title', content.title));
    const close = createEl(doc, 'button', 'update-dialog-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭版本更新');
    header.append(mark, heading, close);

    const body = createEl(doc, 'div', 'update-dialog-body');
    if (content.current || content.latest) {
        const versions = createEl(doc, 'div', 'update-dialog-versions');
        const appendVersion = (label, version, className = '') => {
            const item = createEl(doc, 'div', `update-dialog-version ${className}`);
            item.appendChild(createEl(doc, 'span', 'update-dialog-version-label', label));
            item.appendChild(createEl(doc, 'strong', 'update-dialog-version-value', `v${version}`));
            versions.appendChild(item);
        };
        if (content.current) appendVersion('当前版本', content.current);
        if (content.current && content.latest) {
            const arrow = createEl(doc, 'span', 'update-dialog-version-arrow', '→');
            arrow.setAttribute('aria-hidden', 'true');
            versions.appendChild(arrow);
        }
        if (content.latest) appendVersion('可用版本', content.latest, 'is-latest');
        body.appendChild(versions);
    }
    if (content.description) body.appendChild(createEl(doc, 'p', 'update-dialog-description', content.description));
    if (content.notes) {
        const details = createEl(doc, 'details', 'update-dialog-notes');
        const summary = createEl(doc, 'summary', 'update-dialog-notes-toggle');
        summary.appendChild(createEl(doc, 'span', 'update-dialog-notes-label', '更新内容'));
        const expandedHint = createEl(doc, 'span', 'update-dialog-notes-hint');
        expandedHint.setAttribute('aria-hidden', 'true');
        summary.appendChild(expandedHint);
        details.append(summary, createEl(doc, 'div', 'update-dialog-notes-content', content.notes));
        body.appendChild(details);
    }

    const footer = createEl(doc, 'footer', 'update-dialog-actions');
    dialog.append(header, body, footer);

    return new Promise((resolve) => {
        let settled = false;
        const finish = (response) => {
            if (settled) return;
            settled = true;
            dialog.close();
            dialog.remove();
            previouslyActive?.focus?.({ preventScroll: true });
            resolve({ response });
        };
        buttons.forEach((label, index) => {
            const button = createEl(doc, 'button', 'update-dialog-action', label);
            button.type = 'button';
            if (index === defaultId) button.classList.add('is-primary');
            if (index === cancelId && buttons.length > 1) button.classList.add('is-cancel');
            button.addEventListener('click', () => finish(index));
            footer.appendChild(button);
        });
        close.addEventListener('click', () => finish(cancelId));
        dialog.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            finish(cancelId);
        });
        dialog.addEventListener('cancel', (event) => {
            event.preventDefault();
            finish(cancelId);
        });
        dialog.addEventListener('close', () => finish(cancelId));
        // The HTML dialog keeps keyboard focus and background clicks inside the UI.
        doc.body.appendChild(dialog);
        dialog.showModal();
        footer.children[defaultId]?.focus({ preventScroll: true });
    });
};

export const dismissUpdateDialog = ({ doc = globalThis.document } = {}) => {
    const dialog = Array.from(doc?.querySelectorAll?.('.update-dialog[open]') || []).at(-1);
    if (!dialog) return false;
    dialog.close();
    return true;
};

export const createUpdateDialogUi = ({ doc = globalThis.document } = {}) => ({
    confirm: async (message) => {
        const result = await showUpdateDialog({
            message,
            buttons: ['确定', '取消'],
            defaultId: 0,
            cancelId: 1
        }, { doc });
        return result.response === 0;
    },
    alert: (message) => showUpdateDialog({ message, buttons: ['确定'] }, { doc })
});
