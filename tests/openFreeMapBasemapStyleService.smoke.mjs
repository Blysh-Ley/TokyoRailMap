import assert from 'node:assert/strict';

import {
    BASEMAP_TEXT_FONT_STACK,
    createOpenFreeMapBasemapStyle
} from '../src/services/openFreeMapBasemapStyleService.js';
import { selectOpenFreeMapStyleUrl } from '../src/domain/openFreeMapBasemap.js';
import { BASEMAP_GLYPHS_URL } from '../src/services/mapEngine.js';

assert.equal(
    selectOpenFreeMapStyleUrl({ mode: 'osm-detailed', theme: 'light' }),
    'https://tiles.openfreemap.org/styles/bright'
);
assert.equal(
    selectOpenFreeMapStyleUrl({ mode: 'osm-detailed', theme: 'dark' }),
    'https://tiles.openfreemap.org/styles/dark'
);
assert.equal(
    selectOpenFreeMapStyleUrl({ mode: 'osm-3d', theme: 'light' }),
    'https://tiles.openfreemap.org/styles/liberty'
);

const descriptor = createOpenFreeMapBasemapStyle({
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    mode: 'osm-white',
    theme: 'light',
    styleJson: {
        version: 8,
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: {
            openmaptiles: {
                type: 'vector',
                tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf']
            }
        },
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#faf9f4' }
            },
            {
                id: 'place-labels',
                type: 'symbol',
                source: 'openmaptiles',
                'source-layer': 'place',
                layout: {
                    'text-field': ['get', 'name'],
                    'text-font': 'Noto Sans Regular',
                    'icon-image': ['get', 'class']
                }
            },
            {
                id: 'poi-icons',
                type: 'symbol',
                source: 'openmaptiles',
                'source-layer': 'poi',
                layout: {
                    'icon-image': ['get', 'class']
                }
            },
            {
                id: 'building-3d',
                type: 'fill-extrusion',
                source: 'openmaptiles',
                'source-layer': 'building',
                paint: {
                    'fill-extrusion-height': ['get', 'render_height']
                }
            }
        ]
    }
});

assert.equal(descriptor.style.glyphs, BASEMAP_GLYPHS_URL);
assert.equal(descriptor.style.layers.length, 2);
assert.equal(descriptor.style.layers[0].id, 'online-basemap-layer-place-labels');
assert.deepEqual(descriptor.style.layers[0].layout['text-font'], BASEMAP_TEXT_FONT_STACK);
assert.equal(Object.hasOwn(descriptor.style.layers[0].layout, 'icon-image'), false);
assert.equal(descriptor.style.layers[1].id, 'online-basemap-layer-building-3d');
assert.equal(descriptor.style.layers[1].type, 'fill-extrusion');
assert.equal(descriptor.backgroundColor, '#faf9f4');
assert.equal(descriptor.primarySourceId, 'online-basemap-source-openmaptiles');

const dark3dDescriptor = createOpenFreeMapBasemapStyle({
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    mode: 'osm-3d',
    theme: 'dark',
    styleJson: {
        version: 8,
        sources: {
            openmaptiles: {
                type: 'vector',
                tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf']
            }
        },
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#f8f4f0' }
            },
            {
                id: 'water',
                type: 'fill',
                source: 'openmaptiles',
                'source-layer': 'water',
                paint: { 'fill-color': 'rgb(158,189,255)' }
            },
            {
                id: 'label_city',
                type: 'symbol',
                source: 'openmaptiles',
                'source-layer': 'place',
                layout: { 'text-field': ['get', 'name'] },
                paint: {
                    'text-color': '#000',
                    'text-halo-color': '#fff',
                    'text-halo-width': 1
                }
            },
            {
                id: 'building-3d',
                type: 'fill-extrusion',
                source: 'openmaptiles',
                'source-layer': 'building',
                paint: {
                    'fill-extrusion-color': 'hsl(35,8%,85%)',
                    'fill-extrusion-height': ['get', 'render_height']
                }
            }
        ]
    }
});

assert.equal(dark3dDescriptor.backgroundColor, '#101418');
assert.equal(
    dark3dDescriptor.style.layers.find((layer) => layer.id === 'online-basemap-layer-water').paint['fill-color'],
    '#1d3a4a'
);
assert.equal(
    dark3dDescriptor.style.layers.find((layer) => layer.id === 'online-basemap-layer-label_city').paint['text-halo-color'],
    '#101418'
);
assert.equal(
    dark3dDescriptor.style.layers.find((layer) => layer.id === 'online-basemap-layer-building-3d').paint['fill-extrusion-color'],
    '#30363c'
);

console.log('openfreemap basemap style service smoke ok');
