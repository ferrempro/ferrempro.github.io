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

test('columna cuantifica concreto, acero longitudinal, estribos y cimbra', () => {
  const r = civil.calcColumn({
    width: 0.25, depth: 0.30, height: 3, count: 2,
    longitudinalBars: 6, longitudinalDiameter: 12.7, extraBarLength: 0.60,
    stirrupDiameter: 6, stirrupSpacing: 0.20, stirrupMultiplicity: 1,
    cover: 0.025, hookLength: 0.10,
    fc: 250, bagWeight: 50,
    wasteCement: 0, wasteSand: 0, wasteThird: 0,
    wasteSteel: 5, wasteFormwork: 5
  });
  assert.equal(r.type, 'column');
  assert.equal(r.volumeM3, 0.45);
  assert.equal(r.count, 2);
  assert.equal(r.stirrupCount, 32);
  assert.equal(r.longitudinalLengthM, 45.36);
  assert.equal(r.stirrupLengthM, 36.96);
  assert.equal(r.longitudinalSteelKg, 45.16);
  assert.equal(r.stirrupSteelKg, 8.21);
  assert.equal(r.steelKg, 53.37);
  assert.equal(r.formworkM2, 6.93);
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 3.6);
});

test('columna exige armado mínimo y recubrimiento geométricamente válido', () => {
  const base = {
    width: 0.20, depth: 0.20, height: 3, count: 1,
    longitudinalBars: 4, longitudinalDiameter: 12.7,
    stirrupDiameter: 6, stirrupSpacing: 0.20, stirrupMultiplicity: 1,
    cover: 0.025, hookLength: 0.10, fc: 250
  };
  assert.throws(() => civil.calcColumn({ ...base, longitudinalBars: 3 }), /cuatro varillas/);
  assert.throws(() => civil.calcColumn({ ...base, count: 1.5 }), /número de columnas/);
  assert.throws(() => civil.calcColumn({ ...base, cover: 0.10 }), /recubrimiento/);
  assert.throws(() => civil.calcColumn({ ...base, stirrupMultiplicity: 4 }), /simple, doble o triple/);
});

test('trabe cuantifica concreto, acero longitudinal, estribos y cimbra a tres caras', () => {
  const r = civil.calcBeam({
    width: 0.25, depth: 0.40, length: 4, count: 2,
    topBars: 2, bottomBars: 3, longitudinalDiameter: 12.7, extraBarLength: 0.60,
    stirrupDiameter: 6, stirrupSpacing: 0.20, stirrupMultiplicity: 1,
    cover: 0.025, hookLength: 0.10,
    fc: 250, bagWeight: 50,
    wasteCement: 0, wasteSand: 0, wasteThird: 0,
    wasteSteel: 5, wasteFormwork: 5
  });
  assert.equal(r.type, 'beam');
  assert.equal(r.volumeM3, 0.8);
  assert.equal(r.count, 2);
  assert.equal(r.stirrupCount, 42);
  assert.equal(r.longitudinalLengthM, 48.3);
  assert.equal(r.stirrupLengthM, 57.33);
  assert.equal(r.longitudinalSteelKg, 48.09);
  assert.equal(r.stirrupSteelKg, 12.74);
  assert.equal(r.steelKg, 60.83);
  assert.equal(r.formworkM2, 8.82);
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 6.4);
});

test('trabe valida armado, número de elementos y recubrimiento', () => {
  const base = {
    width: 0.20, depth: 0.35, length: 3, count: 1,
    topBars: 2, bottomBars: 2, longitudinalDiameter: 12.7,
    stirrupDiameter: 6, stirrupSpacing: 0.20, stirrupMultiplicity: 1,
    cover: 0.025, hookLength: 0.10, fc: 250
  };
  assert.throws(() => civil.calcBeam({ ...base, topBars: 0 }), /superior/);
  assert.throws(() => civil.calcBeam({ ...base, count: 1.5 }), /número de trabes/);
  assert.throws(() => civil.calcBeam({ ...base, cover: 0.10 }), /recubrimiento/);
  assert.throws(() => civil.calcBeam({ ...base, stirrupMultiplicity: 4 }), /simple, doble o triple/);
});
