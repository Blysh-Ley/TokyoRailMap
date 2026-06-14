const getCapacitorAppPlugin = (target) => {
    const capacitor = target?.Capacitor;
    return capacitor?.Plugins?.App || capacitor?.App || null;
};

export const installAndroidBackRuntime = ({
    target = globalThis,
    handleBackIntent,
    onUnhandledBack
} = {}) => {
    const appPlugin = getCapacitorAppPlugin(target);

    const handleBackButton = async (event = {}) => {
        if (typeof handleBackIntent === 'function' && handleBackIntent({ source: 'android-back', event }) === true) {
            return 'panel';
        }

        if (event?.canGoBack === true && typeof target?.history?.back === 'function') {
            target.history.back();
            return 'history';
        }

        if (appPlugin && typeof appPlugin.minimizeApp === 'function') {
            await appPlugin.minimizeApp();
            return 'minimize';
        }

        if (typeof onUnhandledBack === 'function') {
            onUnhandledBack(event);
            return 'unhandled-callback';
        }

        return 'unhandled';
    };

    if (!appPlugin || typeof appPlugin.addListener !== 'function') {
        return Object.freeze({
            installed: false,
            handleBackButton,
            destroy: async () => false
        });
    }

    let listenerHandle = null;
    const listenerReady = Promise.resolve(appPlugin.addListener('backButton', (event) => {
        handleBackButton(event).catch(() => null);
    })).then((handle) => {
        listenerHandle = handle || null;
        return listenerHandle;
    });

    return Object.freeze({
        installed: true,
        handleBackButton,
        destroy: async () => {
            const handle = listenerHandle || await listenerReady.catch(() => null);
            if (handle && typeof handle.remove === 'function') {
                await handle.remove();
                return true;
            }
            return false;
        }
    });
};
