/**
 * Colored console logger for demo visibility
 */

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

export const logger = {
  // General info
  info(message: string): void {
    console.log(formatMessage('INFO', colors.blue, message));
  },

  // Success messages
  success(message: string): void {
    console.log(formatMessage('SUCCESS', colors.green, message));
  },

  // Warning messages
  warn(message: string): void {
    console.log(formatMessage('WARN', colors.yellow, message));
  },

  // Error messages
  error(message: string): void {
    console.log(formatMessage('ERROR', colors.red, message));
  },

  // Debug messages
  debug(message: string): void {
    console.log(formatMessage('DEBUG', colors.dim, message));
  },

  // Bot action messages (for demo visibility)
  action(message: string): void {
    console.log(formatMessage('BOT', colors.cyan + colors.bright, message));
  },

  // Job-related messages
  job(message: string): void {
    console.log(formatMessage('JOB', colors.magenta, message));
  },

  // Match score display
  match(jobTitle: string, company: string, score: number): void {
    const scoreColor = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
    const scoreBar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));
    console.log(
      `${colors.dim}[${timestamp()}]${colors.reset} ${colors.magenta}MATCH${colors.reset} ` +
        `${colors.bright}${jobTitle}${colors.reset} at ${company}\n` +
        `         ${scoreColor}${scoreBar} ${score}%${colors.reset}`
    );
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
    console.log(
      formatMessage('APPLY', statusColors[status], `${statusText} ${jobTitle}`)
    );
  },

  // Section divider
  divider(title?: string): void {
    const line = '─'.repeat(50);
    if (title) {
      console.log(`\n${colors.dim}${line}${colors.reset}`);
      console.log(`${colors.bright}${colors.cyan}  ${title}${colors.reset}`);
      console.log(`${colors.dim}${line}${colors.reset}\n`);
    } else {
      console.log(`${colors.dim}${line}${colors.reset}`);
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
    console.log(`\n${colors.bgBlue}${colors.white}${colors.bright} SUMMARY ${colors.reset}`);
    console.log(`${colors.cyan}  Total jobs found:${colors.reset}     ${stats.totalJobs}`);
    if (stats.filteredJobs !== undefined) {
      console.log(`${colors.cyan}  Jobs in your niche:${colors.reset}   ${stats.filteredJobs}`);
    }
    console.log(`${colors.cyan}  AI matched jobs:${colors.reset}      ${stats.matchedJobs}`);
    console.log(`${colors.green}  Successfully applied:${colors.reset} ${stats.applied}`);
    if (stats.failed > 0) {
      console.log(`${colors.red}  Failed applications:${colors.reset}  ${stats.failed}`);
    }
    console.log('');
  },

  // Startup banner
  banner(): void {
    console.log(`
${colors.cyan}${colors.bright}
   ╔═══════════════════════════════════════════╗
   ║       🤖 Job Application Bot v1.0         ║
   ║     AI-Powered • Human-Like Behavior      ║
   ╚═══════════════════════════════════════════╝
${colors.reset}`);
  },
};
