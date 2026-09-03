const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { startStaticServer } = require('../lib/static-server');

const ADM = { email: 'admin.demo@cauto.local', password: 'Test1234!' };
const WWW = path.join(__dirname, '..', '..', 'frontend', 'www');
const PLATFORMS = path.join(__dirname, '..', '..', 'deploy', 'frontend');

let server;

test.beforeAll(async () => {
  server = await startStaticServer(0);
});

test.afterAll(async () => {
  if (server) await server.close();
});

test('Deploy simple : fichiers de plateformes présents et valides', () => {
  // Vercel — JSON valide + proxy /api + repli SPA + SW jamais en cache
  const vercel = JSON.parse(fs.readFileSync(path.join(PLATFORMS, 'vercel.json'), 'utf8'));
  const vRewrites = vercel.rewrites.map((r) => [r.source, r.destination]);
  expect(vRewrites).toContainEqual(['/api/(.*)', 'https://__BACKEND_API_ORIGIN__/api/$1']);
  expect(vRewrites.some((r) => r[0] === '/app/:path*')).toBe(true);
  expect(vercel.headers.some((h) => h.source === '/app/(sw.js|pwa.js|manifest.json)')).toBe(true);

  // Netlify — TOML : proxy /api, repli SPA, headers SW/immutables
  const netlify = fs.readFileSync(path.join(PLATFORMS, 'netlify.toml'), 'utf8');
  expect(netlify).toContain('from = "/api/*"');
  expect(netlify).toContain('to = "https://__BACKEND_API_ORIGIN__/api/:splat"');
  expect(netlify).toContain('from = "/app/*"');
  expect(netlify).toContain('for = "/app/sw.js"');
  expect(netlify).toContain('for = "/app/*.js"');
  expect(netlify).toContain('public, max-age=604800, immutable');

  // Cloudflare Pages — _redirects + _headers
  const cfRedirects = fs.readFileSync(path.join(PLATFORMS, 'cloudflare-pages', '_redirects'), 'utf8');
  expect(cfRedirects).toContain('/api/*  https://__BACKEND_API_ORIGIN__/api/*  200');
  expect(cfRedirects).toContain('/app/*  /app/index.html  200');
  expect(cfRedirects).toContain('/*  /index.html  200');
  const cfHeaders = fs.readFileSync(path.join(PLATFORMS, 'cloudflare-pages', '_headers'), 'utf8');
  expect(cfHeaders).toContain('/app/sw.js');
  expect(cfHeaders).toContain('public, max-age=604800, immutable');
});

test('Deploy simple : shell SPA + en-têtes de cache (équivalent nginx)', async ({ request }) => {
  const origin = `http://127.0.0.1:${server.port}`;

  // Page marketing + SPA /app : HTML frais
  const root = await request.get(`${origin}/`);
  expect(root.status()).toBe(200);
  expect(root.headers()['cache-control']).toContain('no-cache');
  expect(await root.text()).toContain('C-AUTO');

  const app = await request.get(`${origin}/app/`);
  expect(app.status()).toBe(200);
  expect(app.headers()['cache-control']).toContain('no-cache');
  const appHtml = await app.text();
  expect(appHtml).toContain('<main id="app"></main>');
  // Aucune dépendance bloquante externe (CDN) : les icônes sont auto-hébergées
  expect(appHtml).not.toContain('unpkg.com');
  expect(appHtml).toContain('vendor/lucide.min.js?v=1.0');

  // SW / registre : JAMAIS en cache long
  const sw = await request.get(`${origin}/app/sw.js`);
  expect(sw.status()).toBe(200);
  expect(sw.headers()['cache-control']).toContain('no-cache');
  const swBody = await sw.text();
  expect(swBody).toContain('cauto-pwa-v17');

  for (const p of ['/app/pwa.js', '/app/manifest.json']) {
    const r = await request.get(`${origin}${p}`);
    expect(r.status()).toBe(200);
    expect(r.headers()['cache-control']).toContain('no-cache');
  }

  // Assets versionnés ?v= : immuables
  const asset = await request.get(`${origin}/app/app-v8.js?v=11.5`);
  expect(asset.status()).toBe(200);
  expect(asset.headers()['cache-control']).toContain('immutable');

  const vendor = await request.get(`${origin}/app/vendor/lucide.min.js?v=1.0`);
  expect(vendor.status()).toBe(200);
  expect(vendor.headers()['cache-control']).toContain('immutable');

  // Repli SPA : toute route /app/* inexistante sert le shell
  const deep = await request.get(`${origin}/app/pi%C3%A8ces-d%C3%A9taillees`);
  expect(deep.status()).toBe(200);
  expect(await deep.text()).toContain('<main id="app"></main>');

  // Repli racine marketing
  const marketing = await request.get(`${origin}/une-page-inconnue`);
  expect(marketing.status()).toBe(200);
  expect(await marketing.text()).toContain('C-AUTO');
});

test('Deploy simple : l’API passe par le proxy de plateforme (login + données)', async ({ page }) => {
  const origin = `http://127.0.0.1:${server.port}`;

  // /api proxifié sans changement d'URL côté navigateur
  const configResp = await page.request.get(`${origin}/api/config`);
  expect(configResp.status()).toBe(200);
  const configJson = await configResp.json();
  expect(configJson.demoMode).toBe(false);
  expect(configJson.mode).toBe('LIVE');

  // Parcours de connexion complet via le frontend servi par la « plateforme »
  await page.goto(`${origin}/app/#/login`, { waitUntil: 'commit' });
  await page.fill('#f-login input[name=email]', ADM.email);
  await page.fill('#f-login input[name=password]', ADM.password);
  await page.click('#f-login button[type=submit]');
  await page.waitForFunction(() => location.hash === '#/admin/dashboard', null, { timeout: 20000 });
  await expect(page.locator('#app')).toContainText('C-AUTO');
});