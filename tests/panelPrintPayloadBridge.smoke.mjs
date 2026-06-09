import assert from 'node:assert/strict';

import { installPanelTimetablePrintPayloadBuilder } from '../src/features/panel/panelPrintPayloadBridge.js';

const buildLineStationPrintPayload = async () => 'payload';
const createLineStationPrintPayloadSession = async () => 'session';

const windowRef = {};
assert.equal(
    installPanelTimetablePrintPayloadBuilder({
        windowRef,
        buildLineStationPrintPayload,
        createLineStationPrintPayloadSession
    }),
    true
);

assert.deepEqual(
    windowRef.TokyoRailPanelTimetablePrintPayloadBuilder,
    {
        buildLineStationPrintPayload,
        createLineStationPrintPayloadSession
    }
);

assert.equal(
    installPanelTimetablePrintPayloadBuilder({
        windowRef: null,
        buildLineStationPrintPayload,
        createLineStationPrintPayloadSession
    }),
    false
);

console.log('panel print payload bridge smoke ok');
