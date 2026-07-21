import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildMenuModel } from '../src/features/menu/menu.js';

const root = process.cwd();
const appSource = readFileSync(join(root, 'src/app.js'), 'utf8');
const lineIconsSource = readFileSync(join(root, 'src/lib/line-icons.js'), 'utf8');
const menuSource = readFileSync(join(root, 'src/features/menu/menu.js'), 'utf8');
const mobileMenuSource = readFileSync(join(root, 'src/features/menu/mobileMenu.js'), 'utf8');
const mobileBottomNavSource = readFileSync(join(root, 'src/ui/mobileBottomNav.js'), 'utf8');
const searchSource = readFileSync(join(root, 'src/features/search/search.js'), 'utf8');
const travelSearchSource = readFileSync(join(root, 'src/features/search/travel-search-ui.js'), 'utf8');
const mobileJourneyPlanSheetSource = readFileSync(join(root, 'src/ui/mobileJourneyPlanSheet.js'), 'utf8');
const mobileSheetSnapSource = readFileSync(join(root, 'src/ui/mobileSheetSnap.js'), 'utf8');
const overflowMarqueeSource = readFileSync(join(root, 'src/ui/overflowMarquee.js'), 'utf8');
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
        'Toei.Oedo': { company: 'Toei', simplified: '大江戸線', modes: ['all'] },
        'Toei.OedoBranch': { company: 'Toei', simplified: '大江戸線支线', modes: ['all'] }
    },
    companyLogoMap: {
        'JR-East': { zh: 'JR东日本', type: 'JR', img: ['jreast.png', 30] },
        Toei: { zh: '都营地下铁', type: 'Subway', img: ['duyinmetro.svg', 30] }
    },
    railwaysList: [
        {
            id: 'JR-East.Yamanote',
            stations: ['JR-East.Yamanote.Osaki', 'JR-East.Yamanote.Shinagawa', 'JR-East.Yamanote.Osaki']
        },
        {
            id: 'Toei.Oedo',
            stations: ['Toei.Oedo.Tochomae', 'Toei.Oedo.Hikarigaoka']
        },
        {
            id: 'Toei.OedoBranch',
            stations: ['Toei.OedoBranch.BranchA', 'Toei.OedoBranch.BranchB']
        }
    ],
    stationsList: [
        { id: 'JR-East.Yamanote.Osaki', title: { 'zh-Hans': '大崎' } },
        { id: 'JR-East.Yamanote.Shinagawa', title: { 'zh-Hans': '品川' } },
        { id: 'Toei.Oedo.Tochomae', title: { 'zh-Hans': '都厅前' } },
        { id: 'Toei.Oedo.Hikariagaoka', title: { 'zh-Hans': '光丘' } },
        { id: 'Toei.Oedo.Hikarigaoka', title: { 'zh-Hans': '光丘' } },
        { id: 'Toei.OedoBranch.BranchA', title: { 'zh-Hans': '支线A' } },
        { id: 'Toei.OedoBranch.BranchB', title: { 'zh-Hans': '支线B' } }
    ]
});

const jrEast = model.companies.find((company) => company.companyName === 'JR-East');
assert.ok(jrEast, 'menu model must include JR-East company');
assert.equal(jrEast.displayName, 'JR东日本');
assert.equal(jrEast.logoFile, 'jreast.png');
assert.ok(
    jrEast.lines.some((line) => String(line.lineId).startsWith('TokyoRail.MenuThrough.')),
    'JR-East mobile menu model must include virtual through-service menu rows'
);
assert.ok(
    jrEast.lines.some((line) => line.isVirtualThrough && Array.isArray(line.virtualCodes) && line.virtualCodes.length > 1),
    'JR-East through-service rows must carry fixed icon codes for menu rendering'
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
assert.deepEqual(model.mergedLineIdsByMenuLineId.get('Toei.Oedo'), ['Toei.Oedo', 'Toei.OedoBranch']);
assert.equal(
    jrEast.lines.find((line) => line.lineId === 'JR-East.Yamanote')?.terminalText,
    '环线',
    'loop lines should show a quiet loop terminal label'
);
assert.equal(
    model.companies.find((company) => company.companyName === 'Toei')?.lines.find((line) => line.lineId === 'Toei.Oedo')?.terminalText,
    '都厅前 - 光丘',
    'merged branch menu rows must show the main line terminal text only'
);

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
    lineIconsSource,
    /export const prependLineIconElements/,
    'fixed-code line icon generation must be shared between desktop and mobile menus'
);

