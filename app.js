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
const defaultRules = { studSpacing: .61, studLength: 3.05, trackLength: 3.05, liston: .61, canaleta: .90, angle: 3.05, wire: .70, screws: 50, mini: 8, cajillo: .75, curtain: .35 };
let rules = { ...defaultRules, ...load(STORAGE.rules, {}) };
save(STORAGE.projects, projects);
save(STORAGE.prices, prices);
save(STORAGE.priceHistory, priceHistory);
save(STORAGE.projectUpdates, projectUpdates);
save(STORAGE.rules, rules);

const activeProjects = () => projects.filter(p => !p.deleted);
const activePrices = () => prices.filter(p => !p.deleted);
const activePriceHistory = () => priceHistory.filter(p => !p.deleted);
const activeProjectUpdates = () => projectUpdates.filter(p => !p.deleted);

const views = {
  dashboard: ['Dashboard', 'Resumen general de RemPro'],
  master: ['Control Maestro', 'Obras, cobros y costos'],
  materials: ['Muros y plafones', 'Cuantificación paramétrica'],
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
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { showView(b.dataset.go); if (b.textContent.trim() === 'Nueva obra') openProject(); }));
document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');

function statusColor(p) {
  const balance = num(p.contract) - num(p.collected);
  if (p.status === 'Terminada' && balance <= 1) return 'green';
  if (num(p.cost) > num(p.contract) && num(p.contract) > 0) return 'red';
  if (balance > 0 && num(p.progress) >= 80) return 'yellow';
  return 'green';
}

