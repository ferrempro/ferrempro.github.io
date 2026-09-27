const { test } = require('node:test');
const assert = require('node:assert/strict');
const civil = require('../civil-calculator.js');

test('f\'c 250 usa la dosificación RemPro 2026', () => {
  const r = civil.calcConcrete({ directVolume: 1, fc: 250, bagWeight: 50, wasteCement: 0, wasteSand: 0, wasteThird: 0 });
  assert.equal(r.volumeM3, 1);
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 8);
  assert.equal(r.materials.find(x => x.key === 'sand').quantity, 0.504);
  assert.equal(r.materials.find(x => x.key === 'gravel').quantity, 0.72);
  assert.equal(r.materials.find(x => x.key === 'water').quantity, 216);
});

test('concreto f\'c 200 conserva la tabla Excel para 1 m3', () => {
  const r = civil.calcConcrete({ directVolume: 1, fc: 200, bagWeight: 50, wasteCement: 0, wasteSand: 0, wasteThird: 0 });
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 6.96);
  assert.equal(r.materials.find(x => x.key === 'sand').quantity, 0.555);
  assert.equal(r.materials.find(x => x.key === 'gravel').quantity, 0.64);
  assert.equal(r.materials.find(x => x.key === 'water').quantity, 250);
});

test('mortero 1:4 reproduce dosificación base del Excel', () => {
  const r = civil.calcMortar({ directVolume: 2, mix: '.1:4', bagWeight: 50, wasteCement: 0, wasteSand: 0, wasteThird: 0 });
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 14.56);
  assert.equal(r.materials.find(x => x.key === 'sand').quantity, 2.08);
  assert.equal(r.materials.find(x => x.key === 'water').quantity, 520);
});

test('volumen por geometría usa largo x ancho x espesor', () => {
  assert.equal(civil.resolveVolume({ length: 10, width: 2, thickness: 0.15 }), 3);
});


test('muro de block descuenta vanos y redondea piezas completas con desperdicio', () => {
  const r = civil.calcMasonryWall({
    length: 2, height: 2, openingArea: 0,
    unitLength: 0.40, unitHeight: 0.20, unitDepth: 0.12,
    jointHorizontal: 0.01, jointVertical: 0.01,
    plasterFaces: 2, plasterThickness: 0.015,
    mix: '.1:4', bagWeight: 50,
    wasteUnits: 5, wasteMortar: 10,
    wasteCement: 0, wasteSand: 0, wasteThird: 0,
    unitLabel: 'Block 12 × 20 × 40 cm'
  });
  assert.equal(r.type, 'masonry_wall');
  assert.equal(r.netAreaM2, 4);
  assert.equal(r.pieceCount, 49);
  assert.equal(r.plasterFaces, 2);
  assert.equal(r.layingMortarM3, 0.0374);
  assert.equal(r.plasterMortarM3, 0.132);
  assert.equal(r.volumeM3, 0.1694);
  assert.equal(r.materials.find(x => x.key === 'masonry_units').quantity, 49);
});

test('muro de mampostería valida vanos y espesor de repellado', () => {
  assert.throws(() => civil.calcMasonryWall({
    length: 2, height: 2, openingArea: 4,
    unitLength: 0.40, unitHeight: 0.20, unitDepth: 0.12,
    jointHorizontal: 0.01, jointVertical: 0.01,
    plasterFaces: 0
  }), /vanos/);

  assert.throws(() => civil.calcMasonryWall({
    length: 2, height: 2, openingArea: 0,
    unitLength: 0.40, unitHeight: 0.20, unitDepth: 0.12,
    jointHorizontal: 0.01, jointVertical: 0.01,
    plasterFaces: 1, plasterThickness: 0
  }), /espesor/);
});

test('preset block15 conserva dimensiones editables de referencia', () => {
  assert.deepEqual(civil.masonryUnits.block15, {
    label: 'Block de concreto 15 × 20 × 40 cm',
    length: 0.40,
    height: 0.20,
    depth: 0.15
  });
});
