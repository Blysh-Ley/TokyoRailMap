import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cssSource = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
const tokensSource = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

assert.match(tokensSource, /--panel-timetable-time-text:\s*var\(--ui-text-strong\)/);
assert.match(tokensSource, /--panel-timetable-time-depart:\s*green/);
assert.match(tokensSource, /--panel-timetable-time-origin:\s*green/);
assert.match(tokensSource, /--panel-timetable-time-terminal:\s*red/);
assert.match(tokensSource, /html\[data-theme='dark'\]\s*\{[\s\S]*--panel-timetable-time-text:\s*var\(--ui-text\)/);
assert.match(tokensSource, /html\[data-theme='dark'\]\s*\{[\s\S]*--panel-timetable-time-depart:\s*var\(--ui-success\)/);
assert.match(tokensSource, /html\[data-theme='dark'\]\s*\{[\s\S]*--panel-timetable-time-origin:\s*var\(--ui-success\)/);
assert.match(tokensSource, /html\[data-theme='dark'\]\s*\{[\s\S]*--panel-timetable-time-terminal:\s*var\(--ui-danger\)/);

assert.match(cssSource, /\.panel-timetable-time\s*\{[\s\S]*color:\s*var\(--panel-timetable-time-text\)/);
assert.match(cssSource, /\.panel-timetable-time:not\(\.has-arrive\)\s+\.panel-time-depart\s*\{[^}]*color:\s*var\(--panel-timetable-time-text\)/);
assert.match(cssSource, /\.panel-timetable-time-extra\.is-origin\s*\{\s*color:\s*var\(--panel-timetable-time-origin\)/);
assert.match(cssSource, /\.panel-timetable-time-extra\.is-terminal\s*\{\s*color:\s*var\(--panel-timetable-time-terminal\)/);
assert.match(cssSource, /\.panel-time-arrive\s*\{[\s\S]*color:\s*var\(--panel-timetable-time-text\)/);
assert.match(cssSource, /\.panel-time-depart\s*\{[\s\S]*color:\s*var\(--panel-timetable-time-depart\)/);

console.log('panel timetable time dark mode smoke ok');
