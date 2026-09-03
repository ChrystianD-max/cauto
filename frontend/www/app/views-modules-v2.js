/* =============================================================================
   C-AUTO MODULES — Pièces (#28) / Fournisseur (#29) / Mobile (#30) / Flotte (#31)
   ============================================================================= */

/* ---------- utilitaires partagés ---------- */
const MOD_CATS = ['OEM', 'PREMIUM', 'ALTERNATIVE'];
const PART_ORDER_LABELS = { PENDING: 'En attente', CONFIRMED: 'Confirmée', SHIPPED: 'Expédiée', DELIVERED: 'Livrée', CANCELLED: 'Annulée' };
const mqQ = (key) => JSON.parse(localStorage.getItem('mq.' + key) || 'null');
const mqS = (key, val) => localStorage.setItem('mq.' + key, JSON.stringify(val));
const offlineQueue = {
  pending() { return JSON.parse(localStorage.getItem('mq.queue') || '[]'); },
  add(item) { const q = this.pending(); q.push(item); localStorage.setItem('mq.queue', JSON.stringify(q)); },
  clear() { localStorage.removeItem('mq.queue'); },
};
const mobileOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/* =============================================================================
   28. C-AUTO PIÈCES — client / recherche / compatibilité / commandes
   ============================================================================= */
