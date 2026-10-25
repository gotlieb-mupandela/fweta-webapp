/**
 * Shared setup for the local e2e scripts.
 *
 * BASE_URL defaults to http://localhost:3000. PLAYWRIGHT_PATH may point at a
 * playwright or playwright-core entry file. CHROME_PATH may point at a Chrome
 * binary. Otherwise the launcher tries the installed Chrome channel, then
 * Playwright's own browser.
 *
 * These scripts talk to a local `npm run dev` or `next start` process, the
 * local file store, and the *@fweta.test accounts. baseUrl() allows only
 * localhost, 127.0.0.1, and ::1. Set E2E_ALLOW_REMOTE_BASE_URL=1 to use
 * another host. fweta.com and any host ending in .fweta.com also need
 * E2E_ALLOW_FWETA_HOSTS=1. Hosts are lowercased and a trailing dot is stripped
 * before the comparison. Every page load and redirect is checked again.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export const PASSWORD = "password123";
export const ADMIN_EMAIL = "admin@fweta.test";

const LOCAL_E2E_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TARGET_GUARD = Symbol("fwetaE2eTargetGuard");
const NAVIGATION_METHODS = ["goto", "reload", "goBack", "goForward", "waitForURL"];

function explicitFlag(name) {
  return process.env[name]?.trim() === "1";
}

function normalizeE2eHostname(hostname) {
  let host = String(hostname ?? "").trim().toLowerCase();
  // One leftover dot would miss the fweta.com suffix check (app.fweta.com.).
  while (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
    while (host.endsWith(".")) host = host.slice(0, -1);
  }
  return host;
}

function isFwetaHost(host) {
  return host === "fweta.com" || host.endsWith(".fweta.com");
}

function hostBlockReason(hostname, subject) {
  const host = normalizeE2eHostname(hostname);
  if (!host) {
    return `Refusing ${subject} because it has an empty host. Point BASE_URL at localhost, 127.0.0.1, or ::1.`;
  }
  if (isFwetaHost(host)) {
    if (explicitFlag("E2E_ALLOW_REMOTE_BASE_URL") && explicitFlag("E2E_ALLOW_FWETA_HOSTS")) return null;
    return `Refusing ${subject} ${host}. Hosts ending in fweta.com stay blocked unless E2E_ALLOW_REMOTE_BASE_URL=1 and E2E_ALLOW_FWETA_HOSTS=1 are both set.`;
  }
  if (LOCAL_E2E_HOSTS.has(host)) return null;
  if (explicitFlag("E2E_ALLOW_REMOTE_BASE_URL")) return null;
  return `Refusing ${subject} ${host}. E2E scripts only allow localhost, 127.0.0.1, and ::1. Set E2E_ALLOW_REMOTE_BASE_URL=1 to use another host.`;
}

function assertHttpTarget(raw, subject, invalidMessage) {
  let url;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw new Error(invalidMessage);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Refusing ${subject} protocol ${url.protocol}. Use http or https.`);
  }
  const reason = hostBlockReason(url.hostname, subject);
  if (reason) throw new Error(reason);
  return url;
}

export function baseUrl() {
  const raw = process.env.BASE_URL?.trim() || "http://localhost:3000";
  return assertHttpTarget(raw, "BASE_URL host", `BASE_URL is not a valid URL: ${raw}`).origin;
}

function assertNavigationTarget(raw) {
  if (raw == null) return;
  const value = String(raw).trim();
  if (!value || value === "about:blank") return;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Refusing navigation to an invalid URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  const reason = hostBlockReason(url.hostname, "navigation host");
  if (reason) throw new Error(reason);
}

function rememberBlock(page, state, error) {
  if (!state.error) state.error = error;
  if (state.closing) return;
  state.closing = true;
  const context = typeof page.context === "function" ? page.context() : null;
  if (context && typeof context.close === "function") {
    Promise.resolve(context.close()).catch(() => {});
  }
}

function isMainFrameNavigation(page, request) {
  if (!request || typeof request.isNavigationRequest !== "function" || !request.isNavigationRequest()) return false;
  const main = typeof page.mainFrame === "function" ? page.mainFrame() : null;
  const frame = typeof request.frame === "function" ? request.frame() : null;
  if (main && frame && frame !== main) return false;
  return true;
}

function reviewDocumentResponse(page, response) {
  const request = typeof response.request === "function" ? response.request() : null;
  if (!isMainFrameNavigation(page, request)) return;
  const current = typeof response.url === "function" ? response.url() : request.url();
  assertNavigationTarget(current);
  const status = typeof response.status === "function" ? response.status() : 0;
  if (status < 300 || status >= 400) return;
  const headers = typeof response.headers === "function" ? response.headers() : {};
  const location = String(headers.location || headers.Location || "").trim();
  if (!location) return;
  assertNavigationTarget(new URL(location, current).href);
}

function guardContext(context) {
  if (!context || context[TARGET_GUARD]) return context;
  context[TARGET_GUARD] = { kind: "context" };
  if (typeof context.newPage !== "function") return context;
  const original = context.newPage.bind(context);
  context.newPage = async (...args) => guardPage(await original(...args));
  return context;
}

function guardBrowser(browser) {
  if (!browser || browser[TARGET_GUARD]) return browser;
  browser[TARGET_GUARD] = { kind: "browser" };
  if (typeof browser.newContext === "function") {
    const original = browser.newContext.bind(browser);
    browser.newContext = async (...args) => guardContext(await original(...args));
  }
  if (typeof browser.newPage === "function") {
    const original = browser.newPage.bind(browser);
    browser.newPage = async (...args) => guardPage(await original(...args));
  }
  return browser;
}

export async function guardPage(page) {
  if (!page || page[TARGET_GUARD]) return page;
  const state = { error: null, closing: false };
  page[TARGET_GUARD] = state;

  const context = typeof page.context === "function" ? page.context() : null;
  if (context) guardContext(context);

  if (typeof page.route === "function") {
    await page.route("**/*", async (route) => {
      try {
        const request = route.request();
        if (isMainFrameNavigation(page, request)) assertNavigationTarget(request.url());
      } catch (error) {
        rememberBlock(page, state, error instanceof Error ? error : new Error(String(error)));
        try {
          await route.abort("blockedbyclient");
        } catch {
          // The request may already be settled.
        }
        return;
      }
      if (state.error) {
        try {
          await route.abort("blockedbyclient");
        } catch {
          // The request may already be settled.
        }
        return;
      }
      await route.continue();
    });
  }

  if (typeof page.on === "function") {
    page.on("framenavigated", (frame) => {
      try {
        const main = typeof page.mainFrame === "function" ? page.mainFrame() : null;
        if (main && frame && frame !== main) return;
        const url = typeof frame?.url === "function" ? frame.url() : page.url();
        assertNavigationTarget(url);
      } catch (error) {
        rememberBlock(page, state, error instanceof Error ? error : new Error(String(error)));
      }
    });
    page.on("load", () => {
      try {
        assertNavigationTarget(page.url());
      } catch (error) {
        rememberBlock(page, state, error instanceof Error ? error : new Error(String(error)));
      }
    });
    page.on("response", (response) => {
      try {
        const request = typeof response.request === "function" ? response.request() : null;
        const main = typeof page.mainFrame === "function" ? page.mainFrame() : null;
        const frame = request && typeof request.frame === "function" ? request.frame() : null;
        if (main && frame && frame !== main) return;
        reviewDocumentResponse(page, response);
      } catch (error) {
        rememberBlock(page, state, error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  for (const method of NAVIGATION_METHODS) {
    if (typeof page[method] !== "function") continue;
    const original = page[method].bind(page);
    page[method] = async (...args) => {
      if (state.error) throw state.error;
      try {
        const result = await original(...args);
        if (state.error) throw state.error;
        assertNavigationTarget(page.url());
        return result;
      } catch (error) {
        if (state.error) throw state.error;
        throw error;
      }
    };
  }

  return page;
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
    return guardBrowser(await chromium.launch({ ...shared, executablePath: process.env.CHROME_PATH.trim() }));
  }
  try {
    return guardBrowser(await chromium.launch({ ...shared, channel: "chrome" }));
  } catch {
    return guardBrowser(await chromium.launch(shared));
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
