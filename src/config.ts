import dotenv from 'dotenv';
import { BotConfig, JobListing } from './types/index.js';

dotenv.config();

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required. Set it in your .env file.');
  }
  return key;
}

export function getSnaphuntCredentials(): { email?: string; password?: string } {
  return {
    email: process.env.SNAPHUNT_EMAIL,
    password: process.env.SNAPHUNT_PASSWORD,
  };
}

// Default job niches to filter for
export const DEFAULT_JOB_NICHES = [
  // Front-end
  'front-end',
  'frontend',
  'front end',
  'react',
  'vue',
  'angular',
  // Full-stack
  'full-stack',
  'fullstack',
  'full stack',
  // Software Engineer
  'software engineer',
  // AI Application Development (using APIs/SDKs)
  'ai developer',
  'ai engineer',
  'ai application',
  'ai integration',
  'genai',
  'generative ai',
  'llm',
  'openai',
  'claude',
  'gpt',
  'chatbot',
  'conversational ai',
  'prompt engineer',
];

export function createBotConfig(options: Partial<BotConfig>): BotConfig {
  return {
    jobListingUrl: options.jobListingUrl || 'https://snaphunt.com/job-listing',
    resumePath: options.resumePath || './resume/resume.pdf',
    matchThreshold: options.matchThreshold ?? 70,
    maxApplications: options.maxApplications ?? 5,
    headless: options.headless ?? false, // Visible by default for demo
    slowMo: options.slowMo ?? 50,
    jobNiches: options.jobNiches ?? DEFAULT_JOB_NICHES,
  };
}

/**
 * Filter jobs by matching title against configured niches
 * Returns only jobs that match at least one niche keyword
 */
export function filterJobsByNiche(jobs: JobListing[], niches: string[]): JobListing[] {
  return jobs.filter((job) => {
    const titleLower = job.title.toLowerCase();
    const descLower = (job.description || '').toLowerCase();

    return niches.some((niche) => {
      const nicheLower = niche.toLowerCase();
      return titleLower.includes(nicheLower) || descLower.includes(nicheLower);
    });
  });
}

// Human-like behavior settings
export const HUMAN_CONFIG = {
  // Delay ranges in milliseconds
  minActionDelay: 800,
  maxActionDelay: 2500,

  // Typing speed (ms between keystrokes)
  minTypeDelay: 50,
  maxTypeDelay: 150,

  // Scroll behavior
  scrollStepMin: 100,
  scrollStepMax: 300,
  scrollDelayMin: 50,
  scrollDelayMax: 150,

  // Reading time (ms per character)
  readingTimePerChar: 30,
  minReadingTime: 2000,
  maxReadingTime: 10000,

  // Mouse movement
  mouseMovementSteps: 25,

  // Session limits
  maxApplicationsPerSession: 10,
  breakBetweenApplicationsMin: 5000,
  breakBetweenApplicationsMax: 15000,
};
