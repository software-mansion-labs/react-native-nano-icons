import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  buildAllFonts,
  IconSetBuildError,
  type BuiltFont,
  type IconSetConfig,
  type NanoLogger,
  type PreparedSvgCache,
  SvgWorkerPool,
} from '../cli/index';

export const FONT_ROUTE = '/__nanoicons/';

const REBUILD_DEBOUNCE_MS = 50;
const ADDED_FILES_SETTLE_MS = 250;
const MAX_LISTED_CHANGES = 3;

const WEB_PLATFORM = /[?&]platform=web(?:&|$)/;

const CHANGE_LABEL = { add: 'added', change: 'changed', delete: 'removed' };

function setName(set: IconSetConfig): string {
  return set.fontFamily ?? path.basename(set.inputDir);
}

function summarize(changes: string[]): string {
  const listed = changes.slice(0, MAX_LISTED_CHANGES).join(', ');
  const rest = changes.length - MAX_LISTED_CHANGES;
  return rest > 0 ? `${listed} and ${rest} more` : listed;
}

export type WatchEvent = {
  filePath: string;
  type: 'add' | 'change' | 'delete';
};

export type FileWatcher = {
  on(
    event: 'change',
    listener: (change: { eventsQueue: WatchEvent[] }) => void
  ): unknown;
};

export type Next = (err?: unknown) => void;

export type DevLogger = NanoLogger & { notify(msg: string): void };

export class FontRebuildWatcher {
  private readonly setsByInputDir = new Map<string, IconSetConfig>();
  private readonly fontsByFamily = new Map<string, BuiltFont>();
  private readonly dirty = new Map<IconSetConfig, string[]>();
  private readonly preparedSvgCache: PreparedSvgCache = new Map();
  private readonly svgWorkerPool = new SvgWorkerPool();
  private webDetected = false;
  private pending: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private settleMs = REBUILD_DEBOUNCE_MS;

  constructor(
    private readonly projectRoot: string,
    iconSets: IconSetConfig[],
    watcher: FileWatcher,
    private readonly logger: DevLogger
  ) {
    for (const set of iconSets) {
      this.setsByInputDir.set(path.resolve(projectRoot, set.inputDir), set);
    }
    watcher.on('change', ({ eventsQueue }) => this.onChange(eventsQueue));
    this.schedule(iconSets);
  }

  get build(): Promise<void> {
    return this.pending;
  }

  fontFor(family: string): BuiltFont | undefined {
    return this.fontsByFamily.get(family);
  }

  private onChange(events: WatchEvent[]): void {
    for (const event of events) {
      if (!event.filePath.toLowerCase().endsWith('.svg')) continue;
      const set = this.setsByInputDir.get(path.dirname(event.filePath));
      if (!set) continue;
      if (event.type === 'add') this.settleMs = ADDED_FILES_SETTLE_MS;
      this.schedule(
        [set],
        `${path.basename(event.filePath)} ${CHANGE_LABEL[event.type]}`
      );
    }
  }

  private schedule(sets: IconSetConfig[], change?: string): void {
    for (const set of sets) {
      const changes = this.dirty.get(set) ?? [];
      if (change) changes.push(change);
      this.dirty.set(set, changes);
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.settleMs);
  }

  private flush(): void {
    this.timer = undefined;
    this.settleMs = REBUILD_DEBOUNCE_MS;
    this.pending = this.pending.then(() => this.rebuildDirty());
  }

  private async rebuildDirty(): Promise<void> {
    const sets = [...this.dirty.keys()];
    for (const [set, changes] of this.dirty) {
      if (changes.length) {
        this.logger.notify(
          `${setName(set)}: ${summarize(changes)}, rebuilding…`
        );
      }
    }
    this.dirty.clear();
    if (!sets.length) return;

    let built: BuiltFont[];
    try {
      built = await buildAllFonts(sets, this.projectRoot, {
        logger: this.logger,
        keepOutputsOnFailure: true,
        preparedSvgCache: this.preparedSvgCache,
        svgWorkerPool: this.svgWorkerPool,
        withWeb: this.webDetected,
      });
    } catch (err) {
      if (!(err instanceof IconSetBuildError)) {
        this.logger.fail(err instanceof Error ? err.message : String(err));
        return;
      }
      built = err.built;
    }

    for (const font of built) {
      for (const [family, previous] of this.fontsByFamily) {
        if (previous.fontFamily === font.fontFamily) {
          this.fontsByFamily.delete(family);
        }
      }
      this.fontsByFamily.set(font.family, font);
    }
  }

  middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: Next
  ): void => {
    const url = req.url ?? '';
    if (!this.webDetected && WEB_PLATFORM.test(url)) {
      this.webDetected = true;
      this.schedule(
        [...this.setsByInputDir.values()].filter((set) => set.web),
        'web bundle requested'
      );
    }
    const isFontRequest =
      url.startsWith(FONT_ROUTE) &&
      (req.method === 'GET' || req.method === 'HEAD');
    if (!isFontRequest) {
      next();
      return;
    }

    const family = decodeURIComponent(
      url.slice(FONT_ROUTE.length).replace(/\.ttf(\?.*)?$/, '')
    );

    void this.pending.then(() => {
      const font = this.fontsByFamily.get(family);
      if (!font || !fs.existsSync(font.ttfPath)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(font.ttfPath).pipe(res);
    });
  };
}
