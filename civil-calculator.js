// RemPro Control — motor de cálculo de obra civil V1.
// Fuente base: calculadora Excel legado + reglas técnicas RemPro vigentes.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RemProCivil = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CONCRETE = Object.freeze({
    100: { cementKg: 262, sandM3: 0.605, gravelM3: 0.65, waterL: 250, source: 'Excel legado · DOSIFICACIONES' },
    150: { cementKg: 306, sandM3: 0.58,  gravelM3: 0.64, waterL: 250, source: 'Excel legado · DOSIFICACIONES' },
    200: { cementKg: 348, sandM3: 0.555, gravelM3: 0.64, waterL: 250, source: 'Excel legado · DOSIFICACIONES' },
    // Regla RemPro aprobada para 2026: 8 sacos de 50 kg por m³,
    // 3.5 botes de arena + 5 botes de grava + 1.5 botes de agua por saco,
    // usando bote de 18 L.
    250: { cementKg: 400, sandM3: 0.504, gravelM3: 0.72, waterL: 216, source: 'RemPro 2026 · dosificación de referencia aprobada' }
  });

  const MORTAR = Object.freeze({
    '.1:1':   { cementKg: 1100, sandM3: 0.68, limeBags25: 0,   waterL: 250 },
    '.1:2':   { cementKg: 610,  sandM3: 0.97, limeBags25: 0,   waterL: 250 },
    '.1:3':   { cementKg: 454,  sandM3: 1.00, limeBags25: 0,   waterL: 260 },
    '.1:4':   { cementKg: 364,  sandM3: 1.04, limeBags25: 0,   waterL: 260 },
    '.1:5':   { cementKg: 302,  sandM3: 1.07, limeBags25: 0,   waterL: 255 },
    '.1:6':   { cementKg: 261,  sandM3: 1.10, limeBags25: 0,   waterL: 255 },
    '.1:7':   { cementKg: 228,  sandM3: 1.12, limeBags25: 0,   waterL: 255 },
    '.1:8':   { cementKg: 203,  sandM3: 1.14, limeBags25: 0,   waterL: 255 },
    '.1:1:4': { cementKg: 385,  sandM3: 0.87, limeBags25: 4.8, waterL: 309 },
    '.1:1:5': { cementKg: 330,  sandM3: 0.94, limeBags25: 4.1, waterL: 297 },
    '.1:1:6': { cementKg: 285,  sandM3: 0.96, limeBags25: 3.6, waterL: 300 },
    '.1:3:12':{ cementKg: 160,  sandM3: 1.09, limeBags25: 6.0, waterL: 225 }
  });

  const MASONRY_UNITS = Object.freeze({
    block12: { label: 'Block de concreto 12 × 20 × 40 cm', length: 0.40, height: 0.20, depth: 0.12 },
    block15: { label: 'Block de concreto 15 × 20 × 40 cm', length: 0.40, height: 0.20, depth: 0.15 },
    block20: { label: 'Block de concreto 20 × 20 × 40 cm', length: 0.40, height: 0.20, depth: 0.20 },
    redBrick: { label: 'Tabique rojo 7 × 14 × 28 cm', length: 0.28, height: 0.07, depth: 0.14 },
    custom: { label: 'Pieza personalizada', length: 0.40, height: 0.20, depth: 0.12 }
  });

  // Peso nominal por metro: d² / 162, con d en milímetros.
  // Se mantiene editable el diámetro; estas referencias sólo alimentan la UI.
  const REBAR_DIAMETERS = Object.freeze([6, 8, 9.5, 12.7, 15.9, 19.1, 25.4]);

  const n = value => Number(value || 0);
  const validPositive = value => Number.isFinite(n(value)) && n(value) > 0;
  const pct = value => Math.max(0, n(value)) / 100;
  const round = (value, decimals = 4) => {
    const factor = 10 ** decimals;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };

  function resolveVolume(input) {
    const direct = n(input.directVolume);
    if (direct > 0) return round(direct, 6);
    const length = n(input.length), width = n(input.width), thickness = n(input.thickness);
    if (![length, width, thickness].every(v => Number.isFinite(v) && v > 0)) {
      throw new Error('Captura un volumen directo o dimensiones positivas.');
    }
    return round(length * width * thickness, 6);
  }

  function calcConcrete(input) {
    const volume = resolveVolume(input);
    const fc = String(input.fc || '250');
    const dose = CONCRETE[fc];
    if (!dose) throw new Error('Resistencia de concreto no disponible.');
    const bagWeight = validPositive(input.bagWeight) ? n(input.bagWeight) : 50;
    const wc = 1 + pct(input.wasteCement);
    const ws = 1 + pct(input.wasteSand);
    const wg = 1 + pct(input.wasteThird);

    const cementKg = dose.cementKg * volume * wc;
    const sandM3 = dose.sandM3 * volume * ws;
    const gravelM3 = dose.gravelM3 * volume * wg;
    const waterL = dose.waterL * volume;

    return {
      type: 'concrete',
      volumeM3: round(volume, 4),
      dosage: fc,
      source: dose.source,
      materials: [
        { key: 'cement', description: 'Cemento gris Portland', unit: `saco ${bagWeight} kg`, quantity: round(cementKg / bagWeight, 2), baseQuantity: round(dose.cementKg * volume / bagWeight, 2) },
        { key: 'sand', description: 'Arena para construcción', unit: 'm³', quantity: round(sandM3, 3), baseQuantity: round(dose.sandM3 * volume, 3) },
        { key: 'gravel', description: 'Grava', unit: 'm³', quantity: round(gravelM3, 3), baseQuantity: round(dose.gravelM3 * volume, 3) },
        { key: 'water', description: 'Agua', unit: 'L', quantity: round(waterL, 1), baseQuantity: round(waterL, 1) }
      ]
    };
  }

  function calcMortar(input) {
    const volume = resolveVolume(input);
    const mix = String(input.mix || '.1:4');
    const dose = MORTAR[mix];
    if (!dose) throw new Error('Dosificación de mortero no disponible.');
    const bagWeight = validPositive(input.bagWeight) ? n(input.bagWeight) : 50;
    const wc = 1 + pct(input.wasteCement);
    const ws = 1 + pct(input.wasteSand);
    const wl = 1 + pct(input.wasteThird);

    const cementKg = dose.cementKg * volume * wc;
    const sandM3 = dose.sandM3 * volume * ws;
    const limeBags = dose.limeBags25 * volume * wl;
    const waterL = dose.waterL * volume;

    const materials = [
      { key: 'cement', description: 'Cemento gris Portland', unit: `saco ${bagWeight} kg`, quantity: round(cementKg / bagWeight, 2), baseQuantity: round(dose.cementKg * volume / bagWeight, 2) },
      { key: 'sand', description: 'Arena para construcción', unit: 'm³', quantity: round(sandM3, 3), baseQuantity: round(dose.sandM3 * volume, 3) }
    ];
    if (dose.limeBags25 > 0) {
      materials.push({ key: 'lime', description: 'Calhidra', unit: 'saco 25 kg', quantity: round(limeBags, 2), baseQuantity: round(dose.limeBags25 * volume, 2) });
    }
    materials.push({ key: 'water', description: 'Agua', unit: 'L', quantity: round(waterL, 1), baseQuantity: round(waterL, 1) });

    return {
      type: 'mortar',
      volumeM3: round(volume, 4),
      dosage: mix,
      source: 'Excel legado · DOSIFICACIONES',
      materials
    };
  }

  function calcMasonryWall(input) {
    const length = n(input.length);
    const height = n(input.height);
    const openingArea = Math.max(0, n(input.openingArea));
    const unitLength = n(input.unitLength);
    const unitHeight = n(input.unitHeight);
    const unitDepth = n(input.unitDepth);
    const jointHorizontal = n(input.jointHorizontal);
    const jointVertical = n(input.jointVertical);
    const plasterFaces = Math.max(0, Math.min(2, Math.trunc(n(input.plasterFaces))));
    const plasterThickness = plasterFaces > 0 ? n(input.plasterThickness) : 0;
    const mix = String(input.mix || '.1:4');
    const bagWeight = validPositive(input.bagWeight) ? n(input.bagWeight) : 50;

    if (![length, height, unitLength, unitHeight, unitDepth].every(validPositive)) {
      throw new Error('Captura dimensiones positivas para el muro y la pieza.');
    }
    if (![jointHorizontal, jointVertical].every(validPositive)) {
      throw new Error('Las juntas horizontal y vertical deben ser mayores que cero.');
    }
    if (plasterFaces > 0 && !validPositive(plasterThickness)) {
      throw new Error('Captura un espesor positivo para el repellado.');
    }

    const grossArea = length * height;
    if (openingArea >= grossArea) {
      throw new Error('El área de vanos debe ser menor que el área total del muro.');
    }

    const netArea = grossArea - openingArea;
    const moduleArea = (unitLength + jointVertical) * (unitHeight + jointHorizontal);
    const piecesPerM2 = 1 / moduleArea;
    const basePieces = netArea * piecesPerM2;
    const pieceCount = Math.ceil(basePieces * (1 + pct(input.wasteUnits)));

    // Volumen de junta por módulo: volumen del prisma modular menos la pieza.
    // Se cuantifica con piezas base para evitar que el desperdicio de piezas
    // incremente artificialmente el mortero colocado en el muro.
    const moduleVolume = moduleArea * unitDepth;
    const unitVolume = unitLength * unitHeight * unitDepth;
    const layingMortarBase = basePieces * Math.max(0, moduleVolume - unitVolume);
    const layingMortarM3 = layingMortarBase * (1 + pct(input.wasteMortar));
    const plasterMortarM3 = netArea * plasterFaces * plasterThickness * (1 + pct(input.wasteMortar));
    const mortarVolume = layingMortarM3 + plasterMortarM3;

    const mortar = calcMortar({
      directVolume: mortarVolume,
      mix,
      bagWeight,
      wasteCement: input.wasteCement,
      wasteSand: input.wasteSand,
      wasteThird: input.wasteThird
    });

    return {
      type: 'masonry_wall',
      areaM2: round(grossArea, 4),
      netAreaM2: round(netArea, 4),
      volumeM3: round(mortarVolume, 4),
      dosage: mix,
      unitLabel: String(input.unitLabel || 'Pieza de mampostería'),
      piecesPerM2: round(piecesPerM2, 3),
      pieceCount,
      layingMortarM3: round(layingMortarM3, 4),
      plasterMortarM3: round(plasterMortarM3, 4),
      plasterFaces,
      source: 'Excel legado · lógica de muro; dimensiones y juntas editables · RemPro 2026',
      materials: [
        {
          key: 'masonry_units',
          description: String(input.unitLabel || 'Pieza de mampostería'),
          unit: 'pza',
          quantity: pieceCount,
          baseQuantity: round(basePieces, 2)
        },
        ...mortar.materials
      ]
    };
  }

  function rebarKgPerM(diameterMm) {
    const diameter = n(diameterMm);
    if (!validPositive(diameter)) throw new Error('El diámetro de la varilla debe ser mayor que cero.');
    return diameter * diameter / 162;
  }

  function calcColumn(input) {
    const width = n(input.width);
    const depth = n(input.depth);
    const height = n(input.height);
    const count = n(input.count);
    const longitudinalBars = n(input.longitudinalBars);
    const longitudinalDiameter = n(input.longitudinalDiameter);
    const extraBarLength = Math.max(0, n(input.extraBarLength));
    const stirrupDiameter = n(input.stirrupDiameter);
    const stirrupSpacing = n(input.stirrupSpacing);
    const stirrupMultiplicity = n(input.stirrupMultiplicity) || 1;
    const cover = n(input.cover);
    const hookLength = Math.max(0, n(input.hookLength));
    const fc = String(input.fc || '250');
    const wasteSteel = 1 + pct(input.wasteSteel);
    const wasteFormwork = 1 + pct(input.wasteFormwork);

    if (![width, depth, height].every(validPositive) || !Number.isInteger(count) || count < 1) {
      throw new Error('Captura sección, altura y número de columnas positivos.');
    }
    if (!Number.isInteger(longitudinalBars) || longitudinalBars < 4) {
      throw new Error('La columna debe tener al menos cuatro varillas longitudinales.');
    }
    if (![longitudinalDiameter, stirrupDiameter, stirrupSpacing, cover].every(validPositive)) {
      throw new Error('Captura diámetros, separación de estribos y recubrimiento positivos.');
    }
    if (![1, 2, 3].includes(stirrupMultiplicity)) {
      throw new Error('Selecciona estribo simple, doble o triple.');
    }
    if (cover * 2 >= Math.min(width, depth)) {
      throw new Error('El recubrimiento debe ser menor que la mitad de la sección.');
    }

    const volume = width * depth * height * count;
    const concrete = calcConcrete({
      directVolume: volume,
      fc,
      bagWeight: input.bagWeight,
      wasteCement: input.wasteCement,
      wasteSand: input.wasteSand,
      wasteThird: input.wasteThird
    });

    const longitudinalBaseM = longitudinalBars * (height + extraBarLength) * count;
    const longitudinalM = longitudinalBaseM * wasteSteel;
    const longitudinalKg = longitudinalM * rebarKgPerM(longitudinalDiameter);

    // Incluye estribo en ambos extremos. La multiplicidad representa el número
    // de lazos del detalle estructural en cada nivel, sin inventar geometrías.
    const stirrupLevelsPerColumn = Math.ceil(height / stirrupSpacing) + 1;
    const stirrupCount = stirrupLevelsPerColumn * stirrupMultiplicity * count;
    const stirrupLengthEach = 2 * ((width - 2 * cover) + (depth - 2 * cover)) + 2 * hookLength;
    const stirrupBaseM = stirrupCount * stirrupLengthEach;
    const stirrupM = stirrupBaseM * wasteSteel;
    const stirrupKg = stirrupM * rebarKgPerM(stirrupDiameter);
    const formworkBaseM2 = 2 * (width + depth) * height * count;
    const formworkM2 = formworkBaseM2 * wasteFormwork;

    return {
      type: 'column',
      volumeM3: round(volume, 4),
      dosage: fc,
      count,
      longitudinalLengthM: round(longitudinalM, 2),
      longitudinalSteelKg: round(longitudinalKg, 2),
      stirrupCount,
      stirrupLengthM: round(stirrupM, 2),
      stirrupSteelKg: round(stirrupKg, 2),
      steelKg: round(longitudinalKg + stirrupKg, 2),
      formworkM2: round(formworkM2, 2),
      source: 'Excel legado · lógica de columnas; geometría, acero y desperdicios editables · RemPro 2026',
      materials: [
        ...concrete.materials,
        { key: 'longitudinal_rebar', description: `Acero longitudinal Ø ${longitudinalDiameter} mm`, unit: 'kg', quantity: round(longitudinalKg, 2), baseQuantity: round(longitudinalBaseM * rebarKgPerM(longitudinalDiameter), 2) },
        { key: 'stirrup_rebar', description: `Acero para estribos Ø ${stirrupDiameter} mm`, unit: 'kg', quantity: round(stirrupKg, 2), baseQuantity: round(stirrupBaseM * rebarKgPerM(stirrupDiameter), 2) },
        { key: 'formwork', description: 'Cimbra de contacto en cuatro caras', unit: 'm²', quantity: round(formworkM2, 2), baseQuantity: round(formworkBaseM2, 2) }
      ]
    };
  }

  function calcBeam(input) {
    const width = n(input.width);
    const depth = n(input.depth);
    const length = n(input.length);
    const count = n(input.count);
    const topBars = n(input.topBars);
    const bottomBars = n(input.bottomBars);
    const longitudinalDiameter = n(input.longitudinalDiameter);
    const extraBarLength = Math.max(0, n(input.extraBarLength));
    const stirrupDiameter = n(input.stirrupDiameter);
    const stirrupSpacing = n(input.stirrupSpacing);
    const stirrupMultiplicity = n(input.stirrupMultiplicity) || 1;
    const cover = n(input.cover);
    const hookLength = Math.max(0, n(input.hookLength));
    const fc = String(input.fc || '250');
    const wasteSteel = 1 + pct(input.wasteSteel);
    const wasteFormwork = 1 + pct(input.wasteFormwork);

    if (![width, depth, length].every(validPositive) || !Number.isInteger(count) || count < 1) {
      throw new Error('Captura sección, longitud y número de trabes positivos.');
    }
    if (![topBars, bottomBars].every(Number.isInteger) || topBars < 1 || bottomBars < 1) {
      throw new Error('Captura al menos una varilla superior y una inferior.');
    }
    if (![longitudinalDiameter, stirrupDiameter, stirrupSpacing, cover].every(validPositive)) {
      throw new Error('Captura diámetros, separación de estribos y recubrimiento positivos.');
    }
    if (![1, 2, 3].includes(stirrupMultiplicity)) {
      throw new Error('Selecciona estribo simple, doble o triple.');
    }
    if (cover * 2 >= Math.min(width, depth)) {
      throw new Error('El recubrimiento debe ser menor que la mitad de la sección.');
    }

    const volume = width * depth * length * count;
    const concrete = calcConcrete({
      directVolume: volume,
      fc,
      bagWeight: input.bagWeight,
      wasteCement: input.wasteCement,
      wasteSand: input.wasteSand,
      wasteThird: input.wasteThird
    });

    const longitudinalBars = topBars + bottomBars;
    const longitudinalBaseM = longitudinalBars * (length + extraBarLength) * count;
    const longitudinalM = longitudinalBaseM * wasteSteel;
    const longitudinalKg = longitudinalM * rebarKgPerM(longitudinalDiameter);

    // Incluye un nivel en cada extremo. La separación es uniforme y debe
    // provenir del plano estructural; el cálculo no propone armado.
    const stirrupLevelsPerBeam = Math.ceil(length / stirrupSpacing) + 1;
    const stirrupCount = stirrupLevelsPerBeam * stirrupMultiplicity * count;
    const stirrupLengthEach = 2 * ((width - 2 * cover) + (depth - 2 * cover)) + 2 * hookLength;
    const stirrupBaseM = stirrupCount * stirrupLengthEach;
    const stirrupM = stirrupBaseM * wasteSteel;
    const stirrupKg = stirrupM * rebarKgPerM(stirrupDiameter);

    // Cimbra de contacto en fondo y dos laterales. La cara superior queda
    // abierta para el colado y no se contabiliza.
    const formworkBaseM2 = (width + 2 * depth) * length * count;
    const formworkM2 = formworkBaseM2 * wasteFormwork;

    return {
      type: 'beam',
      volumeM3: round(volume, 4),
      dosage: fc,
      count,
      longitudinalLengthM: round(longitudinalM, 2),
      longitudinalSteelKg: round(longitudinalKg, 2),
      stirrupCount,
      stirrupLengthM: round(stirrupM, 2),
      stirrupSteelKg: round(stirrupKg, 2),
      steelKg: round(longitudinalKg + stirrupKg, 2),
      formworkM2: round(formworkM2, 2),
      source: 'Excel legado · lógica de trabes; geometría, acero y desperdicios editables · RemPro 2026',
      materials: [
        ...concrete.materials,
        { key: 'longitudinal_rebar', description: `Acero longitudinal (${topBars} sup. + ${bottomBars} inf.) Ø ${longitudinalDiameter} mm`, unit: 'kg', quantity: round(longitudinalKg, 2), baseQuantity: round(longitudinalBaseM * rebarKgPerM(longitudinalDiameter), 2) },
        { key: 'stirrup_rebar', description: `Acero para estribos Ø ${stirrupDiameter} mm`, unit: 'kg', quantity: round(stirrupKg, 2), baseQuantity: round(stirrupBaseM * rebarKgPerM(stirrupDiameter), 2) },
        { key: 'formwork', description: 'Cimbra de contacto en fondo y dos laterales', unit: 'm²', quantity: round(formworkM2, 2), baseQuantity: round(formworkBaseM2, 2) }
      ]
    };
  }

  function calculate(type, input) {
    if (type === 'concrete') return calcConcrete(input);
    if (type === 'mortar') return calcMortar(input);
    if (type === 'masonry_wall') return calcMasonryWall(input);
    if (type === 'column') return calcColumn(input);
    if (type === 'beam') return calcBeam(input);
    throw new Error('Tipo de cálculo no disponible.');
  }

  return Object.freeze({
    concreteDosages: CONCRETE,
    mortarDosages: MORTAR,
    masonryUnits: MASONRY_UNITS,
    rebarDiameters: REBAR_DIAMETERS,
    resolveVolume,
    calcConcrete,
    calcMortar,
    calcMasonryWall,
    rebarKgPerM,
    calcColumn,
    calcBeam,
    calculate
  });
});
