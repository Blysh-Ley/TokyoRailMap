import assert from 'node:assert/strict';

import { createSearchHeatmapInteraction } from '../src/features/search/searchHeatmapInteraction.js';
import { createSearchHeatmapFormInitialState } from '../src/store/searchHeatmapFormStore.js';

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

const createHarness = (options = {}) => {
    const calls = [];
    const history = [];
    const actions = {
        setReachableStopsHeatmapMinutes: (minutes) => { calls.push(['minutes', minutes]); return minutes; },
        drawReachableStopsHeatmap: async (payload) => { calls.push(['draw', payload]); return true; },
        clearReachableStopsOverlay: () => { calls.push(['clear']); },
        ...options.actions
    };
    const interaction = createSearchHeatmapInteraction({
        getActions: () => actions,
        readEntries: options.readEntries || null,
        searchStations: options.searchStations || (async () => []),
        loadHistory: options.loadHistory || (() => []),
        addHistory: (item) => { history.push(item); }
    });
    return { interaction, calls, history };
};

{
    const reads = [];
    const { interaction } = createHarness({
        readEntries: async (options) => {
            reads.push(options);
            return options.query
                ? [
                    { type: 'station', id: 'S1', text: '车站' },
                    { type: 'line', id: 'L1', text: '线路' }
                ]
                : [{ type: 'station', id: 'H1', text: '历史车站' }];
        }
    });
    interaction.dispatch({ type: 'open' });
    await interaction.dispatch({ type: 'suggest' });
    assert.deepEqual(interaction.getState().items.map((item) => item.id), ['H1']);
    await interaction.dispatch({ type: 'text', payload: '车站' });
    assert.deepEqual(interaction.getState().items.map((item) => item.id), ['S1']);
    assert.deepEqual(reads.map((options) => options.query), ['', '车站']);
    assert.equal(reads.every((options) => options.allowedTypes.includes('station')), true);
}

{
    const { interaction, calls, history } = createHarness();
    assert.deepEqual(interaction.getState(), createSearchHeatmapFormInitialState());
    const notifications = [];
    const unsubscribe = interaction.subscribe((state, action) => notifications.push([state, action.type]));
    interaction.dispatch({ type: 'open' });
    assert.equal(interaction.getState().text, '');
    assert.equal(interaction.getState().station, null);
    assert.equal(interaction.getState().minutes, 0);
    await interaction.dispatch({ type: 'text', payload: 'Tokyo' });
    interaction.dispatch({ type: 'minutes', payload: 30 });
    interaction.dispatch({ type: 'minutes', payload: 35 });
    assert.equal(interaction.getState().minutes, 30, 'only the existing minute options are accepted');
    interaction.dispatch({ type: 'selectStation', payload: { id: 'Tokyo', text: '東京' } });
    assert.deepEqual(history, [{ type: 'station', id: 'Tokyo', text: '東京' }]);
    interaction.dispatch({ type: 'togglePick' });
    assert.equal(interaction.getState().picking, true);
    interaction.dispatch({ type: 'suspend' });
    assert.equal(interaction.getState().open, true);
    assert.equal(interaction.getState().visible, false);
    assert.equal(interaction.getState().picking, false);
    assert.equal(interaction.getState().resumeOnSearch, false, 'switching to the route planner must not schedule heatmap restoration');
    interaction.dispatch({ type: 'open' });
    assert.equal(interaction.getState().visible, true);
    assert.deepEqual(interaction.getState().station, { id: 'Tokyo', text: '東京' });
    assert.equal(interaction.getState().minutes, 30);
    interaction.dispatch({ type: 'suspend', payload: { navigation: true } });
    assert.equal(interaction.getState().resumeOnSearch, true, 'leaving search temporarily must preserve restoration intent');
    interaction.dispatch({ type: 'suspend', payload: { navigation: true } });
    assert.equal(interaction.getState().resumeOnSearch, true);
    interaction.dispatch({ type: 'suspend' });
    assert.equal(interaction.getState().resumeOnSearch, false, 'explicit route planning takes precedence over a hidden heatmap');
    interaction.dispatch({ type: 'suspend', payload: { navigation: true } });
    assert.equal(interaction.getState().resumeOnSearch, false, 'navigation must not re-arm an explicitly suspended heatmap');
    assert.deepEqual(calls, [], 'open, editing, selection, minutes and map picking must never arm, draw or clear');
    interaction.dispatch({ type: 'close' });
    assert.deepEqual(interaction.getState(), createSearchHeatmapFormInitialState());
    assert.deepEqual(calls, [['clear']]);
    assert.ok(notifications.length > 0);
    unsubscribe();
    const notificationCount = notifications.length;
    interaction.dispatch({ type: 'open' });
    assert.equal(notifications.length, notificationCount);
}

