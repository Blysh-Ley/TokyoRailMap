import assert from 'node:assert/strict';

import {
    ensureJourneyHtml2canvas,
    formatJourneyExportTimestamp,
    sanitizeJourneyExportFilePart
} from '../src/features/search/journeyCaptureExport.js';

{
    const timestamp = formatJourneyExportTimestamp(new Date(2026, 4, 30, 9, 8, 7));
    assert.equal(timestamp, '20260530-090807');
}

{
    assert.equal(sanitizeJourneyExportFilePart(' journey detail: 東京 > 新宿 '), '_journey_detail__東京___新宿_');
    assert.equal(sanitizeJourneyExportFilePart('a'.repeat(150)).length, 120);
}

{
    const html2canvas = () => 'canvas';
    globalThis.window = { html2canvas };
    assert.equal(await ensureJourneyHtml2canvas(), html2canvas);
    delete globalThis.window;
}
