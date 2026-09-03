/* C-AUTO — MODULE 87 : INNOVATIONS (7 fonctionnalités)
   Hub + écrans dédiés reliés au backend /api/innovations/*.
   Dépend des helpers globaux définis dans app-v8.js : S, api, I, esc, money,
   layoutApp, toast, err, renderSidebar, statusBadge. */

'use strict';

/* ---------- petits utilitaires locaux ---------- */
function innCard(kind) { return window.UX ? UX.card(kind) : `<div class="card loading-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div>`; }
function innHeader(title, subtitle) {
  return `<div class="page-top"><div><h1>${title}</h1>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}</div></div>`;
}
function innErr(e) { return err(e); }
function assetBlock(vehicle, extraBtn) {
  return `<div class="card"><div class="card-h"><h3>${I('car')} Véhicule</h3>${extraBtn || ''}</div>
    <p><strong>${esc(vehicle.make)} ${esc(vehicle.model)}</strong> · ${esc(vehicle.year)} · ${money(vehicle.mileage)} km · ${esc(vehicle.plate)}</p></div>`;
}

/* ============== HUB ============== */
async function viewInnovations() {
  layoutApp(`<div class="page-top"><div><h1>${I('sparkles')} Innovations</h1><p class="muted">7 services premium pour aller plus loin que la réparation classique.</p></div></div>
    <div class="inn-grid">
      <a class="card inn-tile" href="#/innovations/avis">
        <span class="inn-ic">${I('camera')}</span><h3>Avis photo &amp; vidéo</h3>
        <p>Preuves visuelles et badge vérifié sur chantiers réels.</p>
      </a>
      <a class="card inn-tile" href="#/innovations/rappel">
        <span class="inn-ic">${I('bell-ring')}</span><h3>Rappels d'entretien</h3>
        <p>WhatsApp / SMS proactifs &agrave; la bonne &eacute;ch&eacute;ance.</p>
      </a>
      <a class="card inn-tile" href="#/innovations/sos">
        <span class="inn-ic">${I('siren')}</span><h3>SOS D&eacute;pannage</h3>
        <p>Assistance localisée et mise en relation immédiate.</p>
      </a>
      <a class="card inn-tile" href="#/innovations/forfaits">
        <span class="inn-ic">${I('shield-check')}</span><h3>Forfaits &amp; garantie</h3>
        <p>Entretien, remorquage et garantie prolong&eacute;e.</p>
      </a>
      <a class="card inn-tile" href="#/innovations/passeport">
        <span class="inn-ic">${I('qr-code')}</span><h3>Passeport QR</h3>
        <p>Historique auto partageable par lien s&eacute;curis&eacute;.</p>
      </a>
      <a class="card inn-tile" href="#/innovations/ev">
        <span class="inn-ic">${I('zap')}</span><h3>Recharge &amp; mobilit&eacute; verte</h3>
        <p>Bornes, profils batterie et bilan carbone.</p>
      </a>
      <a class="card inn-tile" href="#/innovations/valeur">
        <span class="inn-ic">${I('trending-up')}</span><h3>Valeur de revente</h3>
        <p>Estimation marché et suivi de la cote de votre véhicule.</p>
      </a>
    </div>
    <style>${INN_CSS}</style>`);
}

