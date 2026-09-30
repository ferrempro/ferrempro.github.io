// RemPro Control — módulo de zapatas y dados de concreto armado.
// Fuente: calculadora Excel legado + reglas técnicas RemPro vigentes.
// Este módulo cuantifica; no diseña estructuralmente ni sustituye planos de cálculo.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RemProCivilFootings = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const n = value => Number(value || 0);
  const pct = value => Math.max(0, n(value)) / 100;
  const validPositive = value => Number.isFinite(n(value)) && n(value) > 0;
  const round = (value, decimals = 4) => {
    const factor = 10 ** decimals;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  };

  function rebarKgPerM(diameterMm) {
    const d = n(diameterMm);
    if (!validPositive(d)) throw new Error('El diámetro de la varilla debe ser mayor que cero.');
    return d * d / 162;
  }

  function calcFooting(input) {
    const length = n(input.length);
    const width = n(input.width);
    const thickness = n(input.thickness);
    const count = n(input.count);
    const barsX = n(input.barsX);
    const barsY = n(input.barsY);
    const diameter = n(input.diameter);
    const cover = n(input.cover);
    const dadoLength = n(input.dadoLength);
    const dadoWidth = n(input.dadoWidth);
    const dadoHeight = n(input.dadoHeight);
    const dadoBars = n(input.dadoBars);
    const dadoDiameter = n(input.dadoDiameter || diameter);
    const stirrupDiameter = n(input.stirrupDiameter || diameter);
    const stirrupSpacing = n(input.stirrupSpacing);
    const hookLength = Math.max(0, n(input.hookLength));
    const fc = String(input.fc || '250');
    const wasteSteel = 1 + pct(input.wasteSteel);
    const wasteFormwork = 1 + pct(input.wasteFormwork);

    if (![length, width, thickness].every(validPositive) || !Number.isInteger(count) || count < 1) {
      throw new Error('Captura largo, ancho, espesor y número de zapatas positivos.');
    }
    if (![barsX, barsY].every(v => Number.isInteger(v) && v >= 2)) {
      throw new Error('Captura el número de varillas en ambos sentidos.');
    }
    if (![diameter, cover].every(validPositive)) throw new Error('Captura diámetro y recubrimiento positivos.');
    if (cover * 2 >= Math.min(length, width)) throw new Error('El recubrimiento no es compatible con la zapata.');

    const footingConcreteM3 = length * width * thickness * count;
    const footingBarLengthX = Math.max(0, length - 2 * cover);
    const footingBarLengthY = Math.max(0, width - 2 * cover);
    const footingBaseSteelM = (barsX * footingBarLengthX + barsY * footingBarLengthY) * count;
    const footingSteelM = footingBaseSteelM * wasteSteel;
    const footingSteelKg = footingSteelM * rebarKgPerM(diameter);

    let dado = null;
    let dadoConcreteM3 = 0;
    let dadoSteelKg = 0;
    let dadoFormworkM2 = 0;

    if ([dadoLength, dadoWidth, dadoHeight].some(validPositive)) {
      if (![dadoLength, dadoWidth, dadoHeight].every(validPositive)) throw new Error('Completa todas las dimensiones del dado o déjalas en cero.');
      if (!Number.isInteger(dadoBars) || dadoBars < 4) throw new Error('El dado debe tener al menos cuatro varillas verticales.');
      if (!validPositive(stirrupSpacing)) throw new Error('Captura la separación de estribos del dado.');
      if (cover * 2 >= Math.min(dadoLength, dadoWidth)) throw new Error('El recubrimiento no es compatible con el dado.');

      dadoConcreteM3 = dadoLength * dadoWidth * dadoHeight * count;
      const verticalBaseM = dadoBars * (dadoHeight + Math.max(0, n(input.dadoExtraBarLength))) * count;
      const verticalM = verticalBaseM * wasteSteel;
      const verticalKg = verticalM * rebarKgPerM(dadoDiameter);
      const levels = Math.ceil(dadoHeight / stirrupSpacing) + 1;
      const stirrupCount = levels * count;
      const stirrupEachM = 2 * ((dadoLength - 2 * cover) + (dadoWidth - 2 * cover)) + 2 * hookLength;
      const stirrupBaseM = stirrupCount * stirrupEachM;
      const stirrupM = stirrupBaseM * wasteSteel;
      const stirrupKg = stirrupM * rebarKgPerM(stirrupDiameter);
      dadoSteelKg = verticalKg + stirrupKg;
      dadoFormworkM2 = 2 * (dadoLength + dadoWidth) * dadoHeight * count * wasteFormwork;

      dado = {
        concreteM3: round(dadoConcreteM3, 4),
        verticalLengthM: round(verticalM, 2),
        verticalSteelKg: round(verticalKg, 2),
        stirrupCount,
        stirrupLengthM: round(stirrupM, 2),
        stirrupSteelKg: round(stirrupKg, 2),
        steelKg: round(dadoSteelKg, 2),
        formworkM2: round(dadoFormworkM2, 2)
      };
    }

    const concreteM3 = footingConcreteM3 + dadoConcreteM3;
    const formworkFootingM2 = 2 * (length + width) * thickness * count * wasteFormwork;
    const formworkM2 = formworkFootingM2 + dadoFormworkM2;

    return {
      type: 'footing',
      subtype: dado ? 'footing_with_dado' : 'isolated_footing',
      count,
      concreteM3: round(concreteM3, 4),
      footingConcreteM3: round(footingConcreteM3, 4),
      dadoConcreteM3: round(dadoConcreteM3, 4),
      steelKg: round(footingSteelKg + dadoSteelKg, 2),
      footingSteelKg: round(footingSteelKg, 2),
      dadoSteelKg: round(dadoSteelKg, 2),
      formworkM2: round(formworkM2, 2),
      footingFormworkM2: round(formworkFootingM2, 2),
      dosage: fc,
      source: 'Excel legado · lógica de zapatas/dados; geometría, acero, cimbra y desperdicios editables · RemPro 2026',
      structuralDesignNote: 'Cuantificación a partir del armado y geometría capturados. No propone dimensiones, cuantías ni separación estructural.'
    };
  }

  return Object.freeze({ rebarKgPerM, calcFooting });
});
