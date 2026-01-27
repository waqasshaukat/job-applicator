import { Page } from 'playwright';
import { JobListing, ResumeData, ApplicationResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  humanDelay,
  humanScroll,
  humanClick,
  humanReadingPause,
  humanIdleMovements,
  humanScrollToElement,
  humanBreakBetweenApplications,
} from '../utils/human.js';
import { getPage, getContext, navigateTo } from './browser.js';
import { analyzeJobFitSingle } from './job-matcher.js';
import { applyOnCurrentPage } from './applicator.js';

/**
 * NEW INTEGRATED FLOW: Scrape → Match → Apply per job
 * For each job: click card → extract details → AI match → apply if good → back to listing
 */
export async function scrapeMatchAndApply(
  page: Page,
  resume: ResumeData,
  niches: string[],
  matchThreshold: number,
  maxApplications: number,
  dryRun: boolean = false
): Promise<{
  results: ApplicationResult[];
  stats: { totalJobs: number; filteredJobs: number; matchedJobs: number };
}> {
  logger.divider('Scrape → Match → Apply Flow');

  const listingUrl = page.url();
  const results: ApplicationResult[] = [];
  const seenJobIds = new Set<string>();
  let totalJobs = 0;
  let filteredJobs = 0;
  let matchedJobs = 0;
  let appliedCount = 0;

  // Wait for job cards to appear - try multiple selectors
  await humanDelay(2000, 3500);

  const jobCardSelectors = [
    'a.ui.fluid.card',
    '.ui.fluid.card',
    'a[class*="card"]',
    'div[class*="JobCard"]',
    '[data-testid="job-card"]',
  ];

  let foundSelector: string | null = null;
  for (const selector of jobCardSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      foundSelector = selector;
      logger.debug(`Found job cards with selector: ${selector}`);
      break;
    } catch {
      logger.debug(`Selector not found: ${selector}`);
      continue;
    }
  }

  if (!foundSelector) {
    // Take a screenshot or log page content for debugging
    logger.warn('Job cards not found on page');
    const pageTitle = await page.title();
    const pageUrl = page.url();
    logger.debug(`Page title: ${pageTitle}`);
    logger.debug(`Page URL: ${pageUrl}`);

    // Try scrolling and waiting more
    logger.action('Trying to scroll and wait for content...');
    await humanScroll(page, 'down', 300);
    await humanDelay(3000, 4000);

    // One more try
    try {
      await page.waitForSelector('a.ui.fluid.card', { timeout: 10000 });
      foundSelector = 'a.ui.fluid.card';
    } catch {
      logger.error('Still no job cards found after scrolling');
      return { results, stats: { totalJobs, filteredJobs, matchedJobs } };
    }
  }

  let noNewJobsCount = 0;
  const maxNoNewJobsAttempts = 5;

  // Main loop: scroll, find jobs, process each one
  while (appliedCount < maxApplications && noNewJobsCount < maxNoNewJobsAttempts) {
    // Make sure we're on the listing page
    if (!page.url().includes('/job-listing')) {
      await navigateTo(listingUrl);
      await humanDelay(1500, 2500);

      // Scroll down by 100vh and wait for new listings
      await scrollAndWaitForNewListings(page);
    }

    // Extract job cards we haven't seen yet
    const newJobs = await extractNewJobCards(page, seenJobIds);
    totalJobs += newJobs.length;

    if (newJobs.length === 0) {
      noNewJobsCount++;
      logger.debug(`No new jobs found (attempt ${noNewJobsCount}/${maxNoNewJobsAttempts})`);

      // Scroll down by 100vh and wait for new listings
      await scrollAndWaitForNewListings(page);
      continue;
    }

    noNewJobsCount = 0;

    // Filter by niche
    const nicheJobs = newJobs.filter((job) => {
      const titleLower = job.title.toLowerCase();
      return niches.some((niche) => titleLower.includes(niche.toLowerCase()));
    });
    filteredJobs += nicheJobs.length;

    logger.info(`Found ${newJobs.length} new jobs, ${nicheJobs.length} match niches`);

    // Process each niche-matched job
    logger.info(`Processing ${nicheJobs.length} niche-matched jobs...`);

    for (const job of nicheJobs) {
      if (appliedCount >= maxApplications) {
        logger.info(`Reached max applications (${maxApplications})`);
        break;
      }

      logger.job(`Processing: ${job.title}`);
      logger.debug(`Job ID: ${job.id}, Company: ${job.company}`);

      let detailPage: Page | null = null;

      try {
        // Step 1: Click the job card - opens in new tab
        logger.debug('Step 1: Clicking job card to open detail page...');
        detailPage = await clickJobCardAndNavigate(page, job.title);
        if (!detailPage) {
          logger.warn(`SKIPPING: Could not click job card: ${job.title}`);
          continue;
        }
        logger.debug('Step 1 DONE: Detail page opened');

        // Step 2: Extract job details from the new tab
        logger.debug('Step 2: Extracting job details...');
        const description = await extractJobDescription(detailPage);
        const requirements = await extractJobRequirements(detailPage);
        const metadata = await extractJobMetadata(detailPage);

        const detailedJob: JobListing = {
          ...job,
          url: detailPage.url(),
          description: description.trim(),
          requirements,
          jobType: metadata.jobType || job.jobType,
          salary: metadata.salary || job.salary,
          location: metadata.location || job.location,
        };

        logger.debug(`Step 2 DONE: Description length: ${description.length} chars`);

        // Step 3: Send to AI for matching
        logger.action('Step 3: Sending to AI for job fit analysis...');
        const match = await analyzeJobFitSingle(detailedJob, resume);
        logger.debug('Step 3 DONE: AI analysis complete');

        logger.match(job.title, job.company, match.score);
        logger.info(`  ${match.reasoning}`);

        // Step 4: If match is good, apply immediately (on the detail page tab)
        if (match.score >= matchThreshold) {
          matchedJobs++;

          if (!dryRun) {
            logger.action(`Applying to ${job.title}...`);
            const result = await applyOnCurrentPage(detailPage, detailedJob);
            results.push(result);

            if (result.status === 'success') {
              appliedCount++;
              logger.application(job.title, 'success');
            } else {
              logger.application(job.title, result.status);
              logger.warn(`  ${result.message}`);
            }

            // Take a break between applications
            if (appliedCount < maxApplications) {
              await humanBreakBetweenApplications();
            }
          } else {
            logger.info(`  [DRY RUN] Would apply to this job`);
            results.push({
              jobId: job.id,
              jobTitle: job.title,
              company: job.company,
              status: 'skipped',
              message: 'Dry run - not submitted',
              timestamp: new Date(),
            });
          }
        } else {
          logger.debug(`Score ${match.score}% below threshold ${matchThreshold}%`);
        }

        // Step 5: Close the detail tab and scroll on listing page
        await detailPage.close();
        logger.debug('Closed detail tab');
        await scrollAndWaitForNewListings(page);

        // Human-like pause between jobs
        await humanDelay(1000, 2000);

      } catch (error) {
        logger.warn(`Error processing ${job.title}: ${error}`);
        // Close detail tab if open
        if (detailPage) {
          try {
            await detailPage.close();
          } catch {
            // Ignore
          }
        }
        // Scroll on listing page
        try {
          await scrollAndWaitForNewListings(page);
        } catch {
          // Ignore
        }
      }
    }
  }

  return {
    results,
    stats: { totalJobs, filteredJobs, matchedJobs },
  };
}

