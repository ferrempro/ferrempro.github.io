// RemPro Control V2 — lógica de interfaz.
// Sigue guardando todo en localStorage primero (igual que V1): la app
// nunca depende de la red para funcionar. Si hay sesión de Supabase,
// sync.js sube/baja los mismos datos en segundo plano.
const DATA = window.RemProData;
const STORAGE = DATA.keys;
const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n || 0));
const num = v => Number(v || 0);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const nowISO = () => new Date().toISOString();
const load = (k, d) => DATA.local.load(k, d);
const save = (k, v) => DATA.local.save(k, v);
const currentEmail = () => (window.RemProSupabase && window.RemProSupabase.session && window.RemProSupabase.session.user)
  ? window.RemProSupabase.session.user.email
  : null;

let projects = DATA.ensureRecordMeta(load(STORAGE.projects, [])).list;
let prices = DATA.ensureRecordMeta(load(STORAGE.prices, [])).list;
let priceHistory = DATA.ensureRecordMeta(load(STORAGE.priceHistory, [])).list;
let projectUpdates = DATA.ensureRecordMeta(load(STORAGE.projectUpdates, [])).list;
let documents = DATA.ensureRecordMeta(load(STORAGE.documents, [])).list;
let civilCalculations = DATA.ensureRecordMeta(load(STORAGE.civilCalculations, [])).list;
const defaultRules = { studSpacing: .61, studLength: 3.05, trackLength: 3.05, liston: .61, canaleta: .90, angle: 3.05, wire: .70, screws: 50, mini: 8, cajillo: .75, curtain: .35 };
let rules = { ...defaultRules, ...load(STORAGE.rules, {}) };
save(STORAGE.projects, projects);
save(STORAGE.prices, prices);
save(STORAGE.priceHistory, priceHistory);
save(STORAGE.projectUpdates, projectUpdates);
save(STORAGE.documents, documents);
save(STORAGE.civilCalculations, civilCalculations);
save(STORAGE.rules, rules);

const activeProjects = () => projects.filter(p => !p.deleted);
const activePrices = () => prices.filter(p => !p.deleted);
const activePriceHistory = () => priceHistory.filter(p => !p.deleted);
const activeProjectUpdates = () => projectUpdates.filter(p => !p.deleted);
const activeDocuments = () => documents.filter(d => !d.deleted);
const activeCivilCalculations = () => civilCalculations.filter(c => !c.deleted);

const views = {
  dashboard: ['Dashboard', 'Resumen general de RemPro'],
  master: ['Control Maestro', 'Obras, cobros y costos'],
  materials: ['Muros y plafones', 'Cuantificación paramétrica'],
  civil: ['Obra civil', 'Materiales, elementos, destajos y generador libre'],
  apu: ['APU rápido', 'Costo directo y precio comercial'],
  prices: ['Precios', 'Histórico de insumos'],
  settings: ['Reglas RemPro', 'Factores de cálculo y sincronización']
};

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  document.getElementById('viewTitle').textContent = views[id][0];
  document.getElementById('viewSubtitle').textContent = views[id][1];
  document.getElementById('sidebar').classList.remove('open');
  if (id === 'dashboard') renderDashboard();
  if (id === 'civil') renderCivil();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { showView(b.dataset.go); if (b.textContent.trim() === 'Nueva obra') openProject(); }));
document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');

function statusColor(p) {
  const contract = num(p.contract);
  const collected = num(p.collected);
  const balance = contract - collected;
  if (contract <= 0 && (collected > 0 || num(p.cost) > 0)) return 'yellow';
  if (p.status === 'Terminada' && balance <= 1) return 'green';
  if (num(p.cost) > contract && contract > 0) return 'red';
  if (balance > 0 && num(p.progress) >= 80) return 'yellow';
  return 'green';
}

function renderDashboard() {
  const list = activeProjects();
  const active = list.filter(p => p.status === 'Activa').length;
  const contract = list.reduce((a, p) => a + Math.max(0, num(p.contract)), 0);
  const collected = list.reduce((a, p) => a + Math.max(0, num(p.collected)), 0);
  const receivable = list.reduce((a,p) => {
    const commercial = num(p.contract);
    return commercial > 0 ? a + Math.max(0, commercial - num(p.collected)) : a;
  }, 0);
  document.getElementById('kpiActive').textContent = active;
  document.getElementById('kpiContract').textContent = money(contract);
  document.getElementById('kpiCollected').textContent = money(collected);
  document.getElementById('kpiReceivable').textContent = money(receivable);
  if (document.getElementById('viewTitle')?.textContent === 'Dashboard') {
    document.getElementById('viewSubtitle').textContent =
      `Resumen general de RemPro · corte ${new Date().toLocaleDateString('es-MX')}`;
  }

  const r = document.getElementById('recentProjects');
  if (!list.length) { r.className = 'empty'; r.textContent = 'Aún no hay obras registradas.'; }
  else {
    r.className = '';
    r.innerHTML = [...list].sort((a,b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0)).slice(0,5).map(p => {
      const contract = num(p.contract);
      const collected = num(p.collected);
      const amount = contract > 0 ? money(contract) : (collected > 0 ? `Recibido ${money(collected)}` : 'Contrato pendiente');
      return `<div class="recent-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.client)} · ${esc(p.status)}</small></div><strong>${esc(amount)}</strong></div>`;
    }).join('');
  }

  const a = document.getElementById('alerts');
  const alerts = [];
  list.forEach(p => {
    const contract = num(p.contract);
    const collected = num(p.collected);
    const bal = contract - collected;
    if (contract <= 0 && collected > 0) {
      alerts.push(`${p.name}: ${money(collected)} recibidos con contrato total pendiente de conciliar.`);
    }
    if (contract <= 0 && num(p.cost) > 0 && collected <= 0) {
      alerts.push(`${p.name}: costo real registrado sin importe comercial conciliado.`);
    }
    if (num(p.cost) > contract && contract > 0) alerts.push(`${p.name}: costo real supera lo contratado.`);
    if (num(p.progress) >= 80 && bal > 0 && contract > 0) alerts.push(`${p.name}: avance ${p.progress}% con saldo por cobrar ${money(bal)}.`);
    if (/por conciliar|pendiente de conciliar/i.test(String(p.folio || '')) && !alerts.some(x => x.startsWith(`${p.name}:`))) {
      alerts.push(`${p.name}: existen cifras pendientes de conciliación.`);
    }
  });
  const old = activePrices().filter(p => (Date.now() - new Date(p.date).getTime()) / 86400000 > 30);
  if (old.length) alerts.push(`${old.length} precio(s) tienen más de 30 días sin verificarse.`);
  if (!alerts.length) { a.className = 'empty'; a.textContent = 'Sin alertas por ahora.'; }
  else { a.className = ''; a.innerHTML = alerts.map(x => `<div class="alert-card">${esc(x)}</div>`).join(''); }
}

function renderProjects() {
  const query = val('projectSearch').trim().toLocaleLowerCase('es');
  const filter = val('projectFilter');
  const list = activeProjects().filter(p => (!filter || p.status === filter) && `${p.name} ${p.client} ${p.folio || ''}`.toLocaleLowerCase('es').includes(query));
  const body = document.getElementById('projectsBody'), empty = document.getElementById('projectsEmpty');
  body.innerHTML = list.map(p =>
    `<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.folio || '')}</small></td><td>${esc(p.client)}</td><td><span class="status"><i class="dot ${statusColor(p)}"></i>${esc(p.status)}</span></td><td>${num(p.contract) > 0 ? money(p.contract) : '<small>Por conciliar</small>'}</td><td>${money(p.collected)}</td><td>${money(p.cost)}</td><td>${num(p.contract) > 0 ? money(Math.max(0, num(p.contract) - num(p.collected))) : '<small>Por conciliar</small>'}</td><td>${num(p.progress)}%</td><td>${num(p.contract) > 0 ? money(num(p.contract)-num(p.cost)) : '<small>Por conciliar</small>'}</td><td><button class="mini-btn" data-edit-project="${esc(p.id)}">Editar</button> <button class="mini-btn" data-balance-project="${esc(p.id)}">Balance</button> <button class="mini-btn" data-remove-project="${esc(p.id)}">Eliminar</button></td></tr>`
  ).join('');
  empty.style.display = list.length ? 'none' : 'block';
  updateBalanceOptions();
  updateDocumentProjectOptions();
  updateCivilProjectOptions();
  renderDashboard();
}
document.getElementById('projectsBody').addEventListener('click', e => {
  const editId = e.target.closest('[data-edit-project]')?.dataset.editProject;
  if (editId) openProject(editId);
  const balanceId = e.target.closest('[data-balance-project]')?.dataset.balanceProject;
  if (balanceId) {
    document.getElementById('balanceProject').value = balanceId;
    renderBalance();
    document.getElementById('balanceResult').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const id = e.target.closest('[data-remove-project]')?.dataset.removeProject;
  if (id) removeProject(id);
});

function removeProject(id) {
  if (!confirm('¿Eliminar esta obra? Se quitará de todos los dispositivos sincronizados.')) return;
  const p = projects.find(x => x.id === id);
  if (!p) return;
  p.deleted = true;
  p.updated_at = nowISO();
  p.updated_by = currentEmail();
  save(STORAGE.projects, projects);
  renderProjects();
  window.RemProSync && window.RemProSync.queueSync();
}

const pd = document.getElementById('projectDialog');
let editingProject = null;
let editingVersion = null;
function openProject(id = null) {
  editingProject = id;
  const p = projects.find(x => x.id === id && !x.deleted);
  editingVersion = p ? JSON.stringify(p) : null;
  document.getElementById('projectForm').reset();
  document.getElementById('projectDialogTitle').textContent = p ? 'Editar obra' : 'Nueva obra';
  if (p) Object.entries({pName:'name',pClient:'client',pFolio:'folio',pStatus:'status',pContract:'contract',pCollected:'collected',pCost:'cost',pProgress:'progress'}).forEach(([field,key]) => document.getElementById(field).value = p[key] ?? '');
  pd.showModal();
}
document.getElementById('addProjectBtn').onclick = () => openProject();
document.getElementById('projectSearch').addEventListener('input', renderProjects);
document.getElementById('projectFilter').addEventListener('change', renderProjects);
document.getElementById('projectForm').onsubmit = e => {
  if (e.submitter?.value === 'cancel') return;
  e.preventDefault();
  if (!document.getElementById('projectForm').reportValidity() || !val('pName').trim() || !val('pClient').trim()) return;
  const existing = projects.find(p => p.id === editingProject);
  if (editingProject && JSON.stringify(existing) !== editingVersion) { alert('Esta obra cambió mientras la editabas. Cierra y vuelve a abrirla para revisar los datos actuales.'); return; }
  const record = {
    id: editingProject || crypto.randomUUID(),
    name: val('pName'), client: val('pClient'), folio: val('pFolio'), status: val('pStatus'),
    contract: num(val('pContract')), collected: num(val('pCollected')), cost: num(val('pCost')), progress: existing ? num(existing.progress) : 0,
    deleted: false, updated_at: nowISO(), updated_by: currentEmail()
  };
  const next = editingProject ? projects.map(p => p.id === editingProject ? record : p) : [...projects, record];
  save(STORAGE.projects, next);
  projects = next;
  pd.close();
  document.getElementById('projectForm').reset();
  renderProjects();
  window.RemProSync && window.RemProSync.queueSync();
};


function documentStatusMeta(status) {
  const map = {
    pending: ['🟡','Pendiente'],
    partial: ['🔵','Pago parcial'],
    paid: ['🟢','Pagado'],
    accepted: ['🟢','Aceptada'],
    overdue: ['🔴','Vencido'],
    rejected: ['🔴','Rechazada']
  };
  return map[status] || map.pending;
}
function documentSentLabel(state) {
  return state === 'sent' ? '⚪ Enviado' : '⚪ Sin enviar';
}
function updateDocumentProjectOptions() {
  const ids=['documentProjectFilter','dProject'];
  ids.forEach(id=>{
    const select=document.getElementById(id);
    if(!select) return;
    const previous=select.value;
    const prefix=id==='documentProjectFilter' ? '<option value="">Todas las obras</option>' : '<option value="">Selecciona una obra</option>';
    select.innerHTML=prefix+activeProjects().map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.client)}</option>`).join('');
    if ([...select.options].some(o=>o.value===previous)) select.value=previous;
  });
}
function renderDocuments() {
  const body=document.getElementById('documentsBody'), empty=document.getElementById('documentsEmpty');
  if(!body || !empty) return;
  const projectFilter=document.getElementById('documentProjectFilter')?.value || '';
  const statusFilter=document.getElementById('documentStatusFilter')?.value || '';
  const list=[...activeDocuments()]
    .filter(d=>(!projectFilter || d.project_id===projectFilter) && (!statusFilter || d.status===statusFilter))
    .sort((a,b)=>(Date.parse(b.updated_at)||0)-(Date.parse(a.updated_at)||0));
  body.innerHTML=list.map(d=>{
    const p=activeProjects().find(x=>x.id===d.project_id);
    const [icon,label]=documentStatusMeta(d.status);
    return `<tr>
      <td><strong>${esc(d.title)}</strong><br><small>${esc(d.document_type || '')}</small></td>
      <td>${esc(p?.name || 'Obra no disponible')}</td>
      <td>${esc(d.folio || '—')}</td>
      <td>${money(d.amount)}</td>
      <td><span class="doc-chip doc-${esc(d.status || 'pending')}">${icon} ${esc(label)}</span></td>
      <td><span class="doc-chip doc-sent">${esc(documentSentLabel(d.sent_state))}</span></td>
      <td>${esc(d.due_date || '—')}</td>
      <td><button class="mini-btn" data-edit-document="${esc(d.id)}">Editar</button> <button class="mini-btn" data-remove-document="${esc(d.id)}">Eliminar</button></td>
    </tr>`;
  }).join('');
  empty.style.display=list.length?'none':'block';
}
const dd=document.getElementById('documentDialog');
let editingDocument=null, editingDocumentVersion=null;
function openDocument(id=null) {
  editingDocument=id;
  const d=documents.find(x=>x.id===id && !x.deleted);
  editingDocumentVersion=d?JSON.stringify(d):null;
  document.getElementById('documentForm').reset();
  updateDocumentProjectOptions();
  document.getElementById('documentDialogTitle').textContent=d?'Editar documento':'Nuevo documento';
  if(d) {
    const fields={dProject:'project_id',dTitle:'title',dType:'document_type',dFolio:'folio',dAmount:'amount',dStatus:'status',dSent:'sent_state',dDueDate:'due_date',dNotes:'notes'};
    Object.entries(fields).forEach(([field,key])=>{ document.getElementById(field).value=d[key] ?? ''; });
  } else {
    document.getElementById('dStatus').value='pending';
    document.getElementById('dSent').value='unsent';
  }
  dd.showModal();
}
document.getElementById('addDocumentBtn').onclick=()=>openDocument();
document.getElementById('documentProjectFilter').addEventListener('change',renderDocuments);
document.getElementById('documentStatusFilter').addEventListener('change',renderDocuments);
document.getElementById('documentsBody').addEventListener('click',e=>{
  const editId=e.target.closest('[data-edit-document]')?.dataset.editDocument;
  if(editId) openDocument(editId);
  const removeId=e.target.closest('[data-remove-document]')?.dataset.removeDocument;
  if(removeId) removeDocument(removeId);
});
function removeDocument(id) {
  if(!confirm('¿Eliminar este documento del Control Maestro?')) return;
  const d=documents.find(x=>x.id===id);
  if(!d) return;
  d.deleted=true; d.updated_at=nowISO(); d.updated_by=currentEmail();
  save(STORAGE.documents,documents); renderDocuments();
  window.RemProSync && window.RemProSync.queueSync();
}
document.getElementById('documentForm').onsubmit=e=>{
  if(e.submitter?.value==='cancel') return;
  e.preventDefault();
  if(!document.getElementById('documentForm').reportValidity() || !val('dProject') || !val('dTitle').trim()) return;
  const existing=documents.find(d=>d.id===editingDocument);
  if(editingDocument && JSON.stringify(existing)!==editingDocumentVersion) { alert('Este documento cambió mientras lo editabas. Cierra y vuelve a abrirlo.'); return; }
  const record={
    id:editingDocument || crypto.randomUUID(),
    project_id:val('dProject'), title:val('dTitle'), document_type:val('dType'), folio:val('dFolio'),
    amount:num(val('dAmount')), status:val('dStatus') || 'pending', sent_state:val('dSent') || 'unsent',
    due_date:val('dDueDate') || null, notes:val('dNotes'),
    deleted:false, updated_at:nowISO(), updated_by:currentEmail()
  };
  documents=editingDocument ? documents.map(d=>d.id===editingDocument?record:d) : [...documents,record];
  save(STORAGE.documents,documents); dd.close(); renderDocuments();
  window.RemProSync && window.RemProSync.queueSync();
};


let civilLastResult = null;
let civilFreeRows = [{ id: crypto.randomUUID(), description: '', operation: 'add', count: 1, length: 0, width: 0, height: 0 }];


function readCivilFreeRows() {
  return [...document.querySelectorAll('#civilFreeRowsBody tr')].map(tr => ({
    id: tr.dataset.id,
    description: tr.querySelector('[data-free-field="description"]').value,
    operation: tr.querySelector('[data-free-field="operation"]').value,
    count: num(tr.querySelector('[data-free-field="count"]').value),
    length: num(tr.querySelector('[data-free-field="length"]').value),
    width: num(tr.querySelector('[data-free-field="width"]').value),
    height: num(tr.querySelector('[data-free-field="height"]').value)
  }));
}

function updateCivilFreeDimensions() {
  const mode = val('civilFreeMode');
  document.querySelectorAll('.civil-free-width').forEach(el => { el.hidden = mode === 'linear'; });
  document.querySelectorAll('.civil-free-height').forEach(el => { el.hidden = mode !== 'volume'; });
}

function renderCivilFreeRows() {
  const body = document.getElementById('civilFreeRowsBody');
  if (!body) return;
  body.innerHTML = civilFreeRows.map(row => `<tr data-id="${esc(row.id)}">
    <td><input data-free-field="description" type="text" value="${esc(row.description || '')}" placeholder="Ej. Muro eje A"></td>
    <td><select data-free-field="operation"><option value="add" ${row.operation !== 'subtract' ? 'selected' : ''}>Agregar</option><option value="subtract" ${row.operation === 'subtract' ? 'selected' : ''}>Descontar</option></select></td>
    <td><input data-free-field="count" type="number" min="0" step="0.001" value="${esc(row.count ?? 1)}" inputmode="decimal"></td>
    <td><input data-free-field="length" type="number" min="0" step="0.001" value="${esc(row.length || '')}" inputmode="decimal"></td>
    <td class="civil-free-width"><input data-free-field="width" type="number" min="0" step="0.001" value="${esc(row.width || '')}" inputmode="decimal"></td>
    <td class="civil-free-height"><input data-free-field="height" type="number" min="0" step="0.001" value="${esc(row.height || '')}" inputmode="decimal"></td>
    <td><button class="mini-btn" type="button" data-remove-free-row="${esc(row.id)}">Quitar</button></td>
  </tr>`).join('');
  updateCivilFreeDimensions();
}

function updateCivilProjectOptions() {
  const select = document.getElementById('civilProject');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = '<option value="">Sin vincular a obra</option>' +
    activeProjects().map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.client)}</option>`).join('');
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
}

