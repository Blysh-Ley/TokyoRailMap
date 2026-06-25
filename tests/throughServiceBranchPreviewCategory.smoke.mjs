import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/map/analyze_branch.js', 'utf8');

assert.match(
    source,
    /const baseResult = await analyzeBranchesForLine\(lid,\s*\{\s*targetTripKeys,\s*throughServiceCategory:\s*normalizedCategory,\s*sourceLineIds:\s*normalizedSourceLineIds,\s*filterSpecial:\s*true\s*\}\);/,
    'supplemental base branch analysis must keep the same through-service category and source lines'
);

assert.match(
    source,
    /clipRoutesToThroughServiceSegments\(\s*selectFullRoutes\(ttLists\),\s*throughServiceCategory\s*\)/,
    'through-service branch analysis must clip full route chains to configured segment stations'
);

console.log('throughServiceBranchPreviewCategory smoke ok');
