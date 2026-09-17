// RemPro Control V2 — lógica de interfaz.
// Sigue guardando todo en localStorage primero (igual que V1): la app
// nunca depende de la red para funcionar. Si hay sesión de Supabase,
// sync.js sube/baja los mismos datos en segundo plano.
const DATA = window.RemProData;
const STORAGE = DATA.keys;
const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n || 0));
const num = v => Number(v || 0);
const today = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const load = (k, d) => DATA.local.load(k, d);
const save = (k, v) => DATA.local.save(k, v);
const currentEmail = () => (window.RemProSupabase && window.RemProSupabase.session && window.RemProSupabase.session.user)
  ? window.RemProSupabase.session.user.email
  : null;

let projects = DATA.ensureRecordMeta(load(STORAGE.projects, [])).list;
let prices = DATA.ensureRecordMeta(load(STORAGE.prices, [])).list;
let rules = load(STORAGE.rules, { liston: .61, canaleta: .90, angle: 3.05, wire: .70, screws: 50, mini: 8, cajillo: .75, curtain: .35 });
save(STORAGE.projects, projects);
save(STORAGE.prices, prices);

const activeProjects = () => projects.filter(p => !p.deleted);
const activePrices = () => prices.filter(p => !p.deleted);

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
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go)));
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
  const active = list.filter(p => p.status !== 'Terminada').length;
  const contract = list.reduce((a, p) => a + num(p.contract), 0);
  const collected = list.reduce((a, p) => a + num(p.collected), 0);
  document.getElementById('kpiActive').textContent = active;
  document.getElementById('kpiContract').textContent = money(contract);
  document.getElementById('kpiCollected').textContent = money(collected);
  document.getElementById('kpiReceivable').textContent = money(Math.max(0, contract - collected));

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
  const list = activeProjects();
  const body = document.getElementById('projectsBody'), empty = document.getElementById('projectsEmpty');
  body.innerHTML = list.map(p =>
    `<tr><td><strong>${esc(p.name)}</strong><br><small>${esc(p.folio || '')}</small></td><td>${esc(p.client)}</td><td><span class="status"><i class="dot ${statusColor(p)}"></i>${esc(p.status)}</span></td><td>${money(p.contract)}</td><td>${money(p.collected)}</td><td>${money(p.cost)}</td><td>${money(Math.max(0, num(p.contract) - num(p.collected)))}</td><td><button class="mini-btn" data-remove-project="${p.id}">Eliminar</button></td></tr>`
  ).join('');
  empty.style.display = list.length ? 'none' : 'block';
  renderDashboard();
}
document.getElementById('projectsBody').addEventListener('click', e => {
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
document.getElementById('addProjectBtn').onclick = () => pd.showModal();
document.getElementById('saveProjectBtn').onclick = e => {
  e.preventDefault();
  if (!val('pName') || !val('pClient')) return;
  projects.push({
    id: crypto.randomUUID(),
    name: val('pName'), client: val('pClient'), folio: val('pFolio'), status: val('pStatus'),
    contract: num(val('pContract')), collected: num(val('pCollected')), cost: num(val('pCost')), progress: num(val('pProgress')),
    deleted: false, updated_at: nowISO(), updated_by: currentEmail()
  });
  save(STORAGE.projects, projects);
  pd.close();
  document.getElementById('projectForm').reset();
  renderProjects();
  window.RemProSync && window.RemProSync.queueSync();
};

function calcMaterials() {
  const type = val('systemType'), L = num(val('matLength')), H = num(val('matHeight')), w = num(val('matWaste')) / 100,
    layers = Math.max(1, num(val('matLayers'))), area = L * H, panelArea = 1.22 * 2.44, f = 1 + w;
  let items = [];
  if (type === 'wall1' || type === 'wall2') {
    const faces = type === 'wall2' ? 2 : 1;
    const boards = Math.ceil(area * faces * layers / panelArea * f);
    const studs = Math.ceil(L / rules.liston) + 1;
    const track = Math.ceil((L * 2) / 3.05);
    items = [
      ['Paneles 1.22×2.44', boards, 'pzas'],
      ['Postes / montenes', studs, 'pzas'],
      ['Canal 3.05 m', track, 'pzas'],
      ['Tornillos', Math.ceil(boards * rules.screws), 'pzas'],
      ['Pasta / tratamiento', Number((area * faces * layers * 1.1 * f).toFixed(2)), 'kg aprox.']
    ];
  } else {
    const boards = Math.ceil(area * layers / panelArea * f);
    const listonMl = (Math.ceil(H / rules.liston) + 1) * L;
    const canaletaMl = (Math.ceil(L / rules.canaleta) + 1) * H;
    const angleMl = 2 * (L + H);
    items = [
      ['Paneles 1.22×2.44', boards, 'pzas'],
      ['Listón', Math.ceil(listonMl / 3.05), 'pzas 3.05 m'],
      ['Canaleta', Math.ceil(canaletaMl / 3.05), 'pzas 3.05 m'],
      ['Ángulo perimetral', Math.ceil(angleMl / rules.angle), 'pzas'],
      ['Mini pija', Math.ceil(area * rules.mini * f), 'pzas'],
      ['Tornillos', Math.ceil(boards * rules.screws), 'pzas']
    ];
  }
  document.getElementById('areaBadge').textContent = `${area.toFixed(2)} m²`;
  const out = document.getElementById('materialsResult');
  out.className = 'result-list';
  out.innerHTML = items.map(x => `<div class="result-row"><div><strong>${x[0]}</strong><small>${esc(val('panelType'))}</small></div><div><strong>${x[1]}</strong> <small>${x[2]}</small></div></div>`).join('');
}
document.getElementById('calcMaterialsBtn').onclick = calcMaterials;

let apuRows = [{ type: 'Material', desc: '', qty: 1, unit: 'pza', pu: 0 }, { type: 'Mano de obra', desc: '', qty: 1, unit: 'jor', pu: 0 }];
function renderApu() {
  const body = document.getElementById('apuBody');
  body.innerHTML = apuRows.map((r, i) => `<tr><td><select data-apu-field="type" data-apu-i="${i}"><option ${r.type === 'Material' ? 'selected' : ''}>Material</option><option ${r.type === 'Mano de obra' ? 'selected' : ''}>Mano de obra</option><option ${r.type === 'Herramienta' ? 'selected' : ''}>Herramienta</option><option ${r.type === 'Subcontrato' ? 'selected' : ''}>Subcontrato</option></select></td><td><input value="${esc(r.desc)}" data-apu-field="desc" data-apu-i="${i}"></td><td><input type="number" step="0.01" value="${r.qty}" data-apu-field="qty" data-apu-i="${i}"></td><td><input value="${esc(r.unit)}" data-apu-field="unit" data-apu-i="${i}"></td><td><input type="number" step="0.01" value="${r.pu}" data-apu-field="pu" data-apu-i="${i}"></td><td>${money(r.qty * r.pu)}</td><td><button class="mini-btn" data-apu-remove="${i}">✕</button></td></tr>`).join('');
  calcApu();
}
document.getElementById('apuBody').addEventListener('input', e => {
  const i = e.target.dataset.apuI, field = e.target.dataset.apuField;
  if (i === undefined || !field) return;
  apuRows[i][field] = (field === 'qty' || field === 'pu') ? num(e.target.value) : e.target.value;
  if (field !== 'desc' && field !== 'unit') renderApu(); else calcApu();
});
document.getElementById('apuBody').addEventListener('click', e => {
  const i = e.target.closest('[data-apu-remove]')?.dataset.apuRemove;
  if (i !== undefined) { apuRows.splice(i, 1); renderApu(); }
});
document.getElementById('addApuRow').onclick = () => { apuRows.push({ type: 'Material', desc: '', qty: 1, unit: 'pza', pu: 0 }); renderApu(); };
['apuIndirect', 'apuRisk', 'apuProfit', 'apuVat', 'apuSaleQty'].forEach(id => document.getElementById(id).addEventListener('input', calcApu));
function calcApu() {
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
    return `<tr><td>${esc(p.item)}</td><td>${esc(p.supplier)}</td><td>${esc(p.unit)}</td><td>${money(gross)}</td><td>${esc(p.date)}</td><td><button class="mini-btn" data-remove-price="${p.id}">Eliminar</button></td></tr>`;
  }).join('');
  e.style.display = list.length ? 'none' : 'block';
  renderDashboard();
}
document.getElementById('pricesBody').addEventListener('click', e => {
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
document.getElementById('addPriceBtn').onclick = () => { document.getElementById('prDate').value = today(); prd.showModal(); };
document.getElementById('savePriceBtn').onclick = e => {
  e.preventDefault();
  if (!val('prItem') || !val('prSupplier')) return;
  prices.push({
    id: crypto.randomUUID(), item: val('prItem'), supplier: val('prSupplier'), unit: val('prUnit'),
    net: num(val('prNet')), vat: num(val('prVat')), date: val('prDate') || today(),
    deleted: false, updated_at: nowISO(), updated_by: currentEmail()
  });
  save(STORAGE.prices, prices);
  prd.close();
  document.getElementById('priceForm').reset();
  renderPrices();
  window.RemProSync && window.RemProSync.queueSync();
};

function loadRulesForm() {
  document.getElementById('ruleListon').value = rules.liston;
  document.getElementById('ruleCanaleta').value = rules.canaleta;
  document.getElementById('ruleAngle').value = rules.angle;
  document.getElementById('ruleWire').value = rules.wire;
  document.getElementById('ruleScrews').value = rules.screws;
  document.getElementById('ruleMini').value = rules.mini;
  document.getElementById('ruleCajillo').value = rules.cajillo;
  document.getElementById('ruleCurtain').value = rules.curtain;
}
document.getElementById('saveRulesBtn').onclick = () => {
  rules = {
    liston: num(val('ruleListon')), canaleta: num(val('ruleCanaleta')), angle: num(val('ruleAngle')), wire: num(val('ruleWire')),
    screws: num(val('ruleScrews')), mini: num(val('ruleMini')), cajillo: num(val('ruleCajillo')), curtain: num(val('ruleCurtain')),
    updated_at: nowISO(), updated_by: currentEmail()
  };
  save(STORAGE.rules, rules);
  alert('Reglas RemPro guardadas en este dispositivo.');
  window.RemProSync && window.RemProSync.queueSync();
};
function val(id) { return document.getElementById(id).value; }
function esc(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

function exportData() {
  const payload = { version: 1, exportedAt: new Date().toISOString(), projects, prices, rules };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `RemPro_Control_respaldo_${today()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function importData(file) {
  try {
    const txt = await file.text(); const data = JSON.parse(txt);
    if (!data || typeof data !== 'object') throw new Error('Formato inválido');
    const cloudNote = (window.RemProSupabase && window.RemProSupabase.session)
      ? ' Como tienes sesión iniciada, después se comparará contra la nube y sólo se aplicarán los cambios más recientes por registro.'
      : '';
    if (!confirm(`Esto sustituirá los datos locales de este dispositivo por el respaldo seleccionado.${cloudNote} ¿Continuar?`)) return;
    let importedProjects = Array.isArray(data.projects) ? data.projects : [];
    let importedPrices = Array.isArray(data.prices) ? data.prices : [];
    projects = DATA.ensureRecordMeta(importedProjects).list;
    prices = DATA.ensureRecordMeta(importedPrices).list;
    rules = data.rules && typeof data.rules === 'object' ? data.rules : rules;
    save(STORAGE.projects, projects); save(STORAGE.prices, prices); save(STORAGE.rules, rules);
    renderProjects(); renderPrices(); loadRulesForm(); renderDashboard();
    alert('Respaldo importado correctamente.');
    window.RemProSync && window.RemProSync.queueSync();
  } catch (err) { alert('No se pudo importar el respaldo. Verifica que sea un archivo JSON generado por RemPro Control.'); }
}
document.getElementById('exportDataBtn').addEventListener('click', exportData);
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

renderProjects(); renderPrices(); renderApu(); loadRulesForm(); calcMaterials();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
