const STORAGE = {
  projects:'rempro_projects_v1', prices:'rempro_prices_v1', rules:'rempro_rules_v1'
};
const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0));
const num = v => Number(v||0);
const today = () => new Date().toISOString().slice(0,10);
const load = (k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const save = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
let projects = load(STORAGE.projects,[]);
let prices = load(STORAGE.prices,[]);
let rules = load(STORAGE.rules,{liston:.61,canaleta:.90,angle:3.05,wire:.70,screws:50,mini:8,cajillo:.75,curtain:.35});

const views={dashboard:['Dashboard','Resumen general de RemPro'],master:['Control Maestro','Obras, cobros y costos'],materials:['Muros y plafones','Cuantificación paramétrica'],apu:['APU rápido','Costo directo y precio comercial'],prices:['Precios','Histórico de insumos'],settings:['Reglas RemPro','Factores de cálculo editables']};
function showView(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));document.getElementById('viewTitle').textContent=views[id][0];document.getElementById('viewSubtitle').textContent=views[id][1];document.getElementById('sidebar').classList.remove('open');if(id==='dashboard')renderDashboard();}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));
document.getElementById('menuBtn').onclick=()=>document.getElementById('sidebar').classList.toggle('open');

function statusColor(p){const balance=num(p.contract)-num(p.collected); if(p.status==='Terminada'&&balance<=1)return'green'; if(num(p.cost)>num(p.contract)&&num(p.contract)>0)return'red'; if(balance>0&&num(p.progress)>=80)return'yellow'; return'green';}
function renderDashboard(){const active=projects.filter(p=>p.status!=='Terminada').length;const contract=projects.reduce((a,p)=>a+num(p.contract),0);const collected=projects.reduce((a,p)=>a+num(p.collected),0);document.getElementById('kpiActive').textContent=active;document.getElementById('kpiContract').textContent=money(contract);document.getElementById('kpiCollected').textContent=money(collected);document.getElementById('kpiReceivable').textContent=money(Math.max(0,contract-collected));const r=document.getElementById('recentProjects');if(!projects.length){r.className='empty';r.textContent='Aún no hay obras registradas.'}else{r.className='';r.innerHTML=projects.slice(-5).reverse().map(p=>`<div class="recent-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.client)} · ${esc(p.status)}</small></div><strong>${money(p.contract)}</strong></div>`).join('')}
const a=document.getElementById('alerts');const alerts=[];projects.forEach(p=>{const bal=num(p.contract)-num(p.collected);if(num(p.cost)>num(p.contract)&&num(p.contract)>0)alerts.push(`${p.name}: costo real supera lo contratado.`);if(num(p.progress)>=80&&bal>0)alerts.push(`${p.name}: avance ${p.progress}% con saldo por cobrar ${money(bal)}.`)});const old=prices.filter(p=>(Date.now()-new Date(p.date).getTime())/86400000>30);if(old.length)alerts.push(`${old.length} precio(s) tienen más de 30 días sin verificarse.`);if(!alerts.length){a.className='empty';a.textContent='Sin alertas por ahora.'}else{a.className='';a.innerHTML=alerts.map(x=>`<div class="alert-card">${esc(x)}</div>`).join('')}}
function renderProjects(){const body=document.getElementById('projectsBody'), empty=document.getElementById('projectsEmpty');body.innerHTML=projects.map((p,i)=>`<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.folio||'')}</small></td><td>${esc(p.client)}</td><td><span class="status"><i class="dot ${statusColor(p)}"></i>${esc(p.status)}</span></td><td>${money(p.contract)}</td><td>${money(p.collected)}</td><td>${money(p.cost)}</td><td>${money(Math.max(0,num(p.contract)-num(p.collected)))}</td><td><button class="mini-btn" onclick="removeProject(${i})">Eliminar</button></td></tr>`).join('');empty.style.display=projects.length?'none':'block';renderDashboard()}
window.removeProject=i=>{if(confirm('¿Eliminar esta obra del dispositivo?')){projects.splice(i,1);save(STORAGE.projects,projects);renderProjects()}};
const pd=document.getElementById('projectDialog');document.getElementById('addProjectBtn').onclick=()=>pd.showModal();document.getElementById('saveProjectBtn').onclick=e=>{e.preventDefault();if(!document.getElementById('pName').value||!document.getElementById('pClient').value)return;projects.push({name:val('pName'),client:val('pClient'),folio:val('pFolio'),status:val('pStatus'),contract:num(val('pContract')),collected:num(val('pCollected')),cost:num(val('pCost')),progress:num(val('pProgress'))});save(STORAGE.projects,projects);pd.close();document.getElementById('projectForm').reset();renderProjects()};

