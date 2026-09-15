export const LOG_PREFIX = '🔬 react-native-nano-icons';

export function warnRuntime(message: string, ...rest: unknown[]): void {
  console.warn(`${LOG_PREFIX} ⚠ ${message}`, ...rest);
}

export function errorRuntime(message: string): void {
  console.error(`${LOG_PREFIX} ✖ ${message}`);
}

export function runtimeError(message: string): Error {
  return new Error(`${LOG_PREFIX} ✖ ${message}`);
}
