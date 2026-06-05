import assert from 'node:assert/strict';

import { createJourneyPlanBrief } from '../src/features/search/journeyPlanRenderer.js';

const createElement = (tag, className, attrs = {}) => ({
    tag,
    className: className || '',
    textContent: Object.prototype.hasOwnProperty.call(attrs, 'text') ? String(attrs.text) : '',
    children: [],
    appendChild(child) {
        this.children.push(child);
    }
});

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

console.log('journey plan renderer fare smoke ok');
