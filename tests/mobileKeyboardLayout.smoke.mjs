import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    createMobileKeyboardViewportService,
    NATIVE_KEYBOARD_VISIBILITY_EVENT
} from '../src/services/mobileKeyboardViewportService.js';
import { createStore } from '../src/store/appStore.js';
import { mobileKeyboardVisibilitySet } from '../src/store/actions.js';
import { createMobileKeyboardLayoutView } from '../src/ui/mobileKeyboardLayoutView.js';

const createEventTarget = () => {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
        },
        dispatch(type, event = {}) {
            for (const listener of listeners.get(type) || []) listener(event);
        }
    };
};

const createHarness = ({ mobile = true, visualViewport = true } = {}) => {
    const frames = [];
    const docEvents = createEventTarget();
    const winEvents = createEventTarget();
    const viewportEvents = createEventTarget();
    const viewport = visualViewport ? {
        ...viewportEvents,
        height: 800,
        width: 390,
        scale: 1
    } : null;
    const doc = {
        ...docEvents,
        activeElement: null,
        documentElement: { dataset: {} },
        body: { dataset: {} }
    };
    const win = {
        ...winEvents,
        innerHeight: 800,
        innerWidth: 390,
        visualViewport: viewport,
        requestAnimationFrame(callback) {
            frames.push(callback);
            return frames.length;
        },
        cancelAnimationFrame() {}
    };
    const store = createStore();
    const view = createMobileKeyboardLayoutView({ doc, store });
    const service = createMobileKeyboardViewportService({
        doc,
        win,
        isMobile: () => mobile,
        onChange: (visible) => store.dispatch(mobileKeyboardVisibilitySet(visible))
    });
    const flush = () => {
        while (frames.length) frames.shift()();
    };
    return { doc, flush, service, store, view, viewport, win };
};

const searchInput = {
    tagName: 'INPUT',
    type: 'search',
    disabled: false,
    readOnly: false
};

{
    const harness = createHarness();
    harness.doc.activeElement = searchInput;
    harness.doc.dispatch('focusin', { target: searchInput });
    harness.flush();
    assert.equal(harness.store.getState().mobileKeyboardVisible, false);

    harness.viewport.height = 480;
    harness.viewport.dispatch('resize');
    harness.flush();
    assert.equal(harness.store.getState().mobileKeyboardVisible, true);
    assert.equal(harness.doc.documentElement.dataset.mobileKeyboardVisible, '1');
    assert.equal(harness.doc.body.dataset.mobileKeyboardVisible, '1');

    harness.viewport.height = 800;
    harness.viewport.dispatch('resize');
    harness.flush();
    assert.equal(harness.store.getState().mobileKeyboardVisible, false);
    assert.equal('mobileKeyboardVisible' in harness.doc.documentElement.dataset, false);
    assert.equal('mobileKeyboardVisible' in harness.doc.body.dataset, false);

    harness.service.destroy();
    harness.viewport.height = 480;
    harness.viewport.dispatch('resize');
    harness.flush();
    assert.equal(harness.store.getState().mobileKeyboardVisible, false);
    harness.view.destroy();
}

{
    const harness = createHarness({ mobile: false });
    harness.doc.activeElement = searchInput;
    harness.doc.dispatch('focusin', { target: searchInput });
    harness.viewport.height = 480;
    harness.viewport.dispatch('resize');
    harness.flush();
    assert.equal(harness.store.getState().mobileKeyboardVisible, false);
    harness.service.destroy();
    harness.view.destroy();
}

{
    const harness = createHarness({ visualViewport: false });
    harness.doc.activeElement = searchInput;
    harness.doc.dispatch('focusin', { target: searchInput });
    harness.win.innerHeight = 480;
    harness.win.dispatch('resize');
    harness.flush();
    assert.equal(harness.store.getState().mobileKeyboardVisible, true);
    harness.service.destroy();
    harness.view.destroy();
}

{
    const harness = createHarness();
    harness.win.dispatch(NATIVE_KEYBOARD_VISIBILITY_EVENT, { detail: { visible: true } });
    harness.flush();
    assert.equal(harness.store.getState().mobileKeyboardVisible, true);
    harness.win.dispatch(NATIVE_KEYBOARD_VISIBILITY_EVENT, { detail: { visible: false } });
    harness.flush();
    assert.equal(harness.store.getState().mobileKeyboardVisible, false);
    harness.service.destroy();
    harness.view.destroy();
}

{
    const store = createStore();
    store.dispatch(mobileKeyboardVisibilitySet(true));
    store.dispatch({ type: 'selection/commitLine', payload: { selectedLineId: 'L1' } });
    assert.equal(store.getState().mobileKeyboardVisible, true);
}

const cssSource = readFileSync('src/styles/app.css', 'utf8');
assert.match(
    cssSource,
    /--mobile-bottom-nav-clearance:\s*calc\(env\(safe-area-inset-bottom,\s*0px\) \+ 76px\)/
);
assert.match(
    cssSource,
    /--mobile-search-panel-bottom:\s*calc\(env\(safe-area-inset-bottom,\s*0px\) \+ 70px\)/
);
assert.match(
    cssSource,
    /data-mobile-ui='1'\]\[data-mobile-keyboard-visible='1'[\s\S]*--mobile-bottom-nav-clearance:\s*calc\(env\(safe-area-inset-bottom,\s*0px\) \+ 8px\)[\s\S]*--mobile-search-panel-bottom:\s*calc\(env\(safe-area-inset-bottom,\s*0px\) \+ 8px\)/
);
assert.match(
    cssSource,
    /data-mobile-keyboard-visible='1'\] \.mobile-bottom-nav[\s\S]*display:\s*none !important;[\s\S]*pointer-events:\s*none;/
);

const appSource = readFileSync('src/app.js', 'utf8');
assert.match(appSource, /createMobileKeyboardViewportService/);
assert.match(appSource, /createMobileKeyboardLayoutView\(\{ store: appStore \}\)/);
assert.match(appSource, /appStore\.dispatch\(mobileKeyboardVisibilitySet\(visible\)\)/);

const nativeBridgeSource = readFileSync('ios/App/App/NativeBridgeViewController.swift', 'utf8');
assert.match(nativeBridgeSource, /keyboardWillShowNotification/);
assert.match(nativeBridgeSource, /keyboardWillChangeFrameNotification/);
assert.match(nativeBridgeSource, /keyboardWillHideNotification/);
assert.match(nativeBridgeSource, /hostView\.accessibilityElementsHidden = hidden/);
assert.match(nativeBridgeSource, /tokyoRail:nativeKeyboardVisibility/);

console.log('mobile keyboard layout smoke ok');
