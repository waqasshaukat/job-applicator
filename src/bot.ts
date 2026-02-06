import { createBotConfig } from './config.js';
import { logger } from './utils/logger.js';
import { launchBrowser, closeBrowser, getPage } from './services/browser.js';
import { scrapeMatchAndApply } from './services/job-scraper.js';
import { handleLoginIfRequired, signOutSnaphunt } from './services/applicator.js';
import { humanClick } from './utils/human.js';

export type RunBotOptions = {
  jobListingUrl: string;
  maxApplications?: number;
  headless: boolean;
  dryRun: boolean;
  snaphuntEmail: string;
  snaphuntPassword: string;
  signal?: AbortSignal;
};

export async function runBot(options: RunBotOptions): Promise<{
  resultsCount: number;
  stats: {
    totalJobs: number;
    filteredJobs: number;
    matchedJobs: number;
    applied: number;
    failed: number;
  };
}> {
  let abortRequested = false;
  if (!options.snaphuntEmail || !options.snaphuntPassword) {
    throw new Error('Missing Snaphunt credentials.');
  }

  const abortHandler = async () => {
    abortRequested = true;
    logger.warn('Termination requested. Aborting run...');
  };

  if (options.signal) {
    if (options.signal.aborted) {
      await abortHandler();
      throw new Error('Job terminated by user');
    }
    options.signal.addEventListener('abort', abortHandler, { once: true });
  }

  logger.banner();

  const config = createBotConfig({
    jobListingUrl: options.jobListingUrl,
    maxApplications: options.maxApplications,
    headless: options.headless,
  });

  logger.info(`Job URL: ${config.jobListingUrl}`);
  logger.info(`Max applications: ${config.maxApplications ?? 'all available'}`);
  logger.info(`Niches: ${config.jobNiches.slice(0, 5).join(', ')}...`);
  if (options.dryRun) {
    logger.warn('DRY RUN MODE - No applications will be submitted');
  }

  const stats = {
    totalJobs: 0,
    filteredJobs: 0,
    matchedJobs: 0,
    applied: 0,
    failed: 0,
  };

  try {
    if (options.signal?.aborted) {
      throw new Error('Job terminated by user');
    }

    logger.divider('Step 1: Browser Setup');
    await launchBrowser(config);

    logger.divider('Step 2: Login & Navigation');
    const page = await getPage();

    logger.action('Navigating to https://snaphunt.com/');
    await page.goto('https://snaphunt.com/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => undefined);
    logger.success('Home page loaded');

    await new Promise(resolve => setTimeout(resolve, 2000));
    if (options.signal?.aborted || abortRequested) {
      throw new Error('Job terminated by user');
    }

    const signInButton = page.locator('button:has-text("Sign in")').first();
    const signInVisible = await signInButton.isVisible({ timeout: 8000 }).catch(() => false);
    if (signInVisible) {
      logger.action('Sign in button detected, logging in...');
      await handleLoginIfRequired(page, options.snaphuntEmail, options.snaphuntPassword);
    } else {
      const signInCount = await page.locator('button:has-text("Sign in")').count().catch(() => 0);
      logger.debug(`Sign in button count (all): ${signInCount}`);
      if (signInCount > 0) {
        const sampleHtml = await page
          .locator('button:has-text("Sign in")')
          .first()
          .evaluate((el) => el.outerHTML)
          .catch(() => '');
        logger.debug(`Sign in button HTML: ${sampleHtml}`);
      }
      logger.success('Sign in button not visible, assuming already logged in');
    }

    logger.action('Waiting for candidate dashboard...');
    await page.waitForURL('**/candidateDashboard**', { timeout: 60000 }).catch(() => undefined);
    await page.waitForSelector('div.side-navigator-label:has-text("Jobs")', { timeout: 15000 });
    await humanClick(page, page.locator('div.side-navigator-label:has-text("Jobs")').first());

    logger.action('Navigating to job listing...');
    await page.waitForURL('**/job-listing**', { timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (options.signal?.aborted || abortRequested) {
      throw new Error('Job terminated by user');
    }

    logger.divider('Step 3: Finding & Applying to Jobs');
    const { results, stats: jobStats } = await scrapeMatchAndApply(
      page,
      config.jobNiches,
      config.maxApplications,
      options.dryRun,
      options.signal
    );

    stats.totalJobs = jobStats.totalJobs;
    stats.filteredJobs = jobStats.filteredJobs;
    stats.matchedJobs = jobStats.matchedJobs;
    stats.applied = results.filter((r) => r.status === 'success').length;
    stats.failed = results.filter((r) => r.status === 'failed').length;

    await signOutSnaphunt(page);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await closeBrowser();
    logger.summary(stats);
    logger.success('Bot completed successfully!');

    return { resultsCount: results.length, stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTermination =
      options.signal?.aborted ||
      abortRequested ||
      (error instanceof Error && error.name === 'JobTerminationError') ||
      message.toLowerCase().includes('terminated');
    if (isTermination) {
      logger.warn('Job terminated by user.');
    } else {
      logger.error(`Bot encountered an error: ${message}`);
    }

    try {
      await closeBrowser();
    } catch {
      // Ignore cleanup errors
    }

    logger.summary(stats);

    if (options.signal) {
      options.signal.removeEventListener('abort', abortHandler);
    }

    if (isTermination) {
      return { resultsCount: 0, stats };
    }

    throw error;
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', abortHandler);
    }
  }
}
