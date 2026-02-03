import express from 'express';
import { randomUUID } from 'crypto';
import { runBot } from './bot.js';
import { logger } from './utils/logger.js';

type JobStatus = 'running' | 'completed' | 'failed' | 'terminated';

type Job = {
  id: string;
  status: JobStatus;
  logs: string[];
  listeners: Set<{ send: (event: string, data: string) => void; end: () => void }>;
  controller: AbortController;
};

const app = express();
app.use(express.json({ limit: '1mb' }));

const jobs = new Map<string, Job>();
const runningJobs = new Set<string>();
const maxConcurrentJobs = (() => {
  const raw = process.env.MAX_CONCURRENT_JOBS ?? '3';
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
})();

function pushLog(job: Job, line: string): void {
  job.logs.push(line);
  for (const listener of job.listeners) {
    listener.send('log', line);
  }
}

function pushStatus(job: Job, status: string): void {
  for (const listener of job.listeners) {
    listener.send('status', status);
    if (status === 'terminated') {
      listener.end();
    }
  }
}

function startLogSink(job: Job): void {
  logger.addLogSink(job.id, (entry) => {
    pushLog(job, entry.message);
  });
}

function stopLogSink(job: Job): void {
  logger.removeLogSink(job.id);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/jobs/start', async (req, res) => {
  if (runningJobs.size >= maxConcurrentJobs) {
    return res.status(429).json({
      error: `Worker at capacity (${maxConcurrentJobs} concurrent jobs).`,
    });
  }

  const { email, password, jobUrl, maxApplications, headless, dryRun } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing Snaphunt credentials.' });
  }

  const job: Job = {
    id: randomUUID(),
    status: 'running',
    logs: [],
    listeners: new Set(),
    controller: new AbortController(),
  };

  jobs.set(job.id, job);
  runningJobs.add(job.id);
  startLogSink(job);

  pushLog(job, 'Job started.');

  const parsedMaxApplications = (() => {
    if (typeof maxApplications === 'number') return maxApplications;
    if (typeof maxApplications === 'string') {
      const parsed = Number.parseInt(maxApplications, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  })();

  logger.withJobContext(job.id, () => {
    runBot({
      jobListingUrl: jobUrl || 'https://snaphunt.com/job-listing',
      maxApplications: parsedMaxApplications,
      headless: typeof headless === 'boolean' ? headless : true,
      dryRun: typeof dryRun === 'boolean' ? dryRun : false,
      snaphuntEmail: email,
      snaphuntPassword: password,
      signal: job.controller.signal,
    })
      .then(() => {
        job.status = job.controller.signal.aborted ? 'terminated' : 'completed';
        pushLog(job, 'Job terminated successfully.');
        pushStatus(job, 'terminated');
      })
      .catch((error) => {
        job.status = job.controller.signal.aborted ? 'terminated' : 'failed';
        pushLog(job, `Job failed: ${error instanceof Error ? error.message : String(error)}`);
        pushLog(job, 'Job terminated successfully.');
        pushStatus(job, 'terminated');
      })
      .finally(() => {
        stopLogSink(job);
        runningJobs.delete(job.id);
      });
  });

  return res.status(202).json({ jobId: job.id });
});

app.get('/jobs/:id/stream', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const send = (event: string, data: string) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${data.replace(/\n/g, '\\n')}\n\n`);
  };

  for (const line of job.logs) {
    send('log', line);
  }

  let ended = false;
  const listener = {
    send: (event: string, data: string) => send(event, data),
    end: () => {
      if (ended) return;
      ended = true;
      job.listeners.delete(listener);
      res.end();
    },
  };
  job.listeners.add(listener);

  req.on('close', () => {
    if (!ended) {
      job.listeners.delete(listener);
    }
  });
});

app.post('/jobs/:id/end', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (job.status !== 'running') {
    return res.status(409).json({ error: `Job is ${job.status}.` });
  }

  job.controller.abort();
  pushLog(job, 'Termination requested.');

  return res.status(202).json({ ok: true });
});

const port = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(port, () => {
  console.log(`Worker listening on :${port}`);
});