function updateCivilMasonryUnitOptions() {
  const select = document.getElementById('civilMasonryUnit');
  if (!select || !window.RemProCivil) return;
  if (!select.options.length) {
    select.innerHTML = Object.entries(window.RemProCivil.masonryUnits)
      .map(([key, unit]) => `<option value="${esc(key)}">${esc(unit.label)}</option>`).join('');
    select.value = 'block12';
    applyCivilMasonryPreset();
  }
}

function applyCivilMasonryPreset() {
  const preset = window.RemProCivil?.masonryUnits?.[val('civilMasonryUnit')];
  if (!preset || val('civilMasonryUnit') === 'custom') return;
  document.getElementById('civilUnitLength').value = preset.length;
  document.getElementById('civilUnitHeight').value = preset.height;
  document.getElementById('civilUnitDepth').value = preset.depth;
}

function updateCivilTypeFields() {
  const type = val('civilType');
  const masonry = type === 'masonry_wall';
  const stone = type === 'stone_masonry';
  const column = type === 'column';
  const beam = type === 'beam';
  const footing = type === 'footing';
  const reinforcedWall = type === 'reinforced_wall';
  const reinforcedSlab = type === 'reinforced_slab';
  const crewWork = type === 'crew_work';
  const freeGenerator = type === 'free_generator';
  const structural = column || beam || footing || reinforcedWall || reinforcedSlab;
  const fields = document.getElementById('civilMasonryFields');
  if (fields) fields.hidden = !masonry;
  const stoneFields = document.getElementById('civilStoneFields');
  if (stoneFields) stoneFields.hidden = !stone;
  const columnFields = document.getElementById('civilColumnFields');
  if (columnFields) columnFields.hidden = !column;
  const beamFields = document.getElementById('civilBeamFields');
  if (beamFields) beamFields.hidden = !beam;
  const footingFields = document.getElementById('civilFootingFields');
  if (footingFields) footingFields.hidden = !footing;
  const reinforcedWallFields = document.getElementById('civilReinforcedWallFields');
  if (reinforcedWallFields) reinforcedWallFields.hidden = !reinforcedWall;
  const reinforcedSlabFields = document.getElementById('civilReinforcedSlabFields');
  if (reinforcedSlabFields) reinforcedSlabFields.hidden = !reinforcedSlab;
  const freeFields = document.getElementById('civilFreeGeneratorFields');
  if (freeFields) freeFields.hidden = !freeGenerator;
  const crewFields = document.getElementById('civilCrewFields');
  if (crewFields) crewFields.hidden = !crewWork;
  const materialFields = document.getElementById('civilMaterialFields');
  if (materialFields) materialFields.hidden = crewWork || freeGenerator;
  document.getElementById('civilDosageLabel').hidden = crewWork || freeGenerator;
  document.getElementById('civilBagWeightLabel').hidden = crewWork || freeGenerator;
  document.getElementById('civilThicknessLabel').hidden = masonry;
  document.getElementById('civilDirectVolumeLabel').hidden = masonry || structural;
  document.getElementById('civilVolumeHeading').textContent = masonry ? 'Geometría del muro' : stone ? 'Geometría de la mampostería de piedra' : column ? 'Geometría de la columna' : beam ? 'Geometría de la trabe' : footing ? 'Geometría de la zapata' : reinforcedWall ? 'Geometría del muro de concreto' : reinforcedSlab ? 'Geometría de la losa de concreto' : 'Volumen';
  document.getElementById('civilVolumeHint').textContent = masonry
    ? 'El área neta descuenta los vanos. Las dimensiones de pieza y juntas permanecen editables.'
    : stone
      ? 'El volumen directo tiene prioridad; si se omite, se calcula largo × alto × espesor menos los vanos.'
    : column
      ? 'Captura ancho, peralte y altura por columna. El volumen total considera el número de elementos.'
    : beam
      ? 'Captura largo, ancho y peralte por trabe. El volumen total considera el número de elementos.'
    : footing
      ? 'Captura largo, ancho y espesor por zapata. El volumen total suma los dados cuando sus dimensiones son mayores que cero.'
    : reinforcedWall
      ? 'Captura largo, alto y espesor por muro. Los vanos descuentan concreto y cimbra, no el acero de la retícula.'
    : reinforcedSlab
      ? 'Captura largo, ancho y espesor por losa. El armado se cuantifica en ambos sentidos y una o dos parrillas.'
    : 'Puedes capturar dimensiones o escribir directamente los m³. Si existe volumen directo, éste tiene prioridad.';
  document.getElementById('civilLengthLabel').firstChild.nodeValue = masonry ? 'Largo del muro (m)' : stone ? 'Largo del elemento (m)' : column ? 'Ancho de sección (m)' : beam ? 'Largo de trabe (m)' : footing ? 'Largo de zapata (m)' : reinforcedWall ? 'Largo de muro (m)' : reinforcedSlab ? 'Largo de losa (m)' : 'Largo (m)';
  document.getElementById('civilWidthLabel').firstChild.nodeValue = masonry ? 'Alto del muro (m)' : stone ? 'Alto del elemento (m)' : column ? 'Peralte de sección (m)' : beam ? 'Ancho de sección (m)' : footing ? 'Ancho de zapata (m)' : reinforcedWall ? 'Alto de muro (m)' : reinforcedSlab ? 'Ancho de losa (m)' : 'Ancho / altura (m)';
  document.getElementById('civilThicknessLabel').firstChild.nodeValue = stone ? 'Espesor del elemento (m)' : column ? 'Altura de columna (m)' : beam ? 'Peralte de sección (m)' : footing ? 'Espesor de zapata (m)' : reinforcedWall ? 'Espesor de muro (m)' : reinforcedSlab ? 'Espesor de losa (m)' : 'Espesor / peralte (m)';
  updateCivilMasonryUnitOptions();
}

function updateCivilDosageOptions() {
  const type = val('civilType');
  const select = document.getElementById('civilDosage');
  const label = document.getElementById('civilDosageLabel');
  const thirdLabel = document.getElementById('civilWasteThirdLabel');
  if (!select || !window.RemProCivil) return;
  updateCivilTypeFields();
  const previous = select.value;
  if (['crew_work','free_generator'].includes(type)) {
    select.innerHTML = '';
    return;
  }
  if (['concrete','column','beam','footing','reinforced_wall','reinforced_slab'].includes(type)) {
    if (label?.firstChild) label.firstChild.nodeValue = "Resistencia f'c ";
    if (thirdLabel?.firstChild) thirdLabel.firstChild.nodeValue = 'Grava (%)';
    select.innerHTML = Object.keys(window.RemProCivil.concreteDosages)
      .sort((a,b)=>Number(a)-Number(b))
      .map(fc => `<option value="${fc}">${fc} kg/cm²</option>`).join('');
    select.value = [...select.options].some(o=>o.value===previous) ? previous : '250';
  } else {
    if (label?.firstChild) label.firstChild.nodeValue = type === 'masonry_wall' ? 'Mortero para juntas y repellado ' : type === 'stone_masonry' ? 'Mortero de asiento ' : 'Proporción ';
    if (thirdLabel?.firstChild) thirdLabel.firstChild.nodeValue = 'Cal (%)';
    select.innerHTML = Object.keys(window.RemProCivil.mortarDosages)
      .map(mix => `<option value="${esc(mix)}">${esc(mix.replace(/^\./,''))}</option>`).join('');
    select.value = [...select.options].some(o=>o.value===previous) ? previous : '.1:4';
  }
}

function civilInputPayload() {
  const type = val('civilType');
  const dosage = val('civilDosage');
  const common = {
    bagWeight: num(val('civilBagWeight')) || 50,
    wasteCement: num(val('civilWasteCement')),
    wasteSand: num(val('civilWasteSand')),
    wasteThird: num(val('civilWasteThird'))
  };
  if (type === 'masonry_wall') {
    const unit = window.RemProCivil.masonryUnits[val('civilMasonryUnit')];
    return {
      ...common,
      length: num(val('civilLength')),
      height: num(val('civilWidth')),
      openingArea: num(val('civilOpeningArea')),
      unitLength: num(val('civilUnitLength')),
      unitHeight: num(val('civilUnitHeight')),
      unitDepth: num(val('civilUnitDepth')),
      unitLabel: unit?.label || 'Pieza personalizada',
      jointHorizontal: num(val('civilJointHorizontal')),
      jointVertical: num(val('civilJointVertical')),
      plasterFaces: num(val('civilPlasterFaces')),
      plasterThickness: num(val('civilPlasterThickness')),
      wasteUnits: num(val('civilWasteUnits')),
      wasteMortar: num(val('civilWasteMortar')),
      mix: dosage
    };
  }
  if (type === 'stone_masonry') {
    return {
      ...common,
      directVolume: num(val('civilDirectVolume')),
      length: num(val('civilLength')),
      height: num(val('civilWidth')),
      thickness: num(val('civilThickness')),
      openingArea: num(val('civilStoneOpeningArea')),
      stoneFactor: num(val('civilStoneFactor')),
      mortarFactor: num(val('civilStoneMortarFactor')),
      wasteStone: num(val('civilStoneWaste')),
      wasteMortar: num(val('civilStoneWasteMortar')),
      mix: dosage
    };
  }
  if (type === 'column') {
    return {
      ...common,
      width: num(val('civilLength')),
      depth: num(val('civilWidth')),
      height: num(val('civilThickness')),
      count: num(val('civilColumnCount')),
      longitudinalBars: num(val('civilLongitudinalBars')),
      longitudinalDiameter: num(val('civilLongitudinalDiameter')),
      extraBarLength: num(val('civilExtraBarLength')),
      stirrupDiameter: num(val('civilStirrupDiameter')),
      stirrupSpacing: num(val('civilStirrupSpacing')),
      stirrupMultiplicity: num(val('civilStirrupMultiplicity')),
      cover: num(val('civilCover')),
      hookLength: num(val('civilHookLength')),
      wasteSteel: num(val('civilWasteSteel')),
      wasteFormwork: num(val('civilWasteFormwork')),
      fc: dosage
    };
  }
  if (type === 'beam') {
    return {
      ...common,
      length: num(val('civilLength')),
      width: num(val('civilWidth')),
      depth: num(val('civilThickness')),
      count: num(val('civilBeamCount')),
      topBars: num(val('civilBeamTopBars')),
      bottomBars: num(val('civilBeamBottomBars')),
      longitudinalDiameter: num(val('civilBeamLongitudinalDiameter')),
      extraBarLength: num(val('civilBeamExtraBarLength')),
      stirrupDiameter: num(val('civilBeamStirrupDiameter')),
      stirrupSpacing: num(val('civilBeamStirrupSpacing')),
      stirrupMultiplicity: num(val('civilBeamStirrupMultiplicity')),
      cover: num(val('civilBeamCover')),
      hookLength: num(val('civilBeamHookLength')),
      wasteSteel: num(val('civilBeamWasteSteel')),
      wasteFormwork: num(val('civilBeamWasteFormwork')),
      fc: dosage
    };
  }
  if (type === 'footing') {
    return {
      ...common,
      length: num(val('civilLength')),
      width: num(val('civilWidth')),
      thickness: num(val('civilThickness')),
      count: num(val('civilFootingCount')),
      barsX: num(val('civilFootingBarsX')),
      barsY: num(val('civilFootingBarsY')),
      diameter: num(val('civilFootingDiameter')),
      cover: num(val('civilFootingCover')),
      dadoLength: num(val('civilDadoLength')),
      dadoWidth: num(val('civilDadoWidth')),
      dadoHeight: num(val('civilDadoHeight')),
      dadoBars: num(val('civilDadoBars')),
      dadoDiameter: num(val('civilDadoDiameter')),
      dadoExtraBarLength: num(val('civilDadoExtraBarLength')),
      stirrupDiameter: num(val('civilDadoStirrupDiameter')),
      stirrupSpacing: num(val('civilDadoStirrupSpacing')),
      hookLength: num(val('civilDadoHookLength')),
      wasteSteel: num(val('civilFootingWasteSteel')),
      wasteFormwork: num(val('civilFootingWasteFormwork')),
      fc: dosage
    };
  }
  if (type === 'reinforced_wall') {
    return {
      ...common,
      length: num(val('civilLength')),
      height: num(val('civilWidth')),
      thickness: num(val('civilThickness')),
      count: num(val('civilReinforcedWallCount')),
      openingArea: num(val('civilReinforcedWallOpeningArea')),
      verticalDiameter: num(val('civilWallVerticalDiameter')),
      verticalSpacing: num(val('civilWallVerticalSpacing')),
      horizontalDiameter: num(val('civilWallHorizontalDiameter')),
      horizontalSpacing: num(val('civilWallHorizontalSpacing')),
      reinforcementFaces: num(val('civilWallReinforcementFaces')),
      extraBarLength: num(val('civilWallExtraBarLength')),
      formworkFaces: num(val('civilWallFormworkFaces')),
      wasteSteel: num(val('civilWallWasteSteel')),
      wasteFormwork: num(val('civilWallWasteFormwork')),
      fc: dosage
    };
  }
  if (type === 'reinforced_slab') {
    return {
      ...common,
      length: num(val('civilLength')),
      width: num(val('civilWidth')),
      thickness: num(val('civilThickness')),
      count: num(val('civilReinforcedSlabCount')),
      diameterX: num(val('civilSlabDiameterX')),
      spacingX: num(val('civilSlabSpacingX')),
      diameterY: num(val('civilSlabDiameterY')),
      spacingY: num(val('civilSlabSpacingY')),
      reinforcementLayers: num(val('civilSlabReinforcementLayers')),
      extraBarLength: num(val('civilSlabExtraBarLength')),
      formworkMode: val('civilSlabFormworkMode'),
      wasteSteel: num(val('civilSlabWasteSteel')),
      wasteFormwork: num(val('civilSlabWasteFormwork')),
      fc: dosage
    };
  }


  if (type === 'free_generator') {
    return {
      mode: val('civilFreeMode'),
      rows: readCivilFreeRows().map(({ id, ...row }) => row)
    };
  }
  if (type === 'crew_work') {
    return {
      quantity: num(val('civilCrewQuantity')),
      unit: val('civilCrewUnit'),
      productivityPerDay: num(val('civilCrewProductivity')),
      workDaysPerWeek: num(val('civilCrewDaysPerWeek')),
      contingencyPercent: num(val('civilCrewContingency')),
      selectedMethod: val('civilCrewMethod'),
      pieceworkUnitRate: num(val('civilCrewPieceRate')),
      roles: [
        { role: 'Oficial', count: num(val('civilCrewOfficialCount')), weeklyCost: num(val('civilCrewOfficialCost')) },
        { role: 'Ayudante', count: num(val('civilCrewHelperCount')), weeklyCost: num(val('civilCrewHelperCost')) },
        { role: 'Cabo', count: num(val('civilCrewForemanCount')), weeklyCost: num(val('civilCrewForemanCost')) },
        { role: 'Supervisor', count: num(val('civilCrewSupervisorCount')), weeklyCost: num(val('civilCrewSupervisorCost')) },
        { role: 'Especialista', count: num(val('civilCrewSpecialistCount')), weeklyCost: num(val('civilCrewSpecialistCost')) }
      ]
    };
  }
  return {
    ...common,
    directVolume: num(val('civilDirectVolume')),
    length: num(val('civilLength')),
    width: num(val('civilWidth')),
    thickness: num(val('civilThickness')),
    ...(type === 'concrete' ? { fc: dosage } : { mix: dosage })
  };
}

