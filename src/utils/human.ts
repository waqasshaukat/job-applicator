import { Page, Locator } from 'playwright';
import { HUMAN_CONFIG } from '../config.js';

/**
 * Human-like behavior utilities to avoid detection
 */

// Random number between min and max
export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random delay between actions
export async function humanDelay(
  min = HUMAN_CONFIG.minActionDelay,
  max = HUMAN_CONFIG.maxActionDelay
): Promise<void> {
  const delay = randomBetween(min, max);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

// Bezier curve for natural mouse movement
function bezierPoint(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// Generate bezier curve points for mouse movement
function generateBezierPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  // Control points with some randomness
  const cp1x = startX + (endX - startX) * 0.25 + randomBetween(-50, 50);
  const cp1y = startY + (endY - startY) * 0.1 + randomBetween(-30, 30);
  const cp2x = startX + (endX - startX) * 0.75 + randomBetween(-50, 50);
  const cp2y = startY + (endY - startY) * 0.9 + randomBetween(-30, 30);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: bezierPoint(t, startX, cp1x, cp2x, endX),
      y: bezierPoint(t, startY, cp1y, cp2y, endY),
    });
  }

  return points;
}

// Move mouse naturally using bezier curves
export async function humanMove(
  page: Page,
  targetX: number,
  targetY: number
): Promise<void> {
  const mouse = page.mouse;

  // Get current position (approximate from viewport center if unknown)
  const viewport = page.viewportSize();
  const startX = viewport ? viewport.width / 2 : 500;
  const startY = viewport ? viewport.height / 2 : 300;

  const path = generateBezierPath(
    startX,
    startY,
    targetX,
    targetY,
    HUMAN_CONFIG.mouseMovementSteps
  );

  for (const point of path) {
    await mouse.move(point.x, point.y);
    await new Promise((resolve) => setTimeout(resolve, randomBetween(5, 15)));
  }
}

// Click with human-like behavior (hover, slight offset, natural timing)
export async function humanClick(
  page: Page,
  locator: Locator
): Promise<void> {
  // Get element bounding box
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Element not visible for clicking');
  }

  // Calculate click position with slight random offset from center
  const offsetX = randomBetween(-Math.floor(box.width * 0.2), Math.floor(box.width * 0.2));
  const offsetY = randomBetween(-Math.floor(box.height * 0.2), Math.floor(box.height * 0.2));
  const clickX = box.x + box.width / 2 + offsetX;
  const clickY = box.y + box.height / 2 + offsetY;

  // Move mouse to element naturally
  await humanMove(page, clickX, clickY);

  // Small pause before clicking (human hesitation)
  await humanDelay(100, 300);

  // Click
  await page.mouse.click(clickX, clickY);

  // Small pause after clicking
  await humanDelay(200, 500);
}

// Type text with human-like speed and occasional pauses
export async function humanType(
  page: Page,
  locator: Locator,
  text: string
): Promise<void> {
  // First click on the field
  await humanClick(page, locator);

  // Type character by character with variable delays
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Occasionally pause mid-typing (thinking)
    if (Math.random() < 0.05 && i > 0) {
      await humanDelay(300, 800);
    }

    // Type the character
    await locator.pressSequentially(char, {
      delay: randomBetween(HUMAN_CONFIG.minTypeDelay, HUMAN_CONFIG.maxTypeDelay),
    });

    // Slightly longer pause after punctuation
    if (['.', ',', '!', '?', ';', ':'].includes(char)) {
      await humanDelay(100, 250);
    }
  }
}

// Scroll page naturally
export async function humanScroll(
  page: Page,
  direction: 'down' | 'up' = 'down',
  distance?: number
): Promise<void> {
  const totalDistance = distance || randomBetween(200, 500);
  let scrolled = 0;

  while (scrolled < totalDistance) {
    const step = randomBetween(
      HUMAN_CONFIG.scrollStepMin,
      HUMAN_CONFIG.scrollStepMax
    );
    const actualStep = Math.min(step, totalDistance - scrolled);

    await page.mouse.wheel(0, direction === 'down' ? actualStep : -actualStep);
    scrolled += actualStep;

    await new Promise((resolve) =>
      setTimeout(
        resolve,
        randomBetween(HUMAN_CONFIG.scrollDelayMin, HUMAN_CONFIG.scrollDelayMax)
      )
    );
  }
}

// Scroll to element naturally
export async function humanScrollToElement(
  page: Page,
  locator: Locator
): Promise<void> {
  // First check if element is in viewport
  const isVisible = await locator.isVisible();

  if (!isVisible) {
    // Scroll element into view with smooth behavior
    await locator.scrollIntoViewIfNeeded();
    await humanDelay(300, 600);
  }

  // Add some extra scroll for natural look
  const extraScroll = randomBetween(-50, 50);
  if (extraScroll !== 0) {
    await page.mouse.wheel(0, extraScroll);
    await humanDelay(200, 400);
  }
}

// Simulate reading time based on content length
export async function humanReadingPause(textLength: number): Promise<void> {
  const readingTime = Math.min(
    Math.max(
      textLength * HUMAN_CONFIG.readingTimePerChar,
      HUMAN_CONFIG.minReadingTime
    ),
    HUMAN_CONFIG.maxReadingTime
  );

  // Add some randomness
  const finalTime = readingTime + randomBetween(-500, 500);
  await new Promise((resolve) => setTimeout(resolve, Math.max(finalTime, 1000)));
}

// Random mouse movements while "reading"
export async function humanIdleMovements(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;

  const movements = randomBetween(2, 5);

  for (let i = 0; i < movements; i++) {
    const x = randomBetween(100, viewport.width - 100);
    const y = randomBetween(100, viewport.height - 100);

    await humanMove(page, x, y);
    await humanDelay(500, 1500);
  }
}

// Wait between applications (longer break)
export async function humanBreakBetweenApplications(): Promise<void> {
  await humanDelay(
    HUMAN_CONFIG.breakBetweenApplicationsMin,
    HUMAN_CONFIG.breakBetweenApplicationsMax
  );
}

// Fill input field with value
export async function humanFillInput(
  page: Page,
  locator: Locator,
  value: string
): Promise<void> {
  await humanScrollToElement(page, locator);
  await humanClick(page, locator);

  // Clear existing content
  await locator.clear();
  await humanDelay(100, 200);

  // Type the new value
  await humanType(page, locator, value);
}

// Select option from dropdown
export async function humanSelectOption(
  page: Page,
  locator: Locator,
  value: string
): Promise<void> {
  await humanScrollToElement(page, locator);
  await humanClick(page, locator);
  await humanDelay(200, 400);
  await locator.selectOption(value);
  await humanDelay(200, 400);
}

// Upload file with human-like behavior
export async function humanUploadFile(
  locator: Locator,
  filePath: string
): Promise<void> {
  await humanDelay(300, 600);
  await locator.setInputFiles(filePath);
  await humanDelay(500, 1000);
}
