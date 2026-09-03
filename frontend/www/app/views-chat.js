/* C-AUTO — Messagerie interne (modules 61/62)
   Chat collaboratif entre tous les rôles : clients, pros, fournisseurs, admin.
   Polling léger (5 s dans une conversation, 25 s pour le badge non-lus).
   Navigation : {hash}/#/chat  et  {hash}/#/chat/:id

   v2 — "comme WhatsApp" :
   - actualisation SILENCIEUSE : le fil est mis à jour par ajout incrémental
     (diff par id + mise à jour des pastilles in situ), sans ré-render ;
   - pièces jointes (image / vidéo / note vocale / fichier) servi en blob via
     le token (pas de <img> cross-origin 401) ;
   - accusés de lecture : ✓ envoyé → ✓✓ délivré → ✓✓ bleu lu.
*/
'use strict';

const chatState = { pollTimer: null, convId: null, media: new Map(), rec: { active: false, chunks: [], recorder: null, stream: null, timer: null, started: 0 } };

function clearChatPoll() { if (chatState.pollTimer) { clearInterval(chatState.pollTimer); chatState.pollTimer = null; } chatState.convId = null; }

async function updateChatUnread() {
  if (!S.token || !S.user) return;
  const badge = document.getElementById('chat-unread');
  if (!badge) return;
  try {
    const d = await api('/chat/conversations');
    const total = Number(d.total_unread) || 0;
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.toggle('hidden', total === 0);
  } catch (_) { /* badge silencieux en offline */ }
}

function chatDayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const same = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (same(d, now)) return 'aujourd\u2019hui';
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (same(d, yest)) return 'hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function chatTime(iso) { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function chatAvatar(name, id) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `<span class="chat-avatar" data-cid="${id || ''}">${esc(initials)}</span>`;
}
const ROLE_LABELS = { CLIENT: 'Client', GARAGE: 'Garage', MECANICIEN: 'Mécanicien', EXPERT: 'Expert', SUPPLIER: 'Fournisseur', ADMIN: 'Admin', SUPER_ADMIN: 'Admin' };