function applyCrewWorkApu(result) {
  const qty=Number(result.quantity || 0);
  if (!(qty > 0)) return;
  const pu=Number(result.selectedDirectCost || 0)/qty;
  apuRows=[{
    type:'Mano de obra',
    desc:result.selectedMethod === 'crew' ? 'Ejecución por cuadrilla' : 'Ejecución por destajo',
    sourcePriceId:'',
    qty,
    unit:result.unit || 'u',
    pu:Number(pu.toFixed(4)),
    autoGenerated:true,
    autoSourceKey:`civil:crew_work:${val('civilLabel') || 'trabajo'}`,
    pricingStatus:'priced',
    pricingReason:'Costo directo calculado por el módulo Destajo / cuadrilla.'
  }];
  document.getElementById('apuConceptDescription').value=`Ejecución de ${val('civilLabel') || 'trabajo'} mediante ${result.selectedMethod === 'crew' ? 'cuadrilla' : 'destajo'}, según rendimiento y costos capturados.`;
  document.getElementById('apuSaleQty').value=String(qty);
  document.getElementById('apuSaleUnit').value=result.unit || 'u';
  renderApu();
  saveApuInputs(false);
}

function renderCivilResult(result) {
  const out = document.getElementById('civilResult');
  const source = document.getElementById('civilSource');
  if (!out) return;
  if (!result) {
    out.className = 'empty';
    out.textContent = 'Captura los datos y calcula.';
    if (source) source.textContent = '';
    return;
  }
  out.className = '';
  if (source) source.textContent = result.source || '';
  const nf = new Intl.NumberFormat('es-MX',{maximumFractionDigits:3});


  if (result.type === 'free_generator') {
    const rows = result.rows.map(row => `<tr><td>${esc(row.description)}</td><td>${row.operation === 'add' ? 'Agregar' : 'Descontar'}</td><td>${nf.format(row.quantity)} ${esc(result.unit)}</td></tr>`).join('');
    out.innerHTML = `
      <div class="civil-result-summary">
        <div><span>Agregados</span><strong>${nf.format(result.additions)} ${esc(result.unit)}</strong></div>
        <div><span>Deducciones</span><strong>${nf.format(result.subtractions)} ${esc(result.unit)}</strong></div>
        <div><span>Cantidad neta</span><strong>${nf.format(result.quantity)} ${esc(result.unit)}</strong></div>
      </div>
      <table class="civil-result-table">
        <thead><tr><th>Renglón</th><th>Operación</th><th>Resultado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="civil-source-note">${esc(result.boundaryNote)}</p>`;
    return;
  }
  if (result.type === 'crew_work') {
    applyCrewWorkApu(result);
    const methodLabel = result.selectedMethod === 'crew' ? 'Cuadrilla' : 'Destajo';
    const roleRows = result.roles.length
      ? result.roles.map(row => `<tr><td>${esc(row.role)} × ${nf.format(row.count)}</td><td>semana</td><td>${money(row.weeklySubtotal)}</td></tr>`).join('')
      : '<tr><td colspan="3">Sin integración de cuadrilla capturada.</td></tr>';
    const flowRows = result.cashFlow.map(row =>
      `<tr><td>Periodo ${nf.format(row.period)} · ${nf.format(row.days)} día(s)</td><td>${nf.format(row.quantity)} ${esc(result.unit)}</td><td>${money(row.amount)}</td></tr>`
    ).join('');
    out.innerHTML = `
      <div class="civil-result-summary">
        <div><span>Duración estimada</span><strong>${nf.format(result.plannedDays)} días</strong></div>
        <div><span>Costo directo cuadrilla</span><strong>${money(result.crewDirectCost)}</strong></div>
        <div><span>Costo directo destajo</span><strong>${money(result.pieceworkDirectCost)}</strong></div>
        <div><span>Método seleccionado</span><strong>${methodLabel} · ${money(result.selectedDirectCost)}</strong></div>
      </div>
      <table class="civil-result-table">
        <thead><tr><th>Integración</th><th>Periodo</th><th>Costo semanal</th></tr></thead>
        <tbody>${roleRows}</tbody>
      </table>
      <table class="civil-result-table">
        <thead><tr><th>Flujo estimado</th><th>Producción</th><th>Salida</th></tr></thead>
        <tbody>${flowRows}</tbody>
      </table>
      <p class="civil-source-note">${esc(result.costBoundaryNote)}</p>`;
    return;
  }
  const primarySummary = result.type === 'masonry_wall'
    ? `<div><span>Área neta de muro</span><strong>${nf.format(result.netAreaM2)} m²</strong></div>
       <div><span>Piezas</span><strong>${nf.format(result.pieceCount)} pzas</strong></div>
       <div><span>Mortero total</span><strong>${nf.format(result.volumeM3)} m³</strong></div>`
    : result.type === 'stone_masonry'
      ? `<div><span>Volumen ejecutado</span><strong>${nf.format(result.volumeM3)} m³</strong></div>
         <div><span>Piedra</span><strong>${nf.format(result.stoneM3)} m³</strong></div>
         <div><span>Mortero</span><strong>${nf.format(result.mortarVolumeM3)} m³</strong></div>`
    : ['column','beam','footing','reinforced_wall','reinforced_slab'].includes(result.type)
      ? `<div><span>Concreto total</span><strong>${nf.format(result.volumeM3)} m³</strong></div>
         <div><span>Acero total</span><strong>${nf.format(result.steelKg)} kg</strong></div>
         <div><span>Cimbra</span><strong>${nf.format(result.formworkM2)} m²</strong></div>`
    : `<div><span>Volumen calculado</span><strong>${nf.format(result.volumeM3)} m³</strong></div>`;
  out.innerHTML = `
    <div class="civil-result-summary">
      ${primarySummary}
      <div><span>Dosificación</span><strong>${esc(result.dosage)}${['concrete','column','beam','footing','reinforced_wall','reinforced_slab'].includes(result.type) ? ' kg/cm²' : ''}</strong></div>
    </div>
    ${(() => {
      const costing=costCalculatedMaterials(result.materials.map(pricingCivilMaterial));
      applyAutomaticApu(costing,civilApuMeta(result,civilLastResult?.input || {}));
      return renderCivilCosting(costing,nf);
    })()}
    <p class="civil-source-note">Las cantidades incluyen los desperdicios capturados. El agua se mantiene según la dosificación base y no se incrementa por desperdicio.</p>`;
}

function calculateCivil() {
  if (!window.RemProCivil) return;
  try {
    const type = val('civilType');
    const input = civilInputPayload();
    const result = window.RemProCivil.calculate(type, input);
    civilLastResult = { type, input, result };
    renderCivilResult(result);
    document.getElementById('civilSaveBtn').disabled = false;
  } catch (err) {
    civilLastResult = null;
    document.getElementById('civilSaveBtn').disabled = true;
    renderCivilResult(null);
    alert(err.message || 'No se pudo realizar el cálculo.');
  }
}

function clearCivilCalculator() {
  ['civilLength','civilWidth','civilThickness','civilDirectVolume','civilLabel'].forEach(id => {
    const el=document.getElementById(id); if (el) el.value='';
  });
  document.getElementById('civilWasteCement').value='5';
  document.getElementById('civilWasteSand').value='20';
  document.getElementById('civilWasteThird').value='30';
  document.getElementById('civilProject').value='';
  document.getElementById('civilOpeningArea').value='0';
  document.getElementById('civilJointHorizontal').value='0.01';
  document.getElementById('civilJointVertical').value='0.01';
  document.getElementById('civilPlasterFaces').value='0';
  document.getElementById('civilPlasterThickness').value='0.015';
  document.getElementById('civilWasteUnits').value='5';
  document.getElementById('civilWasteMortar').value='10';
  document.getElementById('civilColumnCount').value='1';
  document.getElementById('civilLongitudinalBars').value='4';
  document.getElementById('civilLongitudinalDiameter').value='12.7';
  document.getElementById('civilExtraBarLength').value='0.60';
  document.getElementById('civilStirrupDiameter').value='6';
  document.getElementById('civilStirrupSpacing').value='0.20';
  document.getElementById('civilStirrupMultiplicity').value='1';
  document.getElementById('civilCover').value='0.025';
  document.getElementById('civilHookLength').value='0.10';
  document.getElementById('civilWasteSteel').value='5';
  document.getElementById('civilWasteFormwork').value='5';
  document.getElementById('civilBeamCount').value='1';
  document.getElementById('civilBeamTopBars').value='2';
  document.getElementById('civilBeamBottomBars').value='2';
  document.getElementById('civilBeamLongitudinalDiameter').value='12.7';
  document.getElementById('civilBeamExtraBarLength').value='0.60';
  document.getElementById('civilBeamStirrupDiameter').value='6';
  document.getElementById('civilBeamStirrupSpacing').value='0.20';
  document.getElementById('civilBeamStirrupMultiplicity').value='1';
  document.getElementById('civilBeamCover').value='0.025';
  document.getElementById('civilBeamHookLength').value='0.10';
  document.getElementById('civilBeamWasteSteel').value='5';
  document.getElementById('civilBeamWasteFormwork').value='5';
  document.getElementById('civilFootingCount').value='1';
  document.getElementById('civilFootingBarsX').value='11';
  document.getElementById('civilFootingBarsY').value='11';
  document.getElementById('civilFootingDiameter').value='12.7';
  document.getElementById('civilFootingCover').value='0.075';
  document.getElementById('civilDadoLength').value='0';
  document.getElementById('civilDadoWidth').value='0';
  document.getElementById('civilDadoHeight').value='0';
  document.getElementById('civilDadoBars').value='4';
  document.getElementById('civilDadoDiameter').value='12.7';
  document.getElementById('civilDadoExtraBarLength').value='0.60';
  document.getElementById('civilDadoStirrupDiameter').value='9.5';
  document.getElementById('civilDadoStirrupSpacing').value='0.20';
  document.getElementById('civilDadoHookLength').value='0.10';
  document.getElementById('civilFootingWasteSteel').value='5';
  document.getElementById('civilFootingWasteFormwork').value='5';
  document.getElementById('civilReinforcedWallCount').value='1';
  document.getElementById('civilReinforcedWallOpeningArea').value='0';
  document.getElementById('civilWallVerticalDiameter').value='12.7';
  document.getElementById('civilWallVerticalSpacing').value='0.20';
  document.getElementById('civilWallHorizontalDiameter').value='9.5';
  document.getElementById('civilWallHorizontalSpacing').value='0.20';
  document.getElementById('civilWallReinforcementFaces').value='2';
  document.getElementById('civilWallExtraBarLength').value='0.60';
  document.getElementById('civilWallFormworkFaces').value='2';
  document.getElementById('civilWallWasteSteel').value='5';
  document.getElementById('civilWallWasteFormwork').value='5';
  document.getElementById('civilReinforcedSlabCount').value='1';
  document.getElementById('civilSlabDiameterX').value='9.5';
  document.getElementById('civilSlabSpacingX').value='0.20';
  document.getElementById('civilSlabDiameterY').value='9.5';
  document.getElementById('civilSlabSpacingY').value='0.20';
  document.getElementById('civilSlabReinforcementLayers').value='1';
  document.getElementById('civilSlabExtraBarLength').value='0.40';
  document.getElementById('civilSlabFormworkMode').value='bottom';
  document.getElementById('civilSlabWasteSteel').value='5';
  document.getElementById('civilSlabWasteFormwork').value='5';


  civilFreeRows=[{ id: crypto.randomUUID(), description: '', operation: 'add', count: 1, length: 0, width: 0, height: 0 }];
  document.getElementById('civilFreeMode').value='linear';
  renderCivilFreeRows();
  document.getElementById('civilCrewQuantity').value='';
  document.getElementById('civilCrewUnit').value='m²';
  document.getElementById('civilCrewProductivity').value='';
  document.getElementById('civilCrewDaysPerWeek').value='6';
  document.getElementById('civilCrewContingency').value='0';
  document.getElementById('civilCrewMethod').value='crew';
  document.getElementById('civilCrewPieceRate').value='0';
  document.getElementById('civilCrewOfficialCount').value='1';
  document.getElementById('civilCrewOfficialCost').value='0';
  document.getElementById('civilCrewHelperCount').value='1';
  document.getElementById('civilCrewHelperCost').value='0';
  document.getElementById('civilCrewForemanCount').value='0';
  document.getElementById('civilCrewForemanCost').value='0';
  document.getElementById('civilCrewSupervisorCount').value='0';
  document.getElementById('civilCrewSupervisorCost').value='0';
  document.getElementById('civilCrewSpecialistCount').value='0';
  document.getElementById('civilCrewSpecialistCost').value='0';
  document.getElementById('civilStoneOpeningArea').value='0';
  document.getElementById('civilStoneFactor').value='1.20';
  document.getElementById('civilStoneMortarFactor').value='0.30';
  document.getElementById('civilStoneWaste').value='5';
  document.getElementById('civilStoneWasteMortar').value='10';
  document.getElementById('civilMasonryUnit').value='block12';
  applyCivilMasonryPreset();
  civilLastResult=null;
  document.getElementById('civilSaveBtn').disabled=true;
  renderCivilResult(null);
}

