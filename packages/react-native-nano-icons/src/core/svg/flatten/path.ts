// Ported from picosvg svg_meta.py, svg_path_iter.py and the SVGPath command
// machinery of svg_types.py (Apache-2.0, Copyright 2020 Google LLC)

import type { Pt } from './geometry.js';
import { ntos, pt, ptAlmostEquals, ptEquals, pythonRound } from './geometry.js';
import { arcToCubic } from './arcs.js';

export type SvgCommand = [cmd: string, args: number[]];

// https://www.w3.org/TR/SVG11/paths.html#PathData
const CMD_ARGS: Record<string, number> = {
  m: 2,
  z: 0,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
};
for (const [k, v] of Object.entries(CMD_ARGS)) {
  CMD_ARGS[k.toUpperCase()] = v;
}

// per command: indices of x coords and of y coords within the args
const CMD_COORDS: Record<string, [number[], number[]]> = {
  m: [[0], [1]],
  z: [[], []],
  l: [[0], [1]],
  h: [[0], []],
  v: [[], [0]],
  c: [
    [0, 2, 4],
    [1, 3, 5],
  ],
  s: [
    [0, 2],
    [1, 3],
  ],
  q: [
    [0, 2],
    [1, 3],
  ],
  t: [[0], [1]],
  a: [[5], [6]],
};
for (const [k, v] of Object.entries(CMD_COORDS)) {
  CMD_COORDS[k.toUpperCase()] = v;
}

export function numArgs(cmd: string): number {
  const n = CMD_ARGS[cmd];
  if (n === undefined) {
    throw new Error(`Invalid svg command "${cmd}"`);
  }
  return n;
}

export function checkCmd(cmd: string, args: readonly number[]): number {
  const cmdArgs = numArgs(cmd);
  if (cmdArgs === 0) {
    if (args.length) {
      throw new Error(`${cmd} has no args, ${args.length} invalid`);
    }
  } else if (args.length % cmdArgs !== 0) {
    throw new Error(
      `${cmd} has sets of ${cmdArgs} args, ${args.length} invalid`
    );
  }
  return cmdArgs;
}

export function cmdCoords(cmd: string): [number[], number[]] {
  const coords = CMD_COORDS[cmd];
  if (coords === undefined) {
    throw new Error(`Invalid svg command "${cmd}"`);
  }
  return coords;
}

export { ntos } from './geometry.js';

export function numberOrPercentage(s: string, scale = 1): number {
  return s.endsWith('%')
    ? (parseFloat(s.slice(0, -1)) / 100) * scale
    : parseFloat(s);
}

export function pathSegment(cmd: string, ...args: number[]): string {
  // put commas between coords, spaces otherwise, author readability pref
  const argsPerCmd = checkCmd(cmd, args);
  const strArgs = args.map(ntos);
  const combinedArgs: string[] = [];
  const [xCoords, yCoords] = cmdCoords(cmd);
  const xyCoords = new Set(
    xCoords.map((x, i) => `${x},${yCoords[i]}`).slice(0, yCoords.length)
  );
  if (argsPerCmd) {
    for (let n = 0; n < strArgs.length / argsPerCmd; n++) {
      const subArgs = strArgs.slice(n * argsPerCmd, (n + 1) * argsPerCmd);
      let i = 0;
      while (i < subArgs.length) {
        if (xyCoords.has(`${i},${i + 1}`)) {
          combinedArgs.push(`${subArgs[i]},${subArgs[i + 1]}`);
          i += 2;
        } else {
          combinedArgs.push(subArgs[i]!);
          i += 1;
        }
      }
    }
  }
  return cmd + combinedArgs.join(' ');
}

// ---- d-string parsing (svg_path_iter.py) ----

const CMD_RE = /([mzlhvcsqtaMZLHVCSQTA])/;
const SEPARATOR_RE = /[, ]+/;
const FLOAT_RE = new RegExp(
  '^[-+]?' +
    '(?:' +
    '(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?' + // int or float
    '|' +
    '(?:\\.[0-9]+)' + // float with leading dot (e.g. '.42')
    ')' +
    '(?:[eE][-+]?[0-9]+)?' // optional scientific notation
);
const BOOL_RE = /^[01]/;
// arc args: rx ry x-rotation large-arc-flag sweep-flag x y
const ARC_ARGUMENT_TYPES: RegExp[] = [
  FLOAT_RE,
  FLOAT_RE,
  FLOAT_RE,
  BOOL_RE,
  BOOL_RE,
  FLOAT_RE,
  FLOAT_RE,
];

