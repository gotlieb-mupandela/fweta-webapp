import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const FIELD =
  /\b(?:title|template|default|absolute|siteName|applicationName|description)\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g;

/** Lowercase product name is allowed only inside a URL, a domain, or an email address. */
export function brandNameHits(text: string): string[] {
  const masked = text
    .replace(/https?:\/\/[^\s"'`<>)]+/gi, " ")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, " ")
    .replace(/\b(?:[a-z0-9-]+\.)*fweta\.[a-z]{2,}\b/gi, " ")
    .replace(/\/[^\s"'`<>)]*fweta[^\s"'`<>)]*/gi, " ");
  return [...masked.matchAll(/\bfweta\b/g)].map((match) => {
    const at = match.index ?? 0;
    return masked.slice(Math.max(0, at - 28), at + 28).replace(/\s+/g, " ").trim();
  });
}

function extractBalanced(source: string, openIndex: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  throw new Error("Unbalanced metadata object.");
}

/** Metadata field strings from a layout or page source. */
export function metadataBrandHits(source: string): string[] {
  const regions: string[] = [];
  for (const match of source.matchAll(/export const metadata\b[^=]*=\s*\{/g)) {
    const brace = (match.index ?? 0) + match[0].length - 1;
    regions.push(extractBalanced(source, brace));
  }
  for (const match of source.matchAll(/export (?:async )?function generateMetadata\b/g)) {
    const brace = source.indexOf("{", match.index ?? 0);
    regions.push(extractBalanced(source, brace));
  }
  const hits: string[] = [];
  for (const region of regions) {
    for (const field of region.matchAll(FIELD)) {
      hits.push(...brandNameHits(field[1]));
    }
  }
  return hits;
}

function metadataFiles(): string[] {
  const root = path.join(process.cwd(), "app");
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(layout|page|not-found)\.tsx$/.test(entry)) files.push(full);
    }
  }
  walk(root);
  return files.filter((file) => {
    const source = readFileSync(file, "utf8");
    return /export const metadata\b/.test(source) || /function generateMetadata\b/.test(source);
  });
}

test("lowercase fweta fails when it is the brand name", () => {
  const sample = [
    'export const metadata: Metadata = {',
    '  title: { default: "fweta", template: "%s · Fweta" },',
    '  description: "Workspace",',
    '  openGraph: { title: "Fweta", siteName: "Fweta", description: "Workspace" },',
    "};",
  ].join("\n");
  const hits = metadataBrandHits(sample);
  assert.ok(hits.length > 0, "a lowercase title must fail");
  assert.ok(hits.some((hit) => hit.includes("fweta")));

  const cleaned = sample.replace('default: "fweta"', 'default: "Fweta"');
  assert.deepEqual(metadataBrandHits(cleaned), []);

  assert.ok(brandNameHits("# fweta").length > 0);
  assert.ok(brandNameHits("fweta").length > 0);
  assert.deepEqual(brandNameHits("Fweta"), []);
  assert.deepEqual(brandNameHits("https://app.fweta.com/brand/fweta-mark.webp"), []);
  assert.deepEqual(brandNameHits("hello@fweta.com"), []);
  assert.deepEqual(brandNameHits("See fweta.com and app.fweta.com."), []);
});

test("page metadata, llms.txt, and the email layout capitalise Fweta", () => {
  const files = metadataFiles();
  const rel = (file: string) => path.relative(process.cwd(), file);
  const names = files.map(rel);
  for (const required of [
    "app/layout.tsx",
    "app/dashboard/layout.tsx",
    "app/campaigns/layout.tsx",
    "app/influencers/layout.tsx",
    "app/business/[slug]/page.tsx",
  ]) {
    assert.ok(names.includes(required), required);
  }
  assert.ok(files.length >= 15);

  const violations: string[] = [];
  for (const file of files) {
    for (const hit of metadataBrandHits(readFileSync(file, "utf8"))) {
      violations.push(`${rel(file)}: ${hit}`);
    }
  }
  for (const extra of ["app/llms.txt/route.ts", "lib/email/layout.ts"]) {
    for (const hit of brandNameHits(readFileSync(path.join(process.cwd(), extra), "utf8"))) {
      violations.push(`${extra}: ${hit}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("error page logo links use the Fweta aria-label", () => {
  const pages = [
    "app/error.tsx",
    "app/global-error.tsx",
    "app/not-found.tsx",
    "app/dashboard/error.tsx",
  ];
  assert.ok(brandNameHits('aria-label="fweta"').length > 0);
  const violations: string[] = [];
  for (const file of pages) {
    const source = readFileSync(path.join(process.cwd(), file), "utf8");
    const labels = [...source.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1]);
    assert.ok(labels.length > 0, file);
    for (const label of labels) {
      for (const hit of brandNameHits(label)) violations.push(`${file}: ${hit}`);
    }
    assert.match(source, />fweta</, file);
  }
  assert.deepEqual(violations, []);
});

test("the main logo links use aria-label Fweta", () => {
  const source = readFileSync(path.join(process.cwd(), "components/brand/logo.tsx"), "utf8");
  assert.equal(source.match(/aria-label="Fweta"/g)?.length, 2);
});