function saveCivilCalculation() {
  if (!civilLastResult) return;
  const record = {
    id: crypto.randomUUID(),
    project_id: val('civilProject') || null,
    calculation_type: civilLastResult.type,
    label: val('civilLabel').trim() || ({ concrete: 'Concreto', mortar: 'Mortero', masonry_wall: 'Muro de mampostería', stone_masonry: 'Mampostería de piedra', column: 'Columna de concreto armado', beam: 'Trabe de concreto armado', footing: 'Zapata / dado de concreto armado', reinforced_wall: 'Muro de concreto reforzado', reinforced_slab: 'Losa de concreto reforzado', crew_work: 'Destajo / cuadrilla', free_generator: 'Generador libre' }[civilLastResult.type] || 'Obra civil'),
    input_payload: civilLastResult.input,
    result_payload: civilLastResult.result,
    source_version: 'civil-v9',
    deleted: false,
    updated_at: nowISO(),
    updated_by: currentEmail()
  };
  civilCalculations=[...civilCalculations,record];
  save(STORAGE.civilCalculations,civilCalculations);
  renderCivilHistory();
  window.RemProSync && window.RemProSync.queueSync();
  document.getElementById('civilSaveBtn').disabled=true;
}

function civilResultSummary(result) {
  if (result?.type === 'free_generator') return `Cantidad neta: ${Number(result.quantity || 0).toLocaleString('es-MX',{maximumFractionDigits:3})} ${result.unit || ''}`;
  if (result?.type === 'crew_work') {
    const method = result.selectedMethod === 'crew' ? 'Cuadrilla' : 'Destajo';
    return `${method}: ${money(result.selectedDirectCost)} · ${Number(result.plannedDays || 0).toLocaleString('es-MX',{maximumFractionDigits:2})} días`;
  }
  if (!result?.materials?.length) return '—';
  return result.materials.slice(0,2).map(m => `${m.description}: ${Number(m.quantity).toLocaleString('es-MX',{maximumFractionDigits:2})} ${m.unit}`).join(' · ');
}

function renderCivilHistory() {
  const body=document.getElementById('civilHistoryBody'), empty=document.getElementById('civilHistoryEmpty');
  if (!body || !empty) return;
  const list=[...activeCivilCalculations()].sort((a,b)=>(Date.parse(b.updated_at)||0)-(Date.parse(a.updated_at)||0));
  body.innerHTML=list.map(c=>{
    const p=activeProjects().find(x=>x.id===c.project_id);
    const r=c.result_payload || {};
    return `<tr>
      <td>${esc((c.updated_at || '').slice(0,10) || '—')}</td>
      <td>${({concrete:'Concreto',mortar:'Mortero',masonry_wall:'Muro mampostería',stone_masonry:'Piedra',column:'Columna',beam:'Trabe',footing:'Zapata / dado',reinforced_wall:'Muro de concreto',reinforced_slab:'Losa de concreto',crew_work:'Destajo / cuadrilla',free_generator:'Generador libre'}[c.calculation_type] || esc(c.calculation_type))}</td>
      <td>${esc(p?.name || 'Sin vincular')}</td>
      <td>${esc(c.label || '—')}</td>
      <td>${c.calculation_type === 'masonry_wall'
        ? `${Number(r.netAreaM2 || 0).toLocaleString('es-MX',{maximumFractionDigits:3})} m²`
        : ['crew_work','free_generator'].includes(c.calculation_type)
          ? `${Number(r.quantity || 0).toLocaleString('es-MX',{maximumFractionDigits:3})} ${esc(r.unit || '')}`
          : `${Number(r.volumeM3 || 0).toLocaleString('es-MX',{maximumFractionDigits:3})} m³`}</td>
      <td><small>${esc(civilResultSummary(r))}</small></td>
      <td><div class="civil-history-actions"><button class="mini-btn" data-civil-load="${esc(c.id)}">Cargar</button><button class="mini-btn" data-civil-remove="${esc(c.id)}">Eliminar</button></div></td>
    </tr>`;
  }).join('');
  empty.style.display=list.length?'none':'block';
}

function loadCivilCalculation(id) {
  const c=civilCalculations.find(x=>x.id===id && !x.deleted);
  if (!c) return;
  document.getElementById('civilType').value=c.calculation_type;
  updateCivilDosageOptions();
  document.getElementById('civilProject').value=c.project_id || '';
  document.getElementById('civilLabel').value=c.label || '';
  const i=c.input_payload || {};
  document.getElementById('civilLength').value=c.calculation_type==='column' ? (i.width || '') : (i.length || '');
  document.getElementById('civilWidth').value=c.calculation_type==='column' ? (i.depth || '') : ['stone_masonry','reinforced_wall'].includes(c.calculation_type) ? (i.height || '') : (i.width || '');
  document.getElementById('civilThickness').value=c.calculation_type==='column' ? (i.height || '') : c.calculation_type==='beam' ? (i.depth || '') : (i.thickness || '');
  document.getElementById('civilDirectVolume').value=i.directVolume || '';
  document.getElementById('civilBagWeight').value=String(i.bagWeight || 50);
  document.getElementById('civilWasteCement').value=i.wasteCement ?? 5;
  document.getElementById('civilWasteSand').value=i.wasteSand ?? 20;
  document.getElementById('civilWasteThird').value=i.wasteThird ?? 30;
  document.getElementById('civilDosage').value=['concrete','column','beam','footing','reinforced_wall','reinforced_slab'].includes(c.calculation_type) ? String(i.fc || '250') : String(i.mix || '.1:4');
  if (c.calculation_type === 'masonry_wall') {
    const presetKey = Object.entries(window.RemProCivil.masonryUnits)
      .find(([,u]) => u.label === i.unitLabel)?.[0] || 'custom';
    document.getElementById('civilMasonryUnit').value=presetKey;
    document.getElementById('civilUnitLength').value=i.unitLength || '';
    document.getElementById('civilUnitHeight').value=i.unitHeight || '';
    document.getElementById('civilUnitDepth').value=i.unitDepth || '';
    document.getElementById('civilOpeningArea').value=i.openingArea || 0;
    document.getElementById('civilJointHorizontal').value=i.jointHorizontal || 0.01;
    document.getElementById('civilJointVertical').value=i.jointVertical || 0.01;
    document.getElementById('civilPlasterFaces').value=String(i.plasterFaces || 0);
    document.getElementById('civilPlasterThickness').value=i.plasterThickness || 0.015;
    document.getElementById('civilWasteUnits').value=i.wasteUnits ?? 5;
    document.getElementById('civilWasteMortar').value=i.wasteMortar ?? 10;
  }
  if (c.calculation_type === 'stone_masonry') {
    document.getElementById('civilStoneOpeningArea').value=i.openingArea || 0;
    document.getElementById('civilStoneFactor').value=i.stoneFactor || 1.20;
    document.getElementById('civilStoneMortarFactor').value=i.mortarFactor || 0.30;
    document.getElementById('civilStoneWaste').value=i.wasteStone ?? 5;
    document.getElementById('civilStoneWasteMortar').value=i.wasteMortar ?? 10;
  }
  if (c.calculation_type === 'reinforced_wall') {
    document.getElementById('civilReinforcedWallCount').value=i.count || 1;
    document.getElementById('civilReinforcedWallOpeningArea').value=i.openingArea || 0;
    document.getElementById('civilWallVerticalDiameter').value=i.verticalDiameter || 12.7;
    document.getElementById('civilWallVerticalSpacing').value=i.verticalSpacing || 0.20;
    document.getElementById('civilWallHorizontalDiameter').value=i.horizontalDiameter || 9.5;
    document.getElementById('civilWallHorizontalSpacing').value=i.horizontalSpacing || 0.20;
    document.getElementById('civilWallReinforcementFaces').value=String(i.reinforcementFaces || 2);
    document.getElementById('civilWallExtraBarLength').value=i.extraBarLength ?? 0.60;
    document.getElementById('civilWallFormworkFaces').value=String(i.formworkFaces ?? 2);
    document.getElementById('civilWallWasteSteel').value=i.wasteSteel ?? 5;
    document.getElementById('civilWallWasteFormwork').value=i.wasteFormwork ?? 5;
  }
  if (c.calculation_type === 'reinforced_slab') {
    document.getElementById('civilReinforcedSlabCount').value=i.count || 1;
    document.getElementById('civilSlabDiameterX').value=i.diameterX || 9.5;
    document.getElementById('civilSlabSpacingX').value=i.spacingX || 0.20;
    document.getElementById('civilSlabDiameterY').value=i.diameterY || 9.5;
    document.getElementById('civilSlabSpacingY').value=i.spacingY || 0.20;
    document.getElementById('civilSlabReinforcementLayers').value=String(i.reinforcementLayers || 1);
    document.getElementById('civilSlabExtraBarLength').value=i.extraBarLength ?? 0.40;
    document.getElementById('civilSlabFormworkMode').value=i.formworkMode || 'bottom';
    document.getElementById('civilSlabWasteSteel').value=i.wasteSteel ?? 5;
    document.getElementById('civilSlabWasteFormwork').value=i.wasteFormwork ?? 5;
  }


  if (c.calculation_type === 'free_generator') {
    document.getElementById('civilFreeMode').value=i.mode || 'linear';
    civilFreeRows=(Array.isArray(i.rows) && i.rows.length ? i.rows : [{ description:'', operation:'add', count:1, length:0, width:0, height:0 }])
      .map(row=>({ id:crypto.randomUUID(), ...row }));
    renderCivilFreeRows();
  }
  if (c.calculation_type === 'crew_work') {
    document.getElementById('civilCrewQuantity').value=i.quantity || '';
    document.getElementById('civilCrewUnit').value=i.unit || 'm²';
    document.getElementById('civilCrewProductivity').value=i.productivityPerDay || '';
    document.getElementById('civilCrewDaysPerWeek').value=i.workDaysPerWeek || 6;
    document.getElementById('civilCrewContingency').value=i.contingencyPercent ?? 0;
    document.getElementById('civilCrewMethod').value=i.selectedMethod || 'crew';
    document.getElementById('civilCrewPieceRate').value=i.pieceworkUnitRate ?? 0;
    const roles=Array.isArray(i.roles)?i.roles:[];
    const role=(name)=>roles.find(row=>row.role===name) || {};
    document.getElementById('civilCrewOfficialCount').value=role('Oficial').count ?? 1;
    document.getElementById('civilCrewOfficialCost').value=role('Oficial').weeklyCost ?? 0;
    document.getElementById('civilCrewHelperCount').value=role('Ayudante').count ?? 1;
    document.getElementById('civilCrewHelperCost').value=role('Ayudante').weeklyCost ?? 0;
    document.getElementById('civilCrewForemanCount').value=role('Cabo').count ?? 0;
    document.getElementById('civilCrewForemanCost').value=role('Cabo').weeklyCost ?? 0;
    document.getElementById('civilCrewSupervisorCount').value=role('Supervisor').count ?? 0;
    document.getElementById('civilCrewSupervisorCost').value=role('Supervisor').weeklyCost ?? 0;
    document.getElementById('civilCrewSpecialistCount').value=role('Especialista').count ?? 0;
    document.getElementById('civilCrewSpecialistCost').value=role('Especialista').weeklyCost ?? 0;
  }
  if (c.calculation_type === 'column') {
    document.getElementById('civilColumnCount').value=i.count || 1;
    document.getElementById('civilLongitudinalBars').value=i.longitudinalBars || 4;
    document.getElementById('civilLongitudinalDiameter').value=i.longitudinalDiameter || 12.7;
    document.getElementById('civilExtraBarLength').value=i.extraBarLength ?? 0.60;
    document.getElementById('civilStirrupDiameter').value=i.stirrupDiameter || 6;
    document.getElementById('civilStirrupSpacing').value=i.stirrupSpacing || 0.20;
    document.getElementById('civilStirrupMultiplicity').value=String(i.stirrupMultiplicity || 1);
    document.getElementById('civilCover').value=i.cover || 0.025;
    document.getElementById('civilHookLength').value=i.hookLength ?? 0.10;
    document.getElementById('civilWasteSteel').value=i.wasteSteel ?? 5;
    document.getElementById('civilWasteFormwork').value=i.wasteFormwork ?? 5;
  }
  if (c.calculation_type === 'beam') {
    document.getElementById('civilBeamCount').value=i.count || 1;
    document.getElementById('civilBeamTopBars').value=i.topBars || 2;
    document.getElementById('civilBeamBottomBars').value=i.bottomBars || 2;
    document.getElementById('civilBeamLongitudinalDiameter').value=i.longitudinalDiameter || 12.7;
    document.getElementById('civilBeamExtraBarLength').value=i.extraBarLength ?? 0.60;
    document.getElementById('civilBeamStirrupDiameter').value=i.stirrupDiameter || 6;
    document.getElementById('civilBeamStirrupSpacing').value=i.stirrupSpacing || 0.20;
    document.getElementById('civilBeamStirrupMultiplicity').value=String(i.stirrupMultiplicity || 1);
    document.getElementById('civilBeamCover').value=i.cover || 0.025;
    document.getElementById('civilBeamHookLength').value=i.hookLength ?? 0.10;
    document.getElementById('civilBeamWasteSteel').value=i.wasteSteel ?? 5;
    document.getElementById('civilBeamWasteFormwork').value=i.wasteFormwork ?? 5;
  }
  if (c.calculation_type === 'footing') {
    document.getElementById('civilFootingCount').value=i.count || 1;
    document.getElementById('civilFootingBarsX').value=i.barsX || 11;
    document.getElementById('civilFootingBarsY').value=i.barsY || 11;
    document.getElementById('civilFootingDiameter').value=i.diameter || 12.7;
    document.getElementById('civilFootingCover').value=i.cover || 0.075;
    document.getElementById('civilDadoLength').value=i.dadoLength || 0;
    document.getElementById('civilDadoWidth').value=i.dadoWidth || 0;
    document.getElementById('civilDadoHeight').value=i.dadoHeight || 0;
    document.getElementById('civilDadoBars').value=i.dadoBars || 4;
    document.getElementById('civilDadoDiameter').value=i.dadoDiameter || 12.7;
    document.getElementById('civilDadoExtraBarLength').value=i.dadoExtraBarLength ?? 0.60;
    document.getElementById('civilDadoStirrupDiameter').value=i.stirrupDiameter || 9.5;
    document.getElementById('civilDadoStirrupSpacing').value=i.stirrupSpacing || 0.20;
    document.getElementById('civilDadoHookLength').value=i.hookLength ?? 0.10;
    document.getElementById('civilFootingWasteSteel').value=i.wasteSteel ?? 5;
    document.getElementById('civilFootingWasteFormwork').value=i.wasteFormwork ?? 5;
  }
  civilLastResult={type:c.calculation_type,input:i,result:c.result_payload};
  renderCivilResult(c.result_payload);
  document.getElementById('civilSaveBtn').disabled=true;
}

function removeCivilCalculation(id) {
  const c=civilCalculations.find(x=>x.id===id);
  if (!c || !confirm('¿Eliminar este cálculo del historial sincronizado?')) return;
  c.deleted=true; c.updated_at=nowISO(); c.updated_by=currentEmail();
  save(STORAGE.civilCalculations,civilCalculations);
  renderCivilHistory();
  window.RemProSync && window.RemProSync.queueSync();
}

function renderCivil() {
  renderCivilFreeRows();
  updateCivilProjectOptions();
  updateCivilDosageOptions();
  renderCivilHistory();
  if (civilLastResult) renderCivilResult(civilLastResult.result);
}

document.getElementById('civilType')?.addEventListener('change',()=>{
  updateCivilDosageOptions();
  civilLastResult=null;
  document.getElementById('civilSaveBtn').disabled=true;
  renderCivilResult(null);
});