function renderDashboard() {
  const list = activeProjects();
  const active = list.filter(p => p.status === 'Activa').length;
  const contract = list.reduce((a, p) => a + num(p.contract), 0);
  const collected = list.reduce((a, p) => a + num(p.collected), 0);
  document.getElementById('kpiActive').textContent = active;
  document.getElementById('kpiContract').textContent = money(contract);
  document.getElementById('kpiCollected').textContent = money(collected);
  document.getElementById('kpiReceivable').textContent = money(list.reduce((a,p) => a + Math.max(0, num(p.contract)-num(p.collected)),0));

  const r = document.getElementById('recentProjects');
  if (!list.length) { r.className = 'empty'; r.textContent = 'Aún no hay obras registradas.'; }
  else {
    r.className = '';
    r.innerHTML = list.slice(-5).reverse().map(p =>
      `<div class="recent-item"><div><strong>${esc(p.name)}</strong><small>${esc(p.client)} · ${esc(p.status)}</small></div><strong>${money(p.contract)}</strong></div>`
    ).join('');
  }

  const a = document.getElementById('alerts');
  const alerts = [];
  list.forEach(p => {
    const bal = num(p.contract) - num(p.collected);
    if (num(p.cost) > num(p.contract) && num(p.contract) > 0) alerts.push(`${p.name}: costo real supera lo contratado.`);
    if (num(p.progress) >= 80 && bal > 0) alerts.push(`${p.name}: avance ${p.progress}% con saldo por cobrar ${money(bal)}.`);
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
    `<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.folio || '')}</small></td><td>${esc(p.client)}</td><td><span class="status"><i class="dot ${statusColor(p)}"></i>${esc(p.status)}</span></td><td>${money(p.contract)}</td><td>${money(p.collected)}</td><td>${money(p.cost)}</td><td>${money(Math.max(0, num(p.contract) - num(p.collected)))}</td><td>${num(p.progress)}%</td><td>${money(num(p.contract)-num(p.cost))}</td><td><button class="mini-btn" data-edit-project="${esc(p.id)}">Editar</button> <button class="mini-btn" data-balance-project="${esc(p.id)}">Balance</button> <button class="mini-btn" data-remove-project="${esc(p.id)}">Eliminar</button></td></tr>`
  ).join('');
  empty.style.display = list.length ? 'none' : 'block';
  updateBalanceOptions();
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

function calcMaterials() {
  const type = val('systemType'), L = num(val('matLength')), H = num(val('matHeight')), w = num(val('matWaste')) / 100,
    layers = num(val('matLayers')), area = L * H, panelArea = 1.22 * 2.44, f = 1 + w;
  if (![L,H,layers].every(n => Number.isFinite(n) && n > 0) || !Number.isInteger(layers) || !Number.isFinite(w) || w < 0 || w > 1) { alert('Captura medidas positivas, capas enteras y desperdicio entre 0 y 100%.'); return; }
  let items = [];
  if (type === 'wall1' || type === 'wall2') {
    const faces = type === 'wall2' ? 2 : 1;
    const boards = Math.ceil(area * faces * layers / panelArea * f);
    const studPositions = Math.ceil(L / num(rules.studSpacing || .61)) + 1;
    const piecesPerPosition = Math.ceil(H / num(rules.studLength || 3.05));
    const studs = studPositions * piecesPerPosition;
    const track = Math.ceil((L * 2) / num(rules.trackLength || 3.05));
    const heightNote = H > num(rules.studLength || 3.05) ? ' · altura mayor a la pieza comercial: validar empalme o perfil especial' : '';
    items = [
      ['Paneles', boards, 'pzas', val('panelType')],
      ['Postes / montenes', studs, `pzas de ${num(rules.studLength || 3.05).toFixed(2)} m`, `Modulación ${num(rules.studSpacing || .61).toFixed(2)} m${heightNote}`],
      ['Canal', track, `pzas de ${num(rules.trackLength || 3.05).toFixed(2)} m`, 'Canal superior + inferior'],
      ['Tornillos', Math.ceil(boards * rules.screws), 'pzas', `${rules.screws} por panel`],
      ['Pasta / tratamiento', Number((area * faces * layers * 1.1 * f).toFixed(2)), 'kg aprox.', 'Estimación preliminar']
    ];
  } else {
    const boards = Math.ceil(area * layers / panelArea * f);
    const listonMl = (Math.ceil(H / rules.liston) + 1) * L;
    const canaletaMl = (Math.ceil(L / rules.canaleta) + 1) * H;
    const angleMl = 2 * (L + H);
    items = [
      ['Paneles', boards, 'pzas', val('panelType')],
      ['Listón', Math.ceil(listonMl / 3.05), 'pzas de 3.05 m', `Separación ${rules.liston} m`],
      ['Canaleta', Math.ceil(canaletaMl / 3.05), 'pzas de 3.05 m', `Separación ${rules.canaleta} m`],
      ['Ángulo perimetral', Math.ceil(angleMl / rules.angle), 'pzas', `Largo comercial ${rules.angle} m`],
      ['Mini pija', Math.ceil(area * rules.mini * f), 'pzas', `${rules.mini}/m²`],
      ['Tornillos', Math.ceil(boards * rules.screws), 'pzas', `${rules.screws} por panel`]
    ];
  }
  document.getElementById('areaBadge').textContent = `${area.toFixed(2)} m²`;
  const out = document.getElementById('materialsResult');
  out.className = 'result-list';
  out.innerHTML = items.map(x => `<div class="result-row"><div><strong>${x[0]}</strong><small>${esc(x[3] || '')}</small></div><div><strong>${x[1]}</strong> <small>${x[2]}</small></div></div>`).join('');
}
document.getElementById('calcMaterialsBtn').onclick = calcMaterials;

let apuRows = load(STORAGE.apu, null)?.rows || [{ type: 'Material', desc: '', sourcePriceId: '', qty: 1, unit: 'pza', pu: 0 }, { type: 'Mano de obra', desc: '', sourcePriceId: '', qty: 1, unit: 'jor', pu: 0 }];
function latestPriceOptions(selected='') {
  const sorted = [...activePrices()].sort((a,b) => (Date.parse(b.date || b.updated_at) || 0) - (Date.parse(a.date || a.updated_at) || 0));
  return ['<option value="">Manual</option>', ...sorted.map(p => `<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.item)} · ${esc(p.supplier)} · ${money(num(p.net)*(1+num(p.vat)/100))}</option>`)].join('');
}
function renderApu() {
  const body = document.getElementById('apuBody');
  body.innerHTML = apuRows.map((r, i) => `<tr><td><select data-apu-field="type" data-apu-i="${i}"><option ${r.type === 'Material' ? 'selected' : ''}>Material</option><option ${r.type === 'Mano de obra' ? 'selected' : ''}>Mano de obra</option><option ${r.type === 'Herramienta' ? 'selected' : ''}>Herramienta</option><option ${r.type === 'Subcontrato' ? 'selected' : ''}>Subcontrato</option></select></td><td><input value="${esc(r.desc)}" data-apu-field="desc" data-apu-i="${i}"></td><td><select class="apu-price-source" data-apu-field="sourcePriceId" data-apu-i="${i}">${latestPriceOptions(r.sourcePriceId || '')}</select></td><td><input type="number" min="0" step="0.01" value="${r.qty}" data-apu-field="qty" data-apu-i="${i}"></td><td><input value="${esc(r.unit)}" data-apu-field="unit" data-apu-i="${i}"></td><td><input type="number" min="0" step="0.01" value="${r.pu}" data-apu-field="pu" data-apu-i="${i}"></td><td data-apu-total>${money(r.qty * r.pu)}</td><td><button class="mini-btn" data-apu-remove="${i}">✕</button></td></tr>`).join('');
  calcApu();
}
document.getElementById('apuBody').addEventListener('input', e => {
  const i = e.target.dataset.apuI, field = e.target.dataset.apuField;
  if (i === undefined || !field || field === 'sourcePriceId') return;
  apuRows[i][field] = (field === 'qty' || field === 'pu') ? num(e.target.value) : e.target.value;
  e.target.closest('tr').querySelector('[data-apu-total]').textContent = money(apuRows[i].qty * apuRows[i].pu);
  calcApu();
});
document.getElementById('apuBody').addEventListener('change', e => {
  const i = e.target.dataset.apuI, field = e.target.dataset.apuField;
  if (i === undefined || field !== 'sourcePriceId') return;
  const price = activePrices().find(p => p.id === e.target.value);
  apuRows[i].sourcePriceId = e.target.value;
  if (price) {
    apuRows[i].desc = price.item;
    apuRows[i].unit = price.unit || apuRows[i].unit;
    apuRows[i].pu = Number((num(price.net) * (1 + num(price.vat) / 100)).toFixed(2));
  }
  renderApu();
});
document.getElementById('apuBody').addEventListener('click', e => {
  const i = e.target.closest('[data-apu-remove]')?.dataset.apuRemove;
  if (i !== undefined) { apuRows.splice(i, 1); renderApu(); }
});
document.getElementById('addApuRow').onclick = () => { apuRows.push({ type: 'Material', desc: '', sourcePriceId: '', qty: 1, unit: 'pza', pu: 0 }); renderApu(); };
['apuIndirect', 'apuRisk', 'apuProfit', 'apuVat', 'apuSaleQty', 'apuSaleUnit', 'apuConceptDescription'].forEach(id => document.getElementById(id).addEventListener('input', calcApu));
function calcApu() {
  if (apuRows.some(r => !Number.isFinite(r.qty) || !Number.isFinite(r.pu) || r.qty < 0 || r.pu < 0) || ['apuIndirect','apuRisk','apuProfit','apuVat','apuSaleQty'].some(id => !Number.isFinite(Number(val(id))) || Number(val(id)) < 0) || Number(val('apuSaleQty')) <= 0) {
    ['apuDirect','apuCommercial','apuUnit','apuTotal'].forEach(id => document.getElementById(id).textContent='Revisa cantidades'); return;
  }
  save(STORAGE.apu, { rows: apuRows, fields: Object.fromEntries(['apuIndirect','apuRisk','apuProfit','apuVat','apuSaleQty','apuSaleUnit','apuConceptDescription'].map(id => [id,val(id)])) });
  const direct = apuRows.reduce((a, r) => a + r.qty * r.pu, 0), ind = direct * num(val('apuIndirect')) / 100, risk = direct * num(val('apuRisk')) / 100,
    base = direct + ind + risk, profit = base * num(val('apuProfit')) / 100, commercial = base + profit,
    qty = Math.max(.0001, num(val('apuSaleQty'))), vat = commercial * num(val('apuVat')) / 100;
  document.getElementById('apuDirect').textContent = money(direct);
  document.getElementById('apuCommercial').textContent = money(commercial);
  document.getElementById('apuUnit').textContent = `${money(commercial / qty)} / ${val('apuSaleUnit') || 'u'}`;
  document.getElementById('apuTotal').textContent = money(commercial + vat);
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
  const saldo = Math.max(0, num(p.contract) - num(p.collected));
  const margin = num(p.contract) - num(p.cost);
  out.className='balance-grid';
  out.innerHTML = [
    ['Obra', esc(p.name)],
    ['Cliente', esc(p.client)],
    ['Corte', esc(today())],
    ['Contratado', money(p.contract)],
    ['Cobrado', money(p.collected)],
    ['Saldo por cobrar', money(saldo)],
    ['Costo real acumulado', money(p.cost)],
    ['Margen preliminar', money(margin)],
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
  const payload = { version: 1, exportedAt: new Date().toISOString(), projects, prices, priceHistory, projectUpdates, rules, apu: load(STORAGE.apu, null) };
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
    const cloudNote = (window.RemProSupabase && window.RemProSupabase.session)
      ? ' Como tienes sesión iniciada, después se comparará contra la nube y sólo se aplicarán los cambios más recientes por registro.'
      : '';
    if (!confirm(`Esto sustituirá los datos locales de este dispositivo por el respaldo seleccionado.${cloudNote} ¿Continuar?`)) return;
    save(STORAGE.backup, { version: 1, exportedAt: nowISO(), projects, prices, priceHistory, projectUpdates, rules });
    let importedProjects = Array.isArray(data.projects) ? data.projects : [];
    let importedPrices = Array.isArray(data.prices) ? data.prices : [];
    projects = DATA.ensureRecordMeta(importedProjects).list;
    prices = DATA.ensureRecordMeta(importedPrices).list;
    priceHistory = DATA.ensureRecordMeta(Array.isArray(data.priceHistory) ? data.priceHistory : []).list;
    projectUpdates = DATA.ensureRecordMeta(Array.isArray(data.projectUpdates) ? data.projectUpdates : []).list;
    rules = { ...defaultRules, ...(data.rules && typeof data.rules === 'object' ? data.rules : rules) };
    save(STORAGE.projects, projects); save(STORAGE.prices, prices); save(STORAGE.priceHistory, priceHistory); save(STORAGE.projectUpdates, projectUpdates); save(STORAGE.rules, rules);
    if (data.apu) {
      apuRows = data.apu.rows;
      const allowed = ['apuIndirect','apuRisk','apuProfit','apuVat','apuSaleQty','apuSaleUnit','apuConceptDescription'];
      allowed.forEach(id => { if (data.apu.fields && data.apu.fields[id] !== undefined) document.getElementById(id).value = data.apu.fields[id]; });
      renderApu();
    }
    renderProjects(); renderPrices(); renderPriceHistory(); renderApu(); loadRulesForm(); renderDashboard();
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
const authModeToggle = document.getElementById('authModeToggle');
let authMode = 'signin';

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
if (authModeToggle) authModeToggle.onclick = () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  document.getElementById('authSubmitBtn').textContent = authMode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta';
  authModeToggle.textContent = authMode === 'signin' ? '¿Primera vez? Crear cuenta' : '¿Ya tienes cuenta? Iniciar sesión';
};
if (authForm) authForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.textContent = '';
  const email = val('authEmail'), password = val('authPassword');
  try {
    if (authMode === 'signin') {
      await window.RemProSync.signIn(email, password);
      authDialog.close();
    } else {
      await window.RemProSync.signUp(email, password);
      authError.textContent = 'Cuenta creada. Si tu correo requiere confirmación, revisa tu bandeja antes de iniciar sesión.';
    }
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

function reloadLocalData() {
  projects = load(STORAGE.projects, []);
  prices = load(STORAGE.prices, []);
  priceHistory = load(STORAGE.priceHistory, []);
  projectUpdates = load(STORAGE.projectUpdates, []);
  const nextRules = { ...defaultRules, ...load(STORAGE.rules, rules) };
  const rulesChanged = JSON.stringify(nextRules) !== JSON.stringify(rules);
  rules = nextRules;
  renderProjects(); renderPrices(); renderPriceHistory(); renderApu(); if (rulesChanged) loadRulesForm();
}
window.addEventListener('rempro:synced', () => { reloadLocalData(); refreshCloudExtensions(); });
window.addEventListener('storage', e => { if ([STORAGE.projects,STORAGE.prices,STORAGE.priceHistory,STORAGE.projectUpdates,STORAGE.rules].includes(e.key)) reloadLocalData(); });
const savedApu = load(STORAGE.apu, null);
if (savedApu?.fields) Object.entries(savedApu.fields).forEach(([id,value]) => { const input = document.getElementById(id); if (input) input.value = value; });
renderProjects(); renderPrices(); renderPriceHistory(); renderApu(); loadRulesForm(); calcMaterials();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
