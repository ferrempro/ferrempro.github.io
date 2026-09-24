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