/**
 * Click a job card by title - opens in new tab
 * Returns the new tab's Page object or null if failed
 */
async function clickJobCardAndNavigate(page: Page, title: string): Promise<Page | null> {
  logger.action(`Opening job detail: ${title}`);

  try {
    const context = await getContext();
    const jobCards = await page.$$('a.ui.fluid.card');
    logger.debug(`Found ${jobCards.length} job cards on listing page`);
    logger.debug(`Looking for title: "${title}"`);

    for (const card of jobCards) {
      const titleElement = await card.$('h3.ui.header, h3[class*="header"]');
      const cardTitle = titleElement ? await titleElement.textContent() : '';
      const cardTitleTrimmed = cardTitle?.trim() || '';

      // Log each card title for debugging
      logger.debug(`  Card title: "${cardTitleTrimmed}"`);

      // Use includes() for more flexible matching in case of whitespace issues
      if (cardTitleTrimmed && (cardTitleTrimmed === title || cardTitleTrimmed.includes(title) || title.includes(cardTitleTrimmed))) {
        logger.debug(`Found matching card for: ${title}`);

        // Scroll to card
        await humanScrollToElement(page, page.locator(`a.ui.fluid.card:has-text("${title.substring(0, 30)}")`).first());
        await humanDelay(300, 600);

        logger.debug('Clicking job card and waiting for new tab...');

        // Click and wait for new tab to open
        const [newPage] = await Promise.all([
          context.waitForEvent('page', { timeout: 15000 }),
          card.click()
        ]);

        logger.debug(`New tab opened: ${newPage.url()}`);

        // Wait for the new tab to fully load
        await newPage.waitForLoadState('domcontentloaded');
        logger.debug('DOM content loaded, waiting for page to fully render...');
        await humanDelay(8000, 10000);

        logger.debug(`Detail page ready: ${newPage.url()}`);
        return newPage;
      }
    }

    logger.warn(`No matching job card found for title: "${title}"`);
    logger.warn(`Available titles on page: ${jobCards.length} cards`);
    return null;
  } catch (error) {
    logger.error(`Error clicking card for "${title}": ${error}`);
    return null;
  }
}

