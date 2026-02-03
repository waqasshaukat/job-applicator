/**
 * Colored console logger for demo visibility
 */
import { AsyncLocalStorage } from 'async_hooks';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function formatMessage(prefix: string, color: string, message: string): string {
  return `${colors.dim}[${timestamp()}]${colors.reset} ${color}${prefix}${colors.reset} ${message}`;
}

type LogSink = (entry: { level: string; message: string; timestamp: string }) => void;

const logSinks = new Map<string, LogSink>();
const logContext = new AsyncLocalStorage<{ jobId: string }>();

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

function emit(level: string, formatted: string): void {
  const context = logContext.getStore();
  if (!context) return;
  const logSink = logSinks.get(context.jobId);
  if (!logSink) return;
  const ts = timestamp();
  const lines = stripAnsi(formatted).split('\n');
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.length === 0) continue;
    logSink({ level, message: trimmed, timestamp: ts });
  }
}

function print(level: string, formatted: string): void {
  console.log(formatted);
  emit(level, formatted);
}

export const logger = {
  addLogSink(jobId: string, sink: LogSink): void {
    logSinks.set(jobId, sink);
  },

  removeLogSink(jobId: string): void {
    logSinks.delete(jobId);
  },

  withJobContext<T>(jobId: string, fn: () => T): T {
    return logContext.run({ jobId }, fn);
  },

  // General info
  info(message: string): void {
    print('info', formatMessage('INFO', colors.blue, message));
  },

  // Success messages
  success(message: string): void {
    print('success', formatMessage('SUCCESS', colors.green, message));
  },

  // Warning messages
  warn(message: string): void {
    print('warn', formatMessage('WARN', colors.yellow, message));
  },

  // Error messages
  error(message: string): void {
    print('error', formatMessage('ERROR', colors.red, message));
  },

  // Debug messages
  debug(message: string): void {
    print('debug', formatMessage('DEBUG', colors.dim, message));
  },

  // Bot action messages (for demo visibility)
  action(message: string): void {
    print('action', formatMessage('BOT', colors.cyan + colors.bright, message));
  },

  // Job-related messages
  job(message: string): void {
    print('job', formatMessage('JOB', colors.magenta, message));
  },

  // Match score display
  match(jobTitle: string, company: string, score: number): void {
    const scoreColor = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
    const scoreBar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));
    const formatted =
      `${colors.dim}[${timestamp()}]${colors.reset} ${colors.magenta}MATCH${colors.reset} ` +
        `${colors.bright}${jobTitle}${colors.reset} at ${company}\n` +
        `         ${scoreColor}${scoreBar} ${score}%${colors.reset}`;
    print('match', formatted);
  },

  // Application status
  application(jobTitle: string, status: 'applying' | 'success' | 'failed' | 'skipped'): void {
    const statusColors: Record<string, string> = {
      applying: colors.yellow,
      success: colors.green,
      failed: colors.red,
      skipped: colors.dim,
    };
    const statusText = status.toUpperCase().padEnd(8);
    print('apply', formatMessage('APPLY', statusColors[status], `${statusText} ${jobTitle}`));
  },

  // Section divider
  divider(title?: string): void {
    const line = '─'.repeat(50);
    if (title) {
      print('divider', `\n${colors.dim}${line}${colors.reset}`);
      print('divider', `${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
      print('divider', `${colors.dim}${line}${colors.reset}\n`);
    } else {
      print('divider', `${colors.dim}${line}${colors.reset}`);
    }
  },

  // Summary box
  summary(stats: {
    totalJobs: number;
    filteredJobs?: number;
    matchedJobs: number;
    applied: number;
    failed: number;
  }): void {
    print('summary', `\n${colors.bgBlue}${colors.white}${colors.bright} SUMMARY ${colors.reset}`);
    print('summary', `${colors.cyan}  Total jobs found:${colors.reset}     ${stats.totalJobs}`);
    if (stats.filteredJobs !== undefined) {
      print('summary', `${colors.cyan}  Jobs in your niche:${colors.reset}   ${stats.filteredJobs}`);
    }
    print('summary', `${colors.cyan}  AI matched jobs:${colors.reset}      ${stats.matchedJobs}`);
    print('summary', `${colors.green}  Successfully applied:${colors.reset} ${stats.applied}`);
    if (stats.failed > 0) {
      print('summary', `${colors.red}  Failed applications:${colors.reset}  ${stats.failed}`);
    }
    print('summary', '');
  },

  // Startup banner
  banner(): void {
    print('banner', `
${colors.cyan}${colors.bright}
   ╔═══════════════════════════════════════════╗
   ║       🤖 Job Application Bot v1.0         ║
   ║     AI-Powered • Human-Like Behavior      ║
   ╚═══════════════════════════════════════════╝
${colors.reset}`);
  },
};
