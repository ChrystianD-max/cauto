const { startServer } = require('./serve');
const { chromium } = require('playwright');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8770;
const BASE = `http://127.0.0.1:${PORT}`;

const VIEWPORTS = [
  { name: 'm320', width: 320, height: 640, mobile: true },
  { name: 'm360', width: 360, height: 740, mobile: true },
  { name: 'm375', width: 375, height: 667, mobile: true },
  { name: 'm390', width: 390, height: 844, mobile: true },
  { name: 'm412', width: 412, height: 915, mobile: true },
  { name: 't768', width: 768, height: 1024, mobile: false },
  { name: 'd1440', width: 1440, height: 900, mobile: false },
];

const SUBPAGES = ['comment-ca-marche.html', 'professionnels.html', 'pieces.html', 'entreprises.html', 'aide.html', 'contact.html', 'conditions.html', 'confidentialite.html'];
// Pages whose own nav has no matching entry ; active link may legitimately be absent.
const NO_ACTIVE = ['entreprises.html', 'contact.html', 'conditions.html', 'confidentialite.html'];

let failures = 0;
function check(ok, label, extra) {
  if (!ok) failures++;
  console.log(`${ok ? '  OK ' : ' FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
}

(async () => {
  const server = await startServer(PORT);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--ignore-certificate-errors'] });

  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
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
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    const localErrs = [];
    page.on('response', (r) => {
      const u = r.url();
      if (!u.startsWith('http://127.0.0.1') && !u.startsWith('https://127.0.0.1')) return;
      if (r.status() >= 400) localErrs.push(`${r.status()} ${u}`);
    });

    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2600);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, 'no horizontal overflow', `delta=${overflow}px`);

    check(await page.locator('.mock-phone').isVisible(), 'phone mockup visible');
    check((await page.locator('.ring .val b').textContent()).trim() === '82', 'C-Score 82 displayed');
    check(await page.locator('h1').textContent().then(t => t.includes('Comprenez votre voiture')), 'hero H1 present');
    check(await page.locator('.nav-logo').count() === 2, 'nav + footer logo present');
    check(await page.locator('.mk-tab').count() === 4, '4 product tabs');

    const dash = await page.evaluate(() => {
      const bar = document.querySelector('.ring .bar');
      if (!bar) return null;
      const s = getComputedStyle(bar);
      return s.strokeDashoffset;
    });
    check(dash !== null && Math.abs(parseFloat(dash) - 61.1) < 1, 'C-Score ring animated to 82%', `dashoffset=${dash}`);

    // tabs switching
    for (const t of ['pro', 'fleet', 'pieces', 'client']) {
      await page.click(`#tab-${t}`);
      await page.waitForTimeout(120);
      const shown = await page.locator(`#pane-${t}`).getAttribute('aria-hidden').then(v => v === 'false');
      check(shown, `tab "${t}" pane shown`);
    }

    // mobile menu behavior
    const menuBtnVisible = await page.locator('#navToggle').isVisible();
    check(menuBtnVisible === (vp.width <= 900), 'burger visibility matches breakpoint', `mobile=${menuBtnVisible}`);
    if (menuBtnVisible) {
      await page.click('#navToggle');
      await page.waitForTimeout(120);
      const open = await page.locator('#navMenu').evaluate(el => el.classList.contains('open'));
      check(open, 'burger opens menu');
      const expanded = await page.locator('#navToggle').getAttribute('aria-expanded');
      check(expanded === 'true', 'aria-expanded true');
      await page.click('#navMenu a[href="#produit"]');
      await page.waitForTimeout(150);
      const closed = await page.locator('#navMenu').evaluate(el => !el.classList.contains('open'));
      check(closed, 'menu closes on anchor click');
    }

    // scroll reveal: step through the page so all .anim elements get observed
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    const step = 250;
    for (let y = 0; y <= totalHeight + step; y += step) {
      await page.evaluate(y => window.scrollTo(0, y), y);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(200);
    const inCount = await page.locator('.anim.in').count();
    const totalAnim = await page.locator('.anim').count();
    check(inCount >= totalAnim - 3, 'scroll reveal triggered', `${inCount}/${totalAnim}`);
    check(await page.locator('.final-panel').isVisible(), 'final CTA visible');

    if (errs.length) console.log('  ERRORS:', errs.slice(0, 5));
    if (localErrs.length) console.log('  LOCAL 4xx:', localErrs.slice(0, 5));
    check(errs.length === 0, 'no JS/console errors');
    check(localErrs.length === 0, 'no local resource 4xx');

    await context.close();
  }

  // Subpages on mobile + desktop
  for (const width of [390, 1440]) {
    console.log(`\n=== subpages @ ${width}px ===`);
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
    });
    for (const sp of SUBPAGES) {
      const page = await context.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(BASE + '/' + sp, { waitUntil: 'load', timeout: 30000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const hasNav = await page.locator('.nav-logo').count();
      const hasFooter = await page.locator('.footer-grid').count();
      const active = await page.locator('.nav-links a.active').count();
      const activeOk = NO_ACTIVE.includes(sp) ? true : active >= 1;
      check(overflow <= 1 && hasNav >= 1 && hasFooter >= 1 && activeOk && errs.length === 0, sp, `overflow=${overflow}px active=${active}`);
      await page.close();
    }
    await context.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FAILURES'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });