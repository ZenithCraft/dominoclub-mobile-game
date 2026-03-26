import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const BASE  = 'http://localhost:19006';
const OUT   = './screenshots';
const SIZE  = { width: 900, height: 560 }; // landscape mobile tablet viewport

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx     = await browser.newContext({ viewport: SIZE });
const page    = await ctx.newPage();

// Silence console noise
page.on('console', () => {});
page.on('pageerror', () => {});

async function shot(name, delay = 1800) {
  await page.waitForTimeout(delay);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}.png`);
}

// ── 1. SplashScreen (Loading.png) ─────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle' });
await shot('01-splash', 2000);

// ── 2. LoginScreen (log in.png) ───────────────────────────────────────────
// Splash auto-navigates to Login after ~2s (no stored user)
await shot('02-login', 3000);

// ── 3. ForgotPassword ────────────────────────────────────────────────────
// Click "Esqueceu a senha?" link
try {
  await page.getByText('Esqueceu a senha?').click();
  await shot('03-forgot-password', 1200);
  await page.goBack();
} catch {
  console.log('  (ForgotPassword link not clickable — skipping interaction)');
  await shot('03-forgot-password', 500);
}

// ── 4. RegisterScreen (Sign up.png) ──────────────────────────────────────
try {
  // From Login, click "Criar uma conta"
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500); // wait for splash → login
  await page.getByText('Criar uma conta').first().click();
  await shot('04-register', 1500);
} catch {
  await shot('04-register', 500);
}

// ── 5. SetNewPasswordScreen ───────────────────────────────────────────────
// Can't reach without email flow — inject navigation via localStorage override
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await shot('05-set-new-password-note', 200); // same as login; no deep-link in web

// ── 6. OTPVerification ───────────────────────────────────────────────────
// Enter a phone on the Login screen to reach OTP
try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500); // splash → login
  const phoneInput = page.locator('input[inputmode="tel"], input[type="tel"]').first();
  if (await phoneInput.isVisible()) {
    await phoneInput.fill('(11) 99999-9999');
    await shot('06-login-filled', 800);
  }
} catch {
  await shot('06-login-filled', 300);
}

// ── 7. HomeScreen (Game Mode.png) — needs auth; mock via AsyncStorage ─────
// Inject a fake auth token so the app thinks we're logged in
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('@dominoclub:auth', JSON.stringify({
    state: {
      user: {
        id: 'mock-user-1',
        name: 'Md Maya',
        phone: '+5511999990000',
        wallet: { real_balance: 1234, bonus_balance: 0, rollover_remaining: 0 },
      },
      accessToken: 'mock-token',
      refreshToken: 'mock-refresh',
    },
    version: 0,
  }));
});
await page.goto(BASE, { waitUntil: 'networkidle' });
await shot('07-home-game-mode', 3500);

// ── 8. ModeSelect — Livre ────────────────────────────────────────────────
try {
  await page.getByText('Livre').first().click();
  await shot('08-mode-select-livre', 1500);
  await page.goBack();
} catch {
  await shot('08-mode-select-livre', 500);
}

// ── 9. ModeSelect — Torneio ──────────────────────────────────────────────
try {
  await page.getByText('Torneio').first().click();
  await shot('09-mode-select-torneio', 1500);
  await page.goBack();
} catch {
  await shot('09-mode-select-torneio', 500);
}

// ── 10. WalletScreen ────────────────────────────────────────────────────
try {
  // Tap the balance pill (R$ 1.234 )
  await page.getByText(/R\$/).first().click();
  await shot('10-wallet', 1500);
} catch {
  await shot('10-wallet', 500);
}

// ── 11. Deposit modal ────────────────────────────────────────────────────
try {
  await page.getByText('+ Depositar').click();
  await shot('11-deposit-modal', 1000);
  await page.keyboard.press('Escape');
} catch {
  await shot('11-deposit-modal', 400);
}

// ── 12. Withdraw modal ───────────────────────────────────────────────────
try {
  await page.getByText('Sacar').click();
  await shot('12-withdraw-modal', 1000);
  await page.keyboard.press('Escape');
} catch {
  await shot('12-withdraw-modal', 400);
}

await browser.close();
console.log('\nAll screenshots saved to ./screenshots/');
