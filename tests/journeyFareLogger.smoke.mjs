import assert from 'node:assert/strict';

import { logJourneyFareEstimates } from '../src/features/search/journeyFareLogger.js';

const calls = [];
const logger = {
    groupCollapsed: (...args) => calls.push(['groupCollapsed', ...args]),
    groupEnd: (...args) => calls.push(['groupEnd', ...args]),
    log: (...args) => calls.push(['log', ...args]),
    warn: (...args) => calls.push(['warn', ...args])
};

const row = {
    label: 'recommended',
    originStationId: 'JR-East.Yamanote.Shinjuku',
    destinationStationId: 'TokyoMetro.Marunouchi.Ginza'
};
const originalRowSnapshot = JSON.stringify(row);

const results = await logJourneyFareEstimates({
    rows: [row],
    logger,
    getDisplayPlanForRow: async () => ({
        sections: [
            {
                fromStop: 'JR-East.Yamanote.Shinjuku',
                toStop: 'JR-East.ChuoRapid.Tokyo',
                lineIds: ['JR-East.Yamanote', 'JR-East.ChuoRapid']
            },
            {
                fromStop: 'JR-East.ChuoRapid.Tokyo',
                toStop: 'TokyoMetro.Marunouchi.Tokyo',
                lineIds: []
            },
            {
                fromStop: 'TokyoMetro.Marunouchi.Tokyo',
                toStop: 'TokyoMetro.Marunouchi.Ginza',
                lineIds: ['TokyoMetro.Marunouchi']
            }
        ]
    }),
    loadFareGraphResult: async () => ({
        status: 'ready',
        url: 'fixture',
        fareGraph: {
            'JR-East.Shinjuku': {
                'JR-East.Tokyo': { ic_card_fare: 210 }
            },
            'JR-East.Tokyo': {
                'TokyoMetro.Tokyo': { ic_card_fare: 0 }
            },
            'TokyoMetro.Tokyo': {
                'TokyoMetro.Ginza': { ic_card_fare: 178 }
            }
        }
    })
});

assert.equal(results.length, 1);
assert.equal(results[0].estimate.totalAmount, 388);
assert.equal(results[0].estimate.confidence, 'complete');
assert.equal(JSON.stringify(row), originalRowSnapshot);
assert.equal(calls.some((call) => call[0] === 'groupCollapsed' && String(call[1]).includes('journey fare estimates')), true);
assert.equal(calls.some((call) => call[0] === 'log' && call[1] === 'segments'), true);
assert.equal(calls.some((call) => call[0] === 'warn'), false);

console.log('journey fare logger smoke ok');
