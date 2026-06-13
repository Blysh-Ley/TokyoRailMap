import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    MOBILE_BOTTOM_NAV_EVENT,
    MOBILE_BOTTOM_NAV_ITEMS
} from '../src/ui/mobileBottomNav.js';

assert.equal(MOBILE_BOTTOM_NAV_EVENT, 'tokyoRail:mobileNavSelect');
assert.deepEqual(
    MOBILE_BOTTOM_NAV_ITEMS.map((item) => item.id),
    ['map', 'menu', 'search', 'settings']
);
assert.deepEqual(
    MOBILE_BOTTOM_NAV_ITEMS.map((item) => item.label),
    ['地图', 'Menu', '搜索', '设置']
);

const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');
assert.match(appSource, /installMobileBottomNav\(\)/);
assert.match(appSource, /mobileBottomNavController\s*=\s*installMobileBottomNav\(\)/);
assert.match(appSource, /if\s*\(isMobileUiMode\(\)\)\s*\{[\s\S]*mobileBottomNavController\?\.setActive\?\.\('map',\s*\{\s*emit:\s*false\s*\}\)/);

const cssSource = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
const tokensSource = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

assert.match(tokensSource, /--ui-frosted-background:\s*rgba\(255,\s*255,\s*255,\s*[0-9.]+\)/);
assert.match(tokensSource, /--ui-frosted-border:\s*var\(--ui-border\)/);
assert.match(tokensSource, /--ui-frosted-shadow:\s*0 2px 6px rgba\(0,\s*0,\s*0,\s*0\.2\)/);
assert.match(tokensSource, /--ui-frosted-blur:\s*blur\(4px\)/);
assert.match(tokensSource, /--ui-frosted-item-background:\s*rgba\(255,\s*255,\s*255,\s*[0-9.]+\)/);
assert.match(tokensSource, /html\[data-theme='dark'\]\s*\{[\s\S]*--ui-frosted-background:\s*rgba\(28,\s*28,\s*28,\s*0\.82\)/);
assert.match(tokensSource, /html\[data-theme='dark'\]\s*\{[\s\S]*--ui-frosted-item-background:\s*rgba\(28,\s*28,\s*28,\s*[0-9.]+\)/);

assert.match(cssSource, /\.mobile-bottom-nav/);
assert.match(cssSource, /data-mobile-ui='1'[\s\S]*\.mobile-bottom-nav/);
assert.match(cssSource, /data-mobile-search-mode='station'[\s\S]*\.search-ui/);
assert.match(cssSource, /data-mobile-search-mode='journey'[\s\S]*\.journey-ui/);
assert.match(cssSource, /mobile-search-mode-switch/);
assert.match(cssSource, /\.search-ui::before\s*\{[\s\S]*background:\s*var\(--ui-frosted-background\)/);
assert.match(cssSource, /\.journey-ui::before\s*\{[\s\S]*background:\s*var\(--ui-frosted-background\)/);
assert.match(cssSource, /\.search-results\s*\{[\s\S]*background:\s*transparent[\s\S]*backdrop-filter:\s*none/);
assert.match(cssSource, /\.search-results-list\s*\{[\s\S]*background:\s*var\(--ui-frosted-background\)/);
assert.match(cssSource, /\.journey-results\s*\{[\s\S]*background:\s*transparent[\s\S]*backdrop-filter:\s*none/);
assert.match(cssSource, /\.journey-plan-results\s*\{[\s\S]*background:\s*transparent[\s\S]*backdrop-filter:\s*none/);
assert.match(cssSource, /\.journey-plan-item\s*\{[\s\S]*background:\s*var\(--ui-frosted-background\)/);
assert.match(cssSource, /\.settings-content\s*\{[\s\S]*background:\s*var\(--ui-frosted-background\)/);
assert.match(cssSource, /\.settings-item\s*\{[\s\S]*background:\s*var\(--ui-frosted-item-background\)/);
assert.match(cssSource, /\.mobile-search-mode-switch\s*\{[\s\S]*background:\s*var\(--ui-frosted-background\)/);
assert.match(cssSource, /\.mobile-bottom-nav\s*\{[\s\S]*background:\s*var\(--ui-frosted-background\)/);
assert.match(cssSource, /data-theme='dark'[\s\S]*\.mobile-bottom-nav/);
assert.match(cssSource, /data-theme='dark'[\s\S]*\.mobile-bottom-nav-btn\.is-active/);
assert.match(cssSource, /data-theme='dark'[\s\S]*\.mobile-search-mode-switch/);
assert.match(cssSource, /data-theme='dark'[\s\S]*\.mobile-search-mode-btn\.is-active/);
assert.match(cssSource, /is-mobile-results[\s\S]*\.search-results/);
assert.match(cssSource, /data-mobile-search-focus='station'[\s\S]*\.journey-results/);
assert.match(cssSource, /data-mobile-search-focus='journey'[\s\S]*\.search-results/);
assert.match(cssSource, /data-mobile-nav-active='settings'[\s\S]*\.settings-ui/);
assert.match(cssSource, /data-mobile-nav-active='settings'[\s\S]*\.settings-fab\s*\{[\s\S]*display:\s*none/);
assert.match(cssSource, /data-mobile-nav-active='settings'[\s\S]*\.settings-content\.is-hidden\s*\{[\s\S]*opacity:\s*1/);
assert.match(cssSource, /data-mobile-nav-active='settings'[\s\S]*\.settings-item-hover-preview\s*\{[\s\S]*display:\s*none/);
assert.match(cssSource, /@media print[\s\S]*\.mobile-bottom-nav/);

const moduleSource = readFileSync(join(process.cwd(), 'src/ui/mobileBottomNav.js'), 'utf8');
assert.match(moduleSource, /Lucide is ISC licensed/);
assert.match(moduleSource, /lucide\.dev\/icons\/map/);
assert.match(moduleSource, /lucide\.dev\/license/);
assert.match(moduleSource, /tokyoRail:mobileNavSelect/);
assert.match(moduleSource, /\.journey-ui/);
assert.match(moduleSource, /mobile-search-mode-switch/);
assert.match(moduleSource, /mobileSearchMode/);
assert.match(moduleSource, /openMobileSettingsPanel/);
assert.match(moduleSource, /label: '搜索'/);
assert.match(moduleSource, /label: '路线规划'/);

const settingsMenuSource = readFileSync(join(process.cwd(), 'src/features/settings/settingsMenu.js'), 'utf8');
assert.match(settingsMenuSource, /isMobileSettingsActive/);
assert.match(settingsMenuSource, /dataset\?\.mobileNavActive\s*===\s*'settings'/);

const searchSource = readFileSync(join(process.cwd(), 'src/features/search/search.js'), 'utf8');
assert.match(searchSource, /is-mobile-history/);
assert.match(searchSource, /is-mobile-results/);
assert.match(searchSource, /mobileSearchFocus = 'station'/);
assert.match(searchSource, /输入后先切换成结果态/);

const searchSelectionControllerSource = readFileSync(join(process.cwd(), 'src/features/search/searchSelectionController.js'), 'utf8');
assert.match(searchSelectionControllerSource, /collapseMobileSearch:\s*true/);

const journeySearchSource = readFileSync(join(process.cwd(), 'src/features/search/travel-search-ui.js'), 'utf8');
assert.match(journeySearchSource, /mobileSearchFocus = 'journey'/);

console.log('mobile bottom nav smoke ok');