/* ============== 1. AVIS PHOTO/VIDEO ============== */
async function viewInnovationAvis() {
  try {
    layoutApp(innHeader(`${I('camera')} Avis photo & vidéo`, 'Mes avis avec preuves visuelles et badge vérifié.'));
    const [mineRes] = await Promise.allSettled([api('/reviews')]);
    const myRatings = (mineRes.status === 'fulfilled' && mineRes.value.ratings) ? mineRes.value.ratings : [];
    const rows = myRatings.map(r => `
      <div class="card">
        <div class="card-h">
          <h3>${r.overall_stars}/5 ${'★'.repeat(r.overall_stars)}${'☆'.repeat(5 - r.overall_stars)}</h3>
          <span class="badge ${r.verified ? 'badge-ok' : 'badge-muted'}">${r.verified ? 'Vérifié' : 'Non vérifié'} ${statusBadge ? '' : ''}</span>
        </div>
        <p>${esc(r.comment || '')}</p>
        <div class="inn-media">${(r.media || []).map(m => `<span class="badge badge-info">${esc(m.type)}</span>`).join(' ')}</div>
        <div class="card-actions">
          <button class="btn btn-sm" data-media="${r.id}">${I('plus')} Ajouter une photo/vidéo</button>
          <button class="btn btn-sm" data-verify="${r.id}">${I('check')} Vérifier</button>
        </div>
      </div>`).join('') || '<p class="muted">Aucun avis pour l\'instant.</p>';
    layoutApp(`${innHeader(`${I('camera')} Avis photo & vidéo`, 'Mes avis avec preuves visuelles et badge vérifié.')}<div class="grid-col">${rows}</div><style>${INN_CSS}</style>`);
    bindAvis();
  } catch (e) { layoutApp(`${innHeader('Avis')}${innErr(e)}<style>${INN_CSS}</style>`); }
}
function bindAvis() {
  document.querySelectorAll('[data-verify]').forEach(b => b.onclick = async () => {
    try { const d = await api(`/innovations/reviews/${b.dataset.verify}/verify`, { method: 'POST', body: {} }); toast(d.verified ? 'Avis vérifié' : 'Intervention terminée requise pour vérifier', d.verified ? 'success' : 'warn'); viewInnovationAvis(); }
    catch (e) { toast(e.message, 'error'); }
  });
  document.querySelectorAll('[data-media]').forEach(b => b.onclick = () => {
    const url = prompt('URL de la photo / vidéo :');
    if (!url) return;
    const type = confirm('Vidéo ?') ? 'VIDEO' : 'PHOTO';
    api(`/innovations/reviews/${b.dataset.media}/media`, { method: 'POST', body: { type, url } })
      .then(() => { toast('Média ajouté', 'success'); viewInnovationAvis(); })
      .catch(e => toast(e.message, 'error'));
  });
}

/* ============== 2. RAPPELS MAINTENANCE ============== */
async function viewInnovationRappel() {
  try {
    const vehicles = (await api('/vehicles')).vehicles || [];
    const reminders = (await api('/innovations/maintenance-reminders')).reminders || [];
    const rows = reminders.map(r => `
      <div class="card">
        <div class="card-h"><h3>${esc(r.title)}</h3>${statusBadge(r.status)}</div>
        <p class="muted">Prévu : ${esc(r.due_at ? new Date(r.due_at).toLocaleDateString('fr-FR') : '—')} · Canal : ${esc(r.channel)}</p>
      </div>`).join('') || '<p class="muted">Aucun rappel planifié.</p>';
    const vSel = vehicles.map(v => `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${v.plate}</option>`).join('');
    layoutApp(`${innHeader(`${I('bell-ring')} Rappels d'entretien`, 'Planifiez des rappels WhatsApp / SMS proactifs.')}
      <div class="card">
        <label>${I('car')} Véhicule
          <select id="rm-veh">${vSel}</select>
        </label>
        <label>${I('message-circle')} Canal
          <select id="rm-chan"><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option></select>
        </label>
        <button class="btn" id="rm-gen">${I('send')} Générer les rappels dus</button>
      </div>
      <h2>Mes rappels</h2><div class="grid-col">${rows}</div><style>${INN_CSS}</style>`);
    document.getElementById('rm-gen').onclick = async () => {
      const veh = document.getElementById('rm-veh').value; const chan = document.getElementById('rm-chan').value;
      if (!veh) return toast('Choisissez un véhicule', 'warn');
      try { const d = await api('/innovations/maintenance-reminders/generate', { method: 'POST', body: { vehicle_id: veh, channel: chan } }); toast(`${d.count} rappel(s) généré(s)`, 'success'); viewInnovationRappel(); }
      catch (e) { toast(e.message, 'error'); }
    };
  } catch (e) { layoutApp(`${innHeader('Rappels')}${innErr(e)}<style>${INN_CSS}</style>`); }
}

/* ============== 3. SOS / DEPANNAGE ============== */
async function viewInnovationSos() {
  try {
    const vehicles = (await api('/vehicles')).vehicles || [];
    const list = (await api('/innovations/sos')).sos_requests || [];
    const vSel = vehicles.map(v => `<option value="${v.id}">${esc(v.make)} ${esc(v.model)}</option>`).join('');
    const rows = list.map(s => `
      <div class="card">
        <div class="card-h"><h3>${I('siren')} SOS ${statusBadge(s.status)}</h3>
          ${['ACTIVE','FOUND'].includes(s.status) ? `<button class="btn btn-sm" data-cancel="${s.id}">${I('x')} Annuler</button>` : ''}
        </div>
        <p class="muted">${esc(s.problem || 'Panne')} · ${Math.round(s.latitude || 0)}/${Math.round(s.longitude || 0)}${s.address ? ' · ' + esc(s.address) : ''}</p>
      </div>`).join('') || '<p class="muted">Aucune demande SOS.</p>';
    layoutApp(`${innHeader(`${I('siren')} SOS Dépannage`, 'Demandez de l\'aide à proximité de votre position.')}
      <div class="card">
        <label>${I('car')} Véhicule <select id="sos-veh">${vSel}</select></label>
        <label>${I('map-pin')} Latitude <input id="sos-lat" type="number" step="any" placeholder="6.37"></label>
        <label>${I('map-pin')} Longitude <input id="sos-lng" type="number" step="any" placeholder="2.39"></label>
        <label>${I('message-square')} Problème <input id="sos-prob"></label>
        <button class="btn btn-danger" id="sos-send">${I('siren')} Envoyer SOS</button>
      </div>
      <h2>Historique</h2><div class="grid-col">${rows}</div><style>${INN_CSS}</style>`);
    document.getElementById('sos-send').onclick = async () => {
      const lat = parseFloat(document.getElementById('sos-lat').value); const lng = parseFloat(document.getElementById('sos-lng').value);
      if (isNaN(lat) || isNaN(lng)) return toast('Position requise', 'warn');
      try {
        const d = await api('/innovations/sos', { method: 'POST', body: { vehicle_id: document.getElementById('sos-veh').value || undefined, latitude: lat, longitude: lng, problem: document.getElementById('sos-prob').value } });
        toast(`SOS envoyé — ${d.matches ? d.matches.length : 0} pro(s) trouvé(s)`, 'success'); viewInnovationSos();
      } catch (e) { toast(e.message, 'error'); }
    };
    document.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
      try { await api(`/innovations/sos/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} }); toast('SOS annulé', 'success'); viewInnovationSos(); } catch (e) { toast(e.message, 'error'); }
    });
  } catch (e) { layoutApp(`${innHeader('SOS')}${innErr(e)}<style>${INN_CSS}</style>`); }
}