document.getElementById('civilFreeMode')?.addEventListener('change',()=>{
  updateCivilFreeDimensions();
  civilLastResult=null;
  document.getElementById('civilSaveBtn').disabled=true;
  renderCivilResult(null);
});
document.getElementById('civilAddFreeRow')?.addEventListener('click',()=>{
  civilFreeRows=readCivilFreeRows();
  civilFreeRows.push({ id:crypto.randomUUID(), description:'', operation:'add', count:1, length:0, width:0, height:0 });
  renderCivilFreeRows();
});
document.getElementById('civilFreeRowsBody')?.addEventListener('click',e=>{
  const id=e.target.closest('[data-remove-free-row]')?.dataset.removeFreeRow;
  if (!id) return;
  civilFreeRows=readCivilFreeRows().filter(row=>row.id!==id);
  if (!civilFreeRows.length) civilFreeRows=[{ id:crypto.randomUUID(), description:'', operation:'add', count:1, length:0, width:0, height:0 }];
  renderCivilFreeRows();
  civilLastResult=null;
  document.getElementById('civilSaveBtn').disabled=true;
  renderCivilResult(null);
});
document.getElementById('civilMasonryUnit')?.addEventListener('change',()=>{
  applyCivilMasonryPreset();
  civilLastResult=null;
  document.getElementById('civilSaveBtn').disabled=true;
});
document.getElementById('civilCalculateBtn')?.addEventListener('click',calculateCivil);
document.getElementById('civilResult')?.addEventListener('click',e=>{
  if (e.target.closest('[data-open-civil-apu]')) showView('apu');
});
document.getElementById('civilSaveBtn')?.addEventListener('click',saveCivilCalculation);
document.getElementById('civilClearBtn')?.addEventListener('click',clearCivilCalculator);
document.getElementById('civilHistoryBody')?.addEventListener('click',e=>{
  const loadId=e.target.closest('[data-civil-load]')?.dataset.civilLoad;
  if (loadId) loadCivilCalculation(loadId);
  const removeId=e.target.closest('[data-civil-remove]')?.dataset.civilRemove;
  if (removeId) removeCivilCalculation(removeId);
});
['civilLength','civilWidth','civilThickness','civilDirectVolume','civilDosage','civilBagWeight','civilWasteCement','civilWasteSand','civilWasteThird','civilUnitLength','civilUnitHeight','civilUnitDepth','civilJointHorizontal','civilJointVertical','civilOpeningArea','civilPlasterFaces','civilPlasterThickness','civilWasteUnits','civilWasteMortar','civilColumnCount','civilLongitudinalBars','civilLongitudinalDiameter','civilExtraBarLength','civilStirrupDiameter','civilStirrupSpacing','civilStirrupMultiplicity','civilCover','civilHookLength','civilWasteSteel','civilWasteFormwork','civilBeamCount','civilBeamTopBars','civilBeamBottomBars','civilBeamLongitudinalDiameter','civilBeamExtraBarLength','civilBeamStirrupDiameter','civilBeamStirrupSpacing','civilBeamStirrupMultiplicity','civilBeamCover','civilBeamHookLength','civilBeamWasteSteel','civilBeamWasteFormwork','civilFootingCount','civilFootingBarsX','civilFootingBarsY','civilFootingDiameter','civilFootingCover','civilDadoLength','civilDadoWidth','civilDadoHeight','civilDadoBars','civilDadoDiameter','civilDadoExtraBarLength','civilDadoStirrupDiameter','civilDadoStirrupSpacing','civilDadoHookLength','civilFootingWasteSteel','civilFootingWasteFormwork','civilStoneOpeningArea','civilStoneFactor','civilStoneMortarFactor','civilStoneWaste','civilStoneWasteMortar','civilReinforcedWallCount','civilReinforcedWallOpeningArea','civilWallVerticalDiameter','civilWallVerticalSpacing','civilWallHorizontalDiameter','civilWallHorizontalSpacing','civilWallReinforcementFaces','civilWallExtraBarLength','civilWallFormworkFaces','civilWallWasteSteel','civilWallWasteFormwork','civilReinforcedSlabCount','civilSlabDiameterX','civilSlabSpacingX','civilSlabDiameterY','civilSlabSpacingY','civilSlabReinforcementLayers','civilSlabExtraBarLength','civilSlabFormworkMode','civilSlabWasteSteel','civilSlabWasteFormwork'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input',()=>{
    civilLastResult=null;
    document.getElementById('civilSaveBtn').disabled=true;
  });
});

function setupMaterialControls() {
  const system=document.getElementById('systemType');
  if (!system.querySelector('option[value="cementWall1"]')) {
    system.insertAdjacentHTML('beforeend',
      '<option value="cementWall1">Muro Permabase / Durock · 1 cara</option>'+
      '<option value="cementWall2">Muro Permabase / Durock · 2 caras</option>'+
      '<option value="cementCeiling">Plafón Permabase / Durock · canal listón @ 0.405 m</option>');
  }
  const panel=document.getElementById('panelType');
  if (![...panel.options].some(o=>o.textContent.startsWith('Durock'))) {
    panel.insertAdjacentHTML('beforeend','<option>Durock 1.22×2.44</option>');
  }
  if (!document.getElementById('matProfileWidth')) {
    const hint=panel.parentElement.nextElementSibling;
    const wrap=document.createElement('div');
    wrap.className='form-grid';
    wrap.innerHTML='<label>Ancho de estructura galvanizada<select id="matProfileWidth"><option value="4.10">4.10 cm · 1 5/8&quot;</option><option value="6.35" selected>6.35 cm · 2 1/2&quot;</option><option value="9.20">9.20 cm · 3 5/8&quot;</option><option value="15.24">15.24 cm · 6&quot;</option></select></label>'+
      '<label>Aislante termoacústico<select id="matInsulation"><option value="none">Sin aislante</option><option value="Colchoneta R-8">Colchoneta R-8</option><option value="Colchoneta R-11">Colchoneta R-11</option><option value="FOAMULAR 1/2 pulg">FOAMULAR Owens Corning · 1/2&quot;</option><option value="FOAMULAR 1 pulg">FOAMULAR Owens Corning · 1&quot;</option><option value="FOAMULAR 1 1/2 pulg">FOAMULAR Owens Corning · 1 1/2&quot;</option><option value="FOAMULAR 2 pulg">FOAMULAR Owens Corning · 2&quot;</option></select></label>';
    hint.parentNode.insertBefore(wrap,hint);
    const membrane=document.createElement('label');
    membrane.className='check-row';
    membrane.innerHTML='<input id="matMembrane" type="checkbox"> Incluir membrana hidrófuga tipo Tyvek en muro cementicio';
    hint.parentNode.insertBefore(membrane,hint);
    hint.textContent='Permabase/Durock: muros con estructura galvanizada cal. 20 @ 0.405 m (16 pulg) c/c; plafón cementicio con canal listón @ 0.405 m c/c. El aislamiento se cuantifica por área real.';
  }
  const syncPanelToSystem=()=>{
    const cement=['cementWall1','cementWall2','cementCeiling'].includes(system.value);
    if (cement && !/Permabase|Durock/.test(panel.value)) {
      const option=[...panel.options].find(o=>o.textContent.startsWith('Permabase'));
      if (option) panel.value=option.value;
    }
    const membrane=document.getElementById('matMembrane');
    if (membrane) membrane.disabled=!['cementWall1','cementWall2'].includes(system.value);
  };
  if (!system.dataset.materialSyncBound) {
    system.addEventListener('change',()=>{syncPanelToSystem();calcMaterials(true);});
    system.dataset.materialSyncBound='1';
  }
  syncPanelToSystem();
}
setupMaterialControls();

function profileCatalogHint(profileWidth, kind) {
  const sizes = {
    '4.10': '1 5/8',
    '6.35': '2 1/2',
    '9.20': '3 5/8',
    '15.24': '6 pulg'
  };
  const size=sizes[String(profileWidth)] || '';
  if (!size) return [kind];
  return [`${kind} ${size} calibre 20`, `${kind} ${size}`];
}

function pricingMaterialFromRow(row, context={}) {
  const [description, quantity, unit, note] = row;
  const n = window.RemProCostEngine?.normalize(description) || String(description).toLowerCase();
  let hints=[];
  let costable=true;
  let reason='';

  if (n === 'paneles') {
    const panel=String(context.panel || '');
    if (/permabase/i.test(panel)) hints=['hoja permabase','permabase'];
    else if (/guard rey/i.test(panel)) hints=['hoja yeso guard rey','guard rey'];
    else if (/durock/i.test(panel)) hints=['durock'];
    else if (/adpanel/i.test(panel)) hints=['adpanel'];
    else hints=['hoja yeso estandar','tablaroca estandar'];
  } else if (n.includes('postes') || n.includes('montenes')) {
    hints=profileCatalogHint(context.profileWidth,'poste');
  } else if (n.includes('canal superior')) {
    hints=profileCatalogHint(context.profileWidth,'canal');
  } else if (n === 'canal liston') {
    hints=['canal liston'];
  } else if (n.includes('canaleta de carga')) {
    hints=['canal de carga'];
  } else if (n.includes('angulo perimetral')) {
    hints=['angulo 1 1/2 calibre 25','angulo perimetral'];
  } else if (n === 'mini pija') {
    hints=['tornillo para metal 8 x 1/2'];
  } else if (n.includes('tornillos para panel')) {
    hints=(context.cementWall || context.cementCeiling)
      ? ['tornillo para tablacemento 8 x 1 1/4','tornillo tablacemento']
      : ['tornillo para metal 6 x 1 1/4','tornillo panel yeso'];
  } else if (n.includes('perfacinta')) {
    hints=['perfacinta'];
  } else if (n.includes('cinta') || n.includes('malla para juntas')) {
    hints=['cinta para juntas cementicias','malla para juntas cementicias'];
  } else if (n.includes('base coat') || n.includes('tratamiento cementicio')) {
    hints=['hi tech bond','base coat'];
  } else if (n.includes('pasta ready mix')) {
    hints=['unimax ready mix','ready mix'];
  } else if (n.includes('membrana hidrofuga')) {
    hints=['membrana impermeable elite','membrana hidrofuga'];
  } else if (n.includes('aislante termoacustico')) {
    hints=[String(description).split('·').pop().trim()];
  } else if (n.includes('alambre galvanizado')) {
    hints=['alambre galvanizado num 12','alambre galvanizado'];
  } else if (n.includes('anclas para colgantes')) {
    hints=['clavo ancla 1 1/4','clavo ancla'];
  } else if (n.includes('fulminantes')) {
    hints=['carga industrial calibre 27 amarilla','carga industrial calibre 27'];
  } else if (n.includes('clavos para angulo')) {
    hints=['clavo para pistola con rondana 1 1/4','clavo para pistola con rondana'];
  } else if (n === 'colgantes' || n.includes('amarres canal liston')) {
    costable=false;
    reason='Renglón auxiliar de cuantificación; su material se costea en los renglones de alambre/fijaciones.';
  } else {
    hints=[description];
  }

  return { description, quantity:Number(quantity), unit, note, hints, costable, reason };
}

function pricingCivilMaterial(material) {
  const description=String(material?.description || '');
  const rawUnit=String(material?.unit || '');
  const n=window.RemProCostEngine?.normalize(description) || description.toLowerCase();
  let hints=[description];
  let quantity=Number(material?.quantity || 0);
  let unit=rawUnit;
  let note='';

  // El calculador civil expresa cemento/cal por saco; el costeo se normaliza
  // a kg para que pueda usar de forma segura sacos de 25/50 kg u otra
  // presentación cuyo peso esté declarado en el catálogo.
  const sackKg=rawUnit.match(/saco\s+(\d+(?:[.,]\d+)?)\s*kg/i);
  if (sackKg) {
    const kg=Number(sackKg[1].replace(',','.'));
    if (Number.isFinite(kg) && kg > 0) {
      quantity*=kg;
      unit='kg';
      note=`Cuantificación original: ${material.quantity} ${rawUnit}`;
    }
  }

  if (n.includes('cemento')) hints=['cemento gris portland','cemento gris','cemento'];
  else if (n.includes('arena')) hints=['arena para construccion','arena'];
  else if (n.includes('grava')) hints=['grava'];
  else if (n === 'agua') hints=['agua'];
  else if (n.includes('calhidra')) hints=['calhidra','cal hidratada'];
  else if (n.includes('piedra')) hints=['piedra para mamposteria','piedra'];
  else if (n.includes('acero')) {
    const mm=n.match(/(\d+(?:[.,]\d+)?)\s*mm/);
    const map={'6':'1/4','9.5':'3/8','12.7':'1/2','15.9':'5/8','19.1':'3/4'};
    const diameter=mm ? mm[1].replace(',','.') : '';
    hints=map[diameter] ? [`varilla ${map[diameter]}`,`acero ${diameter} mm`] : [description];
  } else if (n.includes('cimbra')) hints=['triplay cimbra','cimbra'];

  return { description, quantity, unit, note, hints, costable:true };
}

function civilApuMeta(result, input={}) {
  const labels={
    concrete:'Elaboración de concreto en obra',
    mortar:'Elaboración de mortero en obra',
    masonry_wall:'Muro de mampostería',
    stone_masonry:'Mampostería de piedra',
    column:'Columna de concreto armado',
    beam:'Trabe de concreto armado',
    footing:'Zapata de concreto armado',
    reinforced_wall:'Muro de concreto reforzado',
    reinforced_slab:'Losa de concreto reforzado'
  };
  let saleQty=1, saleUnit='u';
  if (result.type==='concrete' || result.type==='mortar' || result.type==='stone_masonry') {
    saleQty=result.volumeM3 || 1; saleUnit='m³';
  } else if (result.type==='masonry_wall') {
    saleQty=result.netAreaM2 || 1; saleUnit='m²';
  } else if (result.type==='column' || result.type==='footing') {
    saleQty=result.count || 1; saleUnit='pza';
  } else if (result.type==='beam') {
    saleQty=(Number(input.length)||0)*(Number(result.count)||1) || 1; saleUnit='ml';
  } else if (result.type==='reinforced_wall') {
    saleQty=result.netAreaM2 || 1; saleUnit='m²';
  } else if (result.type==='reinforced_slab') {
    saleQty=result.areaM2 || 1; saleUnit='m²';
  }
  const label=labels[result.type] || 'Concepto de obra civil';
  return {
    sourceKey:`civil:${result.type}:${val('civilLabel') || label}`,
    description:`${label}${val('civilLabel') ? ' · '+val('civilLabel') : ''}, incluyendo materiales cuantificados conforme a los parámetros capturados.`,
    saleQty,
    saleUnit,
    requiresLabor:true
  };
}

function renderCivilCosting(costing, nf) {
  const rows=costing.rows.map(r=>{
    const pu=r.status==='priced'
      ? `<strong>${money(r.unitCost)}</strong><small>${esc(r.price?.supplier || '')} · ${esc(r.price?.date || '')}</small>`
      : `<strong>⚠ Pendiente</strong><small>${esc(r.reason || 'Sin precio')}</small>`;
    return `<tr><td><strong>${esc(r.description)}</strong><small>${esc(r.note || '')}</small></td><td>${esc(r.unit)}</td><td>${nf.format(r.quantity)}</td><td>${pu}</td><td>${r.status==='priced' ? money(r.amount) : '—'}</td></tr>`;
  }).join('');
  return `
    <table class="civil-result-table">
      <thead><tr><th>Material</th><th>Unidad</th><th>Cantidad</th><th>P.U.</th><th>Importe</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="civil-result-summary">
      <div><span>Costo conocido de materiales</span><strong>${money(costing.subtotal)}</strong></div>
      <div><span>Estado</span><strong>${costing.complete ? 'Costeo completo' : 'Costeo incompleto'}</strong></div>
    </div>
    <p class="civil-source-note">${costing.pendingCount ? '⚠ '+costing.pendingCount+' insumo(s) requieren precio o conversión.' : '✓ Materiales costados con el catálogo vigente.'}</p>
    <button type="button" class="secondary" data-open-civil-apu>Ver APU automático</button>`;
}

function costCalculatedMaterials(materials, prices=activePrices()) {
  if (!window.RemProCostEngine) {
    return {
      rows:materials.map(m=>({...m,status:'missing-price',reason:'Motor de costeo no disponible.',price:null,unitCost:null,amount:null})),
      subtotal:0, pricedCount:0, pendingCount:materials.length, auxiliaryCount:0, complete:false
    };
  }
  return window.RemProCostEngine.costMaterials(materials, prices);
}

function apuAutoPendingRows() {
  return apuRows.filter(r => r.pricingStatus && !['priced','manual'].includes(r.pricingStatus));
}