{
    const { interaction } = createHarness({
        loadHistory: () => [
            '東京',
            { type: 'text', text: '新宿' },
            { type: 'station', id: 'A', text: '駅A', favorite: true },
            { text: '保存検索' },
            { type: 'line', id: 'L', text: '路線' },
            { type: 'company', text: '会社' },
            { type: 'station', text: '   ' }
        ]
    });
    interaction.dispatch({ type: 'open' });
    await interaction.dispatch({ type: 'suggest' });
    assert.deepEqual(interaction.getState().items.map((item) => item.text), ['東京', '新宿', '駅A', '保存検索']);
    assert.equal(interaction.getState().suggestionsVisible, true);
    interaction.dispatch({ type: 'hideSuggestions' });
    assert.equal(interaction.getState().suggestionsVisible, false);
}

{
    const metadata = {
        type: 'station',
        id: 'A',
        text: '駅A',
        lineIds: ['Line1', 'Line2'],
        stationGroupKey: 'group-A',
        isTransfer: true,
        favorite: true
    };
    const { interaction, history } = createHarness({ loadHistory: () => [metadata] });
    interaction.dispatch({ type: 'open' });
    interaction.dispatch({ type: 'selectStation', payload: { id: 'A', text: '駅A更新' } });
    assert.deepEqual(history[0], { ...metadata, text: '駅A更新' }, 'map selection must preserve metadata in the existing history item');
    interaction.dispatch({ type: 'selectStation', payload: { id: 'B', text: '駅B', lineIds: ['Line3'], isTransfer: false } });
    assert.deepEqual(history[1], { type: 'station', id: 'B', text: '駅B', lineIds: ['Line3'], isTransfer: false });
    assert.deepEqual(interaction.getState().station, { id: 'B', text: '駅B' }, 'form selection stays minimal even when history keeps station metadata');
}

{
    const old = deferred();
    const latest = deferred();
    const hidden = deferred();
    const { interaction } = createHarness({
        searchStations: (query) => ({ old, latest, hidden }[query].promise)
    });
    interaction.dispatch({ type: 'open' });
    const oldRequest = interaction.dispatch({ type: 'text', payload: 'old' });
    const latestRequest = interaction.dispatch({ type: 'text', payload: { text: 'latest' } });
    const latestStation = {
        type: 'station',
        id: 'NEW',
        text: 'Latest',
        isTransfer: true,
        lineIds: ['Line1', 'Line2'],
        stationGroupKey: 'group-NEW'
    };
    latest.resolve([latestStation, { type: 'line', id: 'L', text: 'Line' }]);
    await latestRequest;
    old.resolve([{ type: 'station', id: 'OLD', text: 'Old' }]);
    assert.equal(await oldRequest, false);
    assert.deepEqual(interaction.getState().items, [latestStation], 'live suggestions must retain station detail metadata');
    const hiddenRequest = interaction.dispatch({ type: 'text', payload: 'hidden' });
    interaction.dispatch({ type: 'hideSuggestions' });
    hidden.resolve([{ id: 'H', text: 'Hidden' }]);
    assert.equal(await hiddenRequest, false);
    assert.equal(interaction.getState().suggestionsVisible, false);
}

{
    const drawStarted = deferred();
    const draw = deferred();
    const { interaction, calls } = createHarness({
        actions: {
            drawReachableStopsHeatmap: (payload) => {
                calls.push(['draw', payload]);
                drawStarted.resolve();
                return draw.promise;
            }
        }
    });
    interaction.dispatch({ type: 'open' });
    interaction.dispatch({ type: 'selectStation', payload: { id: 'A', text: '駅A' } });
    interaction.dispatch({ type: 'minutes', payload: { minutes: 30 } });
    const submitted = interaction.dispatch({ type: 'submit' });
    assert.equal(interaction.getState().status, 'loading');
    assert.equal(await interaction.dispatch({ type: 'submit' }), false);
    assert.equal(interaction.dispatch({ type: 'minutes', payload: 60 }), false);
    assert.equal(await interaction.dispatch({ type: 'text', payload: 'ignored' }), false);
    assert.equal(interaction.dispatch({ type: 'togglePick' }), false);
    await drawStarted.promise;
    assert.equal(interaction.getState().status, 'loading', 'loading must cover the unresolved draw, not only station matching');
    assert.deepEqual(calls, [['minutes', 30], ['draw', { originStationId: 'A', minutes: 30 }]]);
    draw.resolve(true);
    assert.equal(await submitted, true);
    assert.equal(interaction.getState().status, 'drawn');
    await interaction.dispatch({ type: 'text', payload: 'changed' });
    assert.equal(interaction.getState().station, null);
    interaction.dispatch({ type: 'suspend' });
    assert.equal(calls.length, 2, 'editing or suspending an existing result must not clear it');
}

{
    const match = deferred();
    let useDeferredMatch = false;
    const hits = [{ id: 'FIRST', text: '東京駅' }, { id: 'EXACT', text: '東京' }];
    const { interaction, calls, history } = createHarness({
        searchStations: () => useDeferredMatch ? match.promise : hits
    });
    interaction.dispatch({ type: 'open' });
    await interaction.dispatch({ type: 'text', payload: '  東京  ' });
    interaction.dispatch({ type: 'minutes', payload: 45 });
    useDeferredMatch = true;
    const submitted = interaction.dispatch({ type: 'submit' });
    assert.equal(interaction.getState().status, 'loading', 'loading starts before asynchronous station resolution');
    assert.deepEqual(calls, []);
    assert.equal(await interaction.dispatch({ type: 'submit' }), false);
    match.resolve(hits);
    assert.equal(await submitted, true);
    assert.deepEqual(interaction.getState().station, { id: 'EXACT', text: '東京' });
    assert.deepEqual(calls[1], ['draw', { originStationId: 'EXACT', minutes: 45 }]);
    assert.deepEqual(history, [{ type: 'station', id: 'EXACT', text: '東京' }]);
}

