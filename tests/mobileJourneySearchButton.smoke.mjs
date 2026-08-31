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

const assertAvailability = ({ inputs, mobile = true, disabled, ready, message }) => {
    const valuesBefore = inputs.map((input) => input.value);
    syncJourneySearchButtonAvailability({ button, inputs, mobile });
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
    /const syncPlanSearchButton = \(\) => syncJourneySearchButtonAvailability\(\{[\s\S]*?button: planSearchBtn,[\s\S]*?inputs: \[originInput, destinationInput, \.\.\.waypointRows\.map\(\(row\) => row\.input\)\],[\s\S]*?mobile: document\.documentElement\?\.dataset\?\.mobileUi === '1'[\s\S]*?document\.body\?\.dataset\?\.mobileUi === '1'[\s\S]*?\}\);\s*syncPlanSearchButton\(\);/,
    'the UI must initialize button state from all visible endpoint fields and mobile presentation flags'
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
const cssRules = Array.from(cssSource.matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selector, declarations]) => ({
    selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    declarations
}));
const mobileRule = (ending) => cssRules.find(({ selector }) => (
    selector.includes("[data-mobile-ui='1']")
    && selector.split(',').some((part) => part.trim().endsWith(ending))
));
const searchButtonRule = mobileRule('.search-ui > .journey-ui .journey-plan-search-btn');
assert.ok(searchButtonRule, 'the independent button must have mobile-only positioning');
assert.match(searchButtonRule.declarations, /position:\s*fixed;/);
assert.match(searchButtonRule.declarations, /right:\s*12px;/);
assert.match(searchButtonRule.declarations, /bottom:\s*var\(--mobile-search-field-bottom\);/);
assert.match(searchButtonRule.declarations, /width:\s*44px;/);
assert.match(
    searchButtonRule.declarations,
    /height:\s*var\(--mobile-search-panel-height\);/,
    'the independent button must share the planner card height, including added waypoints'
);
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
    /@media\s*\(min-width:\s*600px\)\s*\{\s*html\[data-mobile-ui='1'\]\[data-mobile-nav-active='search'\] \.search-ui > \.journey-ui \.journey-plan-search-btn,[^{}]*\{\s*right:\s*calc\(100vw - var\(--mobile-foldable-pane-width\)\);/,
    'wide mobile layouts must keep the button beside the left-half planner instead of the viewport edge'
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

console.log('mobile journey search button smoke ok');
