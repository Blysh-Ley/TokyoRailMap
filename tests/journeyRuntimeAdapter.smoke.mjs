import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createJourneyRuntimeAdapter } from '../src/features/search/journeyRuntimeAdapter.js';

{
    const runtime = {};
    const adapter = createJourneyRuntimeAdapter({ runtime, now: () => 1000 });

    adapter.resetMapPickRuntimeFlags();
    assert.equal(runtime.__TokyoRailJourneyMapPickActive, false);
    assert.equal(runtime.__TokyoRailSuppressStationSelectionUntil, 0);

    adapter.setMapPickActive(true);
    assert.equal(runtime.__TokyoRailJourneyMapPickActive, true);

    adapter.suppressStationSelectionOnce(700);
    assert.equal(runtime.__TokyoRailSuppressStationSelectionUntil, 1700);
}

{
    const calls = [];
    const runtime = {
        __TokyoRailMultiSelectInternalAPI: {
            setEnabledSilent: (enabled) => calls.push(['enabled', enabled]),
            setForbidClass: (enabled) => calls.push(['forbid', enabled])
        }
    };
    const adapter = createJourneyRuntimeAdapter({ runtime });

    adapter.setMultiSelectInternalMode(true);
    adapter.setMultiSelectInternalMode(false);

    assert.deepEqual(calls, [
        ['enabled', true],
        ['forbid', true],
        ['enabled', false],
        ['forbid', false]
    ]);
}

{
    const runtime = {};
    const adapter = createJourneyRuntimeAdapter({ runtime });
    const ui = { ok: true };

    adapter.publishJourneyUI(ui);
    assert.equal(adapter.getJourneyUI(), ui);
}

{
    const text = readFileSync(join(process.cwd(), 'src/features/search/travel-search-ui.js'), 'utf8');
    assert.doesNotMatch(text, /__TokyoRailJourneyMapPickActive|__TokyoRailSuppressStationSelectionUntil|__TokyoRailMultiSelectInternalAPI/);
}