// https://www.w3.org/TR/SVG11/paths.html#PathDataMovetoCommands
// If a moveto is followed by multiple pairs of coordinates,
// the subsequent pairs are treated as implicit lineto commands
const IMPLICIT_REPEAT_CMD: Record<string, string> = { m: 'l', M: 'L' };

function parseArgs(cmd: string, rawArgsStr: string): number[] {
  const rawArgs = rawArgsStr.split(SEPARATOR_RE).filter((s) => s);
  const result: number[] = [];
  if (!rawArgs.length) {
    return result;
  }

  const argTypes = cmd.toUpperCase() === 'A' ? ARC_ARGUMENT_TYPES : [FLOAT_RE];
  const n = argTypes.length;

  let i = 0;
  let j = 0;
  while (j < rawArgs.length) {
    const arg = rawArgs[j]!;
    // modulo to wrap around
    const regex = argTypes[i % n]!;
    const m = regex.exec(arg);
    if (!m) {
      throw new Error(`Invalid argument #${i} for '${cmd}': ${arg}`);
    }

    const end = m[0]!.length;
    result.push(parseFloat(arg.slice(0, end)));

    if (end < arg.length) {
      rawArgs[j] = arg.slice(end);
    } else {
      j += 1;
    }
    i += 1;
  }
  return result;
}

function explodeCmd(
  argsPerCmd: number,
  cmd: string,
  args: readonly number[]
): SvgCommand[] {
  const cmds: SvgCommand[] = [];
  for (let i = 0; i < Math.floor(args.length / argsPerCmd); i++) {
    if (i > 0) {
      cmd = IMPLICIT_REPEAT_CMD[cmd] ?? cmd;
    }
    cmds.push([cmd, args.slice(i * argsPerCmd, (i + 1) * argsPerCmd)]);
  }
  return cmds;
}

// Exploded means repeated params are reported as separate commands,
// e.g. "M1,1 2,2 3,3" yields three steps when exploded.
export function parseSvgPath(svgPath: string, exploded = false): SvgCommand[] {
  const commandTuples: SvgCommand[] = [];
  const parts = svgPath.split(CMD_RE).slice(1);
  for (let i = 0; i < parts.length; i += 2) {
    const cmd = parts[i]!;
    const rawArgs = (parts[i + 1] ?? '').trim();

    const args = parseArgs(cmd, rawArgs);

    const argsPerCmd = checkCmd(cmd, args);
    if (argsPerCmd === 0 || !exploded) {
      commandTuples.push([cmd, args]);
    } else {
      commandTuples.push(...explodeCmd(argsPerCmd, cmd, args));
    }
  }
  return commandTuples;
}

// ---- SVGPath command machinery (svg_types.py) ----

export function addCmdToD(d: string, cmd: string, args: number[]): string {
  const snippet = pathSegment(cmd, ...args);
  return d ? `${d} ${snippet}` : snippet;
}

export function buildD(cmds: Iterable<SvgCommand>): string {
  let d = '';
  for (const [cmd, args] of cmds) {
    d = addCmdToD(d, cmd, args);
  }
  return d;
}

function nextPos(currPos: Pt, cmd: string, cmdArgs: readonly number[]): Pt {
  const [xCoordIdxs, yCoordIdxs] = cmdCoords(cmd);
  let newX = currPos.x;
  let newY = currPos.y;
  if (cmd === cmd.toUpperCase()) {
    if (xCoordIdxs.length) {
      newX = 0;
    }
    if (yCoordIdxs.length) {
      newY = 0;
    }
  }

  if (xCoordIdxs.length) {
    newX += cmdArgs[xCoordIdxs[xCoordIdxs.length - 1]!]!;
  }
  if (yCoordIdxs.length) {
    newY += cmdArgs[yCoordIdxs[yCoordIdxs.length - 1]!]!;
  }

  return pt(newX, newY);
}

type ExplicitLine = SvgCommand;

function explicitLinesCallback(
  _subpathStart: Pt | null,
  currPos: Pt,
  cmd: string,
  args: readonly number[]
): ExplicitLine[] {
  let newArgs: number[];
  if (cmd === 'v') {
    newArgs = [0, args[0]!];
  } else if (cmd === 'V') {
    newArgs = [currPos.x, args[0]!];
  } else if (cmd === 'h') {
    newArgs = [args[0]!, 0];
  } else if (cmd === 'H') {
    newArgs = [args[0]!, currPos.y];
  } else {
    return [[cmd, [...args]]]; // nothing changes
  }

  return [[cmd === cmd.toLowerCase() ? 'l' : 'L', newArgs]];
}

