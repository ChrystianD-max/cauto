const { chromium } = require('playwright');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://cauto.onrender.com';
const VIEWPORTS = [
  { name: 'm375', width: 375, height: 667, mobile: true },
  { name: 'm390', width: 390, height: 844, mobile: true },
  { name: 'd1440', width: 1440, height: 900, mobile: false },
];
let failures = 0;
function check(ok, label, extra) {
  if (!ok) failures++;
  console.log((ok ? '  OK  ' : ' FAIL ') + label + (extra ? ' - ' + extra : ''));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of VIEWPORTS) {
    console.log('\n=== LIVE ' + vp.name + ' (' + vp.width + 'x' + vp.height + ') ===');
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      deviceScaleFactor: vp.mobile ? 2.5 : 1,
      userAgent: vp.mobile
        ? 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        : undefined,
    });
    const page = await context.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
    const localErrs = [];
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().includes('fonts.g') && !r.url().includes('googleapis')) localErrs.push(r.status() + ' ' + r.url());
    });
    page.on('requestfailed', (r) => {
      if (!r.url().includes('fonts.g') && !r.url().includes('googleapis')) localErrs.push('REQFAIL ' + r.url());
    });

    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(3000);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, 'no horizontal overflow', 'delta=' + overflow + 'px');
    check(await page.locator('.mock-phone').isVisible().catch(() => false), 'phone mockup visible');
    check((await page.locator('.ring .val b').textContent().catch(() => '')).trim() === '82', 'C-Score 82 displayed');
    const dash = await page.evaluate(() => {
      const b = document.querySelector('.ring .bar');
      return b ? getComputedStyle(b).strokeDashoffset : null;
    });
    check(dash !== null, 'ring measured', 'dashoffset=' + dash);

    for (const t of ['pro', 'fleet', 'pieces', 'client']) {
      await page.click('#tab-' + t, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(120);
      const shown = await page.locator('#pane-' + t).getAttribute('aria-hidden').catch(() => null);
      check(shown === 'false', 'tab "' + t + '" pane shown');
    }

    const burger = await page.locator('#navToggle').isVisible().catch(() => false);
    check(burger === (vp.width <= 900), 'burger matches breakpoint', 'visible=' + burger);
    if (burger) {
      await page.click('#navToggle');
      await page.waitForTimeout(150);
      const open = await page.locator('#navMenu').evaluate((el) => el.classList.contains('open')).catch(() => false);
      check(open, 'burger opens menu');
      await page.click('#navMenu a[href="#produit"]');
      await page.waitForTimeout(200);
      const closed = await page.locator('#navMenu').evaluate((el) => !el.classList.contains('open')).catch(() => false);
      check(closed, 'burger closes on link');
    }

    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y <= h + 250; y += 250) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
    const inCount = await page.locator('.anim.in').count();
    const totalAnim = await page.locator('.anim').count();
    check(inCount >= totalAnim - 3, 'reveal near-complete', inCount + '/' + totalAnim);
    check(await page.locator('.footer-grid').isVisible().catch(() => false), 'footer visible');

    if (errs.length) console.log('  JS/console errors:', errs.slice(0, 4));
    if (localErrs.length) console.log('  bad responses:', localErrs.slice(0, 4));
    check(errs.length === 0, 'no JS/console errors');
    check(localErrs.length === 0, 'no bad resources');
    await context.close();
  }
  await browser.close();
  console.log('\n' + (failures === 0 ? 'LIVE ALL PASSED' : failures + ' LIVE FAILURES'));
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });