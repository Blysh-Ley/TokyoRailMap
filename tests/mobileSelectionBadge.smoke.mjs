import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');

assert.match(
    appSource,
    /function updateSelectionBadge\(\) \{[\s\S]*if\s*\(\s*isMobileUiMode\(\)\s*&&\s*\(\s*selectedLineId\s*\|\|\s*selectedCompany\s*\)\s*\)\s*\{[\s\S]*selectionBadgeAdapter\.render\(\{\s*kind:\s*'empty'\s*\}\);[\s\S]*return;[\s\S]*\}/,
    'mobile line and company selections must clear the global selection badge instead of rendering it'
);

assert.match(
    appSource,
    /selectionBadgeAdapter\.render\(buildSelectionBadgeViewModel\(\{/,
    'desktop and non-line selection badge rendering must keep using the normal view model'
);

console.log('mobile selection badge smoke ok');