function calcMaterials(){const type=val('systemType'),L=num(val('matLength')),H=num(val('matHeight')),w=num(val('matWaste'))/100,layers=Math.max(1,num(val('matLayers'))),area=L*H,panelArea=1.22*2.44,f=1+w;let items=[];if(type==='wall1'||type==='wall2'){const faces=type==='wall2'?2:1;const boards=Math.ceil(area*faces*layers/panelArea*f);const studs=Math.ceil(L/rules.liston)+1;const track=Math.ceil((L*2)/3.05);items=[['Paneles 1.22×2.44',boards,'pzas'],['Postes / montenes',studs,'pzas'],['Canal 3.05 m',track,'pzas'],['Tornillos',Math.ceil(boards*rules.screws),'pzas'],['Pasta / tratamiento',Number((area*faces*layers*1.1*f).toFixed(2)),'kg aprox.']]}else{const boards=Math.ceil(area*layers/panelArea*f);const listonMl=(Math.ceil(H/rules.liston)+1)*L;const canaletaMl=(Math.ceil(L/rules.canaleta)+1)*H;const angleMl=2*(L+H);items=[['Paneles 1.22×2.44',boards,'pzas'],['Listón',Math.ceil(listonMl/3.05),'pzas 3.05 m'],['Canaleta',Math.ceil(canaletaMl/3.05),'pzas 3.05 m'],['Ángulo perimetral',Math.ceil(angleMl/rules.angle),'pzas'],['Mini pija',Math.ceil(area*rules.mini*f),'pzas'],['Tornillos',Math.ceil(boards*rules.screws),'pzas']]}
document.getElementById('areaBadge').textContent=`${area.toFixed(2)} m²`;const out=document.getElementById('materialsResult');out.className='result-list';out.innerHTML=items.map(x=>`<div class="result-row"><div><strong>${x[0]}</strong><small>${esc(val('panelType'))}</small></div><div><strong>${x[1]}</strong> <small>${x[2]}</small></div></div>`).join('')}
document.getElementById('calcMaterialsBtn').onclick=calcMaterials;

let apuRows=[{type:'Material',desc:'',qty:1,unit:'pza',pu:0},{type:'Mano de obra',desc:'',qty:1,unit:'jor',pu:0}];
function renderApu(){const body=document.getElementById('apuBody');body.innerHTML=apuRows.map((r,i)=>`<tr><td><select onchange="apuEdit(${i},'type',this.value)"><option ${r.type==='Material'?'selected':''}>Material</option><option ${r.type==='Mano de obra'?'selected':''}>Mano de obra</option><option ${r.type==='Herramienta'?'selected':''}>Herramienta</option><option ${r.type==='Subcontrato'?'selected':''}>Subcontrato</option></select></td><td><input value="${esc(r.desc)}" oninput="apuEdit(${i},'desc',this.value)"></td><td><input type="number" step="0.01" value="${r.qty}" oninput="apuEdit(${i},'qty',this.value)"></td><td><input value="${esc(r.unit)}" oninput="apuEdit(${i},'unit',this.value)"></td><td><input type="number" step="0.01" value="${r.pu}" oninput="apuEdit(${i},'pu',this.value)"></td><td>${money(r.qty*r.pu)}</td><td><button class="mini-btn" onclick="apuRemove(${i})">✕</button></td></tr>`).join('');calcApu()}
window.apuEdit=(i,k,v)=>{apuRows[i][k]=(k==='qty'||k==='pu')?num(v):v;renderApu()};window.apuRemove=i=>{apuRows.splice(i,1);renderApu()};document.getElementById('addApuRow').onclick=()=>{apuRows.push({type:'Material',desc:'',qty:1,unit:'pza',pu:0});renderApu()};['apuIndirect','apuRisk','apuProfit','apuVat','apuSaleQty'].forEach(id=>document.getElementById(id).addEventListener('input',calcApu));function calcApu(){const direct=apuRows.reduce((a,r)=>a+r.qty*r.pu,0),ind=direct*num(val('apuIndirect'))/100,risk=direct*num(val('apuRisk'))/100,base=direct+ind+risk,profit=base*num(val('apuProfit'))/100,commercial=base+profit,qty=Math.max(.0001,num(val('apuSaleQty'))),vat=commercial*num(val('apuVat'))/100;document.getElementById('apuDirect').textContent=money(direct);document.getElementById('apuCommercial').textContent=money(commercial);document.getElementById('apuUnit').textContent=`${money(commercial/qty)} / ${val('apuSaleUnit')||'u'}`;document.getElementById('apuTotal').textContent=money(commercial+vat)}

