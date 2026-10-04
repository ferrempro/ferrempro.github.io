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


test('zapata con dado cuantifica concreto, parrilla, acero vertical, estribos y cimbra', () => {
  const r = civil.calcFooting({
    length: 2, width: 2, thickness: 0.30, count: 2,
    barsX: 11, barsY: 11, diameter: 12.7, cover: 0.075,
    dadoLength: 0.40, dadoWidth: 0.40, dadoHeight: 0.60,
    dadoBars: 4, dadoDiameter: 12.7, dadoExtraBarLength: 0.60,
    stirrupDiameter: 9.5, stirrupSpacing: 0.20, hookLength: 0.10,
    fc: 250, bagWeight: 50,
    wasteCement: 0, wasteSand: 0, wasteThird: 0,
    wasteSteel: 5, wasteFormwork: 5
  });
  assert.equal(r.type, 'footing');
  assert.equal(r.subtype, 'footing_with_dado');
  assert.equal(r.footingConcreteM3, 2.4);
  assert.equal(r.dadoConcreteM3, 0.192);
  assert.equal(r.volumeM3, 2.592);
  assert.equal(r.dado.stirrupCount, 8);
  assert.ok(r.footingSteelKg > 0);
  assert.ok(r.dadoSteelKg > 0);
  assert.ok(r.formworkM2 > 0);
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 20.74);
  assert.equal(r.materials.find(x => x.key === 'footing_rebar').unit, 'kg');
});

test('zapata aislada omite el dado y valida parrilla, recubrimiento y datos parciales', () => {
  const base = {
    length: 1.5, width: 1.5, thickness: 0.25, count: 1,
    barsX: 9, barsY: 9, diameter: 12.7, cover: 0.075,
    fc: 250, wasteSteel: 5, wasteFormwork: 5
  };
  const r = civil.calcFooting(base);
  assert.equal(r.subtype, 'isolated_footing');
  assert.equal(r.dado, null);
  assert.equal(r.dadoConcreteM3, 0);
  assert.throws(() => civil.calcFooting({ ...base, barsX: 1 }), /dos varillas/);
  assert.throws(() => civil.calcFooting({ ...base, cover: 0.75 }), /recubrimiento/);
  assert.throws(() => civil.calcFooting({ ...base, dadoLength: 0.40 }), /todas las dimensiones/);
});


test('mampostería de piedra descuenta vanos y aplica consumos editables', () => {
  const r = civil.calcStoneMasonry({
    length: 5, height: 2, thickness: 0.40, openingArea: 2,
    stoneFactor: 1.20, mortarFactor: 0.30,
    wasteStone: 5, wasteMortar: 10,
    mix: '.1:4', bagWeight: 50,
    wasteCement: 0, wasteSand: 0, wasteThird: 0
  });
  assert.equal(r.type, 'stone_masonry');
  assert.equal(r.volumeM3, 3.2);
  assert.equal(r.stoneM3, 4.032);
  assert.equal(r.mortarVolumeM3, 1.056);
  assert.equal(r.materials.find(x => x.key === 'stone').quantity, 4.032);
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 7.69);
});

test('mampostería de piedra prioriza volumen directo y valida geometría y coeficientes', () => {
  const direct = civil.calcStoneMasonry({
    directVolume: 2, length: 99, height: 99, thickness: 99, openingArea: 0,
    stoneFactor: 1.10, mortarFactor: 0.25, mix: '.1:4'
  });
  assert.equal(direct.volumeM3, 2);
  assert.equal(direct.stoneM3, 2.2);
  assert.throws(() => civil.calcStoneMasonry({
    length: 2, height: 2, thickness: 0.4, openingArea: 4,
    stoneFactor: 1.2, mortarFactor: 0.3
  }), /vanos/);
  assert.throws(() => civil.calcStoneMasonry({
    directVolume: 1, stoneFactor: 0, mortarFactor: 0.3
  }), /coeficientes/);
});


