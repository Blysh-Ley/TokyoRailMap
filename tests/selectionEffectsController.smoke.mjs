import assert from 'node:assert/strict';
import { createSelectionEffectsController } from '../src/features/selection/selectionEffectsController.js';

const runController = ({
    baseMultiLineIds = [],
    enabledLineIdsByCompany = new Map(),
    multiSelectEnabled = false,
    snapshot = {}
} = {}) => {
    const events = [];
    const effects = [];
    const controller = createSelectionEffectsController({
        cancelFrame: () => {},
        effects: {
            applyBaseLayerVisibilityFilters: () => effects.push('base-filter'),
            applyLineSelectionStyle: () => effects.push('line-style'),
            applyStationSelectionStyle: () => effects.push('station-style'),
            updateSelectionBadge: () => effects.push('badge')
        },
        emitBaseHighlightCleared: () => events.push({ type: 'cleared' }),
        emitBaseHighlightUpdated: (detail) => events.push({ type: 'updated', detail }),
        getBaseMultiSelectedLineIds: () => new Set(baseMultiLineIds),
        getEnabledLineIdsByCompany: () => enabledLineIdsByCompany,
        getSelectionSnapshot: () => snapshot,
        isMultiSelectModeEnabled: () => multiSelectEnabled,
        requestFrame: (callback) => {
            callback();
            return 1;
        }
    });

    controller.apply();
    return { effects, events };
};

{
    const { effects, events } = runController({
        snapshot: {
            selectedLineId: 'JR-YAMANOTE',
            selectedStationLineIds: new Set(['JR-YAMANOTE', 'JR-KEIHIN'])
        }
    });

    assert.deepEqual(effects, ['base-filter', 'line-style', 'station-style', 'badge']);
    assert.deepEqual(events, [{
        type: 'updated',
        detail: {
            kind: 'line',
            lineIds: ['JR-YAMANOTE', 'JR-KEIHIN'],
            selectedLineId: 'JR-YAMANOTE',
            selectedCompany: null,
            selectedStationId: null
        }
    }]);
}

{
    const { events } = runController({
        enabledLineIdsByCompany: new Map([['Tokyo Metro', new Set(['G', 'M'])]]),
        snapshot: { selectedCompany: 'Tokyo Metro' }
    });

    assert.equal(events[0].detail.kind, 'company');
    assert.deepEqual(events[0].detail.lineIds, ['G', 'M']);
    assert.equal(events[0].detail.selectedCompany, 'Tokyo Metro');
}

{
    const { events } = runController({
        baseMultiLineIds: ['A', 'S'],
        multiSelectEnabled: true,
        snapshot: { selectedLineId: 'ignored-by-multi-base' }
    });

    assert.equal(events[0].detail.kind, 'multi-base');
    assert.deepEqual(events[0].detail.lineIds, ['A', 'S']);
}

{
    const { events } = runController();
    assert.deepEqual(events, [{ type: 'cleared' }]);
}

console.log('selection effects controller smoke ok');
