const {test}=require('node:test');
const assert=require('node:assert/strict');
const pricing=require('../material-pricing.js');

test('fracciona una caja de 100 piezas sin cobrar la caja completa',()=>{
  const price={id:'p1',item:'Carga industrial calibre 27 amarilla c/100 pzas',supplier:'Acyma',unit:'caja 100 pzas',net:127.69,vat:16,date:'2026-08-14'};
  const r=pricing.priceOne({key:'hanger_shots',label:'Fulminantes para anclas de colgantes',quantity:25,unit:'pzas'},[price]);
  assert.equal(r.status,'resolved');
  assert.equal(r.presentation.qty,100);
  assert.equal(r.unitCost,Number(((127.69*1.16)/100).toFixed(6)));
  assert.equal(r.total,Number((25*((127.69*1.16)/100)).toFixed(2)));
});

test('fracciona millar de tornillos a precio por pieza',()=>{
  const price={id:'p2',item:'Tornillo para tablacemento num. 8 x 1 1/4',supplier:'Acyma',unit:'millar 1000 pzas',net:295.16,vat:16,date:'2026-08-14'};
  const r=pricing.priceOne({key:'screws',label:'Tornillos para panel',note:'Permabase',searchText:'Permabase cementicio',quantity:350,unit:'pzas'},[price]);
  assert.equal(r.status,'resolved');
  assert.equal(r.presentation.qty,1000);
  assert.equal(r.total,Number((350*((295.16*1.16)/1000)).toFixed(2)));
});

test('deriva m2 de una membrana cuando la descripción contiene ancho por largo',()=>{
  const price={id:'p3',item:'Membrana impermeable Elite PR 2.74 x 38.1 m',supplier:'Acyma',unit:'rollo',net:2415.76,vat:16,date:'2026-08-14'};
  const r=pricing.priceOne({key:'membrane',label:'Membrana hidrófuga',quantity:20,unit:'m²'},[price]);
  assert.equal(r.status,'resolved');
  assert.equal(r.presentation.unit,'m2');
  assert.equal(r.presentation.qty,Number((2.74*38.1).toFixed(4)));
});

test('no inventa equivalencia entre alambre comprado por kg y consumo en metros',()=>{
  const price={id:'p4',item:'Alambre galvanizado num. 12',supplier:'Acyma',unit:'kg',net:88.5,vat:16,date:'2026-08-14'};
  const r=pricing.priceOne({key:'tie_wire',label:'Alambre galvanizado para amarres',quantity:45,unit:'ml'},[price]);
  assert.equal(r.status,'unconvertible');
  assert.match(r.reason,/consume ml/i);
});

test('canal liston no toma por error el canal de muro',()=>{
  const prices=[
    {id:'wall',item:'Canal 1 5/8 pulg calibre 20 largo 3.05 m',unit:'pieza 3.05 m',net:75.77,vat:16,date:'2026-09-01'},
    {id:'liston',item:'Canal listón calibre 25 largo 3.05 m',unit:'pieza 3.05 m',net:50.35,vat:16,date:'2026-08-14'}
  ];
  const r=pricing.priceOne({key:'liston',label:'Canal listón',quantity:12,unit:'pzas de 3.05 m'},prices);
  assert.equal(r.status,'resolved');
  assert.equal(r.price.id,'liston');
});