test('muro de concreto reforzado cuantifica concreto, retícula y cimbra', () => {
  const r = civil.calcReinforcedWall({
    length: 4, height: 3, thickness: 0.15, count: 1, openingArea: 2,
    verticalDiameter: 12.7, verticalSpacing: 0.20,
    horizontalDiameter: 9.5, horizontalSpacing: 0.20,
    reinforcementFaces: 2, extraBarLength: 0.60, formworkFaces: 2,
    fc: 250, bagWeight: 50,
    wasteCement: 0, wasteSand: 0, wasteThird: 0,
    wasteSteel: 5, wasteFormwork: 5
  });
  assert.equal(r.type, 'reinforced_wall');
  assert.equal(r.netAreaM2, 10);
  assert.equal(r.volumeM3, 1.5);
  assert.equal(r.verticalBarsPerFace, 21);
  assert.equal(r.horizontalBarsPerFace, 16);
  assert.equal(r.formworkM2, 21);
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 12);
  assert.ok(r.steelKg > 0);
});

test('muro reforzado valida vanos, retícula, caras y número de elementos', () => {
  const base = {
    length: 4, height: 3, thickness: 0.15, count: 1, openingArea: 0,
    verticalDiameter: 12.7, verticalSpacing: 0.20,
    horizontalDiameter: 9.5, horizontalSpacing: 0.20,
    reinforcementFaces: 2, formworkFaces: 2, fc: 250
  };
  assert.throws(() => civil.calcReinforcedWall({ ...base, openingArea: 12 }), /vanos/);
  assert.throws(() => civil.calcReinforcedWall({ ...base, verticalSpacing: 0 }), /separaciones/);
  assert.throws(() => civil.calcReinforcedWall({ ...base, reinforcementFaces: 3 }), /caras de refuerzo/);
  assert.throws(() => civil.calcReinforcedWall({ ...base, count: 1.5 }), /número de muros/);
});

test('losa de concreto reforzado cuantifica dos parrillas y cimbra inferior', () => {
  const r = civil.calcReinforcedSlab({
    length: 5, width: 4, thickness: 0.12, count: 1,
    diameterX: 9.5, spacingX: 0.20,
    diameterY: 9.5, spacingY: 0.20,
    reinforcementLayers: 2, extraBarLength: 0.40, formworkMode: 'bottom',
    fc: 250, bagWeight: 50,
    wasteCement: 0, wasteSand: 0, wasteThird: 0,
    wasteSteel: 5, wasteFormwork: 5
  });
  assert.equal(r.type, 'reinforced_slab');
  assert.equal(r.areaM2, 20);
  assert.equal(r.volumeM3, 2.4);
  assert.equal(r.barsXPerLayer, 21);
  assert.equal(r.barsYPerLayer, 26);
  assert.equal(r.formworkM2, 21);
  assert.equal(r.materials.find(x => x.key === 'cement').quantity, 19.2);
  assert.ok(r.steelKg > 0);
});

test('losa reforzada admite losa sobre terreno y valida parrillas', () => {
  const base = {
    length: 5, width: 4, thickness: 0.12, count: 1,
    diameterX: 9.5, spacingX: 0.20,
    diameterY: 9.5, spacingY: 0.20,
    reinforcementLayers: 1, formworkMode: 'none', fc: 250
  };
  const r = civil.calcReinforcedSlab(base);
  assert.equal(r.formworkM2, 0);
  assert.equal(r.materials.find(x => x.key === 'formwork').quantity, 0);
  assert.throws(() => civil.calcReinforcedSlab({ ...base, reinforcementLayers: 3 }), /parrillas/);
  assert.throws(() => civil.calcReinforcedSlab({ ...base, formworkMode: 'edges' }), /cimbra/);
  assert.throws(() => civil.calcReinforcedSlab({ ...base, spacingY: 0 }), /separaciones/);
});


