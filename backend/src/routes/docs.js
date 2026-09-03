const express = require('express');
const { buildOpenApi, paths, info } = require('./openapi');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    name: info.info.title,
    version: info.info.version,
    description: info.info.description.split('. ')[0] + '.',
    baseUrl: '/api',
    endpoints: Object.keys(paths).length + ' opérations documentées',
    docs: '/api/docs',
    ui: '/api/ui'
  });
});

router.get('/docs', (_req, res) => {
  res.json(buildOpenApi());
});

router.get('/ui', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>C-AUTO API — Documentation</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;margin:24px auto;max-width:960px;padding:0 16px;background:#0f1420;color:#e8ecf4}
h1{color:#4ea1ff}h2{color:#9bd0ff;border-bottom:1px solid #26314a;padding-bottom:6px;margin-top:28px}
code{background:#1b2333;padding:2px 6px;border-radius:4px;color:#ffd479}
.op{display:flex;gap:12px;align-items:center;margin:8px 0}
.m{font-weight:700;padding:2px 8px;border-radius:4px;color:#fff}
.g{background:#2f9e44}.p{background:#f08c00}.d{background:#e8590c}.del{background:#c92a2a}
.pub{color:#69db7c;font-size:12px}.b{color:#ffa8a8;font-size:12px}
</style></head><body>
<h1>C-AUTO API — Documentation interactive</h1>
<p>Base : <code>/api</code> · Auth : <code>POST /api/auth/login</code> → renvoie <code>token</code> (Bearer JWT).<br>
RBAC appliqué côté serveur : <code>user_roles</code> + <code>role_permissions</code> (le frontend n'est jamais source de sécurité).</p>
<pre id="spec"></pre>
<script>
fetch('/api/docs').then(r=>r.json()).then(spec=>{
  document.title = spec.info.title;
  const h = document.createElement('div');
  const tags = {};
  Object.entries(spec.paths).forEach(([p, ops])=>{
    Object.entries(ops).forEach(([m, op])=>{
      const method = m.toUpperCase();
      const key = (op.tags && op.tags[0]) || 'autres';
      if(!tags[key]) tags[key] = [];
      tags[key].push({ method, p, summary: op.summary || '' });
    });
  });
  const col = { GET:'g', POST:'p', PATCH:'p', PUT:'d', DELETE:'del' };
  Object.entries(tags).forEach(([tag, items])=>{
    const s = document.createElement('h2'); s.textContent = tag; h.appendChild(s);
    items.forEach((it)=>{
      const d = document.createElement('div'); d.className = 'op';
      const m = document.createElement('span'); m.className = 'm ' + (col[it.method]||'g'); m.textContent = it.method;
      const code = document.createElement('code'); code.textContent = '/api' + it.p;
      const t = document.createElement('span'); t.textContent = it.summary;
      d.append(m, code, t); h.appendChild(d);
    });
  });
  document.getElementById('spec').replaceWith(h);
});
</script>
</body></html>`);
});

module.exports = router;