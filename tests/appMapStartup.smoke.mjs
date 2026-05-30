import assert from 'node:assert/strict';

import { bindMapStartup } from '../src/app/mapStartup.js';

const createEmitter = () => {
    const listeners = new Map();
    const onceListeners = new Map();
    return {
        on(eventName, listener) {
            listeners.set(eventName, listener);
        },
        once(eventName, listener) {
            onceListeners.set(eventName, listener);
        },
        emit(eventName) {
            listeners.get(eventName)?.();
            const onceListener = onceListeners.get(eventName);
            if (onceListener) {
                onceListeners.delete(eventName);
                onceListener();
            }
        },
        hasOnce(eventName) {
            return onceListeners.has(eventName);
        }
    };
};

{
    const events = createEmitter();
    const calls = [];
    const map = { loaded: () => true };
    const startup = bindMapStartup({
        map,
        mapEngine: events,
        start: (reason) => calls.push(reason),
        setTimeoutFn: () => {}
    });

    events.emit('load');
    events.emit('error');
    assert.equal(startup.isStarted(), true);
    assert.deepEqual(calls, ['load']);
}

{
    const events = createEmitter();
    const calls = [];
    let ready = false;
    const map = {
        loaded: () => false,
        isStyleLoaded: () => ready
    };
    const startup = bindMapStartup({
        map,
        mapEngine: events,
        start: (reason) => calls.push(reason),
        setTimeoutFn: () => {}
    });

    events.emit('load');
    events.emit('error');
    assert.equal(startup.isQueued(), true);
    assert.equal(events.hasOnce('styledata'), true);
    ready = true;
    events.emit('styledata');
    assert.equal(startup.isStarted(), true);
    assert.deepEqual(calls, ['load']);
}

{
    const events = createEmitter();
    const calls = [];
    let timeoutCallback = null;
    let ready = false;
    const map = {
        loaded: () => ready,
        isStyleLoaded: () => false
    };
    const startup = bindMapStartup({
        map,
        mapEngine: events,
        start: (reason) => calls.push(reason),
        setTimeoutFn: (callback, timeoutMs) => {
            assert.equal(timeoutMs, 3000);
            timeoutCallback = callback;
        }
    });

    assert.equal(typeof timeoutCallback, 'function');
    timeoutCallback();
    assert.equal(startup.isQueued(), true);
    ready = true;
    events.emit('styledata');
    timeoutCallback();
    assert.deepEqual(calls, ['timeout']);
}

console.log('app map startup smoke ok');
