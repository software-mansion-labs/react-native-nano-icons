export type LogLevel = 'normal' | 'verbose';

export type NanoLogger = {
  start: (msg: string) => void;
  update: (msg: string) => void;
  succeed: (msg: string) => void;
  fail: (msg: string) => void;
  /** Only printed when level is 'verbose'. */
  info: (msg: string) => void;
  warn: (msg: string) => void;
};

const PREFIX = '🔬 react-native-nano-icons';

/**
 * Create an ora spinner-backed logger.
 * ora and chalk are ESM-only so they are loaded via dynamic import;
 * this factory must be awaited once before use.
 */
export async function createOraLogger(level: LogLevel): Promise<NanoLogger> {
  const [{ default: ora }, { default: chalk }] = await Promise.all([
    import('ora'),
    import('chalk'),
  ]);

  const spinner = ora({ prefixText: chalk.dim(PREFIX) });
  const dimPrefix = chalk.dim(`  ℹ  `);

  return {
    start(msg) {
      spinner.start(msg);
    },
    update(msg) {
      spinner.text = msg;
    },
    succeed(msg) {
      spinner.succeed(msg);
    },
    fail(msg) {
      spinner.fail(chalk.red(msg));
    },
    info(msg) {
      if (level === 'verbose') {
        // Print below the current spinner without disrupting it
        process.stdout.write(`\n${dimPrefix}${chalk.dim(msg)}`);
      }
    },
    warn(msg) {
      spinner.warn(chalk.yellow(msg));
    },
  };
}

/**
 * Infer log level from the Expo CLI environment.
 * Expo uses EXPO_DEBUG=1 for verbose/debug output.
 */
export function detectExpoLogLevel(): LogLevel {
  return process.env['EXPO_DEBUG'] ? 'verbose' : 'normal';
}
