import Anthropic from '@anthropic-ai/sdk';
import { JobListing, JobMatch, ResumeData } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getAnthropicApiKey } from '../config.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: getAnthropicApiKey(),
    });
  }
  return client;
}

export async function matchJobsToResume(
  jobs: JobListing[],
  resume: ResumeData,
  threshold: number
): Promise<JobMatch[]> {
  logger.divider('AI Job Matching');
  logger.action(`Analyzing ${jobs.length} jobs against your resume...`);

  const matches: JobMatch[] = [];

  for (const job of jobs) {
    try {
      logger.debug(`Analyzing: ${job.title} at ${job.company}`);

      const match = await analyzeJobFit(job, resume);
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

async function analyzeJobFit(job: JobListing, resume: ResumeData): Promise<JobMatch> {
  const anthropic = getClient();

  // Log what we're sending for debugging
  const descPreview = job.description ? job.description.substring(0, 100) + '...' : 'EMPTY';
  logger.debug(`  Description preview: ${descPreview}`);

  const prompt = `You are an expert job application analyst helping a candidate find suitable positions.

## Candidate's Resume
${resume.rawText}

## Job Posting
**Title:** ${job.title}
**Company:** ${job.company}
**Location:** ${job.location || 'Remote/Flexible'}
${job.salary ? `**Salary:** ${job.salary}` : ''}
${job.jobType ? `**Type:** ${job.jobType}` : ''}

**Description:**
${job.description || 'No detailed description available - base your analysis primarily on the job title.'}

**Requirements:**
${job.requirements.length > 0 ? job.requirements.map((r) => `- ${r}`).join('\n') : 'No specific requirements listed - infer from job title.'}

## Scoring Guidelines
- If the job title clearly matches the candidate's skills (e.g., "Full Stack Engineer" matches a full-stack developer resume), give a BASE score of 60-70 even without detailed description
- Focus on JOB TITLE alignment as the primary factor when description is limited
- Technical skill matches should boost the score significantly
- Only give low scores (<50) if there's clear evidence of mismatch

## Your Task
Score from 0-100 and explain briefly.

Respond in this exact JSON format:
{
  "score": <number 0-100>,
  "reasoning": "<1-2 sentence explanation>",
  "keyMatches": ["<match1>", "<match2>", "<match3>"],
  "concerns": ["<concern1>", "<concern2>"]
}

Respond with ONLY the JSON, no other text.`;

  logger.action(`>>> CALLING CLAUDE API for job: ${job.title}`);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  logger.debug('<<< CLAUDE API response received');

  // Parse response
  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    // Extract JSON from response (handle potential markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      job,
      score: Math.min(100, Math.max(0, analysis.score)),
      reasoning: analysis.reasoning || '',
      keyMatches: analysis.keyMatches || [],
      concerns: analysis.concerns || [],
    };
  } catch (parseError) {
    logger.debug(`Failed to parse AI response: ${responseText}`);
    // Fallback: try to extract a score from the text
    const scoreMatch = responseText.match(/score["\s:]+(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;

    return {
      job,
      score,
      reasoning: responseText.substring(0, 200),
      keyMatches: [],
      concerns: ['Could not fully parse AI analysis'],
    };
  }
}

/**
 * Analyze a single job fit - exported for use in integrated flow
 */
export async function analyzeJobFitSingle(
  job: JobListing,
  resume: ResumeData
): Promise<JobMatch> {
  return analyzeJobFit(job, resume);
}

// Batch analyze for efficiency (if many jobs)
export async function batchAnalyzeJobs(
  jobs: JobListing[],
  resume: ResumeData,
  batchSize = 5
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();

  // Process in batches
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);

    logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}...`);

    const batchPromises = batch.map((job) =>
      analyzeJobFit(job, resume)
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