/* ================= MÉDIAS & STATUTS ================= */
const KIND_LABEL = { IMAGE: 'Image', VIDEO: 'Vidéo', AUDIO: 'Note vocale', FILE: 'Fichier' };
const KIND_ICON = { IMAGE: 'image', VIDEO: 'video', AUDIO: 'mic', FILE: 'paperclip' };
function fmtSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' o';
  if (b < 1048576) return (b / 1024).toFixed(1).replace('.', ',') + ' Ko';
  return (b / 1048576).toFixed(1).replace('.', ',') + ' Mo';
}
const TICK_SVG = '<svg class="tick" viewBox="0 0 16 12" aria-hidden="true"><path d="M1.5 6.5 5.5 10 14.5 2"/></svg>';
function tickHtml(m) {
  if (!m || m.sender_id !== S.user.id) return '';
  const read = !!m.read_at, del = !!m.delivered_at;
  return `<span class="msg-ticks ${read ? 'is-read' : (del ? 'is-delivered' : '')}" title="${read ? 'Lu' : (del ? 'Délivré' : 'Envoyé')}">${TICK_SVG}${TICK_SVG}</span>`;
}
function attHtml(m) {
  const atts = m.attachments || [];
  if (!atts.length) return '';
  return atts.map(a => {
    const isImg = a.kind === 'IMAGE' || String(a.mime || '').startsWith('image/');
    const isVid = a.kind === 'VIDEO' || (String(a.mime || '').startsWith('video/') && !String(a.mime || '').startsWith('audio/'));
    const isAud = a.kind === 'AUDIO' || String(a.mime || '').startsWith('audio/');
    if (isImg) return `<div class="msg-media-wrap"><img class="msg-media" data-doc="${a.id}" alt="Photo" loading="lazy"><span class="msg-media-fallback hidden">${I('image-off')} Photo</span></div>`;
    if (isVid) return `<div class="msg-media-wrap"><video class="msg-media" data-doc="${a.id}" controls preload="metadata"></video></div>`;
    if (isAud) return `<div class="msg-note"><audio controls class="msg-audio" data-doc="${a.id}"></audio>${KIND_LABEL.AUDIO}</div>`;
    const name = a.name || 'Fichier';
    return `<div class="msg-file"><span class="msg-file-icon">${I(KIND_ICON[a.kind] || 'file')}</span>
      <div class="msg-file-meta"><b>${esc(String(name).slice(0, 80))}</b><small>${fmtSize(a.size)} · ${esc(KIND_LABEL[a.kind] || 'Fichier')}</small></div>
      <button type="button" class="btn btn-sm msg-file-btn" data-dl="${a.id}" data-name="${esc(String(name).slice(0, 120))}">${I('download')}</button></div>`;
  }).join('');
}
/* Récupère le binaire authentifié → object URL, puis hydrate les médias du fil. */
async function loadChatBlob(docId) {
  if (chatState.media.has(docId)) return chatState.media.get(docId);
  const r = await fetch('/api/documents/' + docId + '/download?view=1', { headers: { Authorization: 'Bearer ' + S.token } });
  if (!r.ok) throw new Error('http ' + r.status);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  chatState.media.set(docId, url);
  return url;
}
async function hydrateMedia(root) {
  const nodes = Array.from(root.querySelectorAll('[data-doc]'));
  if (!nodes.length) return;
  await Promise.all(nodes.map(async (el) => {
    const id = el.dataset.doc;
    try {
      const url = await loadChatBlob(id);
      el.src = url;
      el.onload = () => el.classList.add('is-loaded');
    } catch (_) {
      el.closest('.msg-media-wrap') && el.closest('.msg-media-wrap').classList.add('is-broken');
      el.classList.add('is-broken');
    }
  }));
}
async function downloadChatDoc(docId, name) {
  try {
    const url = await loadChatBlob(docId);
    const a = document.createElement('a');
    a.href = url; a.download = name || 'fichier';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast('Téléchargement impossible', 'error'); }
}
function msgBubbleHtml(m, dayHeader) {
  return `${dayHeader ? `<div class="chat-day"><span>${esc(dayHeader)}</span></div>` : ''}
  <div class="chat-bubble-row ${m.sender_id === S.user.id ? 'mine' : 'theirs'}" data-mid="${m.id}">
    ${m.sender_id === S.user.id ? '' : chatAvatar(m.sender_name, m.sender_id)}
    <div class="chat-bubble">
      ${m.sender_id === S.user.id ? '' : `<div class="chat-bubble-author">${esc(m.sender_name)}</div>`}
      ${attHtml(m)}
      ${m.body ? `<div class="chat-bubble-body">${esc(m.body)}</div>` : ''}
      <div class="chat-bubble-time">${tickHtml(m)}${chatTime(m.created_at)}</div>
    </div>
  </div>`;
}
function buildThreadRows(messages) {
  let html = '', lastDay = '';
  for (const m of messages) {
    const day = chatDayLabel(m.created_at);
    html += msgBubbleHtml(m, day !== lastDay ? day : null);
    lastDay = day;
  }
  return html || `<div class="empty">${I('message-square')}<p>Dites bonjour \u2013 cette conversation démarre ici.</p></div>`;
}
/* Met à jour les pastilles ✓ / ✓✓ / ✓✓ bleu des messages déjà affichés, sans toucher au DOM sinon. */
function applyTicks(thread, messages) {
  const index = new Map(messages.map(m => [String(m.id), m]));
  thread.querySelectorAll('[data-mid]').forEach(row => {
    const m = index.get(row.getAttribute('data-mid'));
    if (!m) return;
    const el = row.querySelector('.msg-ticks');
    if (!el) return;
    const read = !!m.read_at, del = !!m.delivered_at;
    el.classList.toggle('is-read', read);
    el.classList.toggle('is-delivered', !read && del);
    el.title = read ? 'Lu' : (del ? 'Délivré' : 'Envoyé');
  });
}

/* ================= LISTE DES CONVERSATIONS ================= */
async function viewChat() {
  clearChatPoll();
  loadingShell('list');
  try {
    const d = await api('/chat/conversations');
    const convs = d.conversations || [];
    const items = convs.length ? convs.map(c => {
      const span = c.participants.map(p => p.name).join(', ') || c.title;
      const lastBy = c.last_message && c.last_message.sender_id === S.user.id ? 'Vous : ' : (c.last_message ? esc(c.last_message.sender_name) + ' : ' : '');
      let sub = 'Nouvelle conversation';
      if (c.last_message) {
        sub = c.last_message.body ? String(c.last_message.body) : (KIND_LABEL[c.last_message.attachment_kind] || 'Pièce jointe');
      }
      return `<button type="button" class="chat-conv-item ${c.unread_count ? 'is-unread' : ''}" data-go="#/chat/${c.id}">
        ${chatAvatar((c.participants[0] && c.participants[0].name) || c.title, c.id)}
        <div class="chat-conv-meta">
          <div class="chat-conv-head"><b>${esc(span)}</b><span class="chat-conv-date">${c.last_message ? chatTime(c.last_message.created_at) : chatDayLabel(c.created_at)}</span></div>
          <div class="chat-conv-sub">${c.unread_count ? `<span class="chat-unread-pill">${c.unread_count}</span>` : ''}${lastBy}${esc(sub)}</div>
        </div>
      </button>`;
    }).join('') : `<div class="empty chat-empty">${I('message-square-dashed')}<p>Vous n'avez pas encore de conversation.<br><b>Écrivez à un professionnel, un fournisseur ou votre contact.</b></p></div>`;
    layoutApp(`
      <div class="page chat-page ${convs.length ? 'has-thread' : ''}">
        <div class="page-head">
          <div><h1>Messages</h1><p class="page-sub">Toutes vos échanges C-AUTO au même endroit.</p></div>
          <button class="btn btn-primary" id="btn-new-conv">${I('square-pen')} Nouvelle conversation</button>
        </div>
        <div class="chat-list">${items}</div>
      </div>`);
    document.getElementById('btn-new-conv').onclick = openNewConversation;
    document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => location.hash = b.dataset.go);
  } catch (e) { layoutApp(err(e)); }
}

