import assert from 'node:assert/strict';
import { createSearchSelectionController } from '../src/features/search/searchSelectionController.js';
import { createRoutePreviewViewportController } from '../src/ui/routePreviewViewport.js';
import { createMobileTripFitBoundsController } from '../src/services/mobileTripFitBounds.js';

const coordinates = [140.024, 35.684];
const createController = () => {
    const fits = [];
    const panels = [];
    const controller = createSearchSelectionController({
        store: { dispatch() {} },
        searchFeature: {},
        hoverApi: { beginPreview: () => true },
        findStationLabelItemById: (stationId) => ({
            props: { id: stationId },
            coordinates
        }),
        fitToPointAsBounds: (...args) => fits.push(args),
        openPanelForStationWithAutoScroll: (...args) => panels.push(args)
    });
    return { controller, fits, panels };
};

{
    const { controller, fits, panels } = createController();
    controller.commitStation('Keisei.Main.KeiseiTsudanuma', { maxZoom: 12 });
    assert.equal(fits.length, 0, '打开面板时应等待最终预览，避免先放大到站点');
    assert.equal(panels.length, 1);
    panels[0][1].onTimetablesRendered({ stationPreviewApplied: true });
    assert.equal(fits.length, 0, '面板预览已定位时不得再次缩放');
}

{
    const { controller, fits, panels } = createController();
    controller.commitStation('Station.WithoutTrips', { maxZoom: 12 });
    panels[0][1].onTimetablesRendered({ stationPreviewApplied: false });
    assert.deepEqual(fits, [[coordinates, { maxZoom: 12 }]], '无可预览班次时仍需定位到站点');
}

{
    const { controller, fits, panels } = createController();
    controller.commitStation('Station.WithNewInteraction');
    panels[0][1].onTimetablesRendered({});
    assert.equal(fits.length, 0, '没有完成预览尝试时不得以站点定位覆盖新的交互');
}

{
    const { controller, fits, panels } = createController();
    controller.previewStation('Station.Preview', { maxZoom: 12 });
    assert.deepEqual(fits, [[coordinates, { maxZoom: 12 }]], '搜索结果悬停仍应预览站点位置');
    assert.equal(panels.length, 0);
}

{
    const { controller, fits, panels } = createController();
    controller.commitStation('Station.WithoutPanel', { showPanel: false, maxZoom: 12 });
    assert.deepEqual(fits, [[coordinates, { maxZoom: 12 }]], '不打开面板的确认入口仍应定位到站点');
    assert.equal(panels.length, 0);
}

// 高亮路径可传入较短过渡，桌面和移动端都须保留相同的目标范围及原默认行为。
{
    const fits = [];
    const mapEngine = { fitBounds: (bounds, options) => fits.push({ bounds, options }) };
    const viewport = createRoutePreviewViewportController({ mapEngine });
    const bbox = { minLng: 139, minLat: 35, maxLng: 140, maxLat: 36 };
    viewport.previewFitWithSidePanels(bbox);
    viewport.previewFitWithSidePanels(bbox, { duration: 200 });
    assert.equal(fits[0].options.duration, 280);
    assert.equal(fits[1].options.duration, 200);
    assert.deepEqual(fits[0].bounds, fits[1].bounds);

    const mobile = createMobileTripFitBoundsController({
        mapEngine,
        getStationCoord: (id) => id === 'A' ? [139, 35] : [140, 36]
    });
    const payload = { segments: [{ stationIds: ['A', 'B'] }] };
    mobile.fitTripPayload(payload);
    mobile.fitTripPayload(payload, { duration: 200 });
    assert.equal(fits[2].options.duration, 300);
    assert.equal(fits[3].options.duration, 200);
    assert.deepEqual(fits[2].bounds, fits[3].bounds);
}

console.log('站点搜索定位回归通过');
