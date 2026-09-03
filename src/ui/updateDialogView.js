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

const clampProgressPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

const formatUpdateBytes = (value) => {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatUpdateSpeed = (value) => {
    const bytesPerSecond = Math.max(0, Number(value) || 0);
    return bytesPerSecond > 0 ? `${formatUpdateBytes(bytesPerSecond)}/s` : '正在连接…';
};

const getUpdateProgressStatus = (phase) => {
    if (phase === 'verifying') return '下载完成，正在校验安装包…';
    if (phase === 'installing') return '安装包已准备完成，正在打开系统安装程序…';
    if (phase === 'cancelling') return '正在取消更新…';
    return '正在下载更新，请保持应用在前台';
};

export const showUpdateDownloadProgress = ({
    latestVersion = '',
    totalBytes = 0,
    onCancel = null
} = {}, { doc = globalThis.document } = {}) => {
    if (!doc?.body) {
        return Object.freeze({
            close: () => false,
            update: () => false
        });
    }

    const previouslyActive = doc.activeElement;
    const dialog = createEl(doc, 'dialog', 'update-dialog update-download-progress-dialog');
    dialog.dataset.updateDialogLocked = '1';
    dialog.setAttribute('aria-label', '正在下载更新');
    dialog.setAttribute('aria-modal', 'true');

    const header = createEl(doc, 'header', 'update-dialog-header');
    const mark = createEl(doc, 'span', 'update-dialog-mark', '↓');
    mark.setAttribute('aria-hidden', 'true');
    const heading = createEl(doc, 'div', 'update-dialog-heading');
    heading.appendChild(createEl(doc, 'p', 'update-dialog-eyebrow', '东京铁路图 · 版本更新'));
    heading.appendChild(createEl(doc, 'h2', 'update-dialog-title', latestVersion
        ? `正在下载 v${String(latestVersion).replace(/^v/i, '')}`
        : '正在下载更新'));
    header.append(mark, heading);

    const body = createEl(doc, 'div', 'update-dialog-body update-download-progress-body');
    const progressHead = createEl(doc, 'div', 'update-download-progress-head');
    const status = createEl(doc, 'p', 'update-download-progress-status');
    status.setAttribute('aria-live', 'polite');
    const percentText = createEl(doc, 'strong', 'update-download-progress-percent', '0%');
    progressHead.append(status, percentText);

    const track = createEl(doc, 'div', 'update-download-progress-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', '0');
    const bar = createEl(doc, 'span', 'update-download-progress-bar');
    track.appendChild(bar);

    const stats = createEl(doc, 'div', 'update-download-progress-stats');
    const createStat = (label) => {
        const item = createEl(doc, 'div', 'update-download-progress-stat');
        item.appendChild(createEl(doc, 'span', 'update-download-progress-stat-label', label));
        const value = createEl(doc, 'strong', 'update-download-progress-stat-value');
        item.appendChild(value);
        stats.appendChild(item);
        return value;
    };
    const sizeValue = createStat('安装包进度');
    const speedValue = createStat('下载速度');
    body.append(progressHead, track, stats);

    const footer = createEl(doc, 'footer', 'update-dialog-actions');
    const cancelButton = createEl(doc, 'button', 'update-dialog-action is-cancel update-download-cancel', '取消更新');
    cancelButton.type = 'button';
    footer.appendChild(cancelButton);
    dialog.append(header, body, footer);

    let closed = false;
    let cancelling = false;
    let lastProgress = {
        phase: 'downloading',
        downloadedBytes: 0,
        totalBytes: Math.max(0, Number(totalBytes) || 0),
        bytesPerSecond: 0,
        percent: 0
    };

    const update = (progress = {}) => {
        if (closed) return false;
        lastProgress = { ...lastProgress, ...progress };
        const downloaded = Math.max(0, Number(lastProgress.downloadedBytes) || 0);
        const total = Math.max(0, Number(lastProgress.totalBytes) || 0);
        const derivedPercent = total > 0 ? (downloaded / total) * 100 : 0;
        const percent = clampProgressPercent(Number.isFinite(Number(lastProgress.percent))
            ? lastProgress.percent
            : derivedPercent);
        const phase = String(lastProgress.phase || 'downloading');
        dialog.dataset.updateDownloadPhase = phase;
        status.textContent = getUpdateProgressStatus(phase);
        percentText.textContent = `${Math.round(percent)}%`;
        track.setAttribute('aria-valuenow', String(Math.round(percent)));
        bar.style.width = `${percent}%`;
        sizeValue.textContent = total > 0
            ? `${formatUpdateBytes(downloaded)} / ${formatUpdateBytes(total)}`
            : formatUpdateBytes(downloaded);
        speedValue.textContent = phase === 'downloading'
            ? formatUpdateSpeed(lastProgress.bytesPerSecond)
            : '—';
        return true;
    };

    const close = () => {
        if (closed) return false;
        closed = true;
        dialog.close();
        dialog.remove();
        previouslyActive?.focus?.({ preventScroll: true });
        return true;
    };

    cancelButton.addEventListener('click', async () => {
        if (cancelling || closed) return;
        cancelling = true;
        cancelButton.disabled = true;
        cancelButton.textContent = '正在取消…';
        update({ phase: 'cancelling', bytesPerSecond: 0 });
        try {
            if (typeof onCancel === 'function') await onCancel();
            close();
        } catch (error) {
            cancelling = false;
            cancelButton.disabled = false;
            cancelButton.textContent = '取消更新';
            status.textContent = String(error?.message || '暂时无法取消，请稍后重试');
        }
    });
    dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
    });
    dialog.addEventListener('cancel', (event) => event.preventDefault());

    doc.body.appendChild(dialog);
    dialog.showModal();
    update(lastProgress);
    cancelButton.focus({ preventScroll: true });
    return Object.freeze({ close, update });
};

export const dismissUpdateDialog = ({ doc = globalThis.document } = {}) => {
    const dialog = Array.from(doc?.querySelectorAll?.('.update-dialog[open]') || []).at(-1);
    if (!dialog) return false;
    if (dialog.dataset?.updateDialogLocked === '1') return true;
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
    alert: (message) => showUpdateDialog({ message, buttons: ['确定'] }, { doc }),
    showDownloadProgress: (options = {}) => showUpdateDownloadProgress(options, { doc })
});
