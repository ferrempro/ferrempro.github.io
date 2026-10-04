(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.RemProMaterialPricing=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const STOP=new Set(['de','del','la','el','para','por','con','y','en','aprox','aproximado','material','pieza','piezas','pza','pzas']);
  const round=(v,d=4)=>{const f=10**d;return Math.round((Number(v)+Number.EPSILON)*f)/f;};
  const strip=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/×/g,'x').replace(/²/g,'2').replace(/³/g,'3').replace(/[^a-z0-9./x\s-]+/g,' ').replace(/\s+/g,' ').trim();
  const tokens=s=>strip(s).split(' ').filter(t=>t.length>1&&!STOP.has(t));

  function canonicalUnit(unit){
    const s=strip(unit);
    if(/\bm3\b|metro cubico/.test(s)) return 'm3';
    if(/\bm2\b|metro cuadrado/.test(s)) return 'm2';
    if(/\bml\b|metro lineal/.test(s)) return 'ml';
    if(/\bkg\b|kilogram/.test(s)) return 'kg';
    if(/\b(l|lt|lts|litro|litros)\b/.test(s)) return 'l';
    if(/pza|pieza|pzas|piezas|millar|caja.*pza|paquete/.test(s)) return 'pza';
    if(/^m$|\bmetro\b/.test(s)) return 'ml';
    return '';
  }

  function presentation(price){
    const unit=strip(price&&price.unit);
    const item=strip(price&&price.item);
    let m;
    if((m=unit.match(/(?:caja|paquete)\s*(?:c\/)?\s*(\d+(?:\.\d+)?)\s*(?:pza|pieza)/))) return {qty:Number(m[1]),unit:'pza',label:price.unit};
    if(/millar/.test(unit)) {
      const n=unit.match(/(\d+(?:\.\d+)?)/);
      return {qty:n?Number(n[1]):1000,unit:'pza',label:price.unit};
    }
    if((m=unit.match(/saco\s*(\d+(?:\.\d+)?)\s*kg/))) return {qty:Number(m[1]),unit:'kg',label:price.unit};
    if((m=unit.match(/rollo\s*(\d+(?:\.\d+)?)\s*m2/))) return {qty:Number(m[1]),unit:'m2',label:price.unit};
    if((m=unit.match(/rollo\s*(\d+(?:\.\d+)?)\s*(?:m|ml)\b/))) return {qty:Number(m[1]),unit:'ml',label:price.unit};
    if(/\brollo\b/.test(unit)) {
      const dims=item.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*m\b/);
      if(dims) return {qty:round(Number(dims[1])*Number(dims[2]),4),unit:'m2',label:price.unit,derived:true};
      return {qty:null,unit:null,label:price.unit,reason:'La presentación por rollo no indica contenido utilizable.'};
    }
    if(/\bcaja\b/.test(unit)) return {qty:null,unit:null,label:price.unit,reason:'La caja no indica cuántas piezas o cuánto contenido incluye.'};
    if(/^pieza(?:\s|$)|^pza(?:\s|$)/.test(unit)) return {qty:1,unit:'pza',label:price.unit};
    if(/^kg$/.test(unit)) return {qty:1,unit:'kg',label:price.unit};
    if(/^m2$/.test(unit)) return {qty:1,unit:'m2',label:price.unit};
    if(/^m3$/.test(unit)) return {qty:1,unit:'m3',label:price.unit};
    if(/^ml$|^m$/.test(unit)) return {qty:1,unit:'ml',label:price.unit};
    if(/^(l|lt|litro|litros)$/.test(unit)) return {qty:1,unit:'l',label:price.unit};
    if((m=unit.match(/(\d+(?:\.\d+)?)\s*kg/))) return {qty:Number(m[1]),unit:'kg',label:price.unit};
    return {qty:null,unit:null,label:price&&price.unit||'',reason:'No se reconoce la equivalencia de la presentación.'};
  }

  function keyBonus(key,text,search){
    const has=(re)=>re.test(text);
    switch(String(key||'')){
      case 'panels': return /permabase|durock|guard rey|adpanel|tablaroca/.test(search)&&has(/permabase|durock|guard rey|adpanel|tablaroca/) ? 120 : has(/\bhoja\b|panel/) ? 45 : 0;
      case 'studs': return has(/\bposte\b|monten/) ? 110 : 0;
      case 'track': return has(/\bcanal\b/)&&!has(/liston|carga/) ? 105 : 0;
      case 'liston': return has(/canal liston/) ? 120 : 0;
      case 'canaleta': return has(/canal de carga|canaleta/) ? 120 : 0;
      case 'angle': return has(/angulo/) ? 115 : 0;
      case 'mini': return has(/tornillo/)&&has(/8\s*x\s*1\/2|num 8.*1\/2|mini/) ? 120 : 0;
      case 'screws': return /cement|permabase|durock|tablacemento/.test(search) ? (has(/tablacemento/) ? 130 : 0) : (has(/tornillo/)&&has(/yeso|panel/) ? 100 : 0);
      case 'tape': return has(/perfacinta/) ? 130 : 0;
      case 'joint_tape': return has(/malla.*fibra|cinta.*junta/) ? 115 : 0;
      case 'basecoat': return has(/base coat/) ? 130 : 0;
      case 'compound': return has(/ready mix|compuesto.*junta/) ? 120 : 0;
      case 'membrane': return has(/membrana/) ? 130 : 0;
      case 'liston_wire':
      case 'hanger_wire':
      case 'tie_wire': return has(/alambre galvanizado/) ? 120 : 0;
      case 'hanger_anchors': return has(/clavo ancla|ancla/) ? 100 : 0;
      case 'hanger_shots':
      case 'angle_shots': return has(/carga industrial|fulminante/) ? 120 : 0;
      case 'angle_nails': return has(/clavo.*pistola.*rondana|clavo.*rondana/) ? 120 : 0;
      case 'insulation': return has(/colchoneta|foamular|aislante/) ? 105 : 0;
      default: return 0;
    }
  }

  function scorePrice(material,price){
    const text=strip(price&&price.item);
    const search=strip([material.label||material.description,material.note,material.searchText].filter(Boolean).join(' '));
    const a=tokens(search), b=new Set(tokens(text));
    let common=0;
    for(const t of a) if(b.has(t)) common++;
    let score=common*12 + keyBonus(material.key,text,search);
    if(search&&text&&text.includes(search)) score+=80;
    if(material.key&&keyBonus(material.key,text,search)===0&&['studs','track','liston','canaleta','angle','mini','screws','tape','joint_tape','basecoat','compound','membrane','hanger_wire','tie_wire','hanger_anchors','hanger_shots','angle_nails','angle_shots'].includes(material.key)) score-=60;
    return score;
  }

  function choosePrice(material,prices){
    const candidates=(prices||[]).filter(p=>p&&!p.deleted).map(p=>({p,score:scorePrice(material,p)})).filter(x=>x.score>=36);
    candidates.sort((a,b)=>b.score-a.score || (Date.parse(b.p.date||b.p.updated_at||0)-Date.parse(a.p.date||a.p.updated_at||0)));
    return candidates[0]||null;
  }

  function priceOne(material,prices){
    const quantity=Number(material.quantity);
    if(material.skipPricing) return {...material,status:'skipped',reason:material.skipReason||'Renglón técnico sin compra independiente.'};
    if(!(Number.isFinite(quantity)&&quantity>=0)) return {...material,status:'invalid',reason:'Cantidad inválida.'};
    const chosen=choosePrice(material,prices);
    if(!chosen) return {...material,status:'unpriced',reason:'No hay un precio del catálogo suficientemente relacionado.'};
    const p=chosen.p;
    const pres=presentation(p);
    const consumeUnit=canonicalUnit(material.unit);
    if(!pres.qty||!pres.unit) return {...material,status:'unconvertible',price:p,matchScore:chosen.score,presentation:pres,reason:pres.reason||'Falta equivalencia de presentación.'};
    if(!consumeUnit||consumeUnit!==pres.unit) return {...material,status:'unconvertible',price:p,matchScore:chosen.score,presentation:pres,reason:`La calculadora consume ${material.unit||'otra unidad'} y el precio está en ${p.unit||'otra presentación'}.`};
    const gross=Number(p.net||0)*(1+Number(p.vat||0)/100);
    const unitCost=gross/pres.qty;
    return {...material,status:'resolved',price:p,matchScore:chosen.score,presentation:pres,unitCost:round(unitCost,6),total:round(quantity*unitCost,2),grossPurchasePrice:round(gross,2)};
  }

  function priceMaterials(materials,prices){
    const rows=(materials||[]).map(m=>priceOne(m,prices));
    const total=round(rows.filter(r=>r.status==='resolved').reduce((s,r)=>s+Number(r.total||0),0),2);
    const pending=rows.filter(r=>['unpriced','unconvertible','invalid'].includes(r.status)).length;
    return {rows,total,pending,resolved:rows.filter(r=>r.status==='resolved').length};
  }

  return Object.freeze({canonicalUnit,presentation,scorePrice,choosePrice,priceOne,priceMaterials,normalize:strip});
});