export const createMobileStartupSplashRuntime = ({
    mapEngine,
    splashView,
    isEnabled = () => false,
    waitTimeoutMs = 7000
} = {}) => {
    let dismissed = false;

    const dismiss = () => {
        if (dismissed) return false;
        dismissed = true;

        splashView?.dismiss?.();
        return true;
    };

    const waitForMapThenDismiss = async (sourceIds) => {
        if (isEnabled() !== true) {
            splashView?.setEnabled?.(false);
            return dismiss();
        }

        splashView?.setEnabled?.(true);

        await new Promise((resolve) => {
            const finish = () => {
                clearTimeout(timer);
                mapEngine.off('render', onRender);
                resolve();
            };
            // 等首屏源完成后的绘制帧，不让后台源或全图 idle 阻塞进入主页面。
            const onRender = () => {
                if (sourceIds.every((id) => mapEngine.getSource(id) && mapEngine.isSourceLoaded(id))) {
                    finish();
                }
            };
            const timer = setTimeout(finish, waitTimeoutMs);
            mapEngine.on('render', onRender);
            mapEngine.requestRender();
        });
        return dismiss();
    };

    return {
        dismiss,
        waitForMapThenDismiss
    };
};
