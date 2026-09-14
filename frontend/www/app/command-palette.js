// frontend/www/app/command-palette.js
// Command Palette ⌘K — recherche fuzzy unifiée (modules, pros, innovations, chats, actions)
import Fuse from 'https://esm.run/fuse.js@7.0.0';

const COMMAND_SOURCES = {
  modules: { label: 'Modules', icon: 'book-open', get: () => window.cautoCachedModules || [] },
  professionals: { label: 'Professionnels', icon: 'users', get: () => window.cautoCachedProfessionals || [] },
  innovations: { label: 'Innovations', icon: 'lightbulb', get: () => window.cautoCachedInnovations || [] },
  conversations: { label: 'Conversations', icon: 'message-square', get: () => window.cautoCachedConversations || [] },
  actions: { label: 'Actions', icon: 'zap', get: () => [
    { id: 'new-chat', label: 'Nouveau chat', desc: 'Démarrer une conversation', route: '#/chat/new' },
    { id: 'new-module', label: 'Nouveau module', desc: 'Créer un module', route: '#/modules/new' },
    { id: 'profile', label: 'Mon profil', desc: 'Voir / éditer mon profil', route: '#/profile' },
    { id: 'settings', label: 'Paramètres', desc: 'Configuration', route: '#/settings' },
    { id: 'logout', label: 'Déconnexion', desc: 'Se déconnecter', action: () => { location.hash = '#/logout'; } }
  ]}
};

const fuseOptions = {
  keys: ['label', 'desc', 'title', 'name', 'slug'],
  threshold: 0.35,
  includeScore: true,
  minMatchCharLength: 1
};

class CommandPalette {
  constructor() {
    this.isOpen = false;
    this.selectedIndex = 0;
    this.results = [];
    this.query = '';
    this.buildIndex();
    this.bindKeys();
  }

  buildIndex() {
    this.index = {};
    for (const [key, src] of Object.entries(COMMAND_SOURCES)) {
      const items = src.get().map((item) => ({ ...item, _source: key, _sourceLabel: src.label, _sourceIcon: src.icon }));
      this.index[key] = new Fuse(items, fuseOptions);
    }
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }
      if (this.isOpen) {
        if (e.key === 'Escape') this.close();
        else if (e.key === 'ArrowDown') { e.preventDefault(); this.selectNext(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.selectPrev(); }
        else if (e.key === 'Enter') { e.preventDefault(); this.execute(); }
      }
    });
  }

  search(q) {
    this.query = q.trim().toLowerCase();
    this.results = [];
    if (!this.query) return;
    for (const [key, fuse] of Object.entries(this.index)) {
      const hits = fuse.search(this.query).map((r) => ({ ...r.item, _score: r.score }));
      this.results.push(...hits);
    }
    this.results.sort((a, b) => (a._score || 1) - (b._score || 1));
    this.selectedIndex = 0;
    this.render();
  }

  toggle() { this.isOpen ? this.close() : this.open(); }
  open() { this.isOpen = true; this.query = ''; this.results = []; this.selectedIndex = 0; this.render(); document.body.classList.add('cmd-open'); }
  close() { this.isOpen = false; this.render(); document.body.classList.remove('cmd-open'); }
  selectNext() { this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1); this.render(); }
  selectPrev() { this.selectedIndex = Math.max(this.selectedIndex - 1, 0); this.render(); }
  execute() {
    const item = this.results[this.selectedIndex];
    if (!item) return;
    if (item.action) item.action();
    else if (item.route) location.hash = item.route;
    this.close();
  }

  render() {
    let el = document.getElementById('cmd-palette');
    if (!this.isOpen) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'cmd-palette';
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div class="cmd-overlay"></div>
      <div class="cmd-window">
        <div class="cmd-header">
          <i data-lucide="command" class="cmd-icon"></i>
          <input type="text" class="cmd-input" placeholder="Rechercher modules, pros, innovations, chats, actions…" value="${this.query}" spellcheck="false" autocomplete="off">
          <kbd class="cmd-hint">⌘K</kbd>
        </div>
        <div class="cmd-list">
          ${this.results.slice(0, 8).map((r, i) => `
            <div class="cmd-item ${i === this.selectedIndex ? 'selected' : ''}" data-index="${i}">
              <i data-lucide="${r._sourceIcon}" class="cmd-item-icon"></i>
              <div class="cmd-item-content">
                <span class="cmd-item-label">${r.label || r.title || r.name || r.slug}</span>
                ${r.desc ? `<span class="cmd-item-desc">${r.desc}</span>` : ''}
              </div>
              <span class="cmd-item-source">${r._sourceLabel}</span>
            </div>
          `).join('') || '<div class="cmd-empty">Aucun résultat</div>'}
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    const input = el.querySelector('.cmd-input');
    input?.focus();
    input?.addEventListener('input', (e) => this.search(e.target.value));
    el.querySelectorAll('.cmd-item').forEach((it, i) => {
      it.addEventListener('click', () => { this.selectedIndex = i; this.execute(); });
      it.addEventListener('mouseenter', () => { this.selectedIndex = i; this.render(); });
    });
  }
}

// Auto-init
window.addEventListener('DOMContentLoaded', () => {
  window.commandPalette = new CommandPalette();
});

export { CommandPalette, COMMAND_SOURCES };