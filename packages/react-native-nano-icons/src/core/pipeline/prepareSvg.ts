import type { PathKitModule } from '../pathkit/types';
import { prepareIcon, type IconResult, type IconTask } from './prepareIcon';
import {
  prepareSymbol,
  type SymbolResult,
  type SymbolTask,
} from './prepareSymbol';

export type SvgPrepareTask = IconTask | SymbolTask;

export type SvgPrepareResult<T extends SvgPrepareTask> = T extends IconTask
  ? IconResult
  : SymbolResult;

export function prepareSvg<T extends SvgPrepareTask>(
  task: T,
  pathkit: PathKitModule
): Promise<SvgPrepareResult<T>> {
  const result =
    task.kind === 'font'
      ? prepareIcon(task, pathkit)
      : prepareSymbol(task, pathkit);
  return result as Promise<SvgPrepareResult<T>>;
}
