import {
    createLineIconElement,
    createStationCodeBadgeElement,
    getRoutesIndex,
    selectLineIconPreset,
    selectStationBadgeDesign
} from '../lib/line-icons.js';
import { lineIconSettings } from '../config/lineIconSettings.js';

const SAMPLE_BY_COMPANY = {
    'JR-East': { routeId: 'JR-East.Yamanote', lineCode: 'JY', stationCode: 'JY24', color: '#B1CB39' },
    'JR-Central': { routeId: 'JR-Central.Tokaido', lineCode: 'CA', stationCode: 'CA00', color: '#F77321' },
    TokyoMetro: { routeId: 'TokyoMetro.Ginza', lineCode: 'G', stationCode: 'G01', color: '#F39700' },
    Toei: { routeId: 'Toei.Asakusa', lineCode: 'A', stationCode: 'A01', color: '#E85298' },
    Keio: { routeId: 'Keio.KeioNew', lineCode: 'KO', stationCode: 'KO01', color: '#D5007F' },
    Tobu: { routeId: 'Tobu.TobuSkytree', lineCode: 'TS', stationCode: 'TS01', color: '#0F6CC3' },
    Tokyu: { routeId: 'Tokyu.DenEnToshi', lineCode: 'DT', stationCode: 'DT01', color: '#20A288' },
    Seibu: { routeId: 'Seibu.Ikebukuro', lineCode: 'SI', stationCode: 'SI01', color: '#F5A200' },
    Keikyu: { routeId: 'Keikyu.Main', lineCode: 'KK', stationCode: 'KK01', color: '#00BFFF' },
    Odakyu: { routeId: 'Odakyu.Odawara', lineCode: 'OH', stationCode: 'OH01', color: '#0096D6' },
    Keisei: { routeId: 'Keisei.Main', lineCode: 'KS', stationCode: 'KS01', color: '#005AAA' },
    Sotetsu: { routeId: 'Sotetsu.Main', lineCode: 'SO', stationCode: 'SO01', color: '#0067B1' },
    Hokuso: { routeId: 'Hokuso.Hokuso', lineCode: 'HS', stationCode: 'HS01', color: '#00A0E9' },
    MIR: { routeId: 'MIR.TsukubaExpress', lineCode: 'TX', stationCode: 'TX01', color: '#0033CB' },
    TokyoMonorail: { routeId: 'TokyoMonorail.HanedaAirport', lineCode: 'MO', stationCode: 'MO01', color: '#1479CC' },
    TWR: { routeId: 'TWR.Rinkai', lineCode: 'R', stationCode: 'R01', color: '#00A7E3' },
    Yurikamome: { routeId: 'Yurikamome.Yurikamome', lineCode: 'U', stationCode: 'U01', color: '#274A9F' },
    Disney: { routeId: 'Disney.DisneyResortLine', lineCode: '', stationCode: 'DR01', color: '#6F4AA8' },
    YokohamaMunicipal: { routeId: 'YokohamaMunicipal.Blue', lineCode: 'B', stationCode: 'B01', color: '#0072BC' },
    YokohamaSeaside: { routeId: 'YokohamaSeaside.KanazawaSeaside', lineCode: '', stationCode: 'YSL1', color: '#00A3D8' },
    Minatomirai: { routeId: 'Minatomirai.Minatomirai', lineCode: 'MM', stationCode: 'MM01', color: '#093E8C' },
    ChibaMonorail: { routeId: 'ChibaMonorail.Line1', lineCode: 'CM', stationCode: 'CM01', color: '#005BAC' },
    ToyoRapid: { routeId: 'ToyoRapid.ToyoRapid', lineCode: 'TR', stationCode: 'TR01', color: '#00AEEF' },
    Ryutetsu: { routeId: 'Ryutetsu.Nagareyama', lineCode: 'RN', stationCode: 'RN1', color: '#E74B3C' },
    Yamaman: { routeId: 'Yamaman.Yukarigaoka', lineCode: '', stationCode: 'YM01', color: '#3D9A48' },
    SaitamaTransit: { routeId: 'SaitamaTransit.NewShuttle', lineCode: 'NS', stationCode: 'NS01', color: '#1F7FBA' },
    SaitamaRailway: { routeId: 'SaitamaRailway.SaitamaRailway', lineCode: 'SR', stationCode: 'SR19', color: '#3455A4' },
    TamaMonorail: { routeId: 'TamaMonorail.TamaMonorail', lineCode: 'TT', stationCode: 'TT01', color: '#F08300' },
    ShonanMonorail: { routeId: 'ShonanMonorail.ShonanMonorail', lineCode: 'SMR', stationCode: 'SMR1', color: '#E65A2E' },
    KantoRailway: { routeId: 'KantoRailway.Joso', lineCode: '', stationCode: 'KR01', color: '#2457A7' },
    Enoden: { routeId: 'Enoden.Enoden', lineCode: 'EN', stationCode: 'EN01', color: '#008742' },
    UtsunomiyaLightRail: { routeId: 'UtsunomiyaLightRail.UtsunomiyaLightRail', lineCode: '', stationCode: 'UL01', color: '#FFD200' },
    KashimaRinkai: { routeId: 'KashimaRinkai.OaraiKashima', lineCode: '', stationCode: 'KR01', color: '#0068B7' },
    Choshi: { routeId: 'Choshi.Choshi', lineCode: 'CD', stationCode: 'CD01', color: '#222222' },
    Isumi: { routeId: 'Isumi.Isumi', lineCode: '', stationCode: 'IS01', color: '#F5C400' },
    Fujikyu: { routeId: 'Fujikyu.Fujikyu', lineCode: 'FJ', stationCode: 'FJ01', color: '#005BAC' },
    Shibayama: { routeId: 'Shibayama.Shibayama', lineCode: 'SR', stationCode: 'KS44', color: '#00A650' },
    Kominato: { routeId: 'Kominato.Kominato', lineCode: '', stationCode: 'KM01', color: '#D21F2B' },
    Izukyu: { routeId: 'Izukyu.Izukyu', lineCode: 'IZ', stationCode: 'IZ01', color: '#00A0E9' },
    Hitachinaka: { routeId: 'Hitachinaka.Minato', lineCode: '', stationCode: 'HK01', color: '#E95513' },
    IzuHakone: { routeId: 'IzuHakone.Daiyuzan', lineCode: 'ID', stationCode: 'ID01', color: '#005BAC' },
    OdakyuHakone: { routeId: 'OdakyuHakone.HakoneTozan', lineCode: 'OH', stationCode: 'OH47', color: '#E65300' },
    Chichibu: { routeId: 'Chichibu.Chichibu', lineCode: 'CR', stationCode: 'CR01', color: '#1A9A5B' },
    Moka: { routeId: 'Moka.Moka', lineCode: '', stationCode: 'MK01', color: '#C81E1E' }
};

