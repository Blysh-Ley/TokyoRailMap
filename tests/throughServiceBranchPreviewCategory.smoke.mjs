import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/map/analyze_branch.js', 'utf8');

assert.match(
    source,
    /const baseResult = await analyzeBranchesForLine\(lid,\s*\{\s*targetTripKeys,\s*throughServiceCategory:\s*normalizedCategory,\s*sourceLineIds:\s*normalizedSourceLineIds,\s*filterSpecial:\s*true\s*\}\);/,
    'supplemental base branch analysis must keep the same through-service category'
);

console.log('throughServiceBranchPreviewCategory smoke ok');
