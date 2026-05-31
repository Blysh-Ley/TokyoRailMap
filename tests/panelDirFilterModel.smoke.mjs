import assert from 'node:assert/strict';

import {
    buildDirFilterFacetEntries,
    createEmptyDirFilterState,
    filterRowsByDirFilterState,
    hasDirFilterRowValue,
    isAllSelectedDirFilterState,
    setDirFilterAllSelected,
    syncDirFilterStateWithRows,
    toDirFilterRow,
    toggleDirFilterFieldValue
} from '../src/features/panel/panelDirFilterModel.js';

const rows = [
    { origin: 'Tokyo', terminal: 'Chiba', type: 'Rapid' },
    { origin: 'Tokyo', terminal: 'Narita', type: 'Local' },
    { origin: 'Shinjuku', terminal: 'Chiba', type: 'Local' },
    { origin: 'Shinjuku', terminal: 'Omiya', type: 'Rapid' }
];

{
    const state = createEmptyDirFilterState();
    assert.equal(filterRowsByDirFilterState(rows, state).length, 4);
    assert.equal(isAllSelectedDirFilterState(state, rows), false);
}

{
    const state = setDirFilterAllSelected(rows, true);
    assert.equal(isAllSelectedDirFilterState(state, rows), true);
    assert.deepEqual(Array.from(state.origins).sort(), ['Shinjuku', 'Tokyo']);
    assert.deepEqual(Array.from(state.terminals).sort(), ['Chiba', 'Narita', 'Omiya']);
    assert.deepEqual(Array.from(state.types).sort(), ['Local', 'Rapid']);
}

{
    let state = createEmptyDirFilterState();
    state = toggleDirFilterFieldValue(state, { field: 'origins', value: 'Tokyo', checked: true });
    state = toggleDirFilterFieldValue(state, { field: 'types', value: 'Rapid', checked: true });
    assert.deepEqual(
        filterRowsByDirFilterState(rows, state),
        [{ origin: 'Tokyo', terminal: 'Chiba', type: 'Rapid' }]
    );

    const terminalEntries = buildDirFilterFacetEntries({ rows, field: 'terminals', state });
    assert.deepEqual(terminalEntries, [
        { value: 'Chiba', count: 1 }
    ]);

    state = toggleDirFilterFieldValue(state, { field: 'types', value: 'Rapid', checked: false });
    assert.deepEqual(
        filterRowsByDirFilterState(rows, state).map((row) => row.terminal),
        ['Chiba', 'Narita']
    );
}

{
    const rawRow = {
        originName: 'Ueno',
        terminalDisplayName: 'Katsuta',
        typeName: 'Limited Express'
    };
    assert.deepEqual(toDirFilterRow(rawRow), {
        origin: 'Ueno',
        terminal: 'Katsuta',
        type: 'Limited Express'
    });
    assert.equal(hasDirFilterRowValue(rawRow), true);
    assert.equal(hasDirFilterRowValue({ origin: '', terminal: '', type: '' }), false);
}

{
    const state = setDirFilterAllSelected(rows, true);
    state.terminals.add('Removed');
    const next = syncDirFilterStateWithRows(state, rows.slice(0, 2));
    assert.deepEqual(Array.from(next.terminals).sort(), ['Chiba', 'Narita']);
    assert.equal(next.origins.has('Shinjuku'), false);
}

console.log('panel dir filter model smoke ok');
