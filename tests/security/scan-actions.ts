import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, "../..");

export type ScannedAction = { name: string; body: string; file: string };

function skipComment(source: string, index: number): number {
  if (source.startsWith("//", index)) {
    const next = source.indexOf("\n", index);
    return next === -1 ? source.length : next + 1;
  }
  if (source.startsWith("/*", index)) {
    const end = source.indexOf("*/", index + 2);
    return end === -1 ? source.length : end + 2;
  }
  return index;
}

function skipString(source: string, index: number): number {
  const quote = source[index];
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (quote === "`" && source[cursor] === "$" && source[cursor + 1] === "{") {
      cursor += 2;
      let depth = 1;
      while (cursor < source.length && depth > 0) {
        if (source.startsWith("//", cursor) || source.startsWith("/*", cursor)) {
          cursor = skipComment(source, cursor);
          continue;
        }
        const char = source[cursor];
        if (char === "'" || char === '"' || char === "`") {
          cursor = skipString(source, cursor);
          continue;
        }
        if (char === "{") depth += 1;
        else if (char === "}") depth -= 1;
        cursor += 1;
      }
      continue;
    }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return cursor;
}

function skipBalanced(source: string, index: number, open: string, close: string): number {
  let depth = 0;
  let cursor = index;
  while (cursor < source.length) {
    if (source.startsWith("//", cursor) || source.startsWith("/*", cursor)) {
      cursor = skipComment(source, cursor);
      continue;
    }
    const char = source[cursor];
    if (char === "'" || char === '"' || char === "`") {
      cursor = skipString(source, cursor);
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    cursor += 1;
  }
  return cursor;
}

function skipSpace(source: string, index: number): number {
  let cursor = index;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) {
      cursor += 1;
      continue;
    }
    if (source.startsWith("//", cursor) || source.startsWith("/*", cursor)) {
      cursor = skipComment(source, cursor);
      continue;
    }
    break;
  }
  return cursor;
}

export function isUseServerModule(source: string): boolean {
  const start = source.replace(/^\uFEFF/, "").trimStart();
  return start.startsWith('"use server"') || start.startsWith("'use server'");
}

export function exportedAsyncFunctions(source: string): ScannedAction[] {
  const found: ScannedAction[] = [];
  const pattern = /export\s+async\s+function\s+([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    let cursor = skipSpace(source, match.index + match[0].length);
    if (source[cursor] === "<") cursor = skipBalanced(source, cursor, "<", ">");
    cursor = skipSpace(source, cursor);
    if (source[cursor] !== "(") continue;
    cursor = skipBalanced(source, cursor, "(", ")");
    let angle = 0;
    let paren = 0;
    while (cursor < source.length) {
      if (source.startsWith("//", cursor) || source.startsWith("/*", cursor)) {
        cursor = skipComment(source, cursor);
        continue;
      }
      const char = source[cursor];
      if (char === "'" || char === '"' || char === "`") {
        cursor = skipString(source, cursor);
        continue;
      }
      if (char === "<") angle += 1;
      else if (char === ">") angle = Math.max(0, angle - 1);
      else if (char === "(") paren += 1;
      else if (char === ")") paren = Math.max(0, paren - 1);
      else if (char === "{" && angle === 0 && paren === 0) break;
      cursor += 1;
    }
    const bodyEnd = skipBalanced(source, cursor, "{", "}");
    found.push({ name: match[1], body: source.slice(cursor, bodyEnd), file: "" });
    pattern.lastIndex = bodyEnd;
  }
  return found;
}

export function serverActions(): ScannedAction[] {
  const dir = path.join(repoRoot, "app/actions");
  const actions: ScannedAction[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".ts")) continue;
    const file = path.join(dir, name);
    const source = fs.readFileSync(file, "utf8");
    if (!isUseServerModule(source)) continue;
    for (const action of exportedAsyncFunctions(source)) {
      actions.push({ ...action, file: path.relative(repoRoot, file) });
    }
  }
  return actions;
}

export function readRepo(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}
