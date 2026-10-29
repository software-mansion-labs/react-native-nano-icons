import type { StaleSet } from '../../cli/index';

export function frozenScope(
  frozen: boolean | undefined
): 'all' | 'existing' | 'none' {
  if (frozen !== undefined) return frozen ? 'all' : 'none';
  const ci = process.env.CI?.toLowerCase();
  return ci && ci !== 'false' && ci !== '0' ? 'existing' : 'none';
}

export function failFrozenPrebuild(stale: StaleSet[]): void {
  if (!stale.length) return;
  const sets = stale
    .map(({ name, reason }) => `${name} (${reason})`)
    .join(', ');
  throw new Error(
    `[react-native-nano-icons] frozen is on, but ${
      stale.length === 1 ? '1 set is' : `${stale.length} sets are`
    } out of date: ${sets}. Rebuild them without frozen, e.g. with a local prebuild, and commit the generated files.`
  );
}