test('destajos y cuadrillas separa costo directo, flujo y comparación', () => {
  const r = civil.calcCrewWork({
    quantity: 120, unit: 'm²', productivityPerDay: 20,
    workDaysPerWeek: 6, contingencyPercent: 0,
    selectedMethod: 'crew', pieceworkUnitRate: 250,
    roles: [
      { role: 'Oficial', count: 1, weeklyCost: 6000 },
      { role: 'Ayudante', count: 1, weeklyCost: 4000 }
    ]
  });
  assert.equal(r.type, 'crew_work');
  assert.equal(r.plannedDays, 6);
  assert.equal(r.crewWeeklyCost, 10000);
  assert.equal(r.crewDirectCost, 10000);
  assert.equal(r.pieceworkDirectCost, 30000);
  assert.equal(r.selectedDirectCost, 10000);
  assert.equal(r.cashFlow.length, 1);
  assert.equal(r.cashFlow[0].amount, 10000);
});

test('destajo distribuye el flujo por semanas sin alterar el costo directo', () => {
  const r = civil.calcCrewWork({
    quantity: 150, unit: 'm²', productivityPerDay: 20,
    workDaysPerWeek: 6, selectedMethod: 'piecework', pieceworkUnitRate: 100,
    roles: []
  });
  assert.equal(r.plannedDays, 7.5);
  assert.equal(r.pieceworkDirectCost, 15000);
  assert.equal(r.selectedDirectCost, 15000);
  assert.equal(r.cashFlow.length, 2);
  assert.equal(r.cashFlow.reduce((sum, row) => sum + row.amount, 0), 15000);
  assert.equal(r.cashFlow.reduce((sum, row) => sum + row.quantity, 0), 150);
});

test('destajos y cuadrillas valida rendimiento, calendario y método seleccionado', () => {
  const base = {
    quantity: 10, unit: 'pza', productivityPerDay: 2,
    workDaysPerWeek: 6, selectedMethod: 'crew',
    roles: [{ role: 'Oficial', count: 1, weeklyCost: 6000 }]
  };
  assert.throws(() => civil.calcCrewWork({ ...base, productivityPerDay: 0 }), /rendimiento/);
  assert.throws(() => civil.calcCrewWork({ ...base, workDaysPerWeek: 8 }), /entero entre 1 y 7/);
  assert.throws(() => civil.calcCrewWork({ ...base, roles: [] }), /integrante/);
  assert.throws(() => civil.calcCrewWork({ ...base, selectedMethod: 'piecework', pieceworkUnitRate: 0 }), /destajo positivo/);
});


test('generador libre suma y descuenta longitudes, áreas y volúmenes', () => {
  const area = civil.calcFreeGenerator({
    mode: 'area',
    rows: [
      { description: 'Muro', operation: 'add', count: 2, length: 5, width: 3 },
      { description: 'Vano', operation: 'subtract', count: 1, length: 1, width: 2 }
    ]
  });
  assert.equal(area.unit, 'm²');
  assert.equal(area.additions, 30);
  assert.equal(area.subtractions, 2);
  assert.equal(area.quantity, 28);
  const volume = civil.calcFreeGenerator({
    mode: 'volume',
    rows: [{ description: 'Losa', operation: 'add', count: 1, length: 5, width: 4, height: 0.12 }]
  });
  assert.equal(volume.quantity, 2.4);
});

test('generador libre conserva precisión y no ejecuta fórmulas de texto', () => {
  const r = civil.calcFreeGenerator({
    mode: 'linear',
    rows: [{ description: '=2+2', operation: 'add', count: 3, length: 1.25 }]
  });
  assert.equal(r.quantity, 3.75);
  assert.equal(r.rows[0].description, '=2+2');
});

test('generador libre valida dimensiones, operaciones y deducciones', () => {
  assert.throws(() => civil.calcFreeGenerator({ mode: 'area', rows: [{ operation: 'add', count: 1, length: 2, width: 0 }] }), /ancho/);
  assert.throws(() => civil.calcFreeGenerator({ mode: 'volume', rows: [{ operation: 'add', count: 1, length: 2, width: 2, height: 0 }] }), /alto/);
  assert.throws(() => civil.calcFreeGenerator({ mode: 'linear', rows: [{ operation: 'multiply', count: 1, length: 2 }] }), /Operación inválida/);
  assert.throws(() => civil.calcFreeGenerator({ mode: 'linear', rows: [
    { operation: 'add', count: 1, length: 1 },
    { operation: 'subtract', count: 1, length: 2 }
  ] }), /deducciones/);
});
