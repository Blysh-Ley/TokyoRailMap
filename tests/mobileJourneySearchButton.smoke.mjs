import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { syncJourneySearchButtonAvailability } from '../src/ui/journeySearchButtonView.js';

const createButton = () => {
    const classes = new Set();
    const attributes = new Map();
    return {
        disabled: false,
        classList: {
            toggle(name, enabled) {
                if (enabled) classes.add(name);
                else classes.delete(name);
            },
            contains: (name) => classes.has(name)
        },
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: (name) => attributes.get(name)
    };
};

const button = createButton();
const origin = { value: '' };
const destination = { value: '' };
const waypoint = { value: '' };

const assertAvailability = ({ inputs, mobile = true, independent, disabled, ready, message }) => {
    const valuesBefore = inputs.map((input) => input.value);
    syncJourneySearchButtonAvailability({ button, inputs, mobile, independent });
    assert.equal(button.disabled, disabled, `${message}: native disabled state`);
    assert.equal(button.getAttribute('aria-disabled'), String(disabled), `${message}: accessible disabled state`);
    assert.equal(button.classList.contains('is-ready'), ready, `${message}: ready styling`);
    assert.deepEqual(inputs.map((input) => input.value), valuesBefore, `${message}: input values remain unchanged`);
};

assertAvailability({
    inputs: [], disabled: true, ready: false,
    message: 'mobile search cannot be ready without endpoint inputs'
});
assertAvailability({
    inputs: [origin, destination], disabled: true, ready: false,
    message: 'empty endpoints are disabled'
});
origin.value = ' \t';
destination.value = '\n　';
assertAvailability({
    inputs: [origin, destination], disabled: true, ready: false,
    message: 'whitespace does not fill an endpoint'
});
origin.value = '东京';
assertAvailability({
    inputs: [origin], disabled: true, ready: false,
    message: 'at least two endpoint inputs are required'
});
assertAvailability({
    inputs: [origin, destination], disabled: true, ready: false,
    message: 'one filled endpoint is not enough'
});
destination.value = ' 新宿 ';
assertAvailability({
    inputs: [origin, destination], disabled: false, ready: true,
    message: 'two plain station texts enable the existing search without requiring station IDs'
});
assertAvailability({
    inputs: [origin, waypoint, destination], disabled: true, ready: false,
    message: 'adding an empty waypoint disables the button'
});
waypoint.value = '　';
assertAvailability({
    inputs: [origin, waypoint, destination], disabled: true, ready: false,
    message: 'whitespace-only waypoint remains unfilled'
});
waypoint.value = '秋叶原';
assertAvailability({
    inputs: [origin, waypoint, destination], disabled: false, ready: true,
    message: 'filling every added waypoint enables the button'
});
waypoint.value = '';
assertAvailability({
    inputs: [origin, waypoint, destination], disabled: true, ready: false,
    message: 'clearing a waypoint disables an already-ready button'
});
assertAvailability({
    inputs: [origin, destination], disabled: false, ready: true,
    message: 'removing the empty waypoint restores availability'
});
origin.value = '';
assertAvailability({
    inputs: [origin, destination], disabled: true, ready: false,
    message: 'clearing an endpoint disables an already-ready button'
});
destination.value = '';
assertAvailability({
    inputs: [origin, destination], disabled: true, ready: false,
    message: 'reset keeps the button disabled'
});
assertAvailability({
    inputs: [origin, destination], mobile: false, disabled: false, ready: false,
    message: 'desktop restores the original enabled behavior even when fields are empty'
});
origin.value = '东京';
destination.value = '新宿';
assertAvailability({
    inputs: [origin, destination], disabled: false, ready: true,
    message: 'returning to mobile with complete inputs restores ready styling'
});
assertAvailability({
    inputs: [origin, destination], mobile: false, disabled: false, ready: false,
    message: 'desktop clears the mobile highlight for complete inputs'
});
origin.value = '';
assertAvailability({
    inputs: [origin, destination], mobile: false, independent: true, disabled: true, ready: false,
    message: 'an explicitly independent desktop button is disabled until both endpoints are filled'
});
origin.value = '东京';
assertAvailability({
    inputs: [origin, destination], mobile: false, independent: true, disabled: false, ready: true,
    message: 'an explicitly independent desktop button becomes ready for plain station text'
});
assertAvailability({
    inputs: [origin, waypoint, destination], mobile: false, independent: true, disabled: true, ready: false,
    message: 'independent desktop readiness includes every added waypoint'
});
waypoint.value = '秋叶原';
assertAvailability({
    inputs: [origin, waypoint, destination], mobile: false, independent: true, disabled: false, ready: true,
    message: 'filling the desktop waypoint restores the same ready state'
});
assertAvailability({
    inputs: [origin, destination], mobile: false, independent: true, disabled: false, ready: true,
    message: 'removing a desktop waypoint preserves endpoint readiness'
});
origin.value = '';
assertAvailability({
    inputs: [origin, destination], mobile: true, independent: false, disabled: false, ready: false,
    message: 'the optional independent flag can explicitly opt out without changing the search action'
});
syncJourneySearchButtonAvailability({ button, inputs: [origin, destination] });
assert.equal(button.disabled, false, 'omitting both optional flags preserves the original desktop enabled behavior');
assert.equal(button.getAttribute('aria-disabled'), 'false');
assert.equal(button.classList.contains('is-ready'), false);

