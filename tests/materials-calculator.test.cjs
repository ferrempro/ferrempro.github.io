const {test}=require('node:test');
const assert=require('node:assert/strict');
const calc=require('../materials-calculator.js');

const rules={studSpacing:.61,studLength:3.05,trackLength:3.05,liston:.61,canaleta:.90,angle:3.05,wire:.70,screws:50,mini:8};

test('muro Permabase de dos caras fuerza cal.20 y modulación 0.405 m',()=>{
  const r=calc.calculate({type:'cementWall2',length:3,height:2.6,wastePercent:5,layers:1,panelLabel:'Permabase',profileWidth:'6.35',membrane:true,insulation:'Colchoneta R-11'},rules);
  assert.equal(r.profileGauge,20);
  assert.equal(r.studSpacingM,.405);
  assert.equal(r.faces,2);
  assert.ok(r.items.some(x=>x.key==='mini'));
  assert.ok(r.items.some(x=>x.key==='membrane'));
  assert.ok(r.items.some(x=>x.key==='insulation'));
  assert.ok(r.items.some(x=>x.key==='joint_tape'));
});

test('plafón convencional incluye pasta, perfacinta, colgantes, amarres y fijaciones',()=>{
  const r=calc.calculate({type:'ceiling',length:4,height:3,wastePercent:5,layers:1,panelLabel:'Tablaroca'},rules);
  for(const key of ['compound','tape','hanger_wire','hanger_anchors','hanger_shots','tie_wire','angle_nails','angle_shots']){
    assert.ok(r.items.some(x=>x.key===key),key);
  }
  assert.equal(r.listonSpacingM,.61);
});

test('plafón Permabase usa canal listón a 0.405 m c/c',()=>{
  const r=calc.calculate({type:'cementCeiling',length:4,height:3,wastePercent:5,layers:1,panelLabel:'Permabase',insulation:'FOAMULAR 1 pulg'},rules);
  assert.equal(r.profileGauge,20);
  assert.equal(r.listonSpacingM,.405);
  assert.ok(r.items.some(x=>x.key==='basecoat'));
  assert.ok(r.items.some(x=>x.key==='joint_tape'));
  assert.ok(r.items.some(x=>x.key==='insulation'));
});
