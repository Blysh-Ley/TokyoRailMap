import assert from 'node:assert/strict';

import { createPanelDirFilterPopoverController } from '../src/features/panel/panelDirFilterPopoverController.js';

assert.equal(typeof createPanelDirFilterPopoverController, 'function');

console.log('panel dir filter popover controller smoke ok');
