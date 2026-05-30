import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

const assertNoPattern = ({ files, pattern, message }) => {
    const hits = [];
    for (const file of files) {
        const text = read(file);
        const lines = text.split(/\r?\n/);
        lines.forEach((line, index) => {
            if (pattern.test(line)) {
                hits.push(`${file}:${index + 1}: ${line.trim()}`);
            }
        });
    }

    assert.equal(hits.length, 0, `${message}\n${hits.join('\n')}`);
};

const searchUiFiles = [
    'src/features/search/search.js',
    'src/features/search/travel-search-ui.js',
    'src/features/search/journeyPlanRenderer.js'
];

const panelFiles = [
    'src/features/panel/panel.js',
    'src/features/panel/timetable-table.js'
];

assertNoPattern({
    files: searchUiFiles,
    pattern: /\bnew\s+maplibregl\b|\bmaplibregl\.(?!popup\b)|\.(setPaintProperty|setFilter|addLayer|addSource|removeLayer|removeSource|queryRenderedFeatures)\s*\(/,
    message: 'search UI files must not call raw MapLibre APIs'
});

assertNoPattern({
    files: panelFiles,
    pattern: /from\s+['"].*(routePlanning|services\/mapEngine|createMapEngine|mapEngine)['"]|require\([^)]*(routePlanning|services\/mapEngine|createMapEngine|mapEngine)/,
    message: 'panel files must not import route planning or mapEngine dependencies directly'
});

console.log('panel/search boundary smoke ok');