function renderPrices(){const b=document.getElementById('pricesBody'),e=document.getElementById('pricesEmpty');b.innerHTML=prices.map((p,i)=>{const gross=num(p.net)*(1+num(p.vat)/100);return`<tr><td>${esc(p.item)}</td><td>${esc(p.supplier)}</td><td>${esc(p.unit)}</td><td>${money(gross)}</td><td>${esc(p.date)}</td><td><button class="mini-btn" onclick="removePrice(${i})">Eliminar</button></td></tr>`}).join('');e.style.display=prices.length?'none':'block';renderDashboard()}
window.removePrice=i=>{if(confirm('¿Eliminar este registro local?')){prices.splice(i,1);save(STORAGE.prices,prices);renderPrices()}};const prd=document.getElementById('priceDialog');document.getElementById('addPriceBtn').onclick=()=>{document.getElementById('prDate').value=today();prd.showModal()};document.getElementById('savePriceBtn').onclick=e=>{e.preventDefault();if(!val('prItem')||!val('prSupplier'))return;prices.push({item:val('prItem'),supplier:val('prSupplier'),unit:val('prUnit'),net:num(val('prNet')),vat:num(val('prVat')),date:val('prDate')||today()});save(STORAGE.prices,prices);prd.close();document.getElementById('priceForm').reset();renderPrices()};

function loadRulesForm(){document.getElementById('ruleListon').value=rules.liston;document.getElementById('ruleCanaleta').value=rules.canaleta;document.getElementById('ruleAngle').value=rules.angle;document.getElementById('ruleWire').value=rules.wire;document.getElementById('ruleScrews').value=rules.screws;document.getElementById('ruleMini').value=rules.mini;document.getElementById('ruleCajillo').value=rules.cajillo;document.getElementById('ruleCurtain').value=rules.curtain}
document.getElementById('saveRulesBtn').onclick=()=>{rules={liston:num(val('ruleListon')),canaleta:num(val('ruleCanaleta')),angle:num(val('ruleAngle')),wire:num(val('ruleWire')),screws:num(val('ruleScrews')),mini:num(val('ruleMini')),cajillo:num(val('ruleCajillo')),curtain:num(val('ruleCurtain'))};save(STORAGE.rules,rules);alert('Reglas RemPro guardadas en este dispositivo.')};
function val(id){return document.getElementById(id).value}function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}


function exportData(){
  const payload={version:1,exportedAt:new Date().toISOString(),projects,prices,rules};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`RemPro_Control_respaldo_${today()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
async function importData(file){
  try{
    const txt=await file.text();const data=JSON.parse(txt);
    if(!data||typeof data!=='object')throw new Error('Formato inválido');
    if(!confirm('Esto sustituirá los datos locales de este dispositivo por el respaldo seleccionado. ¿Continuar?'))return;
    projects=Array.isArray(data.projects)?data.projects:[];prices=Array.isArray(data.prices)?data.prices:[];rules=data.rules&&typeof data.rules==='object'?data.rules:rules;
    save(STORAGE.projects,projects);save(STORAGE.prices,prices);save(STORAGE.rules,rules);
    renderProjects();renderPrices();loadRulesForm();renderDashboard();alert('Respaldo importado correctamente.');
  }catch(err){alert('No se pudo importar el respaldo. Verifica que sea un archivo JSON generado por RemPro Control.');}
}
document.getElementById('exportDataBtn').addEventListener('click',exportData);
document.getElementById('importDataInput').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importData(f);e.target.value='';});

renderProjects();renderPrices();renderApu();loadRulesForm();calcMaterials();
if('serviceWorker' in navigator && location.protocol!=='file:')
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