const root = process.cwd();
const journeyUiSource = readFileSync(join(root, 'src/features/search/travel-search-ui.js'), 'utf8');
const originalButtonHandlers = `    planSearchBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });
    planSearchBtn.addEventListener('click', async (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        await requestJourneyPlan();
    });`;

assert.ok(
    journeyUiSource.includes(originalButtonHandlers),
    'the existing planner button event handlers and requestJourneyPlan call must remain unchanged'
);

assert.match(
    journeyUiSource,
    /const syncPlanSearchButton = \(\) => syncJourneySearchButtonAvailability\(\{[\s\S]*?button: planSearchBtn,[\s\S]*?inputs: \[originInput, destinationInput, \.\.\.waypointRows\.map\(\(row\) => row\.input\)\],[\s\S]*?independent: true,[\s\S]*?mobile: document\.documentElement\?\.dataset\?\.mobileUi === '1'[\s\S]*?document\.body\?\.dataset\?\.mobileUi === '1'[\s\S]*?\}\);\s*syncPlanSearchButton\(\);/,
    'the UI must opt into independent readiness on both desktop and mobile without changing helper defaults'
);
assert.match(
    journeyUiSource,
    /const syncEndpointDragHandles = \(\) => \{\s*syncPlanSearchButton\(\);/,
    'candidate, map, external setter, swap, drag and waypoint layout updates must synchronize readiness'
);
assert.match(
    journeyUiSource,
    /const refresh = async \(\) => \{\s*syncPlanSearchButton\(\);/,
    'typed history text, input changes and composition completion must synchronize readiness'
);
assert.match(
    journeyUiSource,
    /finally \{\s*clearingPlannerSession = false;\s*syncPlanSearchButton\(\);/,
    'reset must synchronize readiness even when no waypoint rows need removal'
);
assert.match(
    journeyUiSource,
    /input\.value = coordsText;\s*input\.dataset\.stationId = '';\s*syncPlanSearchButton\(\);/,
    'coordinate assignment must synchronize readiness before any no-nearby-station early return'
);
assert.match(
    journeyUiSource,
    /window\.addEventListener\(SEARCH_PLANNER_STATE_EVENT, \(evt\) => \{\s*syncPlanSearchButton\(\);/,
    'entering or leaving the planner shell must synchronize readiness'
);

const cssSource = readFileSync(join(root, 'src/styles/app.css'), 'utf8');
assert.match(cssSource, /--mobile-search-row-height:\s*45px;/);
assert.match(cssSource, /--mobile-search-transition-duration:\s*0\.3s;/);
assert.match(
    cssSource,
    /--mobile-search-planner-height:\s*calc\(\s*90px\s*\+ var\(--journey-waypoint-extra-height\)\s*\+ \(var\(--journey-waypoint-count\) \* 7px\)\s*\);/,
    'mobile planner must allocate 45px for each base and waypoint row'
);
assert.match(
    cssSource,
    /\.search-ui:not\(\.is-planner-open\):not\(\.is-heatmap-open\)[^{}]*\{[^}]*--mobile-search-field-height:\s*45px;[^}]*--mobile-search-panel-height:\s*45px;/,
    'only the ordinary mobile search state must match the 45px history-row height'
);
assert.match(
    cssSource,
    /\.search-ui:not\(\.is-planner-open\):not\(\.is-heatmap-open\)::before[^{}]*\{[^}]*border-radius:\s*26px;[^}]*box-sizing:\s*border-box;/,
    'the ordinary search shell must use the navigation actual 26px radius within its 45px border box'
);
assert.match(
    cssSource,
    /\.search-ui > \.search-results,[^{}]*\.search-ui \.search-results-list[^{}]*\{\s*border-radius:\s*26px;/,
    'mobile search history clipping shells and lists must use the navigation actual 26px radius'
);
const cssRules = Array.from(cssSource.matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, declarations]) => ({
    selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    declarations
}));
const mobileRule = (ending) => cssRules.find(({ selector }) => (
    selector.includes("[data-mobile-ui='1']")
    && selector.split(',').some((part) => part.trim().endsWith(ending))
));
const mobileOnlyRule = (ending) => cssRules.find(({ selector }) => selector.split(',').some((part) => (
    part.includes("[data-mobile-ui='1']")
    && !part.includes(":not([data-mobile-ui='1'])")
    && part.trim().endsWith(ending)
)));
const desktopRules = (ending) => cssRules.filter(({ selector }) => selector.split(',').some((part) => (
    part.trim().startsWith("html:not([data-mobile-ui='1'])") && part.trim().endsWith(ending)
)));
const mobileSearchRootRule = cssRules.find(({ selector, declarations }) => (
    declarations.includes('--mobile-search-row-height: 45px;')
    && selector.split(',').some((part) => (
        part.includes("[data-mobile-ui='1']") && part.trim().endsWith('.search-ui')
    ))
));
assert.match(mobileSearchRootRule?.declarations || '', /height:\s*var\(--mobile-search-panel-height\);/);
assert.match(
    mobileSearchRootRule?.declarations || '',
    /transition:\s*height var\(--mobile-search-transition-duration\) ease;/,
    'mobile search shell must animate its bottom-anchored height for 0.3 seconds'
);
const mobileSearchShellRule = mobileOnlyRule('.search-ui::before');
assert.match(mobileSearchShellRule?.declarations || '', /border-radius:\s*26px;/);
assert.match(
    mobileSearchShellRule?.declarations || '',
    /transition:[^;]*height var\(--mobile-search-transition-duration\) ease,[^;]*width var\(--mobile-search-transition-duration\) ease,[^;]*border-radius var\(--mobile-search-transition-duration\) ease;/,
    'mobile search shell geometry must transition together'
);
assert.match(
    mobileOnlyRule('.search-ui.is-planner-open > .search-bar')?.declarations || '',
    /height:\s*var\(--mobile-search-row-height\);[^}]*box-sizing:\s*border-box;/,
    'mobile planner first row must be exactly 45px high'
);
assert.match(
    mobileOnlyRule('.search-ui.is-planner-open > .journey-ui .journey-fields')?.declarations || '',
    /gap:\s*10px;/,
    'mobile planner row spacing must bring each additional row to 45px'
);
assert.match(
    mobileOnlyRule('.search-ui.is-planner-open > .journey-ui .journey-input-row')?.declarations || '',
    /min-height:\s*35px;/,
    'mobile planner destination and waypoint content rows must complete a 45px line'
);
assert.match(
    mobileOnlyRule('.search-ui.is-planner-open .search-planner-swap-btn')?.declarations || '',
    /top:\s*34px;/,
    'mobile planner swap button must stay centered on the 45px row boundary'
);
const searchButtonRule = mobileRule('.search-ui > .journey-ui .journey-plan-search-btn');
assert.ok(searchButtonRule, 'the shared independent-button styling must retain mobile positioning');
assert.match(searchButtonRule.declarations, /position:\s*fixed;/);
assert.match(searchButtonRule.declarations, /right:\s*12px;/);
assert.match(searchButtonRule.declarations, /bottom:\s*var\(--mobile-search-field-bottom\);/);
assert.match(searchButtonRule.declarations, /width:\s*44px;/);
const splitSearchButtonRule = mobileOnlyRule('.search-ui.is-planner-open > .journey-ui .journey-plan-search-btn');
assert.ok(splitSearchButtonRule, 'mobile planner search must occupy the lower action-column section');
assert.match(
    splitSearchButtonRule.declarations,
    /height:\s*var\(--mobile-search-submit-height\);[^}]*border-radius:\s*50%;/,
    'mobile planner search must remain a fixed circular action button'
);
const collapseButtonRule = mobileOnlyRule('.search-ui.is-planner-open > .search-bar .search-planner-toggle-btn');
assert.ok(collapseButtonRule, 'mobile planner collapse must occupy its own upper action-column section');
assert.match(collapseButtonRule.declarations, /position:\s*fixed;/);
assert.match(collapseButtonRule.declarations, /right:\s*12px;/);
assert.match(collapseButtonRule.declarations, /width:\s*44px;/);
assert.match(collapseButtonRule.declarations, /height:\s*var\(--mobile-search-collapse-height\);/);
assert.match(collapseButtonRule.declarations, /border-radius:\s*50%;/);
assert.match(
    collapseButtonRule.declarations,
    /bottom:\s*calc\([^)]*var\(--mobile-search-field-bottom\)[^)]*var\(--mobile-search-submit-height\)[^)]*var\(--mobile-search-action-gap\)[^)]*\);/
);
assert.match(
    mobileOnlyRule('.search-ui.is-planner-open > .search-bar .search-planner-origin-control')?.declarations || '',
    /padding-right:\s*calc\(var\(--search-planner-swap-size\) \+ 8px\);/,
    'mobile planner first-row controls must retain the detached toggle space'
);
assert.match(
    mobileOnlyRule('.search-ui.is-planner-open > .search-bar .search-planner-toggle-btn::before')?.declarations || '',
    /mask:\s*url\('\.\.\/\.\.\/assets\/icons\/x\.svg'\)/,
    'mobile planner collapse must render the existing x.svg icon'
);
assert.match(cssSource, /--mobile-search-action-gap:\s*2px;/);
assert.match(cssSource, /--mobile-search-collapse-height:\s*44px;/);
assert.match(cssSource, /--mobile-search-submit-height:\s*44px;/);
assert.match(
    mobileRule('.search-ui.is-planner-open')?.declarations || '',
    /padding-right:\s*52px;/,
    'both origin and destination rows must reserve the independent button column'
);
assert.match(
    mobileRule('.search-ui.is-planner-open::before')?.declarations || '',
    /width:\s*calc\(100% - 52px\);/,
    'the card background must end before the independent button column'
);
assert.match(
    mobileRule('.search-ui.is-planner-open::before')?.declarations || '',
    /box-sizing:\s*border-box;/,
    'the card background border must be included in the same height as the button'
);
assert.match(
    cssSource,
    /@media\s*\(min-width:\s*600px\)\s*\{[^{}]*\.search-planner-toggle-btn,[^{}]*\.journey-plan-search-btn[^{}]*\{\s*right:\s*calc\(100vw - var\(--mobile-foldable-pane-width\)\);/,
    'wide mobile layouts must keep both action-column buttons beside the left-half planner'
);
assert.match(
    mobileRule('.journey-plan-search-btn:disabled')?.declarations || '',
    /cursor:\s*not-allowed;/,
    'disabled buttons must have disabled visual affordance'
);
assert.match(
    mobileRule('.journey-plan-search-btn:disabled .journey-plan-search-icon')?.declarations || '',
    /opacity:\s*0\.3;/,
    'disabled buttons must mute the search icon'
);
const readyRule = mobileRule('.journey-plan-search-btn.is-ready');
assert.ok(readyRule, 'complete mobile inputs must have ready-only styling');
assert.match(readyRule.declarations, /border-color:\s*var\(--is-active-color\);/);
assert.match(
    readyRule.declarations,
    /box-shadow:[^;]*rgba\(52, 152, 219,[^;]*;/,
    'ready-only shadow must use the blue brand color'
);
assert.match(
    mobileRule('.journey-ui.is-mobile-plan-results .journey-plan-search-btn')?.declarations || '',
    /display:\s*none\s*(?:!important)?;/,
    'the existing mobile results presentation must continue hiding the search button'
);

const desktopRootRules = desktopRules('.search-ui.is-planner-open');
assert.ok(desktopRootRules.some(({ declarations }) => /width:\s*372px;/.test(declarations)));
assert.ok(
    desktopRootRules.some(({ declarations }) => /padding-right:\s*52px;/.test(declarations)),
    'the 372px desktop shell must keep the original 320px input card and reserve the separate button column'
);
const desktopButtonRules = desktopRules('.search-ui.is-planner-open > .journey-ui .journey-plan-search-btn');
assert.ok(desktopButtonRules.some(({ declarations }) => /position:\s*fixed;/.test(declarations)));
assert.ok(desktopButtonRules.some(({ declarations }) => /width:\s*44px;/.test(declarations)));
const desktopPositionRule = desktopButtonRules.find(({ declarations }) => /top:\s*10px;/.test(declarations));
assert.ok(desktopPositionRule, 'desktop must override the shared mobile bottom positioning');
assert.match(desktopPositionRule.declarations, /left:\s*calc\(20px \+ min\(372px, calc\(100vw - 20px\)\) - 44px\);/);
assert.match(desktopPositionRule.declarations, /right:\s*auto;/);
assert.match(desktopPositionRule.declarations, /bottom:\s*auto;/);
assert.match(
    desktopPositionRule.declarations,
    /height:\s*var\(--search-planner-card-height\);/,
    'desktop button height must follow the planner card including additional waypoint rows'
);
assert.match(cssSource, /--search-planner-card-height:\s*calc\(86px \+ var\(--journey-waypoint-extra-height\)\);/);
assert.match(
    desktopRules('.search-ui > .journey-ui .journey-plan-results')[0]?.declarations || '',
    /width:\s*calc\(100% \+ var\(--search-planner-journey-left-inset\) \+ var\(--search-planner-right-inset\)\);/,
    'desktop result panels must retain the original card-width calculation'
);
assert.ok(
    desktopRules('.journey-plan-search-btn:disabled').some(({ declarations }) => /box-shadow:\s*none;/.test(declarations)),
    'independent desktop buttons must reuse the disabled appearance'
);
assert.ok(
    desktopRules('.journey-plan-search-btn.is-ready').some(({ declarations }) => (
        /border-color:\s*var\(--is-active-color\);/.test(declarations)
        && /box-shadow:[^;]*rgba\(52, 152, 219,[^;]*;/.test(declarations)
    )),
    'independent desktop buttons must reuse the ready border and blue light-theme glow'
);

console.log('mobile journey search button smoke ok');
