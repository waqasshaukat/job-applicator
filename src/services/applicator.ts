import { Page } from 'playwright';
import { JobMatch, ApplicationResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  humanDelay,
  humanClick,
  humanFillInput,
  humanScrollToElement,
  humanBreakBetweenApplications,
} from '../utils/human.js';
import { getPage, navigateTo } from './browser.js';
import { JobListing } from '../types/index.js';

/**
 * Apply to a job when already on the job detail page
 * Used in the integrated scrape-match-apply flow
 */
export async function applyOnCurrentPage(
  page: Page,
  job: JobListing
): Promise<ApplicationResult> {
  logger.debug(`Applying on current page: ${page.url()}`);

  // Step 1: Click Apply button
  const applyClicked = await clickSnaphuntApplyButton(page);

  if (!applyClicked) {
    return {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      status: 'skipped',
      message: 'Could not find Apply button',
      timestamp: new Date(),
    };
  }

  // Step 2: Wait for modal to appear
  const modalAppeared = await waitForSnaphuntModal(page);

  if (!modalAppeared) {
    return {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      status: 'skipped',
      message: 'Application modal did not appear',
      timestamp: new Date(),
    };
  }

  // Step 3: Form fields are pre-filled by Snaphunt, just click Submit
  logger.debug('Modal appeared, form should be pre-filled');
  await humanDelay(2500, 3500);

  // Step 4: Click Submit Application button
  const submitted = await clickSnaphuntSubmitButton(page);

  if (submitted) {
    await humanDelay(2000, 3000);
    const success = await checkApplicationSuccess(page);

    if (success) {
      return {
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        status: 'success',
        message: 'Application submitted successfully',
        timestamp: new Date(),
      };
    }
  }

  return {
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    status: 'failed',
    message: 'Failed to submit application',
    timestamp: new Date(),
  };
}

/**
 * Click on a job card by matching the title text
 * Used as fallback when job URL is not available
 */
async function clickJobCardByTitle(page: Page, title: string): Promise<boolean> {
  try {
    // Wait for job cards to appear
    await page.waitForSelector('a.ui.fluid.card', { timeout: 300000 });

    const jobCards = await page.$$('a.ui.fluid.card');
    logger.debug(`Found ${jobCards.length} job cards`);

    for (const card of jobCards) {
      const titleElement = await card.$('h3.ui.header, h3[class*="header"]');
      const cardTitle = titleElement ? await titleElement.textContent() : '';

      if (cardTitle && cardTitle.trim() === title) {
        logger.debug(`Found matching card for: ${title}`);

        // Scroll to card and click
        await humanScrollToElement(page, page.locator(`a.ui.fluid.card:has-text("${title.substring(0, 30)}")`).first());
        await humanDelay(300, 600);

        await card.click();
        logger.debug('Clicked on job card');

        // Wait for navigation/content change
        await humanDelay(2000, 3000);
        return true;
      }
    }

    logger.warn(`Could not find job card with title: ${title}`);
    return false;
  } catch (error) {
    logger.warn(`Error clicking job card: ${error}`);
    return false;
  }
}