/* ============== 4. FORFAITS / GARANTIE ============== */
async function viewInnovationForfaits() {
  try {
    const plans = (await api('/innovations/service-plans/plans')).plans || [];
    const subs = (await api('/innovations/service-plans/subscriptions')).subscriptions || [];
    const vehicles = (await api('/vehicles')).vehicles || [];
    const vSel = vehicles.map(v => `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${v.plate}</option>`).join('');
    const planTiles = plans.map(p => `
      <div class="card">
        <h3>${esc(p.name)}</h3>
        <p class="price">${money(p.price_cents)} <span class="muted">/ ${p.period === 'MONTH' ? 'mois' : 'an'}</span></p>
        <ul class="muted">
          ${p.includes_checks ? '<li>Contrôles inclus</li>' : ''}
          ${p.emergency_towing ? '<li>Remorquage d\'urgence</li>' : ''}
          ${p.extended_warranty_months > 0 ? `<li>Garantie +${p.extended_warranty_months} mois</li>` : ''}
          ${p.priority_support ? '<li>Support prioritaire</li>' : ''}
        </ul>
        <button class="btn" data-sub="${p.code}">${I('shield-check')} Souscrire</button>
      </div>`).join('');
    const subRows = subs.map(s => `
      <div class="card"><div class="card-h"><h3>${esc(s.plan_name)}</h3>${statusBadge(s.status)}</div>
      <p class="muted">Fin : ${esc(s.ends_at ? new Date(s.ends_at).toLocaleDateString('fr-FR') : '—')}</p>
      <button class="btn btn-sm" data-cancel="${s.id}">${I('x')} Annuler</button></div>`).join('') || '<p class="muted">Aucun abonnement actif.</p>';
    layoutApp(`${innHeader(`${I('shield-check')} Forfaits & garantie`, 'Entretien, remorquage et garantie prolongée.')}
      <div class="card"><label>${I('car')} Véhicule concerné <select id="fp-veh">${vSel}</select></label></div>
      <div class="inn-grid">${planTiles}</div>
      <h2>Mes abonnements</h2><div class="grid-col">${subRows}</div><style>${INN_CSS}</style>`);
    document.querySelectorAll('[data-sub]').forEach(b => b.onclick = async () => {
      try { await api('/innovations/service-plans/subscribe', { method: 'POST', body: { plan_code: b.dataset.sub, vehicle_id: document.getElementById('fp-veh').value || undefined } }); toast('Abonné !', 'success'); viewInnovationForfaits(); } catch (e) { toast(e.message, 'error'); }
    });
    document.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
      try { await api(`/innovations/service-plans/subscriptions/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} }); toast('Abonnement annulé', 'success'); viewInnovationForfaits(); } catch (e) { toast(e.message, 'error'); }
    });
  } catch (e) { layoutApp(`${innHeader('Forfaits')}${innErr(e)}<style>${INN_CSS}</style>`); }
}

/* ============== 5. PASSEPORT QR ============== */
async function viewInnovationPasseport() {
  try {
    const vehicles = (await api('/vehicles')).vehicles || [];
    const vSel = vehicles.map(v => `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${v.plate}</option>`).join('');
    layoutApp(`${innHeader(`${I('qr-code')} Passeport QR`, 'Partagez l\'historique de votre véhicule par lien sécurisé.')}
      <div class="card">
        <label>${I('car')} Véhicule <select id="pp-veh">${vSel}</select></label>
        <label>${I('info')} Motif <input id="pp-purpose" placeholder="Visite technique, vente, garage..."></label>
        <label>${I('clock')} Expire dans (jours) <input id="pp-days" type="number" min="1" max="365" value="30"></label>
        <button class="btn" id="pp-create">${I('qr-code')} Créer un lien partageable</button>
        <div id="pp-result"></div>
      </div>
      <style>${INN_CSS}</style>`);
    document.getElementById('pp-create').onclick = async () => {
      const veh = document.getElementById('pp-veh').value; if (!veh) return toast('Choisissez un véhicule', 'warn');
      try {
        const d = await api(`/innovations/vehicle-insights/vehicles/${veh}/passport/share`, { method: 'POST', body: { purpose: document.getElementById('pp-purpose').value, expires_in_days: parseInt(document.getElementById('pp-days').value) || undefined } });
        const url = location.origin + d.url;
        document.getElementById('pp-result').innerHTML = `
          <div class="alert alert-ok">${I('check-circle')}<span>Lien créé — partageable ou scannable en QR.</span></div>
          <p><a href="${esc(d.url)}" target="_blank">${esc(url)}</a></p>`;
        try {
          if (window.qrPrint) { window.qrPrint(url); }
          else { const img = await api(`/innovations/vehicle-insights/vehicles/${veh}/passport/qr`, { method: 'GET' }); }
        } catch (e) { /* QR optionnel */ }
        toast('Passeport partagé', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
  } catch (e) { layoutApp(`${innHeader('Passeport QR')}${innErr(e)}<style>${INN_CSS}</style>`); }
}

/* ============== 6. RECHARGE & MOBILITE VERTE ============== */
async function viewInnovationEv() {
  try {
    const vehicles = (await api('/vehicles')).vehicles || [];
    const vSel = vehicles.map(v => `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${v.plate}</option>`).join('');
    layoutApp(`${innHeader(`${I('zap')} Recharge & mobilité verte`, 'Recherchez des bornes, profilez votre véhicule électrique et suivez votre impact.')}
      <div class="card">
        <h3>${I('search')} Rechercher des bornes</h3>
        <label>Latitude <input id="ev-lat" type="number" step="any" placeholder="6.37"></label>
        <label>Longitude <input id="ev-lng" type="number" step="any" placeholder="2.39"></label>
        <button class="btn" id="ev-search">${I('map')} Chercher autour de moi</button>
        <div id="ev-stations" class="inn-media"></div>
      </div>
      <div class="card">
        <h3>${I('battery-charging')} Profil de recharge</h3>
        <label>${I('car')} Véhicule <select id="ev-veh">${vSel}</select></label>
        <label>Capacité batterie (kWh) <input id="ev-batt" type="number" step="any"></label>
        <label>Type de connecteur <input id="ev-con"></label>
        <button class="btn" id="ev-save">${I('save')} Enregistrer le profil</button>
      </div>
      <style>${INN_CSS}</style>`);
    document.getElementById('ev-search').onclick = async () => {
      const lat = parseFloat(document.getElementById('ev-lat').value); const lng = parseFloat(document.getElementById('ev-lng').value);
      if (isNaN(lat) || isNaN(lng)) return toast('Position requise', 'warn');
      try {
        const d = await api(`/innovations/eco-mobility/stations?latitude=${lat}&longitude=${lng}&radius_km=30`);
        document.getElementById('ev-stations').innerHTML = (d.stations || []).map(s =>
          `<span class="badge badge-info">${esc(s.name)} · ${s.power_kw}kW · ${money(s.price_per_kwh_cents)}/kWh</span>`).join(' ') || '<p class="muted">Aucune borne à proximité.</p>';
      } catch (e) { toast(e.message, 'error'); }
    };
    document.getElementById('ev-save').onclick = async () => {
      const veh = document.getElementById('ev-veh').value; if (!veh) return toast('Choisissez un véhicule', 'warn');
      try {
        await api('/innovations/eco-mobility/charging-profile', { method: 'POST', body: { vehicle_id: veh, battery_kwh: parseFloat(document.getElementById('ev-batt').value) || undefined, connector_type: document.getElementById('ev-con').value } });
        toast('Profil enregistré', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
  } catch (e) { layoutApp(`${innHeader('Recharge')}${innErr(e)}<style>${INN_CSS}</style>`); }
}

/* ============== 7. VALEUR DE REVENTE ============== */
async function viewInnovationValeur() {
  try {
    const vehicles = (await api('/vehicles')).vehicles || [];
    const vSel = vehicles.map(v => `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${v.plate}</option>`).join('');
    layoutApp(`${innHeader(`${I('trending-up')} Valeur de revente`, 'Estimation marché de votre véhicule.')}
      <div class="card"><label>${I('car')} Véhicule <select id="vl-veh">${vSel}</select></label>
        <button class="btn" id="vl-go">${I('calculator')} Estimer</button></div>
      <div id="vl-result"></div><style>${INN_CSS}</style>`);
    document.getElementById('vl-go').onclick = async () => {
      const veh = document.getElementById('vl-veh').value; if (!veh) return toast('Choisissez un véhicule', 'warn');
      try {
        const d = await api(`/innovations/vehicle-insights/vehicles/${veh}/valuation`);
        const v = d.valuation; const f = d.factors || {};
        document.getElementById('vl-result').innerHTML = `
          <div class="card price-card">
            <p class="muted">Valeur estimée</p>
            <h2 class="price">${money(v.estimated_value_cents)}</h2>
            <p class="muted">Fourchette : ${money(v.market_min_cents)} – ${money(v.market_max_cents)}</p>
          </div>
          <div class="card"><h3>Facteurs</h3><ul class="muted">
            <li>Âge : ${f.age_years} an(s)</li><li>Kilométrage : ${money(f.mileage)} km (facteur ${f.mileage_factor})</li>
            <li>Santé : ${f.health_score}/100</li></ul>
          </div>`;
      } catch (e) { toast(e.message, 'error'); }
    };
  } catch (e) { layoutApp(`${innHeader('Valeur')}${innErr(e)}<style>${INN_CSS}</style>`); }
}

/* ---------- styles scoped ---------- */
const INN_CSS = `
.inn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.inn-tile{display:block;text-decoration:none;color:inherit;transition:transform .15s ease,box-shadow .15s ease}
.inn-tile:hover{transform:translateY(-3px)}
.inn-ic{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--accent,#1877F2),var(--accent-2,#4a6cc0));color:#fff;margin-bottom:10px}
.inn-tile h3{margin:0 0 4px;font-size:15px}
.inn-tile p{margin:0;font-size:13px;color:var(--muted,#6b7280)}
.inn-media{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.grid-col{display:grid;gap:12px}
.card .price{font-size:22px;font-weight:700;margin:4px 0}
.price-card{margin-bottom:12px}
.muted{color:var(--muted,#6b7280)}
`;

/* Exposition globale pour le routeur (app-v8.js) */
window.viewInnovations = viewInnovations;
window.viewInnovationAvis = viewInnovationAvis;
window.viewInnovationRappel = viewInnovationRappel;
window.viewInnovationSos = viewInnovationSos;
window.viewInnovationForfaits = viewInnovationForfaits;
window.viewInnovationPasseport = viewInnovationPasseport;
window.viewInnovationEv = viewInnovationEv;
window.viewInnovationValeur = viewInnovationValeur;