/**
 * Scrape job listings from current page (already navigated)
 * Used when page is already loaded and login is handled
 */
export async function scrapeJobListingsFromCurrentPage(
  page: Page,
  targetFilteredJobs: number,
  niches?: string[]
): Promise<JobListing[]> {
  logger.divider('Scraping Job Listings');

  // Wait for page to load - human takes time to orient
  await humanDelay(2000, 3500);

  return scrapeJobsFromPage(page, targetFilteredJobs, niches);
}

/**
 * Scrape job listings with niche filtering
 * Keeps scrolling until enough niche-matched jobs are found
 */
export async function scrapeJobListings(
  url: string,
  targetFilteredJobs: number,
  niches?: string[]
): Promise<JobListing[]> {
  logger.divider('Scraping Job Listings');

  const page = await getPage();
  await navigateTo(url);

  // Wait for page to load - human takes time to orient
  await humanDelay(2000, 3500);

  return scrapeJobsFromPage(page, targetFilteredJobs, niches);
}

/**
 * Common scraping logic for job listings page
 */
async function scrapeJobsFromPage(
  page: Page,
  targetFilteredJobs: number,
  niches?: string[]
): Promise<JobListing[]> {
  // Capture the listing URL before navigating to job details
  const listingUrl = page.url();

  // Wait for job cards to appear
  try {
    await page.waitForSelector('a.ui.fluid.card', { timeout: 10000 });
  } catch {
    logger.warn('Job cards not found, trying alternative selectors...');
  }

  // Simulate human looking at the page first
  await humanReadingPause(300);

  // Scroll and collect jobs with filtering
  logger.action('Browsing job listings...');
  const { allJobs, filteredJobs } = await scrollAndFilterJobs(
    page,
    targetFilteredJobs,
    niches
  );

  logger.success(`Found ${allJobs.length} total jobs, ${filteredJobs.length} match your niches`);

  // Get detailed info by clicking on each filtered job card (Snaphunt uses JS navigation)
  const detailedJobs: JobListing[] = [];

  for (let i = 0; i < filteredJobs.length; i++) {
    const job = filteredJobs[i];
    logger.job(`Fetching details for: ${job.title}`);

    try {
      // Navigate back to job listing if not already there
      const currentUrl = page.url();
      if (!currentUrl.includes('/job-listing')) {
        await navigateTo(listingUrl);
        await humanDelay(1500, 2500);
      }

      // Find and click the job card by matching title
      const detailedJob = await clickJobCardAndGetDetails(page, job);
      if (detailedJob) {
        detailedJobs.push(detailedJob);
      } else {
        detailedJobs.push(job); // Fall back to basic info
      }

      // Human-like pause between jobs - varies based on "interest"
      const pauseTime = Math.random() < 0.3 ? [2500, 4000] : [1500, 2500];
      await humanDelay(pauseTime[0], pauseTime[1]);

      // Occasionally do idle movements (reading, thinking)
      if (Math.random() < 0.2) {
        await humanIdleMovements(page);
      }
    } catch (error) {
      logger.warn(`Failed to get details for ${job.title}: ${error}`);
      detailedJobs.push(job);
    }
  }

  return detailedJobs;
}

/**
 * Scroll through infinite scroll and filter jobs by niche in real-time
 * Keeps scrolling until target number of filtered jobs is found
 */
