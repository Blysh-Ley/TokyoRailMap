import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/features/route-map/route-map-ui.js'), 'utf8');

assert.match(source, /import\s+\{\s*isExcludedLineType,\s*preferredOrder\s*\}/);
assert.match(source, /const\s+MAX_TRANSFER_ITEMS_PER_ROW\s*=\s*5/);
assert.match(source, /preferredCompanyOrderIndex/);
assert.match(source, /sortCompaniesForTransferDisplay\(companyOrder\)/);
assert.match(source, /buildCompactTransferItemHtmls/);
assert.match(source, /getTransferEntryIconDedupTargets/);
assert.match(source, /iconColor/);
assert.match(source, /key:\s*`color\|\|\$\{company\}\|\|\$\{iconColor\}`/);
assert.match(source, /popoverItemHtmls/);
assert.match(source, /route-map-transfer-items-main\">\$\{rowsHtml\}/);
assert.match(source, /route-map-transfer-items-popover\">\$\{popoverRowsHtml\}/);

console.log('route map transfer icon order smoke ok');
