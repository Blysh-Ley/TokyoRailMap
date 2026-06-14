import assert from 'node:assert/strict';

import { installAndroidBackRuntime } from '../src/app/androidBackRuntime.js';

{
    let panelCalls = 0;
    const target = {};
    const runtime = installAndroidBackRuntime({
        target,
        handleBackIntent: () => {
            panelCalls += 1;
            return true;
        }
    });

    assert.equal(runtime.installed, false);
    assert.equal(await runtime.handleBackButton({ canGoBack: false }), 'panel');
    assert.equal(panelCalls, 1);
    assert.equal(await runtime.destroy(), false);
}

{
    const events = [];
    const target = {
        history: {
            back: () => events.push('history')
        },
        Capacitor: {
            Plugins: {
                App: {
                    addListener(name, listener) {
                        events.push(`listen:${name}`);
                        this.listener = listener;
                        return {
                            remove: () => events.push('remove')
                        };
                    },
                    minimizeApp: () => events.push('minimize')
                }
            }
        }
    };

    const runtime = installAndroidBackRuntime({
        target,
        handleBackIntent: () => false
    });

    assert.equal(runtime.installed, true);
    assert.deepEqual(events, ['listen:backButton']);
    assert.equal(await runtime.handleBackButton({ canGoBack: true }), 'history');
    assert.equal(await runtime.handleBackButton({ canGoBack: false }), 'minimize');
    assert.deepEqual(events, ['listen:backButton', 'history', 'minimize']);
    assert.equal(await runtime.destroy(), true);
    assert.deepEqual(events, ['listen:backButton', 'history', 'minimize', 'remove']);
}

console.log('android back runtime smoke ok');