async function scrollAndFilterJobs(
  page: Page,
  targetFiltered: number,
  niches?: string[]
): Promise<{ allJobs: JobListing[]; filteredJobs: JobListing[] }> {
  const seenJobIds = new Set<string>();
  const allJobs: JobListing[] = [];
  const filteredJobs: JobListing[] = [];

  let noNewJobsCount = 0;
  const maxNoNewJobsAttempts = 5; // Stop if no new jobs found after 5 scrolls
  let lastFilteredCount = 0;

  // Get scroll container
  const scrollContainer = await page.$('.infinite-scroll-component');

  while (noNewJobsCount < maxNoNewJobsAttempts) {
    // Extract current visible job cards
    const newJobs = await extractNewJobCards(page, seenJobIds);

    // Track if we're finding new jobs
    if (newJobs.length === 0) {
      noNewJobsCount++;
    } else {
      noNewJobsCount = 0; // Reset when we find new jobs
    }

    // Add to all jobs
    allJobs.push(...newJobs);

    // Filter new jobs by niche
    if (niches && niches.length > 0) {
      const matchedJobs = newJobs.filter((job) => {
        const titleLower = job.title.toLowerCase();
        return niches.some((niche) => titleLower.includes(niche.toLowerCase()));
      });
      filteredJobs.push(...matchedJobs);

      // Log progress when new matches found
      if (filteredJobs.length > lastFilteredCount) {
        logger.debug(`Found ${filteredJobs.length} matching jobs so far...`);
        lastFilteredCount = filteredJobs.length;
      }
    } else {
      // No filter, all jobs are "filtered"
      filteredJobs.push(...newJobs);
    }

    // Check if we have enough filtered jobs
    if (filteredJobs.length >= targetFiltered) {
      logger.debug(`Reached target of ${targetFiltered} filtered jobs`);
      break;
    }

    // Human-like scroll behavior
    const scrollAmount = 300 + Math.random() * 400; // Variable scroll distance

    if (scrollContainer) {
      await scrollContainer.evaluate(
        (el, amount) => el.scrollBy({ top: amount, behavior: 'smooth' }),
        scrollAmount
      );
    } else {
      await humanScroll(page, 'down', scrollAmount);
    }

    // Variable delay - humans don't scroll at fixed intervals
    const scrollDelay = 1200 + Math.random() * 1500;
    await humanDelay(scrollDelay, scrollDelay + 500);

    // Log progress
    if (noNewJobsCount > 0) {
      logger.debug(`No new jobs found (attempt ${noNewJobsCount}/${maxNoNewJobsAttempts})`);
      await humanDelay(800, 1500);
    }

    // Human-like behaviors during browsing
    if (Math.random() < 0.15) {
      // Sometimes scroll up a bit to "re-read" something
      logger.debug('Scrolling back to check something...');
      await humanScroll(page, 'up', 100 + Math.random() * 150);
      await humanDelay(500, 1000);
    }

    if (Math.random() < 0.2) {
      // Idle movements - mouse wander, small pauses
      await humanIdleMovements(page);
    }

    if (Math.random() < 0.1) {
      // Longer pause - "reading" a job title that caught attention
      logger.debug('Pausing to read...');
      await humanDelay(2000, 4000);
    }
  }

  // Final scroll back to top sometimes (human reviewing what they found)
  if (Math.random() < 0.3 && filteredJobs.length > 0) {
    logger.debug('Scrolling back to review...');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await humanDelay(1000, 2000);
  }

  return { allJobs, filteredJobs };
}

/**
 * Click on a job card to navigate to details page, extract info, then return
 * Snaphunt uses JavaScript navigation, so we need to click instead of using href
 */
