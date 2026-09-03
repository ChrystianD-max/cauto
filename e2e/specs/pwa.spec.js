const { test, expect } = require('@playwright/test');

test('PWA : manifest servi + installation (service worker + cache essentiel)', async ({ page, request }) => {
  const res = await request.get('/app/manifest.json');
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.name).toContain('C-AUTO');
  expect(manifest.start_url).toContain('/app/');
  expect(manifest.icons.some((i) => i.sizes === '512x512' && i.src.endsWith('icon-512.png'))).toBe(true);
  expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);

  await page.goto('/app/', { waitUntil: 'commit' });
  await page.waitForFunction(
    () => !!navigator.serviceWorker && !!navigator.serviceWorker.controller,
    null,
    { timeout: 30000 },
  );

  const summary = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const entries = [];
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      entries.push({ name, paths: keys.map((k) => new URL(k.url).pathname + new URL(k.url).search) });
    }
    return { controller: !!navigator.serviceWorker.controller, scope: reg && reg.scope, entries };
  });

  expect(summary.controller).toBe(true);
  expect(summary.scope).toBe('https://localhost/app/');
  const paths = [].concat(...summary.entries.map((e) => e.paths));
  expect(paths).toContain('/app/index.html');
  expect(paths).toContain('/app/offline.html');
  expect(paths.some((p) => p.includes('/app-v8.js?v=11.5'))).toBe(true);
  expect(paths.some((p) => p.includes('/styles.css?v=10.14'))).toBe(true);
});

test('PWA : page offline & navigation hors ligne depuis le cache', async ({ page }) => {
  await page.goto('/app/', { waitUntil: 'commit' });
  await page.waitForFunction(
    () => !!navigator.serviceWorker && !!navigator.serviceWorker.controller,
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => caches.keys().then((names) =>
    Promise.all(names.map((name) => caches.open(name).then((c) => c.add('./index.html')))),
  ));

  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('body')).toContainText('C-AUTO', { timeout: 15000 });
  await expect(page).toHaveTitle('C-AUTO — La confiance au coeur de l\'automobile');
  await page.context().setOffline(false);
  await expect(page).toHaveTitle('C-AUTO — La confiance au coeur de l\'automobile');
});
