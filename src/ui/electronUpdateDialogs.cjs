const path = require('node:path');
const { realpathSync } = require('node:fs');
const { fileURLToPath } = require('node:url');

const UPDATE_DIALOG_TITLES = new Set([
    '发现新版本',
    '版本检查',
    '下载源未配置',
    '手动下载'
]);
const APP_PAGE_PATH = path.resolve(__dirname, '..', '..', 'index.html');

const isAppWindow = (window) => {
    try {
        if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false;
        const url = new URL(window.webContents.getURL());
        if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) return false;
        const pagePath = path.resolve(fileURLToPath(url));
        return pagePath === APP_PAGE_PATH
            || realpathSync(pagePath) === realpathSync(APP_PAGE_PATH);
    } catch {
        return false;
    }
};

const findAppWindow = (BrowserWindow) => {
    const focused = BrowserWindow.getFocusedWindow();
    if (isAppWindow(focused)) return focused;
    return BrowserWindow.getAllWindows().find(isAppWindow) || null;
};

const cancelResult = (options) => ({
    response: Number.isInteger(options.cancelId) ? options.cancelId : 0,
    checkboxChecked: options.checkboxChecked === true
});

const buildDialogScript = (options) => {
    // Release notes are data, never JavaScript source or HTML.
    const serialized = JSON.stringify(JSON.stringify(options))
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    return `import(new URL('./src/ui/updateDialogView.js', document.baseURI).href)
        .then(({ showUpdateDialog }) => showUpdateDialog(JSON.parse(${serialized})))`;
};

const showInAppWindow = (window, options) => new Promise((resolve) => {
    const webContents = window.webContents;
    let settled = false;
    const listeners = [];
    const finish = (outcome) => {
        if (settled) return;
        settled = true;
        for (const [emitter, name, listener] of listeners) {
            emitter.removeListener(name, listener);
        }
        resolve(outcome);
    };
    const cancel = () => finish({ result: cancelResult(options) });
    const listen = (emitter, name, listener) => {
        emitter.on(name, listener);
        listeners.push([emitter, name, listener]);
    };

    listen(window, 'closed', cancel);
    listen(webContents, 'destroyed', cancel);
    listen(webContents, 'render-process-gone', cancel);
    listen(webContents, 'did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame !== false && !isInPlace) cancel();
    });

    if (!isAppWindow(window)) {
        cancel();
        return;
    }

    try {
        Promise.resolve(webContents.executeJavaScript(buildDialogScript(options)))
            .then((result) => {
                const response = result?.response;
                const hasValidResponse = Number.isInteger(response)
                    && response >= 0
                    && (!Array.isArray(options.buttons) || response < options.buttons.length);
                finish({ result: hasValidResponse ? result : cancelResult(options) });
            })
            .catch(() => finish({ failed: true }));
    } catch {
        finish({ failed: true });
    }
});

// Desktop presentation adapter only: update decisions remain in the caller.
const createElectronUpdateDialogs = ({ nativeDialog, BrowserWindow }) => ({
    ...nativeDialog,
    showMessageBox(...args) {
        const options = args.length > 1 ? args[1] : args[0];
        const showNative = () => nativeDialog.showMessageBox(...args);
        if (!UPDATE_DIALOG_TITLES.has(options?.title)) return showNative();

        const window = findAppWindow(BrowserWindow);
        if (!window) return showNative();

        return showInAppWindow(window, options).then((outcome) => {
            if (outcome.result) return outcome.result;
            // Closing, navigating or crashing must act as cancellation, not open another dialog.
            if (!isAppWindow(window)) return cancelResult(options);
            return showNative();
        });
    }
});

module.exports = { createElectronUpdateDialogs };
