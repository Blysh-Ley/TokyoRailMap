import assert from 'node:assert/strict';

import { collectLinePrintPayloads } from '../src/features/panel/panelPrintRequestController.js';

const fakeLineEl = {
    getAttribute(name) {
        if (name === 'data-station-name') return 'Tokyo';
        return '';
    },
    querySelector(selector) {
        const htmlBySelector = {
            '[data-line-suffix-row]': '<div data-line-suffix-row>suffix</div>',
            '[data-station-info]': '<div data-station-info>station</div>',
            '.panel-line-header': '<div class="panel-line-header">header</div>'
        };
        const outerHTML = htmlBySelector[selector] || '';
        return outerHTML ? { outerHTML } : null;
    },
    querySelectorAll(selector) {
        if (selector !== '[data-dir-toggle][data-dir-key]') return [];
        return [
            { getAttribute: (name) => (name === 'data-dir-key' ? 'Outbound' : '') },
            { getAttribute: (name) => (name === 'data-dir-key' ? 'Inbound' : '') }
        ];
    }
};

const payloads = new Map([
    ['L1||Outbound', { dirKey: 'Outbound', rows: [1] }],
    ['L1||Inbound', { dirKey: 'Inbound', rows: [2] }]
]);

const result = collectLinePrintPayloads({
    lineEl: fakeLineEl,
    lineId: 'L1',
    dirPrintPayloadByKey: payloads,
    makeLineDirKey: (lineId, dirKey) => `${lineId}||${dirKey}`
});

assert.equal(result.lineId, 'L1');
assert.equal(result.dirs.length, 2);
assert.equal(result.dirs[0].stationName, 'Tokyo');
assert.equal(result.dirs[0].lineHeaderHtml, '<div class="panel-line-header">header</div>');
assert.equal(result.dirs[1].lineSuffixHtml, '<div data-line-suffix-row>suffix</div>');

console.log('panel print request controller smoke ok');
