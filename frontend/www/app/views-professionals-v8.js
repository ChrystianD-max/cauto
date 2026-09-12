/* VUES PROFESSIONALS — Module professionnel et demande de service */
'use strict';

const PROFILE_LABELS = { STANDARD:'Standard', DIAGNOSTIC:'Diagnostic', EMERGENCY:'Urgence', MAINTENANCE:'Entretien', MOBILE:'Mobile', SPECIALIST:'Specialiste', FLEET:'Flotte' };
const PROFILE_ICONS = { STANDARD:'wrench', DIAGNOSTIC:'stethoscope', EMERGENCY:'zap', MAINTENANCE:'settings', MOBILE:'truck', SPECIALIST:'award', FLEET:'building' };
const SR_STATUS_LABELS = { CREATED:'Creee', MATCHING:'Recherche', PROFESSIONAL_SELECTED:'Pro selectionne', APPOINTMENT_CONFIRMED:'RDV confirme', VEHICLE_RECEIVED:'Vehicule recu', DIAGNOSTIC:'Diagnostic', QUOTE_PENDING:'Devis en attente', QUOTE_SENT:'Devis envoye', QUOTE_APPROVED:'Devis approuve', REPAIRING:'En reparation', QUALITY_CONTROL:'Controle qualite', COMPLETED:'Termine', PAID:'Paye', WARRANTY_ACTIVE:'Garantie active', CLOSED:'Cloturee' };
const QUOTE_STATUS = { PENDING:'En attente', APPROVED:'Approuve', REFUSE:'Refuse' };
const DISPUTE_STATUS = { OPEN:'Ouvert', IN_REVIEW:'En cours', RESOLVED:'Resolu', ESCALATED:'Escalade', CLOSED:'Cloture' };
const DAY_LABELS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const STEP_ICONS = ['wrench','file-text','check-circle','settings','shield-check','flag'];
const STEP_KEYS = ['VEHICLE_RECEIVED','DIAGNOSTIC','QUOTE_SENT','QUOTE_APPROVED','REPAIRING','QUALITY_CHECK','CLIENT_VALIDATION','CLOSED'];
const STEP_NAMES = ['Vehicule recu','Diagnostic','Devis envoye','Devis approuve','Travaux','Controle','Confirmation client','Termine'];

/* ====== HELPERS AFFICHAGE DATE/HEURE & DÉLAI ====== */
function fmtPrefDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDeadline(q) {
  if (!q || q.delay_days == null) return '';
  const base = q.approved_at || q.created_at;
  if (!base) return '';
  const d = new Date(new Date(base).getTime() + (Number(q.delay_days) || 0) * 86400000);
  if (isNaN(d.getTime())) return '';
  return ' · livraison estimée le ' + d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ====== 0. FIN DE PARCOURS : NOTATION + REMERCIEMENT (modules 61/62) ======
   Appelé une fois le client a confirmé la bonne réception : l'expérience C-AUTO
   se conclut par une notation de la prestation, puis une page de remerciement
   chic et animée. */
const COMPLETION_DIMS = [
  { key: 'quality_stars', label: 'Qualité du travail', icon: 'wrench' },
  { key: 'delay_stars', label: 'Respect des délais', icon: 'clock' },
  { key: 'communication_stars', label: 'Communication', icon: 'message-circle' },
  { key: 'transparency_stars', label: 'Transparence', icon: 'shield-check' },
  { key: 'price_stars', label: 'Rapport qualité-prix', icon: 'badge-euro' }
];
const STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

function starRow(name, current, interactive) {
  return `<div class="star-row${interactive ? ' interactive' : ''}" data-name="${name}">
    ${[1,2,3,4,5].map(n => `<button type="button" class="star ${current >= n ? 'lit' : ''}" data-v="${n}" aria-label="${n} étoile${n>1?'s':''}">${STAR_SVG}</button>`).join('')}
  </div>`;
}

function openCompletionRating({ interventionId, professionalId, serviceRequestId, vehicleLabel, proName }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal rating-modal" role="dialog" aria-modal="true">
      <div class="rating-step" id="rating-step-form">
        <div class="rating-hero">${I('heart-handshake')}</div>
        <div class="modal-head"><h3>Votre véhicule est rentré à bon port !</h3><button type="button" class="modal-x" data-close>${I('x')}</button></div>
        <p class="page-sub">Comment s'est passée votre expérience${proName ? ` avec <b>${esc(proName)}</b>` : ''}${vehicleLabel ? ` pour votre <b>${esc(vehicleLabel)}</b>` : ''} ?<br>Votre avis aide la communauté C-AUTO à faire confiance.</p>
        <div class="rating-overall">
          ${starRow('overall_stars', 0, true)}
          <span class="rating-caption" id="rating-caption">Touchez une étoile pour noter</span>
        </div>
        <div class="rating-dims">
          ${COMPLETION_DIMS.map(d => `<div class="rating-dim"><span class="rating-dim-label">${I(d.icon)} ${d.label}</span>${starRow(d.key, 0, true)}</div>`).join('')}
        </div>
        <label class="rating-comment">${I('message-square-text')} Votre commentaire (facultatif)
          <textarea name="comment" maxlength="2000" rows="3" placeholder="Racontez votre expérience… propreté, accueil, suivi, résultat…"></textarea>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-close>Plus tard</button>
          <button type="button" class="btn btn-primary" id="rating-submit">${I('send')} Envoyer mon avis</button>
        </div>
        <div class="rating-note">${I('lock')} Votre notation reste anonyme pour l'atelier.</div>
      </div>
      <div class="rating-step hidden" id="rating-step-thanks">
        <div class="thanks-check"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="none" stroke="var(--ok)" stroke-width="2.5"/><path class="thanks-path" fill="none" stroke="var(--ok)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" d="M14 27 L23 36 L39 18"/></svg></div>
        <div class="thanks-spark" id="thanks-spark"></div>
        <h2 class="thanks-title">Merci !</h2>
        <p class="thanks-sub">Votre avis a bien été pris en compte.<br>${vehicleLabel ? `Votre <b>${esc(vehicleLabel)}</b> est entre de bonnes mains.` : 'Bonne route !'}</p>
        <p class="thanks-message">Chaque retour rend le réseau C-AUTO plus fiable — et vous vient en aide.<br>À très vite sur la route. </p>
        <div class="thanks-facts">
          <span>${I('shield-check')} Passeport mis à jour</span>
          <span>${I('bell')} Garantie C-AUTO activée</span>
          <span>${I('map-pin')} Atelier remercié</span>
        </div>
        <button type="button" class="btn btn-primary" id="rating-done">${I('check')} Terminer</button>
      </div>
    </div>`;
  overlay.onclick = (ev) => { if (ev.target === overlay) return; if (ev.target.closest('[data-close]')) overlay.remove(); };
  document.body.appendChild(overlay);
  const entered = {};
  const paint = () => {
    const worst = Math.min(entered.overall_stars || 0, entered.quality_stars || 0, entered.delay_stars || 0, entered.communication_stars || 0, entered.transparency_stars || 0, entered.price_stars || 0);
    ['overall_stars','quality_stars','delay_stars','communication_stars','transparency_stars','price_stars'].forEach(k => {
      const val = k === 'overall_stars' ? (entered.overall_stars || 0) : (entered[k] || 0);
      const row = overlay.querySelector(`.star-row[data-name="${k}"]`);
      if (!row) return;
      row.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('lit', i < val));
    });
    const cap = overlay.querySelector('#rating-caption');
    if (cap) cap.textContent = ['Touchez une étoile pour noter','Peu satisfaisant','Moyen','Bien','Très bien','Excellent'][Math.min(entered.overall_stars || 0, 5)];
    const sub = overlay.querySelector('#rating-submit');
    if (sub) sub.disabled = !entered.overall_stars;
    if (worst === 0 && entered.overall_stars) { /* no-op: keep simple */ }
  };
  overlay.querySelectorAll('.star-row').forEach(row => {
    row.querySelectorAll('.star').forEach(star => {
      const key = row.dataset.name;
      const v = +star.dataset.v;
      star.onmouseenter = () => { row.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('lit', i < v)); };
      star.onmouseleave = () => paint();
      star.onclick = () => { entered[key] = entered[key] === v ? 0 : v; if (key === 'overall_stars') { COMPLETION_DIMS.forEach(d => { if (!entered[d.key]) entered[d.key] = v; }); } paint(); };
    });
  });
  paint();
  overlay.querySelector('#rating-submit').onclick = async () => {
    if (!entered.overall_stars) return toast('Choisissez au moins une note globale', 'warn');
    const comment = (overlay.querySelector('textarea[name="comment"]').value || '').trim();
    const body = { intervention_id: interventionId, overall_stars: entered.overall_stars, comment: comment || undefined };
    if (professionalId) body.professional_id = professionalId;
    if (serviceRequestId) body.service_request_id = serviceRequestId;
    COMPLETION_DIMS.forEach(d => { if (entered[d.key]) body[d.key] = entered[d.key]; });
    const sub = overlay.querySelector('#rating-submit');
    sub.disabled = true; sub.innerHTML = 'Envoi…';
    try {
      await api('/ratings', { method: 'POST', body });
      overlay.querySelector('#rating-step-form').classList.add('hidden');
      const thanks = overlay.querySelector('#rating-step-thanks');
      thanks.classList.remove('hidden');
      requestAnimationFrame(() => { thanks.classList.add('in'); });
      overlay.querySelector('#rating-done').onclick = () => overlay.remove();
    } catch (e) {
      sub.disabled = false; sub.innerHTML = `${I('send')} Envoyer mon avis`;
      toast(e.message || 'Envoi de l\'avis impossible', 'error');
    }
  };
  renderIcons();
}

/* ====== 0B. ATTESTATIONS : widget réutilisable (pro & fournisseur) ====== */
const VERIF_STATUS = { PENDING: { label: 'En attente de validation', cls: 'warn', icon: 'clock' }, UNVERIFIED: { label: 'Non soumis', cls: 'muted', icon: 'shield-off' }, VERIFIED: { label: 'Vérifié par C-AUTO', cls: 'ok', icon: 'badge-check' }, REJECTED: { label: 'Rejeté', cls: 'ko', icon: 'shield-x' } };
function verifBadge(status) { const s = VERIF_STATUS[status] || VERIF_STATUS.UNVERIFIED; return `<span class="badge badge-${s.cls}">${I(s.icon)} ${s.label}</span>`; }

function proVerifBanner(status) {
  if (status === 'VERIFIED') return `<div class="alert alert-ok">${I('badge-check')} <div><b>Profil vérifié par C-AUTO</b><p style="margin:.2rem 0 0">Votre dossier est validé : vous pouvez intervenir normalement sur la plateforme.</p></div></div>`;
  if (status === 'PENDING') return `<div class="alert alert-warn">${I('clock')} <div><b>Dossier envoyé — en attente de validation</b><p style="margin:.2rem 0 0">Votre synthèse a été transmise à l'équipe C-AUTO. Vous serez notifié dès la décision de validation.</p></div></div>`;
  if (status === 'REJECTED') return `<div class="alert alert-ko">${I('shield-x')} <div><b>Dossier rejeté</b><p style="margin:.2rem 0 0">Corrigez vos informations puis soumettez à nouveau votre dossier.</p></div></div>`;
  return `<div class="alert alert-info">${I('shield')} <div><b>Profil non soumis</b><p style="margin:.2rem 0 0">Complétez vos informations puis soumettez votre dossier pour validation par l'équipe C-AUTO.</p></div></div>`;
}

function attestationPanelHtml({ stored, readOnly }) {
  const chips = (stored || []).map(d => `
    <div class="att-chips${readOnly ? ' ro' : ''}" data-docid="${d.id}">
      <span class="att-icon">${d.kind === 'IMAGE' ? '<img loading="lazy" src="/api/documents/' + d.id + '/download?view=1" alt="">' : I('file-text')}</span>
      <span class="att-meta"><b>${esc(d.name || 'Attestation')}</b><small>${esc(d.description || '')}</small></span>
      ${readOnly ? '' : `<button type="button" class="att-remove" data-remove="${d.id}" aria-label="Retirer">${I('x')}</button>`}
    </div>`).join('');
  return `<div class="attestation-panel">
    ${!readOnly ? `<div class="att-drop" id="att-drop">
      ${I('shield-plus')} <span>Ajoutez vos attestations, certifications ou justificatifs (images, PDF)</span>
      <input type="file" id="att-files" multiple accept="image/*,.pdf" hidden>
    </div>` : ''}
    <div class="att-chips-wrap ${(stored||[]).length ? '' : 'empty'}">${chips || '<span class="hint">Aucune attestation déposée.</span>'}</div>
    ${!readOnly ? '<div class="att-status-line hidden" id="att-unsaved">' + I('info') + ' Modifications non enregistrées — cliquez sur « Enregistrer ».</div>' : ''}
  </div>`;
}

async function attestationPanelWire(root, { getStored, onSave, readOnly, refresh }) {
  if (readOnly) {
    root.querySelectorAll('.att-chips img').forEach(img => img.onerror = () => { img.closest('.att-chips').querySelector('.att-icon').innerHTML = '<i data-lucide="file-text" style="width:20px;height:20px"></i>'; renderIcons(); });
    return;
  }
  let docs = (getStored() || []).map(d => ({ ...d }));
  const wrapNode = root.querySelector('.att-chips-wrap');
  const drop = root.querySelector('#att-drop');
  const files = root.querySelector('#att-files');
  const unsaved = root.querySelector('#att-unsaved');
  const saveBtn = root.querySelector('[data-att-save]');
  const paint = () => {
    const items = docs.map(d => `
      <div class="att-chips" data-docid="${d.id}">
        <span class="att-icon">${d.kind === 'IMAGE' ? '<img loading="lazy" src="/api/documents/' + d.id + '/download?view=1" alt="">' : I('file-text')}</span>
        <span class="att-meta"><b>${esc(d.name || 'Attestation')}</b><small>${esc(d.description || '')}</small></span>
        <button type="button" class="att-remove" data-remove="${d.id}" aria-label="Retirer">${I('x')}</button>
      </div>`).join('');
    wrapNode.classList.toggle('empty', !docs.length);
    wrapNode.innerHTML = items || '<span class="hint">Aucune attestation déposée.</span>';
    wrapNode.querySelectorAll('.att-chips img').forEach(img => img.onerror = () => { img.closest('.att-chips').querySelector('.att-icon').innerHTML = '<i data-lucide="file-text" style="width:20px;height:20px"></i>'; renderIcons(); });
    wrapNode.querySelectorAll('[data-remove]').forEach(btn => btn.onclick = async () => {
      const id = btn.dataset.remove;
      try { await api('/documents/' + id, { method: 'DELETE' }); } catch (_) {}
      docs = docs.filter(d => d.id !== id);
      paint();
      if (unsaved) unsaved.classList.remove('hidden');
      if (saveBtn) saveBtn.disabled = docs.length === 0;
    });
    renderIcons();
  };
  paint();
  const uploadOne = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', 'DOCUMENT');
    fd.append('entity_type', 'PROFILE');
    fd.append('visibility', 'private');
    fd.append('name', file.name.replace(/\.[^.]+$/, ''));
    const isImg = (file.type || '').startsWith('image/');
    const r = await api('/documents', { method: 'POST', body: fd });
    const doc = r.document || r;
    return { id: doc.id, name: doc.original_name || file.name, description: isImg ? 'image/' + (file.type.split('/')[1] || '') : (file.type || ''), kind: isImg ? 'IMAGE' : 'FILE' };
  };
  drop.onclick = () => files.click();
  files.onchange = async () => {
    const picked = Array.from(files.files || []);
    if (!picked.length) return;
    const addBtn = drop; addBtn.classList.add('busy'); const _ic = addBtn.querySelector('i, svg'); if (_ic) _ic.outerHTML = '<span class="mloader"></span>';
    try {
      for (const f of picked) { try { docs.push(await uploadOne(f)); } catch (e) { toast((e.message || 'Attestation non chargée') + ' (' + f.name + ')', 'error'); } }
      paint();
      if (unsaved) unsaved.classList.remove('hidden');
      if (saveBtn) saveBtn.disabled = docs.length === 0;
    } finally { files.value = ''; addBtn.classList.remove('busy'); paint(); renderIcons(); }
  };
  if (drop) {
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('hover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault(); drop.classList.remove('hover');
      const picked = Array.from(e.dataTransfer.files || []);
      for (const f of picked) { try { docs.push(await uploadOne(f)); } catch (err2) { toast((err2.message || 'Attestation non chargée') + ' (' + f.name + ')', 'error'); } }
      paint(); if (unsaved) unsaved.classList.remove('hidden');
      if (saveBtn) saveBtn.disabled = docs.length === 0;
    });
  }
  if (saveBtn) {
    saveBtn.onclick = async () => {
      if (!docs.length) return;
      saveBtn.disabled = true;
      try {
        await onSave(docs.map(d => d.id));
        unsaved.classList.add('hidden');
        toast('Attestations enregistrées — votre profil est en attente de vérification', 'success');
        if (refresh) refresh();
      } catch (e) { saveBtn.disabled = false; toast((e.message || 'Enregistrement impossible'), 'error'); }
    };
  }
}

/* ====== 1. LISTE DES PROFESSIONNELS ====== */
async function viewProfessionals() {
  showLoading();
  try {
    const { professionals } = await api('/professionals');
    layoutApp(`
    <div class="page-top"><h1>${I('users')} Professionnels</h1></div>
    <div class="card" style="margin-bottom:1rem">
      <form id="f-filter-pro" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end">
        <label style="flex:1;min-width:180px;margin:0">${I('search')} Recherche
          <input name="q" placeholder="Nom, specialite...">
        </label>
        <label style="margin:0">${I('map-pin')} Ville
          <select name="city"><option value="">Toutes</option></select>
        </label>
        <label style="margin:0">${I('briefcase')} Profil
          <select name="profile_type"><option value="">Tous</option>${Object.entries(PROFILE_LABELS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select>
        </label>
        <label style="margin:0">${I('arrow-up-down')} Tri
          <select name="sort"><option value="rating">Note</option><option value="distance">Distance</option><option value="name">Nom</option></select>
        </label>
        <button type="submit" class="btn btn-sm">${I('search')} Filtrer</button>
      </form>
    </div>
    <div id="pros-grid" class="grid-cards">
      ${renderProsList(professionals)}
    </div>
    `);
    const cities = [...new Set(professionals.map(p => p.city).filter(Boolean))];
    const citySel = document.querySelector('[name=city]');
    cities.sort().forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; citySel.appendChild(o); });
    document.getElementById('f-filter-pro').onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const o = Object.fromEntries(new FormData(ev.target));
        const params = new URLSearchParams();
        if (o.q) params.set('q', o.q);
        if (o.city) params.set('city', o.city);
        if (o.profile_type) params.set('profile_type', o.profile_type);
        if (o.sort) params.set('sort', o.sort);
        const d = await api('/professionals?' + params.toString());
        document.getElementById('pros-grid').innerHTML = renderProsList(d.professionals);
        renderIcons();
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

