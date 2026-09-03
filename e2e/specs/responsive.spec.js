const { test, expect } = require('@playwright/test');
const { PASS, uniqueEmail, registerUi } = require('./helpers');

const state = {};

async function expectNoOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, `dépassement horizontal détecté sur ${page.url()}`).toBe(false);
}

test.describe('Responsive', () => {
  test('page de connexion : pas de débordement, formulaire visible', async ({ page }) => {
    await page.goto('/app/#/login', { waitUntil: 'commit' });
    await expect(page.locator('#f-login')).toBeVisible();
    await expectNoOverflow(page);
    await expect(page.locator('.auth-card')).toBeVisible();
  });

  test('inscription auto-login puis pages authentifiées sans débordement', async ({ page }) => {
    state.email = uniqueEmail('resp');

    await page.goto('/app/#/register', { waitUntil: 'commit' });
    await expect(page.locator('#f-reg')).toBeVisible();
    await expectNoOverflow(page);

    await registerUi(page, { name: 'Client E2E Resp', email: state.email, phone: '+22997000003', role: 'CLIENT' });

    await expect(page).toHaveURL(/#\/app$/);
    await expect(page.locator('#demo-banner')).toHaveCount(0);
    await expectNoOverflow(page);

    await page.evaluate(() => { location.hash = '#/vehicles'; });
    await expect(page).toHaveURL(/#\/vehicles$/);
    await expectNoOverflow(page);

    await page.goto('/app/#/vehicles/new', { waitUntil: 'commit' });
    await expect(page.locator('#f-new-veh')).toBeVisible();
    await expectNoOverflow(page);
  });
});