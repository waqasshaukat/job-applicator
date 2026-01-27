import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BotConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { randomBetween } from '../utils/human.js';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export async function launchBrowser(config: BotConfig): Promise<Page> {
  logger.action('Launching browser...');

  // Randomize viewport slightly for fingerprint variation
  const viewportWidth = randomBetween(1280, 1400);
  const viewportHeight = randomBetween(800, 900);

  browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      `--window-size=${viewportWidth},${viewportHeight}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Remove webdriver flag to avoid detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  page = await context.newPage();

  logger.success(`Browser launched (${viewportWidth}x${viewportHeight})`);

  return page;
}

export async function getPage(): Promise<Page> {
  if (!page) {
    throw new Error('Browser not initialized. Call launchBrowser first.');
  }
  return page;
}

export async function getContext(): Promise<BrowserContext> {
  if (!context) {
    throw new Error('Browser not initialized. Call launchBrowser first.');
  }
  return context;
}

export async function navigateTo(url: string, retries = 2): Promise<void> {
  if (!page) {
    throw new Error('Browser not initialized');
  }

  logger.action(`Navigating to ${url}`);

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      logger.success('Page loaded');
      return;
    } catch (error) {
      if (attempt <= retries) {
        logger.warn(`Navigation attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    }
  }
}

export async function closeBrowser(): Promise<void> {
  logger.action('Closing browser...');

  if (page) {
    await page.close();
    page = null;
  }

  if (context) {
    await context.close();
    context = null;
  }

  if (browser) {
    await browser.close();
    browser = null;
  }

  logger.success('Browser closed');
}

export async function takeScreenshot(name: string): Promise<void> {
  if (!page) return;

  const filename = `screenshots/${name}-${Date.now()}.png`;
  await page.screenshot({ path: filename, fullPage: false });
  logger.debug(`Screenshot saved: ${filename}`);
}

export async function waitForSelector(
  selector: string,
  timeout = 10000
): Promise<void> {
  if (!page) {
    throw new Error('Browser not initialized');
  }

  await page.waitForSelector(selector, { timeout });
}

export async function isLoggedIn(): Promise<boolean> {
  if (!page) return false;

  // Check for common logged-in indicators on Snaphunt
  const logoutButton = await page.$('[data-testid="logout"]');
  const profileMenu = await page.$('.user-menu, .profile-dropdown, [aria-label="User menu"]');
  const dashboardLink = await page.$('a[href*="dashboard"], a[href*="profile"]');

  return !!(logoutButton || profileMenu || dashboardLink);
}