const toText = (value) => String(value ?? '').trim();

const companyList = () => {
    const seen = new Set();
    const result = [];
    for (const company of lineIconSettings.companies || []) {
        const key = toText(company?.key);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(company);
    }
    return result;
};

const getRouteColor = (routeIndex, routeId, fallback) => {
    const meta = routeIndex instanceof Map ? routeIndex.get(routeId) : null;
    return toText(meta?.color) || toText(fallback) || '#666666';
};

const getRouteCode = (routeIndex, routeId, fallback) => {
    const meta = routeIndex instanceof Map ? routeIndex.get(routeId) : null;
    return toText(meta?.code) || toText(fallback);
};

const createPlaceholder = (text) => {
    const el = document.createElement('span');
    el.className = 'placeholder';
    el.textContent = text;
    return el;
};

const appendPreviewNode = (slot, node, fallbackText) => {
    if (!node) {
        slot.appendChild(createPlaceholder(fallbackText));
        return;
    }
    slot.appendChild(node);
    if (node.style?.display === 'none') {
        slot.appendChild(createPlaceholder('hidden'));
    }
};

const createCell = (className = '') => {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    return cell;
};

const renderRow = ({ company, sample, routeIndex }) => {
    const routeId = sample.routeId;
    const color = getRouteColor(routeIndex, routeId, sample.color);
    const lineCode = getRouteCode(routeIndex, routeId, sample.lineCode);
    const stationCode = toText(sample.stationCode);
    const lineDesign = selectLineIconPreset(routeId, lineCode);
    const stationDesign = selectStationBadgeDesign(routeId, stationCode);

    const row = document.createElement('tr');

    const companyCell = createCell();
    const companyWrap = document.createElement('div');
    companyWrap.className = 'company-name';
    const label = document.createElement('strong');
    label.textContent = company.label || company.key;
    const key = document.createElement('span');
    key.className = 'company-key';
    key.textContent = company.key;
    companyWrap.append(label, key);
    companyCell.appendChild(companyWrap);

    const lineCell = createCell();
    const lineSlot = document.createElement('span');
    lineSlot.className = 'icon-slot';
    const lineIcon = createLineIconElement({ routeId, code: lineCode, color });
    appendPreviewNode(lineSlot, lineIcon, 'none');
    lineCell.appendChild(lineSlot);

    const stationCell = createCell();
    const stationSlot = document.createElement('span');
    stationSlot.className = 'badge-slot';
    const badge = createStationCodeBadgeElement({ routeId, code: stationCode, color });
    appendPreviewNode(stationSlot, badge, 'none');
    stationCell.appendChild(stationSlot);

    const sampleCell = createCell('sample-cell');
    sampleCell.innerHTML = `
        <div>${routeId}</div>
        <div class="sample-meta">line ${lineCode || '-'} / station ${stationCode || '-'}</div>
    `;

    const designCell = createCell();
    designCell.innerHTML = `
        <div class="design-meta">line: ${lineDesign}</div>
        <div class="design-meta">station: ${stationDesign}</div>
    `;

    row.append(companyCell, lineCell, stationCell, sampleCell, designCell);
    return row;
};

const render = async () => {
    const tbody = document.getElementById('preview-body');
    if (!tbody) return;

    let routeIndex = new Map();
    try {
        routeIndex = await getRoutesIndex();
    } catch {
        routeIndex = new Map();
    }

    const fragment = document.createDocumentFragment();
    for (const company of companyList()) {
        const sample = SAMPLE_BY_COMPANY[company.key] || {
            routeId: `${company.key}.Preview`,
            lineCode: company.key.slice(0, 2).toUpperCase(),
            stationCode: `${company.key.slice(0, 2).toUpperCase()}01`,
            color: '#666666'
        };
        fragment.appendChild(renderRow({ company, sample, routeIndex }));
    }

    tbody.replaceChildren(fragment);
};

document.querySelectorAll('[data-theme-value]').forEach((button) => {
    button.addEventListener('click', () => {
        const theme = button.getAttribute('data-theme-value') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.querySelectorAll('[data-theme-value]').forEach((item) => {
            item.setAttribute('aria-pressed', String(item === button));
        });
    });
});

render();