function rewriteCoords(
  cmdConverter: (cmd: string) => string,
  coordConverter: (scaler: number) => number,
  currPos: Pt,
  cmd: string,
  args: readonly number[]
): SvgCommand {
  const [xCoordIdxs, yCoordIdxs] = cmdCoords(cmd);
  const desiredCmd = cmdConverter(cmd);
  const newArgs = [...args];
  if (cmd !== desiredCmd) {
    cmd = desiredCmd;
    for (const xCoordIdx of xCoordIdxs) {
      newArgs[xCoordIdx]! += coordConverter(currPos.x);
    }
    for (const yCoordIdx of yCoordIdxs) {
      newArgs[yCoordIdx]! += coordConverter(currPos.y);
    }
  }
  return [cmd, newArgs];
}

function relativeToAbsolute(
  currPos: Pt,
  cmd: string,
  args: readonly number[]
): SvgCommand {
  return rewriteCoords(
    (c) => c.toUpperCase(),
    (scaler) => scaler,
    currPos,
    cmd,
    args
  );
}

function moveEndpoint(
  currPos: Pt,
  cmd: string,
  cmdArgs: readonly number[],
  newEndpoint: Pt
): SvgCommand {
  // we need to be able to alter both axes
  const [[newCmd, newArgs]] = explicitLinesCallback(
    null,
    currPos,
    cmd,
    cmdArgs
  ) as [SvgCommand];
  cmd = newCmd;
  const args = [...newArgs];

  const [xCoordIdxs, yCoordIdxs] = cmdCoords(cmd);
  if (xCoordIdxs.length || yCoordIdxs.length) {
    let { x: newX, y: newY } = newEndpoint;
    if (cmd === cmd.toLowerCase()) {
      newX = newX - currPos.x;
      newY = newY - currPos.y;
    }
    args[xCoordIdxs[xCoordIdxs.length - 1]!] = newX;
    args[yCoordIdxs[yCoordIdxs.length - 1]!] = newY;
  }

  return [cmd, args];
}

export type WalkCallback = (
  subpathStart: Pt,
  currPos: Pt,
  cmd: string,
  args: number[],
  prevPos: Pt | null,
  prevCmd: string | null,
  prevArgs: number[] | null
) => Iterable<SvgCommand>;

// Walk path and call callback to build potentially new commands.
// https://www.w3.org/TR/SVG11/paths.html
export function walkPath(d: string, callback: WalkCallback): string {
  let currPos = pt();
  let subpathStartPos = currPos; // where a z will take you
  const newCmds: Array<[Pt, string, number[]]> = [];

  // iteration gives us exploded commands
  const exploded = parseSvgPath(d, true);
  for (let idx = 0; idx < exploded.length; idx++) {
    // eslint-disable-next-line prefer-const
    let [cmd, args] = exploded[idx]!;
    checkCmd(cmd, args);
    if (idx === 0 && cmd === 'm') {
      cmd = 'M';
    }

    let prev: [Pt | null, string | null, number[] | null] = [null, null, null];
    if (newCmds.length) {
      prev = newCmds[newCmds.length - 1]!;
    }
    for (const [newCmd, newCmdArgs] of callback(
      subpathStartPos,
      currPos,
      cmd,
      args,
      ...prev
    )) {
      let next: Pt;
      if (newCmd.toLowerCase() !== 'z') {
        next = nextPos(currPos, newCmd, newCmdArgs);
      } else {
        next = subpathStartPos;
      }

      const prevPos = currPos;
      currPos = next;
      if (newCmd.toUpperCase() === 'M') {
        subpathStartPos = currPos;
      }
      newCmds.push([prevPos, newCmd, newCmdArgs]);
    }
  }

  let newD = '';
  for (const [, cmd, args] of newCmds) {
    newD = addCmdToD(newD, cmd, args);
  }
  return newD;
}

function rewritePath(
  d: string,
  rewriteFn: (currPos: Pt, cmd: string, args: readonly number[]) => SvgCommand
): string {
  return walkPath(d, (subpathStart, currPos, cmd, args) => {
    let [newCmd, newCmdArgs] = rewriteFn(currPos, cmd, args);

    // if we modified cmd to pass *very* close to subpath start snap to it
    // eliminates issues with not-quite-closed shapes due float imprecision
    const next = nextPos(currPos, newCmd, newCmdArgs);
    if (!ptEquals(next, subpathStart) && ptAlmostEquals(next, subpathStart)) {
      [newCmd, newCmdArgs] = moveEndpoint(
        currPos,
        newCmd,
        newCmdArgs,
        subpathStart
      );
    }
    return [[newCmd, newCmdArgs]];
  });
}