function renderProsList(pros) {
  if (!pros.length) return '<div class="empty-state">' + I('search-x') + '<h3>Aucun professionnel</h3><p>Modifiez vos filtres.</p></div>';
  return pros.map(p => {
    const stars = '★'.repeat(Math.round(p.rating || 0)) + '☆'.repeat(5 - Math.round(p.rating || 0));
    const pct = p.satisfaction_rate != null ? Math.round(p.satisfaction_rate) : null;
    return `<a href="#/professionals/${p.id}" class="card veh-card-link">
      <div class="veh-card-header">
        <div class="veh-card-icon">${I(PROFILE_ICONS[p.profile_type] || 'user')}</div>
        <span class="badge badge-accent">${esc(PROFILE_LABELS[p.profile_type] || p.profile_type || '')}</span>
      </div>
      <h3>${esc(p.professional_name || p.name || '')}${p.is_certified ? certBadge() : ''}</h3>
      <div class="hint">${esc(p.city || '')} · ${esc(p.specialty || '')}</div>
      <div style="margin-top:0.3rem;font-size:0.85rem;color:var(--muted)">${stars} <span class="hint">${Number(p.rating || 0).toFixed(1)}/5</span></div>
      <div style="margin-top:0.3rem;font-size:0.82rem;color:var(--muted)">
        ${pct != null ? `<span>${I('heart')} Satisfait: ${pct}%</span>` : ''}
        ${p.services_count != null ? ` · <span>${I('list')} ${p.services_count} service(s)</span>` : ''}
      </div>
    </a>`;
  }).join('');
}