async function clickJobCardAndGetDetails(
  page: Page,
  job: JobListing
): Promise<JobListing | null> {
  try {
    // Find the job card by matching the title text
    const jobCards = await page.$$('a.ui.fluid.card');
    logger.debug(`Found ${jobCards.length} job cards on page`);

    for (const card of jobCards) {
      const titleElement = await card.$('h3.ui.header, h3[class*="header"]');
      const cardTitle = titleElement ? await titleElement.textContent() : '';

      if (cardTitle && cardTitle.trim() === job.title) {
        logger.debug(`Found matching card for: ${job.title}`);

        // Try to get the href directly from the card (if available)
        const cardHref = await card.getAttribute('href');
        logger.debug(`Card href: ${cardHref}`);

        // Found the matching card - scroll to it and click
        await humanScrollToElement(page, page.locator(`a.ui.fluid.card:has-text("${job.title.substring(0, 30)}")`).first());
        await humanDelay(300, 600);

        // Store URL before click to compare
        const urlBeforeClick = page.url();

        // Click the card - don't wait for full navigation (SPA may not trigger it)
        await card.click();
        logger.debug(`Clicked on job card: ${job.title}`);

        // Wait for URL to change or content to load
        await humanDelay(2000, 3000);

        // Get the actual URL after navigation
        let jobUrl = page.url();
        logger.debug(`URL after click: ${jobUrl}`);

        // If URL didn't change, try constructing from href
        if (jobUrl === urlBeforeClick && cardHref) {
          jobUrl = cardHref.startsWith('http') ? cardHref : `https://snaphunt.com${cardHref}`;
          logger.debug(`Using href as URL: ${jobUrl}`);
        }

        // Check if we have a valid job URL
        const hasValidUrl = jobUrl !== urlBeforeClick || cardHref;

        if (!hasValidUrl) {
          logger.warn(`Navigation may have failed for: ${job.title}`);
          // Still try to extract what we can
        }

        // Extract job details from the current page (may be detail page)
        const description = await extractJobDescription(page);
        const requirements = await extractJobRequirements(page);
        const metadata = await extractJobMetadata(page);

        logger.debug(`Extracted description length: ${description.length}`);

        // Simulate reading the job posting
        await humanReadingPause(description.length > 500 ? 800 : 400);

        // Scroll down to see more content (human-like)
        await humanScroll(page, 'down', 200 + Math.random() * 200);
        await humanDelay(500, 1000);

        // Return job with URL (even if we're not 100% sure navigation worked)
        return {
          ...job,
          url: jobUrl !== urlBeforeClick ? jobUrl : (cardHref ? `https://snaphunt.com${cardHref}` : jobUrl),
          description: description.trim(),
          requirements,
          jobType: metadata.jobType || job.jobType,
          salary: metadata.salary || job.salary,
          location: metadata.location || job.location,
        };
      }
    }

    logger.warn(`Could not find card for: ${job.title}`);
    return null;
  } catch (error) {
    logger.warn(`Error clicking job card: ${error}`);
    return null;
  }
}

/**
 * Extract job description from detail page
 */
async function extractJobDescription(page: Page): Promise<string> {
  const descriptionSelectors = [
    '.RichTextEditorDisplay-informationText',
    'div[class*="informationText"]',
    'div[class*="description"]',
    'article',
    '.ui.container p',
  ];

  for (const selector of descriptionSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const text = await element.textContent();
        if (text && text.length > 100) {
          return text;
        }
      }
    } catch {
      continue;
    }
  }

  return '';
}

/**
 * Extract job requirements from detail page
 */
async function extractJobRequirements(page: Page): Promise<string[]> {
  const requirements: string[] = [];

  try {
    const listItems = await page.$$('ul li, ol li');
    for (const li of listItems) {
      const text = await li.textContent();
      if (text && text.length > 10 && text.length < 500) {
        requirements.push(text.trim());
      }
    }
  } catch {
    // Ignore errors
  }

  return requirements.slice(0, 20); // Limit to 20 requirements
}

/**
 * Extract job metadata (type, salary, location) from detail page
 */
async function extractJobMetadata(page: Page): Promise<{
  jobType?: string;
  salary?: string;
  location?: string;
}> {
  const metadata: { jobType?: string; salary?: string; location?: string } = {};

  try {
    // Get all text from metadata area
    const metaTexts = await page.$$eval(
      'div.MuiGrid-root span, div.MuiGrid-root p, div[class*="info"] span',
      (elements) => elements.map((el) => el.textContent?.trim() || '')
    );

    for (const text of metaTexts) {
      if (text.includes('Full Time') || text.includes('Part Time') || text.includes('Contract')) {
        metadata.jobType = text;
      }
      if (text.includes('USD') || text.includes('PKR') || text.includes('/Year') || text.includes('/Month')) {
        metadata.salary = text;
      }
      if (text.includes('Remote') || text.includes('Asia') || text.includes('Europe') || text.includes('America')) {
        metadata.location = text;
      }
    }
  } catch {
    // Ignore errors
  }

  return metadata;
}

