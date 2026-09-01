import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    filterSearchEntries,
    normalizeSearchEntry,
    STATION_SEARCH_ENTRY_TYPES
} from '../src/domain/searchEntries.js';
import { createSearchHistoryService } from '../src/services/searchHistoryService.js';

const createMemoryStorage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
};

assert.equal(normalizeSearchEntry({ id: 'S1', text: '车站' }).type, 'station');
assert.equal(normalizeSearchEntry({ text: '普通查询' }).type, 'text');
assert.equal(
    normalizeSearchEntry({ type: 'station', text: '旧版普通查询' }).type,
    'text',
    'legacy id-less station records must migrate back to text'
);
assert.equal(normalizeSearchEntry('  普通查询  ').text, '普通查询');
assert.deepEqual(
    filterSearchEntries([
        { type: 'station', id: 'S1', text: '车站' },
        { type: 'line', id: 'L1', text: '线路' },
        { type: 'company', id: 'C1', text: '公司' }
    ], { allowedTypes: STATION_SEARCH_ENTRY_TYPES, limit: 20 }).map((item) => item.type),
    ['station']
);
assert.deepEqual(filterSearchEntries([{ type: 'station' }], { limit: 0 }), []);

const storage = createMemoryStorage();
const history = createSearchHistoryService({
    storage,
    mergeItems: (items) => items.map((item) => (
        item.type === 'station'
            ? { ...item, lineIds: [...(item.lineIds || []), 'L-MERGED'] }
            : item
    ))
});

history.add({ type: 'line', id: 'L1', text: '线路', color: '#ff0000', code: 'A1' });
history.add({ type: 'company', id: 'C1', text: '公司', logoUrl: 'company.svg' });
history.add('普通查询');
history.add({ type: 'station', text: '旧版普通查询' });
history.add({
    type: 'station',
    id: 'S1',
    text: '车站',
    lineIds: ['L1'],
    stationGroupKey: 'station-group:S1'
});

assert.deepEqual(
    history.read({ allowedTypes: STATION_SEARCH_ENTRY_TYPES }).map((item) => item.id),
    ['S1'],
    'station pickers must filter the shared complete history after it is read'
);
assert.deepEqual(history.read({ allowedTypes: ['line'] }).map((item) => item.id), ['L1']);

history.toggleFavorite({ type: 'station', id: 'S1', text: '车站' });
const afterFavorite = history.read();
assert.equal(afterFavorite[0].id, 'S1');
assert.equal(afterFavorite[0].favorite, true);
assert.deepEqual(afterFavorite[0].lineIds, ['L1', 'L-MERGED']);
assert.deepEqual(
    afterFavorite.find((item) => item.id === 'L1'),
    {
        type: 'line',
        id: 'L1',
        text: '线路',
        color: '#ff0000',
        code: 'A1',
        favorite: false,
        isTransfer: false
    },
    'station history operations must not strip line metadata'
);
assert.equal(afterFavorite.find((item) => item.id === 'C1')?.logoUrl, 'company.svg');

history.clear({ allowedTypes: STATION_SEARCH_ENTRY_TYPES });
assert.equal(history.read().some((item) => item.type === 'station'), false);
assert.equal(history.read().some((item) => item.type === 'line'), true);
assert.equal(history.read().some((item) => item.type === 'company'), true);
assert.equal(history.read().some((item) => item.type === 'text'), true);
assert.equal(history.read().some((item) => item.text === '旧版普通查询'), true);

history.remove({ type: 'company', id: 'C1', text: '公司' });
assert.equal(history.read().some((item) => item.type === 'company'), false);

const searchSource = readFileSync('src/features/search/search.js', 'utf8');
const travelSource = readFileSync('src/features/search/travel-search-ui.js', 'utf8');
const heatmapSource = readFileSync('src/features/search/searchHeatmapInteraction.js', 'utf8');
const buildSearchBlock = searchSource.slice(
    searchSource.indexOf('function buildSearchResults'),
    searchSource.indexOf('const findStationIndexItemForSearchItem')
);

assert.doesNotMatch(buildSearchBlock, /allowedTypes/, 'the base candidate builder must always build every entity type');
assert.match(buildSearchBlock, /completeTypePool/);
assert.match(searchSource, /readSearchEntries[\s\S]*buildSearchResults[\s\S]*filterSearchEntries/);
assert.doesNotMatch(travelSource, /TokyoRailSearchHistory|localStorage/);
assert.doesNotMatch(travelSource, /searchRailEntities/);
assert.match(travelSource, /readTravelSearchEntries[\s\S]*allowedTypes:\s*STATION_SEARCH_ENTRY_TYPES/);
assert.match(heatmapSource, /readStationEntries[\s\S]*readEntries[\s\S]*allowedTypes:\s*STATION_SEARCH_ENTRY_TYPES/);

console.log('search entry data source smoke ok');