async function viewParts() {
  showLoading();
  try {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const q = params.get('q') || '';
    const cat = params.get('cat') || '';
    const vehicle = params.get('vehicle') || '';
    const vin = params.get('vin') || '';
    const qs = new URLSearchParams({ limit: 60 });
    if (q) qs.set('q', q);
    if (cat) qs.set('category', cat);
    if (vehicle) qs.set('vehicle_id', vehicle);
    if (vin) qs.set('vin', vin);
    const [d, vehicles] = await Promise.all([api('/parts?' + qs.toString()), api('/vehicles').catch(() => ({ vehicles: [] }))]);
    const res = d;
    layoutApp(`
      <div class="page-top"><h1>${I('package')} Catalogue pièces</h1>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <a href="#/parts/orders" class="btn btn-ghost">${I('shopping-cart')} Mes commandes</a>
          <a href="#/suppliers" class="btn btn-ghost">${I('truck')} Fournisseurs</a>
        </div>
      </div>
      <form id="pt-search" class="card" style="margin-bottom:1rem">
        <div class="form-row-3">
          <label>Recherche <input name="q" placeholder="Référence, nom, marque…" value="${esc(q)}"></label>
          <label>Véhicule <select name="vehicle"><option value="">— Tous véhicules —</option>${
            (vehicles.vehicles || []).map(v=>`<option value="${v.id}" ${vehicle===v.id?'selected':''}>${esc(v.make)} ${esc(v.model)} ${v.year} (${esc(v.plate)})</option>`).join('')
          }</select></label>
          <label>VIN <input name="vin" placeholder="Ex: VF1AAAA…" value="${esc(vin)}" maxlength="20"></label>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;margin-top:0.4rem">
          <span style="color:var(--muted);font-size:0.85rem">Catégorie :</span>
          ${['', ...MOD_CATS].map(c=>`<button type="button" class="btn btn-sm ${cat===c?'btn-primary':''}" data-cat="${c}">${c||'Toutes'}</button>`).join('')}
          <button type="submit" class="btn" style="margin-left:auto">${I('search')} Rechercher</button>
        </div>
      </form>
      <p class="hint" style="margin-bottom:0.6rem">${res.total} pièce(s) — La compatibilité est vérifiée par marque / modèle / année${vin||vehicle?' et VIN.':'.'}</p>
      <div class="grid-3">${
        (res.parts || []).map(p=>`
          <div class="card rise">
            ${partImg(p, 'part-thumb part-thumb-lg')}
            <div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:flex-start">
              <div>
                <span class="badge badge-muted">${esc(p.category)}</span>
                <h3 style="margin:0.4rem 0 0.2rem">${esc(p.name)}</h3>
                <div class="hint">Réf <b>${esc(p.reference)}</b>${p.brand ? ' · '+esc(p.brand) : ''}</div>
              </div>
              ${p.stock_quantity>0 ? `<span class="badge badge-ok">En stock</span>` : `<span class="badge badge-ko">Épuisé</span>`}
            </div>
            ${p.description ? `<p class="hint" style="margin:0.5rem 0">${esc(p.description)}</p>` : ''}
            <p style="margin:0.5rem 0 0.2rem"><b>${money(p.unit_price_cents)}</b> <span class="hint">· ${p.supplier_name || '—'}</span></p>
            <a href="#/parts/${p.id}" class="btn btn-sm" style="margin-top:0.4rem">${I('eye')} Détail</a>
          </div>`).join('') || '<p class="hint">Aucune pièce trouvée.</p>'
      }</div>
    `);
    const form = document.getElementById('pt-search');
    form.onsubmit = (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(form)); const p = new URLSearchParams(); if(o.q)p.set('q',o.q); if(o.vehicle)p.set('vehicle',o.vehicle); if(o.vin)p.set('vin',o.vin); location.hash = '#/parts?' + p.toString(); };
    form.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      const o = Object.fromEntries(new FormData(form)); const p = new URLSearchParams();
      if(o.q)p.set('q',o.q); if(o.vehicle)p.set('vehicle',o.vehicle); if(o.vin)p.set('vin',o.vin);
      if(b.dataset.cat)p.set('cat', b.dataset.cat); location.hash = '#/parts?' + p.toString();
    });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewPartDetail(id) {
  showLoading();
  try {
    const [d, vehicleD] = await Promise.all([api('/parts/' + id), api('/vehicles').catch(() => ({ vehicles: [] }))]);
    const p = d.part; const comps = d.compatibility || [];
    layoutApp(`
      <a href="#/parts" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour au catalogue</a>
      <div class="page-top"><h1>${I('package')} ${esc(p.name)}</h1>
        <span class="status-badge status-${esc(p.category)}">${esc(p.category)}</span>
      </div>
      <div class="grid-2" style="align-items:start">
        <div class="card">
          ${partImg(p, 'part-thumb part-thumb-xl')}
          <div class="detail-label">Référence</div><div class="detail-value">${esc(p.reference)}</div>
          <div class="detail-label">Marque</div><div class="detail-value">${esc(p.brand || '—')}</div>
          <div class="detail-label">Fournisseur</div><div class="detail-value">${esc(p.supplier_name || '—')}${p.supplier_rating?` <span class="hint">(★ ${p.supplier_rating})</span>`:''}</div>
          <div class="detail-label">Prix unitaire</div><div class="detail-value"><b>${money(p.unit_price_cents)}</b></div>
          <div class="detail-label">Stock</div>
          <div class="detail-value">${p.stock_quantity} ${p.stock_quantity <= p.min_stock ? '<span class="badge badge-warn">Stock bas</span>' : ''}</div>
          ${p.description ? `<div class="detail-label">Description</div><div class="detail-value">${esc(p.description)}</div>` : ''}
        </div>
        <div class="card">
          ${p.stock_quantity > 0 ? `
          <div class="section-title" style="margin-bottom:0.8rem">${I('shopping-cart')} Commander</div>
          <form id="pt-order">
            <label>Quantité <input name="quantity" type="number" min="1" max="${p.stock_quantity}" value="1" required></label>
            ${vehicleD.vehicles && vehicleD.vehicles.length ? `<label>Pour le véhicule <select name="vehicle_id"><option value="">— Sans véhicule —</option>${
              vehicleD.vehicles.map(v=>`<option value="${v.id}">${esc(v.make)} ${esc(v.model)} ${v.year} (${esc(v.plate)})</option>`).join('')}</select></label>` : ''}
            <label>Adresse de livraison <input name="address" placeholder="Adresse de livraison"></label>
            <label>Note <input name="notes" placeholder="Commentaire optionnel"></label>
            <button type="submit" style="margin-top:0.7rem">${I('check')} Commander — <span id="pt-total">${money(p.unit_price_cents)}</span></button>
          </form>` : `<div class="alert alert-ko">${I('alert-circle')}<span>Pièce actuellement indisponible (stock épuisé).</span></div>`}
        </div>
      </div>
      <div class="section-title" style="margin-top:1.2rem">${I('check-square')} Compatibilité véhicules vérifiée</div>
      <div class="card">
        ${comps.length ? comps.map(c=>`<div class="detail-label" style="margin-top:0.4rem">${esc(c.make)} ${esc(c.model)}</div><div class="detail-value">Années ${c.year_from}–${c.year_to}${c.engine?' · '+esc(c.engine):''}${c.fuel_type?' · '+esc(c.fuel_type):''}</div>`).join('')
          : '<p class="hint">Aucune compatibilité déclarée pour cette pièce. Vérifiez auprès du fournisseur.</p>'}
      </div>
    `);
    const f = document.getElementById('pt-order');
    if (f) {
      f.querySelector('[name=quantity]').oninput = (e) => { document.getElementById('pt-total').textContent = money(p.unit_price_cents * Math.max(1, +e.target.value || 1)); };
      f.onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(f));
        try { await api('/parts/orders', { method: 'POST', body: { part_id: id, quantity: +o.quantity, vehicle_id: o.vehicle_id || null, address: o.address, notes: o.notes } });
          toast('Commande envoyée au fournisseur', 'success'); location.hash = '#/parts/orders'; }
        catch (e2) { toast(e2.message, 'error'); } };
    }
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewPartsOrders() {
  showLoading();
  try {
    const d = await api('/parts/orders');
    layoutApp(`
      <div class="page-top"><h1>${I('shopping-cart')} Mes commandes de pièces</h1>
        <a href="#/parts" class="btn btn-ghost">${I('package')} Catalogue</a>
      </div>
      ${(d.orders || []).length ? `<div class="card"><table class="table">
        <thead><tr><th>Pièce</th><th>Réf</th><th>Qté</th><th>Total</th><th>Fournisseur</th><th>Véhicule</th><th>Statut</th></tr></thead>
        <tbody>${d.orders.map(o=>`<tr>
          <td>${esc(o.part_name)}</td><td>${esc(o.part_reference)}</td>
          <td>${o.quantity}</td><td><b>${money(o.total_cents)}</b></td>
          <td>${esc(o.supplier_name || '—')}</td>
          <td>${o.make ? `${esc(o.make)} ${esc(o.model)} ${esc(o.plate || '')}` : '—'}</td>
          <td><span class="status-badge status-${esc(o.status)}">${esc(PART_ORDER_LABELS[o.status]||o.status)}</span></td>
        </tr>`).join('')}</tbody></table></div>`
        : `<div class="card"><p class="hint">Aucune commande pour l'instant. Parcourez le catalogue et commandez une pièce.</p></div>`}
    `);
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewSuppliers() {
  showLoading();
  try {
    const d = await api('/suppliers?active=true');
    layoutApp(`
      <div class="page-top"><h1>${I('truck')} Fournisseurs de pièces</h1>
        <a href="#/parts" class="btn btn-ghost">${I('package')} Catalogue</a>
      </div>
      <div class="grid-3">${
        (d.suppliers || []).map(s=>`
          <div class="card rise">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem">
              <h3 style="margin:0">${esc(s.name)}</h3>
              <span class="badge badge-muted">${s.parts_count} pièces</span>
            </div>
            ${s.rating>0 ? `<p style="margin:0.4rem 0"><span class="badge badge-ok">★ ${s.rating}</span></p>` : ''}
            ${s.description ? `<p class="hint" style="margin:0.5rem 0">${esc(s.description)}</p>` : ''}
            ${s.city ? `<p class="hint">📍 ${esc(s.city)}</p>` : ''}
            ${s.address ? `<p class="hint" style="margin:0.4rem 0">${esc(s.address)}</p>` : ''}
            <a href="#/app/suppliers/${s.id}" class="btn btn-sm" style="margin-top:0.5rem">${I('eye')} Voir la boutique</a>
          </div>`).join('') || '<p class="hint">Aucun fournisseur.</p>'
      }</div>
    `);
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewSupplierPage(id) {
  showLoading();
  try {
    const d = await api('/suppliers/' + id);
    const s = d.supplier; const parts = d.parts || [];
    layoutApp(`
      <a href="#/suppliers" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour</a>
      <div class="page-top"><h1>${I('truck')} ${esc(s.name)}</h1>
        ${s.rating>0 ? `<span class="badge badge-ok">★ ${s.rating}</span>` : ''} ${s.is_active ? '<span class="badge badge-ok">Actif</span>' : '<span class="badge badge-ko">Inactif</span>'}
      </div>
      ${(S.user && s.user_id && S.user.id !== s.user_id) ? `<div style="margin-top:0.8rem"><button type="button" class="btn btn-primary" id="btn-chat-sup">${I('message-square')} Contacter le fournisseur</button></div>` : ''}
      ${s.description ? `<p class="hint">${esc(s.description)}</p>` : ''}
      <div class="section-title" style="margin-top:1rem">${I('package')} Pièces (${parts.length})</div>
      <div class="grid-2">${
        parts.map(p=>`<div class="card">
          ${partImg(p, 'part-thumb part-thumb-lg')}
          <div style="display:flex;justify-content:space-between;gap:0.5rem"><h3 style="margin:0">${esc(p.name)}</h3><span class="badge badge-muted">${esc(p.category)}</span></div>
          <p class="hint" style="margin:0.3rem 0">Réf ${esc(p.reference)}</p>
          <p style="margin:0.2rem 0"><b>${money(p.unit_price_cents)}</b> · ${p.stock_quantity>0?`Stock: ${p.stock_quantity}`:'<span class="badge badge-ko">Épuisé</span>'}</p>
          <a href="#/parts/${p.id}" class="btn btn-sm">${I('eye')} Détailler</a>
        </div>`).join('') || '<p class="hint">Aucune pièce en catalogue.</p>'
      }</div>
    `);
    const btnChatSup = document.getElementById('btn-chat-sup');
    if (btnChatSup) btnChatSup.onclick = () => startChatWith(s.user_id, s.name || 'Ce fournisseur');
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

/* =============================================================================
   29. ESPACE FOURNISSEUR
   ============================================================================= */
/* Vignette de pièce (image publique du catalogue). Vide si non renseignée. */
function partImg(p, cls) {
  if (!p || !p.image_doc_id) return '';
  return `<img class="${cls || 'part-thumb'}" src="/api/documents/${p.image_doc_id}/public" alt="${esc(p.name || 'Pièce')}" loading="lazy" onerror="this.style.display='none'">`;
}
async function supplierGuard() {
  const d = await api('/suppliers/mine');
  return d.supplier;
}

async function viewSupplierDashboard() {
  showLoading();
  try {
    const sup = await supplierGuard();
    if (!sup) {
      layoutApp(`<div class="page-top"><h1>${I('truck')} Espace fournisseur</h1></div>
        <div class="card" style="max-width:700px">
          <div class="section-title">Créez votre boutique fournisseur</div>
          <p class="hint" style="margin-bottom:0.8rem">Publiez vos pièces après avoir créé votre profil : référence, prix, stock et compatibilité.</p>
          <form id="sp-create">
            <div class="form-row-2"><label>Nom de la boutique * <input name="name" required placeholder="Auto Pièces XXL"></label>
              <label>Contact <input name="contact_name" placeholder="Nom du contact"></label></div>
            <div class="form-row-2"><label>Email <input name="email" type="email" placeholder="contact@…"></label>
              <label>Téléphone <input name="phone" placeholder="06…"></label></div>
            <label>Adresse <input name="address" placeholder="Adresse de la boutique"></label>
            <label>Description <textarea name="description" rows="3" placeholder="Spécialités, marques, délais…"></textarea></label>
            <button type="submit">${I('save')} Créer ma boutique</button>
          </form>
        </div>`);
      document.getElementById('sp-create').onsubmit = async (ev) => { ev.preventDefault();
        try { const o = Object.fromEntries(new FormData(ev.target));
          await api('/suppliers', { method: 'POST', body: { name: o.name, contact_name: o.contact_name, email: o.email, phone: o.phone, address: o.address, description: o.description } });
          toast('Boutique créée', 'success'); viewSupplierDashboard(); }
        catch (e2) { toast(e2.message, 'error'); } };
      renderIcons(); return;
    }
    const stats = await api('/suppliers/mine');
    const cards = [
      { icon: 'package', label: 'Produits', value: stats.stats.products, hash: '#/supplier/products' },
      { icon: 'alert-triangle', label: 'Stock bas', value: stats.stats.low_stock, hash: '#/supplier/inventory' },
      { icon: 'shopping-cart', label: 'Commandes', value: (stats.orders && stats.orders.total) || 0, hash: '#/supplier/orders' },
      { icon: 'clock', label: 'En attente', value: (stats.orders && stats.orders.pending) || 0, hash: '#/supplier/orders' },
    ];
    layoutApp(`
      <div class="page-top">
        <h1>${I('truck')} ${esc(sup.name)}</h1>
        <div class="sp-top-badges">
          ${sup.is_active ? '<span class="badge badge-ok">Boutique active</span>' : '<span class="badge badge-ko">Boutique inactive</span>'}
          ${typeof verifBadge === 'function' ? verifBadge(sup.verification_status || (sup.verified ? 'VERIFIED' : 'PENDING')) : ''}
          ${sup.verified ? `<span class="badge badge-accent">${I('badge-check')} Vérifiée</span>` : ''}
        </div>
      </div>
      ${(!sup.verified && !(sup.attestation_doc_ids || []).length) ? `<a href="#/supplier/profile" class="banner banner-warn">${I('shield-plus')} <span>Déposez vos attestations pour décrocher le badge <b>Boutique vérifiée</b>.</span>${I('chevron-right')}</a>` : ''}
      <div class="stat-grid">${cards.map(c=>`
        <a href="${c.hash}" class="stat-card"><div class="stat-icon">${I(c.icon)}</div><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></a>`).join('')}
      </div>
      <div class="grid-2" style="margin-top:1rem">
        <a href="#/supplier/products" class="card clickable"><h3>${I('package-plus')} Publier une pièce</h3><p class="hint">Ajoutez référence, catégorie, prix, stock et compatibilité véhicules.</p></a>
        <a href="#/supplier/orders" class="card clickable"><h3>${I('truck')} Traiter les commandes</h3><p class="hint">Confirmez, expédiez ou livrez les commandes clients.</p></a>
      </div>
      <div class="grid-2" style="margin-top:1rem">
        <a href="#/supplier/profile" class="card clickable"><h3>${I('building-2')} Mon espace & attestations</h3><p class="hint">Gérez votre vitrine, vos coordonnées et vos justificatifs.</p></a>
        <a href="#/chat" class="card clickable"><h3>${I('message-square')} Messagerie clients</h3><p class="hint">Échangez avec l'équipe C-AUTO et vos clients en direct.</p></a>
      </div>
    `);
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewSupplierProducts() {
  showLoading();
  try {
    const sup = await supplierGuard();
    if (!sup) { location.hash = '#/supplier/dashboard'; return; }
    const d = await api('/suppliers/' + sup.id);
    const parts = d.parts || [];
    layoutApp(`
      <div class="page-top"><h1>${I('package')} Mes produits</h1>
        <a href="#/supplier/products/new" class="btn">${I('plus')} Nouvelle pièce</a>
      </div>
      ${parts.length ? `<div class="card"><table class="table">
        <thead><tr><th>Pièce</th><th>Réf</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>Statut</th><th></th></tr></thead>
        <tbody>${parts.map(p=>`<tr>
          <td style="display:flex;align-items:center;gap:0.55rem">${partImg(p, 'part-thumb part-thumb-sm')}<span>${esc(p.name)}</span></td><td>${esc(p.reference)}</td>
          <td><span class="badge badge-muted">${esc(p.category)}</span></td>
          <td>${money(p.unit_price_cents)}</td>
          <td>${p.stock_quantity}${p.stock_quantity <= p.min_stock ? ' <span class="badge badge-warn">Bas</span>' : ''}</td>
          <td>${p.status === 'ACTIVE' ? '<span class="badge badge-ok">En ligne</span>' : p.status === 'PENDING' ? '<span class="badge badge-warn">En attente</span>' : p.status === 'REJECTED' ? '<span class="badge badge-ko">Rejeté</span>' : '<span class="badge badge-muted">Brouillon</span>'}</td>
          <td style="white-space:nowrap"><a href="#/supplier/products/${p.id}" class="btn btn-sm">${I('edit')} Modifier</a></td>
        </tr>`).join('')}</tbody></table></div>`
        : `<div class="card"><p class="hint">Aucune pièce publiée. <a href="#/supplier/products/new">Ajoutez votre première pièce.</a></p></div>`}
    `);
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewSupplierProductForm(id) {
  showLoading();
  try {
    const sup = await supplierGuard();
    if (!sup) { location.hash = '#/supplier/dashboard'; return; }
    const editing = id ? (await api('/parts/' + id)).part : null;
    const cats = MOD_CATS.map(c=>`<option value="${c}" ${editing && editing.category===c?'selected':''}>${c}</option>`).join('');
    const vinVal = editing ? (editing.vin || '') : '';
    const statusOpts = ['DRAFT','PENDING','ACTIVE'].map(s=>`<option value="${s}" ${editing && editing.status===s?'selected':''}>${s==='DRAFT'?'Brouillon':s==='PENDING'?'En attente':'En ligne'}</option>`).join('');
    layoutApp(`
      <a href="#/supplier/products" class="hint" style="display:inline-flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem">${I('arrow-left')} Retour</a>
      <div class="section-title" style="margin-bottom:1rem">${editing ? I('edit')+' Modifier la pièce' : I('package-plus')+' Nouvelle pièce'}</div>
      <div class="card" style="max-width:760px">
        <form id="sp-prod">
          <div class="form-row-2"><label>Référence * <input name="reference" required value="${esc(editing ? editing.reference : '')}" placeholder="EX: BRK-2030"></label>
            <label>Nom * <input name="name" required value="${esc(editing ? editing.name : '')}" placeholder="Disques de frein AV"></label></div>
          <div class="form-row-3"><label>Marque <input name="brand" value="${esc(editing ? editing.brand : '')}" placeholder="Brembo"></label>
            <label>Catégorie <select name="category">${cats}</select></label>
            <label>VIN compatible (option) <input name="vin" maxlength="20" value="${esc(vinVal)}" placeholder="17 caractères"></label></div>
          <div class="form-row-3"><label>Prix unitaire (FCFA) <input name="unit_price_cents" type="number" step="1" min="0" value="${editing ? (editing.unit_price_cents/100) : ''}" required></label>
            <label>Stock <input name="stock_quantity" type="number" min="0" value="${editing ? editing.stock_quantity : ''}" required></label>
            <label>Stock alerte <input name="min_stock" type="number" min="0" value="${editing ? editing.min_stock : 2}" required></label></div>
          <label>Description <textarea name="description" rows="2">${esc(editing ? editing.description : '')}</textarea></label>
          <div id="sp-img-section">
            <div class="detail-label" style="margin:0.2rem 0 0.4rem">${I('image')} Photo de la pièce</div>
            <div class="sp-imgbox">
              <img id="sp-img-prev" class="part-thumb part-thumb-xl" alt="Photo de la pièce"
                src="${editing && editing.image_doc_id ? '/api/documents/' + editing.image_doc_id + '/public' : ''}"
                style="${editing && editing.image_doc_id ? '' : 'display:none'}" onerror="this.style.display='none'">
              <div>
                <p class="hint" style="margin:0 0 0.4rem">JPEG, PNG ou WebP.</p>
                <input type="file" id="sp-img-file" accept="image/jpeg,image/png,image/webp">
                ${editing && editing.image_doc_id ? `<button type="button" id="sp-img-rm" class="btn btn-ghost btn-sm" style="margin-top:0.4rem">${I('trash-2')} Retirer la photo</button>` : ''}
              </div>
            </div>
          </div>
          <label>Statut <select name="status">${statusOpts}</select></label>
          <div id="sp-synthesis" style="display:none;margin:0.8rem 0;padding:0.8rem;background:var(--bg-alt,#f4f6f8);border-radius:8px;border-left:3px solid var(--accent)">
            <strong>${I('file-text')} Synthèse de la pièce</strong>
            <div id="sp-synth-content" style="margin-top:0.4rem;font-size:0.88rem"></div>
          </div>
          <div style="display:flex;gap:0.6rem;align-items:center">
            <button type="submit">${I('save')} ${editing ? 'Enregistrer' : 'Créer la pièce'}</button>
            ${editing ? `<span>${editing.status === 'ACTIVE' ? '<span class="badge badge-ok">En ligne</span>' : editing.status === 'PENDING' ? '<span class="badge badge-warn">En attente</span>' : editing.status === 'REJECTED' ? '<span class="badge badge-ko">Rejeté</span>' : '<span class="badge badge-muted">Brouillon</span>'}</span>
              <button type="button" id="sp-toggle" class="btn btn-ghost">${I('power')} ${editing.status === 'ACTIVE' ? 'Mettre hors ligne' : 'Mettre en ligne'}</button>` : ''}
          </div>
        </form>
        ${editing ? `
        <div class="section-title" style="margin:1.2rem 0 0.6rem">${I('check-square')} Compatibilité véhicules</div>
        <div id="sp-comp-list"></div>
        <form id="sp-comp" class="form-row-3" style="align-items:flex-end">
          <label>Marque <input name="make" required placeholder="Renault"></label>
          <label>Modèle <input name="model" required placeholder="Clio"></label>
          <label>Années <input name="years" placeholder="2005-2012" required></label>
          <label>Moteur <input name="engine" placeholder="dCi 90 → optionnel"></label>
          <label>Carburant <input name="fuel_type" placeholder="DIESEL"></label>
          <button type="submit">${I('plus')} Ajouter</button>
        </form>` : ''}
      </div>
    `);
    const f = document.getElementById('sp-prod');
    let imgDocId = (editing && editing.image_doc_id) || null;
    const imgFile = document.getElementById('sp-img-file');
    if (imgFile) imgFile.onchange = async () => {
      const file = imgFile.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'PHOTO');
      fd.append('visibility', 'public');
      fd.append('name', 'Photo de la pièce ' + (editing ? editing.reference : ''));
      try {
        const r = await api('/documents', { method: 'POST', body: fd });
        imgDocId = r.document.id;
        const prev = document.getElementById('sp-img-prev');
        prev.src = '/api/documents/' + imgDocId + '/public?t=' + Date.now();
        prev.style.display = '';
        toast('Photo ajoutée', 'success');
      } catch (e2) { toast(e2.message || 'Import de la photo impossible', 'error'); }
    };
    const imgRm = document.getElementById('sp-img-rm');
    if (imgRm) imgRm.onclick = () => {
      imgDocId = null;
      const prev = document.getElementById('sp-img-prev');
      if (prev) prev.style.display = 'none';
      imgRm.remove();
    };
    f.onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(f));
      const body = { reference: o.reference, name: o.name, brand: o.brand, category: o.category, description: o.description,
        unit_price_cents: Math.round((+o.unit_price_cents || 0) * 100), stock_quantity: +o.stock_quantity || 0, min_stock: +o.min_stock || 0,
        image_doc_id: imgDocId, status: o.status || 'DRAFT' };
      if (o.vin) body.vin = o.vin.toUpperCase();
      try {
        if (editing) { await api('/parts/' + id, { method: 'PATCH', body }); toast('Pièce mise à jour — statut mis à jour', 'success'); }
        else { const r = await api('/parts', { method: 'POST', body }); toast('Pièce créée (brouillon)', 'success'); location.hash = '#/supplier/products/' + r.part.id; }
        if (editing) location.hash = '#/supplier/products';
      } catch (e2) { toast(e2.message, 'error'); } };
    const synthDiv = document.getElementById('sp-synthesis');
    const synthContent = document.getElementById('sp-synth-content');
    function updateSynth() {
      const fd = new FormData(f);
      const name = fd.get('name') || ''; const ref = fd.get('reference') || ''; const brand = fd.get('brand') || '';
      const cat = fd.get('category') || ''; const desc = fd.get('description') || ''; const price = fd.get('unit_price_cents') || '';
      const stock = fd.get('stock_quantity') || ''; const status = fd.get('status') || 'DRAFT';
      if (name || ref) {
        synthDiv.style.display = '';
        synthContent.innerHTML = '<b>'+esc(ref)+'</b> — '+esc(name)+'<br>Marque: '+esc(brand)+' · Catégorie: '+esc(cat)+'<br>Prix: '+money(Math.round((+price||0)*100))+' · Stock: '+stock+'<br>Statut: <b>'+status+'</b>';
      } else { synthDiv.style.display = 'none'; }
    }
    f.querySelectorAll('input,select,textarea').forEach(el => el.addEventListener('input', updateSynth));
    if (editing) updateSynth();
    const toggle = document.getElementById('sp-toggle');
    if (toggle) toggle.onclick = async () => { const newStatus = editing.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
      try { await api('/parts/' + id, { method: 'PATCH', body: { status: newStatus } }); location.reload(); } catch (e2) { toast(e2.message, 'error'); } };
    if (editing) {
      const comps = (await api('/parts/' + id + '/compatibility')).compatibility || [];
      document.getElementById('sp-comp-list').innerHTML = comps.length ? comps.map(c=>`
        <div class="detail-label" style="display:flex;justify-content:space-between;align-items:center">
          <span>${esc(c.make)} ${esc(c.model)} — ${c.year_from}–${c.year_to}${c.engine?' · '+esc(c.engine):''}${c.fuel_type?' · '+esc(c.fuel_type):''}</span>
          <button class="btn btn-sm btn-ghost" data-del="${c.id}">${I('trash-2')}</button>
        </div>`).join('') : '<p class="hint">Aucune compatibilité. Ajoutez-en une pour la vérification catalogue.</p>';
      document.getElementById('sp-comp-list').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        try { await api('/parts/' + id + '/compatibility/' + b.dataset.del, { method: 'DELETE' }); toast('Compatibilité retirée', 'success'); viewSupplierProductForm(id); } catch (e2) { toast(e2.message, 'error'); } });
      document.getElementById('sp-comp').onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
        const [yf, yt] = (o.years || '').split('-');
        try { await api('/parts/' + id + '/compatibility', { method: 'POST', body: { make: o.make, model: o.model, year_from: +yf || 1990, year_to: +yt || +yf || 2030, engine: o.engine || '', fuel_type: o.fuel_type || '' } });
          toast('Compatibilité ajoutée', 'success'); viewSupplierProductForm(id); }
        catch (e2) { toast(e2.message, 'error'); } };
    }
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}
const viewSupplierProductNew = () => viewSupplierProductForm(null);
const viewSupplierProductEdit = (id) => viewSupplierProductForm(id);

async function viewSupplierOrders() {
  showLoading();
  try {
    const sup = await supplierGuard();
    if (!sup) { location.hash = '#/supplier/dashboard'; return; }
    const d = await api('/suppliers/mine');
    layoutApp(`
      <div class="page-top"><h1>${I('shopping-cart')} Commandes (${d.stats.total})</h1>
        <span class="badge badge-warn">${d.stats.pending} en attente</span>
      </div>
      <div id="sp-orders"></div>
    `);
    const od = await api('/parts/orders');
    const box = document.getElementById('sp-orders');
    const orders = od.orders || [];
    if (!orders.length) { box.innerHTML = '<div class="card"><p class="hint">Aucune commande pour le moment.</p></div>'; renderIcons(); return; }
    box.innerHTML = `<div class="card"><table class="table">
      <thead><tr><th>Client</th><th>Pièce</th><th>Réf</th><th>Qté</th><th>Total</th><th>Véhicule</th><th>Statut</th><th></th></tr></thead>
      <tbody>${orders.map(o=>`<tr>
        <td>${esc(o.client_name || '—')}</td><td>${esc(o.part_name)}</td><td>${esc(o.part_reference)}</td>
        <td>${o.quantity}</td><td><b>${money(o.total_cents)}</b></td>
        <td>${o.make ? `${esc(o.make)} ${esc(o.model)}` : '—'}</td>
        <td><span class="status-badge status-${esc(o.status)}">${esc(PART_ORDER_LABELS[o.status]||o.status)}</span></td>
        <td style="white-space:nowrap">${o.status !== 'CANCELLED' && o.status !== 'DELIVERED' ? `
          ${o.status === 'PENDING' ? `<button class="btn btn-sm" data-st="${o.id}:CONFIRMED">${I('check')} Confirmer</button>` : ''}
          ${o.status === 'CONFIRMED' ? `<button class="btn btn-sm" data-st="${o.id}:SHIPPED">${I('truck')} Expédier</button>` : ''}
          ${o.status === 'SHIPPED' ? `<button class="btn btn-sm" data-st="${o.id}:DELIVERED">${I('check-circle')} Livrer</button>` : ''}
          <button class="btn btn-sm btn-ghost" data-st="${o.id}:CANCELLED">${I('x')}</button>` : ''}
        </td>
      </tr>`).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => {
      const [oid, st] = b.dataset.st.split(':');
      try { await api('/parts/orders/' + oid + '/status', { method: 'PATCH', body: { status: st } }); toast('Commande ' + PART_ORDER_LABELS[st], 'success'); viewSupplierOrders(); }
      catch (e2) { toast(e2.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewSupplierInventory() {
  showLoading();
  try {
    const sup = await supplierGuard();
    if (!sup) { location.hash = '#/supplier/dashboard'; return; }
    const d = await api('/suppliers/' + sup.id);
    const parts = (d.parts || []).sort((a, b) => a.stock_quantity - b.stock_quantity);
    layoutApp(`
      <div class="page-top"><h1>${I('layers')} Inventaire</h1><span class="hint">Sport la production souhaitée</span></div>
      <div class="card"><table class="table">
        <thead><tr><th>Pièce</th><th>Réf</th><th>Stock</th><th>Alerte</th><th>Prix</th><th></th></tr></thead>
        <tbody>${parts.map(p=>`<tr>
          <td>${esc(p.name)}</td><td>${esc(p.reference)}</td>
          <td>${p.stock_quantity}${p.stock_quantity <= p.min_stock ? ' <span class="badge badge-warn">⚠</span>' : ''}</td>
          <td>${p.min_stock}</td><td>${money(p.unit_price_cents)}</td>
          <td><button class="btn btn-sm" data-inv="${p.id}" data-name="${esc(p.name)}">${I('sliders-horizontal')} Ajuster</button></td>
        </tr>`).join('')}</tbody></table></div>
    `);
    document.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => {
      const stock = prompt('Stock pour "' + b.dataset.name + '" :', '');
      const min = prompt('Seuil d\'alerte :', '');
      if (stock === null && min === null) return;
      const body = {};
      if (stock !== null && stock.trim() !== '') body.stock_quantity = +stock;
      if (min !== null && min.trim() !== '') body.min_stock = +min;
      (async () => { try { await api('/suppliers/inventory/' + b.dataset.inv, { method: 'PATCH', body }); toast('Inventaire mis à jour', 'success'); viewSupplierInventory(); } catch (e2) { toast(e2.message, 'error'); } })();
    });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewSupplierProfile() {
  showLoading();
  try {
    const sup = await supplierGuard();
    if (!sup) { location.hash = '#/supplier/dashboard'; return; }
    const [docR] = await Promise.all([api('/documents').catch(() => null)]);
    const allDocs = (docR && docR.documents) || [];
    const attIds = sup.attestation_doc_ids || [];
    const attDocs = attIds.map(id => allDocs.find(d => d.id === id)).filter(Boolean).map(d => ({
      id: d.id, name: d.original_name || d.name || 'Attestation', description: '', kind: String(d.mime || '').startsWith('image/') ? 'IMAGE' : 'FILE'
    }));
    layoutApp(`
      <div class="page-top"><h1>${I('building-2')} Mon espace fournisseur</h1></div>
      <div class="sp-hero card">
        <div class="sp-hero-logo">${I('warehouse')}</div>
        <div class="sp-hero-ident">
          <h2>${esc(sup.name)}</h2>
          <div class="pp-badges">${typeof verifBadge === 'function' ? verifBadge(sup.verification_status || (sup.verified ? 'VERIFIED' : 'PENDING')) : `<span class="badge badge-${sup.verified ? 'ok' : 'warn'}">${sup.verified ? 'Vérifié' : 'En attente'}</span>`}
            ${sup.verified ? `<span class="badge badge-accent">${I('badge-check')} Boutique vérifiée</span>` : ''}</div>
          <p class="hint">${esc(sup.address || 'Adresse à compléter')} · ${esc(sup.contact_name || '—')}</p>
        </div>
        <div class="sp-hero-stats">
          <a class="sp-hero-link" href="#/supplier/products">${I('package')} Mon catalogue</a>
          <a class="sp-hero-link" href="#/chat">${I('message-square')} Messagerie</a>
        </div>
      </div>
      <div class="card" style="max-width:760px">
        <form id="sp-prof">
          <div class="form-row-2"><label>Nom de la boutique * <input name="name" required value="${esc(sup.name)}"></label>
            <label>Contact <input name="contact_name" value="${esc(sup.contact_name)}"></label></div>
          <div class="form-row-2"><label>Email <input name="email" type="email" value="${esc(sup.email)}"></label>
            <label>Téléphone <input name="phone" value="${esc(sup.phone)}"></label></div>
          <label>Adresse <input name="address" value="${esc(sup.address)}"></label>
          <label>Description <textarea name="description" rows="3">${esc(sup.description)}</textarea></label>
          <div style="display:flex;gap:1rem;align-items:center;margin-top:0.6rem">
            <button type="submit">${I('save')} Enregistrer</button>
            <label style="display:flex;gap:0.4rem;align-items:center;margin:0"><input type="checkbox" id="sp-active" ${sup.is_active?'checked':''}> Boutique active</label>
          </div>
        </form>
      </div>
      <div class="card att-card" style="max-width:760px">
        <div class="att-head"><h3>${I('shield-plus')} Attestations & justificatifs</h3>
          <span class="hint">Documents contrôlés par C-AUTO pour votre badge « Boutique vérifiée ».</span></div>
        ${attestationPanelHtml({ stored: attDocs, readOnly: false })}
        <div class="att-actions"><button type="button" class="btn btn-primary" data-att-save ${attDocs.length ? '' : 'disabled'}>${I('save')} Enregistrer</button></div>
      </div>
    `);
    const f = document.getElementById('sp-prof');
    f.onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(f));
      try { await api('/suppliers/mine', { method: 'PATCH', body: { name: o.name, contact_name: o.contact_name, email: o.email, phone: o.phone, address: o.address, description: o.description, is_active: document.getElementById('sp-active').checked } });
        toast('Profil enregistré', 'success'); viewSupplierProfile(); }
      catch (e2) { toast(e2.message, 'error'); } };
    attestationPanelWire(document.querySelector('.att-card'), {
      getStored: () => attDocs,
      onSave: async (ids) => { await api('/suppliers/mine', { method: 'PATCH', body: { attestation_doc_ids: ids } }); },
      readOnly: false,
      refresh: () => setTimeout(() => viewSupplierProfile(), 250)
    });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

/* =============================================================================
   30. C-AUTO MOBILE — console pro offline-first
   ============================================================================= */
async function viewMobile() {
  const online = mobileOnline();
  const queue = offlineQueue.pending();
  layoutApp(`
    <div class="mobile-frame">
      ${!online ? `<div class="alert alert-warn" id="mo-banner">${I('wifi-off')}<span>Mode hors-ligne — les données affichées sont celles en cache.</span></div>`
        : queue.length ? `<div class="alert alert-warn" id="mo-banner">${I('cloud-upload')}<span>${queue.length} action(s) en attente de synchronisation.</span></div>` : ''}
      <div class="page-top"><h1>${I('smartphone')} Mobile pro</h1>
        <div id="mo-avail"></div>
      </div>
      <div class="tab-bar" style="margin-bottom:0.8rem">
        <button class="tab active" data-tab="demandes">${I('clipboard-list')} Demandes</button>
        <button class="tab" data-tab="intervention">${I('settings')} Intervention</button>
        <button class="tab" data-tab="cloture">${I('flag')} Clôture</button>
      </div>
      <div id="mo-panel"></div>
    </div>
  `);
  renderMobileAvailability();
  const tabs = document.querySelectorAll('.tab-bar .tab');
  tabs.forEach(t => t.onclick = () => { tabs.forEach(x => x.classList.remove('active')); t.classList.add('active'); renderMobileTab(t.dataset.tab); });
  renderMobileTab('demandes');
  window.addEventListener('online', () => { flushOfflineQueue(); toast('Connexion rétablie', 'success'); });
  renderIcons();
}

async function renderMobileAvailability() {
  const box = document.getElementById('mo-avail');
  try {
    const d = await api('/professionals/me');
    const avail = d.professional.is_available;
    box.innerHTML = `<button class="btn btn-sm ${avail ? '' : 'btn-ghost'}" id="mo-toggle">${I('radio' + (avail ? '-tower' : ''))} ${avail ? 'Disponible' : 'Indisponible'}</button>`;
    document.getElementById('mo-toggle').onclick = async () => {
      try { await api('/professionals/me', { method: 'PATCH', body: { is_available: !avail } }); toast(avail ? 'Vous êtes indisponible' : 'Vous êtes disponible', 'success'); renderMobileAvailability(); }
      catch (e) { toast(e.message, 'error'); } };
  } catch (e) { box.innerHTML = ''; }
  renderIcons();
}

async function renderMobileTab(tab) {
  const panel = document.getElementById('mo-panel');
  if (tab === 'demandes') {
    panel.innerHTML = '<p class="hint">Chargement…</p>';
    try {
      const online = mobileOnline();
      let srs;
      if (online) { srs = (await api('/service-requests')).service_requests; mqS('demandes', srs); }
      else { srs = mqQ('demandes') || []; }
      if (!srs.length) { panel.innerHTML = '<div class="card"><p class="hint">Aucune demande associée.</p></div>'; renderIcons(); return; }
      const mons = srs.filter(s => s.vehicle_id);
      panel.innerHTML = `<div class="card"><table class="table">
        <thead><tr><th>Client</th><th>Véhicule</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${mons.map(s=>`<tr>
          <td>${esc(s.client_name || '—')}</td>
          <td>${esc(s.make)} ${esc(s.model)} ${esc(s.plate || '')}</td>
          <td><span class="status-badge status-${esc(s.status)}">${esc(s.status.replace(/_/g,' '))}</span></td>
          <td style="white-space:nowrap">
            <a class="btn btn-sm" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.make + ' ' + s.model + ' ' + (s.plate || ''))}">${I('navigation')} Itinéraire</a>
            <a class="btn btn-sm btn-ghost" href="#/pro/service-requests/${s.id}">${I('eye')} Ouvrir</a>
          </td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch (e) { panel.innerHTML = err(e); }
    renderIcons();
  } else if (tab === 'intervention' || tab === 'cloture') {
    try {
      const online = mobileOnline();
      let repairs;
      if (online) { const d = await api('/repairs'); repairs = d.repairs; mqS('repairs', repairs); }
      else { repairs = mqQ('repairs') || []; }
      if (!repairs.length) { panel.innerHTML = '<div class="card"><p class="hint">Aucune intervention.</p></div>'; renderIcons(); return; }
      const eligible = tab === 'cloture' ? repairs.filter(r => r.status === 'QUALITY_CHECK') : repairs.filter(r => ['DIAGNOSTIC','QUOTE_SENT','QUOTE_APPROVED','REPAIRING'].includes(r.status));
      const allowed = eligible.length ? eligible : repairs;
      panel.innerHTML = `
        <div class="card" style="margin-bottom:0.8rem">
          <label>Intervention <select id="mo-sel">${allowed.map(r=>`<option value="${r.id}">${esc(r.make)} ${esc(r.model)} ${esc(r.plate||'')} — ${esc(r.status.replace(/_/g,' '))}</option>`).join('')}</select></label>
        </div>
        <div id="mo-detail"></div>`;
      const sel = document.getElementById('mo-sel');
      let details = {};
      const renderDetail = async (rid) => {
        const row = allowed.find(x => x.id === rid) || allowed[0];
        if (!row) { document.getElementById('mo-detail').innerHTML = '<p class="hint">Sélectionnez une intervention.</p>'; renderIcons(); return; }
        let det = details[row.id];
        if (!det && online) {
          document.getElementById('mo-detail').innerHTML = '<p class="hint">Chargement…</p>';
          det = await api('/interventions/' + row.id).catch(() => null);
          if (det) details[row.id] = det;
        }
        const iv = row;
        const tasks = (det && det.repair_order && det.repair_order.tasks) || [];
        const quick = [
          `<a class="btn btn-sm btn-ghost" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(iv.make + ' ' + iv.model + ' ' + (iv.plate||''))}">${I('navigation')} Itinéraire</a>`,
          ['DIAGNOSTIC','QUOTE_SENT'].includes(iv.status) ? `<button class="btn btn-sm" id="mo-diag">${I('stethoscope')} Diagnostic</button>` : '',
          `<a class="btn btn-sm" href="#/repairs/${iv.id}">${I('settings')} Consulter</a>`,
          iv.status === 'QUALITY_CHECK' ? `<a class="btn btn-sm" href="#/repairs/${iv.id}">${I('clipboard-check')} Contrôle qualité</a>` : '',
        ].filter(Boolean);
        document.getElementById('mo-detail').innerHTML = `
          <div class="card">
            <div style="display:flex;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;align-items:center">
              <h3 style="margin:0">${esc(iv.make)} ${esc(iv.model)} ${esc(iv.plate||'')}</h3>
              <span class="status-badge status-${esc(iv.status)}">${esc(iv.status.replace(/_/g,' '))}</span>
            </div>
            <p class="hint" style="margin:0.4rem 0">${det ? (det.repair_order ? `${tasks.length} tâche(s)` : 'Bon de travail à créer') : 'Données détaillées indisponibles hors-ligne'}</p>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem">${quick.join('')}</div>
            <div class="detail-label" style="margin-top:0.8rem">Boîte à outils mobile</div>
            <div class="form-row-3">
              <button class="btn btn-sm" id="mo-checklist">${I('list-checks')} Checklist (${tasks.length})</button>
              <button class="btn btn-sm" id="mo-photo">${I('camera')} Photos</button>
              <button class="btn btn-sm" id="mo-mesure">${I('ruler')} Mesures</button>
            </div>
            <div id="mo-tools"></div>
          </div>`;
        const diagBtn = document.getElementById('mo-diag');
        if (diagBtn) diagBtn.onclick = () => {
          document.getElementById('mo-tools').innerHTML = `<div class="card" style="margin-top:0.6rem;padding:0.8rem">
            <form id="mo-diag-f"><textarea name="description" rows="3" placeholder="Symptômes observés / constats"></textarea>
            <button type="submit" class="btn btn-sm" style="margin-top:0.5rem">${I('save')} Envoyer le diagnostic</button></form></div>`;
          document.getElementById('mo-diag-f').onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
            const payload = { description: o.description, observations: [] };
            if (!online) { offlineQueue.add({ path: '/interventions/' + iv.id + '/diagnostic', method: 'POST', body: payload }); toast('Diagnostic mis en attente de synchronisation', 'warn'); document.getElementById('mo-tools').innerHTML=''; return; }
            try { await api('/interventions/' + iv.id + '/diagnostic', { method: 'POST', body: payload }); toast('Diagnostic enregistré', 'success'); document.getElementById('mo-tools').innerHTML=''; } catch (e) { toast(e.message, 'error'); } };
          renderIcons();
        };
        const chk = document.getElementById('mo-checklist');
        if (chk) chk.onclick = () => {
          document.getElementById('mo-tools').innerHTML = tasks.length
            ? `<div class="card" style="margin-top:0.6rem;padding:0.8rem">${tasks.map(t=>`
              <label style="display:flex;gap:0.5rem;align-items:center;margin:0.3rem 0"><input type="checkbox" ${t.is_done?'checked':''} data-task="${t.id}"> ${esc(t.label)} ${t.is_done?'<span class="badge badge-ok">fait</span>':''}</label>`).join('')}</div>`
            : '<p class="hint" style="margin-top:0.6rem">Aucune tâche pour ce bon de travail.</p>';
          document.querySelectorAll('[data-task]').forEach(cb => cb.onchange = async () => {
            try { await api('/interventions/tasks/' + cb.dataset.task + '/done', { method: 'POST' }); toast('Tâche mise à jour', 'success'); cb.disabled = true; } catch (e) { toast(e.message, 'error'); } });
          renderIcons();
        };
        const ph = document.getElementById('mo-photo');
        if (ph) ph.onclick = () => {
          document.getElementById('mo-tools').innerHTML = `<div class="card" style="margin-top:0.6rem;padding:0.8rem">
            <input type="file" id="mo-file" accept="image/*" multiple>
            <button class="btn btn-sm" id="mo-upload" style="margin-top:0.5rem">${I('upload')} Transmettre les photos</button>
            <p class="hint" id="mo-ph-msg" style="margin-top:0.4rem"></p></div>`;
          document.getElementById('mo-upload').onclick = async () => {
            const files = document.getElementById('mo-file').files;
            if (!files.length) return toast('Sélectionnez au moins une photo', 'warn');
            const msg = document.getElementById('mo-ph-msg');
            let sent = 0;
            for (const f of Array.from(files)) {
              const fd = new FormData(); fd.append('file', f);
              try { await api('/interventions/' + iv.id + '/evidence', { method: 'POST', body: fd }); sent++; msg.textContent = sent + '/' + files.length + ' transmise(s)…'; }
              catch (e) { toast(e.message, 'error'); }
            }
            toast(sent + ' photo(s) transmise(s)', 'success'); document.getElementById('mo-tools').innerHTML='';
          };
          renderIcons();
        };
        const ms = document.getElementById('mo-mesure');
        if (ms) ms.onclick = () => {
          document.getElementById('mo-tools').innerHTML = `<div class="card" style="margin-top:0.6rem;padding:0.8rem">
            <label>Mesure <input id="mo-m-value" placeholder="Ex: 11.8 V / 2.4 bar"></label>
            <button class="btn btn-sm" id="mo-m-save" style="margin-top:0.5rem">${I('save')} Consigner</button>
            <p class="hint" id="mo-m-list" style="margin-top:0.5rem"></p></div>`;
          const list = JSON.parse(localStorage.getItem('mo.mesures.' + iv.id) || '[]');
          const paint = () => { document.getElementById('mo-m-list').textContent = list.length ? 'Mesures consignées : ' + list.join(' ; ') : ''; };
          paint();
          document.getElementById('mo-m-save').onclick = () => {
            const v = document.getElementById('mo-m-value').value.trim();
            if (!v) return toast('Saisissez une mesure', 'warn');
            list.push(v); localStorage.setItem('mo.mesures.' + iv.id, JSON.stringify(list)); document.getElementById('mo-m-value').value=''; paint(); toast('Mesure consignée', 'success');
          };
          renderIcons();
        };
        renderIcons();
      };
      sel.onchange = () => renderDetail(sel.value);
      renderDetail(sel.value);
    } catch (e) { panel.innerHTML = err(e); }
    renderIcons();
  }
}

function flushOfflineQueue() {
  const q = offlineQueue.pending();
  if (!q.length) return;
  (async () => {
    let ok = 0, fail = 0;
    for (const item of q) {
      try { await api(item.path, { method: item.method, body: item.body }); ok++; }
      catch (e) { fail++; }
    }
    offlineQueue.clear();
    if (ok) toast(ok + ' action(s) synchronisée(s)', 'success');
    if (fail) toast(fail + ' action(s) en échec', 'error');
    const banner = document.getElementById('mo-banner');
    if (banner) banner.remove();
    const panel = document.getElementById('mo-panel');
    if (panel) renderMobileTab();
  })();
}

/* =============================================================================
   31. C-AUTO FLEET — console structurée du gestionnaire de parc
   ============================================================================= */
const FL_TABS = [
  { hash: '#/fleet/dashboard', key: 'dashboard', icon: 'layout-dashboard', label: "Vue d'ensemble" },
  { hash: '#/fleet/vehicles', key: 'vehicles', icon: 'car', label: 'Véhicules' },
  { hash: '#/fleet/drivers', key: 'drivers', icon: 'users', label: 'Conducteurs' },
  { hash: '#/fleet/maintenance', key: 'maintenance', icon: 'wrench', label: 'Entretien' },
  { hash: '#/fleet/repairs', key: 'repairs', icon: 'settings', label: 'Réparations' },
  { hash: '#/fleet/costs', key: 'costs', icon: 'wallet', label: 'Coûts' },
  { hash: '#/fleet/incidents', key: 'incidents', icon: 'alert-triangle', label: 'Incidents' },
  { hash: '#/fleet/reports', key: 'reports', icon: 'bar-chart-3', label: 'Rapports' },
];

function fleetShell(active, title, icon, contentHtml, rightHtml = '') {
  return `
    <div class="fl-shell">
      <div class="fl-masthead">
        <div>
          <div class="fl-eyebrow">${I('truck')} GESTION DE PARC VÉHICULES</div>
          <h1 class="fl-title">${I(icon)} ${esc(title)}</h1>
        </div>
        <div class="fl-masthead-right">${rightHtml}</div>
      </div>
      <nav class="fl-tabs">
        ${FL_TABS.map(t => `<a href="${t.hash}" class="fl-tab ${t.key === active ? 'active' : ''}">${I(t.icon)} <span>${t.label}</span></a>`).join('')}
      </nav>
      <div class="fl-body">${contentHtml}</div>
    </div>`;
}

function flKpi(label, value, sub, icon, tone = '') {
  return `
    <div class="fl-kpi fl-${tone || 'neutral'}">
      <div class="fl-kpi-icon">${I(icon)}</div>
      <div class="fl-kpi-value">${value}</div>
      <div class="fl-kpi-label">${esc(label)}</div>
      ${sub ? `<div class="fl-kpi-sub">${sub}</div>` : ''}
    </div>`;
}

function flBar(value, max, color) {
  const pct = max > 0 ? Math.min(100, Math.max(3, (value / max) * 100)) : 0;
  return `
    <div class="fl-bar"><div class="fl-bar-fill" style="width:${pct}%;background:${color || 'var(--accent)'}"></div></div>`;
}

function flCatTone(cat) {
  const map = { CARBURANT: 'warn', ENTRETIEN: 'ok', REPARATION: 'ko', ASSURANCE: 'accent', AMENDE: 'ko', AUTRE: 'muted' };
  return map[cat] || 'muted';
}

function flGroup(title, icon, html, accent = '') {
  return `
    <div class="fl-group">
      <div class="fl-group-title ${accent}">${I(icon)} ${esc(title)}</div>
      ${html}
    </div>`;
}

async function viewFleetDashboard() {
  showLoading();
  try {
    const [d, inc, costs] = await Promise.all([
      api('/fleet/dashboard'),
      api('/fleet/incidents').catch(() => ({ incidents: [] })),
      api('/fleet/costs').catch(() => ({ costs: [] })),
    ]);
    const s = d.stats;
    const opPct = s.total_vehicles ? Math.round((s.operational / s.total_vehicles) * 100) : 0;
    const recent = (inc.incidents || []).slice(0, 3);
    const recentCosts = (costs.costs || []).slice(0, 3);
    const kpis = `
      <div class="fl-kpi-grid">
        ${flKpi('Véhicules au parc', s.total_vehicles, 'total inscrits', 'car', 'accent')}
        ${flKpi('Opérationnels', s.operational, opPct + '% du parc', 'check-circle', 'ok')}
        ${flKpi('Immobilisés', s.immobilized, s.immobilized ? 'en atelier / panne' : 'aucun véhicule en atelier', 'octagon-alert', 'ko')}
        ${flKpi('Entretien à venir', s.maintenance_due_soon, s.maintenance_due_soon ? 'échéances proches' : 'programme à jour', 'calendar-clock', 'warn')}
        ${flKpi('Coûts (année)', money(s.costs_ytd), 'total ' + money(s.costs_total), 'wallet', 'neutral')}
      </div>`;

    const overview = `
      <div class="card fl-panel">
        <div class="fl-panel-h">${I('activity')} Opérationnalité du parc</div>
        <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <div style="flex:1;min-width:220px">
            <p class="hint" style="margin:0.3rem 0 0.5rem">${s.operational} opérationnel(s) sur ${s.total_vehicles} véhicule(s)</p>
            ${flBar(s.operational, s.total_vehicles || 1, 'var(--ok)')}
            <div class="fl-legend">
              <span><i class="dot ok"></i>Opérationnels ${s.operational}</span>
              <span><i class="dot ko"></i>Immobilisés ${s.immobilized}</span>
              <span><i class="dot warn"></i>Entretien ${s.maintenance_due_soon}</span>
            </div>
          </div>
          <div class="fl-mini-stats">
            <div><b>${s.drivers}</b><span>Conducteurs</span></div>
            <div><b>${s.incidents_open}</b><span>Incidents ouverts</span></div>
            <div><b>${s.incidents_total}</b><span>Incidents (total)</span></div>
          </div>
        </div>
      </div>`;

    const entretien = `
      <div class="fl-panel card">
        <div class="fl-panel-h">${I('calendar-clock')} Entretien à suivre</div>
        ${(d.due_soon && d.due_soon.length) ? d.due_soon.map(v => `
          <div class="fl-row">
            <div class="fl-veh ${v.worst_status === 'OVERDUE' ? 'ko' : ''}">${I('car')} ${esc(v.make)} ${esc(v.model)} <span class="hint">· ${esc(v.plate)}</span></div>
            <div class="fl-row-right">
              <span class="fl-chip ${v.worst_status === 'OVERDUE' ? 'ko' : 'warn'}">${v.worst_status === 'OVERDUE' ? 'Échue' : 'Proche'}</span>
              <span class="hint fl-row-label">${esc(v.worst)}</span>
            </div>
          </div>`).join('')
          : `<div class="fl-empty">${I('check-circle')} Aucune échéance d'entretien à suivre</div>`}
      </div>`;

    const activite = `
      <div class="card fl-panel">
        <div class="fl-panel-h">${I('activity')} Activité récente</div>
        ${recent.map(i => `
          <div class="fl-row">
            <div class="fl-veh">${I('alert-triangle')} ${esc(i.make)} ${esc(i.model)} <span class="hint">· ${esc(i.plate)}</span></div>
            <div class="fl-row-right"><span class="fl-chip ${i.resolved ? 'ok' : 'ko'}">${esc(i.type)}</span>
              <span class="hint fl-row-label">${esc((i.occurred_at || '').slice(0, 10))}</span></div>
          </div>`).join('')}
        ${recentCosts.map(c => `
          <div class="fl-row">
            <div class="fl-veh">${I('receipt')} ${c.make ? `${esc(c.make)} ${esc(c.model)}` : 'Coût global'} <span class="hint">· ${esc(c.category)}</span></div>
            <div class="fl-row-right"><span class="fl-chip ${flCatTone(c.category)}">${money(c.amount_cents)}</span>
              <span class="hint fl-row-label">${esc(c.description || c.occurred_at)}</span></div>
          </div>`).join('')}
        ${!recent.length && !recentCosts.length ? `<div class="fl-empty">${I('clock')} Aucune activité récente</div>` : ''}
      </div>`;

    const quick = `
      <div class="fl-quick">
        <a href="#/vehicles/new" class="fl-quick-card">${I('car-plus')}<b>Ajouter un véhicule</b><span class="hint">Enregistrer une nouvelle entrée du parc</span></a>
        <a href="#/fleet/drivers" class="fl-quick-card">${I('user-plus')}<b>Ajouter un conducteur</b><span class="hint">Affectez-le ensuite à un véhicule</span></a>
        <a href="#/fleet/costs" class="fl-quick-card">${I('plus')}<b>Enregistrer un coût</b><span class="hint">Carburant, entretien, réparation…</span></a>
        <a href="#/fleet/incidents" class="fl-quick-card">${I('siren')}<b>Déclarer un incident</b><span class="hint">Suivi et résolution</span></a>
      </div>`;

    layoutApp(fleetShell('dashboard', "Vue d'ensemble du parc", 'layout-dashboard',
      kpis + `<div class="fl-grid-main">${overview}${entretien}</div>` + activite + quick));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewFleetVehicles() {
  showLoading();
  try {
    const [vd, dr] = await Promise.all([api('/fleet/vehicles'), api('/fleet/drivers').catch(() => ({ drivers: [] }))]);
    const vehicles = vd.vehicles || []; const drivers = dr.drivers || [];
    const op = vehicles.filter(v => !v.immobilized);
    const imm = vehicles.filter(v => v.immobilized);
    const row = (v) => `<tr>
      <td><div class="fl-veh-main">${I('car')} <div><b>${esc(v.make)} ${esc(v.model)}</b><span class="hint">${v.year} · ${v.mileage} km</span></div></div></td>
      <td><span class="fl-chip mute">${esc(v.plate)}</span></td>
      <td><select data-assign="${v.id}" data-name="${esc(v.make)} ${esc(v.model)} ${esc(v.plate)}">
        <option value="">— Aucun —</option>${drivers.map(d => `<option value="${d.id}" ${v.driver_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></td>
      <td style="white-space:nowrap"><a href="#/vehicles/${v.id}" class="btn btn-sm btn-ghost">${I('eye')} Fiche</a></td>
    </tr>`;
    const content = `
      <div class="fl-stats-line">
        <span class="fl-chip ok">Opérationnels ${op.length}</span>
        <span class="fl-chip ko">Immobilisés ${imm.length}</span>
        <span class="fl-chip mute">Total ${vehicles.length}</span>
      </div>
      ${imm.length ? flGroup('Immobilisés — en intervention', 'octagon-alert', `<div class="card"><table class="table">${imm.map(row).join('') || '<tr><td class="hint">—</td></tr>'}</table></div>`, 'ko') : ''}
      ${flGroup('Opérationnels', 'check-circle', `<div class="card"><table class="table">${op.map(row).join('') || `<div class="fl-empty">${I('car')} Aucun véhicule opérationnel</div>`}</table></div>`, 'ok')}
    `;
    layoutApp(fleetShell('vehicles', 'Véhicules du parc', 'car', content,
      `<a href="#/vehicles/new" class="btn">${I('plus')} Ajouter</a>`));
    document.querySelectorAll('[data-assign]').forEach(s => s.onchange = async () => {
      try { await api('/fleet/vehicles/' + s.dataset.assign + '/assign', { method: 'PATCH', body: { driver_id: s.value || null } });
        toast('Conducteur affecté à ' + s.dataset.name, 'success'); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewFleetDrivers() {
  showLoading();
  try {
    const d = await api('/fleet/drivers');
    const drivers = d.drivers || [];
    const content = `
      <div class="fl-stats-line">
        <span class="fl-chip mute">${drivers.length} conducteur(s)</span>
        <span class="fl-chip ok">${drivers.reduce((a, x) => a + x.vehicles_count, 0)} affectation(s)</span>
      </div>
      <div class="card fl-panel" style="max-width:760px">
        <div class="fl-panel-h">${I('user-plus')} Ajouter un conducteur</div>
        <form id="fp-drv" class="fl-form">
          <div class="form-row-2"><label>Nom complet * <input name="name" required placeholder="Nom du conducteur"></label>
            <label>Téléphone <input name="phone" placeholder="06…"></label></div>
          <div class="form-row-2"><label>Email <input name="email" type="email" placeholder="contact@…"></label>
            <label>N° de permis <input name="license" placeholder="Permis B"></label></div>
          <button type="submit" class="btn">${I('plus')} Ajouter</button>
        </form>
      </div>
      ${flGroup('Conducteurs du parc', 'users', `<div class="fl-card-grid">${drivers.length ? drivers.map(d => `
        <div class="fl-drv-card">
          <div class="fl-avatar">${esc((d.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</div>
          <div class="fl-drv-info">
            <b>${esc(d.name)}</b>
            <span class="hint">${esc(d.phone || d.email || '—')}</span>
            <span class="hint">Permis: ${esc(d.license || '—')}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.35rem;align-items:flex-end">
            <span class="fl-chip accent">${d.vehicles_count} véhicule(s)</span>
            <button class="btn btn-sm btn-ghost" data-del="${d.id}">${I('trash-2')} Retirer</button>
          </div>
        </div>`).join('') : `<div class="fl-empty">${I('users')} Aucun conducteur</div>`}</div>`, 'ok')}
    `;
    layoutApp(fleetShell('drivers', 'Conducteurs', 'users', content));
    document.getElementById('fp-drv').onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      try { await api('/fleet/drivers', { method: 'POST', body: o }); toast('Conducteur ajouté', 'success'); viewFleetDrivers(); }
      catch (e2) { toast(e2.message, 'error'); } };
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Retirer ce conducteur ?')) return;
      try { await api('/fleet/drivers/' + b.dataset.del, { method: 'DELETE' }); toast('Conducteur retiré', 'success'); viewFleetDrivers(); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewFleetMaintenance() {
  showLoading();
  try {
    const d = await api('/maintenance');
    const vehicles = d.vehicles || [];
    const rows = await Promise.all(vehicles.map(async (v) => {
      const m = await api('/maintenance/vehicle/' + v.id).catch(() => null);
      const alerts = (m && m.alerts) || [];
      return { ...v, alerts };
    }));
    const overdue = rows.filter(v => v.alerts.some(a => a.status === 'OVERDUE'));
    const soon = rows.filter(v => v.alerts.length && !v.alerts.some(a => a.status === 'OVERDUE'));
    const okv = rows.filter(v => !v.alerts.length);
    const card = (v) => `
      <div class="fl-maint-card ${v.alerts.length ? '' : 'ok'}">
        <div class="fl-veh-main">${I('car')} <div><b>${esc(v.make)} ${esc(v.model)}</b><span class="hint">${esc(v.plate)} · ${v.year}</span></div></div>
        <div>${v.alerts.length ? v.alerts.slice(0, 3).map(a => `<span class="fl-chip ${a.status === 'OVERDUE' ? 'ko' : 'warn'}">${esc(a.label)}</span>`).join(' ') : '<span class="fl-chip ok">Programme à jour</span>'}</div>
        <a href="#/maintenance/${v.id}" class="btn btn-sm btn-ghost">${I('settings')} Programme</a>
      </div>`;
    const content = `
      <div class="fl-stats-line">
        <span class="fl-chip ko">En retard ${overdue.length}</span>
        <span class="fl-chip warn">Prochaines ${soon.length}</span>
        <span class="fl-chip ok">À jour ${okv.length}</span>
      </div>
      ${overdue.length ? flGroup('Entretiens en retard', 'alert-triangle', `<div class="fl-card-grid">${overdue.map(card).join('')}</div>`, 'ko') : ''}
      ${soon.length ? flGroup('Échéances proches', 'calendar-clock', `<div class="fl-card-grid">${soon.map(card).join('')}</div>`, 'warn') : ''}
      ${okv.length ? flGroup('Parc à jour', 'check-circle', `<div class="fl-card-grid">${okv.map(card).join('')}</div>`, 'ok') : ''}
      ${!rows.length ? `<div class="card fl-empty">${I('wrench')} Aucun véhicule au parc.</div>` : ''}
    `;
    layoutApp(fleetShell('maintenance', 'Entretien du parc', 'wrench', content));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewFleetRepairs() {
  showLoading();
  try {
    const d = await api('/repairs');
    const repairs = (d.repairs || []).map(r => ({ ...r }) );
    const inProgress = repairs.filter(r => r.status !== 'CLOSED');
    const closed = repairs.filter(r => r.status === 'CLOSED');
    const row = (r) => `<tr>
      <td><div class="fl-veh-main">${I('settings')} <div><b>${esc(r.make)} ${esc(r.model)}</b><span class="hint">${esc(r.plate || '')}</span></div></div></td>
      <td>${r.professional_name ? '<span class="fl-chip accent">' + esc(r.professional_name) + '</span>' : '<span class="hint">—</span>'}</td>
      <td><span class="status-badge status-${esc(r.status)}">${esc(r.status.replace(/_/g, ' '))}</span></td>
      <td class="hint">${esc((r.created_at || '').slice(0, 10))}</td>
      <td style="white-space:nowrap"><a class="btn btn-sm btn-ghost" href="#/repairs/${r.id}">${I('eye')} Suivre</a></td>
    </tr>`;
    const content = `
      <div class="fl-stats-line">
        <span class="fl-chip ko">En cours ${inProgress.length}</span>
        <span class="fl-chip mute">Clôturées ${closed.length}</span>
      </div>
      ${flGroup('Interventions en cours', 'settings', `<div class="card"><table class="table">${inProgress.map(row).join('') || `<div class="fl-empty">${I('check')} Aucune intervention en cours</div>`}</table></div>`, 'warn')}
      ${closed.length ? flGroup('Historique clôturé', 'archive', `<div class="card" style="opacity:0.75"><table class="table">${closed.map(row).join('')}</table></div>`, '') : ''}
      ${!repairs.length ? `<div class="card fl-empty">${I('settings')} Aucune réparation enregistrée pour ce parc.</div>` : ''}
    `;
    layoutApp(fleetShell('repairs', 'Réparations du parc', 'settings', content));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewFleetCosts() {
  showLoading();
  try {
    const [cd, vd] = await Promise.all([api('/fleet/costs'), api('/fleet/vehicles')]);
    const costs = cd.costs || []; const vehicles = vd.vehicles || [];
    const total = costs.reduce((a, c) => a + c.amount_cents, 0);
    const ytd = costs.filter(c => (c.occurred_at || '').startsWith(String(new Date().getFullYear()))).reduce((a, c) => a + c.amount_cents, 0);
    const content = `
      <div class="fl-kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        ${flKpi('Total des coûts', money(total), costs.length + ' opération(s)', 'wallet', 'accent')}
        ${flKpi('Cette année', money(ytd), null, 'calendar', 'ok')}
      </div>
      <div class="card fl-panel">
        <div class="fl-panel-h">${I('plus')} Enregistrer un coût</div>
        <form id="fp-cost" class="fl-form">
          <div class="form-row-3">
            <label>Véhicule <select name="vehicle_id"><option value="">— Global —</option>${vehicles.map(v => `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} ${esc(v.plate)}</option>`).join('')}</select></label>
            <label>Catégorie <select name="category"><option>CARBURANT</option><option>ENTRETIEN</option><option>REPARATION</option><option>ASSURANCE</option><option>AMENDE</option><option>AUTRE</option></select></label>
            <label>Montant (FCFA) <input name="amount_cents" type="number" step="1" min="0" required></label>
          </div>
          <label>Description <input name="description" placeholder="Ex: Plein carburant — camping du port"></label>
          <button type="submit" class="btn">${I('plus')} Ajouter</button>
        </form>
      </div>
      ${costs.length ? flGroup('Historique des coûts', 'receipt', `<div class="card"><table class="table">
        <thead><tr><th>Date</th><th>Catégorie</th><th>Véhicule</th><th>Description</th><th>Montant</th><th></th></tr></thead>
        <tbody>${costs.map(c => `<tr>
          <td class="hint">${esc(c.occurred_at)}</td>
          <td><span class="fl-chip ${flCatTone(c.category)}">${esc(c.category)}</span></td>
          <td>${c.make ? `<b>${esc(c.make)} ${esc(c.model)}</b> <span class="hint">${esc(c.plate)}</span>` : '<span class="hint">Global</span>'}</td>
          <td>${esc(c.description || '—')}</td>
          <td><b>${money(c.amount_cents)}</b></td>
          <td><button class="btn btn-sm btn-ghost" data-del="${c.id}">${I('trash-2')}</button></td>
        </tr>`).join('')}</tbody>
      </table></div>`, '') : `<div class="card fl-empty">${I('wallet')} Aucun coût enregistré.</div>`}
    `;
    layoutApp(fleetShell('costs', 'Coûts du parc', 'wallet', content));
    document.getElementById('fp-cost').onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      try { await api('/fleet/costs', { method: 'POST', body: { vehicle_id: o.vehicle_id || null, category: o.category, amount_cents: Math.round((+o.amount_cents || 0) * 100), description: o.description } }); toast('Coût ajouté', 'success'); viewFleetCosts(); }
      catch (e2) { toast(e2.message, 'error'); } };
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { try { await api('/fleet/costs/' + b.dataset.del, { method: 'DELETE' }); viewFleetCosts(); } catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewFleetIncidents() {
  showLoading();
  try {
    const [idv, vd, dr] = await Promise.all([api('/fleet/incidents'), api('/fleet/vehicles'), api('/fleet/drivers').catch(() => ({ drivers: [] }))]);
    const incidents = idv.incidents || []; const vehicles = vd.vehicles || []; const drivers = dr.drivers || [];
    const open = incidents.filter(i => !i.resolved);
    const done = incidents.filter(i => i.resolved);
    const card = (i) => `
      <div class="fl-inc-card ${i.resolved ? 'resolved' : ''}">
        <div class="fl-inc-top">
          <span class="fl-chip ${i.resolved ? 'ok' : 'ko'}">${esc(i.type)}</span>
          <span class="hint">${esc((i.occurred_at || '').slice(0, 10))}</span>
        </div>
        <div class="fl-inc-veh">${I('car')} <b>${esc(i.make)} ${esc(i.model)}</b> <span class="hint">${esc(i.plate)}</span></div>
        <p class="hint" style="margin:0.4rem 0">${esc(i.description || '—')}${i.location ? '<br>📍 ' + esc(i.location) : ''}</p>
        <div class="fl-inc-foot">
          <span class="hint">${i.driver_name ? '🧑‍🔧 ' + esc(i.driver_name) : ''}</span>
          <span>${i.cost_cents ? '<b>' + money(i.cost_cents) + '</b>' : ''}
            <button class="btn btn-sm ${i.resolved ? 'btn-ghost' : ''}" data-res="${i.id}">${i.resolved ? 'Rouvrir' : 'Résoudre'}</button></span>
        </div>
      </div>`;
    const content = `
      <div class="fl-stats-line">
        <span class="fl-chip ko">À traiter ${open.length}</span>
        <span class="fl-chip ok">Résolus ${done.length}</span>
      </div>
      <div class="card fl-panel">
        <div class="fl-panel-h">${I('siren')} Déclarer un incident</div>
        <form id="fp-inc" class="fl-form">
          <div class="form-row-3">
            <label>Véhicule * <select name="vehicle_id" required><option value="">— Choisir —</option>${vehicles.map(v => `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} ${esc(v.plate)}</option>`).join('')}</select></label>
            <label>Type * <select name="type" required><option>ACCIDENT</option><option>PANNE</option><option>AMENDE</option><option>DEGAT</option><option>AUTRE</option></select></label>
            <label>Conducteur <select name="driver_id"><option value="">— Non précisé —</option>${drivers.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>
          </div>
          <label>Description <input name="description" placeholder="Description de l'incident"></label>
          <div class="form-row-2"><label>Lieu <input name="location" placeholder="Lieu"></label>
            <label>Coût (FCFA) <input name="cost_cents" type="number" step="1" min="0" placeholder="0"></label></div>
          <button type="submit" class="btn">${I('plus')} Déclarer</button>
        </form>
      </div>
      ${flGroup('Incidents à traiter', 'alert-triangle', `<div class="fl-card-grid">${open.map(card).join('') || `<div class="fl-empty">${I('check')} Aucun incident ouvert</div>`}</div>`, 'ko')}
      ${done.length ? flGroup('Incidents résolus', 'check-circle', `<div class="fl-card-grid">${done.map(card).join('')}</div>`, 'ok') : ''}
      ${!incidents.length ? `<div class="card fl-empty">${I('alert-triangle')} Aucun incident déclaré.</div>` : ''}
    `;
    layoutApp(fleetShell('incidents', 'Incidents du parc', 'alert-triangle', content));
    document.getElementById('fp-inc').onsubmit = async (ev) => { ev.preventDefault(); const o = Object.fromEntries(new FormData(ev.target));
      try { await api('/fleet/incidents', { method: 'POST', body: { vehicle_id: o.vehicle_id, type: o.type, description: o.description, location: o.location, cost_cents: Math.round((+o.cost_cents || 0) * 100), driver_id: o.driver_id || null } }); toast('Incident déclaré', 'success'); viewFleetIncidents(); }
      catch (e2) { toast(e2.message, 'error'); } };
    document.querySelectorAll('[data-res]').forEach(b => b.onclick = async () => {
      const resolved = !b.textContent.includes('Rouvrir');
      try { await api('/fleet/incidents/' + b.dataset.res + '/resolve', { method: 'PATCH', body: { resolved } }); viewFleetIncidents(); }
      catch (e) { toast(e.message, 'error'); } });
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}

async function viewFleetReports() {
  showLoading();
  try {
    const d = await api('/fleet/reports');
    const catTotal = d.by_category.reduce((a, c) => a + c.total, 0) || 1;
    const chart = (title, icon, rowsHtml) => `
      <div class="card fl-chart">
        <div class="fl-panel-h">${I(icon)} ${esc(title)}</div>
        ${rowsHtml}
      </div>`;
    const barRow = (label, val, total, color, valLabel) => `
      <div class="fl-bar-row">
        <span class="fl-bar-label">${label}</span>
        <div class="fl-bar-large">${flBar(typeof val === 'number' ? val : val, total, color)}</div>
        <b class="fl-bar-val">${valLabel ?? val}</b>
      </div>`;
    const monthlyMax = Math.max(...(d.by_month || []).map(m => m.total), 1);
    const repairsMax = Math.max(...(d.repairs_by_month || []).map(m => m.items), 1);
    const topMax = Math.max(...(d.top_costs || []).map(c => c.total), 1);
    const kpis = `
      <div class="fl-kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        ${flKpi('Coûts totaux', money(catTotal - 0 + (catTotal ? 0 : 0)), d.by_category.length + ' catégorie(s)', 'wallet', 'accent')}
        ${flKpi('Incidents', (d.by_incident_type || []).reduce((a, c) => a + c.items, 0), (d.by_incident_type || []).length + ' type(s)', 'alert-triangle', 'ko')}
        ${flKpi('Réparations clôturées', (d.repairs_by_month || []).reduce((a, c) => a + c.items, 0), '6 derniers mois', 'settings', 'ok')}
      </div>`;
    const content = kpis + `
      <div class="fl-grid-2">
        ${chart('Coûts par catégorie', 'wallet', (d.by_category || []).length ? d.by_category.map(c => barRow(c.category, c.total, catTotal, 'var(--accent)', money(c.total))).join('') : '<div class="fl-empty">Aucun coût</div>')}
        ${chart('Coûts par mois (6 mois)', 'calendar', (d.by_month || []).length ? d.by_month.map(m => barRow(m.month, m.total, monthlyMax, '#10b981', money(m.total))).join('') : '<div class="fl-empty">Aucun coût mensuel</div>')}
        ${chart('Incidents par type', 'alert-triangle', (d.by_incident_type || []).length ? d.by_incident_type.map(t => barRow(t.type, t.items, (d.by_incident_type || []).reduce((a, c) => a + c.items, 0) || 1, '#f59e0b', t.items)).join('') : '<div class="fl-empty">Aucun incident</div>')}
        ${chart('Réparations clôturées par mois', 'settings', (d.repairs_by_month || []).length ? d.repairs_by_month.map(m => barRow(m.month, m.items, repairsMax, '#ec4899', m.items + ' répara.')).join('') : '<div class="fl-empty">Aucune réparation</div>')}
        ${chart('Coûts par véhicule (top 6)', 'trophy', (d.top_costs || []).length ? d.top_costs.slice(0, 6).map(c => barRow(`${c.make} ${c.model} (${c.plate})`, c.total, topMax, '#8b5cf6', money(c.total))).join('') : '<div class="fl-empty">Aucune donnée</div>')}
      </div>`;
    layoutApp(fleetShell('reports', 'Rapports du parc', 'bar-chart-3', content));
    renderIcons();
  } catch (e) { layoutApp(err(e)); } finally { hideLoading(); }
}