function applyAutomaticApu(costing, meta) {
  const previousKey=apuRows.find(r=>r.autoSourceKey)?.autoSourceKey || null;
  const preserveSupport=previousKey===meta.sourceKey
    ? apuRows.filter(r => r.type !== 'Material' && (!r.autoGenerated || r.pricingStatus === 'manual'))
    : [];

  const materialRows=costing.rows
    .filter(r=>r.status !== 'auxiliary')
    .map(r=>({
      type:'Material',
      desc:r.description,
      sourcePriceId:r.price?.id || '',
      qty:Number(r.quantity || 0),
      unit:r.unit || '',
      pu:r.status === 'priced' ? Number(r.unitCost.toFixed(4)) : 0,
      autoGenerated:true,
      autoSourceKey:meta.sourceKey,
      pricingStatus:r.status,
      pricingReason:r.status === 'priced'
        ? `${r.price?.supplier || 'Proveedor'} · ${r.price?.date || 'sin fecha'} · ${r.price?.unit || ''}`
        : r.reason || 'Precio pendiente'
    }));

  let supportRows=preserveSupport.length
    ? preserveSupport
    : (Array.isArray(meta.supportRows) ? meta.supportRows.map(r=>({...r,autoGenerated:true,autoSourceKey:meta.sourceKey})) : []);
  if (!supportRows.length && meta.requiresLabor !== false) {
    supportRows=[{
      type:'Mano de obra',
      desc:'Mano de obra · pendiente de automatizar para este sistema',
      sourcePriceId:'',
      qty:1,
      unit:'lote',
      pu:0,
      autoGenerated:true,
      autoSourceKey:meta.sourceKey,
      autoPlaceholder:true,
      pricingStatus:'pending-labor',
      pricingReason:'El costo de materiales ya está integrado; falta la regla automática de mano de obra de este sistema.'
    }];
  }

  apuRows=[...materialRows,...supportRows];
  if (document.getElementById('apuConceptDescription')) document.getElementById('apuConceptDescription').value=meta.description || '';
  if (document.getElementById('apuSaleQty')) document.getElementById('apuSaleQty').value=Number(meta.saleQty || 1).toFixed(3).replace(/\.000$/,'');
  if (document.getElementById('apuSaleUnit')) document.getElementById('apuSaleUnit').value=meta.saleUnit || 'u';
  renderApu();
  saveApuInputs(false);
}

function renderCostedMaterialList(costing, area) {
  const out=document.getElementById('materialsResult');
  const nf=new Intl.NumberFormat('es-MX',{maximumFractionDigits:3});
  out.className='';
  const rows=costing.rows.map(r=>{
    const status=r.status === 'priced'
      ? `<strong>${money(r.unitCost)}</strong><small>${esc(r.price?.supplier || '')} · ${esc(r.price?.date || '')}</small>`
      : r.status === 'auxiliary'
        ? '<strong>Auxiliar</strong><small>Sin compra independiente</small>'
        : `<strong>⚠ Pendiente</strong><small>${esc(r.reason || 'Sin precio')}</small>`;
    const amount=r.status === 'priced' ? money(r.amount) : '—';
    return `<tr><td><strong>${esc(r.description)}</strong><small>${esc(r.note || '')}</small></td><td>${nf.format(r.quantity)}</td><td>${esc(r.unit)}</td><td>${status}</td><td>${amount}</td></tr>`;
  }).join('');
  const pendingNote=costing.pendingCount
    ? `⚠ ${costing.pendingCount} insumo(s) requieren precio o conversión antes de cerrar el APU.`
    : '✓ Todos los materiales comprables tienen precio y conversión trazables.';
  out.innerHTML=`
    <table class="civil-result-table">
      <thead><tr><th>Material</th><th>Cantidad</th><th>Unidad</th><th>P.U. material</th><th>Importe</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="civil-result-summary">
      <div><span>Costo conocido de materiales</span><strong>${money(costing.subtotal)}</strong></div>
      <div><span>Estado</span><strong>${costing.complete ? 'Costeo completo' : 'Costeo incompleto'}</strong></div>
    </div>
    <p class="civil-source-note">${pendingNote} Los P.U. de materiales usan el precio vigente con IVA del catálogo RemPro y fraccionan la presentación comercial cuando la equivalencia es verificable.</p>
    <button type="button" class="secondary" id="openAutoApuBtn">Ver APU automático</button>`;
  document.getElementById('areaBadge').textContent=`${area.toFixed(2)} m²`;
}

function automaticMaterialSupportRows(type, panel, area) {
  // Tarifas base existentes en la calculadora histórica RemPro.
  // Sólo se aplican cuando el sistema actual tiene correspondencia directa.
  const rates={
    wall1:145,
    wall2:210,
    cementWall1:180,
    ceiling:160,
    cementCeiling:195
  };
  if (/ADPanel/i.test(String(panel || ''))) return [];
  const rate=rates[type];
  if (!(rate > 0) || !(area > 0)) return [];
  return [
    {
      type:'Mano de obra',
      desc:'Instalación y acabado · tarifa base RemPro',
      sourcePriceId:'',
      qty:area,
      unit:'m²',
      pu:rate,
      pricingStatus:'priced',
      pricingReason:'Tarifa base heredada de la calculadora RemPro; editable en el APU.'
    },
    {
      type:'Herramienta',
      desc:'Herramienta menor · 3% sobre mano de obra',
      sourcePriceId:'',
      qty:area,
      unit:'m²',
      pu:Number((rate*.03).toFixed(4)),
      pricingStatus:'priced',
      pricingReason:'Regla histórica RemPro: herramienta menor = 3% de la mano de obra.'
    }
  ];
}

function materialApuDescription(context) {
  const system=document.getElementById('systemType')?.selectedOptions?.[0]?.textContent || 'Sistema ligero';
  const extras=[];
  if (context.insulation && context.insulation !== 'none') extras.push(context.insulation);
  if (context.membrane) extras.push('membrana hidrófuga');
  return `Suministro y colocación de ${system.toLowerCase()} con ${context.panel}, estructura galvanizada, tratamiento de juntas${extras.length ? ', '+extras.join(', ') : ''}, materiales, mano de obra, herramienta y lo necesario para su correcta ejecución.`;
}

function calcMaterials(autoApu=true) {
  const type=val('systemType'), L=num(val('matLength')), H=num(val('matHeight')), w=num(val('matWaste'))/100,
    layers=num(val('matLayers')), area=L*H, panelArea=1.22*2.44, f=1+w;
  if (![L,H,layers].every(n=>Number.isFinite(n)&&n>0)||!Number.isInteger(layers)||!Number.isFinite(w)||w<0||w>1) {
    alert('Captura medidas positivas, capas enteras y desperdicio entre 0 y 100%.'); return;
  }
  const cementWall=type==='cementWall1'||type==='cementWall2';
  const ceiling=type==='ceiling'||type==='cementCeiling';
  const cementCeiling=type==='cementCeiling';
  const faces=(type==='wall2'||type==='cementWall2')?2:1;
  const profileWidth=val('matProfileWidth')||'6.35';
  const insulation=val('matInsulation')||'none';
  const membrane=document.getElementById('matMembrane')?.checked;
  const panel=val('panelType');
  let items=[];

  if (!ceiling) {
    const coveredArea=area*faces*layers;
    const boards=Math.ceil(coveredArea/panelArea*f);
    const spacing=cementWall?0.405:num(rules.studSpacing||.61);
    const studLength=num(rules.studLength||3.05);
    const studPositions=Math.ceil(L/spacing)+1;
    const studs=studPositions*Math.ceil(H/studLength);
    const trackLength=num(rules.trackLength||3.05);
    const track=Math.ceil((L*2*1.05)/trackLength);
    const tapeMl=coveredArea*1.35*f;
    items=[
      ['Paneles',boards,'pzas',panel],
      ['Postes / montenes',studs,`pzas de ${studLength.toFixed(2)} m`,`${cementWall?'Cal. 20 · ':''}ancho ${profileWidth} cm · @ ${spacing.toFixed(3)} m c/c`],
      ['Canal superior + inferior',track,`pzas de ${trackLength.toFixed(2)} m`,`${cementWall?'Cal. 20 · ':''}ancho ${profileWidth} cm`],
      ['Mini pija',Math.ceil(area*num(rules.mini||8)*f),'pzas',`${num(rules.mini||8)}/m²`],
      ['Tornillos para panel',Math.ceil(boards*num(rules.screws||50)),'pzas',`${num(rules.screws||50)} por panel`],
      [cementWall?'Cinta / malla para juntas cementicias':'Perfacinta',Number(tapeMl.toFixed(2)),'ml','1.35 ml/m² de superficie de panel'],
      [cementWall?'Base Coat / tratamiento cementicio':'Pasta Ready Mix',Number((coveredArea*(cementWall?3.33:1.0)*f).toFixed(2)),'kg aprox.',cementWall?'3.33 kg/m²; validar ficha del sistema':'Tratamiento de juntas 1.00 kg/m²']
    ];
    if (cementWall&&membrane) items.push(['Membrana hidrófuga tipo Tyvek',Number((area*f).toFixed(2)),'m²','Una capa sobre la cara exterior del bastidor']);
    if (insulation!=='none') items.push([`Aislante termoacústico · ${insulation}`,Number((area*f).toFixed(2)),'m²','Área de elevación + desperdicio']);
  } else {
    const coveredArea=area*layers;
    const boards=Math.ceil(coveredArea/panelArea*f);
    const listonSpacing=cementCeiling?0.405:num(rules.liston||.61);
    const canaletaSpacing=num(rules.canaleta||.90);
    const listonLines=Math.ceil(H/listonSpacing)+1;
    const canaletaLines=Math.ceil(L/canaletaSpacing)+1;
    const listonMl=listonLines*L, canaletaMl=canaletaLines*H;
    const perimeter=2*(L+H);
    const hangers=canaletaLines*(Math.ceil(H/.90)+1);
    const ties=listonLines*canaletaLines;
    const angleFixings=Math.ceil((perimeter/.60)*f);
    items=[
      ['Paneles',boards,'pzas',panel],
      ['Canal listón',Math.ceil(listonMl/3.05*f),'pzas de 3.05 m',`${cementCeiling?'Cal. 20 · ':''}@ ${listonSpacing.toFixed(3)} m c/c`],
      ['Canaleta de carga',Math.ceil(canaletaMl/3.05*f),'pzas de 3.05 m',`@ ${canaletaSpacing.toFixed(2)} m c/c`],
      ['Ángulo perimetral',Math.ceil(perimeter/num(rules.angle||3.05)*f),'pzas',`Largo comercial ${num(rules.angle||3.05).toFixed(2)} m`],
      ['Mini pija',Math.ceil(area*num(rules.mini||8)*f),'pzas',`${num(rules.mini||8)}/m²`],
      ['Tornillos para panel',Math.ceil(boards*num(rules.screws||50)),'pzas',`${num(rules.screws||50)} por panel`],
      [cementCeiling?'Cinta / malla para juntas cementicias':'Perfacinta',Number((coveredArea*1.35*f).toFixed(2)),'ml','1.35 ml/m² de superficie de panel'],
      [cementCeiling?'Base Coat / tratamiento cementicio':'Pasta Ready Mix',Number((coveredArea*(cementCeiling?3.33:1.0)*f).toFixed(2)),'kg aprox.',cementCeiling?'3.33 kg/m²; validar ficha del sistema':'Tratamiento de juntas 1.00 kg/m²'],
      ['Colgantes',hangers,'pzas','Puntos sobre canaleta @ 0.90 m'],
      ['Alambre galvanizado para colgantes',Number((hangers*.70).toFixed(2)),'ml','0.70 m por colgante'],
      ['Anclas para colgantes',hangers,'pzas','1 por colgante'],
      ['Fulminantes para anclas de colgantes',hangers,'pzas','1 por ancla'],
      ['Amarres canal listón–canaleta',ties,'pzas','1 por cruce'],
      ['Alambre galvanizado para amarres',Number((ties*num(rules.wire||.70)).toFixed(2)),'ml',`${num(rules.wire||.70).toFixed(2)} m por amarre`],
      ['Clavos para ángulo perimetral',angleFixings,'pzas','Fijación @ 0.60 m + desperdicio'],
      ['Fulminantes para clavos de ángulo',angleFixings,'pzas','1 por clavo']
    ];
    if (insulation!=='none') items.push([`Aislante termoacústico · ${insulation}`,Number((area*f).toFixed(2)),'m²','Área de plafón + desperdicio']);
  }
  const pricingContext={cementWall,cementCeiling,panel,profileWidth,insulation,membrane};
  const pricingRows=items.map(row=>pricingMaterialFromRow(row,pricingContext));
  const costing=costCalculatedMaterials(pricingRows);
  renderCostedMaterialList(costing,area);
  if (autoApu) {
    applyAutomaticApu(costing,{
      sourceKey:`materials:${type}:${panel}:${profileWidth}:${insulation}:${membrane?'1':'0'}:${layers}`,
      description:materialApuDescription(pricingContext),
      saleQty:area,
      saleUnit:'m²',
      requiresLabor:true,
      supportRows:automaticMaterialSupportRows(type,panel,area)
    });
  }
}
document.getElementById('calcMaterialsBtn').onclick=()=>calcMaterials(true);
document.getElementById('materialsResult').addEventListener('click',e=>{
  if (!e.target.closest('#openAutoApuBtn')) return;
  showView('apu');
});

