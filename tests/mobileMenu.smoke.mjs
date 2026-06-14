import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildMenuModel } from '../src/features/menu/menu.js';

const root = process.cwd();
const appSource = readFileSync(join(root, 'src/app.js'), 'utf8');
const menuSource = readFileSync(join(root, 'src/features/menu/menu.js'), 'utf8');
const mobileMenuSource = readFileSync(join(root, 'src/features/menu/mobileMenu.js'), 'utf8');
const cssSource = readFileSync(join(root, 'src/styles/app.css'), 'utf8');

const model = buildMenuModel({
    companyObj: {
        'JR-East': true,
        Toei: true
    },
    linesObj: {
        'JR-East.Yamanote': { company: 'JR-East', simplified: '山手線', modes: ['all'] },
        'JR-East.ShonanShinjuku': { company: 'JR-East', simplified: '湘南新宿ライン', modes: ['all'] },
        'JR-East.Freight': { company: 'JR-East', simplified: '货物线', modes: ['all'] },
        'Toei.Oedo': { company: 'Toei', simplified: '大江戸線', modes: ['all'] }
    },
    companyLogoMap: {
        'JR-East': { zh: 'JR东日本', type: 'JR', img: ['jreast.png', 30] },
        Toei: { zh: '都营地下铁', type: 'Subway', img: ['duyinmetro.svg', 30] }
    }
});

const jrEast = model.companies.find((company) => company.companyName === 'JR-East');
assert.ok(jrEast, 'menu model must include JR-East company');
assert.equal(jrEast.displayName, 'JR东日本');
assert.equal(jrEast.logoFile, 'jreast.png');
assert.ok(
    jrEast.lines.some((line) => String(line.lineId).startsWith('TokyoRail.MenuThrough.')),
    'JR-East mobile menu model must include virtual through-service menu rows'
);
assert.equal(
    jrEast.lines.some((line) => line.lineId === 'JR-East.ShonanShinjuku'),
    false,
    'JR-East mobile menu model must keep the desktop menu Shonan-Shinjuku replacement rule'
);
assert.equal(
    jrEast.lines.some((line) => line.lineId === 'JR-East.Freight'),
    false,
    'menu model must hide freight-style rows before UI rendering'
);
assert.equal(model.mainLineIdByAnyLineId.get('Toei.Oedo'), 'Toei.Oedo');
assert.deepEqual(model.mergedLineIdsByMenuLineId.get('Toei.Oedo'), ['Toei.Oedo']);

assert.match(
    menuSource,
    /export const buildMenuModel/,
    'desktop and mobile menu must share the extracted menu data model'
);

assert.match(
    menuSource,
    /const model = buildMenuModel\(/,
    'desktop Menu build must render from the shared menu model'
);

assert.match(
    appSource,
    /import \{ Menu, buildMenuModel \} from '.\/features\/menu\/menu\.js'/,
    'app must import the shared menu model next to the desktop Menu'
);

assert.match(
    appSource,
    /import \{ createMobileMenu \} from '.\/features\/menu\/mobileMenu\.js'/,
    'app must install the mobile menu UI from its own module'
);

assert.match(
    appSource,
    /const menuActionHandlers = \{[\s\S]*onCompanyClick:[\s\S]*onLineClick:[\s\S]*onModeClick:/,
    'menu actions must be shared instead of duplicated between desktop and mobile UI'
);

assert.match(
    appSource,
    /if\s*\(!isMobileUiMode\(\)\)\s*\{[\s\S]*menu = new Menu\([\s\S]*\.\.\.menuActionHandlers/,
    'desktop Menu must continue to use the existing Menu class with shared handlers'
);

assert.match(
    appSource,
    /else\s*\{[\s\S]*mobileMenu = createMobileMenu\(/,
    'mobile mode must create the mobile menu instead of the desktop RW-wrapper menu'
);

assert.match(
    appSource,
    /MOBILE_BOTTOM_NAV_EVENT[\s\S]*if \(item === 'menu'\) mobileMenu\?\.open\?\.\(\)/,
    'bottom nav Menu tab must open the mobile menu sheet'
);

assert.match(
    mobileMenuSource,
    /mobile-menu-sheet[\s\S]*data-mobile-menu-screen/,
    'mobile menu must expose a sheet with an explicit drill-down screen state'
);

assert.match(
    mobileMenuSource,
    /renderCompanies[\s\S]*renderLines/,
    'mobile menu must implement company-to-lines drill-down rendering'
);

assert.match(
    mobileMenuSource,
    /createCompanyLogo[\s\S]*mobile-menu-company-logo[\s\S]*setImageElementFromCache/,
    'mobile menu company rows must render company logos through the shared image cache'
);

assert.match(
    mobileMenuSource,
    /onLineClick\?\.\(lineId,[\s\S]*mergedLineIds/,
    'mobile line rows must pass the shared menu line selection payload'
);

assert.match(
    mobileMenuSource,
    /aria-modal/,
    'mobile menu sheet must expose dialog semantics'
);

assert.match(
    mobileMenuSource,
    /dragBar\.addEventListener\('pointerdown',\s*beginDrag/,
    'mobile menu drag bar must start drawer dragging on pointerdown'
);

assert.match(
    mobileMenuSource,
    /doc\.addEventListener\?\.\('pointermove',\s*updateDrag/,
    'mobile menu dragging must continue when the pointer leaves the bar'
);

assert.match(
    mobileMenuSource,
    /dragBar\.addEventListener\('lostpointercapture'[\s\S]*endDrag/,
    'mobile menu dragging must clean up lost pointer capture'
);

assert.match(
    mobileMenuSource,
    /data-mobile-menu-dragging/,
    'mobile menu must expose dragging state for styling'
);

assert.match(
    cssSource,
    /\.mobile-menu-panel[\s\S]*background:\s*var\(--ui-frosted-background\)[\s\S]*backdrop-filter:\s*var\(--ui-frosted-blur\)/,
    'mobile menu panel must use shared frosted tokens'
);

assert.match(
    cssSource,
    /\.mobile-menu-row[\s\S]*background:\s*var\(--ui-frosted-item-background\)/,
    'mobile menu rows must use shared frosted item tokens'
);

assert.match(
    cssSource,
    /\.mobile-menu-company-logo[\s\S]*height:\s*28px[\s\S]*object-fit:\s*contain/,
    'mobile menu company logos must have stable mobile row sizing'
);

assert.match(
    cssSource,
    /\.mobile-menu-drag-bar[\s\S]*touch-action:\s*none/,
    'mobile menu drag bar must opt out of scroll gestures while dragging'
);

assert.match(
    cssSource,
    /html\[data-mobile-ui='1'\] \.RW-wrapper/,
    'desktop RW-wrapper menu must remain hidden in mobile mode'
);

console.log('mobile menu smoke ok');
