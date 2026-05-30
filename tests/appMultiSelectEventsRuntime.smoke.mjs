import assert from 'node:assert/strict';

import {
    bindMultiSelectLayerCommandRuntime,
    bindMultiSelectModeEvents,
    createMultiSelectLayersUpdatedEmitter,
    MULTI_SELECT_EVENT,
    MULTI_SELECT_LAYERS_COMMAND_EVENT,
    MULTI_SELECT_LAYERS_EVENT,
    MULTI_SELECT_SHOW_ICONS_EVENT,
    registerMultiSelectModeInternalApi,
    setMultiSelectGlobalEnabled
} from '../src/app/multiSelectEventsRuntime.js';

const createEventTarget = () => {
    const listeners = new Map();
    const dispatched = [];
    class TestCustomEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    }

    return {
        CustomEvent: TestCustomEvent,
        dispatched,
        addEventListener: (eventName, listener) => {
            listeners.set(eventName, listener);
        },
        dispatchEvent: (event) => {
            dispatched.push(event);
            return true;
        },
        emit: (eventName, detail) => {
            listeners.get(eventName)?.({ detail });
        }
    };
};

{
    const target = createEventTarget();
    const emitLayersUpdated = createMultiSelectLayersUpdatedEmitter({
        target,
        getEnabled: () => true,
        getItems: () => [{ id: 'line:a' }],
        now: () => 123
    });

    assert.equal(emitLayersUpdated(), true);
    assert.equal(target.dispatched.length, 1);
    assert.equal(target.dispatched[0].type, MULTI_SELECT_LAYERS_EVENT);
    assert.deepEqual(target.dispatched[0].detail, {
        ts: 123,
        enabled: true,
        items: [{ id: 'line:a' }]
    });
}

{
    const target = createEventTarget();
    const calls = [];

    assert.equal(setMultiSelectGlobalEnabled(target, true), true);
    assert.equal(target.__TokyoRailMultiSelectEnabled, true);

    assert.equal(registerMultiSelectModeInternalApi({
        target,
        setEnabledSilent: (enabled) => calls.push(['silent', enabled])
    }), true);

    target.__TokyoRailMultiSelectModeInternalAPI.setEnabledSilent('truthy');
    assert.deepEqual(calls, [['silent', false]]);
}

{
    const target = createEventTarget();
    const calls = [];
    const binding = bindMultiSelectModeEvents({
        target,
        getInitialEnabled: () => true,
        resetEnabledState: (enabled) => calls.push(['reset', enabled]),
        applyEnabled: (enabled) => calls.push(['apply', enabled]),
        onShowIconsChanged: () => calls.push(['show-icons'])
    });

    assert.deepEqual(binding, { initialEnabled: true });
    target.emit(MULTI_SELECT_EVENT, { enabled: false });
    target.emit(MULTI_SELECT_SHOW_ICONS_EVENT);
    assert.deepEqual(calls, [
        ['reset', false],
        ['apply', true],
        ['apply', false],
        ['show-icons']
    ]);
}

{
    const target = createEventTarget();
    const calls = [];
    bindMultiSelectLayerCommandRuntime({
        target,
        emitLayersUpdated: () => calls.push(['sync']),
        runCommand: (action, itemId) => {
            calls.push(['run', action, itemId]);
            return true;
        }
    });

    assert.equal(target.__TokyoRailMultiSelectLayerControl.runCommand('remove', 'base:1'), true);
    target.__TokyoRailMultiSelectLayerControl.requestSync();
    target.emit(MULTI_SELECT_LAYERS_COMMAND_EVENT, { action: ' toggle-visibility ', id: ' trip:2 ' });
    target.emit(MULTI_SELECT_LAYERS_COMMAND_EVENT, { action: '', id: 'base:3' });

    assert.deepEqual(calls, [
        ['run', 'remove', 'base:1'],
        ['sync'],
        ['run', 'toggle-visibility', 'trip:2']
    ]);
}

console.log('app multi-select events runtime smoke ok');
