/* =============================================================================
   32. ADMINISTRATION C-AUTO — Interface séparée (/admin)
   33. ADMINISTRATION DES PROGRAMMES D'ENTRETIEN
   ============================================================================= */

function adDate(t) {
  if (!t) return '—';
  try { return new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

function adBadges(p) {
  const b = [];
  if (p.verification_status === 'VERIFIED') b.push(`<span class="ad-badge blue">${I('badge-check')} Vérifié</span>`);
  if (p.is_certified) b.push(`<span class="ad-badge blue">${I('award')} Certifié</span>`);
  if (p.verification_status === 'PENDING') b.push(`<span class="ad-badge warn">En attente</span>`);
  if (p.verification_status === 'REJECTED') b.push(`<span class="ad-badge ko">Rejeté</span>`);
  if (p.is_active === false) b.push(`<span class="ad-badge mute">Inactif</span>`);
  if (p.status === 'SUSPENDED') b.push(`<span class="ad-badge ko">Suspendu</span>`);
  return b.join('');
}

function adminShell(_active, title, icon, contentHtml, rightHtml = '') {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `
    <div class="ad-shell">
      <header class="ad-top">
        <div class="ad-top-l">
          <div class="ad-eyebrow">${I('shield-check')} Administration · Espace privé</div>
          <h1 class="ad-title">${I(icon)} ${esc(title)}</h1>
          <div class="ad-sub">${esc(today)} — Vue d'ensemble de la plateforme C-AUTO</div>
        </div>
        <div class="ad-top-right">
          ${rightHtml}
          <span class="ad-pill ad-pill-secure">${I('lock')} Session sécurisée</span>
        </div>
      </header>
      <div class="ad-body">${contentHtml}</div>
    </div>`;
}

/* Conversion automatique des tableaux admin en cartes sur mobile :
   on propage le libellé de chaque colonne dans les cellules (data-ad-col),
   ce que le CSS .ad-table exploite pour l'affichage mobile. */
(function enhanceAdminTables() {
  try {
    function applyCols(table) {
      if (table.dataset.adColsApplied) return;
      const ths = Array.from(table.querySelectorAll('thead th'));
      if (!ths.length) return;
      table.querySelectorAll('tbody tr').forEach((tr) => {
        Array.from(tr.children).forEach((td, i) => {
          if (ths[i]) td.setAttribute('data-ad-col', ths[i].textContent.trim());
        });
      });
      table.dataset.adColsApplied = '1';
    }
    function scan() { document.querySelectorAll('.ad-shell table.ad-table').forEach(applyCols); }
    if (window.MutationObserver) new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    scan();
  } catch (e) { /* silencieux en environnement dégradé */ }
})();

function adTable(cols, rowsHtml) {
  return `<div class="card ad-panel"><div class="ad-table-scroll"><table class="table ad-table"><thead><tr>${cols}</tr></thead><tbody>${rowsHtml || `<tr><td colspan="${(cols.match(/<th/g) || []).length}" class="hint" style="text-align:center">Aucune donnée</td></tr>`}</tbody></table></div></div>`;
}

const AD_KINDS = [
  { key: 'all', hash: '#/admin/professionals', label: 'Tous', icon: 'users' },
  { key: 'garages', hash: '#/admin/garages', label: 'Garages', icon: 'building-2' },
  { key: 'technicians', hash: '#/admin/technicians', label: 'Techniciens', icon: 'wrench' },
  { key: 'experts', hash: '#/admin/experts', label: 'Experts', icon: 'award' },
];

/* ============================== DASHBOARD ============================== */
async function viewAdminDashboard() {
  showLoading();
  try {
    const d = await api('/admin/dashboard');
    const kpi = (label, value, icon, tone = 'accent', sub = '') => `
      <div class="ad-kpi ${tone ? 'is-' + tone : ''}">
        <div class="ad-kpi-top"><span class="ad-kpi-label">${esc(label)}</span><span class="ad-kpi-icon">${I(icon)}</span></div>
        <div class="ad-kpi-value">${value}</div>
        ${sub ? `<div class="ad-kpi-sub">${sub}</div>` : ''}
      </div>`;
    const me = (S && S.user && S.user.name) || 'Administrateur';
    const first = String(me).trim().split(/\s+/)[0];
    layoutApp(adminShell('dashboard', 'Tableau de bord', 'layout-dashboard', `
      <section class="ad-hero">
        <div>
          <h2>Bonjour, ${esc(first)}</h2>
          <p class="hint">Voici l'état de la plateforme C-AUTO aujourd'hui.</p>
        </div>
        <div class="fl-stats-line">
          <span class="fl-chip mute">${d.service_requests.total} demandes</span>
          <span class="fl-chip accent">${money(Number(d.payments.revenue_cents || 0))} encaissés</span>
        </div>
      </section>
      <section class="ad-kpi-grid">
        ${kpi('Utilisateurs', d.users.total, 'users', 'accent', d.users.clients + ' clients · ' + d.users.garages + ' garages')}
        ${kpi('Véhicules', d.vehicles.total, 'car', 'neutral', 'parc des clients')}
        ${kpi('Professionnels', d.professionals.total, 'badge-check', 'ok', d.professionals.verified + ' vérifiés · ' + d.professionals.unverified + ' en attente')}
        ${kpi('Demandes', d.service_requests.total, 'clipboard-list', 'warn', d.interventions.closed + ' interventions clôturées')}
        ${kpi('Chiffre d\'affaires', money(Number(d.payments.revenue_cents || 0)), 'wallet', 'ok', 'paiements réussis')}
        ${kpi('Ventes pièces', money(Number(d.part_orders.revenue_cents || 0)), 'shopping-cart', 'ok', 'commandes traitées')}
        ${kpi('Litiges ouverts', d.disputes.open, 'alert-triangle', d.disputes.open ? 'ko' : 'ok', '')}
        ${kpi('Programmes', d.programs.total, 'file-cog', 'neutral', d.programs.published + ' publiés · ' + d.fault_codes.total + ' codes défaut')}
      </section>
      <div class="fl-grid-main">
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('badge-check')} Vérifications de professionnels à traiter</div>
          ${(d.pending_verifications && d.pending_verifications.length) ? d.pending_verifications.map(p => `
            <div class="fl-row">
              <div class="fl-veh">${I('user')} <b>${esc(p.professional_name)}</b> <span class="hint">· ${esc(p.specialty)}${p.city ? ' · ' + esc(p.city) : ''}</span></div>
              <a class="btn btn-sm" href="#/admin/professionals">${I('arrow-right')} Traiter</a>
            </div>`).join('') : `<div class="fl-empty">${I('check-circle')} Aucune vérification en attente</div>`}
        </div>
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('clock')} Derniers comptes créés</div>
          ${d.recent_users.map(u => `
            <div class="fl-row">
              <div class="fl-veh">${I('user-plus')} <b>${esc(u.name)}</b> <span class="hint">· ${esc(u.email)}</span></div>
              <span class="fl-chip ${u.role === 'CLIENT' ? 'mute' : 'accent'}">${esc(u.role)}</span>
            </div>`).join('') || `<div class="fl-empty">—</div>`}
        </div>
      </div>
      <div class="fl-grid-main">
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('scroll-text')} Activité récente (traçabilité)</div>
          ${(d.recent_audit && d.recent_audit.length) ? d.recent_audit.map(a => `
            <div class="fl-row">
              <div class="fl-veh">${I('shield')} <b>${esc(a.action)}</b> <span class="hint">· ${esc(a.entity)}${a.actor ? ' · par ' + esc(a.actor) : ''}</span></div>
              <span class="hint fl-row-label">${adDate(a.created_at)}</span>
            </div>`).join('') : `<div class="fl-empty">Aucun audit</div>`}
        </div>
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('zap')} Accès rapide</div>
          <div class="ad-quick-grid">
            <a class="ad-quick" href="#/admin/users">${I('users')}<b>Utilisateurs</b><span>Comptes & rôles</span></a>
            <a class="ad-quick" href="#/admin/professionals">${I('badge-check')}<b>Professionnels</b><span>Vérifications</span></a>
            <a class="ad-quick" href="#/admin/service-requests">${I('clipboard-list')}<b>Demandes</b><span>Flux service</span></a>
            <a class="ad-quick" href="#/admin/payments">${I('wallet')}<b>Finances</b><span>Paiements</span></a>
            <a class="ad-quick" href="#/admin/maintenance-programs">${I('file-cog')}<b>Référentiels</b><span>Programmes & codes</span></a>
            <a class="ad-quick" href="#/admin/audit-logs">${I('scroll-text')}<b>Journal d'audit</b><span>Sécurité</span></a>
          </div>
        </div>
      </div>`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminUsers() {
  showLoading();
  try {
    const { users } = await api('/admin/users');
    const sums = users.reduce((a, u) => { a[u.role] = (a[u.role] || 0) + 1; a.suspended += u.status === 'SUSPENDED' ? 1 : 0; return a; }, { suspended: 0 });
    layoutApp(adminShell('users', 'Utilisateurs', 'users', `
      <div class="fl-stats-line">
        <span class="fl-chip mute">Total ${users.length}</span>
        <span class="fl-chip accent">Clients ${sums.CLIENT || 0}</span>
        <span class="fl-chip ok">Garages ${sums.GARAGE || 0}</span>
        <span class="fl-chip warn">Techniciens ${sums.MECANICIEN || 0}</span>
        <span class="fl-chip mute">Fournisseurs ${sums.SUPPLIER || 0}</span>
        <span class="fl-chip mute">Admins ${sums.ADMIN || 0}</span>
        ${sums.suspended ? `<span class="fl-chip ko">Suspendus ${sums.suspended}</span>` : ''}
      </div>
      ${adTable('<th>Utilisateur</th><th>Rôle</th><th>Téléphone</th><th>Véhicules</th><th>Inscription</th><th>Statut</th><th></th>',
        users.map(u => `<tr data-id="${u.id}">
          <td><div class="fl-veh-main">${I('user')}<div><b>${esc(u.name)}</b><span class="hint">${esc(u.email)}</span></div></div></td>
          <td><select class="ad-select" data-role="${u.id}">${['CLIENT','GARAGE','MECANICIEN','EXPERT','SUPPLIER','LIVREUR','FLEET_MANAGER','ADMIN','SUPER_ADMIN'].map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
          <td class="hint">${esc(u.phone)}</td><td>${u.vehicles_count}</td><td class="hint">${adDate(u.created_at)}</td>
          <td><button class="btn btn-sm ${u.status === 'SUSPENDED' ? '' : 'btn-ghost'}" data-status="${u.id}:${u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'}">${u.status === 'SUSPENDED' ? 'Réactiver' : 'Suspendre'}</button></td>
          <td><a class="btn btn-sm btn-ghost" href="#/admin/users">${I('eye')}</a></td>
        </tr>`).join(''))}`));
    document.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => {
      try { await api('/admin/users/' + s.dataset.role, { method: 'PATCH', body: { role: s.value } }); toast('Rôle mis à jour', 'success'); }
      catch (e) { toast(e.message, 'error'); } });
    document.querySelectorAll('[data-status]').forEach(b => b.onclick = async () => {
      const [id, status] = b.dataset.status.split(':');
      try { await api('/admin/users/' + id, { method: 'PATCH', body: { status } }); toast('Statut mis à jour', 'success'); viewAdminUsers(); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminVehicles() {
  showLoading();
  try {
    const { vehicles } = await api('/admin/vehicles');
    layoutApp(adminShell('vehicles', 'Véhicules', 'car', `
      <div class="fl-stats-line"><span class="fl-chip mute">${vehicles.length} véhicules</span></div>
      ${adTable('<th>Véhicule</th><th>Année</th><th>Plaque</th><th>VIN</th><th>Km</th><th>Propriétaire</th><th>Interventions</th>',
        vehicles.map(v => `<tr>
          <td><div class="fl-veh-main">${I('car')}<div><b>${esc(v.make)} ${esc(v.model)}</b></div></div></td>
          <td>${v.year}</td><td class="hint">${esc(v.plate)}</td><td class="hint">${esc(v.vin)}</td><td>${v.mileage} km</td>
          <td>${esc(v.owner_name)} <span class="hint">· ${esc(v.owner_email)}</span></td>
          <td>${v.interventions_count}</td></tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

function renderProList(professionals, kind) {
  return `
    <div class="fl-stats-line">
      <span class="fl-chip mute">${professionals.length} résultat(s)</span>
      <span class="fl-chip ok">${professionals.filter(p => p.verification_status === 'VERIFIED').length} vérifiés</span>
      <span class="fl-chip warn">${professionals.filter(p => ['PENDING','UNVERIFIED'].includes(p.verification_status)).length} à vérifier</span>
      <span class="fl-chip accent">${professionals.filter(p => p.is_certified).length} certifiés</span>
    </div>
    <div class="fl-card-grid" style="margin-top:0.8rem">
      ${professionals.map(p => `
        <div class="ad-pro-card">
          <div class="fl-drv-card" style="border:none;padding:0;background:none">
            <div class="fl-avatar">${esc((p.professional_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>
            <div class="fl-drv-info">
              <b>${esc(p.professional_name)}</b>
              <span class="hint">${esc(p.specialty)}${p.city ? ' · ' + esc(p.city) : ''}</span>
              <span class="hint">${p.garage_name ? esc(p.garage_name) : ''}</span>
            </div>
            <div>${adBadges(p)}</div>
          </div>
          <div class="ad-pro-meta">
            <span>${I('star')} ${Number(p.rating).toFixed(1)}/5 (${p.rating_count})</span>
            <span>${I('medal')} ${p.experience_years || 0} ans</span>
            <span>${I('award')} ${p.certifications_count} certif.</span>
          </div>
          ${(p.attestation_doc_ids || []).length ? `<div class="ad-pro-atts">${I('shield-plus')} <b>${p.attestation_doc_ids.length} attestation(s) déposée(s)</b> — <a href="#/admin/professionals/${p.id}">contrôler</a></div>` : ''}
          <div class="ad-pro-actions">
            <button class="btn btn-sm ${p.verification_status === 'VERIFIED' ? 'btn-ghost' : ''}" data-verify="${p.id}:${p.verification_status === 'VERIFIED' ? 'UNVERIFIED' : 'VERIFIED'}">${I('badge-check')} ${p.verification_status === 'VERIFIED' ? 'Dévérifier' : 'Vérifier'}</button>
            <button class="btn btn-sm ${p.is_certified ? 'btn-ghost' : ''}" data-certify="${p.id}:${p.is_certified ? 'false' : 'true'}">${I('award')} ${p.is_certified ? 'Retirer certif.' : 'Certifier'}</button>
            <button class="btn btn-sm btn-ghost" data-active="${p.id}:${p.is_active ? 'false' : 'true'}">${p.is_active ? 'Désactiver' : 'Activer'}</button>
            <a class="btn btn-sm btn-ghost" href="#/admin/professionals/${p.id}">${I('eye')}</a>
          </div>
        </div>`).join('') || `<div class="fl-empty">${I('users')} Aucun professionnel</div>`}
    </div>`;
}
function bindProActions(handler) {
  document.querySelectorAll('[data-verify]').forEach(b => b.onclick = async () => {
    const [id, status] = b.dataset.verify.split(':');
    try { await api('/admin/professionals/' + id + '/verify', { method: 'PATCH', body: { status } }); toast(status === 'VERIFIED' ? 'Professionnel vérifié ✓' : 'Vérification retirée', 'success'); handler(); }
    catch (e) { toast(e.message, 'error'); } });
  document.querySelectorAll('[data-certify]').forEach(b => b.onclick = async () => {
    const [id, certified] = b.dataset.certify.split(':');
    try { await api('/admin/professionals/' + id + '/certify', { method: 'PATCH', body: { certified: certified === 'true' } }); toast(certified === 'true' ? 'Certification attribuée (badge bleu)' : 'Certification retirée', 'success'); handler(); }
    catch (e) { toast(e.message, 'error'); } });
  document.querySelectorAll('[data-active]').forEach(b => b.onclick = async () => {
    const [id, is_active] = b.dataset.active.split(':');
    try { await api('/admin/professionals/' + id, { method: 'PATCH', body: { is_active: is_active === 'true' } }); toast('Statut changé', 'success'); handler(); }
    catch (e) { toast(e.message, 'error'); } });
}

async function viewAdminProfessionals(kind = 'all') {
  showLoading();
  try {
    const { professionals } = await api('/admin/professionals?kind=' + kind);
    const tabs = AD_KINDS.map(t => `<a class="fl-tab ${t.key === kind ? 'active' : ''}" href="${t.hash}">${I(t.icon)} ${t.label}</a>`).join('');
    layoutApp(adminShell(kind === 'all' ? 'professionals' : (kind === 'garages' ? 'garages' : kind === 'technicians' ? 'technicians' : 'experts'),
      kind === 'all' ? 'Professionnels' : kind === 'garages' ? 'Garages' : kind === 'technicians' ? 'Techniciens' : 'Experts',
      'building', `<nav class="fl-tabs" style="margin-bottom:1rem">${tabs}</nav>` + renderProList(professionals, kind)));
    bindProActions(() => viewAdminProfessionals(kind));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminProfessionalDetail(id) {
  showLoading();
  try {
    const d = await api('/admin/professionals/' + id);
    const p = d.professional;
    layoutApp(adminShell('professionals', 'Fiche professionnel', 'building', `
      <div class="grid-2">
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('user')} ${esc(p.professional_name)} ${adBadges(p)}</div>
          <p class="hint" style="margin:0.2rem 0">${esc(p.specialty)} · ${p.profile_type} · ${esc(p.city || '')}</p>
          <div class="fl-row"><span class="hint">Évaluation</span><b>${Number(p.rating).toFixed(1)}/5</b></div>
          <div class="fl-row"><span class="hint">Avis</span><b>${p.rating_count}</b></div>
          <div class="fl-row"><span class="hint">Satisfaction</span><b>${Number(p.satisfaction_rate || 0).toFixed(1)}%</b></div>
          <div class="fl-row"><span class="hint">Expérience</span><b>${p.experience_years || 0} ans</b></div>
          <div class="fl-row"><span class="hint">Disponible</span><b>${p.is_available ? 'Oui' : 'Non'}</b></div>
          <div class="fl-row"><span class="hint">Inscription</span><b>${adDate(p.created_at)}</b></div>
          <div style="display:flex;gap:0.5rem;margin-top:0.8rem;flex-wrap:wrap">
            <button class="btn btn-sm" data-verify="${p.id}:${p.verification_status === 'VERIFIED' ? 'UNVERIFIED' : 'VERIFIED'}">${I('badge-check')} ${p.verification_status === 'VERIFIED' ? 'Dévérifier' : 'Vérifier'}</button>
            <button class="btn btn-sm" data-certify="${p.id}:${p.is_certified ? 'false' : 'true'}">${I('award')} ${p.is_certified ? 'Retirer certif.' : 'Certifier'}</button>
            <button class="btn btn-sm btn-ghost" data-active="${p.id}:${p.is_active ? 'false' : 'true'}">${p.is_active ? 'Désactiver' : 'Activer'}</button>
          </div>
          <div class="fl-panel-h" style="margin-top:1rem">${I('shield-plus')} Attestations (contrôle admin)</div>
          ${(p.attestation_doc_ids || []).length ? `<div class="ad-pro-atts">${p.attestation_doc_ids.map(a => `<a class="ad-att-doc" href="/api/documents/${a}/download" target="_blank" rel="noopener">${I('download')} ${a.slice(0, 8)}…</a>`).join('')}</div>` : '<p class="hint">Aucune attestation déposée.</p>'}
          <div class="fl-panel-h" style="margin-top:1rem">${I('sticky-note')} Note de vérification</div>
          <p class="hint">${esc(p.verification_note || '—')}</p>
        </div>
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('award')} Certifications</div>
          ${(d.certifications || []).map(c => `<div class="fl-row"><span>${esc(c.name)}</span><span class="hint">${esc(c.issuer || '')}${c.obtained_at ? ' · ' + esc(c.obtained_at) : ''}</span></div>`).join('') || '<p class="hint">Aucune certification enregistrée</p>'}
          <div class="fl-panel-h" style="margin-top:1rem">${I('settings')} Services</div>
          ${(d.services || []).map(s => `<div class="fl-row"><span>${esc(s.label)}</span><b>${money(s.price_cents || 0)}</b></div>`).join('') || '<p class="hint">Aucun service</p>'}
          <div class="fl-panel-h" style="margin-top:1rem">${I('star')} Avis</div>
          <div class="fl-row"><span class="hint">Moyenne</span><b>${Number(d.ratings.avg_stars).toFixed(1)}/5</b></div>
          <div class="fl-row"><span class="hint">Nombre</span><b>${d.ratings.total}</b></div>
        </div>
      </div>`));
    bindProActions(() => viewAdminProfessionalDetail(id));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

/* ===== SUPPLIERS ===== */
async function viewAdminSuppliers() {
  showLoading();
  try {
    const { suppliers } = await api('/admin/suppliers');
    layoutApp(adminShell('suppliers', 'Fournisseurs', 'truck', `
      <div class="fl-stats-line">
        <span class="fl-chip mute">${suppliers.length} fournisseurs</span>
        <span class="fl-chip ok">${suppliers.filter(s => s.verified).length} vérifiés</span>
        <span class="fl-chip warn">${suppliers.filter(s => !s.verified).length} à vérifier</span>
      </div>
      ${adTable('<th>Fournisseur</th><th>Contact</th><th>Email</th><th>Pièces</th><th>Vérifié</th><th>Actif</th>',
        suppliers.map(s => `<tr>
          <td><div class="fl-veh-main">${I('building-2')}<div><b>${esc(s.name)}</b></div></div></td>
          <td class="hint">${esc(s.contact_name || '—')}<br>${esc(s.phone || '')}</td>
          <td class="hint">${esc(s.email || '—')}</td>
          <td>${s.parts_count}</td>
          <td><button class="btn btn-sm ${s.verified ? '' : 'btn-ghost'}" data-verify="${s.id}:${s.verified ? 'false' : 'true'}">${I('badge-check')} ${s.verified ? 'Vérifié' : 'Vérifier'}</button></td>
          <td><button class="btn btn-sm ${s.is_active ? '' : 'btn-ghost'}" data-active="${s.id}:${s.is_active ? 'false' : 'true'}">${s.is_active ? 'Actif' : 'Inactif'}</button></td>
        </tr>`).join(''))}`));
    document.querySelectorAll('[data-verify]').forEach(b => b.onclick = async () => {
      const [id, verified] = b.dataset.verify.split(':');
      try { await api('/admin/suppliers/' + id + '/verify', { method: 'PATCH', body: { verified: verified === 'true' } }); toast(verified === 'true' ? 'Fournisseur vérifié' : 'Vérification retirée', 'success'); viewAdminSuppliers(); }
      catch (e) { toast(e.message, 'error'); } });
    document.querySelectorAll('[data-active]').forEach(b => b.onclick = async () => {
      const [id, act] = b.dataset.active.split(':');
      try { await api('/admin/suppliers/' + id, { method: 'PATCH', body: { is_active: act === 'true' } }); toast('Statut changé', 'success'); viewAdminSuppliers(); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

/* ===== FLUX OPÉRATIONNELS ===== */
async function viewAdminServiceRequests() {
  showLoading();
  try {
    const { service_requests } = await api('/admin/service-requests');
    layoutApp(adminShell('service-requests', 'Demandes de service', 'clipboard-list', `
      <div class="fl-stats-line"><span class="fl-chip mute">${service_requests.length} demandes</span></div>
      ${adTable('<th>Client</th><th>Véhicule</th><th>Pro</th><th>Catégorie</th><th>Statut</th><th>Créée</th>',
        service_requests.map(s => `<tr>
          <td>${esc(s.client_name)}</td>
          <td>${s.make ? esc(s.make) + ' ' + esc(s.model) : '—'} <span class="hint">${esc(s.plate || '')}</span></td>
          <td>${esc(s.professional_name || '—')}</td>
          <td class="hint">${esc(s.category || '—')}</td>
          <td><span class="status-badge status-${esc(s.status)}">${esc(s.status.replace(/_/g, ' '))}</span></td>
          <td class="hint">${adDate(s.created_at)}</td></tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminAppointments() {
  showLoading();
  try {
    const { appointments } = await api('/admin/appointments');
    layoutApp(adminShell('appointments', 'Rendez-vous', 'calendar', `
      <div class="fl-stats-line"><span class="fl-chip mute">${appointments.length} RDV</span></div>
      ${adTable('<th>Client</th><th>Véhicule</th><th>Pro</th><th>Prévu le</th><th>Statut</th>',
        appointments.map(a => `<tr>
          <td>${esc(a.client_name)}</td><td>${esc(a.make)} ${esc(a.model)} <span class="hint">${esc(a.plate)}</span></td>
          <td>${esc(a.pro_name || '—')}</td><td class="hint">${adDate(a.scheduled_at)}</td>
          <td><span class="status-badge status-${esc(a.status)}">${esc(a.status.replace(/_/g, ' '))}</span></td></tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminDiagnostics() {
  showLoading();
  try {
    const d = await api('/admin/diagnostics');
    layoutApp(adminShell('diagnostics', 'Diagnostics', 'stethoscope', `
      <div class="fl-stats-line">
        <span class="fl-chip mute">${d.diagnostics.length} diagnostics pro</span>
        <span class="fl-chip mute">${d.sessions.length} sessions analysées</span>
      </div>
      ${adTable('<th>Auteur</th><th>Véhicule</th><th>Intervention</th><th>Contenu</th><th>Date</th>',
        d.diagnostics.map(x => `<tr>
          <td>${esc(x.author_name)}</td>
          <td>${esc(x.make)} ${esc(x.model)} <span class="hint">${esc(x.plate)}</span></td>
          <td><span class="status-badge status-${esc(x.status)}">${esc(x.status.replace(/_/g, ' '))}</span></td>
          <td>${esc((x.content || '').slice(0, 90))}</td>
          <td class="hint">${adDate(x.created_at)}</td></tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminQuotes() {
  showLoading();
  try {
    const { quotes, totals } = await api('/admin/quotes');
    layoutApp(adminShell('quotes', 'Devis', 'file-text', `
      <div class="fl-stats-line">
        <span class="fl-chip mute">${totals.total} devis</span>
        <span class="fl-chip ok">Approuvés ${money(Number(totals.approved_cents))}</span>
        <span class="fl-chip accent">Total ${money(Number(totals.total_cents))}</span>
      </div>
      ${adTable('<th>Client</th><th>Véhicule</th><th>Pro</th><th>Montant</th><th>Statut</th><th>Date</th>',
        quotes.map(q => `<tr>
          <td>${esc(q.client_name)}</td><td>${esc(q.make)} ${esc(q.model)}</td><td>${esc(q.pro_name || '—')}</td>
          <td><b>${money(q.total_cents)}</b></td>
          <td>${q.status === 'APPROVED' ? '<span class="fl-chip ok">APPROUVÉ</span>' : q.status === 'REFUSED' ? '<span class="fl-chip ko">REFUSÉ</span>' : '<span class="fl-chip warn">EN ATTENTE</span>'}</td>
          <td class="hint">${adDate(q.created_at)}</td></tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminRepairs() {
  showLoading();
  try {
    const { repairs } = await api('/admin/repairs');
    layoutApp(adminShell('repairs', 'Réparations / Interventions', 'settings', `
      <div class="fl-stats-line"><span class="fl-chip mute">${repairs.length} interventions</span></div>
      ${adTable('<th>Client</th><th>Véhicule</th><th>Pro</th><th>Statut</th><th>Devis</th><th>Créée</th>',
        repairs.map(i => `<tr>
          <td>${esc(i.client_name)}</td><td>${esc(i.make)} ${esc(i.model)} <span class="hint">${esc(i.plate)}</span></td>
          <td>${esc(i.professional_name || '—')}</td>
          <td><span class="status-badge status-${esc(i.status)}">${esc(i.status.replace(/_/g, ' '))}</span></td>
          <td><b>${money(i.quote_total_cents || 0)}</b></td>
          <td class="hint">${adDate(i.created_at)}</td></tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminWarranties() {
  showLoading();
  try {
    const { warranties } = await api('/admin/warranties');
    layoutApp(adminShell('warranties', 'Garanties', 'shield', `
      <div class="fl-stats-line">
        <span class="fl-chip ok">Actives ${warranties.filter(w => w.days_left > 0 && w.is_active).length}</span>
        <span class="fl-chip warn">Expirent <30j ${warranties.filter(w => w.is_active && w.days_left >= 0 && w.days_left < 30).length}</span>
      </div>
      ${adTable('<th>Véhicule</th><th>Client</th><th>Début</th><th>Fin</th><th>Jours restants</th><th>Statut</th>',
        warranties.map(w => `<tr>
          <td>${esc(w.make)} ${esc(w.model)} <span class="hint">${esc(w.plate)}</span></td>
          <td>${esc(w.client_name)}</td>
          <td class="hint">${esc(w.starts_on)}</td><td class="hint">${esc(w.ends_on)}</td>
          <td><b>${w.days_left !== null ? w.days_left : '—'}</b></td>
          <td>${w.days_left > 0 && w.is_active ? '<span class="fl-chip ok">Active</span>' : w.days_left <= 0 ? '<span class="fl-chip ko">Expirée</span>' : '<span class="fl-chip mute">Inactive</span>'}</td>
        </tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminPayments() {
  showLoading();
  try {
    const { payments, totals } = await api('/admin/payments');
    layoutApp(adminShell('payments', 'Paiements', 'credit-card', `
      <div class="fl-stats-line">
        <span class="fl-chip mute">${totals.total} paiements</span>
        <span class="fl-chip ok">Réussis ${totals.succeeded} · ${money(Number(totals.revenue_cents))}</span>
        <span class="fl-chip warn">En attente ${totals.pending}</span>
      </div>
      ${adTable('<th>Client</th><th>Véhicule</th><th>Pro</th><th>Montant</th><th>Statut</th><th>Date</th>',
        payments.map(p => `<tr>
          <td>${esc(p.client_name)}</td><td>${esc(p.make)} ${esc(p.model)} <span class="hint">${esc(p.plate)}</span></td>
          <td>${esc(p.professional_name || '—')}</td>
          <td><b>${money(p.amount_cents)}</b></td>
          <td>${p.status === 'SUCCEEDED' ? '<span class="fl-chip ok">Réussi</span>' : p.status === 'PENDING' ? '<span class="fl-chip warn">En attente</span>' : '<span class="fl-chip ko">' + esc(p.status) + '</span>'}</td>
          <td class="hint">${adDate(p.created_at)}</td></tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminTransactions() {
  showLoading();
  try {
    const { transactions, totals } = await api('/admin/transactions');
    layoutApp(adminShell('transactions', 'Transactions', 'arrow-left-right', `
      <div class="fl-stats-line">
        <span class="fl-chip ok">Paiements ${money(Number(totals.payments_revenue))}</span>
        <span class="fl-chip accent">Ventes pièces ${money(Number(totals.orders_revenue))}</span>
      </div>
      ${adTable('<th>Date</th><th>Type</th><th>Libellé</th><th>Client</th><th>Montant</th><th>Statut</th>',
        transactions.map(t => `<tr>
          <td class="hint">${adDate(t.date)}</td>
          <td><span class="fl-chip ${t.type === 'Paiement' ? 'ok' : 'accent'}">${esc(t.type)}</span></td>
          <td>${esc(t.title)} <span class="hint">#${esc(String(t.entity_id).slice(0, 8))}</span></td>
          <td>${esc(t.client)}</td><td><b>${money(t.amount_cents)}</b></td>
          <td><span class="status-badge status-${esc(t.status)}">${esc(t.status.replace(/_/g, ' '))}</span></td>
        </tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminCommissions() {
  showLoading();
  try {
    const { commissions, totals } = await api('/admin/commissions');
    layoutApp(adminShell('commissions', 'Commissions', 'percent', `
      <div class="fl-kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
        ${flKpi('À verser', money(Number(totals.pending_cents)), null, 'hourglass', 'warn')}
        ${flKpi('Versées', money(Number(totals.paid_cents)), null, 'check-circle', 'ok')}
        ${flKpi('Total', money(Number(totals.pending_cents) + Number(totals.paid_cents)), null, 'percent', 'accent')}
      </div>
      <div class="card fl-panel">
        <div class="fl-panel-h">${I('plus')} Nouvelle commission</div>
        <form id="f-comm" class="fl-form">
          <div class="form-row-3">
            <label>Professionnel <input name="professional_id" placeholder="ID pro (facultatif)"></label>
            <label>Montant (FCFA) <input name="amount_cents" type="number" step="1" min="0" required></label>
            <label>Taux % <input name="rate_percent" type="number" step="0.1" value="10"></label>
          </div>
          <label>Note <input name="note" placeholder="Référence / commentaire"></label>
          <button type="submit" class="btn">${I('plus')} Enregistrer</button>
        </form>
      </div>
      ${adTable('<th>Pro</th><th>Véhicule</th><th>Montant</th><th>Taux</th><th>Statut</th><th>Note</th><th>Par</th><th></th>',
        commissions.map(c => `<tr>
          <td>${esc(c.professional_name || '—')}</td>
          <td>${c.make ? esc(c.make) + ' ' + esc(c.model) + ' <span class=hint>' + esc(c.plate) + '</span>' : '—'}</td>
          <td><b>${money(c.amount_cents)}</b></td><td>${c.rate_percent}%</td>
          <td><button class="btn btn-sm ${c.status === 'PAID' ? '' : 'btn-ghost'}" data-cstatus="${c.id}:${c.status === 'PAID' ? 'PENDING' : 'PAID'}">${c.status === 'PAID' ? 'Versée' : 'Marquer versée'}</button></td>
          <td class="hint">${esc(c.note || '—')}</td><td class="hint">${esc(c.created_by_name || '—')}</td>
          <td>${money(c.amount_cents)}</td></tr>`).join(''))}`));
    document.getElementById('f-comm').onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      try { await api('/admin/commissions', { method: 'POST', body: { professional_id: o.professional_id || null, amount_cents: Math.round((+o.amount_cents || 0) * 100), rate_percent: +o.rate_percent || 0, note: o.note } }); toast('Commission enregistrée', 'success'); viewAdminCommissions(); }
      catch (e) { toast(e.message, 'error'); } };
    document.querySelectorAll('[data-cstatus]').forEach(b => b.onclick = async () => {
      const [id, status] = b.dataset.cstatus.split(':');
      try { await api('/admin/commissions/' + id, { method: 'PATCH', body: { status } }); toast('Statut changé', 'success'); viewAdminCommissions(); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminParts() {
  showLoading();
  try {
    const { parts, totals } = await api('/admin/parts');
    layoutApp(adminShell('parts', 'Pièces détachées', 'package', `
      <div class="fl-stats-line">
        <span class="fl-chip mute">${totals.total} pièces</span>
        <span class="fl-chip warn">Stock bas ${totals.low_stock}</span>
        <span class="fl-chip accent">Valeur stock ${money(Number(totals.stock_value_cents))}</span>
      </div>
      ${adTable('<th>Référence</th><th>Pièce</th><th>Catégorie</th><th>Fournisseur</th><th>Prix</th><th>Stock</th><th>Actif</th>',
        parts.map(p => `<tr class="${p.stock_quantity <= p.min_stock ? 'ad-row-low' : ''}">
          <td class="hint">${esc(p.reference)}</td>
          <td><div class="fl-veh-main">${I('package')}<div><b>${esc(p.name)}</b><span class="hint">${esc(p.brand || '')}</span></div></div></td>
          <td><span class="status-badge status-${esc(p.category)}">${esc(p.category)}</span></td>
          <td>${esc(p.supplier_name || '—')}${p.supplier_verified ? ' ' + I('badge-check') : ''}</td>
          <td><b>${money(p.unit_price_cents)}</b></td>
          <td><b>${p.stock_quantity}</b> <span class="hint">/ min ${p.min_stock}</span></td>
          <td><button class="btn btn-sm ${p.active ? '' : 'btn-ghost'}" data-part="${p.id}:${p.active ? 'false' : 'true'}">${p.active ? 'Actif' : 'Inactif'}</button></td>
        </tr>`).join(''))}`));
    document.querySelectorAll('[data-part]').forEach(b => b.onclick = async () => {
      const [id, active] = b.dataset.part.split(':');
      try { await api('/admin/parts/' + id, { method: 'PATCH', body: { active: active === 'true' } }); toast('Statut mis à jour', 'success'); viewAdminParts(); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminOrders() {
  showLoading();
  try {
    const { orders } = await api('/admin/orders');
    layoutApp(adminShell('orders', 'Commandes de pièces', 'shopping-cart', `
      <div class="fl-stats-line"><span class="fl-chip mute">${orders.length} commandes</span></div>
      ${adTable('<th>Client</th><th>Fournisseur</th><th>Pièce</th><th>Qté</th><th>Montant</th><th>Statut</th><th>Date</th>',
        orders.map(o => `<tr>
          <td>${esc(o.client_name)}</td><td>${esc(o.supplier_name || '—')}</td>
          <td class="hint">${esc(o.part_name)} <span>${esc(o.part_reference)}</span></td>
          <td>${o.quantity}</td><td><b>${money(o.total_cents)}</b></td>
          <td><select class="ad-select" data-order="${o.id}">${['PENDING','CONFIRMED','SHIPPED','DELIVERED','CANCELLED'].map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
          <td class="hint">${adDate(o.created_at)}</td></tr>`).join(''))}`));
    document.querySelectorAll('[data-order]').forEach(s => s.onchange = async () => {
      try { await api('/admin/orders/' + s.dataset.order + '/status', { method: 'PATCH', body: { status: s.value } }); toast('Statut mis à jour', 'success'); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminDisputes() {
  showLoading();
  try {
    const { disputes } = await api('/admin/disputes');
    layoutApp(adminShell('disputes', 'Litiges', 'alert-triangle', `
      <div class="fl-stats-line"><span class="fl-chip mute">${disputes.length} litiges</span></div>
      ${adTable('<th>Client</th><th>Pro</th><th>Sujet</th><th>Statut</th><th>Résolution</th><th>Créé</th>',
        disputes.map(d => `<tr>
          <td>${esc(d.client_name)}</td><td>${esc(d.professional_name || '—')}</td>
          <td>${esc(d.subject)}</td>
          <td><select class="ad-select" data-disp="${d.id}">${['OPEN','IN_REVIEW','RESOLVED','ESCALATED','CLOSED'].map(s => `<option ${d.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
          <td class="hint">${esc((d.resolution_notes || '').slice(0, 60))}</td>
          <td class="hint">${adDate(d.created_at)}</td></tr>`).join(''))}`));
    document.querySelectorAll('[data-disp]').forEach(s => s.onchange = async () => {
      try { await api('/admin/disputes/' + s.dataset.disp + '/status', { method: 'PATCH', body: { status: s.value } }); toast('Statut mis à jour', 'success'); viewAdminDisputes(); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminReviews() {
  showLoading();
  try {
    const { reviews } = await api('/admin/reviews');
    layoutApp(adminShell('reviews', 'Avis clients', 'star', `
      <div class="fl-stats-line"><span class="fl-chip mute">${reviews.length} avis</span></div>
      ${adTable('<th>Client</th><th>Pro</th><th>Véhicule</th><th>Note</th><th>Commentaire</th><th>Date</th>',
        reviews.map(r => `<tr>
          <td>${esc(r.author_name)}</td><td>${esc(r.professional_name || '—')}</td>
          <td>${r.make ? esc(r.make) + ' ' + esc(r.model) : '—'}</td>
          <td><b>${'★'.repeat(Math.max(0, Math.min(5, Math.round(r.overall_stars || r.stars || 0))))}</b></td>
          <td class="hint">${esc((r.comment || '').slice(0, 90))}</td>
          <td class="hint">${adDate(r.created_at)}</td></tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

/* ===== PROGRAMMES D'ENTRETIEN (33) ===== */
const PROG_BADGE = { DRAFT: 'warn', PUBLISHED: 'ok', ARCHIVED: 'mute' };
const PROG_LABEL = { DRAFT: 'Brouillon', PUBLISHED: 'Publié', ARCHIVED: 'Archivé' };

async function viewAdminPrograms() {
  showLoading();
  try {
    const { programs, summary } = await api('/admin/maintenance-programs');
    layoutApp(adminShell('maintenance-programs', 'Programmes d\'entretien', 'file-cog', `
      <div class="fl-stats-line">
        <span class="fl-chip warn">Brouillons ${summary.draft}</span>
        <span class="fl-chip ok">Publiés ${summary.published}</span>
        <span class="fl-chip mute">Archivés ${summary.archived}</span>
      </div>
      <div class="grid-2">
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('plus')} Créer un programme</div>
          <form id="f-prog-new" class="fl-form">
            <label>Constructeur * <select name="manufacturer_id" required><option value="">— Choisir —</option></select></label>
            <label>Nom <input name="name" placeholder="Programme d'entretien"></label>
            <label>Description <input name="description"></label>
            <button type="submit" class="btn">${I('plus')} Créer (brouillon)</button>
          </form>
        </div>
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('upload')} Importer un programme (JSON)</div>
          <form id="f-prog-import" class="fl-form">
            <label>Constructeur * <select name="manufacturer_id" required><option value="">— Choisir —</option></select></label>
            <label>JSON du programme <textarea name="json" rows="6" required placeholder='{"name":"...","intervals":[{"label":"Vidange","interval_km":10000,"interval_months":12,"operations":[{"label":"Vidange moteur"}],"checks":[{"label":"Freins"}]}]}'></textarea></label>
            <button type="submit" class="btn">${I('upload')} Importer</button>
          </form>
        </div>
      </div>
      ${adTable('<th>Programme</th><th>Constructeur</th><th>Moteur</th><th>Origine</th><th>Statut</th><th>Versions</th><th>Publié</th><th></th>',
        programs.map(p => `<tr>
          <td><div class="fl-veh-main">${I('file-cog')}<div><b>${esc(p.name)}</b><span class="hint">${esc((p.description || '').slice(0, 60))}</span></div></div></td>
          <td>${esc(p.manufacturer_name || '—')}</td>
          <td class="hint">${esc(p.engine_name || 'Tous')}</td>
          <td><span class="fl-chip mute">${esc(p.origin || 'MANUAL')}</span></td>
          <td><span class="fl-chip ${PROG_BADGE[p.admin_status] || 'warn'}">${esc(PROG_LABEL[p.admin_status] || p.admin_status)}</span></td>
          <td>${p.versions_count}</td><td class="hint">${adDate(p.published_at)}</td>
          <td><a class="btn btn-sm" href="#/admin/maintenance-programs/${p.id}">${I('settings')} Gérer</a></td>
        </tr>`).join(''))}`));
    const mfrs = await api('/admin/maintenance-programs/manufacturers').catch(() => null);
    if (mfrs) {
      const opts = mfrs.manufacturers.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
      document.querySelectorAll('select[name=manufacturer_id]').forEach(s => { s.insertAdjacentHTML('beforeend', opts); });
    }
    renderIcons();
    document.getElementById('f-prog-new').onsubmit = async (ev) => {
      ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      try { await api('/admin/maintenance-programs', { method: 'POST', body: { manufacturer_id: o.manufacturer_id, name: o.name, description: o.description, intervals: [] } }); toast('Programme créé (brouillon)', 'success'); viewAdminPrograms(); }
      catch (e) { toast(e.message, 'error'); } };
    document.getElementById('f-prog-import').onsubmit = async (ev) => {
      ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      let data;
      try { data = JSON.parse(o.json); } catch { toast('JSON invalide', 'error'); return; }
      try { await api('/admin/maintenance-programs/import', { method: 'POST', body: { manufacturer_id: o.manufacturer_id, ...data } }); toast('Programme importé (' + (data.intervals || []).length + ' intervalles)', 'success'); viewAdminPrograms(); }
      catch (e) { toast(e.message, 'error'); } };
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminProgram(id) {
  showLoading();
  try {
    const d = await api('/admin/maintenance-programs/' + id);
    const p = d.program;
    const intervals = d.intervals || [];
    const statusBtns = [
      `<button class="btn btn-sm ${p.admin_status === 'PUBLISHED' ? '' : 'btn-ghost'}" data-admin-status="${id}:PUBLISHED">${I('send')} Publier</button>`,
      `<button class="btn btn-sm btn-ghost" data-admin-status="${id}:DRAFT">${I('edit')} Repasser en brouillon</button>`,
      `<button class="btn btn-sm btn-ghost" data-admin-status="${id}:ARCHIVED">${I('archive')} Archiver</button>`,
      `<button class="btn btn-sm btn-ghost" data-admin-status="${id}:PUBLISHED-DISABLE">${p.is_active ? 'Désactiver' : 'Activer'}</button>`,
    ].join('');
    const intervalRow = (iv) => `
      <div class="fl-row" data-iv="${iv.id}">
        <div class="fl-veh-main" style="flex:2">${I('wrench')}<div><b>${esc(iv.label)}</b>
          <span class="hint">tous les ${iv.interval_km} km ou ${iv.interval_months} mois</span>
          ${(iv.operations || []).length ? `<div style="margin-top:0.15rem">${iv.operations.map(o => `<span class="fl-chip mute">${esc(o.label)}</span>`).join(' ')}</div>` : ''}
          ${(iv.checks || []).length ? `<div style="margin-top:0.15rem">${iv.checks.map(c => `<span class="fl-chip accent">✓ ${esc(c.label)}</span>`).join(' ')}</div>` : ''}
        </div></div>
        <div style="display:flex;gap:0.4rem">
          <button class="btn btn-sm btn-ghost" data-iv-del="${iv.id}">${I('trash-2')}</button>
        </div>
      </div>`;
    layoutApp(adminShell('maintenance-programs', 'Programme d\'entretien', 'file-cog', `
      <div class="fl-stats-line" style="margin-bottom:1rem">
        <span class="fl-chip ${PROG_BADGE[p.admin_status] || 'warn'}">${esc(PROG_LABEL[p.admin_status] || p.admin_status)}</span>
        <span class="fl-chip mute">${esc(p.origin || 'MANUAL')}</span>
        <span class="fl-chip accent">${esc(p.manufacturer_name || '—')}${p.engine_name ? ' · ' + esc(p.engine_name) : ''}</span>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">${statusBtns}</div>
      <div class="grid-2">
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('layers')} Versions</div>
          ${(d.versions || []).map(v => `
            <div class="fl-row">
              <span><b>v${v.version}</b> <span class="hint">· ${v.effective_date ? esc(v.effective_date) : 'pas de date d\'effet'} · ${v.intervals_count} intervalle(s)</span></span>
              <span class="hint">${adDate(v.created_at)}</span>
            </div>`).join('')}
          <button class="btn btn-sm" data-version="${id}" style="margin-top:0.6rem">${I('copy')} Créer une nouvelle version</button>
        </div>
        <div class="card fl-panel">
          <div class="fl-panel-h">${I('plus')} Ajouter un intervalle</div>
          <form id="f-iv" class="fl-form">
            <label>Libellé <input name="label" required placeholder="Ex: Vidange moteur + filtre"></label>
            <div class="form-row-2"><label>Kilométrage <input name="interval_km" type="number" min="1" required></label>
              <label>Mois <input name="interval_months" type="number" min="1" required></label></div>
            <button type="submit" class="btn">${I('plus')} Ajouter</button>
          </form>
        </div>
      </div>
      <div class="card fl-panel" style="margin-top:1rem">
        <div class="fl-panel-h">${I('list')} Intervalles de la dernière version</div>
        ${intervals.length ? intervals.map(intervalRow).join('') : '<div class="fl-empty">Aucun intervalle — ajoutez-en ci-dessus</div>'}
      </div>`));
    document.querySelectorAll('[data-admin-status]').forEach(b => b.onclick = async () => {
      const [pid, status] = b.dataset.adminStatus.split(':');
      try { await api('/admin/maintenance-programs/' + pid, { method: 'PATCH', body: { admin_status: status.split('-')[0], disable: status.endsWith('-DISABLE') } }); toast('Programme mis à jour', 'success'); viewAdminProgram(id); }
      catch (e) { toast(e.message, 'error'); } });
    document.querySelectorAll('[data-version]').forEach(b => b.onclick = async () => {
      try { await api('/admin/maintenance-programs/' + b.dataset.version + '/version', { method: 'POST', body: { notes: '' } }); toast('Version créée', 'success'); viewAdminProgram(id); }
      catch (e) { toast(e.message, 'error'); } });
    document.querySelectorAll('[data-iv-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Supprimer cet intervalle ?')) return;
      try { await api('/admin/maintenance-programs/' + id + '/interval/' + b.dataset.ivDel, { method: 'DELETE' }); toast('Intervalle supprimé', 'success'); viewAdminProgram(id); }
      catch (e) { toast(e.message, 'error'); } });
    document.getElementById('f-iv').onsubmit = async (ev) => {
      ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      try { await api('/admin/maintenance-programs/' + id + '/interval', { method: 'POST', body: { label: o.label, interval_km: +o.interval_km, interval_months: +o.interval_months } }); toast('Intervalle ajouté', 'success'); viewAdminProgram(id); }
      catch (e) { toast(e.message, 'error'); } };
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminFaultCodes() {
  showLoading();
  try {
    const { fault_codes, systems } = await api('/admin/fault-codes');
    layoutApp(adminShell('fault-codes', 'Codes défaut (DTC)', 'hash', `
      <div class="fl-stats-line"><span class="fl-chip mute">${fault_codes.length} codes</span></div>
      <div class="card fl-panel">
        <div class="fl-panel-h">${I('plus')} Nouveau code</div>
        <form id="f-fc" class="fl-form">
          <div class="form-row-3">
            <label>Code * <input name="code" required placeholder="P0301"></label>
            <label>Système <select name="system_id"><option value="">—</option>${systems.map(s => `<option value="${s.id}">${esc(s.code_prefix)} · ${esc(s.name)}</option>`).join('')}</select></label>
            <label>Sévérité <select name="severity"><option>HAUTE</option><option>MOYENNE</option><option>BASSE</option></select></label>
          </div>
          <label>Interprétation <input name="interpretation"></label>
          <button type="submit" class="btn">${I('plus')} Ajouter</button>
        </form>
      </div>
      ${adTable('<th>Code</th><th>Système</th><th>Interprétation</th><th>Sévérité</th><th>Causes</th><th>Tests</th><th></th>',
        fault_codes.map(f => `<tr>
          <td><b>${esc(f.code)}</b></td>
          <td class="hint">${esc(f.system_name || '—')}</td>
          <td>${esc((f.interpretation || '').slice(0, 80))}</td>
          <td>${severityBadge(f.severity)}</td>
          <td>${f.causes_count}</td><td>${f.tests_count}</td>
          <td><button class="btn btn-sm btn-ghost" data-fc-del="${f.id}">${I('trash-2')}</button></td>
        </tr>`).join(''))}`));
    document.getElementById('f-fc').onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      try { await api('/admin/fault-codes', { method: 'POST', body: { code: o.code, system_id: o.system_id || null, severity: o.severity, interpretation: o.interpretation } }); toast('Code ajouté', 'success'); viewAdminFaultCodes(); }
      catch (e) { toast(e.message, 'error'); } };
    document.querySelectorAll('[data-fc-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Supprimer ce code défaut ?')) return;
      try { await api('/admin/fault-codes/' + b.dataset.fcDel, { method: 'DELETE' }); toast('Code supprimé', 'success'); viewAdminFaultCodes(); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminNotifications() {
  showLoading();
  try {
    const { notifications } = await api('/admin/notifications/all');
    layoutApp(adminShell('notifications', 'Notifications', 'bell', `
      <div class="card fl-panel">
        <div class="fl-panel-h">${I('megaphone')} Diffuser une notification à tous</div>
        <form id="f-broadcast" class="fl-form">
          <label>Message <input name="message" required placeholder="Ex: Maintenance programmée dimanche 08:00–18:00"></label>
          <button type="submit" class="btn">${I('send')} Diffuser</button>
        </form>
      </div>
      <div class="fl-stats-line" style="margin:0.8rem 0"><span class="fl-chip mute">${notifications.length} notifications</span></div>
      ${adTable('<th>Utilisateur</th><th>Message</th><th>Date</th>',
        notifications.map(n => `<tr>
          <td>${esc(n.user_name)} <span class="hint">· ${esc(n.user_email)}</span></td>
          <td>${esc(n.message)}</td><td class="hint">${adDate(n.created_at)}</td></tr>`).join(''))}`));
    document.getElementById('f-broadcast').onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      try { const r = await api('/admin/broadcast', { method: 'POST', body: { message: o.message } }); toast(r.message, 'success'); viewAdminNotifications(); }
      catch (e) { toast(e.message, 'error'); } };
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminGeography() {
  showLoading();
  try {
    const d = await api('/admin/geography');
    const cityRows = (title, icon, list) => `
      <div class="card fl-panel">
        <div class="fl-panel-h">${I(icon)} ${esc(title)}</div>
        ${list.length ? list.map(r => `
          <div class="fl-row"><span>${esc(r.city)}</span><b>${r.professionals ?? r.suppliers ?? r.users ?? r.vehicles}</b></div>`).join('') : '<p class="hint">Aucune donnée</p>'}
      </div>`;
    layoutApp(adminShell('geography', 'Géographie', 'map-pin', `
      <div class="fl-grid-2">${cityRows('Professionnels par ville', 'building', d.professionals)}${cityRows('Utilisateurs par ville', 'users', d.users)}${cityRows('Fournisseurs', 'truck', d.suppliers)}${cityRows('Véhicules par ville', 'car', d.vehicles)}</div>`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminSettings() {
  showLoading();
  try {
    const { settings } = await api('/admin/settings');
    layoutApp(adminShell('settings', 'Paramètres', 'settings', `
      <div class="card fl-panel" style="max-width:760px">
        <div class="fl-panel-h">${I('sliders-horizontal')} Paramètres de la plateforme</div>
        <div style="display:flex;flex-direction:column;gap:0.7rem">
          ${settings.map(s => `
            <div class="fl-row">
              <div style="flex:1"><b>${esc(s.key)}</b><span class="hint"> · ${esc(s.type)}</span>
                <br><input class="ad-input ad-setting" data-key="${esc(s.key)}" data-type="${esc(s.type)}" value="${esc(s.value)}" style="margin-top:0.2rem;max-width:100%"></div>
              <span class="hint">${s.updated_by_name ? 'par ' + esc(s.updated_by_name) : ''}</span>
            </div>`).join('')}
        </div>
        <button class="btn" id="btn-settings-save" style="margin-top:1rem">${I('save')} Enregistrer les modifications</button>
      </div>`));
    document.getElementById('btn-settings-save').onclick = async () => {
      const entries = Array.from(document.querySelectorAll('.ad-setting')).map(i => ({ key: i.dataset.key, value: i.value, type: i.dataset.type }));
      try { await api('/admin/settings', { method: 'PATCH', body: { entries } }); toast('Paramètres enregistrés (audit log créé)', 'success'); }
      catch (e) { toast(e.message, 'error'); } };
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewAdminAuditLogs() {
  showLoading();
  try {
    const { logs } = await api('/admin/audit-logs');
    layoutApp(adminShell('audit-logs', 'Journal d\'audit', 'scroll-text', `
      <div class="fl-stats-line"><span class="fl-chip mute">${logs.length} entrées (500 max)</span>
        <span class="hint">Journal immuable — toute modification est tracée</span></div>
      ${adTable('<th>Date</th><th>Action</th><th>Entité</th><th>ID</th><th>Acteur</th><th>Détails</th>',
        logs.map(l => `<tr>
          <td class="hint">${adDate(l.created_at)}</td>
          <td><span class="fl-chip accent">${esc(l.action)}</span></td>
          <td>${esc(l.entity)}</td>
          <td class="hint">${l.entity_id ? esc(String(l.entity_id).slice(0, 8)) : '—'}</td>
          <td>${esc(l.actor_name || 'système')}</td>
          <td class="hint">${esc(typeof l.meta === 'string' ? l.meta : JSON.stringify(l.meta || {}))}</td>
        </tr>`).join(''))}`));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

const viewAdminStats = viewAdminDashboard;
function viewAdmin(kind) {
  if (kind === 'audit') return viewAdminAuditLogs();
  if (kind === 'notif') return viewAdminNotifications();
  return viewAdminUsers();
}