/* ================= DÉTAIL D'UNE CONVERSATION ================= */
async function viewChatDetail(id) {
  clearChatPoll();
  chatState.convId = id;
  loadingShell('list');
  try {
    const d = await api('/chat/conversations/' + id + '/messages');
    const conv = d.conversation;
    const title = conv.title || d.participants.map(p => p.name).join(', ');
    layoutApp(`
      <div class="page chat-page has-thread">
        <div class="page-head">
          <a class="btn btn-ghost btn-sm" href="#/chat">${I('arrow-left')} Retour</a>
          <div class="chat-title"><h1>${esc(title)}</h1>
            <p class="page-sub">${conv.kind === 'GROUP' ? 'Conversation de groupe' : ''} ${d.participants.filter(p => p.id !== S.user.id).map(p => `${ROLE_LABELS[p.role] || p.role} · ${esc(p.name)}`).join(' · ')}</p>
          </div>
        </div>
        <div class="chat-thread" id="chat-thread">${buildThreadRows(d.messages || [])}</div>
        <div class="rec-bar" id="rec-bar" hidden>
          <span class="rec-dot"></span><b id="rec-time">0:00</b>
          <button type="button" id="rec-cancel" class="btn btn-ghost btn-sm">${I('x')} Annuler</button>
        </div>
        <form class="chat-composer" id="chat-composer">
          <button type="button" class="composer-tool" id="btn-attach" title="Joindre une image, une vidéo ou un fichier">${I('paperclip')}</button>
          <button type="button" class="composer-tool" id="btn-voice" title="Note vocale">${I('mic')}</button>
          <input name="body" type="text" maxlength="4000" autocomplete="off" placeholder="Votre message…">
          <button class="btn btn-primary composer-send" type="submit">${I('send-horizontal')} Envoyer</button>
          <input type="file" id="attach-input" hidden multiple accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt">
        </form>
      </div>`);
    const thread = document.getElementById('chat-thread');
    thread.scrollTop = thread.scrollHeight;
    hydrateMedia(thread);
    wireComposer(id, thread);
    renderIcons();
    if (chatState.convId === id) chatState.pollTimer = setInterval(() => loadChatThread(id, false), 5000);
  } catch (e) { layoutApp(err(e)); }
}

async function uploadChatMedia(id, file, kind, body) {
  const fd = new FormData();
  fd.append('file', file, file.name || (kind === 'AUDIO' ? 'note-vocale.webm' : 'fichier'));
  fd.append('kind', kind);
  if (body) fd.append('body', body);
  const r = await api('/chat/conversations/' + id + '/attachments', { method: 'POST', body: fd });
  return r.message;
}

