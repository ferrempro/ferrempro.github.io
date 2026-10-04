const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../cost-engine.js');

test('fracciona caja de 100 piezas',()=>{
  const price={item:'Carga industrial c/100 pzas',unit:'caja 100 pzas',net:100,vat:16,date:'2026-10-01'};
  const row=engine.costWithPrice({description:'Fulminantes',quantity:25,unit:'pzas'},price);
  assert.equal(row.status,'priced');
  assert.equal(Number(row.unitCost.toFixed(2)),1.16);
  assert.equal(Number(row.amount.toFixed(2)),29);
});

test('fracciona millar de tornillos',()=>{
  const price={item:'Tornillo para metal',unit:'millar 1000 pzas',net:200,vat:16};
  const row=engine.costWithPrice({description:'Mini pija',quantity:50,unit:'pzas'},price);
  assert.equal(row.status,'priced');
  assert.equal(Number(row.unitCost.toFixed(3)),0.232);
  assert.equal(Number(row.amount.toFixed(2)),11.6);
});

test('convierte saco declarado a costo por kg',()=>{
  const price={item:'Hi Tech Bond blanco 20 kg',unit:'saco 20 kg',net:300,vat:16};
  const row=engine.costWithPrice({description:'Base Coat',quantity:10,unit:'kg'},price);
  assert.equal(row.status,'priced');
  assert.equal(Number(row.unitCost.toFixed(2)),17.4);
  assert.equal(Number(row.amount.toFixed(2)),174);
});

test('calcula area de rollo por dimensiones declaradas',()=>{
  const price={item:'Membrana Elite 2.74 x 38.1 m',unit:'rollo',net:2400,vat:16};
  const row=engine.costWithPrice({description:'Membrana',quantity:20,unit:'m²'},price);
  assert.equal(row.status,'priced');
  assert.equal(Number(row.conversion.capacity.toFixed(3)),104.394);
});

test('no inventa conversion de kg a metro lineal',()=>{
  const price={item:'Alambre galvanizado núm. 12',unit:'kg',net:90,vat:16};
  const row=engine.costWithPrice({description:'Alambre',quantity:20,unit:'ml'},price);
  assert.equal(row.status,'conversion-pending');
  assert.equal(row.amount,null);
});

test('selecciona el precio compatible mas reciente entre coincidencias',()=>{
  const prices=[
    {id:'old',item:'Hoja PermaBase 1/2',unit:'pieza',net:600,vat:16,date:'2026-01-01'},
    {id:'new',item:'Hoja PermaBase 1/2',unit:'pieza',net:700,vat:16,date:'2026-09-01'}
  ];
  assert.equal(engine.findBestPrice(prices,['hoja permabase']).id,'new');
});
