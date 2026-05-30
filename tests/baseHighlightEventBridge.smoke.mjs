import assert from 'node:assert/strict';
import {
    BASE_HIGHLIGHT_CLEARED_EVENT,
    BASE_HIGHLIGHT_UPDATED_EVENT,
    createBaseHighlightEventBridge
} from '../src/features/highlight/baseHighlightEventBridge.js';

class TestCustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
    }
}

const PreviousCustomEvent = globalThis.CustomEvent;
globalThis.CustomEvent = TestCustomEvent;

try {
    const events = [];
    const bridge = createBaseHighlightEventBridge({
        target: {
            dispatchEvent: (event) => {
                events.push(event);
                return true;
            }
        }
    });

    const detail = {
        kind: 'multi-base',
        lineIds: ['A', 'S'],
        selectedLineId: null,
        selectedCompany: null,
        selectedStationId: null
    };

    assert.equal(bridge.update(detail), true);
    assert.equal(bridge.clear(), true);

    assert.equal(events[0].type, BASE_HIGHLIGHT_UPDATED_EVENT);
    assert.deepEqual(events[0].detail, detail);
    assert.equal(events[1].type, BASE_HIGHLIGHT_CLEARED_EVENT);
    assert.equal(events[1].detail, undefined);

    assert.equal(createBaseHighlightEventBridge({ target: null }).update(detail), false);
} finally {
    if (PreviousCustomEvent === undefined) {
        delete globalThis.CustomEvent;
    } else {
        globalThis.CustomEvent = PreviousCustomEvent;
    }
}

console.log('base highlight event bridge smoke ok');