export async function applyToJobs(
  matches: JobMatch[],
  _resumePath: string,      // Unused - Snaphunt form is pre-filled
  maxApplications: number
): Promise<ApplicationResult[]> {
  logger.divider('Submitting Applications');

  const results: ApplicationResult[] = [];
  const page = await getPage();

  const jobsToApply = matches.slice(0, maxApplications);
  logger.action(`Applying to ${jobsToApply.length} jobs...`);

  for (let i = 0; i < jobsToApply.length; i++) {
    const match = jobsToApply[i];
    const job = match.job;

    logger.application(job.title, 'applying');

    try {
      const result = await submitSnaphuntApplication(page, job);
      results.push(result);

      if (result.status === 'success') {
        logger.application(job.title, 'success');
      } else {
        logger.application(job.title, result.status);
        logger.warn(`  ${result.message}`);
      }

      // Take a break between applications (human-like)
      if (i < jobsToApply.length - 1) {
        logger.debug('Taking a short break before next application...');
        await humanBreakBetweenApplications();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.application(job.title, 'failed');
      logger.error(`  Error: ${errorMessage}`);

      results.push({
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        status: 'failed',
        message: errorMessage,
        timestamp: new Date(),
      });
    }
  }

  return results;
}

/**
 * Snaphunt-specific application submission
 * Flow: Navigate to job → Click Apply → Modal opens (pre-filled) → Click Submit
 */
async function submitSnaphuntApplication(
  page: Page,
  job: JobMatch['job']
): Promise<ApplicationResult> {
  // Step 1: Navigate to job detail page
  if (job.url && job.url.length > 0) {
    logger.debug(`Navigating to job URL: ${job.url}`);
    await navigateTo(job.url);
    await humanDelay(1500, 2500);
  } else {
    // Fallback: Navigate to listing page and click the job card
    logger.debug('No job URL, navigating to listing and clicking card...');
    const listingUrl = 'https://snaphunt.com/job-listing';
    await navigateTo(listingUrl);
    await humanDelay(2000, 3000);

    // Find and click the job card by title
    const clicked = await clickJobCardByTitle(page, job.title);
    if (!clicked) {
      return {
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        status: 'skipped',
        message: 'Could not find job card on listing page',
        timestamp: new Date(),
      };
    }
    await humanDelay(1500, 2500);
  }

  // Step 2: Click Apply button
  const applyClicked = await clickSnaphuntApplyButton(page);

  if (!applyClicked) {
    return {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      status: 'skipped',
      message: 'Could not find Apply button',
      timestamp: new Date(),
    };
  }

  // Step 3: Wait for modal to appear
  const modalAppeared = await waitForSnaphuntModal(page);

  if (!modalAppeared) {
    return {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      status: 'skipped',
      message: 'Application modal did not appear',
      timestamp: new Date(),
    };
  }

  // Step 4: Form fields are pre-filled by Snaphunt, just click Submit
  logger.debug('Modal appeared, form should be pre-filled');
  await humanDelay(2500, 3500); // Give time for form to fully load

  // Step 5: Click Submit Application button
  const submitted = await clickSnaphuntSubmitButton(page);

  if (submitted) {
    // Wait and check for success
    await humanDelay(2000, 3000);

    const success = await checkApplicationSuccess(page);

    if (success) {
      return {
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        status: 'success',
        message: 'Application submitted successfully',
        timestamp: new Date(),
      };
    }
  }

  return {
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    status: 'failed',
    message: 'Failed to submit application',
    timestamp: new Date(),
  };
}

/**
 * Click the Apply button on Snaphunt job detail page
 */
async function clickSnaphuntApplyButton(page: Page): Promise<boolean> {
  logger.action('Looking for Apply button...');

  try {
    const button = page.locator('button:has-text("Apply")');
    await button.waitFor({ state: 'visible', timeout: 300000 });
    await humanScrollToElement(page, button);
    await humanClick(page, button);
    logger.debug('Clicked Apply button');
    return true;
  } catch (error) {
    logger.warn('Apply button not found');
    return false;
  }
}

/**
 * Wait for Snaphunt application modal to appear
 */
async function waitForSnaphuntModal(page: Page): Promise<boolean> {
  logger.debug('Waiting for application modal...');

  try {
    await page.locator('div.ui.modal.visible.active').waitFor({
      state: 'visible',
      timeout: 300000
    });
    logger.debug('Modal detected');
    return true;
  } catch {
    logger.warn('Application modal not detected');
    return false;
  }
}

/**
 * Click the Submit Application button in Snaphunt modal
 */
async function clickSnaphuntSubmitButton(page: Page): Promise<boolean> {
  logger.action('Clicking Submit Application...');

  try {
    const button = page.locator('div.ui.modal.visible.active button[type="submit"]');
    await button.waitFor({ state: 'visible', timeout: 300000 });
    await humanScrollToElement(page, button);
    await humanDelay(500, 800);
    await humanClick(page, button);
    logger.debug('Clicked Submit button');
    return true;
  } catch {
    logger.warn('Submit Application button not found');
    return false;
  }
}

/**
 * Check if application was submitted successfully and close the success popup
 */
async function checkApplicationSuccess(page: Page): Promise<boolean> {
  try {
    // Wait for success popup to appear (contains "submitted" text)
    const successModal = page.locator('div.ui.modal.visible.active:has-text("submitted")');
    await successModal.waitFor({ state: 'visible', timeout: 300000 });
    logger.debug('Success popup appeared');

    // Click the X button to close the popup
    const closeButton = page.locator('div.ui.modal.visible.active i.close');
    await closeButton.click();
    logger.debug('Closed success popup');

    await humanDelay(500, 1000);
    return true;
  } catch {
    // If already applied, a "Track application" popup appears
    const trackModal = page.locator(
      'div.ui.modal.visible.active div.visible.content:has-text("Track application")'
    );
    const trackVisible = await trackModal.isVisible({ timeout: 300000 }).catch(() => false);
    if (trackVisible) {
      logger.success('Already applied: Track application popup appeared');

      const closeTrack = page.locator(
        'div.ui.modal.visible.active i.close.sh-e-remove-2.icon, div.ui.modal.visible.active i.close'
      );
      await closeTrack.first().click().catch(() => undefined);
      logger.debug('Closed track application popup');
      await humanDelay(500, 1000);
      return true;
    }

    // Check if there's an error in the modal
    const hasError = await page
      .locator('div.ui.modal.visible.active .error, div.ui.modal.visible.active [class*="error"]')
      .isVisible({ timeout: 300000 })
      .catch(() => false);

    if (hasError) {
      logger.warn('Error detected in modal');
      return false;
    }

    logger.warn('Success popup did not appear');
    return false;
  }
}

/**
 * Handle Snaphunt login if required
 * Checks for "Sign in" button in header as indicator that user is not logged in
 */
export async function handleLoginIfRequired(
  page: Page,
  email?: string,
  password?: string
): Promise<boolean> {
  logger.action('Checking if login is required...');

  // Check for login popup or Sign in link
  const signInLink = page.locator('a:has-text("Sign in"), button:has-text("Sign in")').first();
  const loginRequired = await signInLink.isVisible({ timeout: 300000 }).catch(() => false);

  if (!loginRequired) {
    logger.success('User is already logged in');
    return true;
  }

  if (!email || !password) {
    logger.warn('Login required but credentials not provided in .env file');
    logger.info('Set SNAPHUNT_EMAIL and SNAPHUNT_PASSWORD in your .env file');
    return false;
  }

  logger.action('Login required, attempting to authenticate...');

  try {
    // Click the Sign in link to open the login popup
    await humanClick(page, signInLink);
    logger.debug('Clicked Sign in');
    await humanDelay(1500, 2500);

    // Wait for login popup to appear
    await page.locator('div.LoginFlow').waitFor({ state: 'visible', timeout: 300000 });
    logger.debug('Login popup appeared');
    await humanDelay(500, 1000);

    // Fill email field
    const emailField = page.locator('input[placeholder="Email"]').first();
    logger.debug('Filling email field');
    await humanFillInput(page, emailField, email);
    await humanDelay(300, 600);

    // Fill password field
    const passwordField = page.locator('input[placeholder="Password"][type="password"]');
    logger.debug('Filling password field');
    await humanFillInput(page, passwordField, password);
    await humanDelay(300, 600);

    // Click "Let's go!" button (it's a div, not a button)
    const letsGoButton = page.getByRole('button', { name: "Let's go!" });
    await letsGoButton.waitFor({ state: 'visible', timeout: 300000 });
    await humanClick(page, letsGoButton);
    logger.debug('Clicked Let\'s go! button');

    // Wait for login to complete
    await humanDelay(3000, 4000);

    // Check if login was successful - login popup should be gone
    const popupStillOpen = await page
      .locator('div.LoginFlow')
      .isVisible({ timeout: 300000 })
      .catch(() => false);

    if (!popupStillOpen) {
      logger.success('Successfully logged in');
      return true;
    } else {
      logger.error('Login failed - check your credentials');
      return false;
    }
  } catch (error) {
    logger.error(`Login error: ${error}`);
    return false;
  }
}

export async function signOutSnaphunt(page: Page): Promise<void> {
  logger.action('Signing out...');

  try {
    const profileIcon = page.locator('i.icon.sh-circle-10-1.css-hfm1bj').first();
    await profileIcon.waitFor({ state: 'visible', timeout: 300000 });
    await humanClick(page, profileIcon);
    await humanDelay(500, 1000);

    const logoutItem = page.locator('div:has-text("Logout")').first();
    await logoutItem.waitFor({ state: 'visible', timeout: 300000 });
    await humanClick(page, logoutItem);
    await humanDelay(1500, 2500);

    logger.success('Signed out');
  } catch (error) {
    logger.warn(`Sign out skipped: ${error}`);
  }
}
