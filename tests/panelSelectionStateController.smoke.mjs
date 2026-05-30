import assert from 'node:assert/strict';

import { createPanelSelectionStateController } from '../src/features/panel/panelSelectionStateController.js';

{
    const state = createPanelSelectionStateController();

    assert.equal(state.getCurrentPinnedInteractionKey(), '');
    assert.equal(state.hasPinnedPanelState(), false);

    state.setPinnedPanelSelection('line', 'L1');
    assert.deepEqual(state.getPinnedPanelSelection(), { kind: 'line', key: 'L1' });
    assert.equal(state.getCurrentPinnedInteractionKey(), 'line:L1');
    assert.equal(state.hasPinnedPanelState(), true);

    state.setPinnedPanelSelection('company', 'JR-East');
    assert.equal(state.getCurrentPinnedInteractionKey(), 'company:JR-East');

    state.setPinnedPanelSelection('', '');
    assert.equal(state.getPinnedPanelSelection(), null);
    assert.equal(state.getCurrentPinnedInteractionKey(), '');
}

{
    const state = createPanelSelectionStateController();

    state.setPinnedDirPreviewKey('L1||Outbound');
    assert.equal(state.getPinnedDirPreviewKey(), 'L1||Outbound');
    assert.equal(state.getCurrentPinnedInteractionKey(), 'dir:L1||Outbound');
    assert.equal(state.isDirFilterPinned(), false);

    state.setPinnedPanelSelection('dir', 'L1||Outbound');
    assert.equal(state.getCurrentPinnedInteractionKey(), 'dir:L1||Outbound');
    assert.equal(state.isDirFilterPinned(), true);

    state.setPinnedPanelSelection('dir', 'L1||Inbound');
    assert.equal(state.isDirFilterPinned(), false);

    state.clearPinnedDirPreviewKey();
    assert.equal(state.getPinnedDirPreviewKey(), '');
    assert.equal(state.getCurrentPinnedInteractionKey(), 'dir:L1||Inbound');
}

{
    const state = createPanelSelectionStateController();

    state.setPinnedPanelSelection('line', 'L2');
    assert.equal(state.getCurrentPinnedInteractionKey({
        tripLocked: true,
        lockedTripKey: 'L3||T1'
    }), 'trip:L3||T1');

    state.clearPinnedState();
    assert.equal(state.getCurrentPinnedInteractionKey(), '');
    assert.equal(state.getPinnedPanelSelection(), null);
    assert.equal(state.getPinnedDirPreviewKey(), '');
}

console.log('panel selection state controller smoke ok');
