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

  function calculate(type, input) {
    if (type === 'concrete') return calcConcrete(input);
    if (type === 'mortar') return calcMortar(input);
    throw new Error('Tipo de cálculo no disponible.');
  }

  return Object.freeze({
    concreteDosages: CONCRETE,
    mortarDosages: MORTAR,
    resolveVolume,
    calcConcrete,
    calcMortar,
    calculate
  });
});