function wireComposer(id, thread) {
  const form = document.getElementById('chat-composer');
  const input = form.body;
  const sendBtn = form.querySelector('.composer-send');
  const attachBtn = document.getElementById('btn-attach');
  const voiceBtn = document.getElementById('btn-voice');
  const attachInput = document.getElementById('attach-input');
  const recBar = document.getElementById('rec-bar');
  const recTime = document.getElementById('rec-time');
  const recCancel = document.getElementById('rec-cancel');

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    if (chatState.rec.active) { stopChatRecSend(); return; }
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    sendBtn.disabled = true;
    const label = sendBtn.innerHTML;
    sendBtn.innerHTML = '<span class="mloader"></span> Envoi…';
    try {
      await api('/chat/conversations/' + id + '/messages', { method: 'POST', body: { body } });
      await loadChatThread(id, true);
    } catch (e2) {
      toast(e2.message || 'Envoi impossible', 'error');
      input.value = body;
    } finally { sendBtn.disabled = false; sendBtn.innerHTML = label; }
  };

  attachBtn.onclick = () => attachInput.click();
  attachInput.onchange = async () => {
    const files = Array.from(attachInput.files || []);
    attachInput.value = '';
    if (!files.length) return;
    sendBtn.disabled = true;
    const label = sendBtn.innerHTML;
    sendBtn.innerHTML = '<span class="mloader"></span> Envoi…';
    try {
      for (const f of files) {
        const isImage = /^image\//.test(f.type);
        const isVideo = /^video\//.test(f.type);
        const isAudio = /^audio\//.test(f.type);
        const kind = isImage ? 'IMAGE' : (isVideo ? 'VIDEO' : (isAudio ? 'AUDIO' : 'FILE'));
        await uploadChatMedia(id, f, kind);
      }
      await loadChatThread(id, true);
    } catch (e2) { toast(e2.message || 'Envoi de la pièce jointe impossible', 'error'); }
    finally { sendBtn.disabled = false; sendBtn.innerHTML = label; }
  };

  voiceBtn.onclick = (ev) => { ev.preventDefault(); if (chatState.rec.active) return; chatState.rec.send = false; startChatRec(voiceBtn, recBar, recTime, recCancel); };
  recCancel.onclick = cancelChatRec;

  thread.addEventListener('click', (ev) => {
    const dl = ev.target.closest('[data-dl]');
    if (dl) downloadChatDoc(dl.dataset.dl, dl.dataset.name);
  });
}

/* -------- Note vocale (MediaRecorder) -------- */
function recElapsed() { return Math.max(0, Math.round((Date.now() - chatState.rec.started) / 1000)); }
function recClock() { const s = recElapsed(); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function startChatRec(voiceBtn, recBar, recTime, recCancel) {
  if (chatState.rec.active || !navigator.mediaDevices || !window.MediaRecorder) {
    toast('Enregistrement vocal non pris en charge par ce navigateur', 'error'); return;
  }
  const chooseMime = () => {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    return '';
  };
  (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, chooseMime() ? { mimeType: chooseMime() } : undefined);
      const chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        chatState.rec.active = false; chatState.rec.recorder = null; chatState.rec.stream = null;
        clearInterval(chatState.rec.timer); chatState.rec.timer = null;
        recBar.hidden = true;
        voiceBtn.classList.remove('is-rec');
        const willSend = chatState.rec.send;
        chatState.rec.send = false;
        if (!willSend || !chunks.length) { if (!willSend && !chunks.length) toast('Note vocale annulée', 'warn'); return; }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], 'note-vocale.webm', { type: blob.type || 'audio/webm' });
        const capEl = document.getElementById('chat-composer');
        const caption = capEl ? capEl.elements.body.value.trim() : '';
        if (caption) capEl.elements.body.value = '';
        const sendBtn = document.querySelector('.chat-composer .composer-send');
        const label = sendBtn && sendBtn.innerHTML;
        if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<span class="mloader"></span> Envoi…'; }
        (async () => {
          try {
            await uploadChatMedia(chatState.convId, file, 'AUDIO', caption || undefined);
            await loadChatThread(chatState.convId, true);
          } catch (e) { toast(e.message || 'Envoi de la note vocale impossible', 'error'); }
          finally { if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = label; } }
        })();
      };
      recorder.start();
      chatState.rec.active = true; chatState.rec.chunks = chunks; chatState.rec.recorder = recorder;
      chatState.rec.stream = stream; chatState.rec.started = Date.now();
      voiceBtn.classList.add('is-rec');
      recBar.hidden = false;
      recTime.textContent = recClock();
      chatState.rec.timer = setInterval(() => { recTime.textContent = recClock(); }, 500);
    } catch (e) {
      toast('Micro inaccessible : autorisez le micro puis réessayez', 'error');
    }
  })();
}
function stopChatRecSend() {
  const rec = chatState.rec;
  if (!rec.active || !rec.recorder) return;
  rec.send = true;
  try { rec.recorder.stop(); } catch (e) { /* déjà arrêté */ }
  const voiceBtn = document.getElementById('btn-voice');
  if (voiceBtn) voiceBtn.classList.remove('is-rec');
}
function cancelChatRec() {
  const rec = chatState.rec;
  rec.send = false;
  if (!rec.active) return;
  chatState.rec.active = false;
  if (rec.recorder && rec.recorder.state !== 'inactive') { try { rec.recorder.onstop = null; rec.recorder.stop(); } catch (e) {} }
  if (rec.stream) rec.stream.getTracks().forEach(t => t.stop());
  clearInterval(rec.timer); rec.timer = null;
  const voiceBtn = document.getElementById('btn-voice');
  if (voiceBtn) voiceBtn.classList.remove('is-rec');
  const bar = document.getElementById('rec-bar');
  if (bar) bar.hidden = true;
}

