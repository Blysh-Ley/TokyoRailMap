import assert from 'node:assert/strict';

const {
    renderPanelTripDetailStationCellHtml
} = await import('../src/features/panel/panelTripDetailRender.js');

const html = renderPanelTripDetailStationCellHtml({
    dataStationId: 'station-1',
    lineColor: '#ff6600',
    stationCode: 'SI11',
    stationName: 'Shinjuku'
});

assert.match(html, /class="rw-station-code-badge"/);
assert.match(html, /data-code="SI11"/);
assert.match(html, /class="rw-station-code-badge-prefix"/);
assert.match(html, /class="rw-station-code-badge-suffix"/);
assert.match(html, /class="panel-dir-marquee-inner panel-trip-detail-station-name">Shinjuku<\/span>/);

console.log('panel trip detail station badge smoke ok');
