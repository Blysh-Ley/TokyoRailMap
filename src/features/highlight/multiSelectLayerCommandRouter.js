import {
    MULTI_SELECT_LAYER_ACTION_REMOVE,
    MULTI_SELECT_LAYER_ACTION_SPLIT_COMPANY,
    MULTI_SELECT_LAYER_ACTION_TOGGLE_BRANCH_PREVIEW,
    MULTI_SELECT_LAYER_ACTION_TOGGLE_VISIBILITY,
    MULTI_SELECT_LAYER_SCOPE_BASE,
    MULTI_SELECT_LAYER_SCOPE_TRIP,
    parseMultiSelectLayerCommand
} from '../../domain/multiSelectLayerProtocol.js';

const callHandler = (handler, key, command) => (
    typeof handler === 'function' ? handler(key, command) === true : false
);

export const runMultiSelectLayerCommandFromInputs = ({
    action,
    itemId,
    handlers = {}
} = {}) => {
    const command = parseMultiSelectLayerCommand({ action, itemId });
    if (!command) return false;

    if (command.scope === MULTI_SELECT_LAYER_SCOPE_BASE) {
        const base = handlers.base || {};
        if (command.action === MULTI_SELECT_LAYER_ACTION_TOGGLE_VISIBILITY) {
            return callHandler(base.toggleVisibility, command.key, command);
        }
        if (command.action === MULTI_SELECT_LAYER_ACTION_TOGGLE_BRANCH_PREVIEW) {
            return callHandler(base.toggleBranchPreview, command.key, command);
        }
        if (command.action === MULTI_SELECT_LAYER_ACTION_REMOVE) {
            return callHandler(base.remove, command.key, command);
        }
        if (command.action === MULTI_SELECT_LAYER_ACTION_SPLIT_COMPANY) {
            return callHandler(base.splitCompany, command.key, command);
        }
        return false;
    }

    if (command.scope === MULTI_SELECT_LAYER_SCOPE_TRIP) {
        const trip = handlers.trip || {};
        if (command.action === MULTI_SELECT_LAYER_ACTION_TOGGLE_VISIBILITY) {
            return callHandler(trip.toggleVisibility, command.key, command);
        }
        if (command.action === MULTI_SELECT_LAYER_ACTION_REMOVE) {
            return callHandler(trip.remove, command.key, command);
        }
    }

    return false;
};