/* ================= ACTUALISATION SILENCIEUSE =================
   Diff par id : on n'ajoute que les nouveaux messages et on rafraîchit les
   statuts ✓/✓✓/✓✓ lu in situ. Le scroll n'est recollé au bas que si
   l'utilisateur était déjà en bas. Aucun ré-render global. */
async function loadChatThread(id, jump) {
  if (chatState.convId !== id) return;
  const thread = document.getElementById('chat-thread');
  if (!thread) return;
  if (jump) { thread.scrollTop = thread.scrollHeight; }
  const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
  try {
    const d = await api('/chat/conversations/' + id + '/messages');
    const seen = new Set();
    thread.querySelectorAll('[data-mid]').forEach(r => seen.add(r.getAttribute('data-mid')));
    const fresh = (d.messages || []).filter(m => !seen.has(String(m.id)));
    if (fresh.length) {
      let html = '', lastDay = chatDayLabel(d.messages[0] ? d.messages[0].created_at : new Date().toISOString());
      for (const m of fresh) {
        const day = chatDayLabel(m.created_at);
        html += msgBubbleHtml(m, day !== lastDay ? day : null);
        lastDay = day;
      }
      thread.insertAdjacentHTML('beforeend', html);
      const last = thread.lastElementChild;
      if (last) hydrateMedia(last);
    }
    applyTicks(thread, d.messages || []);
    if (nearBottom) thread.scrollTop = thread.scrollHeight;
    updateChatUnread();
  } catch (_) {}
}

/* ================= NOUVELLE CONVERSATION ================= */
async function openNewConversation() {
  let dir = [];
  try { dir = (await api('/chat/directory')).users || []; } catch (e) { toast(e.message || 'Annuaire indisponible', 'error'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal chat-new-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${I('users-round')} Nouvelle conversation</h3><button type="button" class="modal-x" data-close>${I('x')}</button></div>
      <p class="page-sub">Sélectionnez un ou plusieurs contacts${dir.length ? ` (${dir.length} disponibles)` : ''}.</p>
      <div class="chat-directory">${dir.length ? dir.map(u => `
        <label class="chat-contact" data-id="${u.id}">
          <input type="checkbox" value="${u.id}">${chatAvatar(u.name, u.id)}
          <span class="chat-contact-name"><b>${esc(u.name)}</b><small>${ROLE_LABELS[u.role] || u.role}${u.shared_context ? ` · ${u.shared_context} échange(s) commun(s)` : ''}</small></span>
        </label>`).join('') : '<div class="empty">Aucun contact disponible.</div>'}</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="button" class="btn btn-primary" id="chat-start">${I('send-horizontal')} Démarrer</button>
      </div>
    </div>`;
  overlay.onclick = (ev) => { if (ev.target === overlay || ev.target.closest('[data-close]')) overlay.remove(); };
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.chat-contact').forEach(c => c.onclick = () => c.classList.toggle('checked'));
  overlay.querySelector('#chat-start').onclick = async () => {
    const ids = Array.from(overlay.querySelectorAll('input:checked')).map(i => i.value);
    if (!ids.length) { toast('Choisissez au moins un contact', 'warn'); return; }
    document.getElementById('chat-start').disabled = true;
    try {
      const r = await api('/chat/conversations', { method: 'POST', body: { participant_ids: ids } });
      toast('Conversation créée', 'success');
      overlay.remove();
      location.hash = '#/chat/' + r.conversation.id;
    } catch (e) { document.getElementById('chat-start').disabled = false; toast(e.message || 'Création impossible', 'error'); }
  };
  renderIcons();
}

/* Poeur de badge global (démarré une fois) — idempotent */
setInterval(() => { if (S.token) updateChatUnread(); }, 25000);

/* Lance une conversation directe avec un utilisateur (depuis une fiche pro/fournisseur) */
async function startChatWith(userId, name) {
  try {
    const r = await api('/chat/conversations', { method: 'POST', body: { participant_ids: [userId] } });
    location.hash = '#/chat/' + r.conversation.id;
  } catch (e) { toast((e.message || 'Ouverture de la conversation impossible'), 'error'); }
}
window.startChatWith = startChatWith;

window.chatState = chatState; window.updateChatUnread = updateChatUnread; window.clearChatPoll = clearChatPoll; window.loadChatThread = loadChatThread;