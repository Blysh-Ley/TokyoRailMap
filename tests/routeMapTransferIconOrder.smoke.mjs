import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/features/route-map/route-map-ui.js'), 'utf8');
const transferBadgeSource = readFileSync(join(process.cwd(), 'src/domain/transferBadgeDisplay.js'), 'utf8');
const captureSource = readFileSync(join(process.cwd(), 'src/services/routeMapCaptureService.js'), 'utf8');

assert.match(source, /import\s+\{\s*isExcludedLineType,\s*preferredOrder\s*\}/);
assert.match(source, /from\s+['"]\.\.\/\.\.\/domain\/transferBadgeDisplay\.js['"]/);
assert.match(source, /buildTransferBadgeEntriesByStationId\(\{/);
assert.match(source, /compactTransferBadgeEntries\(sortedEntries/);
assert.match(source, /sortTransferBadgeEntriesByCompany\(filtered/);
assert.match(source, /const\s+MAX_TRANSFER_ITEMS_PER_ROW\s*=\s*5/);
assert.match(source, /iconColor/);
assert.match(transferBadgeSource, /key:\s*`code\|\|\$\{company\}\|\|\$\{code\}`/);
assert.match(transferBadgeSource, /key:\s*`color\|\|\$\{company\}\|\|\$\{iconColor\}`/);
assert.match(source, /popoverItemHtmls/);
assert.match(source, /route-map-transfer-items-main\">\$\{rowsHtml\}/);
assert.match(source, /route-map-transfer-items-popover\">\$\{popoverRowsHtml\}/);
assert.match(captureSource, /route-map-transfer-items-main\s*\{[\s\S]*display:\s*none\s*!important/);
assert.match(captureSource, /route-map-transfer-hover-panel\s*\{[\s\S]*display:\s*inline-flex\s*!important/);

console.log('route map transfer icon order smoke ok');