/* ====== 2. DETAIL PROFESSIONNEL ====== */
async function viewProfessionalDetail(id) {
  showLoading();
  try {
    const d = await api('/professionals/' + id);
    const p = d.professional || d;
    const stars = '★'.repeat(Math.round(p.rating || 0)) + '☆'.repeat(5 - Math.round(p.rating || 0));
    let hoursHtml = '';
    if (p.hours && typeof p.hours === 'object') {
      const days = Object.keys(p.hours);
      hoursHtml = days.map(day => {
        const info = p.hours[day];
        if (!info || info.closed) return '';
        return `<div style="display:flex;justify-content:space-between;padding:0.2rem 0;font-size:0.85rem"><span>${esc(day)}</span><span class="hint">${esc(info.open || '')} - ${esc(info.close || '')}</span></div>`;
      }).filter(Boolean).join('');
    }
    const services = p.services || d.services || [];
    const brands = p.brands || d.brands || [];
    const certifications = p.certifications || d.certifications || [];
    const ratings = p.ratings || d.ratings || [];

    layoutApp(`
    <a href="#/professionals" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux professionnels</a>
    <div class="page-top"><h1>${I(PROFILE_ICONS[p.profile_type] || 'user')} ${esc(p.professional_name || p.name || '')}${p.is_certified ? certBadge() : ''}</h1></div>
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center">
        <div style="font-size:1.3rem;color:var(--muted)">${stars} <span style="font-size:0.9rem">${Number(p.rating || 0).toFixed(1)}/5</span></div>
        <div><span class="hint">${I('map-pin')} ${esc(p.city || '')}</span></div>
        <div><span class="badge badge-accent">${esc(p.specialty || '')}</span></div>
      </div>
    </div>
    <div class="detail-grid">
      <div class="card"><div class="detail-label">Adresse</div><div class="detail-value">${esc(p.address || 'Non renseignee')}</div></div>
      <div class="card"><div class="detail-label">Telephone</div><div class="detail-value">${esc(p.phone || 'Non renseigne')}</div></div>
      ${hoursHtml ? `<div class="card" style="grid-column:1/-1"><div class="detail-label">Horaires</div><div>${hoursHtml}</div></div>` : ''}
      ${p.experience_years != null ? `<div class="card"><div class="detail-label">Experience</div><div class="detail-value">${p.experience_years} ans</div></div>` : ''}
      ${p.satisfaction_rate != null ? `<div class="card"><div class="detail-label">Satisfaction</div><div class="detail-value">${Math.round(p.satisfaction_rate)}%</div></div>` : ''}
      ${p.return_rate != null ? `<div class="card"><div class="detail-label">Taux de retour</div><div class="detail-value">${Math.round(p.return_rate)}%</div></div>` : ''}
      ${p.complaint_rate != null ? `<div class="card"><div class="detail-label">Taux de reclamations</div><div class="detail-value">${Math.round(p.complaint_rate)}%</div></div>` : ''}
    </div>

    <div class="tab-bar" id="pro-tabs" style="margin-top:1rem">
      <a href="#" data-tab="services" class="active">${I('wrench')} Services</a>
      <a href="#" data-tab="brands">${I('tag')} Marques</a>
      <a href="#" data-tab="certs">${I('award')} Certifications</a>
      <a href="#" data-tab="reviews">${I('star')} Avis</a>
    </div>
    <div id="pro-tab-content"></div>

    <div style="text-align:center;margin-top:1.5rem;display:flex;gap:0.6rem;justify-content:center;flex-wrap:wrap">
      ${(S.user && p.user_id && S.user.id !== p.user_id) ? `<button type="button" class="btn btn-ghost" id="btn-chat-pro">${I('message-square')} Contacter</button>` : ''}
      <a href="#/service-requests/new?professional_id=${id}" class="btn btn-primary">${I('file-text')} Demander un devis</a>
    </div>
    `);

    function renderProTab(tab) {
      const el = document.getElementById('pro-tab-content');
      document.querySelectorAll('#pro-tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
      if (tab === 'services') {
        el.innerHTML = services.length ? `<div class="card" style="margin-top:1rem"><h3>${I('wrench')} Services propose(s)</h3>${services.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">
            <span style="font-size:0.88rem">${esc(s.name || s.label || '')}</span>
            <span class="badge badge-accent">${s.price_cents != null ? money(s.price_cents) : (s.price || 'Sur devis')}</span>
          </div>`).join('')}</div>` : '<div class="card" style="margin-top:1rem"><p class="hint">Aucun service enregistre.</p></div>';
      } else if (tab === 'brands') {
        el.innerHTML = brands.length ? `<div class="card" style="margin-top:1rem"><h3>${I('tag')} Marques specialisees</h3><div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.5rem">${brands.map(b => `<span class="badge badge-accent">${esc(typeof b === 'string' ? b : (b.name || ''))}</span>`).join('')}</div></div>` : '<div class="card" style="margin-top:1rem"><p class="hint">Aucune marque renseignee.</p></div>';
      } else if (tab === 'certs') {
        el.innerHTML = certifications.length ? `<div class="card" style="margin-top:1rem"><h3>${I('award')} Certifications</h3>${certifications.map(c => `
          <div style="padding:0.5rem 0;border-bottom:1px solid var(--border)">
            <div style="font-size:0.88rem;font-weight:600">${esc(c.name || c.title || '')}</div>
            <div class="hint" style="font-size:0.82rem">${esc(c.issuer || '')}${c.obtained_at ? ' · ' + new Date(c.obtained_at).toLocaleDateString('fr') : ''}</div>
          </div>`).join('')}</div>` : '<div class="card" style="margin-top:1rem"><p class="hint">Aucune certification.</p></div>';
      } else if (tab === 'reviews') {
        el.innerHTML = ratings.length ? ratings.map(r => `
          <div class="card" style="margin-bottom:0.5rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
              <div style="font-size:1.1rem;color:var(--muted)">${'★'.repeat(Math.round(r.score || r.overall || 0))}${'☆'.repeat(5 - Math.round(r.score || r.overall || 0))}</div>
              <span class="hint">${r.created_at ? new Date(r.created_at).toLocaleDateString('fr') : ''}</span>
            </div>
            ${r.comment ? `<p style="font-size:0.88rem;margin:0.3rem 0">${esc(r.comment)}</p>` : ''}
          </div>`).join('') : '<div class="card" style="margin-top:1rem"><p class="hint">Aucun avis pour le moment.</p></div>';
      }
      renderIcons();
    }
    renderProTab('services');
    const btnChatPro = document.getElementById('btn-chat-pro');
    if (btnChatPro) btnChatPro.onclick = () => startChatWith(p.user_id, p.professional_name || p.name || 'Ce professionnel');
    document.querySelectorAll('#pro-tabs a').forEach(a => {
      a.onclick = (ev) => { ev.preventDefault(); renderProTab(a.dataset.tab); };
    });
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== 3. LISTE DEMANDES DE SERVICE ====== */
async function viewServiceRequests() {
  showLoading();
  try {
    const { service_requests } = await api('/service-requests');
    layoutApp(`
    <div class="page-top"><h1>${I('file-text')} Mes demandes de service</h1><a href="#/service-requests/new" class="btn btn-primary">${I('plus')} Nouvelle demande</a></div>
    <div class="card" style="margin-bottom:1rem">
      <form id="f-filter-sr" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end">
        <label style="margin:0">${I('filter')} Statut
          <select name="status"><option value="">Tous</option>${Object.entries(SR_STATUS_LABELS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select>
        </label>
        <button type="submit" class="btn btn-sm">${I('search')} Filtrer</button>
      </form>
    </div>
    <div id="sr-grid" class="grid-cards">
      ${renderSRList(service_requests)}
    </div>
    `);
    document.getElementById('f-filter-sr').onsubmit = (ev) => { ev.preventDefault(); applyStatusFilter('f-filter-sr', 'sr-grid', '/service-requests', (d) => renderSRList(d.service_requests)); };
    document.getElementById('f-filter-sr').elements.status.onchange = () => applyStatusFilter('f-filter-sr', 'sr-grid', '/service-requests', (d) => renderSRList(d.service_requests));
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

async function applyStatusFilter(formId, gridId, apiPath, renderFn) {
  try {
    const form = document.getElementById(formId);
    const o = Object.fromEntries(new FormData(form));
    const params = new URLSearchParams();
    if (o.status) params.set('status', o.status);
    const d = await api(apiPath + '?' + params.toString());
    document.getElementById(gridId).innerHTML = renderFn(d);
    renderIcons();
  } catch (e) { toast(e.message, 'error'); }
}

function renderSRList(srs) {
  if (!srs.length) return '<div class="empty-state">' + I('file-text') + '<h3>Aucune demande</h3><p>Creez une nouvelle demande de service.</p></div>';
  return srs.map(sr => `
    <a href="#/service-requests/${sr.id}" class="card veh-card-link">
      <div class="veh-card-header">
        <div class="veh-card-icon">${I('car')}</div>
        ${statusBadge(sr.status)}
      </div>
      <h3>${esc(sr.vehicle_make || '')} ${esc(sr.vehicle_model || '')}</h3>
      <p class="hint" style="margin:0.3rem 0;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sr.problem_description || '')}</p>
      <div class="hint" style="font-size:0.8rem">${I('calendar')} ${sr.created_at ? new Date(sr.created_at).toLocaleDateString('fr') : ''}</div>
    </a>`).join('');
}

/* ====== 4. NOUVELLE DEMANDE DE SERVICE ====== */
async function viewServiceRequestNew() {
  showLoading();
  try {
    const { vehicles } = await api('/vehicles');
    const urlParams = new URLSearchParams(location.hash.split('?')[1] || '');
    const preselectedPro = urlParams.get('professional_id') || '';
    const preselectVehicle = urlParams.get('vehicle_id') || '';
    const preselectCategory = (urlParams.get('category') || '').toLowerCase();
    const preselectProblem = urlParams.get('problem_description') || '';
    layoutApp(`
    <a href="#/service-requests" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux demandes</a>
    <div class="section-title" style="margin-bottom:1rem">${I('file-text')} Nouvelle demande de service</div>
    <div class="card" style="max-width:700px">
      <form id="f-new-sr">
        <label>${I('car')} Vehicule *
          <select name="vehicle_id" required>${vehicles.map(v => `<option value="${v.id}" ${preselectVehicle&&v.id===preselectVehicle?'selected':''}>${esc(v.make)} ${esc(v.model)} (${esc(v.plate)})</option>`).join('')}</select>
        </label>
        <label>${I('message-square')} Description du probleme *
          <textarea name="problem_description" rows="4" required placeholder="Decrivez le probleme rencontre...">${esc(preselectProblem)}</textarea>
        </label>
        <label>${I('tag')} Categorie *
          <select name="category" required>
            <option value="Mecanique">Mecanique</option>
            <option value="Freinage">Freinage</option>
            <option value="Electrique">Electrique</option>
            <option value="Diagnostic">Diagnostic</option>
            <option value="Carrosserie">Carrosserie</option>
            <option value="Climatisation">Climatisation</option>
            <option value="Pneumatique">Pneumatique</option>
            <option value="Autre">Autre</option>
          </select>
        </label>
        <label>${I('alert-triangle')} Urgence *
          <select name="urgency" required>
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent</option>
            <option value="CRITIQUE">Critique</option>
          </select>
        </label>
        <label>${I('calendar')} Date et heure souhaitées
          <input name="preferred_date" type="datetime-local">
        </label>
        ${preselectedPro ? `<input type="hidden" name="professional_id" value="${esc(preselectedPro)}">` : ''}
        <button type="submit" style="margin-top:0.5rem">${I('send')} Envoyer la demande</button>
      </form>
    </div>
    `);
    if (preselectCategory) {
      const catSel = document.querySelector('#f-new-sr [name=category]');
      const opt = catSel && Array.from(catSel.options).find(o => o.value.toLowerCase() === preselectCategory);
      if (opt) opt.selected = true;
    }
    document.getElementById('f-new-sr').onsubmit = async (ev) => {
      ev.preventDefault();
      const o = Object.fromEntries(new FormData(ev.target));
      const body = {
        vehicle_id: o.vehicle_id,
        problem_description: o.problem_description,
        category: o.category,
        urgency: o.urgency,
        preferred_date: o.preferred_date || null
      };
      if (o.professional_id) body.professional_id = o.professional_id;
      try {
        const d = await api('/service-requests', { method: 'POST', body });
        toast('Demande creee', 'success');
        location.hash = '#/service-requests/' + d.service_request.id;
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== 5. DETAIL DEMANDE DE SERVICE ====== */
async function viewServiceRequestDetail(id) {
  showLoading();
  try {
    const d = await api('/service-requests/' + id);
    const sr = d.service_request || d;
    const matchedPros = sr.matched_professionals || [];
    const history = d.history || [];

    let actionCard = '';
    let quoteSrId = null;

    if (sr.status === 'CREATED' || sr.status === 'MATCHING') {
      actionCard = `
        <div class="card" style="margin-bottom:1rem">
          <h3 style="margin:0 0 .4rem">${I('search')} Prochaines étapes</h3>
          <p class="hint" style="margin:0 0 .8rem">Lancez la recherche du meilleur professionnel, puis choisissez l'atelier qui prendra en charge votre véhicule.</p>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-match-sr">${I('search')} Lancer la recherche de pro</button>
            <button class="btn btn-ghost btn-ko" id="btn-cancel-sr">${I('x')} Annuler la demande</button>
          </div>
        </div>`;
    }

    if (sr.status === 'VEHICLE_RECEIVED') {
      actionCard = `
        ${renderReceptionCard(sr, { collabLabel: sr.professional_name || 'L\'atelier' })}
        <div class="card" style="margin-bottom:1rem;border:1px solid rgba(245,158,11,.35)">
          <h3 style="margin:0 0 .4rem">${I('clipboard-check')} Vérifiez la fiche de réception</h3>
          <p class="hint" style="margin:0 0 .8rem">L'atelier a réceptionné votre véhicule. Vérifiez que le VIN, le kilométrage et l'état constaté correspondent, puis validez pour autoriser le diagnostic.</p>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-validate-reception">${I('check')} Valider la réception & autoriser le diagnostic</button>
            <button class="btn btn-ghost btn-ko" id="btn-dispute-reception">${I('x')} Signaler un écart</button>
          </div>
        </div>`;
    }

    if (sr.status === 'RECEPTION_VALIDATED') {
      actionCard = `
        ${renderReceptionCard(sr, { collabLabel: sr.professional_name || 'L\'atelier' })}
        <div class="alert alert-ok">${I('check-circle')}<div><b>Réception validée</b><p style="margin:.2rem 0 0">Le professionnel va maintenant réaliser le diagnostic de votre véhicule. Vous recevrez un devis ensuite.</p></div></div>`;
    }

    if (['DIAGNOSIS','QUOTE_PENDING','QUOTE_SENT','QUOTE_APPROVED','REPAIRING','QUALITY_CONTROL','COMPLETED','PAID','WARRANTY_ACTIVE','CLOSED'].includes(sr.status)) {
      actionCard = renderReceptionCard(sr, { collabLabel: sr.professional_name || 'L\'atelier' });
      if (sr.status === 'DIAGNOSIS') {
        actionCard += `<div class="alert alert-info">${I('search')}<div><b>Diagnostic en cours</b><p style="margin:.2rem 0 0">L'atelier analyse votre véhicule. Un devis détaillé vous sera soumis avant toute intervention.</p></div></div>`;
      }
      if (sr.status === 'QUOTE_PENDING' || sr.status === 'QUOTE_SENT') {
        const ql = await api('/quotes?intervention_id=' + (sr.intervention_id || '')).catch(() => ({ quotes: [] }));
        const first = (ql.quotes || [])[0];
        if (first) {
          quoteSrId = first.id;
          let qd = { quote: null };
          try { qd = await api('/quotes/' + first.id); } catch (_e) {}
          const quote = qd.quote || qd;
          const items = quote.items || [];
          const rows = items.map(it => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:0.35rem 0" data-label="Element">${esc(it.label || '')}</td>
            <td data-label="Type"><span class="badge badge-muted">${esc(it.kind || '')}</span></td>
            <td data-label="Qte">${it.qty || 1}</td>
            <td data-label="Total" style="font-weight:600">${money(Math.round((it.qty || 1) * (it.unit_price_cents || 0)))}</td>
          </tr>`).join('');
          actionCard += `
          <div class="card" style="margin-top:0.6rem;border:1px solid rgba(245,158,11,.35)">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.3rem">
              <h3 style="margin:0">${I('receipt')} Devis proposé par ${esc(sr.professional_name || 'l\'atelier')}</h3>
              ${statusBadge(quote.status || 'PENDING')}
            </div>
            <table class="quote-table" style="width:100%;font-size:0.86rem">
              <tr class="qt-head" style="border-bottom:2px solid var(--border);text-align:left;color:var(--muted);font-size:0.72rem">
                <th style="padding:0.3rem 0">Elément</th><th>Type</th><th>Qte</th><th style="text-align:right">Total</th>
              </tr>
              ${rows}
              <tr class="qt-total" style="font-weight:700;border-top:2px solid var(--border)">
                <td colspan="3" style="padding:0.4rem 0">TOTAL${quote.delay_days != null ? ' · délai estimé ' + quote.delay_days + 'j' : ''}${fmtDeadline(quote)}${quote.warranty_months != null ? ' · garantie ' + quote.warranty_months + ' mois' : ''}</td>
                <td data-label="Total" style="text-align:right">${money(quote.total_cents || 0)}</td>
              </tr>
            </table>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem">
              <button class="btn btn-primary" id="btn-approve-quote-sr">${I('check-circle')} Approuver le devis</button>
              <button class="btn btn-ko" id="btn-refuse-quote-sr">${I('x')} Refuser</button>
              <a href="#/quotes/${first.id}" class="btn btn-ghost">${I('eye')} Consulter le détail</a>
            </div>
          </div>`;
        } else {
          actionCard += `<div class="alert alert-warn">${I('receipt')}<div><b>Devis en attente</b><p style="margin:0.2rem 0 0">L'atelier prépare votre devis — il s'affichera ici dès sa soumission.</p></div></div>`;
        }
      }
      if (sr.status === 'QUOTE_APPROVED') {
        actionCard += `<div class="alert alert-ok">${I('check-circle')}<div><b>Devis approuvé</b><p style="margin:.2rem 0 0">Les réparations ont démarré chez ${esc(sr.professional_name || 'l\'atelier')}.</p></div></div>`;
      }
      if (sr.status === 'QUALITY_CONTROL') {
        actionCard += `
        <div class="card" style="margin-top:.6rem;border:1px solid rgba(16,185,129,.35)">
          <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem">
            ${I('package-check')} <h3 style="margin:0">Récupération du véhicule</h3>
          </div>
          <p class="hint" style="margin:0 0 .8rem">Contrôle qualité validé — votre véhicule vous attend. Confirmez la bonne réception pour clôturer le dossier.</p>
          ${sr.intervention_id ? `<div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-ok" id="btn-confirm-pickup-sr">${I('check-circle')} Je confirme la bonne réception</button>
            <button class="btn btn-ghost btn-ko" id="btn-dispute-pickup-sr">${I('alert-triangle')} Signaler un problème</button>
          </div>` : '<p class="hint">Un lien vers la réparation est nécessaire pour confirmer.</p>'}
</div>`;
      }
    }

    layoutApp(`
    <a href="#/service-requests" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour à mes demandes</a>
    <div class="page-top"><h1>${I('file-text')} Demande de service</h1><div>${statusBadge(sr.status)}</div></div>
    ${renderSrWorkflow(sr.status)}

    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;align-items:center">
        <div>
          <h3>${I('car')} ${esc(sr.make || sr.vehicle_make || '')} ${esc(sr.model || sr.vehicle_model || '')}</h3>
          <div class="hint">${esc(sr.plate || sr.vehicle_plate || '')} ${sr.year ? '· ' + esc(sr.year) : ''}</div>
        </div>
        <div class="hint" style="text-align:right">${I('calendar')} Demande du ${sr.created_at ? new Date(sr.created_at).toLocaleString('fr') : ''}</div>
      </div>
      <div class="rec-section">
        <h4>${I('alert-triangle')} Motif d'intervention</h4>
        <p style="margin:0;font-size:0.9rem">${esc(sr.problem_description || '')}</p>
      </div>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:.6rem">
        ${sr.category ? `<span class="badge badge-accent">${esc(sr.category)}</span>` : ''}
        ${sr.urgency ? `<span class="badge badge-${sr.urgency==='CRITIQUE'?'ko':sr.urgency==='URGENT'?'warn':'ok'}">${esc(sr.urgency)}</span>` : ''}
        ${sr.preferred_date ? `<span class="badge badge-muted">${I('calendar')} Préféré : ${esc(fmtPrefDate(sr.preferred_date))}</span>` : ''}
      </div>
    </div>

    ${sr.professional_id && sr.professional_name ? `
    <div class="card" style="margin-bottom:1rem;border-left:4px solid var(--accent)">
      <h3>${I('user')} Atelier sélectionné</h3>
      <div style="margin-top:0.3rem"><b>${esc(sr.professional_name)}</b> · ${esc(sr.professional_specialty || '')}</div>
      <a href="#/professionals/${sr.professional_id}" class="btn btn-sm btn-ghost" style="margin-top:0.3rem">${I('external-link')} Voir le profil</a>
    </div>` : ''}

    ${matchedPros.length && !sr.professional_id ? `
    <div class="card" style="margin-bottom:1rem">
      <h3 style="margin:0 0 .6rem">${I('users')} Professionnels proposés</h3>
      <p class="hint" style="margin:0 0 .6rem">Sélectionnez l'atelier qui prendra en charge votre véhicule. Votre choix est définitif pour cette demande.</p>
      ${matchedPros.map(mp => `
        <div class="card" style="margin:0 0 .5rem">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
            <div>
              <b>${esc(mp.professional_name || mp.name || '')}${mp.is_certified ? certBadge() : ''}</b>
              <div class="hint">${esc(mp.specialty || '')} ${mp.match_score != null ? '<span class="chip accent">Score ' + mp.match_score + '/100</span>' : ''}</div>
            </div>
            <button class="btn btn-sm btn-select-pro" data-pro-id="${mp.professional_id || mp.id}">${I('check')} Sélectionner</button>
          </div>
        </div>`).join('')}
    </div>` : ''}

    ${actionCard}

    ${history.length ? `
    <div class="card" style="margin-bottom:1rem">
      <h3 style="margin:0 0 .6rem">${I('clock')} Historique de la demande</h3>
      <div class="timeline" style="margin-top:0.5rem">${history.map(h => `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-card card">
            <div class="timeline-date">${h.created_at ? new Date(h.created_at).toLocaleString('fr') : ''}</div>
            <p style="margin:0;font-size:0.88rem">${esc(h.notes || '')}</p>
          </div>
        </div>`).join('')}</div>
    </div>` : ''}
    `);

    document.querySelectorAll('.btn-select-pro').forEach(btn => {
      btn.onclick = async () => {
        try {
          await api('/service-requests/' + id + '/select', { method: 'POST', body: { professional_id: btn.dataset.proId } });
          toast('Atelier sélectionné', 'success');
          viewServiceRequestDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    });
    const matchBtn = document.getElementById('btn-match-sr');
    if (matchBtn) {
      matchBtn.onclick = async () => {
        try {
          await api('/service-requests/' + id + '/match', { method: 'POST', body: {} });
          toast('Recherche lancée', 'success');
          viewServiceRequestDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const cancelBtn = document.getElementById('btn-cancel-sr');
    if (cancelBtn) {
      cancelBtn.onclick = async () => {
        if (!(await UX.confirm('Annuler cette demande ?'))) return;
        try {
          await api('/service-requests/' + id + '/cancel', { method: 'POST', body: { reason: 'Annulé par le client' } });
          toast('Demande annulée', 'success');
          location.hash = '#/service-requests';
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const validateRec = document.getElementById('btn-validate-reception');
    if (validateRec) {
      validateRec.onclick = async () => {
        if (!(await UX.confirm('Confirmez-vous que la fiche de réception correspond à l\'état de votre véhicule ?'))) return;
        try {
          await api('/service-requests/' + id + '/validate-reception', { method: 'POST', body: {} });
          toast('Réception validée. Le diagnostic peut commencer.', 'success');
          viewServiceRequestDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const disputeRec = document.getElementById('btn-dispute-reception');
    if (disputeRec) {
      disputeRec.onclick = async () => {
        const msg = await UX.prompt('Décrivez l\'écart constaté :');
        if (msg === null) return;
        try {
          await api('/disputes', { method: 'POST', body: { subject: 'Écart sur réception de ' + (sr.plate || 'véhicule'), description: msg, service_request_id: id } });
          toast('Écart signalé — le litige a été ouvert', 'info');
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const confirmPickupSr = document.getElementById('btn-confirm-pickup-sr');
    if (confirmPickupSr) {
      confirmPickupSr.onclick = async () => {
        if (!(await UX.confirm('Confirmez-vous avoir récupéré votre véhicule en bon état ? Cette action clôturera le dossier.'))) return;
        try {
          await api('/repairs/' + sr.intervention_id + '/client-confirm', { method: 'POST', body: { received_ok: true } });
          await viewServiceRequestDetail(id);
          openCompletionRating({
            interventionId: sr.intervention_id,
            professionalId: sr.professional_id,
            serviceRequestId: sr.id,
            vehicleLabel: (sr.vehicle_make ? sr.vehicle_make + ' ' + (sr.vehicle_model || '') + ' · ' : '') + (sr.plate || ''),
            proName: sr.professional_name
          });
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const disputePickupSr = document.getElementById('btn-dispute-pickup-sr');
    if (disputePickupSr) {
      disputePickupSr.onclick = async () => {
        const msg = await UX.prompt('Décrivez le problème constaté à la réception :');
        if (msg === null || !msg.trim()) return;
        try {
          await api('/disputes', { method: 'POST', body: { subject: 'Problème à la réception du véhicule ' + (sr.plate || ''), description: msg.trim(), intervention_id: sr.intervention_id } });
          toast('Problème signalé — votre litige a été ouvert', 'info');
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const approveQuoteSr = document.getElementById('btn-approve-quote-sr');
    if (approveQuoteSr) {
      approveQuoteSr.onclick = async () => {
        if (!quoteSrId) return toast('Devis introuvable — recharger la page', 'error');
        try {
          await api('/quotes/' + quoteSrId + '/approve', { method: 'POST' });
          toast('Devis approuvé — les travaux vont démarrer', 'success');
          viewServiceRequestDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const refuseQuoteSr = document.getElementById('btn-refuse-quote-sr');
    if (refuseQuoteSr) {
      refuseQuoteSr.onclick = async () => {
        if (!quoteSrId) return toast('Devis introuvable — recharger la page', 'error');
        const motif = await UX.prompt('Motif du refus :');
        if (motif === null || !motif.trim()) return;
        try {
          await api('/quotes/' + quoteSrId + '/refuse', { method: 'POST', body: { reason: motif.trim() } });
          toast('Devis refusé', 'success');
          viewServiceRequestDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== 6. LISTE DES DEVIS ====== */
async function viewQuotes() {
  showLoading();
  try {
    const { quotes } = await api('/quotes');
    layoutApp(`
    <div class="page-top"><h1>${I('receipt')} Mes devis</h1></div>
    <div class="card" style="margin-bottom:1rem">
      <form id="f-filter-quotes" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end">
        <label style="margin:0">${I('filter')} Statut
          <select name="status"><option value="">Tous</option>${Object.entries(QUOTE_STATUS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select>
        </label>
        <button type="submit" class="btn btn-sm">${I('search')} Filtrer</button>
      </form>
    </div>
    <div id="quotes-grid" class="grid-cards">
      ${renderQuotesList(quotes)}
    </div>
    `);
    document.getElementById('f-filter-quotes').onsubmit = (ev) => { ev.preventDefault(); applyStatusFilter('f-filter-quotes', 'quotes-grid', '/quotes', (d) => renderQuotesList(d.quotes)); };
    document.getElementById('f-filter-quotes').elements.status.onchange = () => applyStatusFilter('f-filter-quotes', 'quotes-grid', '/quotes', (d) => renderQuotesList(d.quotes));
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

function renderQuotesList(quotes) {
  if (!quotes.length) return '<div class="empty-state">' + I('receipt') + '<h3>Aucun devis</h3><p>Les devis apparaissent ici.</p></div>';
  return quotes.map(q => `
    <a href="#/quotes/${q.id}" class="card veh-card-link">
      <div class="veh-card-header">
        <div class="veh-card-icon">${I('receipt')}</div>
        ${statusBadge(q.status)}
      </div>
      <h3>${esc(q.vehicle_make || '')} ${esc(q.vehicle_model || '')}</h3>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.3rem">
        <div class="hint">${I('calendar')} ${q.created_at ? new Date(q.created_at).toLocaleDateString('fr') : ''}</div>
        <div style="font-weight:700;color:var(--accent)">${money(q.total_cents || 0)}</div>
      </div>
    </a>`).join('');
}

/* ====== 7. DETAIL DEVIS ====== */
async function viewQuoteDetail(id) {
  showLoading();
  try {
    const d = await api('/quotes/' + id);
    const q = d.quote || d;
    const items = q.items || [];
    const evidences = q.evidences || [];

    let actionsHtml = '';
    if (q.status === 'PENDING' && S.user && S.user.role === 'CLIENT') {
      const remiseApplied = q.discount_granted === true && (q.original_total_cents || q.total_cents) > q.total_cents;
      const remiseNote = remiseApplied
        ? `<p class="hint" style="margin:0 0 .6rem">Remise accordée : <b>${money((q.original_total_cents || q.total_cents) - q.total_cents)}</b> — nouveau total <b>${money(q.total_cents)}</b>.</p>`
        : '';
      actionsHtml = `
      <div class="card" style="margin-top:1rem;border:1px solid rgba(245,158,11,.35)">
        <h3 style="margin:0 0 .4rem">${I('help-circle')} Décision attendue</h3>
        ${remiseNote}
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap" id="quote-decision-btns">
          <button class="btn btn-primary" id="btn-approve-quote">${I('check-circle')} Approuver le devis</button>
          <button class="btn btn-ko" id="btn-refuse-quote">${I('x')} Refuser le devis</button>
        </div>
      </div>`;
    } else if (q.status === 'REFUSED' && q.discount_granted === false && S.user && S.user.role === 'CLIENT') {
      actionsHtml = `
      <div class="card" style="margin-top:1rem;border:1px solid rgba(239,68,68,.3)">
        <h3 style="margin:0 0 .4rem">${I('alert-circle')} Prix maintenu par le professionnel</h3>
        <p class="hint" style="margin:0 0 .6rem">${q.pro_comment && q.pro_comment !== 'Prix maintenu' ? esc(q.pro_comment) : 'Le professionnel a maintenu le prix du devis.'} Vous pouvez l&apos;accepter si vous changez d&apos;avis.</p>
        <button class="btn btn-primary" id="btn-approve-quote">${I('check-circle')} Accepter le devis malgré tout</button>
      </div>`;
    }

    layoutApp(`
    <a href="#/quotes" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux devis</a>
    <div class="page-top"><h1>${I('receipt')} Devis${q.is_complementary ? ' <span class="badge badge-warn">' + I('file-plus') + ' Complémentaire</span>' : ''}</h1><div>${statusBadge(q.status)}</div></div>
    ${q.is_complementary && q.complementary_message ? `<p style="margin:.4rem 0 0;font-size:.88rem;color:var(--muted);border-left:3px solid var(--warn);padding-left:.6rem">${esc(q.complementary_message)}</p>` : ''}
    ${q.refusal_reason ? `<p style="margin:.6rem 0 0;font-size:.85rem;color:var(--ko)">Refusé — motif : <b>${esc(q.refusal_reason)}</b>${q.refusal_comment ? ' : ' + esc(q.refusal_comment) : ''}${q.request_discount && q.discount_granted == null ? ' — demande de remise envoyée au professionnel.' : ''}</p>` : ''}

    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;align-items:center">
        <div>
          <div class="hint">${esc(q.vehicle_make || '')} ${esc(q.vehicle_model || '')} ${esc(q.vehicle_plate || '')}</div>
          <div class="hint">${I('calendar')} ${q.created_at ? new Date(q.created_at).toLocaleDateString('fr') : ''}</div>
        </div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--accent)">${money(q.total_cents || 0)}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <h3>${I('list')} Lignes du devis</h3>
      <table class="quote-table" style="width:100%;font-size:0.88rem;margin-top:0.5rem">
        <tr class="qt-head" style="border-bottom:2px solid var(--border);text-align:left">
          <th style="padding:0.4rem 0">Element</th>
          <th>Type</th>
          <th>Qte</th>
          <th>P.U.</th>
          <th style="text-align:right">Total</th>
        </tr>
        ${items.map(it => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:0.4rem 0" data-label="Element">${esc(it.label || '')}</td>
          <td data-label="Type"><span class="badge badge-muted">${esc(it.kind || '')}</span></td>
          <td data-label="Qte">${it.qty || 1}</td>
          <td data-label="P.U.">${money(it.unit_price_cents || 0)}</td>
          <td data-label="Total" style="font-weight:600">${money(Math.round((it.qty || 1) * (it.unit_price_cents || 0)))}</td>
        </tr>`).join('')}
        ${q.discount_granted === true && (q.original_total_cents || q.total_cents) > q.total_cents ? `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:0.4rem 0" data-label="Element">${I('tag')} Remise accordée</td>
          <td data-label="Type"><span class="badge badge-ok">REMISE</span></td>
          <td></td>
          <td data-label="Remise">${q.discount_percent != null ? '-' + esc(String(q.discount_percent)) + '%' : ''}</td>
          <td data-label="Montant" style="font-weight:600;color:var(--ok)">-${money((q.original_total_cents || q.total_cents) - q.total_cents)}</td>
        </tr>` : ''}
        <tr class="qt-total" style="font-weight:700;border-top:2px solid var(--border)">
          <td colspan="4" style="padding:0.5rem 0">TOTAL${q.discount_granted === true && (q.original_total_cents || q.total_cents) > q.total_cents ? ` <span class="hint" style="font-weight:400;text-decoration:line-through">${money(q.original_total_cents)}</span>` : ''}</td>
          <td data-label="Total" style="text-align:right">${money(q.total_cents || 0)}</td>
        </tr>
      </table>
    </div>

    <div class="detail-grid" style="grid-template-columns:1fr 1fr">
      ${q.delay_days != null ? `<div class="card"><div class="detail-label">Delai estime</div><div class="detail-value">${q.delay_days} jour(s)${fmtDeadline(q)}</div></div>` : ''}
      ${q.warranty_months != null ? `<div class="card"><div class="detail-label">Garantie</div><div class="detail-value">${q.warranty_months} mois</div></div>` : ''}
    </div>

    ${evidences.length ? `
    <div class="card" style="margin-top:1rem">
      <h3>${I('image')} Preuves</h3>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem">${evidences.map(e => `
        <div class="badge badge-muted">${I('file')} ${esc(e.filename || e.name || 'Piece jointe')}</div>
      `).join('')}</div>
    </div>` : ''}

    ${actionsHtml}
    `);

    const approveBtn = document.getElementById('btn-approve-quote');
    if (approveBtn) {
      approveBtn.onclick = async () => {
        try {
          await api('/quotes/' + id + '/approve', { method: 'POST' });
          toast('Devis approuve', 'success');
          viewQuoteDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const refuseBtn = document.getElementById('btn-refuse-quote');
    if (refuseBtn) {
      refuseBtn.onclick = () => {
        const btns = document.getElementById('quote-decision-btns');
        if (btns) btns.style.display = 'none';
        refuseBtn.closest('.card').insertAdjacentHTML('beforeend', quoteRefuseForm());
        renderIcons();
        document.getElementById('btn-refuse-confirm').onclick = async () => {
          const motif = (document.getElementById('q-refuse-motif').value || '').trim();
          if (!motif) return toast('Motif du refus requis', 'error');
          const comment = (document.getElementById('q-refuse-comment').value || '').trim();
          const request_discount = document.getElementById('q-refuse-remise').checked;
          try {
            await api('/quotes/' + id + '/refuse', { method: 'POST', body: { reason: motif, comment: comment || undefined, request_discount } });
            toast(request_discount ? 'Devis refuse — demande de remise envoyee' : 'Devis refuse', 'success');
            viewQuoteDetail(id);
          } catch(e) { toast(e.message, 'error'); }
        };
        document.getElementById('btn-refuse-cancel').onclick = () => viewQuoteDetail(id);
      };
    }
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== 8. LISTE DES REPARATIONS ====== */
async function viewRepairs() {
  showLoading();
  try {
    const { repairs } = await api('/repairs').catch(() => api('/interventions/mine').then(d => ({ repairs: d.interventions || [] })));
    layoutApp(`
    <div class="page-top"><h1>${I('wrench')} Mes reparations</h1></div>
    <div id="repairs-grid" class="grid-cards">
      ${renderRepairsList(repairs)}
    </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

function renderRepairsList(repairs) {
  if (!repairs.length) return '<div class="empty-state">' + I('wrench') + '<h3>Aucune reparation</h3><p>Les reparations apparaissent ici.</p></div>';
  return repairs.map(r => `
    <a href="#/repairs/${r.id}" class="card veh-card-link">
      <div class="veh-card-header">
        <div class="veh-card-icon">${I('wrench')}</div>
        ${statusBadge(r.status)}
      </div>
      <h3>${esc(r.vehicle_make || '')} ${esc(r.vehicle_model || '')}</h3>
      <div class="hint">${esc(r.professional_name || '')}</div>
      <div class="hint" style="font-size:0.8rem;margin-top:0.3rem">${I('calendar')} ${r.created_at ? new Date(r.created_at).toLocaleDateString('fr') : ''}</div>
    </a>`).join('');
}

/* ====== 9. DETAIL REPARATION (console role-aware pro / client) ====== */
function quoteLineRow() {
  return `
    <div class="quote-line">
      <input class="ql-label" placeholder="Désignation de la prestation / pièce" value="">
      <select class="ql-kind"><option value="PARTS">Pièce</option><option value="LABOR">Main d'oeuvre</option></select>
      <input class="ql-qty" type="number" min="1" value="1" placeholder="Qté" title="Quantité">
      <input class="ql-price" type="number" min="0" placeholder="P.U. (FCFA)" title="Prix unitaire">
      <button type="button" class="ql-del" title="Retirer la ligne">${I('x')}</button>
    </div>`;
}

function quoteRefuseForm() {
  const RAISONS = ['Prix trop eleve','Delai trop long','Divergence sur les pieces / prestations','Budget insuffisant','Frais annexes deplaces','Prestation non souhaitee','Autre'];
  return `
  <div id="refuse-box" style="margin-top:.9rem;border-top:1px dashed var(--border);padding-top:.8rem">
    <b>${I('x')} Confirmer le refus</b>
    <label style="margin-top:.5rem">Motif du refus *
      <select id="q-refuse-motif" required>${RAISONS.map(r => `<option>${esc(r)}</option>`).join('')}</select>
    </label>
    <label>Commentaire (facultatif)
      <textarea id="q-refuse-comment" rows="2" placeholder="Detaillez votre refus..."></textarea>
    </label>
    <label class="check" style="display:flex;align-items:center;gap:.45rem;cursor:pointer;margin-top:.3rem">
      <input type="checkbox" id="q-refuse-remise"> Je souhaite une remise / une negociation sur ce devis
    </label>
    <div style="display:flex;gap:.5rem;margin-top:.7rem;flex-wrap:wrap">
      <button class="btn btn-primary" id="btn-refuse-confirm">${I('check')} Confirmer le refus</button>
      <button class="btn btn-ghost" id="btn-refuse-cancel">Annuler</button>
    </div>
  </div>`;
}

async function viewRepairDetail(id) {
  const isPro = S.user && ['GARAGE', 'MECANICIEN'].includes(S.user.role);
  showLoading();
  try {
    const d = await api('/repairs/' + id);
    const r = d.repair || d;
    const diagnostic = d.diagnostic || r.diagnostic || null;
    const quote = d.quote || r.quote || null;
    const extraWorks = d.extra_works || r.extra_works || [];
    const status = r.status || 'DIAGNOSTIC';
    const currentStepIdx = STEP_KEYS.indexOf(status);

    const stepper = `
      <div class="stepper" style="margin-bottom:1.5rem">
        ${STEP_KEYS.map((sk, i) => {
          const cls = i < currentStepIdx ? 'done' : i === currentStepIdx ? 'active' : '';
          return `<div class="step ${cls}"><div class="step-dot">${i < currentStepIdx ? I('check') : (i + 1)}</div><span class="step-label">${esc(STEP_NAMES[i])}</span></div>${i < STEP_KEYS.length - 1 ? '<div class="step-line"></div>' : ''}`;
        }).join('')}
      </div>`;

    const infoGrid = `
      <div class="detail-grid">
        <div class="card"><div class="detail-label">Vehicule</div><div class="detail-value">${esc(r.vehicle_make || '')} ${esc(r.vehicle_model || '')} · ${esc(r.vehicle_plate || '')}</div></div>
        <div class="card"><div class="detail-label">Professionnel</div><div class="detail-value">${esc(r.professional_name || '')}</div></div>
        <div class="card"><div class="detail-label">Client</div><div class="detail-value">${esc(r.client_name || (isPro ? 'Client' : (S.user && S.user.name) || ''))}</div></div>
        ${r.mileage != null ? `<div class="card"><div class="detail-label">Kilometrage</div><div class="detail-value">${Number(r.mileage).toLocaleString('fr')} km</div></div>` : ''}
      </div>`;

    /* ---------- DIAGNOSTIC ---------- */
    let diagHtml;
    if (diagnostic) {
      diagHtml = `
      <div class="card" style="margin-top:1rem;border-left:4px solid var(--purple)">
        <h3>${I('stethoscope')} Diagnostic établi</h3>
        <p style="margin:0.3rem 0 0;font-size:0.9rem;white-space:pre-line">${esc(diagnostic.content || diagnostic.description || '')}</p>
        ${diagnostic.result_urgency ? `<div style="margin-top:0.4rem">${severityBadge(diagnostic.result_urgency)}</div>` : ''}
        <div class="hint" style="margin-top:.5rem;font-size:.75rem">${I('calendar')} ${diagnostic.created_at ? new Date(diagnostic.created_at).toLocaleString('fr') : ''}</div>
      </div>`;
    } else if (isPro && ['VEHICLE_RECEIVED', 'DIAGNOSTIC'].includes(status)) {
      diagHtml = `
      <div class="card" style="margin-top:1rem">
        <h3>${I('stethoscope')} Formulaire de diagnostic</h3>
        <p class="hint" style="margin:0 0 .7rem">Décrivez votre analyse technique (symptômes constatés, causes identifiées, contrôles effectués).</p>
        <form id="f-diag">
          <textarea id="diag-content" rows="4" placeholder="Ex : bruit anormal au moteur, code P0301 détecté, compression faible cylindre 1…" required></textarea>
          <button type="submit" class="btn btn-primary" style="margin-top:.7rem">${I('save')} Enregistrer le diagnostic</button>
        </form>
      </div>`;
    } else {
      diagHtml = `<div class="alert alert-warn" style="margin-top:1rem">${I('clock')} <div><b>Diagnostic en cours</b><p style="margin:.2rem 0 0">L&apos;atelier analyse votre véhicule. Le résultat et le devis apparaîtront ici.</p></div></div>`;
    }

    /* ---------- DEVIS ---------- */
    let quoteHtml = '';
    if (quote) {
      const total = quote.total_cents || 0;
      const original = quote.original_total_cents || total;
      const remiseApplied = quote.discount_granted === true && original > total;

      let decisionHtml = '';
      if (!isPro && quote.status === 'PENDING') {
        const remiseNote = remiseApplied
          ? `<p class="hint" style="margin:.4rem 0 0">Une remise de <b>${money(original - total)}</b> vous a été accordée. Nouveau total : <b>${money(total)}</b>.</p>`
          : '';
        decisionHtml = `
        <div class="card" style="margin-top:1rem;border:1px solid rgba(245,158,11,.35)">
          <h3 style="margin:0 0 .4rem">${I('help-circle')} Décision attendue</h3>
          <p class="hint" style="margin:0 0 .8rem">Validez ce devis pour autoriser les réparations. En cas de refus, précisez le motif et, si vous le souhaitez, demandez une remise.</p>
          ${remiseNote}
          <div style="display:flex;gap:.5rem;flex-wrap:wrap" id="quote-decision-btns">
            <button class="btn btn-primary" id="btn-approve-quote">${I('check')} Approuver le devis</button>
            <button class="btn btn-ghost btn-ko" id="btn-refuse-quote">${I('x')} Refuser le devis</button>
          </div>
        </div>`;
      } else if (isPro && quote.status === 'REFUSED' && quote.request_discount && quote.discount_granted == null) {
        decisionHtml = `
        <div class="card" style="margin-top:1rem;border:1px solid rgba(245,158,11,.45)">
          <h3 style="margin:0 0 .5rem">${I('message-square')} Demande de remise du client</h3>
          <p style="margin:0 0 .3rem;font-size:.9rem">Le devis a été refusé. Motif : <b>${esc(quote.refusal_reason || '')}</b>${quote.refusal_comment ? `<br><span class="hint">${esc(quote.refusal_comment)}</span>` : ''}</p>
          <div id="remise-box" style="margin-top:.7rem;border-top:1px dashed var(--border);padding-top:.7rem">
            <label class="hint" style="margin:0 0 .4rem">Accordez une remise sur <b>${money(original)}</b> :</label>
            <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem">
              <input id="q-remise-pct" type="number" min="0" max="100" placeholder="% " style="width:90px">
              <span class="hint">ou</span>
              <input id="q-remise-amt" type="number" min="0" placeholder="FCFA " style="width:110px">
            </div>
            <label style="font-size:.8rem">Commentaire pour le client
              <input id="q-remise-comment" placeholder="Ex : remise clientèle fidélité">
            </label>
            <div style="display:flex;gap:.5rem;margin-top:.7rem;flex-wrap:wrap">
              <button class="btn btn-primary" id="btn-remise-grant">${I('check')} Accorder la remise</button>
              <button class="btn btn-ghost btn-ko" id="btn-remise-keep">${I('x')} Maintenir le prix</button>
            </div>
          </div>
        </div>`;
      } else if (!isPro && quote.status === 'REFUSED' && quote.discount_granted === false) {
        decisionHtml = `
        <div class="card" style="margin-top:1rem;border:1px solid rgba(239,68,68,.3)">
          <h3 style="margin:0 0 .4rem">${I('alert-circle')} Devis refusé — prix maintenu</h3>
          <p class="hint" style="margin:0 0 .3rem">Le professionnel a maintenu le prix${quote.pro_comment && quote.pro_comment !== 'Prix maintenu' ? ` : <b>${esc(quote.pro_comment)}</b>` : '.'} Vous pouvez tout de même accepter le devis.</p>
          <button class="btn btn-primary" id="btn-approve-quote">${I('check')} Accepter le devis quand même</button>
        </div>`;
      } else if (isPro && quote.status === 'PENDING') {
        decisionHtml = `<div class="alert alert-warn" style="margin-top:1rem">${I('clock')} <div><b>Devis envoyé</b><p style="margin:.2rem 0 0">En attente de la décision du client.</p></div></div>`;
      } else if (quote.status === 'APPROVED') {
        decisionHtml = `<div class="alert alert-ok" style="margin-top:1rem">${I('check-circle')} <div><b>Devis approuvé par le client</b>${isPro ? '<p style="margin:.2rem 0 0">Vous pouvez démarrer les travaux.</p>' : '<p style="margin:.2rem 0 0">Votre professionnel peut démarrer les travaux.</p>'}</div></div>`;
      } else if (quote.status === 'REFUSED') {
        const refusedExtra = isPro
          ? (quote.discount_granted === true
            ? ' — une remise a été accordée et le devis a été renvoyé au client.'
            : (quote.discount_granted === false ? ' — remise refusée. Le client a été informé.' : ''))
          : (quote.discount_granted == null && quote.request_discount ? ' — votre demande de remise a été envoyée au professionnel.' : '');
        decisionHtml = `<div class="alert alert-ko" style="margin-top:1rem">${I('x')} <div><b>Devis refusé par le client</b><p style="margin:.2rem 0 0">Motif : ${esc(quote.refusal_reason || '')}${quote.refusal_comment ? ' — ' + esc(quote.refusal_comment) : ''}${refusedExtra}</p></div></div>`;
      }

      const complementaryBadge = quote.is_complementary
        ? `<span class="badge badge-warn">${I('file-plus')} Devis complémentaire</span>`
        : '';
      const remiseRow = remiseApplied
        ? `<tr style="border-bottom:1px solid var(--border)">
             <td style="padding:0.4rem 0" data-label="Element">${I('tag')} Remise accordée</td>
             <td data-label="Type"><span class="badge badge-ok">REMISE</span></td><td></td><td data-label="Remise">${quote.discount_percent != null ? '-' + esc(String(quote.discount_percent)) + '%' : ''}</td>
             <td data-label="Montant" style="font-weight:600;color:var(--ok)">-${money(original - total)}</td>
           </tr>`
        : '';

      quoteHtml = `
      <div class="card" style="margin-top:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
          <h3 style="margin:0">${I('receipt')} Devis soumis</h3>
          <span style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">${complementaryBadge}${statusBadge(quote.status)}</span>
        </div>
        ${quote.is_complementary && quote.complementary_message ? `<p style="margin:.5rem 0 0;font-size:.88rem;color:var(--muted);border-left:3px solid var(--warn);padding-left:.6rem">${esc(quote.complementary_message)}</p>` : ''}
        <table class="quote-table" style="width:100%;font-size:0.88rem;margin-top:0.6rem">
          <tr class="qt-head" style="border-bottom:2px solid var(--border);text-align:left">
            <th style="padding:0.4rem 0">Element</th><th>Type</th><th>Qte</th><th>P.U.</th><th style="text-align:right">Total</th>
          </tr>
          ${(quote.items || []).map(it => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:0.4rem 0" data-label="Element">${esc(it.label || '')}</td>
            <td data-label="Type"><span class="badge badge-muted">${esc(it.kind || '')}</span></td>
            <td data-label="Qte">${it.qty || 1}</td>
            <td data-label="P.U.">${money(it.unit_price_cents || 0)}</td>
            <td data-label="Total" style="font-weight:600">${money(Math.round((it.qty || 1) * (it.unit_price_cents || 0)))}</td>
          </tr>`).join('')}
          ${remiseRow}
          <tr class="qt-total" style="font-weight:700;border-top:2px solid var(--border)">
            <td colspan="4" style="padding:0.5rem 0">TOTAL${remiseApplied ? ` <span class="hint" style="font-weight:400;text-decoration:line-through">${money(original)}</span>` : ''}</td>
            <td data-label="Total" style="text-align:right">${money(total)}</td>
          </tr>
        </table>
        ${quote.delay_days != null || quote.warranty_months != null ? `
        <div class="detail-grid" style="grid-template-columns:1fr 1fr;margin-top:.8rem">
          ${quote.delay_days != null ? `<div><span class="detail-label">Délai estimé</span><div class="detail-value">${quote.delay_days} jour(s)${fmtDeadline(quote)}</div></div>` : ''}
          ${quote.warranty_months != null ? `<div><span class="detail-label">Garantie</span><div class="detail-value">${quote.warranty_months} mois</div></div>` : ''}
        </div>` : ''}
      </div>${decisionHtml}`;
    } else if (isPro && diagnostic && ['DIAGNOSTIC', 'QUOTE_SENT'].includes(status)) {
      quoteHtml = `
      <div class="card quote-builder" style="margin-top:1rem;border-left:4px solid var(--accent)">
        <div class="qb-head"><h3>${I('receipt')} Établir le devis</h3><span class="badge badge-muted">Étape ${STEP_KEYS.indexOf('QUOTE_SENT') + 1} sur ${STEP_KEYS.length}</span></div>
        <p class="hint" style="margin:0 0 .8rem">Composez les lignes de prestations puis soumettez le devis au client pour validation.</p>

        <div class="quote-lines-head">
          <span>Désignation</span><span>Type</span><span>Qté</span><span>P.U. (FCFA)</span><span></span>
        </div>
        <div id="quote-lines">${quoteLineRow()}</div>
        <button type="button" class="btn btn-ghost btn-sm rb-add-line" id="btn-add-line">${I('plus')} Ajouter une ligne</button>

        <div class="qb-actions">
          <div class="qb-options">
            <label>Délai estimé (j)<input id="q-delay" type="number" min="0" value="1"></label>
            <label>Garantie (mois)<input id="q-warranty" type="number" min="0" value="12"></label>
          </div>
          <div style="flex:1"></div>
          <button class="btn btn-primary" id="btn-submit-quote">${I('send')} Soumettre le devis au client</button>
        </div>

        <div class="comp-option" id="comp-option">
          <label class="comp-toggle" for="q-complementary">
            <input type="checkbox" id="q-complementary">
            <span>
              <span class="comp-title">${I('file-plus')} Devis complémentaire</span>
              <span class="comp-desc">Optionnel — cochez si des travaux supplémentaires doivent faire l'objet d'un devis en plus de celui-ci, afin d'en informer le client immédiatement.</span>
            </span>
          </label>
          <div id="q-complementary-box" class="comp-msg-box hidden">
            <label for="q-complementary-msg"><b>Message au client</b>
              <textarea id="q-complementary-msg" rows="2" placeholder="Ex : des éléments supplémentaires ont été détectés, un devis complémentaire de X FCFA s'ajoutera à ce devis."></textarea>
            </label>
          </div>
        </div>
      </div>`;
    }

    /* ---------- AVANCEMENT TRAVAUX (pro) ---------- */
    let workHtml = '';
    if (isPro && status === 'QUOTE_APPROVED' && quote && quote.status === 'APPROVED') {
      workHtml = `
      <div class="card" style="margin-top:1rem;border-left:4px solid var(--accent)">
        <h3>${I('settings')} Travaux</h3>
        <p class="hint" style="margin:0 0 .6rem">Le devis est approuvé. Démarrez la réparation : le client sera notifié du début des travaux.</p>
        <button class="btn btn-primary" id="btn-start-work">${I('play')} Démarrer les travaux</button>
      </div>`;
    } else if (isPro && status === 'REPAIRING') {
      workHtml = `
      <div class="card" style="margin-top:1rem;border-left:4px solid var(--accent)">
        <h3>${I('settings')} Travaux en cours</h3>
        <p class="hint" style="margin:0 0 .6rem">Les travaux sont-ils terminés ? Passez à l'étape du contrôle qualité : le client sera notifié de la fin des travaux.</p>
        <button class="btn btn-primary" id="btn-work-done">${I('check-circle')} Travaux terminés — lancer le contrôle qualité</button>
      </div>`;
    }
    /* ---------- INFO CLIENT (travaux en cours) ---------- */
    let progressNote = '';
    if (!isPro && status === 'REPAIRING') {
      progressNote = `<div class="alert alert-warn" style="margin-top:1rem">${I('clock')} <div><b>Travaux en cours</b><p style="margin:.2rem 0 0">Votre véhicule est en réparation dans l'atelier. Vous serez notifié dès la fin des travaux.</p></div></div>`;
    }

    /* ---------- TRAVAUX SUPPLEMENTAIRES ---------- */
    const extrasHtml = extraWorks.length ? `
    <div class="card" style="margin-top:1rem">
      <h3>${I('plus-circle')} Travaux supplementaires</h3>
      ${extraWorks.map(ew => `
        <div style="padding:0.5rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.88rem">${esc(ew.label || '')}</span>
          <span class="badge badge-accent">${money(ew.cost_cents || 0)}</span>
        </div>`).join('')}
    </div>` : '';

    /* ---------- CONTROLE QUALITE (uniquement au bon moment / cote pro) ---------- */
    let qcHtml = '';
    if (status === 'QUALITY_CHECK' && isPro) {
      qcHtml = `
      <div class="card" style="margin-top:1rem;text-align:center">
        <h3>${I('shield-check')} Contrôle qualité</h3>
        ${r.quality_check ? `<p style="font-size:0.88rem">Contrôle effectué : <b>${esc(r.quality_check.result || 'OK')}</b> — validé. En attente de la confirmation du client.</p>`
          : `<p class="hint" style="margin-bottom:0.5rem">Les travaux sont terminés. Validez la qualité de la réparation pour proposer la restitution au client.</p>
             <button class="btn btn-primary" id="btn-qc">${I('check-circle')} Valider le contrôle qualité</button>`}
      </div>`;
    } else if (!isPro && r.quality_check && ['CLIENT_VALIDATION', 'CLOSED'].includes(status)) {
      qcHtml = `
      <div class="card" style="margin-top:1rem">
        <h3>${I('shield-check')} Contrôle qualité</h3>
        <p style="font-size:0.88rem">Contrôle effectué : <b>${esc(r.quality_check.result || 'OK')}</b></p>
      </div>`;
    }

    /* ---------- VALIDATION CLIENT DE LA RECEPTION ---------- */
    let pickupHtml = '';
    if (status === 'CLIENT_VALIDATION') {
      if (isPro) {
        pickupHtml = `
      <div class="card" style="margin-top:1rem;border-left:4px solid var(--warn)">
        <h3>${I('clock')} En attente de confirmation client</h3>
        <p class="hint" style="margin:0 0 .2rem">Le contrôle qualité est validé. Le client doit confirmer avoir récupéré son véhicule en bon état avant la clôture du dossier.</p>
        <p class="hint" style="margin:0">Le client est notifié et pourra confirmer depuis l'application.</p>
      </div>`;
      } else {
        pickupHtml = `
      <div class="card" style="margin-top:1rem;border:1px solid rgba(16,185,129,.35)">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem">
          ${I('package-check')} <h3 style="margin:0">Récupération du véhicule</h3>
        </div>
        <p class="hint" style="margin:0 0 .8rem">Contrôle qualité validé — votre véhicule vous attend. Confirmez que vous l'avez bien récupéré en bon état pour clôturer le dossier. En cas de désaccord, la garantie C-AUTO vous protège.</p>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-ok" id="btn-confirm-pickup">${I('check-circle')} Je confirme la bonne réception</button>
          <button class="btn btn-ghost btn-ko" id="btn-dispute-pickup">${I('alert-triangle')} Signaler un problème</button>
        </div>
      </div>`;
      }
    }

    /* ---------- Module 74 : journal de tracabilite (append-only) ---------- */
    let traceHtml = '';
    if (['CLOSED', 'CLIENT_VALIDATION'].includes(status)) {
      try {
        const t = await api('/repairs/' + id + '/trace');
        const rows = (t.data && t.data.trace) || t.trace || [];
        if (rows.length) {
          const rowsHtml = rows.map((e) => {
            const part = e.action === 'REPARATION_PART'
              ? `<span class="badge">${esc(e.part_label || '')} x${e.part_qty != null ? Number(e.part_qty) : ''}</span> <span class="hint">${esc(e.part_reference || '')}</span>`
              : (e.action === 'WARRANTY_CREATED'
                  ? `<span class="badge badge-ok">Garantie ${e.details && e.details.months != null ? e.details.months : '?'} mois</span>`
                  : '');
            return `<div class="trace-row">
                <span class="badge">${esc(e.action)}</span>
                <div class="trace-main">
                  ${part}
                  <div class="hint" style="margin:.15rem 0">${esc(e.actor_name || e.actor_id || '')} · ${e.occurred_at ? new Date(e.occurred_at).toLocaleString('fr') : ''}</div>
                  ${e.odometer_km != null ? `<div class="hint">Km ${Number(e.odometer_km).toLocaleString('fr')}</div>` : ''}
                  ${e.result ? `<div class="hint">Résultat : ${esc(e.result)}</div>` : ''}
                  ${e.total_price_cents != null ? `<div class="hint">Total : ${money(e.total_price_cents)}</div>` : ''}
                </div>
              </div>`;
          }).join('');
          traceHtml = `
          <div class="card" style="margin-top:1rem;border-left:4px solid var(--teal)">
            <h3>${I('shield-check')} Journal de traçabilité</h3>
            <p class="hint" style="margin:.2rem 0 .6rem">Enregistrement immuable de la réparation : qui, quoi, quand, kilométrage, pièces, prix, résultat, garantie.</p>
            <div class="trace-list" id="trace-list">${rowsHtml}</div>
          </div>`;
        }
      } catch (e) { /* trace indisponible : ne pas bloquer l'affichage */ }
    }

    layoutApp(`
    <a href="#/${isPro ? 'pro/repairs' : 'repairs'}" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour ${isPro ? 'aux interventions' : 'aux reparations'}</a>
    <div class="page-top"><h1>${isPro ? (I('wrench') + ' Console intervention') : (I('wrench') + ' Reparation')}</h1><div>${statusBadge(status)}</div></div>
    ${stepper}
    ${infoGrid}
    ${diagHtml}
    ${quoteHtml}
    ${workHtml}
    ${progressNote}
    ${extrasHtml}
    ${qcHtml}
    ${pickupHtml}
    ${traceHtml}
    `);

    /* ---------- handlers ---------- */
    const diagForm = document.getElementById('f-diag');
    if (diagForm) {
      diagForm.onsubmit = async (ev) => {
        ev.preventDefault();
        const content = document.getElementById('diag-content').value.trim();
        if (content.length < 5) return toast('Diagnostic trop court', 'error');
        try {
          await api('/interventions/' + id + '/diagnostic', { method: 'POST', body: { content } });
          toast('Diagnostic enregistré', 'success');
          viewRepairDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }

    const addLine = document.getElementById('btn-add-line');
    if (addLine) {
      addLine.onclick = () => {
        const wrap = document.createElement('div');
        wrap.innerHTML = quoteLineRow();
        const row = wrap.querySelector('.quote-line');
        if (!row) return;
        document.getElementById('quote-lines').appendChild(row);
        row.querySelector('.ql-del').onclick = () => row.remove();
        renderIcons();
      };
    }
    document.querySelectorAll('#quote-lines .ql-del').forEach(b => {
      if (!b.isBound) { b.isBound = true; b.onclick = () => b.closest('.quote-line').remove(); }
    });

    const qComp = document.getElementById('q-complementary');
    if (qComp) {
      const compOpt = document.getElementById('comp-option');
      qComp.onchange = () => {
        document.getElementById('q-complementary-box').classList.toggle('hidden', !qComp.checked);
        if (compOpt) compOpt.classList.toggle('comp-on', qComp.checked);
      };
    }

    const submitQuote = document.getElementById('btn-submit-quote');
    if (submitQuote) {
      submitQuote.onclick = async () => {
        const lines = Array.from(document.querySelectorAll('.quote-line'));
        const items = [];
        for (const l of lines) {
          const label = l.querySelector('.ql-label').value.trim();
          const qty = parseInt(l.querySelector('.ql-qty').value, 10);
          const price = parseFloat(String(l.querySelector('.ql-price').value || '').replace(',', '.'));
          if (!label && !l.querySelector('.ql-price').value && !l.querySelector('.ql-qty').value) continue;
          if (!label) continue;
          if (!qty || qty < 1 || (!price && price !== 0) || price < 0) return toast('Ligne incomplète : quantité et prix requis', 'error');
          items.push({ label, kind: l.querySelector('.ql-kind').value, qty, unit_price_cents: Math.round(price * 100) });
        }
        if (!items.length) return toast('Ajoutez au moins une ligne au devis', 'error');
        const is_complementary = qComp ? qComp.checked : false;
        const complementary_message = (is_complementary && document.getElementById('q-complementary-msg'))
          ? (document.getElementById('q-complementary-msg').value || '').trim()
          : undefined;
        try {
          await api('/interventions/' + id + '/quote', { method: 'POST', body: { items, is_complementary, complementary_message } });
          toast(is_complementary ? 'Devis complémentaire soumis au client !' : 'Devis soumis au client !', 'success');
          viewRepairDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }

    const approveBtn = document.getElementById('btn-approve-quote');
    if (approveBtn) {
      approveBtn.onclick = async () => {
        if (!(await UX.confirm('Valider votre décision sur ce devis ?'))) return;
        try {
          await api('/quotes/' + quote.id + '/approve', { method: 'POST', body: {} });
          toast('Devis approuvé', 'success');
          viewRepairDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const refuseBtn = document.getElementById('btn-refuse-quote');
    if (refuseBtn) {
      refuseBtn.onclick = () => {
        const btns = document.getElementById('quote-decision-btns');
        if (btns) btns.style.display = 'none';
        refuseBtn.closest('.card').insertAdjacentHTML('beforeend', quoteRefuseForm());
        renderIcons();
        document.getElementById('btn-refuse-confirm').onclick = async () => {
          const motif = (document.getElementById('q-refuse-motif').value || '').trim();
          if (!motif) return toast('Motif du refus requis', 'error');
          const comment = (document.getElementById('q-refuse-comment').value || '').trim();
          const request_discount = document.getElementById('q-refuse-remise').checked;
          try {
            await api('/quotes/' + quote.id + '/refuse', { method: 'POST', body: { reason: motif, comment: comment || undefined, request_discount } });
            toast(request_discount ? 'Devis refusé — demande de remise envoyée' : 'Devis refusé', 'success');
            viewRepairDetail(id);
          } catch(e) { toast(e.message, 'error'); }
        };
        document.getElementById('btn-refuse-cancel').onclick = () => viewRepairDetail(id);
      };
    }

    const remiseGrant = document.getElementById('btn-remise-grant');
    if (remiseGrant) {
      remiseGrant.onclick = async () => {
        const pct = parseFloat((document.getElementById('q-remise-pct').value || '0').replace(',', '.'));
        const amt = parseFloat((document.getElementById('q-remise-amt').value || '0').replace(',', '.'));
        const comment = (document.getElementById('q-remise-comment').value || '').trim();
        if ((!(pct > 0) || pct > 100) && !(amt > 0)) return toast('Précisez un pourcentage ou un montant de remise', 'error');
        try {
          await api('/quotes/' + quote.id + '/remise', { method: 'POST', body: {
            grant: true,
            discount_percent: pct > 0 ? pct : undefined,
            discount_cents: amt > 0 ? Math.round(amt * 100) : undefined,
            comment: comment || undefined
          } });
          toast('Remise accordée — devis renvoyé au client', 'success');
          viewRepairDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const remiseKeep = document.getElementById('btn-remise-keep');
    if (remiseKeep) {
      remiseKeep.onclick = async () => {
        if (!(await UX.confirm('Maintenir le prix ? Le client sera informé.'))) return;
        const comment = (document.getElementById('q-remise-comment').value || '').trim();
        try {
          await api('/quotes/' + quote.id + '/remise', { method: 'POST', body: { grant: false, comment: comment || 'Prix maintenu' } });
          toast('Prix maintenu', 'success');
          viewRepairDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }

    const startWork = document.getElementById('btn-start-work');
    if (startWork) {
      startWork.onclick = async () => {
        if (!(await UX.confirm('Démarrer les travaux ? Le client sera notifié.'))) return;
        try {
          await api('/repairs/' + id + '/status', { method: 'POST', body: { status: 'REPAIRING' } });
          toast('Travaux démarrés', 'success');
          viewRepairDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const workDone = document.getElementById('btn-work-done');
    if (workDone) {
      workDone.onclick = async () => {
        if (!(await UX.confirm('Signaler la fin des travaux et lancer le contrôle qualité ?'))) return;
        try {
          await api('/repairs/' + id + '/status', { method: 'POST', body: { status: 'QUALITY_CHECK' } });
          toast('Travaux terminés — contrôle qualité lancé', 'success');
          viewRepairDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }

    const qcBtn = document.getElementById('btn-qc');
    if (qcBtn) {
      qcBtn.onclick = async () => {
        try {
          await api('/repairs/' + id + '/quality-check', { method: 'POST', body: { result: 'OK' } });
          toast('Contrôle qualité validé — en attente de confirmation du client', 'success');
          viewRepairDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }

    const confirmPickup = document.getElementById('btn-confirm-pickup');
    if (confirmPickup) {
      confirmPickup.onclick = async () => {
        if (!(await UX.confirm('Confirmez-vous avoir récupéré votre véhicule en bon état ? Cette action clôturera le dossier.'))) return;
        try {
          await api('/repairs/' + id + '/client-confirm', { method: 'POST', body: { received_ok: true } });
          await viewRepairDetail(id);
          openCompletionRating({
            interventionId: r.id || id,
            professionalId: r.professional_id,
            serviceRequestId: r.service_request_id,
            vehicleLabel: [r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ') + (r.vehicle_plate ? ' · ' + r.vehicle_plate : ''),
            proName: r.professional_name
          });
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const disputePickup = document.getElementById('btn-dispute-pickup');
    if (disputePickup) {
      disputePickup.onclick = async () => {
        const msg = await UX.prompt('Décrivez le problème constaté à la réception :');
        if (msg === null || !msg.trim()) return;
        try {
          await api('/disputes', { method: 'POST', body: { subject: 'Problème à la réception du véhicule ' + (r.vehicle_plate || ''), description: msg.trim(), intervention_id: id } });
          toast('Problème signalé — votre litige a été ouvert', 'info');
        } catch(e) { toast(e.message, 'error'); }
      };
    }
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== 10. LISTE DES GARANTIES ====== */
async function viewWarranties() {
  showLoading();
  try {
    const { warranties } = await api('/warranties').catch(() => ({ warranties: [] }));
    layoutApp(`
    <div class="page-top"><h1>${I('shield-check')} Mes garanties</h1></div>
    <div id="warranty-grid" class="grid-cards">
      ${renderWarrantiesList(warranties)}
    </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

function renderWarrantiesList(warranties) {
  if (!warranties.length) return '<div class="empty-state">' + I('shield-check') + '<h3>Aucune garantie</h3><p>Les garanties liees a vos reparations apparaissent ici.</p></div>';
  const now = new Date();
  return warranties.map(w => {
    const isActive = w.is_active !== false && (!w.ends_on || new Date(w.ends_on) > now);
    return `<a href="#/warranties/${w.id}" class="card veh-card-link">
      <div class="veh-card-header">
        <div class="veh-card-icon">${I('shield-check')}</div>
        <span class="badge badge-${isActive ? 'ok' : 'muted'}">${isActive ? 'Active' : 'Expiree'}</span>
      </div>
      <h3>${esc(w.vehicle_make || '')} ${esc(w.vehicle_model || '')}</h3>
      <div class="hint">${I('calendar')} ${esc(w.starts_on || '')} ${I('arrow-right')} ${esc(w.ends_on || 'Indefinie')}</div>
      ${w.odometer_km != null ? `<div class="hint" style="font-size:0.8rem;margin-top:0.2rem">${I('hash')} ${Number(w.odometer_km).toLocaleString('fr')} km</div>` : ''}
    </a>`;
  }).join('');
}

/* ====== 11. DETAIL GARANTIE ====== */
async function viewWarrantyDetail(id) {
  showLoading();
  try {
    const d = await api('/warranties/' + id);
    const w = d.warranty || d;
    const coveredParts = w.covered_parts || [];
    const now = new Date();
    const isActive = w.is_active !== false && (!w.ends_on || new Date(w.ends_on) > now);

    layoutApp(`
    <a href="#/warranties" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux garanties</a>
    <div class="page-top"><h1>${I('shield-check')} Garantie</h1>
      <span class="badge badge-${isActive ? 'ok' : 'muted'}">${isActive ? 'Active' : 'Expiree'}</span>
    </div>

    <div class="detail-grid">
      <div class="card"><div class="detail-label">Intervention</div><div class="detail-value">${esc(w.intervention_label || w.intervention_id || 'N/A')}</div></div>
      <div class="card"><div class="detail-label">Vehicule</div><div class="detail-value">${esc(w.vehicle_make || '')} ${esc(w.vehicle_model || '')} ${esc(w.vehicle_plate || '')}</div></div>
      <div class="card"><div class="detail-label">Professionnel</div><div class="detail-value">${esc(w.professional_name || '')}</div></div>
      <div class="card"><div class="detail-label">Date de debut</div><div class="detail-value">${esc(w.starts_on || '')}</div></div>
      <div class="card"><div class="detail-label">Date de fin</div><div class="detail-value">${esc(w.ends_on || 'Indefinie')}</div></div>
      ${w.odometer_km != null ? `<div class="card"><div class="detail-label">Kilometrage</div><div class="detail-value">${Number(w.odometer_km).toLocaleString('fr')} km</div></div>` : ''}
    </div>

    ${coveredParts.length ? `
    <div class="card" style="margin-top:1rem">
      <h3>${I('list')} Pieces couvertes</h3>
      <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.5rem">${coveredParts.map(p => `<span class="badge badge-accent">${esc(typeof p === 'string' ? p : (p.name || p.label || ''))}</span>`).join('')}</div>
    </div>` : ''}

    ${w.conditions ? `
    <div class="card" style="margin-top:1rem">
      <h3>${I('file-text')} Conditions</h3>
      <p style="font-size:0.88rem;margin-top:0.3rem">${esc(w.conditions)}</p>
    </div>` : ''}
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== 12. LISTE DES LITIGES ====== */
async function viewDisputes() {
  showLoading();
  try {
    const { disputes } = await api('/disputes').catch(() => ({ disputes: [] }));
    layoutApp(`
    <div class="page-top"><h1>${I('alert-triangle')} Mes litiges</h1></div>
    <div class="card" style="margin-bottom:1rem">
      <form id="f-filter-disputes" style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:end">
        <label style="margin:0">${I('filter')} Statut
          <select name="status"><option value="">Tous</option>${Object.entries(DISPUTE_STATUS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select>
        </label>
        <button type="submit" class="btn btn-sm">${I('search')} Filtrer</button>
      </form>
    </div>
    <div id="disputes-grid" class="grid-cards">
      ${renderDisputesList(disputes)}
    </div>
    `);
    document.getElementById('f-filter-disputes').onsubmit = (ev) => { ev.preventDefault(); applyStatusFilter('f-filter-disputes', 'disputes-grid', '/disputes', (d) => renderDisputesList(d.disputes)); };
    document.getElementById('f-filter-disputes').elements.status.onchange = () => applyStatusFilter('f-filter-disputes', 'disputes-grid', '/disputes', (d) => renderDisputesList(d.disputes));
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

function renderDisputesList(disputes) {
  if (!disputes.length) return '<div class="empty-state">' + I('alert-triangle') + '<h3>Aucun litige</h3><p>Les litiges apparaissent ici.</p></div>';
  return disputes.map(dp => `
    <a href="#/disputes/${dp.id}" class="card veh-card-link">
      <div class="veh-card-header">
        <div class="veh-card-icon">${I('alert-triangle')}</div>
        ${statusBadge(dp.status)}
      </div>
      <h3>${esc(dp.subject || dp.title || '')}</h3>
      <div class="hint">${esc(dp.professional_name || '')}</div>
      <div class="hint" style="font-size:0.8rem;margin-top:0.3rem">${I('calendar')} ${dp.created_at ? new Date(dp.created_at).toLocaleDateString('fr') : ''}</div>
    </a>`).join('');
}

/* ====== 13. DETAIL LITIGE ====== */
async function viewDisputeDetail(id) {
  showLoading();
  try {
    const d = await api('/disputes/' + id);
    const dp = d.dispute || d;
    const messages = dp.messages || d.messages || [];

    layoutApp(`
    <a href="#/disputes" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux litiges</a>
    <div class="page-top"><h1>${I('alert-triangle')} Litige</h1><div>${statusBadge(dp.status)}</div></div>

    <div class="card" style="margin-bottom:1rem">
      <h3>${esc(dp.subject || dp.title || '')}</h3>
      <p style="margin:0.3rem 0;font-size:0.88rem">${esc(dp.description || '')}</p>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">
        ${dp.professional_name ? `<span class="badge badge-accent">${esc(dp.professional_name)}</span>` : ''}
        <span class="badge badge-muted">${dp.created_at ? new Date(dp.created_at).toLocaleDateString('fr') : ''}</span>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <h3>${I('message-square')} Discussion</h3>
      ${messages.length ? `<div style="margin-top:0.5rem;max-height:400px;overflow-y:auto">${messages.map(m => {
        const isMine = m.author_id === S.user.id;
        return `<div style="margin-bottom:0.8rem;display:flex;flex-direction:column;${isMine ? 'align-items:flex-end' : ''}">
          <div class="hint" style="font-size:0.75rem;margin-bottom:0.2rem">${esc(m.author_name || '')} · ${m.created_at ? new Date(m.created_at).toLocaleString('fr') : ''}</div>
          <div class="card" style="max-width:75%;padding:0.6rem !important;${isMine ? 'background:var(--accent);color:white' : ''}">
            <p style="margin:0;font-size:0.88rem">${esc(m.content || m.text || '')}</p>
          </div>
        </div>`;
      }).join('')}</div>` : '<p class="hint" style="margin-top:0.3rem">Aucun message.</p>'}
    </div>

    <div class="card" style="max-width:600px">
      <h3>${I('send')} Ajouter un message</h3>
      <form id="f-dispute-msg" style="margin-top:0.5rem">
        <label>${I('message-square')} Message *
          <textarea name="content" rows="3" required placeholder="Ecrivez votre message..."></textarea>
        </label>
        <button type="submit" style="margin-top:0.3rem">${I('send')} Envoyer</button>
      </form>
    </div>
    `);

    document.getElementById('f-dispute-msg').onsubmit = async (ev) => {
      ev.preventDefault();
      const o = Object.fromEntries(new FormData(ev.target));
      try {
        await api('/disputes/' + id + '/messages', { method: 'POST', body: { content: o.content } });
        toast('Message envoye', 'success');
        viewDisputeDetail(id);
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== 14. LISTE DES DEUXIEMES AVIS ====== */
async function viewSecondOpinions() {
  showLoading();
  try {
    const { second_opinions } = await api('/second-opinions').catch(() => ({ second_opinions: [] }));
    layoutApp(`
    <div class="page-top"><h1>${I('brain')} Deuxieme avis</h1></div>
    <div id="so-grid" class="grid-cards">
      ${renderSecondOpinionsList(second_opinions)}
    </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

function renderSecondOpinionsList(sos) {
  if (!sos.length) return '<div class="empty-state">' + I('brain') + '<h3>Aucun deuxieme avis</h3><p>Demandez un deuxieme avis sur un diagnostic.</p></div>';
  return sos.map(so => `
    <a href="#/second-opinions/${so.id}" class="card veh-card-link">
      <div class="veh-card-header">
        <div class="veh-card-icon">${I('brain')}</div>
        ${statusBadge(so.status)}
      </div>
      <h3>${esc(so.vehicle_make || '')} ${esc(so.vehicle_model || '')}</h3>
      <div class="hint" style="font-size:0.8rem;margin-top:0.3rem">${I('calendar')} ${so.created_at ? new Date(so.created_at).toLocaleDateString('fr') : ''}</div>
    </a>`).join('');
}

/* ====== 15. DETAIL DEUXIEME AVIS ====== */
async function viewSecondOpinionDetail(id) {
  showLoading();
  try {
    const d = await api('/second-opinions/' + id);
    const so = d.second_opinion || d;
    const isCompleted = so.status === 'COMPLETED';
    const agreementPoints = so.agreement_points || [];
    const divergencePoints = so.divergence_points || [];
    const recommendations = so.recommendations || [];

    layoutApp(`
    <a href="#/second-opinions" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux deuxieme avis</a>
    <div class="page-top"><h1>${I('brain')} Deuxieme avis</h1><div>${statusBadge(so.status)}</div></div>

    <div class="detail-grid">
      <div class="card"><div class="detail-label">Vehicule</div><div class="detail-value">${esc(so.vehicle_make || '')} ${esc(so.vehicle_model || '')} ${esc(so.vehicle_plate || '')}</div></div>
      <div class="card"><div class="detail-label">Date</div><div class="detail-value">${so.created_at ? new Date(so.created_at).toLocaleDateString('fr') : ''}</div></div>
    </div>

    ${so.original_diagnostic ? `
    <div class="card" style="margin-top:1rem;border-left:4px solid var(--orange)">
      <h3>${I('stethoscope')} Diagnostic initial</h3>
      <p style="font-size:0.88rem;margin:0.3rem 0">${esc(so.original_diagnostic.description || so.original_diagnostic.category || so.original_diagnostic || '')}</p>
      ${so.original_diagnostic.urgency ? `<div>${severityBadge(so.original_diagnostic.urgency)}</div>` : ''}
    </div>` : ''}

    ${so.first_quote ? `
    <div class="card" style="margin-top:1rem">
      <h3>${I('receipt')} Premier devis</h3>
      <div style="margin-top:0.3rem;font-weight:700;color:var(--accent)">${money(so.first_quote.total_cents || so.first_quote.total || 0)}</div>
      ${so.first_quote.items ? `<ul style="font-size:0.85rem;margin:0.3rem 0;padding-left:1.2rem">${so.first_quote.items.map(it => `<li>${esc(it.label || '')} — ${money(it.unit_price_cents || it.price_cents || 0)}</li>`).join('')}</ul>` : ''}
    </div>` : ''}

    ${isCompleted ? `
    <div class="card" style="margin-top:1rem;border-left:4px solid var(--ok)">
      <h3>${I('brain')} Avis du second expert</h3>
      ${so.second_diagnostic ? `<p style="font-size:0.88rem;margin:0.3rem 0">${esc(so.second_diagnostic.description || so.second_diagnostic.category || '')}</p>` : ''}
      ${so.second_quote ? `<div style="margin-top:0.3rem;font-weight:700;color:var(--accent)">${money(so.second_quote.total_cents || so.second_quote.total || 0)}</div>` : ''}
    </div>` : ''}

    ${agreementPoints.length ? `
    <div class="card" style="margin-top:1rem">
      <h3>${I('check-circle')} Points d'accord</h3>
      ${agreementPoints.map(p => `<div style="padding:0.3rem 0;font-size:0.88rem;display:flex;align-items:center;gap:0.4rem">${I('check-circle')} ${esc(typeof p === 'string' ? p : (p.label || p.description || ''))}</div>`).join('')}
    </div>` : ''}

    ${divergencePoints.length ? `
    <div class="card" style="margin-top:1rem">
      <h3>${I('alert-triangle')} Points de divergence</h3>
      ${divergencePoints.map(p => `<div style="padding:0.3rem 0;font-size:0.88rem;display:flex;align-items:center;gap:0.4rem">${I('alert-circle')} ${esc(typeof p === 'string' ? p : (p.label || p.description || ''))}</div>`).join('')}
    </div>` : ''}

    ${recommendations.length ? `
    <div class="card" style="margin-top:1rem">
      <h3>${I('lightbulb')} Recommandations</h3>
      ${recommendations.map(r => `<div style="padding:0.5rem 0;border-bottom:1px solid var(--border)">
        <div style="font-size:0.88rem;font-weight:600">${esc(typeof r === 'string' ? r : (r.label || r.title || ''))}</div>
        ${r.description ? `<p class="hint" style="margin:0.2rem 0 0;font-size:0.82rem">${esc(r.description)}</p>` : ''}
      </div>`).join('')}
    </div>` : ''}
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ====== 16. NOTATION / AVIS ====== */
async function viewRatingsNew(interventionId) {
  showLoading();
  try {
    layoutApp(`
    <a href="#/repairs/${interventionId}" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour a la reparation</a>
    <div class="section-title" style="margin-bottom:1rem">${I('star')} Noter l'intervention</div>
    <div class="card" style="max-width:600px">
      <form id="f-rating">
        <label>Qualite
          <select name="quality" required>
            <option value="1">1 - Mauvais</option>
            <option value="2">2 - Passable</option>
            <option value="3">3 - Correct</option>
            <option value="4" selected>4 - Bien</option>
            <option value="5">5 - Excellent</option>
          </select>
        </label>
        <label>Respect des delais
          <select name="delay" required>
            <option value="1">1 - Mauvais</option>
            <option value="2">2 - Passable</option>
            <option value="3">3 - Correct</option>
            <option value="4" selected>4 - Bien</option>
            <option value="5">5 - Excellent</option>
          </select>
        </label>
        <label>Communication
          <select name="communication" required>
            <option value="1">1 - Mauvais</option>
            <option value="2">2 - Passable</option>
            <option value="3">3 - Correct</option>
            <option value="4" selected>4 - Bien</option>
            <option value="5">5 - Excellent</option>
          </select>
        </label>
        <label>Rapport qualite/prix
          <select name="price" required>
            <option value="1">1 - Mauvais</option>
            <option value="2">2 - Passable</option>
            <option value="3">3 - Correct</option>
            <option value="4" selected>4 - Bien</option>
            <option value="5">5 - Excellent</option>
          </select>
        </label>
        <label>Transparence
          <select name="transparency" required>
            <option value="1">1 - Mauvais</option>
            <option value="2">2 - Passable</option>
            <option value="3">3 - Correct</option>
            <option value="4" selected>4 - Bien</option>
            <option value="5">5 - Excellent</option>
          </select>
        </label>
        <label>Note globale *
          <select name="overall" required>
            <option value="1">1 - Mauvais</option>
            <option value="2">2 - Passable</option>
            <option value="3">3 - Correct</option>
            <option value="4" selected>4 - Bien</option>
            <option value="5">5 - Excellent</option>
          </select>
        </label>
        <label>${I('message-square')} Commentaire
          <textarea name="comment" rows="3" placeholder="Decrivez votre experience..."></textarea>
        </label>
        <button type="submit" style="margin-top:0.5rem">${I('star')} Envoyer la notation</button>
      </form>
    </div>
    `);

    document.getElementById('f-rating').onsubmit = async (ev) => {
      ev.preventDefault();
      const o = Object.fromEntries(new FormData(ev.target));
      const body = {
        intervention_id: interventionId,
        quality_stars: +o.quality,
        delay_stars: +o.delay,
        communication_stars: +o.communication,
        price_stars: +o.price,
        transparency_stars: +o.transparency,
        overall_stars: +o.overall,
        comment: o.comment || undefined
      };
      try {
        await api('/ratings', { method: 'POST', body });
        toast('Notation envoyee', 'success');
        location.hash = '#/repairs/' + interventionId;
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

async function viewDisputeNew() {
  showLoading();
  try {
    const { service_requests } = await api('/service-requests');
    layoutApp(`
      <a href="#/disputes" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux litiges</a>
      <div class="section-title" style="margin-bottom:1rem">${I('alert-triangle')} Nouveau litige</div>
      <div class="card" style="max-width:700px">
        <form id="f-dispute">
          <label>Sujet *
            <input name="subject" required placeholder="Ex: Travail non conforme">
          </label>
          <label>Description
            <textarea name="description" rows="4" placeholder="Decrivez le probleme..."></textarea>
          </label>
          <label>Demande de service associee
            <select name="service_request_id">
              <option value="">Aucune</option>
              ${(service_requests || []).map(sr => `<option value="${sr.id}">${esc(sr.make)} ${esc(sr.model)} — ${esc(sr.status)}</option>`).join('')}
            </select>
          </label>
          <button type="submit">${I('send')} Creer le litige</button>
        </form>
      </div>
    `);
    document.getElementById('f-dispute').onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const fd = new FormData(ev.target);
        const body = { subject: fd.get('subject'), description: fd.get('description') };
        if (fd.get('service_request_id')) body.service_request_id = fd.get('service_request_id');
         const { dispute } = await api('/disputes', { method: 'POST', body });
        toast('Litige cree', 'success');
        location.hash = '#/disputes/' + dispute.id;
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO DASHBOARD
   ============================================================ */
async function viewProDashboard() {
  showLoading();
  try {
    const [sr, repairs, ratingsData] = await Promise.all([
      api('/service-requests').catch(()=>({service_requests:[]})),
      api('/repairs').catch(()=>({repairs:[]})),
      api('/ratings').catch(()=>({ratings:[]}))
    ]);
    const pending = (sr.service_requests||[]).filter(s => ['CREATED','MATCHING'].includes(s.status));
    const active = (repairs.repairs||[]).filter(r => !['CLOSED'].includes(r.status));
    const recent = (sr.service_requests||[]).slice(0,5);
    layoutApp(`
      <div class="dash-header"><h1>${I('layout-dashboard')} Espace Professionnel</h1></div>
      <div class="grid-stats" style="margin-bottom:1.5rem">
        <div class="card dash-card"><div class="dash-card-title">${I('clipboard-list')} Demandes en attente</div><p style="font-size:1.8rem;font-weight:800;color:var(--warn)">${pending.length}</p></div>
        <div class="card dash-card"><div class="dash-card-title">${I('settings')} Interventions actives</div><p style="font-size:1.8rem;font-weight:800;color:var(--accent)">${active.length}</p></div>
        <div class="card dash-card"><div class="dash-card-title">${I('star')} Avis recus</div><p style="font-size:1.8rem;font-weight:800;color:var(--warn)">${(ratingsData.ratings||[]).length}</p></div>
      </div>
      ${recent.length ? `
      <div class="section-title" style="margin-bottom:0.8rem">${I('clock')} Demandes recentes</div>
      <div class="grid-cards">
        ${recent.map(s => `
          <a href="#/pro/service-requests" class="card veh-card-link">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
              <strong>${esc(s.make||'')} ${esc(s.model||'')}</strong>
              ${statusBadge(s.status)}
            </div>
            <p style="font-size:0.82rem;color:var(--muted);margin:0">${esc((s.problem_description||'').substring(0,100))}</p>
            <p style="font-size:0.75rem;color:var(--muted);margin:0.3rem 0 0">${new Date(s.created_at).toLocaleDateString('fr')}</p>
          </a>
        `).join('')}
      </div>` : '<div class="empty-state">' + I('inbox') + '<h3>Aucune demande pour le moment</h3></div>'}
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO: SERVICE REQUESTS
   ============================================================ */
async function viewProServiceRequests() {
  showLoading();
  try {
    const { service_requests } = await api('/service-requests');
    const pending = service_requests.filter(s => ['PROFESSIONAL_SELECTED','PRO_ACCEPTED'].includes(s.status));
    const others = service_requests.filter(s => !['PROFESSIONAL_SELECTED','PRO_ACCEPTED'].includes(s.status));
    layoutApp(`
      <div class="section-title" style="margin-bottom:1rem">${I('clipboard-list')} Demandes de service</div>
      ${pending.length ? `
        <div style="margin-bottom:1rem">
          <h3 style="font-size:0.9rem;color:var(--warn);margin-bottom:0.5rem">${I('clock')} Action requise (${pending.length})</h3>
          <div class="grid-cards">
            ${pending.map(s => `
              <a href="#/pro/service-requests/${s.id}" class="card veh-card-link">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
                  <strong>${esc(s.make||'')} ${esc(s.model||'')} ${esc(s.plate||'')}</strong>
                  ${statusBadge(s.status)}
                </div>
                <p style="font-size:0.82rem;color:var(--text2);margin:0">${esc(s.problem_description||'')}</p>
                <p style="font-size:0.75rem;color:var(--muted);margin:0.3rem 0">${new Date(s.created_at).toLocaleDateString('fr')}</p>
              </a>
            `).join('')}
          </div>
        </div>` : ''}
      <div class="grid-cards">
        ${(others.length ? others : service_requests).map(s => `
          <a href="#/pro/service-requests/${s.id}" class="card veh-card-link">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
              <strong>${esc(s.make||'')} ${esc(s.model||'')} · ${esc(s.plate||'')}</strong>
              ${statusBadge(s.status)}
            </div>
            <p style="font-size:0.82rem;color:var(--muted);margin:0">${esc((s.problem_description||'').substring(0,120))}</p>
            ${s.client_name ? `<p style="font-size:0.72rem;color:var(--muted);margin:0.2rem 0 0">${I('user')} ${esc(s.client_name)}</p>` : ''}
          </a>
        `).join('')}
        ${!service_requests.length ? '<div class="empty-state">' + I('inbox') + '<h3>Aucune demande</h3></div>' : ''}
      </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO: SERVICE REQUEST DETAIL (workflow accept → reception → diag → devis)
   ============================================================ */
/* ============================================================
   SHARED: workflow stepper + reception doc
   ============================================================ */
const SR_STEPS = ['Demande', 'Réception', 'Diagnostic', 'Devis', 'Réparation', 'Terminé'];

function srWorkflowIdx(status) {
  const map = {
    CREATED:0, MATCHING:0, PROFESSIONAL_SELECTED:0, PRO_REFUSED:0,
    PRO_ACCEPTED:1, VEHICLE_RECEIVED:1, RECEPTION_VALIDATED:2,
    DIAGNOSIS:2,
    QUOTE_PENDING:3, QUOTE_SENT:3, QUOTE_APPROVED:3,
    REPAIRING:4, QUALITY_CONTROL:4,
    COMPLETED:5, PAID:5, WARRANTY_ACTIVE:5, CLOSED:5
  };
  const active = map[status] ?? 0;
  const steps = SR_STEPS.map((label, i) => {
    if (i < active) return { label, cls: 'done' };
    if (i === active) return { label, cls: 'active' };
    return { label, cls: '' };
  });
  return { active, steps, list: SR_STEPS };
}

function renderSrWorkflow(status) {
  const { steps } = srWorkflowIdx(status);
  return `
    <div class="workflow-steps">
      <div class="hint" style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.1rem">
        ${I('route')} <b>Suivi de la prise en charge</b>
      </div>
      <div class="stepper">${steps.map((s, i) => `
        <div class="step ${s.cls}">
          <div class="step-dot">${s.cls==='done' ? I('check') : i+1}</div>
          <div class="step-label">${s.label}</div>
        </div>
        ${i < steps.length-1 ? '<div class="step-line"></div>' : ''}`).join('')}
      </div>
    </div>`;
}

function renderReceptionCard(sr, opts = {}) {
  const fuelMap = { PLEIN:'Plein', '3_4':'3/4', '1_2':'1/2', '1_4':'1/4', RESERVE:'Réserve' };
  const f = fuelMap[sr.reception_fuel_level] || sr.reception_fuel_level || '—';
  const keys = sr.reception_keys_provided === true || sr.reception_keys_provided === 'true';
  const collab = opts.collabLabel || 'Le Professionnel';
  return `
    <div class="doc-reception" style="margin-bottom:1rem">
      <div class="doc-head">
        <h3>${I('clipboard-check')} Fiche de réception du véhicule</h3>
        <span class="chip accent">${I('tag')} VIN : <b style="text-transform:uppercase">${esc(sr.reception_vin || '—')}</b></span>
      </div>
      <div class="doc-body">
        <div class="rec-grid">
          <div><span class="detail-label">Kilométrage</span><div class="detail-value" style="font-size:1rem;font-weight:700">${esc(sr.reception_mileage || '—')} km</div></div>
          <div><span class="detail-label">Niveau carburant</span><div class="detail-value" style="font-size:1rem;font-weight:700">${esc(f)}</div></div>
          <div><span class="detail-label">Clés fournies</span><div class="detail-value" style="font-size:1rem;font-weight:700">${keys ? 'Oui' : 'Non'}</div></div>
          <div><span class="detail-label">Déposé le</span><div class="detail-value" style="font-size:1rem;font-weight:700">${sr.reception_submitted_at ? new Date(sr.reception_submitted_at).toLocaleDateString('fr') : '—'}</div></div>
        </div>
        <div class="rec-section">
          <h4>${I('car')} État extérieur</h4>
          <p style="margin:0;font-size:0.9rem">${esc(sr.reception_exterior || '—')}</p>
        </div>
        <div class="rec-section">
          <h4>${I('user')} État intérieur</h4>
          <p style="margin:0;font-size:0.9rem">${esc(sr.reception_interior || '—')}</p>
        </div>
        ${sr.reception_observations ? `
        <div class="rec-section">
          <h4>${I('alert-circle')} Observations</h4>
          <p style="margin:0;font-size:0.9rem">${esc(sr.reception_observations)}</p>
        </div>` : ''}
        <div class="doc-foot">
          <div class="doc-sign">
            <span class="detail-label">Signé - ${esc(collab)}</span>
            ${sr.reception_validated_at
              ? `<div class="signature-preview">${esc(sr.client_name || 'Client')} ✔</div><span class="hint" style="font-size:0.7rem">validé le ${new Date(sr.reception_validated_at).toLocaleDateString('fr')}</span>`
              : `<div class="sig-line"></div>`}
          </div>
          <span class="chip ${sr.reception_validated_at ? 'ok' : 'warn'}">
            ${sr.reception_validated_at ? I('check-circle')+' Validé par le client' : I('clock')+' En attente de validation'}
          </span>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   PRO: SERVICE REQUEST DETAIL (workflow accept → reception → diag → devis)
   ============================================================ */
async function viewProServiceRequestDetail(id) {
  showLoading();
  try {
    const d = await api('/service-requests/' + id);
    const sr = d.service_request || d;
    const history = d.history || [];
    const { active } = srWorkflowIdx(sr.status);

    let stepHtml = '';
    let actionsHtml = '';
    switch (sr.status) {
      case 'PROFESSIONAL_SELECTED':
        stepHtml = `
          <div class="alert alert-warn">${I('clock')}<div><b>Action requise</b><p style="margin:.2rem 0 0">Le client vous a confié cette demande. Acceptez la prise en charge ou refusez-la.</p></div></div>`;
        actionsHtml = `
          <div class="card" style="margin-bottom:1rem">
            <h3 style="margin:0 0 .4rem">${I('help-circle')} Décision attendue</h3>
            <p class="hint" style="margin:0 0 .8rem">En acceptant, vous vous engagez à réceptionner le véhicule et réaliser les travaux demandés.</p>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap">
              <button class="btn btn-primary" id="btn-accept-sr">${I('check')} Accepter la prise en charge</button>
              <button class="btn btn-ghost btn-ko" id="btn-refuse-sr">${I('x')} Refuser la demande</button>
            </div>
          </div>`;
        break;

      case 'PRO_ACCEPTED':
        stepHtml = `
          <div class="alert alert-ok">${I('check-circle')}<div><b>Demande acceptée</b><p style="margin:.2rem 0 0">Étape suivante : réceptionnez le véhicule, puis soumettez la fiche au client pour relecture.</p></div></div>`;
        actionsHtml = `
          <div class="card" style="margin-bottom:1rem">
            <h3 style="margin:0 0 .4rem">${I('truck')} Formulaire de réception</h3>
            <p class="hint" style="margin:0 0 .8rem">Le VIN est relevé <b>par vos soins</b> sur le véhicule (plaque constructeur, tableau de bord…). Laissez vide si non concerné.</p>
            <div class="rec-section">
              <h4>${I('tag')} Identification du véhicule</h4>
              <div class="rec-grid">
                <div style="grid-column: span 2">
                  <label>Numéro VIN (17 caractères)</label>
                  <input id="rec-vin" maxlength="17" placeholder="WVWZZZ1JZXW000000" style="text-transform:uppercase">
                </div>
                <div><label>Kilométrage au compteur</label><input id="rec-km" type="number" min="0" placeholder="125000"></div>
              </div>
            </div>
            <div class="rec-section">
              <h4>${I('fuel')} Niveau & remise</h4>
              <div class="rec-grid">
                <div><label>Niveau de carburant</label>
                  <select id="rec-fuel">
                    <option value="PLEIN">Plein</option>
                    <option value="3_4">3/4</option>
                    <option value="1_2">1/2</option>
                    <option value="1_4">1/4</option>
                    <option value="RESERVE">Réserve</option>
                  </select>
                </div>
                <div><label>Clés fournies</label>
                  <select id="rec-keys"><option value="true">Oui</option><option value="false">Non</option></select>
                </div>
              </div>
            </div>
            <div class="rec-section">
              <h4>${I('camera')} État apparent du véhicule</h4>
              <div style="display:flex;flex-direction:column;gap:.8rem">
                <div><label>État extérieur <span class="hint">(rayures, chocs, jantes…)</span></label><input id="rec-exterior" placeholder="Ex : rayure pare-chocs avant droit, jante AVG éraflée"></div>
                <div><label>État intérieur <span class="hint">(propreté, objets, odeurs…)</span></label><input id="rec-interior" placeholder="Ex : intérieur propre, aucun objet volumineux"></div>
                <div><label>${I('camera')} Photos extérieur <span class="hint">options / 18 Mo max par fichier</span></label>
                  <input id="rec-photo-ext" type="file" accept="image/jpeg,image/png,image/webp" multiple>
                  <small class="hint" id="rec-photo-ext-n" style="display:block;margin:.2rem 0 0">Aucune photo</small>
                </div>
                <div><label>${I('camera')} Photos intérieur <span class="hint">options / 18 Mo max par fichier</span></label>
                  <input id="rec-photo-int" type="file" accept="image/jpeg,image/png,image/webp" multiple>
                  <small class="hint" id="rec-photo-int-n" style="display:block;margin:.2rem 0 0">Aucune photo</small>
                </div>
                <div><label>Observations générales</label><textarea id="rec-obs" rows="2" placeholder="Remarques particulières (voyants allumés, bruits…)""></textarea></div>
              </div>
            </div>
            <button class="btn btn-primary" id="btn-submit-reception">${I('send')} Soumettre la fiche au client pour validation</button>
          </div>`;
        break;

      case 'VEHICLE_RECEIVED':
        stepHtml = `
          <div class="alert alert-warn">${I('clock')}<div><b>En attente de validation du client</b><p style="margin:.2rem 0 0">La fiche de réception a été transmise. Le client doit la valider avant que vous puissiez lancer le diagnostic.</p></div></div>`;
        actionsHtml = renderReceptionCard(sr, { collabLabel: 'AutoPro Garage • Atelier' });
        break;

      case 'RECEPTION_VALIDATED':
        stepHtml = `
          <div class="alert alert-ok">${I('check-circle')}<div><b>Réception validée par le client</b><p style="margin:.2rem 0 0">Vous pouvez désormais ouvrir l'intervention et lancer le diagnostic du véhicule.</p></div></div>`;
        actionsHtml = renderReceptionCard(sr, { collabLabel: 'AutoPro Garage • Atelier' }) + `
          <div class="card" style="margin-bottom:1rem">
            <h3 style="margin:0 0 .4rem">${I('search')} Démarrer le diagnostic</h3>
            <p class="hint" style="margin:0 0 .8rem">Cette action crée l'intervention et vous dirige vers la console de diagnostic.</p>
            <button class="btn btn-primary" id="btn-start-diag">${I('settings')} Ouvrir l'intervention & lancer le diagnostic</button>
          </div>`;
        break;

      case 'DIAGNOSIS':
        stepHtml = `
          <div class="alert alert-info">${I('search')}<div><b>Diagnostic en cours</b><p style="margin:.2rem 0 0">Réalisez le diagnostic technique puis établissez votre devis, qui sera soumis au client.</p></div></div>`;
        actionsHtml = renderReceptionCard(sr, { collabLabel: 'AutoPro Garage • Atelier' });
        if (sr.intervention_id) {
          actionsHtml += `<a href="#/repairs/${sr.intervention_id}" class="btn btn-primary">${I('settings')} Ouvrir l'intervention</a>`;
        }
        break;

      default:
        actionsHtml = `<div class="card" style="margin-bottom:1rem">${statusBadge(sr.status)}</div>`;
    }

    layoutApp(`
      <a href="#/pro/service-requests" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour aux demandes</a>
      <div class="page-top"><h1>${I('file-text')} Demande de service</h1><div>${statusBadge(sr.status)}</div></div>
      ${renderSrWorkflow(sr.status)}

      <div class="card" style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;align-items:center">
          <div>
            <h3>${I('car')} ${esc(sr.make || '')} ${esc(sr.model || '')}</h3>
            <div class="hint">${esc(sr.plate || '')} ${sr.year ? '· ' + esc(sr.year) : ''}</div>
          </div>
          <div class="hint" style="text-align:right">${I('calendar')} Demande du ${sr.created_at ? new Date(sr.created_at).toLocaleString('fr') : ''}<br><span class="chip accent" style="margin-top:.2rem">${I('user')} ${esc(sr.client_name || 'Client')}</span></div>
        </div>
        <div class="rec-section">
          <h4>${I('alert-triangle')} Motif d'intervention</h4>
          <p style="margin:0;font-size:0.9rem">${esc(sr.problem_description || '')}</p>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:.6rem">
          ${sr.category ? `<span class="badge badge-accent">${esc(sr.category)}</span>` : ''}
          ${sr.urgency ? `<span class="badge badge-${sr.urgency==='CRITIQUE'?'ko':sr.urgency==='URGENT'?'warn':'ok'}">${esc(sr.urgency)}</span>` : ''}
          ${sr.preferred_date ? `<span class="badge badge-muted">${I('calendar')} Préféré : ${esc(fmtPrefDate(sr.preferred_date))}</span>` : ''}
        </div>
      </div>

      ${stepHtml}
      ${actionsHtml}

      ${history.length ? `
      <div class="card" style="margin-bottom:1rem">
        <h3 style="margin:0 0 .6rem">${I('clock')} Historique de la demande</h3>
        <div class="timeline" style="margin-top:0.5rem">${history.map(h => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-card card">
              <div class="timeline-date">${h.created_at ? new Date(h.created_at).toLocaleString('fr') : ''}</div>
              <p style="margin:0;font-size:0.88rem">${esc(h.notes || '')}</p>
            </div>
          </div>`).join('')}</div>
      </div>` : ''}
    `);

    const acceptBtn = document.getElementById('btn-accept-sr');
    if (acceptBtn) {
      acceptBtn.onclick = async () => {
        try {
          await api('/service-requests/' + id + '/accept', { method: 'POST', body: {} });
          toast('Prise en charge acceptée', 'success');
          viewProServiceRequestDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const refuseBtn = document.getElementById('btn-refuse-sr');
    if (refuseBtn) {
      refuseBtn.onclick = async () => {
        const reason = await UX.prompt('Motif du refus (optionnel) :');
        if (reason === null) return;
        try {
          await api('/service-requests/' + id + '/refuse', { method: 'POST', body: { reason: reason || 'Indisponible' } });
          toast('Demande refusée', 'info');
          location.hash = '#/pro/service-requests';
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const submitRec = document.getElementById('btn-submit-reception');
    if (submitRec) {
      submitRec.onclick = async () => {
        const vin = document.getElementById('rec-vin').value.trim().toUpperCase();
        const kmEl = document.getElementById('rec-km');
        const mileage = kmEl.value ? parseInt(kmEl.value, 10) : null;
        if (vin && vin.length !== 17) { return toast('VIN invalide : 17 caractères requis', 'error'); }
        const photos = [];
        for (const selId of ['rec-photo-ext', 'rec-photo-int']) {
          const sel = document.getElementById(selId);
          if (sel && sel.files) {
            for (const f of Array.from(sel.files)) {
              if (f.size > 18 * 1024 * 1024) { return toast('Photo trop lourde : 18 Mo max', 'error'); }
              const fd = new FormData(); fd.append('file', f); fd.append('category', 'PHOTO'); fd.append('visibility', 'pro'); fd.append('name', 'Inspection réception - ' + (selId === 'rec-photo-ext' ? 'extérieur' : 'intérieur'));
              try {
                const r = await api('/documents', { method: 'POST', body: fd });
                photos.push(r.document && r.document.id);
              } catch (e) { return toast((e.message || 'Photo impossible à envoyer') + ' (' + f.name + ')', 'error'); }
            }
          }
        }
        const body = {
          vin: vin || null,
          ...(mileage != null ? { mileage } : {}),
          fuel_level: document.getElementById('rec-fuel').value,
          keys_provided: document.getElementById('rec-keys').value === 'true',
          exterior: document.getElementById('rec-exterior').value,
          interior: document.getElementById('rec-interior').value,
          observations: document.getElementById('rec-obs').value,
          ...(photos.length ? { photos } : {})
        };
        if (!(await UX.confirm('Soumettre cette fiche de réception au client pour validation ?', { title: 'Fiche de réception', okLabel: 'Soumettre la fiche', icon: 'send' }))) return;
        try {
          await api('/service-requests/' + id + '/reception', { method: 'POST', body });
          toast('Fiche transmise au client', 'success');
          viewProServiceRequestDetail(id);
        } catch(e) { toast(e.message, 'error'); }
      };
    }
    const startDiag = document.getElementById('btn-start-diag');
    if (startDiag) {
      startDiag.onclick = async () => {
        try {
          const r = await api('/service-requests/' + id + '/start-diagnosis', { method: 'POST', body: {} });
          const iid = r.service_request && r.service_request.intervention_id;
          if (iid) { location.hash = '#/repairs/' + iid; }
          else { location.hash = '#/pro/service-requests/' + id; }
        } catch(e) { toast(e.message, 'error'); }
      };
    }
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO: REPAIRS
   ============================================================ */
async function viewProRepairs() {
  showLoading();
  try {
    const { repairs } = await api('/repairs');
    layoutApp(`
      <div class="section-title" style="margin-bottom:1rem">${I('settings')} Mes interventions</div>
      <div class="grid-cards">
        ${repairs.map(r => `
          <a href="#/repairs/${r.id}" class="card veh-card-link">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
              <strong>${esc(r.make||'')} ${esc(r.model||'')} — ${esc(r.plate||'')}</strong>
              ${statusBadge(r.status)}
            </div>
            <p style="font-size:0.75rem;color:var(--muted);margin:0">${new Date(r.created_at).toLocaleDateString('fr')}</p>
          </a>
        `).join('')}
        ${!repairs.length ? '<div class="empty-state">' + I('inbox') + '<h3>Aucune intervention</h3></div>' : ''}
      </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO: QUOTES
   ============================================================ */
async function viewProQuotes() {
  showLoading();
  try {
    const { quotes } = await api('/quotes');
    layoutApp(`
      <div class="section-title" style="margin-bottom:1rem">${I('file-text')} Mes devis</div>
      <div class="grid-cards">
        ${quotes.map(q => `
          <a href="#/quotes/${q.id}" class="card veh-card-link">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
              <strong>${esc(q.make||'')} ${esc(q.model||'')}</strong>
              ${statusBadge(q.status)}
            </div>
            <p style="font-size:1.1rem;font-weight:700;color:var(--accent)">${money(q.total_cents)}</p>
            <p style="font-size:0.75rem;color:var(--muted);margin:0">${new Date(q.created_at).toLocaleDateString('fr')}</p>
          </a>
        `).join('')}
        ${!quotes.length ? '<div class="empty-state">' + I('file-text') + '<h3>Aucun devis</h3></div>' : ''}
      </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO: APPOINTMENTS
   ============================================================ */
async function viewProAppointments() {
  showLoading();
  try {
    const { appointments } = await api('/appointments').catch(()=>({appointments:[]}));
    layoutApp(`
      <div class="section-title" style="margin-bottom:1rem">${I('calendar')} Agenda</div>
      <div class="grid-cards">
        ${(appointments||[]).map(a => `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
              <strong>${new Date(a.scheduled_at).toLocaleDateString('fr')} ${new Date(a.scheduled_at).toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'})}</strong>
              ${statusBadge(a.status)}
            </div>
            <p style="font-size:0.82rem;color:var(--muted);margin:0">Vehicule: ${esc(a.vehicle_id||'')}</p>
          </div>
        `).join('')}
        ${!(appointments||[]).length ? '<div class="empty-state">' + I('calendar') + '<h3>Aucun rendez-vous</h3></div>' : ''}
      </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO: RATINGS
   ============================================================ */
async function viewProRatings() {
  showLoading();
  try {
    const { ratings, breakdown } = await api('/ratings/professional/' + (S.user.professional_id || '')).catch(()=>({ratings:[],breakdown:{}}));
    layoutApp(`
      <div class="section-title" style="margin-bottom:1rem">${I('star')} Avis clients</div>
      ${breakdown.overall ? `
      <div class="grid-stats" style="margin-bottom:1.5rem">
        <div class="card dash-card"><div class="dash-card-title">Note globale</div><p style="font-size:1.8rem;font-weight:800;color:var(--warn)">${parseFloat(breakdown.overall).toFixed(1)} / 5</p><p style="font-size:0.75rem;color:var(--muted)">${parseInt(breakdown.total)} avis</p></div>
        <div class="card dash-card"><div class="dash-card-title">Qualite</div><p style="font-size:1.4rem;font-weight:700">${parseFloat(breakdown.quality||0).toFixed(1)}</p></div>
        <div class="card dash-card"><div class="dash-card-title">Delai</div><p style="font-size:1.4rem;font-weight:700">${parseFloat(breakdown.delay||0).toFixed(1)}</p></div>
        <div class="card dash-card"><div class="dash-card-title">Communication</div><p style="font-size:1.4rem;font-weight:700">${parseFloat(breakdown.communication||0).toFixed(1)}</p></div>
      </div>` : ''}
      <div class="grid-cards">
        ${ratings.map(r => `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
              <strong>${esc(r.author_name||'Anonyme')}</strong>
              <span class="star-display">${'★'.repeat(r.overall_stars||r.stars||0)}${'<span class=star-empty>★</span>'.repeat(5-(r.overall_stars||r.stars||0))}</span>
            </div>
            ${r.comment ? `<p style="font-size:0.82rem;color:var(--text2);margin:0.3rem 0">${esc(r.comment)}</p>` : ''}
            <p style="font-size:0.75rem;color:var(--muted);margin:0">${new Date(r.created_at).toLocaleDateString('fr')}</p>
          </div>
        `).join('')}
        ${!ratings.length ? '<div class="empty-state">' + I('star') + '<h3>Aucun avis</h3></div>' : ''}
      </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO: DISPUTES
   ============================================================ */
async function viewProDisputes() {
  showLoading();
  try {
    const { disputes } = await api('/disputes');
    layoutApp(`
      <div class="section-title" style="margin-bottom:1rem">${I('alert-triangle')} Litiges</div>
      <div class="grid-cards">
        ${disputes.map(d => `
          <a href="#/disputes/${d.id}" class="card veh-card-link">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">
              <strong>${esc(d.subject)}</strong>
              ${statusBadge(d.status)}
            </div>
            <p style="font-size:0.82rem;color:var(--muted);margin:0">${new Date(d.created_at).toLocaleDateString('fr')}</p>
          </a>
        `).join('')}
        ${!disputes.length ? '<div class="empty-state">' + I('check-circle') + '<h3>Aucun litige</h3></div>' : ''}
      </div>
    `);
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}

/* ============================================================
   PRO: PROFILE
   ============================================================ */
async function viewProProfile() {
  showLoading();
  try {
    const [meR, proR, docR] = await Promise.all([
      api('/auth/me').catch(() => null),
      api('/professionals/me').catch(() => null),
      api('/documents').catch(() => null)
    ]);
    const user = (meR && meR.user) || S.user;
    const pro = (proR && proR.professional) || null;
    const allDocs = (docR && docR.documents) || [];
    const attIds = (pro && pro.attestation_doc_ids) || [];
    const attDocs = attIds.map(id => allDocs.find(d => d.id === id)).filter(Boolean).map(d => ({
      id: d.id, name: d.original_name || d.name || 'Attestation', description: '', kind: String(d.mime || '').startsWith('image/') ? 'IMAGE' : 'FILE'
    }));
    const cert = pro && pro.is_certified ? `<span class="badge badge-accent">${I('award')} Certifié C-AUTO</span>` : '';
    const logoDocId = pro && pro.logo_url;
    const synth = pro && pro.synthesis
      ? (typeof pro.synthesis === 'string' ? (() => { try { return JSON.parse(pro.synthesis); } catch (_e) { return null; } })() : pro.synthesis)
      : null;
    /* Synthèse du profil : toujours affichée après soumission (fallback si absente) */
    const synthRows = [];
    const pushRow = (label, value) => { if (value != null && value !== '') synthRows.push([label, String(value)]); };
    pushRow('Nom', (synth && synth.name) || user.name);
    pushRow('Email', (synth && synth.email) || user.email);
    pushRow('Téléphone', (synth && synth.phone) || user.phone);
    pushRow('Garage / Atelier', (synth && synth.garage_name) || (pro && pro.garage_name) || '');
    pushRow('Ville', (synth && synth.city) || (pro && pro.city) || '');
    pushRow('Spécialité', (synth && synth.specialty) || (pro && pro.specialty) || '');
    if (pro) pushRow('Disponibilité', (synth && synth.is_available != null ? synth.is_available : pro.is_available) ? 'Oui — ouvert aux demandes' : 'Non');
    pushRow('Attestations fournies', (synth && synth.attestation_count != null) ? String(synth.attestation_count) : (pro ? String((pro.attestation_doc_ids || []).length) : '0'));
    pushRow('Dernière mise à jour', synth && synth.updated_at ? new Date(synth.updated_at).toLocaleString('fr') : (pro && pro.updated_at ? new Date(pro.updated_at).toLocaleString('fr') : '—'));
    const synthHtml = `
      <div class="card pp-synth-card">
        <div class="pp-synth-head">
          <h3>${I('file-text')} Synthèse du dossier soumis à l'admin</h3>
          ${pro ? verifBadge(pro.verification_status) : ''}
        </div>
        <div class="pp-synthesis" role="list">
          ${synthRows.length ? synthRows.map(r => `<div class="pp-srow" role="listitem"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('') : '<p class="hint">Complétez votre profil pour générer la synthèse.</p>'}
        </div>
        ${pro && pro.verification_status !== 'VERIFIED' ? `
          <div class="pp-submit-zone">
            <p class="hint">📤 Envoyez votre dossier : l'équipe C-AUTO le contrôle (identité, attestations) puis valide votre compte.</p>
            <button type="button" class="btn btn-primary" id="btn-pro-submit">${I('send')} Soumettre mon dossier pour validation</button>
          </div>` : (pro ? `<div class="pp-submit-zone"><span class="fl-chip ok">${I('check-circle')} Compte validé</span></div>` : '')}
      </div>`;
    layoutApp(`
      <div class="pro-profile">
        <div class="pro-profile-hero card">
          <div class="pp-avatar" style="position:relative">
            ${logoDocId ? `<img src="/api/documents/${logoDocId}/public" alt="Photo" style="width:64px;height:64px;border-radius:50%;object-fit:cover">` : I('user-cog')}
          </div>
          <div class="pp-ident">
            <h1>${esc(user.name)}${user.is_certified ? certBadge() : ''}</h1>
            <div class="pp-badges">${pro ? verifBadge(pro.verification_status) : ''}${cert}</div>
            <p class="hint">${esc(user.email)}${pro && pro.city ? ' · ' + esc(pro.city) : ''}${pro && pro.specialty ? ' · ' + esc(pro.specialty) : ''}</p>
          </div>
          <div class="pp-rating">
            <div class="pp-rating-stars">${'★'.repeat(Math.round(pro && pro.rating || 0) || 0)}${'☆'.repeat(5 - Math.round(pro && pro.rating || 0))}</div>
            <b>${Number(pro && pro.rating || 0).toFixed(1)}</b><span class="hint">${pro ? pro.rating_count + ' avis' : '—'}</span>
          </div>
        </div>

        ${pro ? proVerifBanner(pro.verification_status) : ''}

        <div class="pp-two">
          <div class="card">
            <h3>${I('settings-2')} Mon atelier</h3>
            <form id="f-pro-quick" class="pp-form">
              <label>Photo de profil
                <div style="display:flex;align-items:center;gap:0.8rem;margin:0.3rem 0">
                  <img id="pp-logo-prev" src="${logoDocId ? '/api/documents/'+logoDocId+'/public' : ''}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;${logoDocId ? '' : 'display:none'}">
                  <div><input type="file" id="pp-logo-file" accept="image/jpeg,image/png,image/webp"><p class="hint" style="margin:0.2rem 0 0">JPEG, PNG ou WebP.</p></div>
                </div>
              </label>
              <label>Ville <input name="city" value="${esc((pro && pro.city) || '')}" placeholder="Paris"></label>
              <label>Spécialité <select name="specialty">
                ${['MECANIQUE','CARROSSERIE','ELECTRICITE','DIAGNOSTIC','ENTRETIEN','PNEUMATIQUE','VITRERIE','AUTRE'].map(sx => `<option value="${sx}" ${pro && pro.specialty === sx ? 'selected' : ''}>${esc(sx.charAt(0) + sx.slice(1).toLowerCase())}</option>`).join('')}
              </select></label>
              <label class="pp-check"><input type="checkbox" name="is_available" ${pro && pro.is_available ? 'checked' : ''}> Je suis disponible pour de nouvelles demandes</label>
              <button class="btn btn-primary" type="submit">${I('save')} Enregistrer</button>
            </form>
          </div>
          <div class="card">
            <h3>${I('wallet')} Votre vitrine C-AUTO</h3>
            <div class="pp-shoplist">
              <a href="#/professionals" class="pp-shoplink">${I('users')} Apparaître dans l'annuaire clients</a>
              <a href="#/pro/warranties" class="pp-shoplink">${I('shield-check')} Gérer mes garanties atelier</a>
              <a href="#/chat" class="pp-shoplink">${I('message-square')} Messagerie clients ${I('chevron-right')}</a>
            </div>
            <p class="hint pp-hint">${I('info')} Un profil vérifié rassure vos clients : ajoutez vos attestations ci-dessous.</p>
          </div>
        </div>

        ${synthHtml}

        <div class="card att-card">
          <div class="att-head">
            <h3>${I('shield-plus')} Attestations & certifications</h3>
            <span class="hint">Documents contrôlés par l'équipe C-AUTO.</span>
          </div>
          ${pro ? attestationPanelHtml({ stored: attDocs, readOnly: false }) : '<p class="hint">Complétez d\'abord votre profil professionnel.</p>'}
          ${pro ? `<div class="att-actions"><button type="button" class="btn btn-primary" data-att-save ${attDocs.length ? '' : 'disabled'}>${I('save')} Enregistrer</button></div>` : ''}
        </div>
      </div>
    `);
    const submitBtn = document.getElementById('btn-pro-submit');
    if (submitBtn) submitBtn.onclick = async () => {
      try {
        await api('/professionals/me/submit', { method: 'POST' });
        toast('Dossier soumis — en attente de validation', 'success');
        viewProProfile();
      } catch (e) { toast(e.message || 'Soumission impossible', 'error'); }
    };
    let logoDocIdState = logoDocId || null;
    const logoFile = document.getElementById('pp-logo-file');
    if (logoFile) logoFile.onchange = async () => {
      const file = logoFile.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file); fd.append('category', 'PHOTO'); fd.append('visibility', 'public'); fd.append('name', 'Photo profil ' + user.name);
      try { const r = await api('/documents', { method: 'POST', body: fd }); logoDocIdState = r.document.id;
        const prev = document.getElementById('pp-logo-prev'); prev.src = '/api/documents/' + logoDocIdState + '/public?t=' + Date.now(); prev.style.display = ''; toast('Photo ajoutée', 'success');
      } catch (e2) { toast(e2.message || 'Import impossible', 'error'); }
    };
    const form = document.getElementById('f-pro-quick');
    if (form) form.onsubmit = async (ev) => {
      ev.preventDefault();
      const o = Object.fromEntries(new FormData(ev.target));
      try {
        const body = { city: o.city || '', specialty: o.specialty, is_available: !!o.is_available };
        if (logoDocIdState) body.logo_url = logoDocIdState;
        await api('/professionals/me', { method: 'PATCH', body });
        toast('Profil mis à jour — en attente de validation', 'success');
        viewProProfile();
      } catch (e) { toast(e.message || 'Mise à jour impossible', 'error'); }
    };
    const attRoot = document.querySelector('.att-card');
    if (attRoot && pro) attestationPanelWire(attRoot, {
      getStored: () => attDocs,
      onSave: async (ids) => { await api('/professionals/me', { method: 'PATCH', body: { attestation_doc_ids: ids } }); },
      readOnly: false,
      refresh: () => setTimeout(() => viewProProfile(), 250)
    });
  } catch(e) { layoutApp(err(e)); }
  hideLoading(); renderIcons();
}
