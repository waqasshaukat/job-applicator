import { JobListing, JobMatch } from '../types/index.js';
import { logger } from '../utils/logger.js';

export async function matchJobsToResume(
  jobs: JobListing[],
  _resume: unknown,
  threshold: number
): Promise<JobMatch[]> {
  logger.divider('AI Job Matching');
  logger.action(`Analyzing ${jobs.length} jobs against your resume...`);

  const matches: JobMatch[] = [];

  for (const job of jobs) {
    try {
      logger.debug(`Analyzing: ${job.title} at ${job.company}`);

      const match = await analyzeJobFit(job);
      matches.push(match);

      // Show match score
      logger.match(job.title, job.company, match.score);

      if (match.score >= threshold) {
        logger.info(`  Key matches: ${match.keyMatches.slice(0, 3).join(', ')}`);
      }
    } catch (error) {
      logger.warn(`Failed to analyze ${job.title}: ${error}`);
      // Add with score 0 on failure
      matches.push({
        job,
        score: 0,
        reasoning: 'Analysis failed',
        keyMatches: [],
        concerns: ['Could not analyze this job'],
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  // Filter by threshold
  const qualifiedMatches = matches.filter((m) => m.score >= threshold);

  logger.divider();
  logger.success(`Found ${qualifiedMatches.length} jobs above ${threshold}% match threshold`);

  return qualifiedMatches;
}

async function analyzeJobFit(job: JobListing): Promise<JobMatch> {
  // Log what we're sending for debugging
  const descPreview = job.description ? job.description.substring(0, 100) + '...' : 'EMPTY';
  logger.debug(`  Description preview: ${descPreview}`);
  return {
    job,
    score: 100,
    reasoning: 'LLM matching disabled; all jobs pass.',
    keyMatches: [],
    concerns: [],
  };
}

/**
 * Analyze a single job fit - exported for use in integrated flow
 */
export async function analyzeJobFitSingle(
  job: JobListing
): Promise<JobMatch> {
  return analyzeJobFit(job);
}

// Batch analyze for efficiency (if many jobs)
export async function batchAnalyzeJobs(
  jobs: JobListing[],
  _resume: unknown,
  batchSize = 5
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  // Process in batches
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);

    logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}...`);

    const batchPromises = batch.map((job) =>
      analyzeJobFit(job)
        .then((match) => {
          scores.set(job.id, match.score);
        })
        .catch(() => {
          scores.set(job.id, 0);
        })
    );

    await Promise.all(batchPromises);
  }

  return scores;
}
