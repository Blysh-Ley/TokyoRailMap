import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panelSource = readFileSync(new URL('../src/features/panel/panel.js', import.meta.url), 'utf8');

const renderTripDetailStart = panelSource.indexOf('const renderTripDetail = async');
assert.ok(renderTripDetailStart >= 0, 'renderTripDetail should exist');

const scheduleCallIndex = panelSource.indexOf('scheduleTripPreview(buildPanelTripPreviewScheduleArgs', renderTripDetailStart);
assert.ok(scheduleCallIndex > renderTripDetailStart, 'renderTripDetail should schedule trip preview payloads');

const beforeSchedule = panelSource.slice(renderTripDetailStart, scheduleCallIndex);
assert.match(
    beforeSchedule,
    /const\s+typeName\s*=\s*getTripTypeName\(trip,\s*trainTypesIndex\)/,
    'trip preview scheduling should define typeName before building payload'
);
assert.match(
    beforeSchedule,
    /const\s+typeColor\s*=\s*getTripTypeColor\(trip,\s*trainTypeColorIndex\)/,
    'trip preview scheduling should define typeColor before building payload'
);

console.log('panel trip detail preview scheduling smoke ok');
