const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  timeout: 240000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'https://localhost',
    ignoreHTTPSErrors: true,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'parcours',
      testMatch: /parcours-complet\.spec\.js/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'deployment',
      testMatch: /deployment\.spec\.js/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'pwa',
      testMatch: /pwa\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ['--ignore-certificate-errors'] },
      },
    },
    {
      name: 'fournisseur',
      testMatch: /fournisseur\.spec\.js/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'certifie',
      testMatch: /certifie\.spec\.js/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'responsive-desktop',
      testMatch: /responsive\.spec\.js/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'responsive-laptop',
      testMatch: /responsive\.spec\.js/,
      use: { viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'responsive-tablet',
      testMatch: /responsive\.spec\.js/,
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'responsive-android',
      testMatch: /responsive\.spec\.js/,
      use: {
        browserName: 'chromium',
        viewport: { width: 393, height: 851 },
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.75,
        channel: 'chrome',
      },
    },
    {
      name: 'responsive-iphone',
      testMatch: /responsive\.spec\.js/,
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 667 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
        channel: 'chrome',
      },
    },
  ],
});