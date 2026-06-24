const waitForEventOnce = (mapEngine, eventName, timeoutMs) => new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (result) => {
        if (done) return;
        done = true;
        if (timer != null) clearTimeout(timer);
        try {
            mapEngine?.off?.(eventName, onEvent);
        } catch {
            // ignore listener cleanup failures
        }
        resolve(result);
    };
    const onEvent = () => finish('event');

    try {
        mapEngine?.on?.(eventName, onEvent);
    } catch {
        finish('unavailable');
        return;
    }

    timer = setTimeout(() => finish('timeout'), Math.max(0, Number(timeoutMs) || 0));
});

export const createMobileStartupSplashRuntime = ({
    mapEngine,
    splashView,
    isEnabled = () => false,
    waitTimeoutMs = 7000,
    minVisibleMs = 420,
    now = () => Date.now()
} = {}) => {
    const startedAt = now();
    let dismissed = false;

    const dismiss = async () => {
        if (dismissed) return false;
        dismissed = true;

        const elapsed = now() - startedAt;
        const delay = Math.max(0, minVisibleMs - elapsed);
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        splashView?.dismiss?.();
        return true;
    };

    const waitForBasemapThenDismiss = async () => {
        if (isEnabled() !== true) {
            splashView?.setEnabled?.(false);
            return dismiss();
        }

        splashView?.setEnabled?.(true);

        if (mapEngine?.isLoaded?.() === true && mapEngine?.areTilesLoaded?.() === true) {
            return dismiss();
        }

        await Promise.race([
            waitForEventOnce(mapEngine, 'idle', waitTimeoutMs),
            waitForEventOnce(mapEngine, 'error', waitTimeoutMs)
        ]);
        return dismiss();
    };

    return {
        dismiss,
        waitForBasemapThenDismiss
    };
};
