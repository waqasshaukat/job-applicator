#!/usr/bin/env node

import { Command } from 'commander';
import { getSnaphuntCredentials } from './config.js';
import { runBot } from './bot.js';

const program = new Command();

program
  .name('browser-bot')
  .description('AI-powered job application bot')
  .version('1.0.0')
  .option('-u, --url <url>', 'Job listing URL', 'https://snaphunt.com/job-listing')
  .option('-m, --max <number>', 'Maximum applications to submit')
  .option('--no-headless', 'Run browser in non-headless mode')
  .option('--dry-run', 'Analyze jobs without submitting applications', false)
  .action(runCli);

async function runCli(options: {
  url: string;
  max?: string;
  headless: boolean;
  dryRun: boolean;
}): Promise<void> {
  const credentials = getSnaphuntCredentials();
  if (!credentials.email || !credentials.password) {
    console.error('Missing Snaphunt credentials.');
    process.exit(1);
  }

  await runBot({
    jobListingUrl: options.url,
    maxApplications: options.max ? parseInt(options.max, 10) : undefined,
    headless: options.headless,
    dryRun: options.dryRun,
    snaphuntEmail: credentials.email,
    snaphuntPassword: credentials.password,
  });
}

// Run the program
program.parse();