let apuRows = load(STORAGE.apu, null)?.rows || [{ type: 'Material', desc: '', sourcePriceId: '', qty: 1, unit: 'pza', pu: 0 }, { type: 'Mano de obra', desc: '', sourcePriceId: '', qty: 1, unit: 'jor', pu: 0 }];
function latestPriceOptions(selected='') {
  const sorted = [...activePrices()].sort((a,b) => (Date.parse(b.date || b.updated_at) || 0) - (Date.parse(a.date || a.updated_at) || 0));
  return ['<option value="">Manual</option>', ...sorted.map(p => `<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.item)} · ${esc(p.supplier)} · ${money(num(p.net)*(1+num(p.vat)/100))}</option>`)].join('');
}
function renderApu() {
  const body = document.getElementById('apuBody');
  body.innerHTML = apuRows.map((r, i) => {
    const pending=r.pricingStatus && !['priced','manual'].includes(r.pricingStatus);
    const trace=r.pricingReason
      ? `<small class="${pending ? 'apu-line-pending' : 'apu-line-trace'}">${esc(r.pricingReason)}</small>`
      : '';
    return `<tr class="${pending ? 'apu-row-pending' : ''}"><td><select data-apu-field="type" data-apu-i="${i}"><option ${r.type === 'Material' ? 'selected' : ''}>Material</option><option ${r.type === 'Mano de obra' ? 'selected' : ''}>Mano de obra</option><option ${r.type === 'Herramienta' ? 'selected' : ''}>Herramienta</option><option ${r.type === 'Subcontrato' ? 'selected' : ''}>Subcontrato</option></select></td><td><input value="${esc(r.desc)}" data-apu-field="desc" data-apu-i="${i}">${trace}</td><td><select class="apu-price-source" data-apu-field="sourcePriceId" data-apu-i="${i}">${latestPriceOptions(r.sourcePriceId || '')}</select></td><td><input type="number" min="0" step="0.01" value="${r.qty}" data-apu-field="qty" data-apu-i="${i}"></td><td><input value="${esc(r.unit)}" data-apu-field="unit" data-apu-i="${i}"></td><td><input type="number" min="0" step="0.0001" value="${r.pu}" data-apu-field="pu" data-apu-i="${i}"></td><td data-apu-total>${money(r.qty * r.pu)}</td><td><button class="mini-btn" data-apu-remove="${i}">✕</button></td></tr>`;
  }).join('');
  calcApu(false);
}
document.getElementById('apuBody').addEventListener('input', e => {
  const i = e.target.dataset.apuI, field = e.target.dataset.apuField;
  if (i === undefined || !field || field === 'sourcePriceId') return;
  apuRows[i][field] = (field === 'qty' || field === 'pu') ? num(e.target.value) : e.target.value;
  if (field === 'pu' && apuRows[i].autoGenerated) {
    apuRows[i].sourcePriceId='';
    apuRows[i].pricingStatus='manual';
    apuRows[i].pricingReason='P.U. capturado manualmente.';
  }
  e.target.closest('tr').querySelector('[data-apu-total]').textContent = money(apuRows[i].qty * apuRows[i].pu);
  calcApu(true);
});
document.getElementById('apuBody').addEventListener('change', e => {
  const i = e.target.dataset.apuI, field = e.target.dataset.apuField;
  if (i === undefined || field !== 'sourcePriceId') return;
  const price = activePrices().find(p => p.id === e.target.value);
  apuRows[i].sourcePriceId = e.target.value;
  if (price && apuRows[i].autoGenerated && window.RemProCostEngine) {
    const evaluated=window.RemProCostEngine.costWithPrice({
      description:apuRows[i].desc,
      quantity:apuRows[i].qty,
      unit:apuRows[i].unit
    },price);
    if (evaluated.status === 'priced') {
      apuRows[i].pu=Number(evaluated.unitCost.toFixed(4));
      apuRows[i].pricingStatus='priced';
      apuRows[i].pricingReason=`${price.supplier || 'Proveedor'} · ${price.date || 'sin fecha'} · ${price.unit || ''}`;
    } else {
      apuRows[i].pu=0;
      apuRows[i].pricingStatus=evaluated.status;
      apuRows[i].pricingReason=evaluated.reason || 'Conversión pendiente';
    }
  } else if (price) {
    apuRows[i].desc = price.item;
    apuRows[i].unit = price.unit || apuRows[i].unit;
    apuRows[i].pu = Number((num(price.net) * (1 + num(price.vat) / 100)).toFixed(2));
    apuRows[i].pricingStatus='manual';
    apuRows[i].pricingReason=`${price.supplier || 'Proveedor'} · ${price.date || 'sin fecha'}`;
  } else if (apuRows[i].autoGenerated) {
    apuRows[i].pu=0;
    apuRows[i].pricingStatus='missing-price';
    apuRows[i].pricingReason='Selecciona un precio compatible o captura el P.U. manualmente.';
  }
  const current=load(STORAGE.apu,{});
  save(STORAGE.apu,{...current,...currentApuPayload(),updated_at:nowISO(),updated_by:currentEmail()});
  window.RemProSync && window.RemProSync.queueSync();
  renderApu();
});
document.getElementById('apuBody').addEventListener('click', e => {
  const i = e.target.closest('[data-apu-remove]')?.dataset.apuRemove;
  if (i !== undefined) {
    apuRows.splice(i, 1);
    const current=load(STORAGE.apu,{});
    save(STORAGE.apu,{...current,...currentApuPayload(),updated_at:nowISO(),updated_by:currentEmail()});
    window.RemProSync && window.RemProSync.queueSync();
    renderApu();
  }
});
document.getElementById('addApuRow').onclick = () => {
  apuRows.push({ type: 'Material', desc: '', sourcePriceId: '', qty: 1, unit: 'pza', pu: 0, pricingStatus:'manual' });
  const current=load(STORAGE.apu,{});
  save(STORAGE.apu,{...current,...currentApuPayload(),updated_at:nowISO(),updated_by:currentEmail()});
  window.RemProSync && window.RemProSync.queueSync();
  renderApu();
};
['apuIndirect', 'apuRisk', 'apuProfit', 'apuVat', 'apuSaleQty', 'apuSaleUnit', 'apuConceptDescription'].forEach(id => document.getElementById(id).addEventListener('input', () => calcApu(true)));
function currentApuPayload() {
  return {
    rows: apuRows,
    fields: Object.fromEntries(['apuIndirect','apuRisk','apuProfit','apuVat','apuSaleQty','apuSaleUnit','apuConceptDescription'].map(id => [id,val(id)]))
  };
}
function saveApuInputs(showFeedback=false) {
  const invalidRows = apuRows.some(r => !r.desc?.trim() || !r.unit?.trim() || !Number.isFinite(r.qty) || !Number.isFinite(r.pu) || r.qty < 0 || r.pu < 0);
  if (invalidRows) {
    if (showFeedback) {
      const status=document.getElementById('apuSaveStatus');
      if(status) status.textContent='Revisa descripción, unidad, cantidad y P.U. de cada insumo antes de guardar.';
    }
    return false;
  }
  const payload={...currentApuPayload(),updated_at:nowISO(),updated_by:currentEmail()};
  save(STORAGE.apu,payload);
  window.RemProSync && window.RemProSync.queueSync(0);
  if (showFeedback) {
    const status=document.getElementById('apuSaveStatus');
    const cloud=Boolean(window.RemProSupabase?.session);
    const pending=apuAutoPendingRows();
    if(status) status.textContent=pending.length
      ? `⚠ Borrador guardado con ${pending.length} renglón(es) pendientes; todavía no es un precio final.`
      : cloud
        ? `Insumos guardados · sincronizando con la nube · ${new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`
        : `Insumos guardados en este dispositivo · inicia sesión para sincronizarlos · ${new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`;
  }
  return true;
}
document.getElementById('saveApuInputsBtn').onclick = () => saveApuInputs(true);

function calcApu(persist=false) {
  if (apuRows.some(r => !Number.isFinite(r.qty) || !Number.isFinite(r.pu) || r.qty < 0 || r.pu < 0) || ['apuIndirect','apuRisk','apuProfit','apuVat','apuSaleQty'].some(id => !Number.isFinite(Number(val(id))) || Number(val(id)) < 0) || Number(val('apuSaleQty')) <= 0) {
    ['apuDirect','apuCommercial','apuUnit','apuTotal'].forEach(id => document.getElementById(id).textContent='Revisa cantidades'); return;
  }
  if (persist) {
    const current=load(STORAGE.apu,{});
    save(STORAGE.apu,{...current,...currentApuPayload(),updated_at:nowISO(),updated_by:currentEmail()});
    window.RemProSync && window.RemProSync.queueSync();
  } else {
    const current=load(STORAGE.apu,{});
    save(STORAGE.apu,{...current,...currentApuPayload()});
  }
  const direct = apuRows.reduce((a, r) => a + r.qty * r.pu, 0);
  const pending=apuAutoPendingRows();
  document.getElementById('apuDirect').textContent = pending.length ? `${money(direct)} conocido` : money(direct);
  const status=document.getElementById('apuSaveStatus');
  if (pending.length) {
    document.getElementById('apuCommercial').textContent='APU incompleto';
    document.getElementById('apuUnit').textContent='APU incompleto';
    document.getElementById('apuTotal').textContent='APU incompleto';
    if (status) status.textContent=`⚠ Faltan ${pending.length} renglón(es) por resolver. El costo directo mostrado es únicamente el costo conocido.`;
    return;
  }
  const ind = direct * num(val('apuIndirect')) / 100, risk = direct * num(val('apuRisk')) / 100,
    base = direct + ind + risk, profit = base * num(val('apuProfit')) / 100, commercial = base + profit,
    qty = Math.max(.0001, num(val('apuSaleQty'))), vat = commercial * num(val('apuVat')) / 100;
  document.getElementById('apuCommercial').textContent = money(commercial);
  document.getElementById('apuUnit').textContent = `${money(commercial / qty)} / ${val('apuSaleUnit') || 'u'}`;
  document.getElementById('apuTotal').textContent = money(commercial + vat);
  if (status && apuRows.some(r=>r.autoGenerated)) status.textContent='✓ APU automático completo con los datos disponibles.';
}

function renderPrices() {
  const list = activePrices();
  const b = document.getElementById('pricesBody'), e = document.getElementById('pricesEmpty');
  b.innerHTML = list.map(p => {
    const gross = num(p.net) * (1 + num(p.vat) / 100);
    return `<tr><td>${esc(p.item)}</td><td>${esc(p.supplier)}</td><td>${esc(p.unit)}</td><td>${money(gross)}</td><td>${esc(p.date)}</td><td><button class="mini-btn" data-edit-price="${esc(p.id)}">Editar</button> <button class="mini-btn" data-remove-price="${esc(p.id)}">Eliminar</button></td></tr>`;
  }).join('');
  e.style.display = list.length ? 'none' : 'block';
  renderDashboard();
}
function sourceLabel(type) {
  return ({manual:'Manual',photo:'Fotografía',document:'Documento'})[type] || 'Manual';
}
function renderPriceHistory() {
  const list = [...activePriceHistory()].sort((a,b) => (Date.parse(b.date || b.created_at || b.updated_at) || 0) - (Date.parse(a.date || a.created_at || a.updated_at) || 0));
  const body = document.getElementById('priceHistoryBody'), empty = document.getElementById('priceHistoryEmpty');
  document.getElementById('priceHistoryCount').textContent = `${list.length} registro${list.length === 1 ? '' : 's'}`;
  body.innerHTML = list.map(h => {
    const gross = num(h.net) * (1 + num(h.vat) / 100);
    const evidence = h.evidence_path ? `<button class="mini-btn" data-price-evidence="${esc(h.evidence_path)}">${esc(h.evidence_name || 'Ver archivo')}</button>` : '—';
    return `<tr><td>${esc(h.date || '')}</td><td>${esc(h.item)}</td><td>${esc(h.supplier || '')}</td><td>${money(gross)}</td><td><span class="source-pill">${esc(sourceLabel(h.source_type))}</span></td><td>${evidence}</td></tr>`;
  }).join('');
  empty.style.display = list.length ? 'none' : 'block';
}
document.getElementById('priceHistoryBody').addEventListener('click', async e => {
  const path = e.target.closest('[data-price-evidence]')?.dataset.priceEvidence;
  if (!path) return;
  const client = DATA.remote.getClient();
  if (!client || !window.RemProSupabase?.session) { alert('Inicia sesión para abrir la evidencia privada.'); return; }
  const { data, error } = await client.storage.from('rempro-price-evidence').createSignedUrl(path, 120);
  if (error || !data?.signedUrl) { alert('No se pudo abrir la evidencia.'); return; }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
});
async function uploadPriceEvidence(file, historyId) {
  if (!file) return { path: null, name: null };
  const client = DATA.remote.getClient();
  if (!client || !window.RemProSupabase?.session) throw new Error('Debes iniciar sesión para adjuntar fotografías o documentos.');
  const safeName = String(file.name || 'evidencia').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const path = `${historyId}/${Date.now()}_${safeName}`;
  const { error } = await client.storage.from('rempro-price-evidence').upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return { path, name: file.name || safeName };
}

async function savePriceHistoryToCloud(record) {
  const client = DATA.remote.getClient();
  if (!client || !window.RemProSupabase?.session) return;
  const payload = {
    id: record.id, price_id: record.price_id || null, item: record.item,
    supplier: record.supplier || null, unit: record.unit || null,
    net: num(record.net), vat: num(record.vat), date: record.date || today(),
    source_type: record.source_type || 'manual',
    evidence_path: record.evidence_path || null, evidence_name: record.evidence_name || null,
    deleted: Boolean(record.deleted), updated_at: record.updated_at || nowISO(), updated_by: currentEmail()
  };
  const { error } = await client.from('rempro_price_history').insert(payload);
  if (error && error.code !== '23505') throw error;
}

document.getElementById('pricesBody').addEventListener('click', e => {
  const editId = e.target.closest('[data-edit-price]')?.dataset.editPrice;
  if (editId) openPrice(editId);
  const id = e.target.closest('[data-remove-price]')?.dataset.removePrice;
  if (id) removePrice(id);
});
function removePrice(id) {
  if (!confirm('¿Eliminar este precio? Se quitará de todos los dispositivos sincronizados.')) return;
  const p = prices.find(x => x.id === id);
  if (!p) return;
  p.deleted = true;
  p.updated_at = nowISO();
  p.updated_by = currentEmail();
  save(STORAGE.prices, prices);
  renderPrices();
  window.RemProSync && window.RemProSync.queueSync();
}
const prd = document.getElementById('priceDialog');
let editingPrice = null, editingPriceVersion = null;
function openPrice(id = null) {
  editingPrice = id;
  const price = prices.find(p => p.id === id && !p.deleted);
  editingPriceVersion = price ? JSON.stringify(price) : null;
  document.getElementById('priceForm').reset();
  document.getElementById('prDate').value = today();
  if (price) Object.entries({prItem:'item',prSupplier:'supplier',prUnit:'unit',prNet:'net',prVat:'vat',prDate:'date'}).forEach(([id,key]) => document.getElementById(id).value = price[key] ?? '');
  prd.showModal();
}
document.getElementById('addPriceBtn').onclick = () => openPrice();
document.getElementById('priceForm').onsubmit = async e => {
  if (e.submitter?.value === 'cancel') return;
  e.preventDefault();
  if (!document.getElementById('priceForm').reportValidity() || !val('prItem').trim() || !val('prSupplier').trim()) return;
  if (editingPrice && JSON.stringify(prices.find(p => p.id === editingPrice)) !== editingPriceVersion) { alert('El precio cambió. Cierra y vuelve a abrirlo para revisar los datos actuales.'); return; }
  const sourceType = val('prSourceType') || 'manual';
  const evidenceFile = document.getElementById('prEvidence').files?.[0] || null;
  if (sourceType !== 'manual' && !evidenceFile) { alert('Selecciona la fotografía o documento que respalda esta verificación.'); return; }
  const historyId = crypto.randomUUID();
  let evidence;
  try { evidence = await uploadPriceEvidence(evidenceFile, historyId); }
  catch (err) { alert(err.message || 'No se pudo subir la evidencia.'); return; }
  const record = {
    id: editingPrice || crypto.randomUUID(), item: val('prItem'), supplier: val('prSupplier'), unit: val('prUnit'),
    net: num(val('prNet')), vat: num(val('prVat')), date: val('prDate') || today(),
    deleted: false, updated_at: nowISO(), updated_by: currentEmail()
  };
  const historyRecord = {
    id: historyId, price_id: record.id, item: record.item, supplier: record.supplier, unit: record.unit,
    net: record.net, vat: record.vat, date: record.date, source_type: sourceType,
    evidence_path: evidence.path, evidence_name: evidence.name,
    deleted: false, updated_at: nowISO(), updated_by: currentEmail()
  };
  const next = editingPrice ? prices.map(p => p.id === editingPrice ? record : p) : [...prices, record];
  prices = next;
  priceHistory = [...priceHistory, historyRecord];
  save(STORAGE.prices, prices);
  save(STORAGE.priceHistory, priceHistory);
  try { await savePriceHistoryToCloud(historyRecord); }
  catch (err) { console.warn('Historial pendiente de sincronizar:', err); }
  prd.close();
  document.getElementById('priceForm').reset();
  renderPrices(); renderPriceHistory(); renderApu();
  window.RemProSync && window.RemProSync.queueSync();
};

