/**
 * Shared setup for the local e2e scripts.
 *
 * BASE_URL defaults to http://localhost:3000. PLAYWRIGHT_PATH may point at a
 * playwright or playwright-core entry file. CHROME_PATH may point at a Chrome
 * binary. Otherwise the launcher tries the installed Chrome channel, then
 * Playwright's own browser.
 *
 * These scripts talk to a local `npm run dev` or `next start` process, the
 * local file store, and the *@fweta.test accounts. They refuse app.fweta.com.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export const PASSWORD = "password123";
export const ADMIN_EMAIL = "admin@fweta.test";

export function baseUrl() {
  const raw = process.env.BASE_URL?.trim() || "http://localhost:3000";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BASE_URL is not a valid URL: ${raw}`);
  }
  if (url.hostname === "app.fweta.com") {
    throw new Error("Refusing BASE_URL host app.fweta.com. Point BASE_URL at a local server.");
  }
  return url.origin;
}

export function storePath() {
  return process.env.FWETA_STORE_PATH?.trim() || path.join(process.cwd(), "data", "store.json");
}

export function readStore() {
  const file = storePath();
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function artifactDir(name) {
  const root = process.env.E2E_ARTIFACT_DIR?.trim() || path.join(os.tmpdir(), "fweta-e2e");
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeArtifact(dirName, fileName, contents) {
  const file = path.join(artifactDir(dirName), fileName);
  writeFileSync(file, contents);
  return file;
}

/** Tiny valid PNG used when a script must attach an image. */
export function samplePngPath() {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  return writeArtifact("files", "sample.png", png);
}

export function sampleVideoPath() {
  return writeArtifact(
    "files",
    "ugc-sample.mp4",
    Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex"),
  );
}

function moduleFrom(loaded) {
  if (loaded?.chromium) return loaded;
  if (loaded?.default?.chromium) return loaded.default;
  throw new Error("Playwright module did not export chromium.");
}

export async function loadPlaywright() {
  const fromEnv = process.env.PLAYWRIGHT_PATH?.trim();
  if (fromEnv) {
    const href = fromEnv.startsWith("file:") ? fromEnv : pathToFileURL(fromEnv).href;
    return moduleFrom(await import(href));
  }
  const failures = [];
  for (const name of ["playwright", "playwright-core"]) {
    try {
      const resolved = require.resolve(name);
      return moduleFrom(await import(pathToFileURL(resolved).href));
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `Could not load Playwright. Install the playwright package or set PLAYWRIGHT_PATH. ${failures.join(" ")}`,
  );
}

export async function launchBrowser(playwright) {
  const chromium = playwright.chromium;
  const shared = {
    headless: process.env.HEADED !== "1",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
  if (process.env.HEADED === "1") shared.slowMo = 250;
  if (process.env.CHROME_PATH?.trim()) {
    return chromium.launch({ ...shared, executablePath: process.env.CHROME_PATH.trim() });
  }
  try {
    return await chromium.launch({ ...shared, channel: "chrome" });
  } catch {
    return chromium.launch(shared);
  }
}

export async function dismissTour(page) {
  const skip = page.getByRole("button", { name: "Skip tour", exact: true });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(300);
  }
}

export async function login(page, email, password = PASSWORD) {
  const base = baseUrl();
  await page.context().clearCookies();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  const form = page.locator("form").filter({ has: page.getByLabel("Email", { exact: true }) });
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20000, waitUntil: "domcontentloaded" });
  await dismissTour(page);
}

/**
 * Settings shows a Log out button in the page, and the desktop sidebar shows
 * another. Click the visible one in the main column when it is on screen,
 * otherwise the visible sidebar button.
 */
export async function clickLogOut(page) {
  const inMain = page.locator("main").getByRole("button", { name: "Log out", exact: true });
  if ((await inMain.count()) > 0 && (await inMain.first().isVisible())) {
    await inMain.first().click();
    return;
  }
  const matches = page.getByRole("button", { name: "Log out", exact: true });
  const count = await matches.count();
  for (let index = 0; index < count; index += 1) {
    const button = matches.nth(index);
    if (await button.isVisible()) {
      await button.click();
      return;
    }
  }
  throw new Error("No visible Log out button.");
}

export async function submitEftDeposit(page, amount, note) {
  await page.getByLabel("Amount (NAD)", { exact: true }).fill(String(amount));
  await page.getByLabel("Note (optional)", { exact: true }).fill(note);
  await page.getByRole("button", { name: "Submit EFT deposit", exact: true }).click();
  await page
    .getByText("Deposit submitted. An admin confirms the EFT before your wallet is credited.")
    .waitFor({ timeout: 15000 });
}

export async function confirmPayIn(page, note) {
  const base = baseUrl();
  await page.goto(`${base}/dashboard/admin/payins`, { waitUntil: "domcontentloaded" });
  await dismissTour(page);
  const row = page.getByRole("listitem").filter({ hasText: note });
  await row.getByRole("button", { name: "Confirm transfer", exact: true }).click();
  await row.getByText("Confirmed", { exact: true }).waitFor({ timeout: 15000 });
}

function campaignForm(page) {
  return page.locator("form").filter({ has: page.getByLabel("Total budget (NAD)", { exact: true }) });
}

async function fillCampaignForm(page, fields) {
  const form = campaignForm(page);
  await form.waitFor();
  await form.getByLabel("Title", { exact: true }).fill(fields.title);
  await form.getByLabel("Description", { exact: true }).fill(fields.description);
  await form.getByLabel("Category", { exact: true }).fill(fields.category);
  await form.getByLabel("Total budget (NAD)", { exact: true }).fill(String(fields.budget));
  await form.getByLabel("CPM (NAD)", { exact: true }).fill(String(fields.cpm));
  await form.getByLabel("Max per video (NAD)", { exact: true }).fill(String(fields.maxPayout));
  if (fields.endDate) {
    await form.getByLabel("End date (optional)", { exact: true }).fill(fields.endDate);
  }
  const platform = fields.platform ?? "YouTube";
  await form.getByRole("checkbox", { name: platform, exact: true }).check();
  return form;
}

async function submitCampaignForm(page, fields, buttonName) {
  const form = await fillCampaignForm(page, fields);
  const button = form.getByRole("button", { name: buttonName, exact: true });
  const pattern = /\/dashboard\/brand\/campaigns\/[0-9a-f-]+$/;
  await button.click();
  try {
    await page.waitForURL(pattern, { timeout: 20000 });
  } catch (error) {
    if (!page.url().includes("/campaigns/new")) throw error;
    const alert = (await page.getByRole("alert").allInnerTexts()).filter(Boolean).join(" ");
    if (alert && alert !== "Campaign") throw new Error(alert);
    await button.click();
    await page.waitForURL(pattern, { timeout: 20000 });
  }
}

export async function publishCampaign(page, fields) {
  await submitCampaignForm(page, fields, "Publish to clippers");
}

export async function saveDraftCampaign(page, fields) {
  await submitCampaignForm(page, fields, "Save as draft");
}

export async function fillPostUrl(scope, url) {
  await scope.getByLabel("Post URL", { exact: true }).fill(url);
}