assert.match(
    menuSource,
    /isVirtualThrough[\s\S]*prependLineIconElements\(leftBox/,
    'desktop virtual through rows must use the shared fixed-code line icon helper'
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
    /buildMenuModel\(\{[\s\S]*railwaysList:\s*generatedRawRailways,[\s\S]*stationsList:\s*generatedRawStations/,
    'app menu model must receive raw railway and station lists for mobile terminal labels'
);

assert.match(
    appSource,
    /MOBILE_BOTTOM_NAV_EVENT[\s\S]*if \(item === 'menu'\) mobileMenu\?\.open\?\.\(\)/,
    'bottom nav Menu tab must open the mobile menu sheet'
);

assert.match(
    mobileBottomNavSource,
    /JOURNEY_CLEAR_REQUEST_EVENT[\s\S]*requestJourneyClear[\s\S]*collapseLegacyFloatingUi/,
    'mobile bottom nav must request journey cleanup before switching away from route planning'
);

assert.match(
    travelSearchSource,
    /window\.addEventListener\(JOURNEY_CLEAR_REQUEST_EVENT,[\s\S]*clearJourneyInputsAndCollapse\(\)/,
    'journey UI must reuse the close-button cleanup when mobile nav switches panels'
);

assert.match(
    travelSearchSource,
    /clearAndCollapse:\s*\(\)\s*=>\s*clearJourneyInputsAndCollapse\(\)/,
    'journey runtime UI must expose the shared cleanup path for external controllers'
);

assert.match(
    searchSource,
    /isMobileStationSearchPresentation[\s\S]*root\.addEventListener\('mouseleave'[\s\S]*if \(isMobileStationSearchPresentation\(\)\) return;[\s\S]*collapseIfEmpty\(\)/,
    'mobile station search history must not auto-collapse on hover leave'
);

assert.match(
    travelSearchSource,
    /createMobileJourneyPlanSheet[\s\S]*appendPlanSheetHandle[\s\S]*journey-plan-sheet-handle/,
    'journey plan items must own the mobile sheet drag handle'
);

assert.match(
    travelSearchSource,
    /journey-plan-drawer[\s\S]*appendPlanSheetHandle\(drawer[\s\S]*drawer\.appendChild\(path\)[\s\S]*li\.appendChild\(drawer\)[\s\S]*li\.appendChild\(brief\)/,
    'journey plan drawer must separate draggable handle and path from the fixed brief'
);

assert.match(
    travelSearchSource,
    /appendPlanSheetHandle[\s\S]*journey-plan-sheet-back-btn[\s\S]*buildJourneyPlanSheetTitleText[\s\S]*exitMobileJourneyPlanResults/,
    'mobile journey plan sheet handle must expose back navigation and current endpoint title'
);

assert.match(
    travelSearchSource,
    /setMobileJourneyPlanResultsActive[\s\S]*mobileJourneyPlanResults[\s\S]*is-mobile-plan-results/,
    'mobile journey plan result state must be tracked on document and journey root'
);

assert.match(
    travelSearchSource,
    /exitMobileJourneyPlanResults[\s\S]*clearPlanList\(\{ clearMapPreview: true \}\)[\s\S]*journeyPickController\.clearPin\(\)[\s\S]*renderHistoryResults\(\)/,
    'mobile journey plan back must clear plan UI, reset map state, and restore history'
);

assert.match(
    travelSearchSource,
    /resolveTravelHistoryStationItem[\s\S]*searchRailEntities\(base\.text \|\| base\.id[\s\S]*mergedLineIds[\s\S]*resolveTravelHistoryForRender[\s\S]*const history = await resolveTravelHistoryForRender\(\)/,
    'journey history rendering must enrich stored station records before drawing line metadata'
);

assert.match(
    travelSearchSource,
    /handleMobileBackIntent:\s*\(\)\s*=>\s*\{[\s\S]*closeMobileJourneyTripDetail\(\)[\s\S]*return exitMobileJourneyPlanResults\(\);[\s\S]*\}/,
    'journey runtime UI must expose mobile back handling for native Android back'
);

assert.match(
    appSource,
    /handleJourneyBackIntent[\s\S]*TokyoRailJourneyUI\?\.handleMobileBackIntent[\s\S]*handleRouteMapBackIntent\(payload\)[\s\S]*handleJourneyBackIntent\(payload\)[\s\S]*panel\?\.handlePanelBackIntent/,
    'Android back chain must give mobile journey result state a chance to consume back before panel fallback'
);

assert.match(
    mobileMenuSource,
    /const handleBackIntent = \(\) => \{[\s\S]*if \(!isOpen\(\)\) return false;[\s\S]*if \(screen === 'lines'\)[\s\S]*renderCompanies\(\);[\s\S]*close\(\);[\s\S]*return true;/,
    'mobile menu must consume native back by returning from lines to companies, then closing to the map'
);

assert.match(
    appSource,
    /handleMobileMenuBackIntent[\s\S]*mobileMenu\?\.handleBackIntent\?\.\(payload\)[\s\S]*mobileBottomNavController\?\.setActive\?\.\('map', \{ emit: false \}\)[\s\S]*handleJourneyBackIntent\(payload\)[\s\S]*handleMobileMenuBackIntent\(payload\)[\s\S]*panel\?\.handlePanelBackIntent/,
    'Android back chain must let the mobile menu consume back before falling through to panel/app exit behavior'
);

assert.match(
    mobileJourneyPlanSheetSource,
    /createMobileSheetDragSession[\s\S]*resolveMobileSheetDragTarget[\s\S]*getMobileSheetOffsetForState/,
    'mobile journey plan sheet must use the shared three-state sheet drag logic'
);

assert.match(
    cssSource,
    /\[data-mobile-search-mode='journey'\] \.journey-plan-results[\s\S]*position:\s*fixed[\s\S]*bottom:\s*var\(--mobile-journey-sheet-bottom\)[\s\S]*height:\s*min\(58vh,[\s\S]*background:\s*transparent[\s\S]*box-shadow:\s*none[\s\S]*overflow:\s*hidden[\s\S]*pointer-events:\s*none/,
    'mobile journey plan results must stay a non-intercepting transparent clipping layer'
);

assert.match(
    cssSource,
    /data-mobile-journey-plan-results='1'[\s\S]*--mobile-journey-sheet-bottom:\s*var\(--mobile-bottom-nav-clearance\)[\s\S]*mobile-search-mode-switch[\s\S]*journey-ui\.is-mobile-plan-results \.journey-bar[\s\S]*journey-ui\.is-mobile-plan-results \.journey-plan-search-btn[\s\S]*display:\s*none/,
    'mobile journey result state must hide mode switch, journey bar, and planner search button while keeping the sheet above bottom nav'
);

assert.match(
    cssSource,
    /\[data-mobile-search-mode='journey'\] \.journey-plan-item[\s\S]*height:\s*100%[\s\S]*max-height:\s*100%[\s\S]*flex-direction:\s*column[\s\S]*overflow:\s*hidden[\s\S]*background:\s*transparent[\s\S]*pointer-events:\s*none/,
    'mobile journey plan item must be a transparent layout container'
);

assert.match(
    cssSource,
    /\[data-mobile-search-mode='journey'\] \.journey-plan-drawer[\s\S]*flex:\s*1 1 auto[\s\S]*flex-direction:\s*column[\s\S]*overflow:\s*hidden[\s\S]*border-radius:\s*18px 18px 0 0[\s\S]*pointer-events:\s*auto[\s\S]*transition:\s*transform/,
    'mobile journey plan drawer must be the only moving visible sheet section'
);

assert.match(
    cssSource,
    /\[data-mobile-search-mode='journey'\] \.journey-plan-brief[\s\S]*position:\s*relative[\s\S]*z-index:\s*2[\s\S]*flex:\s*0 0 auto[\s\S]*border-radius:\s*0 0 18px 18px[\s\S]*pointer-events:\s*auto/,
    'mobile journey plan brief must stay fixed as a separate visible footer'
);

assert.match(
    cssSource,
    /\.journey-plan-sheet-back-btn[\s\S]*\.journey-plan-sheet-title[\s\S]*text-overflow:\s*ellipsis/,
    'mobile journey plan sheet handle must style its back button and endpoint title'
);

assert.match(
    mobileJourneyPlanSheetSource,
    /querySelector\?\.\('\.journey-plan-drawer'\)[\s\S]*getTransformElement[\s\S]*transformEl\.style\.transform = `translateY/,
    'mobile journey plan sheet must move the drawer instead of the item or transparent positioning layer'
);

assert.match(
    cssSource,
    /\.journey-plan-sheet-handle::before[\s\S]*width:\s*44px[\s\S]*height:\s*4px/,
    'mobile journey plan sheet must expose a panel-style drag handle'
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
    /createCompanyLogoSlot[\s\S]*mobile-menu-company-logo-slot[\s\S]*button\.appendChild\(createCompanyLogoSlot/,
    'mobile menu company rows must reserve a fixed logo slot before the text column'
);

assert.doesNotMatch(
    mobileMenuSource,
    /mobile-menu-row-sub|条线路|company\.type/,
    'mobile menu rows must not render secondary metadata under the row title'
);

assert.match(
    mobileMenuSource,
    /onLineClick\?\.\(lineId,[\s\S]*mergedLineIds/,
    'mobile line rows must pass the shared menu line selection payload'
);

assert.match(
    mobileMenuSource,
    /line\.isVirtualThrough[\s\S]*prependLineIconElements\(button/,
    'mobile virtual through rows must call the shared fixed-code line icon helper'
);

assert.match(
    mobileMenuSource,
    /createLineTerminal[\s\S]*mobile-menu-line-terminal[\s\S]*mobile-menu-line-terminal-inner/,
    'mobile line rows must render a subtle right-side terminal text region'
);

assert.match(
    mobileMenuSource,
    /scheduleOverflowTextMarquees\(content,[\s\S]*mobile-menu-line-terminal[\s\S]*respectReducedMotion:\s*false/,
    'mobile line terminal overflow must call the shared marquee scheduler as functional text reveal'
);

assert.match(
    overflowMarqueeSource,
    /clientWidth[\s\S]*offsetWidth[\s\S]*getRectWidth/,
    'overflow marquee must keep defensive width measurement fallbacks'
);

assert.match(
    overflowMarqueeSource,
    /typeof innerEl\.animate !== 'function'/,
    'overflow marquee must check the actual inner element animation support'
);

assert.match(
    mobileMenuSource,
    /aria-modal/,
    'mobile menu sheet must expose dialog semantics'
);

assert.match(
    mobileMenuSource,
    /const dragHandles = \[dragBar, header\];[\s\S]*handle\.addEventListener\('pointerdown',\s*beginDrag/,
    'mobile menu drag bar and header must start drawer dragging on pointerdown'
);

assert.match(
    mobileSheetSnapSource,
    /getNearestMobileSheetStateByOffset/,
    'mobile drawer snap points must be centralized for shared sheet behavior'
);

assert.match(
    mobileMenuSource,
    /createMobileSheetDragSession[\s\S]*updateMobileSheetDragSession[\s\S]*resolveMobileSheetDragTarget/,
    'mobile menu dragging must use the shared gesture-aware expanded half collapsed snap logic'
);

assert.match(
    mobileMenuSource,
    /createMobileSheetPullDownController\(\{[\s\S]*scrollEl:\s*content[\s\S]*beginSheetDrag:\s*beginDrag[\s\S]*endSheetDrag:\s*endDrag/,
    'mobile menu content must support top pull-down through the shared sheet bridge'
);

assert.match(
    mobileMenuSource,
    /doc\.addEventListener\?\.\('pointermove',\s*updateDrag/,
    'mobile menu dragging must continue when the pointer leaves the bar'
);

assert.match(
    mobileMenuSource,
    /dragHandles[\s\S]*handle\.addEventListener\('lostpointercapture'[\s\S]*endDrag/,
    'mobile menu dragging must clean up lost pointer capture for every drag handle'
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
    /\.mobile-menu-panel[\s\S]*bottom:\s*0;[\s\S]*height:\s*min\(88vh,\s*calc\(100vh - var\(--mobile-expanded-sheet-top-clearance\)\)\)/,
    'mobile menu panel must use the panel-style bottom-attached drawer layout'
);

assert.match(
    cssSource,
    /--mobile-bottom-nav-clearance:\s*calc\(env\(safe-area-inset-bottom,\s*0px\) \+ 76px\)/,
    'mobile UI must expose a shared bottom-nav clearance variable'
);

assert.match(
    cssSource,
    /\.mobile-menu-content[\s\S]*padding:\s*8px 10px var\(--mobile-bottom-nav-clearance\)[\s\S]*scroll-padding-bottom:\s*var\(--mobile-bottom-nav-clearance\)/,
    'mobile menu content must reserve bottom space for the bottom navigation'
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
    /\.mobile-menu-company-logo-slot[\s\S]*flex:\s*0 0 80px;[\s\S]*width:\s*80px;/,
    'mobile menu company logo slot must occupy a fixed 80px column'
);

assert.match(
    cssSource,
    /\.mobile-menu-line-terminal[\s\S]*max-width:\s*112px;[\s\S]*color:\s*var\(--ui-text-muted\)/,
    'mobile line terminal text must be constrained and visually secondary'
);

assert.match(
    cssSource,
    /\.mobile-menu-line-terminal-inner[\s\S]*white-space:\s*nowrap;[\s\S]*will-change:\s*transform/,
    'mobile line terminal text must be ready for marquee animation'
);

assert.match(
    cssSource,
    /\.mobile-menu-drag-bar[\s\S]*touch-action:\s*none/,
    'mobile menu drag bar must opt out of scroll gestures while dragging'
);

assert.match(
    cssSource,
    /\.mobile-menu-header[\s\S]*cursor:\s*grab;[\s\S]*touch-action:\s*none/,
    'mobile menu header must opt out of scroll gestures so it can drag the sheet'
);

assert.match(
    cssSource,
    /\.mobile-menu-sheet\[data-mobile-menu-state='half'\][\s\S]*translateY\(50%\)/,
    'mobile menu must expose a half-collapsed drawer state'
);

assert.match(
    cssSource,
    /\.mobile-menu-sheet\[data-mobile-menu-state='collapsed'\][\s\S]*var\(--mobile-sheet-peek-height,\s*86px\)/,
    'mobile menu must expose a collapsed drawer state that leaves a small top strip'
);

assert.match(
    cssSource,
    /html\[data-mobile-ui='1'\] \.RW-wrapper/,
    'desktop RW-wrapper menu must remain hidden in mobile mode'
);

console.log('mobile menu smoke ok');
