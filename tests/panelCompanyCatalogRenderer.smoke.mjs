import assert from 'node:assert/strict';
import {
    buildPanelCompaniesHtml,
    collectPanelCatalogEntries,
    renderPanelCatalogEntriesHtml
} from '../src/features/panel/panelCompanyCatalogRenderer.js';

const lineMetaById = new Map([
    ['JR.Yamanote', { color: '#80c241', company: 'JR', name: 'JR Yamanote' }],
    ['JR.Chuo', { color: '#f15a24', company: 'JR', name: 'JR Chuo' }]
]);

const companiesHtml = buildPanelCompaniesHtml({
    display_serving_ids: ['JR.Yamanote', 'JR.Chuo', 'JR.Yamanote']
}, {
    companyLogoMap: {
        JR: { abb: 'JR', img: ['jr.svg'], zh: 'JR East' }
    },
    getLineMeta: (lineId) => lineMetaById.get(lineId),
    lineStationNameByLineId: new Map([
        ['JR.Yamanote', { actualName: 'Tokyo', code: 'JY01', name: 'Tokyo' }]
    ]),
    railwaysOrderIndex: new Map([
        ['jr-yamanote', 2],
        ['jr-chuo', 1]
    ])
});

assert.match(companiesHtml, /class="panel-popup is-interactive"/);
assert.match(companiesHtml, /class="panel-company-header" data-company="JR"/);
assert.match(companiesHtml, /class="panel-company-logo"/);
assert.match(companiesHtml, /class="panel-company-name">JR East<\/span>/);
assert.match(companiesHtml, /data-line-id="JR\.Yamanote" data-station-name="Tokyo"/);
assert.match(companiesHtml, /data-transfer-station-code="JY01"/);
assert.match(companiesHtml, /class="panel-line-name-suffix"/);
assert.equal((companiesHtml.match(/data-line-id="JR\.Yamanote"/g) || []).length, 1);
assert.ok(
    companiesHtml.indexOf('data-line-id="JR.Yamanote"') < companiesHtml.indexOf('data-line-id="JR.Chuo"'),
    'railways order should keep higher rank first'
);

const catalogHtml = renderPanelCatalogEntriesHtml([
    {
        companyName: 'JR East',
        lines: [
            { lineId: 'JR.Yamanote', lineName: 'Yamanote' },
            { lineId: '', lineName: 'Static Line' }
        ]
    }
]);

assert.match(catalogHtml, /class="panel-catalog-company"/);
assert.match(catalogHtml, /class="panel-catalog-company-name">JR East<\/div>/);
assert.match(catalogHtml, /<button type="button" class="panel-catalog-line" data-panel-catalog-line-id="JR\.Yamanote">Yamanote<\/button>/);
assert.match(catalogHtml, /<div class="panel-catalog-line is-static">Static Line<\/div>/);

const makeLineEl = ({ lineId, lineName }) => ({
    classList: { contains: (name) => name === 'panel-line' },
    getAttribute: (name) => (name === 'data-line-id' ? lineId : ''),
    querySelector: (selector) => {
        if (selector === '.panel-line-name-main') return { textContent: lineName };
        if (selector === '.panel-line-name') return { textContent: lineName };
        return null;
    }
});

const fakeBody = {
    querySelectorAll: (selector) => {
        assert.equal(selector, '.panel-company');
        return [{
            querySelector: (innerSelector) => {
                if (innerSelector === '.panel-company-name') return { textContent: 'JR East' };
                if (innerSelector === '.panel-company-header') {
                    return { getAttribute: (name) => (name === 'data-company' ? 'JR' : '') };
                }
                if (innerSelector === '.panel-company-lines') {
                    return {
                        children: [
                            makeLineEl({ lineId: 'JR.Yamanote', lineName: 'Yamanote' }),
                            makeLineEl({ lineId: 'JR.Chuo', lineName: 'Chuo' })
                        ]
                    };
                }
                return null;
            }
        }];
    }
};

assert.deepEqual(collectPanelCatalogEntries(fakeBody), [{
    companyName: 'JR East',
    lines: [
        { lineId: 'JR.Yamanote', lineName: 'Yamanote' },
        { lineId: 'JR.Chuo', lineName: 'Chuo' }
    ]
}]);

console.log('panel company catalog renderer smoke ok');
