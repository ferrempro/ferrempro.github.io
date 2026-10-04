// RemPro Control — cuantificación de muros y plafones.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.RemProMaterials=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const PANEL_AREA=1.22*2.44;
  const PROFILE_LENGTH=3.05;
  const n=v=>Number(v||0);
  const ceil=v=>Math.ceil(v);
  const round=(v,d=2)=>{const f=10**d;return Math.round((Number(v)+Number.EPSILON)*f)/f;};
  function item(key,label,quantity,unit,note=''){return {key,label,quantity,unit,note};}
  function calculate(input,rules={}){
    const type=String(input.type||'wall1');
    const L=n(input.length), H=n(input.height), waste=n(input.wastePercent)/100;
    const layers=Math.max(1,Math.trunc(n(input.layers)||1));
    if(!(L>0&&H>0)||waste<0||waste>1) throw new Error('Captura medidas positivas y desperdicio entre 0 y 100%.');
    const f=1+waste, area=L*H;
    const cementWall=type==='cementWall1'||type==='cementWall2';
    const ceiling=type==='ceiling'||type==='cementCeiling';
    const cementCeiling=type==='cementCeiling';
    const faces=(type==='wall2'||type==='cementWall2')?2:1;
    const panelLabel=String(input.panelLabel||(cementWall||cementCeiling?'Permabase 1.22×2.44':'Tablaroca estándar 1.22×2.44'));
    const insulation=String(input.insulation||'none');
    const profileWidth=String(input.profileWidth||'6.35');
    const items=[];

    if(!ceiling){
      const panelArea=area*faces*layers;
      const boards=ceil(panelArea/PANEL_AREA*f);
      const spacing=cementWall?0.405:n(rules.studSpacing||0.61);
      const studPositions=ceil(L/spacing)+1;
      const studLength=n(rules.studLength||3.05);
      const piecesPerPosition=ceil(H/studLength);
      const studs=studPositions*piecesPerPosition;
      const trackLength=n(rules.trackLength||3.05);
      const track=ceil((L*2*1.05)/trackLength);
      const miniRate=n(rules.mini||8);
      const tapeMl=round(panelArea*1.35*f,2);
      items.push(item('panels','Paneles',boards,'pzas',panelLabel));
      items.push(item('studs','Postes / montenes',studs,`pzas de ${studLength.toFixed(2)} m`,`${cementWall?'Cal. 20 · ':''}ancho ${profileWidth} cm · @ ${spacing.toFixed(3)} m c/c`));
      items.push(item('track','Canal superior + inferior',track,`pzas de ${trackLength.toFixed(2)} m`,`${cementWall?'Cal. 20 · ':''}ancho ${profileWidth} cm`));
      items.push(item('mini','Mini pija',ceil(area*miniRate*f),'pzas',`${miniRate}/m²`));
      items.push(item('screws','Tornillos para panel',ceil(boards*n(rules.screws||50)),'pzas',`${n(rules.screws||50)} por panel`));
      if(cementWall){
        items.push(item('joint_tape','Cinta / malla para juntas cementicias',tapeMl,'ml','1.35 ml/m² de superficie de panel'));
        items.push(item('basecoat','Base Coat / tratamiento cementicio',round(panelArea*3.33*f,2),'kg aprox.','3.33 kg/m²; validar ficha del sistema seleccionado'));
        if(input.membrane) items.push(item('membrane','Membrana hidrófuga tipo Tyvek',round(area*f,2),'m²','Una capa sobre la cara exterior del bastidor'));
      }else{
        items.push(item('tape','Perfacinta',tapeMl,'ml','1.35 ml/m² de superficie de panel'));
        items.push(item('compound','Pasta Ready Mix',round(panelArea*1.0*f,2),'kg aprox.','Tratamiento de juntas: 1.00 kg/m²'));
      }
      if(insulation!=='none') items.push(item('insulation',`Aislante termoacústico · ${insulation}`,round(area*f,2),'m²','Área de elevación + desperdicio'));
      return {type,areaM2:round(area,2),faces,layers,profileGauge:cementWall?20:null,studSpacingM:spacing,items};
    }

    const panelArea=area*layers;
    const boards=ceil(panelArea/PANEL_AREA*f);
    const listonSpacing=cementCeiling?0.405:n(rules.liston||0.61);
    const canaletaSpacing=n(rules.canaleta||0.90);
    const listonLines=ceil(H/listonSpacing)+1;
    const canaletaLines=ceil(L/canaletaSpacing)+1;
    const listonMl=listonLines*L;
    const canaletaMl=canaletaLines*H;
    const perimeter=2*(L+H);
    const hangerPointsPerLine=ceil(H/0.90)+1;
    const hangers=canaletaLines*hangerPointsPerLine;
    const ties=listonLines*canaletaLines;
    const angleFixings=ceil((perimeter/0.60)*f);
    const tapeMl=round(panelArea*1.35*f,2);

    items.push(item('panels','Paneles',boards,'pzas',panelLabel));
    items.push(item('liston','Canal listón',ceil(listonMl/PROFILE_LENGTH*f),`pzas de ${PROFILE_LENGTH.toFixed(2)} m`,`${cementCeiling?'Cal. 20 · ':''}@ ${listonSpacing.toFixed(3)} m c/c`));
    items.push(item('canaleta','Canaleta de carga',ceil(canaletaMl/PROFILE_LENGTH*f),`pzas de ${PROFILE_LENGTH.toFixed(2)} m`,`@ ${canaletaSpacing.toFixed(2)} m c/c`));
    items.push(item('angle','Ángulo perimetral',ceil(perimeter/n(rules.angle||3.05)*f),'pzas',`Largo comercial ${n(rules.angle||3.05).toFixed(2)} m`));
    items.push(item('mini','Mini pija',ceil(area*n(rules.mini||8)*f),'pzas',`${n(rules.mini||8)}/m²`));
    items.push(item('screws','Tornillos para panel',ceil(boards*n(rules.screws||50)),'pzas',`${n(rules.screws||50)} por panel`));
    items.push(item(cementCeiling?'joint_tape':'tape',cementCeiling?'Cinta / malla para juntas cementicias':'Perfacinta',tapeMl,'ml','1.35 ml/m² de superficie de panel'));
    items.push(item(cementCeiling?'basecoat':'compound',cementCeiling?'Base Coat / tratamiento cementicio':'Pasta Ready Mix',round(panelArea*(cementCeiling?3.33:1.0)*f,2),'kg aprox.',cementCeiling?'3.33 kg/m²; validar ficha del sistema':'Tratamiento de juntas: 1.00 kg/m²'));
    items.push(item('hangers','Colgantes',hangers,'pzas','Puntos sobre canaleta @ 0.90 m'));
    items.push(item('hanger_wire','Alambre galvanizado para colgantes',round(hangers*0.70,2),'ml','0.70 m por colgante'));
    items.push(item('hanger_anchors','Anclas para colgantes',hangers,'pzas','1 por colgante'));
    items.push(item('hanger_shots','Fulminantes para anclas de colgantes',hangers,'pzas','1 por ancla'));
    items.push(item('ties','Amarres canal listón–canaleta',ties,'pzas','1 por cruce'));
    items.push(item('tie_wire','Alambre galvanizado para amarres',round(ties*n(rules.wire||0.70),2),'ml',`${n(rules.wire||0.70).toFixed(2)} m por amarre`));
    items.push(item('angle_nails','Clavos para ángulo perimetral',angleFixings,'pzas','Fijación @ 0.60 m + desperdicio'));
    items.push(item('angle_shots','Fulminantes para clavos de ángulo',angleFixings,'pzas','1 por clavo'));
    if(insulation!=='none') items.push(item('insulation',`Aislante termoacústico · ${insulation}`,round(area*f,2),'m²','Área de plafón + desperdicio'));
    return {type,areaM2:round(area,2),layers,profileGauge:cementCeiling?20:null,listonSpacingM:listonSpacing,canaletaSpacingM:canaletaSpacing,items};
  }
  return Object.freeze({calculate});
});
