import assert from 'node:assert/strict';
import { buildSelectionBadgeViewModel } from '../src/ui/selectionBadgeAdapter.js';

{
    const viewModel = buildSelectionBadgeViewModel({
        getLineColor: () => '#00aa00',
        getLineName: () => 'Yamanote Line',
        getThroughCategory: () => '',
        getThroughDisplay: () => null,
        resolveRailColor: (color) => `resolved:${color}`,
        selectedLineId: 'JY'
    });

    assert.deepEqual(viewModel, {
        kind: 'line',
        text: 'Yamanote Line',
        color: 'resolved:#00aa00',
        icons: [{
            kind: 'line-icon',
            routeId: 'JY',
            code: '',
            color: '#00aa00'
        }]
    });
}

{
    const viewModel = buildSelectionBadgeViewModel({
        getLineColor: () => '#999999',
        getThroughCategory: () => 'metro-through',
        getThroughDisplay: () => ({ name: 'Metro Through', color: '#123456' }),
        resolveRailColor: (color) => color,
        selectedLineId: 'THROUGH',
        throughServiceConfigs: {
            'metro-through': {
                codeBadges: [
                    { lineId: 'ROUTE-1', code: 'A' },
                    { lineId: 'ROUTE-1', code: 'B' }
                ],
                color: '#abcdef',
                lineId: 'THROUGH'
            }
        }
    });

    assert.equal(viewModel.kind, 'line');
    assert.equal(viewModel.text, 'Metro Through');
    assert.equal(viewModel.color, '#123456');
    assert.deepEqual(viewModel.icons, [
        { kind: 'line-icon', routeId: 'ROUTE-1', code: 'A', color: '#abcdef' },
        { kind: 'line-icon', routeId: 'ROUTE-1', code: 'B', color: '#abcdef' }
    ]);
}

{
    const viewModel = buildSelectionBadgeViewModel({
        companyLogoMap: {
            JR: { zh: 'JR East', img: ['jr.svg'] }
        },
        isDarkThemeActive: () => true,
        selectedCompany: 'JR'
    });

    assert.deepEqual(viewModel, {
        kind: 'company',
        text: 'JR East',
        color: '#f2f2f2',
        icons: [{ kind: 'company-logo', file: 'jr.svg', alt: 'JR East' }]
    });
}

assert.deepEqual(buildSelectionBadgeViewModel(), { kind: 'empty' });

console.log('selection badge adapter smoke ok');
