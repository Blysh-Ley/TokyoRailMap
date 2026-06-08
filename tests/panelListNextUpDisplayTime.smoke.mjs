import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panelSource = readFileSync(new URL('../src/features/panel/panel.js', import.meta.url), 'utf8');

assert.match(
    panelSource,
    /const rowsForListView = filteredRowsForDir\.map\(\(row\) => \{[\s\S]*?const displayTime = toText\(row\?\.arr\) \|\| toText\(row\?\.dep\);[\s\S]*?isPast: parsedDisplayTime\.ms < now[\s\S]*?\}\);/,
    'list view next-up marker should use the displayed primary time, not the raw trip sort time'
);

assert.match(
    panelSource,
    /const future = rowsForListView\.filter\(\(r\) => !r\.isPast\);[\s\S]*?const visible = expanded \? rowsForListView : future\.slice\(0, 3\);/,
    'list view collapsed rows should be selected from display-time future rows'
);

console.log('panel list next-up display time smoke ok');
