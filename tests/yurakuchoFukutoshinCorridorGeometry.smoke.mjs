import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coordinates = JSON.parse(readFileSync('data/coordinates.json', 'utf8'));
const railways = Array.isArray(coordinates?.railways) ? coordinates.railways : [];

const getCoordRailway = (railwayId) => railways.find((item) => item?.id === railwayId);

const includesPoint = (coords, expected) => {
    if (!Array.isArray(coords) || !Array.isArray(expected)) return false;
    return coords.some((pt) => (
        Array.isArray(pt)
        && Math.abs(Number(pt[0]) - Number(expected[0])) < 1e-9
        && Math.abs(Number(pt[1]) - Number(expected[1])) < 1e-9
    ));
};

const findCorridorSubline = (railwayId) => {
    const railway = getCoordRailway(railwayId);
    assert.ok(railway, `${railwayId} coordinates must exist`);
    const sublines = Array.isArray(railway.sublines) ? railway.sublines : [];
    return sublines.find((subline) => (
        includesPoint(subline?.coords, [139.6782181, 35.7440746])
        && includesPoint(subline?.coords, [139.7046882, 35.7325847])
    ));
};

{
    const yurakuchoCorridor = findCorridorSubline('TokyoMetro.Yurakucho');
    assert.ok(yurakuchoCorridor, 'Yurakucho Kotake-Mukaihara to Ikebukuro corridor subline must exist');
    assert.equal(yurakuchoCorridor.start?.railway, 'Base.KotakeMukaiharaIkebukuro');
    assert.equal(yurakuchoCorridor.end?.railway, 'Base.KotakeMukaiharaIkebukuro');
    assert.equal(Number(yurakuchoCorridor.start?.offset), 0);
    assert.equal(Number(yurakuchoCorridor.end?.offset), 0);
    assert.notEqual(yurakuchoCorridor.start?.railway, 'Seibu.S-Fukutoshin');
    assert.notEqual(yurakuchoCorridor.end?.railway, 'Seibu.S-Fukutoshin');
}

{
    const fukutoshin = getCoordRailway('TokyoMetro.Fukutoshin');
    assert.ok(fukutoshin, 'Fukutoshin coordinates must exist');
    assert.ok(
        fukutoshin.sublines.some((subline) => (
            subline?.start?.railway === 'Base.KotakeMukaiharaIkebukuro'
            && subline?.end?.railway === 'Base.KotakeMukaiharaIkebukuro'
        )),
        'Fukutoshin corridor should keep using the same base corridor geometry'
    );
}

console.log('yurakucho/fukutoshin corridor geometry smoke ok');