function loadRulesForm() {
  document.getElementById('ruleStudSpacing').value = rules.studSpacing || .61;
  document.getElementById('ruleStudLength').value = rules.studLength || 3.05;
  document.getElementById('ruleTrackLength').value = rules.trackLength || 3.05;
  document.getElementById('ruleListon').value = rules.liston;
  document.getElementById('ruleCanaleta').value = rules.canaleta;
  document.getElementById('ruleAngle').value = rules.angle;
  document.getElementById('ruleWire').value = rules.wire;
  document.getElementById('ruleScrews').value = rules.screws;
  document.getElementById('ruleMini').value = rules.mini;
  document.getElementById('ruleCajillo').value = rules.cajillo;
  document.getElementById('ruleCurtain').value = rules.curtain;
}
document.getElementById('saveRulesBtn').onclick = async () => {
  if (!['ruleStudSpacing','ruleStudLength','ruleTrackLength','ruleListon','ruleCanaleta','ruleAngle','ruleWire','ruleScrews','ruleMini','ruleCajillo','ruleCurtain'].every(id => Number.isFinite(Number(val(id))) && Number(val(id)) > 0)) { alert('Todos los factores deben ser mayores que cero.'); return; }
  rules = {
    studSpacing: num(val('ruleStudSpacing')), studLength: num(val('ruleStudLength')), trackLength: num(val('ruleTrackLength')),
    liston: num(val('ruleListon')), canaleta: num(val('ruleCanaleta')), angle: num(val('ruleAngle')), wire: num(val('ruleWire')),
    screws: num(val('ruleScrews')), mini: num(val('ruleMini')), cajillo: num(val('ruleCajillo')), curtain: num(val('ruleCurtain')),
    updated_at: nowISO(), updated_by: currentEmail()
  };
  save(STORAGE.rules, rules);
  const client = DATA.remote.getClient();
  if (client && window.RemProSupabase?.session) {
    const { error } = await client.from('rempro_rules').update({
      stud_spacing: rules.studSpacing,
      stud_length: rules.studLength,
      track_length: rules.trackLength
    }).eq('id','default');
    if (error) console.warn('Parámetros geométricos pendientes de sincronizar:', error);
  }
  alert('Reglas RemPro guardadas.');
  window.RemProSync && window.RemProSync.queueSync();
};
function updateBalanceOptions() {
  const select = document.getElementById('balanceProject');
  if (!select) return;
  const previous = select.value;
  const list = activeProjects();
  select.innerHTML = list.length ? list.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.client)}</option>`).join('') : '<option value="">Sin obras</option>';
  if (list.some(p => p.id === previous)) select.value = previous;
  document.getElementById('balanceDate').value = today();
  renderBalance();
}
function renderBalance() {
  const id = document.getElementById('balanceProject')?.value;
  const p = activeProjects().find(x => x.id === id);
  const out = document.getElementById('balanceResult');
  if (!out || !p) { if (out) { out.className='balance-grid empty'; out.textContent='Selecciona una obra para generar el balance.'; } return; }
  const updates = activeProjectUpdates().filter(u => u.project_id === p.id).sort((a,b) => (Date.parse(b.as_of_date || b.created_at) || 0) - (Date.parse(a.as_of_date || a.created_at) || 0));
  const latest = updates[0];
  const contract = num(p.contract);
  const hasContract = contract > 0;
  const saldo = hasContract ? Math.max(0, contract - num(p.collected)) : null;
  const margin = hasContract ? contract - num(p.cost) : null;
  out.className='balance-grid';
  out.innerHTML = [
    ['Obra', esc(p.name)],
    ['Cliente', esc(p.client)],
    ['Corte', esc(today())],
    ['Contratado', hasContract ? money(contract) : 'Por conciliar'],
    ['Cobrado', money(p.collected)],
    ['Saldo por cobrar', hasContract ? money(saldo) : 'Por conciliar'],
    ['Costo real acumulado', money(p.cost)],
    ['Margen preliminar', hasContract ? money(margin) : 'Por conciliar'],
    ['Avance físico', `${num(p.progress).toFixed(2)}%`],
    ['Último avance ChatGPT', latest ? `${esc(latest.as_of_date || '')} · ${num(latest.progress).toFixed(2)}%` : 'Sin registro histórico'],
    ['Nota de último avance', latest?.notes ? esc(latest.notes) : '—']
  ].map((x,i) => `<div class="balance-item ${i===10?'wide':''}"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');
}
document.getElementById('balanceProject').addEventListener('change', renderBalance);
document.getElementById('printBalanceBtn').addEventListener('click', () => window.print());

function val(id) { return document.getElementById(id).value; }
function esc(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

function exportData() {
  const payload = { version: 1, exportedAt: new Date().toISOString(), projects, prices, priceHistory, projectUpdates, documents, civilCalculations, rules, apu: load(STORAGE.apu, null) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `RemPro_Control_respaldo_${today()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function importData(file) {
  try {
    const txt = await file.text(); const data = JSON.parse(txt);
    if (!data || data.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.prices) || !data.rules || typeof data.rules !== 'object' || Array.isArray(data.rules)) throw new Error('Formato inválido');
    const validRecord = (r, text, numbers) => r && typeof r === 'object' && text.every(k => typeof r[k] === 'string' && r[k].trim()) && numbers.every(k => Number.isFinite(Number(r[k])) && Number(r[k]) >= 0);
    if (!data.projects.every(p => validRecord(p,['name','client'],['contract','collected','cost','progress']) && Number(p.progress) <= 100) || !data.prices.every(p => validRecord(p,['item','supplier'],['net','vat']))) throw new Error('Datos inválidos');
    if (!['liston','canaleta','angle','wire','screws','mini','cajillo','curtain'].every(k => Number.isFinite(Number(data.rules[k])) && Number(data.rules[k]) > 0)) throw new Error('Reglas inválidas');
    for (const list of [data.projects,data.prices]) { const ids = list.filter(r => r.id).map(r => r.id); if (new Set(ids).size !== ids.length) throw new Error('IDs duplicados'); }

    if (data.apu && (!Array.isArray(data.apu.rows) || !data.apu.rows.every(r => r && typeof r.desc === 'string' && typeof r.unit === 'string' && Number.isFinite(r.qty) && r.qty >= 0 && Number.isFinite(r.pu) && r.pu >= 0))) throw new Error('APU inválido');
    if (data.documents && (!Array.isArray(data.documents) || !data.documents.every(d =>
      d && typeof d.project_id === 'string' && typeof d.title === 'string' &&
      Number.isFinite(Number(d.amount)) && Number(d.amount) >= 0 &&
      ['pending','partial','paid','accepted','overdue','rejected'].includes(d.status) &&
      ['unsent','sent'].includes(d.sent_state)
    ))) throw new Error('Documento inválido');
    if (data.civilCalculations && (!Array.isArray(data.civilCalculations) || !data.civilCalculations.every(c =>
      c && ['concrete','mortar','masonry_wall','stone_masonry','column','beam','footing','reinforced_wall','reinforced_slab','crew_work','free_generator'].includes(c.calculation_type) &&
      c.input_payload && typeof c.input_payload === 'object' &&
      c.result_payload && typeof c.result_payload === 'object'
    ))) throw new Error('Cálculo de obra civil inválido');
    const cloudNote = (window.RemProSupabase && window.RemProSupabase.session)
      ? ' Como tienes sesión iniciada, después se comparará contra la nube y sólo se aplicarán los cambios más recientes por registro.'
      : '';
    if (!confirm(`Esto sustituirá los datos locales de este dispositivo por el respaldo seleccionado.${cloudNote} ¿Continuar?`)) return;
    save(STORAGE.backup, { version: 1, exportedAt: nowISO(), projects, prices, priceHistory, projectUpdates, documents, civilCalculations, rules });
    let importedProjects = Array.isArray(data.projects) ? data.projects : [];
    let importedPrices = Array.isArray(data.prices) ? data.prices : [];
    projects = DATA.ensureRecordMeta(importedProjects).list;
    prices = DATA.ensureRecordMeta(importedPrices).list;
    priceHistory = DATA.ensureRecordMeta(Array.isArray(data.priceHistory) ? data.priceHistory : []).list;
    projectUpdates = DATA.ensureRecordMeta(Array.isArray(data.projectUpdates) ? data.projectUpdates : []).list;
    documents = DATA.ensureRecordMeta(Array.isArray(data.documents) ? data.documents : []).list;
    civilCalculations = DATA.ensureRecordMeta(Array.isArray(data.civilCalculations) ? data.civilCalculations : []).list;
    rules = { ...defaultRules, ...(data.rules && typeof data.rules === 'object' ? data.rules : rules) };
    save(STORAGE.projects, projects); save(STORAGE.prices, prices); save(STORAGE.priceHistory, priceHistory); save(STORAGE.projectUpdates, projectUpdates); save(STORAGE.documents, documents); save(STORAGE.civilCalculations, civilCalculations); save(STORAGE.rules, rules);
    if (data.apu) {
      apuRows = data.apu.rows;
      const allowed = ['apuIndirect','apuRisk','apuProfit','apuVat','apuSaleQty','apuSaleUnit','apuConceptDescription'];
      allowed.forEach(id => { if (data.apu.fields && data.apu.fields[id] !== undefined) document.getElementById(id).value = data.apu.fields[id]; });
      renderApu();
    }
    renderProjects(); renderDocuments(); renderCivil(); renderPrices(); renderPriceHistory(); renderApu(); loadRulesForm(); renderDashboard();
    alert('Respaldo importado correctamente.');
    window.RemProSync && window.RemProSync.queueSync();
  } catch (err) { alert('No se pudo importar el respaldo. Verifica que sea un archivo JSON generado por RemPro Control.'); }
}
document.getElementById('exportDataBtn').addEventListener('click', exportData);
document.getElementById('exportSafetyBtn').onclick = () => {
  const backup = load(STORAGE.backup, null);
  if (!backup) { alert('Aún no hay respaldo de seguridad. Se crea antes de la primera sincronización o de una importación.'); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
  const a = document.createElement('a'); a.href=url; a.download='RemPro_respaldo_seguridad.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.getElementById('importDataInput').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) importData(f); e.target.value = ''; });

// ---- Nube y sincronización -------------------------------------------------
const authDialog = document.getElementById('authDialog');
const cloudStatusEl = document.getElementById('cloudStatus');
const sidebarNoteEl = document.getElementById('sidebarNote');
const settingsCloudStatusEl = document.getElementById('settingsCloudStatus');
const settingsCloudDetailEl = document.getElementById('settingsCloudDetail');
const accountBtn = document.getElementById('accountBtn');
const signOutBtn = document.getElementById('signOutBtn');
const syncNowBtn = document.getElementById('syncNowBtn');
const authForm = document.getElementById('authForm');
const authError = document.getElementById('authError');

function paintStatus(status) {
  const labels = {
    local: ['● Local', 'Modo local (sin nube)'],
    'signed-out': ['○ Sin iniciar sesión', 'Sin iniciar sesión'],
    syncing: ['↻ Sincronizando…', 'Sincronizando…'],
    synced: ['☁ Sincronizado', status.message || 'Sincronizado'],
    error: ['⚠ Error de sincronización', status.message || 'Error de sincronización']
  };
  const [short, long] = labels[status.status] || labels.local;
  if (cloudStatusEl) cloudStatusEl.textContent = short;
  if (settingsCloudStatusEl) settingsCloudStatusEl.textContent = long;
  if (settingsCloudDetailEl) settingsCloudDetailEl.textContent = status.message || '';
  if (sidebarNoteEl) {
    sidebarNoteEl.textContent = status.status === 'synced' || status.status === 'syncing'
      ? `Datos en la nube · ${status.email || ''}`
      : 'Datos guardados localmente en este dispositivo.';
  }
  const signedIn = Boolean(window.RemProSupabase && window.RemProSupabase.session);
  if (accountBtn) accountBtn.hidden = signedIn;
  if (signOutBtn) signOutBtn.hidden = !signedIn;
  if (syncNowBtn) syncNowBtn.hidden = !signedIn;
  const accountBtnSettings = document.getElementById('accountBtnSettings');
  const syncNowBtnSettings = document.getElementById('syncNowBtnSettings');
  const signOutBtnSettings = document.getElementById('signOutBtnSettings');
  if (accountBtnSettings) accountBtnSettings.style.display = signedIn ? 'none' : '';
  if (syncNowBtnSettings) syncNowBtnSettings.style.display = signedIn ? '' : 'none';
  if (signOutBtnSettings) signOutBtnSettings.style.display = signedIn ? '' : 'none';
}

if (window.RemProSync) {
  window.RemProSync.onStatusChange(paintStatus);
}

if (accountBtn) accountBtn.onclick = () => { authError.textContent = ''; authForm.reset(); authDialog.showModal(); };
if (signOutBtn) signOutBtn.onclick = () => window.RemProSync && window.RemProSync.signOut();
if (syncNowBtn) syncNowBtn.onclick = () => window.RemProSync && window.RemProSync.syncNow();
if (authForm) authForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.textContent = '';
  const email = val('authEmail'), password = val('authPassword');
  try {
    await window.RemProSync.signIn(email, password);
    authDialog.close();
  } catch (err) {
    authError.textContent = err && err.message ? err.message : 'No se pudo completar la operación.';
  }
});

async function refreshCloudExtensions() {
  const client = DATA.remote.getClient();
  if (!client || !window.RemProSupabase?.session) return;
  try {
    const localHistory = DATA.ensureRecordMeta(load(STORAGE.priceHistory, [])).list;
    const { data: remoteHistory, error: historyReadError } = await client.from('rempro_price_history').select('*');
    if (historyReadError) throw historyReadError;
    const remoteIds = new Set((remoteHistory || []).map(r => r.id));
    for (const row of localHistory) {
      if (!remoteIds.has(row.id)) await savePriceHistoryToCloud(row);
    }
    const { data: confirmedHistory, error: confirmedError } = await client.from('rempro_price_history').select('*').order('date',{ascending:false}).order('updated_at',{ascending:false});
    if (confirmedError) throw confirmedError;
    save(STORAGE.priceHistory, confirmedHistory || []);

    const { data: updates, error: updatesError } = await client.from('rempro_project_updates').select('*').order('as_of_date',{ascending:false}).order('created_at',{ascending:false});
    if (updatesError) throw updatesError;
    save(STORAGE.projectUpdates, (updates || []).map(r => ({...r, deleted:false, updated_at:r.created_at || new Date(0).toISOString()})));

    const { data: remoteRules, error: rulesError } = await client.from('rempro_rules').select('*').eq('id','default').maybeSingle();
    if (rulesError) throw rulesError;
    if (remoteRules) {
      const localRules = load(STORAGE.rules, {});
      save(STORAGE.rules, {
        ...localRules,
        studSpacing: num(remoteRules.stud_spacing || localRules.studSpacing || .61),
        studLength: num(remoteRules.stud_length || localRules.studLength || 3.05),
        trackLength: num(remoteRules.track_length || localRules.trackLength || 3.05)
      });
    }
    reloadLocalData();
  } catch (err) {
    console.warn('Extensiones RemPro pendientes de sincronizar:', err);
  }
}

function reloadApuFromLocal() {
  const stored=load(STORAGE.apu,null);
  if(!stored) return;
  apuRows=Array.isArray(stored.rows)?stored.rows:apuRows;
  if(stored.fields) Object.entries(stored.fields).forEach(([id,value])=>{ const input=document.getElementById(id); if(input) input.value=value; });
  renderApu();
}
function reloadLocalData() {
  projects = load(STORAGE.projects, []);
  prices = load(STORAGE.prices, []);
  priceHistory = load(STORAGE.priceHistory, []);
  projectUpdates = load(STORAGE.projectUpdates, []);
  documents = load(STORAGE.documents, []);
  civilCalculations = load(STORAGE.civilCalculations, []);
  const nextRules = { ...defaultRules, ...load(STORAGE.rules, rules) };
  const rulesChanged = JSON.stringify(nextRules) !== JSON.stringify(rules);
  rules = nextRules;
  renderProjects(); renderDocuments(); renderCivil(); renderPrices(); renderPriceHistory(); reloadApuFromLocal(); if (rulesChanged) loadRulesForm();
}
window.addEventListener('rempro:synced', () => { reloadLocalData(); refreshCloudExtensions(); });
window.addEventListener('storage', e => { if ([STORAGE.projects,STORAGE.prices,STORAGE.priceHistory,STORAGE.projectUpdates,STORAGE.documents,STORAGE.civilCalculations,STORAGE.rules,STORAGE.apu].includes(e.key)) reloadLocalData(); });
const savedApu = load(STORAGE.apu, null);
if (savedApu?.fields) Object.entries(savedApu.fields).forEach(([id,value]) => { const input = document.getElementById(id); if (input) input.value = value; });
renderProjects(); renderDocuments(); renderCivil(); renderPrices(); renderPriceHistory(); renderApu(); loadRulesForm(); calcMaterials(false);
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  let remproReloadingForUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (remproReloadingForUpdate) return;
    remproReloadingForUpdate = true;
    window.location.reload();
  });

  async function refreshRemProServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register(
        './sw.js?v=20261004-autoapu1',
        { updateViaCache: 'none' }
      );
      await registration.update();
    } catch {
      // La app sigue operando en modo local si el service worker no puede actualizarse.
    }
  }

  window.addEventListener('load', refreshRemProServiceWorker, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshRemProServiceWorker();
  });
}
