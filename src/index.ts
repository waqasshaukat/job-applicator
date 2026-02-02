#!/usr/bin/env node

import { Command } from 'commander';
import { createBotConfig, getSnaphuntCredentials } from './config.js';
import { logger } from './utils/logger.js';
import { launchBrowser, closeBrowser, getPage } from './services/browser.js';
import { scrapeMatchAndApply } from './services/job-scraper.js';
import { handleLoginIfRequired } from './services/applicator.js';

const program = new Command();

program
  .name('browser-bot')
  .description('AI-powered job application bot')
  .version('1.0.0')
  .option('-u, --url <url>', 'Job listing URL', 'https://snaphunt.com/job-listing')
  .option('-m, --max <number>', 'Maximum applications to submit')
  .option('--headless', 'Run browser in headless mode', false)
  .option('--dry-run', 'Analyze jobs without submitting applications', false)
  .action(runBot);

async function runBot(options: {
  url: string;
  max?: string;
  headless: boolean;
  dryRun: boolean;
}): Promise<void> {
  logger.banner();

  const config = createBotConfig({
    jobListingUrl: options.url,
    maxApplications: options.max ? parseInt(options.max, 10) : undefined,
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
    // Step 1: Launch browser
    logger.divider('Step 1: Browser Setup');
    await launchBrowser(config);

    // Step 2: Navigate to job listing and handle login
    logger.divider('Step 2: Login & Navigation');
    const page = await getPage();

    // First navigate to the job listing page
    logger.action(`Navigating to ${config.jobListingUrl}`);
    await page.goto(config.jobListingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    logger.success('Page loaded');

    // Wait for page to fully render
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Handle login if needed (check for Sign in button on the page)
    const credentials = getSnaphuntCredentials();
    if (credentials.email && credentials.password) {
      const loggedIn = await handleLoginIfRequired(page, credentials.email, credentials.password);
      if (loggedIn) {
        // After login, navigate back to job listing page to get personalized jobs
        logger.action('Refreshing job listing after login...');
        await page.goto(config.jobListingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        // Wait longer for page to fully load with personalized content
        logger.debug('Waiting for page to fully load...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } else {
      console.error('Missing Snaphunt credentials.');
      process.exit(1);
    }

    // Step 3: Integrated scrape → match → apply flow
    logger.divider('Step 3: Finding & Applying to Jobs');
    const { results, stats: jobStats } = await scrapeMatchAndApply(
      page,
      config.jobNiches,
      config.maxApplications,
      options.dryRun
    );

    // Update stats
    stats.totalJobs = jobStats.totalJobs;
    stats.filteredJobs = jobStats.filteredJobs;
    stats.matchedJobs = jobStats.matchedJobs;
    stats.applied = results.filter((r) => r.status === 'success').length;
    stats.failed = results.filter((r) => r.status === 'failed').length;

    // Done
    await closeBrowser();
    logger.summary(stats);
    logger.success('Bot completed successfully!');

  } catch (error) {
    logger.error(`Bot encountered an error: ${error}`);

    try {
      await closeBrowser();
    } catch {
      // Browser may already be closed
    }

    logger.summary(stats);
    process.exit(1);
  }
}

// Run the program
program.parse();