/**
 * Scroll down by 100vh and wait for new job listings to load
 */
async function scrollAndWaitForNewListings(page: Page): Promise<void> {
  // Count current job cards
  const initialCount = await page.locator('a.ui.fluid.card').count();

  // Scroll down by 100vh
  await page.evaluate(() => window.scrollBy({ top: window.innerHeight, behavior: 'smooth' }));

  // Wait for new job cards to appear (max 5 seconds)
  try {
    await page.waitForFunction(
      (prevCount) => document.querySelectorAll('a.ui.fluid.card').length > prevCount,
      initialCount,
      { timeout: 5000 }
    );
    logger.debug('New listings loaded');
  } catch {
    // Timeout - no new listings loaded, that's okay
    logger.debug('No new listings loaded after scroll');
  }

  await humanDelay(500, 1000);
}

/**
 * Extract job cards that haven't been seen before
 */
async function extractNewJobCards(
  page: Page,
  seenIds: Set<string>
): Promise<JobListing[]> {
  const newJobs: JobListing[] = [];
  const jobElements = await page.$$('a.ui.fluid.card');

  for (let i = 0; i < jobElements.length; i++) {
    try {
      const element = jobElements[i];

      // Extract job title first - we need it for ID
      const titleElement = await element.$('h3.ui.header, h3[class*="header"]');
      const title = titleElement ? await titleElement.textContent() : '';

      // Skip jobs without titles
      if (!title || title.trim() === '') {
        continue;
      }

      // Use title as stable ID (since Snaphunt cards have no href)
      const titleClean = title.trim().toLowerCase().replace(/\s+/g, '-');
      const id = `job-${titleClean}`;

      // Skip if already seen
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);

      // Extract company name
      const companyElement = await element.$('.header span, div.content > span');
      const company = companyElement ? await companyElement.textContent() : 'Unknown Company';

      // Extract location
      const labelElement = await element.$('.ui.tiny.label, div[class*="label"]');
      const locationPElement = await element.$('p[class*="css-"]');

      let location = '';
      if (labelElement) {
        location = await labelElement.textContent() || '';
      }
      if (locationPElement) {
        const locText = await locationPElement.textContent();
        if (locText) {
          location = location ? `${location} - ${locText}` : locText;
        }
      }

      // Extract salary
      const fullText = await element.textContent() || '';
      const salaryMatch = fullText.match(/USD\s*[\d,]+\s*-?\s*[\d,]*/i);
      const salary = salaryMatch ? salaryMatch[0] : undefined;

      // Try to extract URL from href attribute (even if JS navigation is used)
      const href = await element.getAttribute('href');
      let url = '';
      if (href) {
        url = href.startsWith('http') ? href : `https://snaphunt.com${href}`;
      }

      newJobs.push({
        id,
        title: title.trim(),
        company: (company || 'Unknown Company').trim(),
        location: location.trim(),
        salary,
        url, // Extracted from href, will be updated when clicking card
        description: '',
        requirements: [],
      });
    } catch (error) {
      logger.debug(`Error extracting job card: ${error}`);
    }
  }

  return newJobs;
}

export async function clickApplyButton(page: Page): Promise<boolean> {
  logger.action('Looking for Apply button...');

  try {
    const button = page.locator('button:has-text("Apply")');
    await button.waitFor({ state: 'visible', timeout: 5000 });
    await humanScrollToElement(page, button);
    await humanClick(page, button);
    logger.success('Clicked Apply button');
    await humanDelay(1500, 2500);
    return true;
  } catch {
    logger.warn('Apply button not found');
    return false;
  }
}

export async function clickViewJobButton(page: Page, cardElement: any): Promise<boolean> {
  // Snaphunt "View job" button selector
  const viewJobButton = await cardElement.$('button:has-text("View job"), button.ui.black.mini');

  if (viewJobButton) {
    await humanClick(page, page.locator('button:has-text("View job")').first());
    await humanDelay(1500, 2500);
    return true;
  }

  return false;
}

// Legacy function for backward compatibility
export async function getJobApplyPage(page: Page, job: JobListing): Promise<void> {
  logger.action(`Opening application page for: ${job.title}`);

  if (job.url) {
    await navigateTo(job.url);
    await humanDelay(1500, 2500);
    await clickApplyButton(page);
  }
}