// equivalent path with only absolute commands
export function absolutePath(d: string): string {
  return rewritePath(d, relativeToAbsolute);
}

// equivalent path with absolute moveto commands
export function absoluteMoveto(d: string): string {
  return rewritePath(d, (currPos, cmd, args) => {
    if (cmd === 'M' || cmd === 'm') {
      return relativeToAbsolute(currPos, cmd, args);
    }
    return [cmd, [...args]];
  });
}

// replace all vertical/horizontal lines with line to (x,y)
export function explicitLines(d: string): string {
  return walkPath(d, explicitLinesCallback);
}

// Rewrite commands that imply knowledge of prior commands arguments;
// in particular shorthand quadratic and bezier curves become explicit.
// See https://www.w3.org/TR/SVG11/paths.html#PathDataCurveCommands.
export function expandShorthand(d: string): string {
  const shortToLong: Record<string, string> = { S: 'C', T: 'Q' };

  return walkPath(d, (_, currPos, cmd, args, prevPos, prevCmd, prevArgs) => {
    if (!(cmd.toUpperCase() in shortToLong)) {
      return [[cmd, args]];
    }

    if (cmd === cmd.toLowerCase()) {
      [cmd, args] = relativeToAbsolute(currPos, cmd, args);
    }

    // if there is no prev, or a bad prev, control point coincident current
    let newCp: [number, number] = [currPos.x, currPos.y];
    if (prevCmd) {
      if (prevCmd === prevCmd.toLowerCase()) {
        [prevCmd, prevArgs] = relativeToAbsolute(prevPos!, prevCmd, prevArgs!);
      }
      if (Object.values(shortToLong).includes(prevCmd)) {
        // reflect 2nd-last x,y pair over curr_pos and make it our first arg
        const prevCpX = prevArgs![prevArgs!.length - 4]!;
        const prevCpY = prevArgs![prevArgs!.length - 3]!;
        newCp = [2 * currPos.x - prevCpX, 2 * currPos.y - prevCpY];
      }
    }

    return [[shortToLong[cmd]!, [...newCp, ...args]]];
  });
}

// replace all arcs with similar cubics
export function arcsToCubics(d: string): string {
  return walkPath(d, (_subpathStart, currPos, cmd, args) => {
    if (cmd !== 'a' && cmd !== 'A') {
      // no work to do
      return [[cmd, args]];
    }

    const rx = args[0]!;
    const ry = args[1]!;
    const xRotation = args[2]!;
    const large = args[3]!;
    const sweep = args[4]!;
    let endX = args[5]!;
    let endY = args[6]!;

    if (cmd === 'a') {
      endX += currPos.x;
      endY += currPos.y;
    }

    const result: SvgCommand[] = [];
    for (const [p1, p2, target] of arcToCubic(
      currPos,
      rx,
      ry,
      xRotation,
      large,
      sweep,
      pt(endX, endY)
    )) {
      const { x, y } = target;
      if (p1 !== null) {
        result.push(['C', [p1.x, p1.y, p2!.x, p2!.y, x, y]]);
      } else {
        result.push(['L', [x, y]]);
      }
    }

    return result;
  });
}

// split into independent subpath d strings (movetos made absolute first)
export function subpaths(d: string): string[] {
  const result: string[] = [''];

  walkPath(absoluteMoveto(d), (_subpathStart, _currPos, cmd, args) => {
    if (cmd.toUpperCase() === 'M') {
      result.push('');
    }
    result[result.length - 1] = addCmdToD(
      result[result.length - 1]!,
      cmd,
      args
    );
    if (cmd.toUpperCase() === 'Z') {
      result.push('');
    }
    return [[cmd, args]];
  });

  return result.filter((s) => s);
}

// round all floats in the d string to the given decimal digits
export function roundFloatsD(d: string, ndigits: number): string {
  let out = '';
  for (const [cmd, args] of parseSvgPath(d)) {
    out = addCmdToD(
      out,
      cmd,
      args.map((n) => pythonRound(n, ndigits))
    );
  }
  return out;
}

// hHvV => lL, S/T => C/Q, relative => absolute, arcs => cubics
export function asCmdSeq(d: string): SvgCommand[] {
  return parseSvgPath(
    arcsToCubics(absolutePath(expandShorthand(explicitLines(d)))),
    true
  );
}
