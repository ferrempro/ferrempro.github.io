const assert = require('node:assert/strict');
const { calcFooting, rebarKgPerM } = require('../civil-footings.js');

const base = {
  length: 2,
  width: 2,
  thickness: 0.30,
  count: 2,
  barsX: 11,
  barsY: 11,
  diameter: 12.7,
  cover: 0.075,
  fc: '250',
  wasteSteel: 5,
  wasteFormwork: 5
};

const footing = calcFooting(base);
assert.equal(footing.type, 'footing');
assert.equal(footing.subtype, 'isolated_footing');
assert.equal(footing.count, 2);
assert.equal(footing.footingConcreteM3, 2.4);
assert.ok(footing.steelKg > 0);
assert.ok(footing.formworkM2 > 0);

const withDado = calcFooting({
  ...base,
  dadoLength: 0.40,
  dadoWidth: 0.40,
  dadoHeight: 0.60,
  dadoBars: 4,
  dadoDiameter: 12.7,
  stirrupDiameter: 9.5,
  stirrupSpacing: 0.20,
  hookLength: 0.10
});
assert.equal(withDado.subtype, 'footing_with_dado');
assert.ok(withDado.dadoConcreteM3 > 0);
assert.ok(withDado.dadoSteelKg > 0);
assert.ok(withDado.dado.formworkM2 > 0);
assert.equal(rebarKgPerM(12.7), 12.7 * 12.7 / 162);

assert.throws(() => calcFooting({ ...base, barsX: 1 }), /número de varillas/);
assert.throws(() => calcFooting({ ...base, cover: 1.1 }), /recubrimiento/);
assert.throws(() => calcFooting({ ...base, dadoLength: 0.4, dadoWidth: 0.4, dadoHeight: 0.6, dadoBars: 4 }), /separación de estribos/);

console.log('civil-footings.test.cjs: OK');
