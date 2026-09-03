'use strict';
// C-AUTO — simulation serveur de plateforme statique (Vercel / Netlify /
// Cloudflare Pages) pour les specs E2E de déploiement « simple ».
// Sémantique reproduite (voir deploy/frontend/) :
//   1. les fichiers réels de frontend/www sont servis, avec les règles de
//      cache (SW jamais en cache, assets versionnés immuables, HTML frais) ;
//   2. /api/* est proxifié vers l'API C-AUTO (ici https://localhost via
//      nginx = l'« origin » du backend) — retour sans changement d'URL ;
//   3. repli SPA : /app/* -> /app/index.html, /* -> /index.html.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', '..', 'frontend', 'www');
const API_ORIGIN = process.env.CAUTO_E2E_API_ORIGIN || 'https://localhost';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

function cacheControl(pathname) {
  const p = pathname.replace(/\/+$/, '');
  if (p === '/app/sw.js' || p === '/app/pwa.js' || p === '/app/manifest.json') return 'no-cache, must-revalidate';
  if (p === '/app/index.html' || p === '/app/offline.html' || p === '/index.html' || p.endsWith('.html')) return 'no-cache, must-revalidate';
  if (p.startsWith('/app/') && /\.(js|css)$/.test(p)) return 'public, max-age=604800, immutable';
  if (p.startsWith('/app/icons/') || /^\/(css|js|img)\//.test(p)) return 'public, max-age=604800';
  return 'no-cache, must-revalidate';
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname.split('?')[0]).replace(/\/+$/, '') || '/';
  let file = path.join(WWW, rel);
  if (!file.startsWith(WWW)) { res.writeHead(403); res.end('forbidden'); return; }
  let body = null;
  try { body = fs.readFileSync(file); } catch (e) { body = null; }
  if (body === null) {
    // Repli SPA (équivalent des règles 200-rewrite des plateformes)
    const fallback = rel.startsWith('/app') ? '/app/index.html' : '/index.html';
    try { body = fs.readFileSync(path.join(WWW, fallback)); } catch (e) { body = null; }
    if (body === null) { res.writeHead(404); res.end('not found'); return; }
    rel = fallback;
  }
  const ext = path.extname(rel).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl(rel),
  });
  res.end(body);
}

function proxyApi(req, res, pathname) {
  // Proxy /api/* -> API_ORIGIN (grille interne self-signed : on désactive la
  // validation TLS, comme le ferait le cluster C-AUTO derrière son nginx).
  const qi = req.url.indexOf('?');
  const search = qi === -1 ? '' : req.url.slice(qi);
  const upstream = new URL(API_ORIGIN + pathname + search);
  const opt = {
    hostname: upstream.hostname,
    port: upstream.port || (upstream.protocol === 'http:' ? 80 : 443),
    path: upstream.pathname + upstream.search,
    method: req.method,
    headers: { ...req.headers, host: upstream.host },
    rejectUnauthorized: false,
  };
  const preq = https.request(opt, (pres) => {
    res.writeHead(pres.statusCode || 502, {
      'Content-Type': pres.headers['content-type'] || 'application/octet-stream',
      'X-Cauto-Upstream': 'proxied',
    });
    pres.pipe(res);
  });
  preq.on('error', (e) => { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('API upstream unreachable: ' + e.message); });
  req.pipe(preq);
}

function startStaticServer(port = 0) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/api/')) return proxyApi(req, res, u.pathname);
    return serveStatic(req, res, u.pathname);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ port: addr.port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { startStaticServer, WWW };