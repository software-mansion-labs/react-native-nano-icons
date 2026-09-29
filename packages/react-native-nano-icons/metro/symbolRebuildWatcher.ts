import path from 'node:path';
import {
  buildAllSymbols,
  linkBareAndroidDrawables,
  linkBareSymbols,
  SymbolSetBuildError,
  type PreparedSvgCache,
  type SvgWorkerPool,
  type SymbolSetConfig,
} from '../cli/index';
import type { SymbolTask } from '../src/core/pipeline/prepareSymbol';
import {
  ADDED_FILES_SETTLE_MS,
  CHANGE_LABEL,
  REBUILD_DEBOUNCE_MS,
  summarize,
  toWatchEvents,
  type DevLogger,
  type FileWatcher,
  type WatchEvent,
} from './fontRebuildWatcher';

export class SymbolRebuildWatcher {
  private readonly inputDirs: Set<string>;
  private readonly preparedSvgCache: PreparedSvgCache<SymbolTask> = new Map();
  private changes: string[] = [];
  private pending: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private settleMs = REBUILD_DEBOUNCE_MS;

  constructor(
    private readonly projectRoot: string,
    private readonly symbolSets: SymbolSetConfig[],
    watcher: FileWatcher,
    private readonly logger: DevLogger,
    private readonly svgWorkerPool: SvgWorkerPool
  ) {
    this.inputDirs = new Set(
      symbolSets.map((set) => path.resolve(projectRoot, set.inputDir))
    );
    watcher.on('change', (change) => this.onChange(toWatchEvents(change)));
  }

  get build(): Promise<void> {
    return this.pending;
  }

  private onChange(events: WatchEvent[]): void {
    for (const event of events) {
      if (!event.filePath.toLowerCase().endsWith('.svg')) continue;
      if (!this.inputDirs.has(path.dirname(event.filePath))) continue;
      if (event.type === 'add') this.settleMs = ADDED_FILES_SETTLE_MS;
      this.changes.push(
        `${path.basename(event.filePath)} ${CHANGE_LABEL[event.type]}`
      );
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.settleMs);
    }
  }

  private flush(): void {
    this.timer = undefined;
    this.settleMs = REBUILD_DEBOUNCE_MS;
    const changes = this.changes.splice(0);
    this.pending = this.pending.then(() => this.rebuild(changes));
  }

  private async rebuild(changes: string[]): Promise<void> {
    this.logger.notify(`Symbols: ${summarize(changes)}, rebuilding…`);
    try {
      const built = await buildAllSymbols(this.symbolSets, this.projectRoot, {
        logger: this.logger,
        keepOutputsOnFailure: true,
        preparedSvgCache: this.preparedSvgCache,
        svgWorkerPool: this.svgWorkerPool,
      });
      await linkBareSymbols(this.projectRoot, built, this.logger);
      await linkBareAndroidDrawables(this.projectRoot, built, this.logger);
      this.logger.warn(
        'Native symbols changed. Rebuild the native app to see them.'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof SymbolSetBuildError) {
        this.logger.warn(`${message}. Native symbols were not relinked.`);
      } else {
        this.logger.fail(message);
      }
    }
  }
}
