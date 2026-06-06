import assert from 'node:assert/strict';

import {
    createJourneyPlanBrief,
    createJourneyTrainPathRow
} from '../src/features/search/journeyPlanRenderer.js';

const createElement = (tag, className, attrs = {}) => ({
    tag,
    className: className || '',
    textContent: Object.prototype.hasOwnProperty.call(attrs, 'text') ? String(attrs.text) : '',
    style: {},
    children: [],
    appendChild(child) {
        this.children.push(child);
    }
});

globalThis.document = {
    createTextNode: (text) => ({
        nodeType: 3,
        textContent: String(text)
    })
};

const collectText = (node) => [
    node?.textContent || '',
    ...(Array.isArray(node?.children) ? node.children.flatMap((child) => collectText(child)) : [])
].join('');

const brief = createJourneyPlanBrief({
    createElement,
    displayPlan: { durationMs: 600000, arrivalMs: 3600000, transfers: 0 },
    formatArrival: () => '10:00',
    formatDuration: () => '10 min',
    normalizeText: (value) => String(value ?? '').trim(),
    row: {
        tagLabels: ['shortest'],
        fareEstimate: { totalAmount: 613 }
    }
});

const tags = brief.children.find((child) => child.className === 'journey-plan-tags');
assert.ok(tags);

const fare = tags.children.find((child) => child.className === 'journey-plan-fare');
assert.ok(fare);
assert.equal(fare.textContent, 'JPY 613');

const trainRow = createJourneyTrainPathRow({
    createElement,
    directionText: '渋谷',
    lineColor: '#8f73e6',
    lineText: '东京地下铁半藏门线',
    stationCount: 14,
    typeText: '直通'
});
const trainText = collectText(trainRow);
assert.equal(trainText.includes('直通'), false);
assert.equal(trainText.includes('乘坐'), false);
assert.equal(trainText.includes('14站'), true);

console.log('journey plan renderer fare smoke ok');
