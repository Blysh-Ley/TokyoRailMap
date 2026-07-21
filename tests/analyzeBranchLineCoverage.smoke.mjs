import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

const toPairKey = (a, b) => (a <= b ? `${a}||${b}` : `${b}||${a}`);

const localDataFetch = async (input) => {
    const raw = typeof input === 'string' ? input : input?.url;
    const url = new URL(raw, window.location.href);
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const body = await readFile(path.join(root, rel));
    return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' }
    });
};

globalThis.window = {
    location: { href: 'http://tokyo-rail-map.local/index.html' },
    fetch: localDataFetch
};
globalThis.fetch = localDataFetch;

const { analyzeBranchesForLine } = await import(pathToFileURL(path.join(root, 'src/map/analyze_branch.js')).href);

const lineId = 'Keisei.NaritaSkyAccess';
const result = await analyzeBranchesForLine(lineId, { filterSpecial: true });
const coveredPairKeys = new Set();

for (const branch of Array.isArray(result?.branchList) ? result.branchList : []) {
    for (let i = 0; i < branch.length - 1; i += 1) {
        coveredPairKeys.add(toPairKey(branch[i], branch[i + 1]));
    }
}

assert.ok(result?.targetCount > 0, 'filtered branch analysis should keep timetable records');
assert.ok(
    coveredPairKeys.has(toPairKey(`${lineId}.KeiseiUeno`, `${lineId}.Nippori`)),
    'Keisei Narita Sky Access first-click filter should keep KeiseiUeno-Nippori'
);
assert.ok(
    coveredPairKeys.has(toPairKey(`${lineId}.Nippori`, `${lineId}.Aoto`)),
    'Keisei Narita Sky Access first-click filter should keep Nippori-Aoto'
);
assert.ok(
    coveredPairKeys.has(toPairKey(`${lineId}.Aoto`, `${lineId}.KeiseiTakasago`)),
    'Keisei Narita Sky Access first-click filter should keep Aoto-KeiseiTakasago'
);

console.log('analyze branch current-line coverage smoke ok');
