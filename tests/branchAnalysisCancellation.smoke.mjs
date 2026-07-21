import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

globalThis.window = {
    location: { href: `file://${root.replace(/ /g, '%20')}/index.html` },
    TokyoRailElectron: {
        async readLocalFile(url) {
            const filePath = decodeURIComponent(new URL(url).pathname);
            const body = await fs.readFile(filePath);
            return {
                status: 200,
                statusText: 'OK',
                headers: [['content-type', 'application/json']],
                bodyBase64: body.toString('base64')
            };
        }
    },
    TokyoRailSearchMapActions: {
        previewTripPath() {
            throw new Error('stale station-through branch analysis must not preview');
        },
        clearTripPathPreviewBySource() {}
    }
};

const { previewBranchesForLineRequests } = await import('../src/map/analyze_branch.js');
const { initializeThroughServiceStationIndex } = await import('../src/lib/throughServiceManager.js');

const railways = JSON.parse(await fs.readFile(path.join(root, 'data/railways.json'), 'utf8'));
initializeThroughServiceStationIndex({ railways });

let activeChecks = 0;
const result = await previewBranchesForLineRequests({
    requests: [{
        lineId: 'TokyoRail.Temp.UenoTokyo',
        lineName: '上野东京LINE',
        sourceLineIds: [
            'JR-East.Tokaido',
            'JR-East.Takasaki',
            'JR-East.Utsunomiya',
            'JR-East.Ryomo',
            'JR-East.Ito',
            'JR-Central.Tokaido'
        ],
        throughServiceCategory: 'UenoTokyo'
    }],
    previewSource: 'station-through-branch',
    isStillActive: () => {
        activeChecks += 1;
        return activeChecks < 4;
    }
});

assert.equal(result?.ok, false);
assert.equal(result?.reason, 'stale');
assert.ok(activeChecks >= 4, 'analysis should observe cancellation while running');

console.log('branch analysis cancellation smoke ok');
