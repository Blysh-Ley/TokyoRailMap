// 图内缩放和移动属于展示状态，统一通过 dispatch 修改。
export const createLineServiceDiagramViewStore = () => {
    let state = { x: 0, y: 0, scale: 1 };
    const listeners = new Set();
    return {
        getState: () => state,
        dispatch(action) {
            if (action.type === 'set') state = { ...state, ...action.payload };
            else if (action.type === 'move') state = { ...state, x: state.x + action.payload.x, y: state.y + action.payload.y };
            else if (action.type === 'zoom') {
                const { factor, x, y, deltaX = 0, deltaY = 0 } = action.payload;
                state = { scale: state.scale * factor, x: x - (x - state.x) * factor + deltaX, y: y - (y - state.y) * factor + deltaY };
            }
            for (const listener of listeners) listener(state);
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};