{
    const { interaction, calls, history } = createHarness({
        searchStations: async () => [{ id: 'FIRST', text: '第一候補' }, { id: 'SECOND', text: '第二候補' }]
    });
    interaction.dispatch({ type: 'open' });
    assert.equal(await interaction.dispatch({ type: 'submit' }), false);
    assert.equal(interaction.getState().status, 'error');
    interaction.dispatch({ type: 'minutes', payload: 15 });
    await interaction.dispatch({ type: 'text', payload: '   ' });
    assert.equal(await interaction.dispatch({ type: 'submit' }), false);
    assert.deepEqual(calls, []);
    interaction.dispatch({ type: 'selectStation', payload: { text: '保存した検索語' } });
    assert.equal(interaction.getState().station, null);
    assert.equal(history[0], '保存した検索語');
    assert.equal(await interaction.dispatch({ type: 'submit' }), true);
    assert.equal(interaction.getState().station.id, 'FIRST', 'non-exact text uses the same first-hit fallback as route search');
}

{
    const oldSuggestion = deferred();
    const oldMatch = deferred();
    let searchCount = 0;
    const { interaction, calls } = createHarness({
        searchStations: () => (++searchCount === 1 ? oldSuggestion.promise : oldMatch.promise)
    });
    interaction.dispatch({ type: 'open' });
    interaction.dispatch({ type: 'minutes', payload: 30 });
    const suggesting = interaction.dispatch({ type: 'text', payload: 'old' });
    const oldSubmit = interaction.dispatch({ type: 'submit' });
    interaction.dispatch({ type: 'close' });
    assert.deepEqual(interaction.getState(), createSearchHeatmapFormInitialState());
    interaction.dispatch({ type: 'open' });
    interaction.dispatch({ type: 'selectStation', payload: { id: 'NEW', text: 'New' } });
    interaction.dispatch({ type: 'minutes', payload: 15 });
    assert.equal(await interaction.dispatch({ type: 'submit' }), true);
    oldMatch.resolve([{ id: 'OLD', text: 'old' }]);
    oldSuggestion.resolve([{ id: 'OLD', text: 'old' }]);
    assert.equal(await oldSubmit, false);
    assert.equal(await suggesting, false);
    assert.equal(interaction.getState().station.id, 'NEW');
    assert.equal(interaction.getState().status, 'drawn');
    assert.deepEqual(calls, [['clear'], ['minutes', 15], ['draw', { originStationId: 'NEW', minutes: 15 }]]);
}

{
    const started = deferred();
    const draw = deferred();
    const { interaction, calls } = createHarness({
        actions: { drawReachableStopsHeatmap: () => { started.resolve(); return draw.promise; } }
    });
    interaction.dispatch({ type: 'open' });
    interaction.dispatch({ type: 'selectStation', payload: { id: 'A', text: 'A' } });
    interaction.dispatch({ type: 'minutes', payload: 30 });
    const submitted = interaction.dispatch({ type: 'submit' });
    await started.promise;
    interaction.dispatch({ type: 'close' });
    draw.resolve(true);
    assert.equal(await submitted, false);
    assert.deepEqual(interaction.getState(), createSearchHeatmapFormInitialState());
    assert.deepEqual(calls, [['minutes', 30], ['clear']]);
}

{
    let attempt = 0;
    const { interaction } = createHarness({
        actions: { drawReachableStopsHeatmap: async () => ++attempt > 1 }
    });
    interaction.dispatch({ type: 'open' });
    interaction.dispatch({ type: 'selectStation', payload: { id: 'A', text: 'A' } });
    interaction.dispatch({ type: 'minutes', payload: 30 });
    assert.equal(await interaction.dispatch({ type: 'submit' }), false);
    assert.equal(interaction.getState().status, 'error');
    assert.ok(interaction.getState().error);
    assert.equal(interaction.getState().station.id, 'A');
    assert.equal(await interaction.dispatch({ type: 'submit' }), true);
    assert.equal(interaction.getState().status, 'drawn');
    assert.equal(interaction.getState().error, '');
}

{
    const { interaction, calls } = createHarness({ searchStations: async () => { throw new Error('lookup failed'); } });
    interaction.dispatch({ type: 'open' });
    await interaction.dispatch({ type: 'text', payload: 'missing' });
    interaction.dispatch({ type: 'minutes', payload: 30 });
    assert.equal(await interaction.dispatch({ type: 'submit' }), false);
    assert.equal(interaction.getState().status, 'error');
    assert.equal(interaction.getState().error, 'lookup failed');
    assert.deepEqual(calls, []);
}

console.log('search heatmap interaction smoke ok');
