/**
 * pcpt-sanitize-tool-web-ui Chrome 即時驗證腳本
 * 使用 Playwright 執行 Admin 登入 + 頁面驗證 + 截圖
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://localhost:7135';
const SCREENSHOT_DIR = path.resolve(
  __dirname,
  '../docs/implementation-artifacts/reviews/epic-eft'
);

(async () => {
  console.log('[Step 1] 啟動 Playwright Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors']
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // Step 2: Navigate to admin login
    console.log('[Step 2] 導航至 Admin 登入頁...');
    await page.goto(`${BASE_URL}/mgmt/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const loginUrl = page.url();
    console.log('  當前 URL:', loginUrl);

    // Step 3: Take snapshot of form elements
    console.log('[Step 3] 截取登入表單快照...');
    const loginContent = await page.content();
    const hasEmailField = loginContent.includes('email') || loginContent.includes('Email');
    const hasPasswordField = loginContent.includes('password') || loginContent.includes('Password');
    console.log('  包含 email 欄位:', hasEmailField);
    console.log('  包含 password 欄位:', hasPasswordField);
    const pageTitle = await page.title();
    console.log('  頁面標題:', pageTitle);

    // Step 4: Login with Admin credentials
    console.log('[Step 4] 執行 Admin 登入...');

    // Try to fill email field
    const emailSelectors = ['input[type="email"]', 'input[name="email"]', 'input[name="Email"]', '#email', '#Email'];
    let emailFilled = false;
    for (const sel of emailSelectors) {
      try {
        await page.fill(sel, 'owner@example.local', { timeout: 3000 });
        console.log('  Email 填入成功 (selector:', sel, ')');
        emailFilled = true;
        break;
      } catch (e) {}
    }

    const passwordSelectors = ['input[type="password"]', 'input[name="password"]', 'input[name="Password"]', '#password', '#Password'];
    let passwordFilled = false;
    for (const sel of passwordSelectors) {
      try {
        await page.fill(sel, 'ExamplePw123', { timeout: 3000 });
        console.log('  Password 填入成功 (selector:', sel, ')');
        passwordFilled = true;
        break;
      } catch (e) {}
    }

    if (!emailFilled || !passwordFilled) {
      // Try to get all inputs
      const inputs = await page.$$eval('input', els => els.map(e => ({ type: e.type, name: e.name, id: e.id, placeholder: e.placeholder })));
      console.log('  頁面所有 input:', JSON.stringify(inputs));
    }

    // Click submit button
    const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("登入")', 'button:has-text("Login")', '.btn-primary'];
    let clicked = false;
    for (const sel of submitSelectors) {
      try {
        await page.click(sel, { timeout: 3000 });
        console.log('  Submit 按鈕點擊成功 (selector:', sel, ')');
        clicked = true;
        break;
      } catch (e) {}
    }

    // Step 5: Wait for redirect and confirm dashboard
    console.log('[Step 5] 等待重定向到 Dashboard...');
    await page.waitForTimeout(3000);
    const afterLoginUrl = page.url();
    const afterLoginTitle = await page.title();
    console.log('  登入後 URL:', afterLoginUrl);
    console.log('  登入後標題:', afterLoginTitle);

    const isDashboard = afterLoginUrl.includes('/mgmt/dashboard') || afterLoginUrl.includes('/mgmt/');
    console.log('  已到達 Dashboard:', isDashboard);

    // Step 6: Navigate to sanitize tool page
    console.log('[Step 6] 導航至 Sanitize Tool 頁面...');
    await page.goto(`${BASE_URL}/mgmt/tools/sanitize-legacy-base64`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    const sanitizeUrl = page.url();
    console.log('  Sanitize URL:', sanitizeUrl);

    // Step 7: Take snapshot to confirm page loaded
    console.log('[Step 7] 確認頁面載入...');
    const sanitizeContent = await page.content();
    const sanitizeTitle = await page.title();
    console.log('  頁面標題:', sanitizeTitle);

    const hasAdmSanitize = sanitizeContent.includes('adm-sanitize');
    const hasToolTitle = sanitizeContent.includes('sanitize') || sanitizeContent.includes('Sanitize') || sanitizeContent.includes('消毒') || sanitizeContent.includes('清理');
    const hasBase64 = sanitizeContent.includes('base64') || sanitizeContent.includes('Base64');
    const hasScanButton = sanitizeContent.includes('scan') || sanitizeContent.includes('Scan') || sanitizeContent.includes('掃描');
    console.log('  有 .adm-sanitize class:', hasAdmSanitize);
    console.log('  有 Sanitize 標題:', hasToolTitle);
    console.log('  有 Base64 相關內容:', hasBase64);
    console.log('  有掃描按鈕:', hasScanButton);

    // Check HTTP status by looking at content
    const isLoginPage = sanitizeContent.includes('PhyCool_Admin_Auth') || afterLoginUrl.includes('/mgmt/login');
    const is404 = sanitizeContent.includes('404') && !hasToolTitle;
    const is403 = sanitizeContent.includes('403') || sanitizeContent.includes('Access Denied');
    console.log('  頁面狀態 - 404:', is404, '| 403:', is403, '| 重定向到登入:', afterLoginUrl.includes('/mgmt/login'));

    // Step 8: Take screenshot of sanitize tool
    console.log('[Step 8] 截圖 Sanitize Tool 頁面...');
    const sanitizeScreenshotPath = path.join(SCREENSHOT_DIR, 'pcpt-sanitize-tool-web-ui-scan-verification.png');
    await page.screenshot({ path: sanitizeScreenshotPath, fullPage: false });
    console.log('  截圖已儲存至:', sanitizeScreenshotPath);
    const screenshotExists = fs.existsSync(sanitizeScreenshotPath);
    console.log('  截圖檔案存在:', screenshotExists);

    // Step 9: Navigate to dashboard
    console.log('[Step 9] 導航至 Dashboard...');
    await page.goto(`${BASE_URL}/mgmt/dashboard`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    const dashUrl = page.url();
    console.log('  Dashboard URL:', dashUrl);

    // Step 10: Take screenshot of dashboard
    console.log('[Step 10] 截圖 Dashboard...');
    const dashScreenshotPath = path.join(SCREENSHOT_DIR, 'pcpt-sanitize-tool-web-ui-dashboard-kpi-verification.png');
    await page.screenshot({ path: dashScreenshotPath, fullPage: false });
    console.log('  截圖已儲存至:', dashScreenshotPath);

    // Step 11: Evaluate page info
    console.log('[Step 11] 取得頁面資訊...');
    const pageInfo = await page.evaluate(() => ({
      url: location.href,
      title: document.title
    }));
    console.log('  頁面資訊:', JSON.stringify(pageInfo));

    if (consoleErrors.length > 0) {
      console.log('  Console 錯誤 (', consoleErrors.length, '):', consoleErrors.slice(0, 5));
    } else {
      console.log('  Console 錯誤: 0 個');
    }

    // Extra: Check sanitize page HTML structure
    console.log('\n[Extra] Sanitize 頁面 HTML 結構分析...');
    await page.goto(`${BASE_URL}/mgmt/tools/sanitize-legacy-base64`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('  最終 URL:', finalUrl);
    console.log('  頁面文字 (前500字):', bodyText);

    // Check for key elements
    const elements = await page.evaluate(() => {
      const result = {};
      result.h1 = document.querySelector('h1')?.textContent?.trim() || null;
      result.h2 = document.querySelector('h2')?.textContent?.trim() || null;
      result.admSanitize = !!document.querySelector('.adm-sanitize');
      result.scanBtn = document.querySelector('.btn-scan, [data-action="scan"], #scanBtn')?.textContent?.trim() || null;
      result.formCount = document.querySelectorAll('form').length;
      result.btnCount = document.querySelectorAll('button').length;
      result.inputCount = document.querySelectorAll('input, select').length;
      return result;
    });
    console.log('  頁面元素:', JSON.stringify(elements, null, 2));

    console.log('\n=== 驗證完成 ===');

  } catch (err) {
    console.error('[錯誤]', err.message);
    // Take error screenshot
    try {
      const errScreenshot = path.join(SCREENSHOT_DIR, 'pcpt-sanitize-tool-web-ui-error.png');
      await page.screenshot({ path: errScreenshot });
      console.log('  錯誤截圖:', errScreenshot);
    } catch (_) {}
  } finally {
    await browser.close();
    console.log('[完成] Browser 已關閉');
  }
})();
