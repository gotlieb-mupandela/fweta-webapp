import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";

const BASE = "http://localhost:3000";
const PASSWORD = "password123";
const results = [];

function log(entry) {
  results.push(entry);
  console.log(entry.ok ? "✓" : "✗", JSON.stringify(entry));
}

async function login(page, email) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

function pageLooksOk(body) {
  return (
    !/application error|something went wrong|404 not found|internal server error/i.test(body) &&
    !/^500$/m.test(body.trim())
  );
}

function readStore() {
  const path = "/workspace/data/store.json";
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function profileId(store, email) {
  return store?.profiles?.find((p) => p.email === email)?.id;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  // ── CLIPPER ──────────────────────────────────────────────
  await login(page, "clipper@fweta.test");
  log({ role: "clipper", step: "login", ok: true });

  for (const path of [
    "/dashboard/clipper",
    "/dashboard/clipper/campaigns",
    "/dashboard/clipper/submissions",
    "/dashboard/clipper/earnings",
    "/dashboard/settings/payout",
    "/dashboard/settings/withdraw",
    "/dashboard/settings/wallet",
  ]) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    log({
      role: "clipper",
      step: `page ${path}`,
      ok: (res?.status() ?? 0) === 200 && pageLooksOk(body),
    });
  }

  // Save payout method
  await page.goto(`${BASE}/dashboard/settings/payout`, { waitUntil: "networkidle" });
  await page.fill("#bankName", "FNB");
  await page.fill("#branchCode", "280171");
  await page.fill("#accountNumber", "62001234567");
  await page.fill("#accountHolderName", "Kai Clips");
  await page.selectOption("#accountType", "cheque");
  await page.getByRole("button", { name: /save payout method/i }).click();
  await page.waitForTimeout(1500);
  const payoutBody = await page.locator("body").innerText();
  log({ role: "clipper", step: "save payout method", ok: /FNB|6200/i.test(payoutBody) });

  // Submit clip to first active campaign
  await page.goto(`${BASE}/dashboard/clipper/campaigns`, { waitUntil: "networkidle" });
  const firstCard = page.locator("li").first();
  const hasCampaigns = (await firstCard.count()) > 0;
  if (hasCampaigns) {
    const uniqueUrl = `https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=${Date.now()}`;
    await firstCard.locator('input[name="postUrl"]').fill(uniqueUrl);
    await firstCard.locator('select[name="platform"]').selectOption("youtube").catch(async () => {
      await firstCard.locator('select[name="platform"]').selectOption({ index: 0 });
    });
    await firstCard.getByRole("button", { name: /submit/i }).click();
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}/dashboard/clipper/submissions`, { waitUntil: "networkidle" });
    const subsBody = await page.locator("body").innerText();
    log({
      role: "clipper",
      step: "submit clip",
      ok: /pending|youtube/i.test(subsBody),
    });
  } else {
    log({ role: "clipper", step: "submit clip", ok: false, note: "no active campaigns" });
  }

  // ── INFLUENCER ───────────────────────────────────────────
  await login(page, "creator@fweta.test");
  log({ role: "influencer", step: "login", ok: true });

  for (const path of [
    "/dashboard/influencer",
    "/dashboard/influencer/profile",
    "/dashboard/influencer/rate-cards",
    "/dashboard/influencer/bookings",
    "/dashboard/influencer/earnings",
    "/dashboard/clipper",
  ]) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    log({
      role: "influencer",
      step: `page ${path}`,
      ok: (res?.status() ?? 0) === 200 && pageLooksOk(body),
    });
  }

  // Publish profile
  await page.goto(`${BASE}/dashboard/influencer/profile`, { waitUntil: "networkidle" });
  await page.fill("#displayName", "Amara Nangolo");
  await page.fill("#headline", "Windhoek lifestyle creator");
  await page.fill("#bio", "Short-form content for African brands and DTC labels.");
  await page.fill("#niche", "Lifestyle");
  await page.fill("#location", "Windhoek, Namibia");
  await page.locator('input[name="published"]').check();
  await page.getByRole("button", { name: /save profile/i }).click();
  await page.waitForTimeout(1500);
  const storeAfterProfile = readStore();
  const creatorId = profileId(storeAfterProfile, "creator@fweta.test");
  const profile = storeAfterProfile?.influencerProfiles?.find((p) => p.userId === creatorId);
  log({
    role: "influencer",
    step: "publish profile",
    ok: Boolean(profile?.published && profile?.slug),
    slug: profile?.slug,
  });

  // Add rate card
  await page.goto(`${BASE}/dashboard/influencer/rate-cards`, { waitUntil: "networkidle" });
  const rateTitle = `TikTok Post ${Date.now()}`;
  await page.fill("#title", rateTitle);
  await page.fill("#description", "One TikTok post with brand mention.");
  await page.fill("#price", "750");
  await page.getByRole("button", { name: /add item/i }).click();
  await page.waitForTimeout(1500);
  const ratesBody = await page.locator("body").innerText();
  log({ role: "influencer", step: "add rate card", ok: ratesBody.includes(rateTitle) });

  const storeAfterRate = readStore();
  const rateCard = storeAfterRate?.rateCards?.find((r) => r.title === rateTitle);
  log({
    role: "influencer",
    step: "rate card in store",
    ok: Boolean(rateCard && rateCard.priceCents === 75000),
  });

  // Brand books influencer (full booking flow)
  await login(page, "brand@fweta.test");
  await page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "networkidle" });
  await page.fill("#amount", "2000");
  await page.fill("#note", `Booking E2E ${Date.now()}`);
  await page.getByRole("button", { name: /record deposit/i }).click();
  await page.waitForTimeout(1500);

  const slug = profile?.slug;
  if (slug && rateCard) {
    await page.goto(`${BASE}/influencers/${slug}/book`, { waitUntil: "networkidle" });
    const bookBody = await page.locator("body").innerText();
    log({
      role: "brand",
      step: "booking page loads",
      ok: !bookBody.match(/404|not found/i),
    });
    await page.selectOption("#rateCardItemId", rateCard.id);
    await page.fill("#brief", "QA booking brief for influencer dashboard test.");
    await page.getByRole("button", { name: /request booking/i }).click();
    await page.waitForTimeout(2000);
    const storeAfterBook = readStore();
    const booking = storeAfterBook?.bookings?.find(
      (b) => b.rateCardItemId === rateCard.id && b.status === "requested",
    );
    log({
      role: "brand",
      step: "request booking",
      ok: Boolean(booking),
      bookingId: booking?.id,
    });

    // Influencer accepts + delivers
    await login(page, "creator@fweta.test");
    await page.goto(`${BASE}/dashboard/influencer/bookings`, { waitUntil: "networkidle" });
    const acceptBtn = page.getByRole("button", { name: /^accept$/i }).first();
    if (await acceptBtn.count()) {
      await acceptBtn.click();
      await page.waitForTimeout(1500);
      log({ role: "influencer", step: "accept booking", ok: true });

      await page.fill('input[type="url"]', "https://www.tiktok.com/@example/video/123");
      await page.getByRole("button", { name: /mark delivered/i }).click();
      await page.waitForTimeout(1500);
      log({ role: "influencer", step: "deliver booking", ok: true });

      // Brand approves
      await login(page, "brand@fweta.test");
      await page.goto(`${BASE}/dashboard/brand/bookings`, { waitUntil: "networkidle" });
      const approveBooking = page.getByRole("button", { name: /approve/i }).first();
      if (await approveBooking.count()) {
        await approveBooking.click();
        await page.waitForTimeout(1500);
        const storeFinal = readStore();
        const approved = storeFinal?.bookings?.find((b) => b.id === booking?.id);
        const creatorWallet = storeFinal?.wallets?.find((w) => w.userId === creatorId);
        log({
          role: "brand",
          step: "approve booking payment",
          ok: approved?.status === "approved" && (creatorWallet?.availableCents ?? 0) >= 75000,
        });
      } else {
        log({ role: "brand", step: "approve booking payment", ok: false, note: "no approve button" });
      }
    } else {
      log({ role: "influencer", step: "accept booking", ok: false, note: "no accept button" });
    }
  } else {
    log({ role: "brand", step: "booking flow", ok: false, note: "missing slug or rate card" });
  }

  // ── ADMIN ────────────────────────────────────────────────
  await login(page, "admin@fweta.test");
  log({ role: "admin", step: "login", ok: true });

  for (const path of [
    "/dashboard/admin",
    "/dashboard/admin/withdrawals",
    "/dashboard/admin/fraud",
    "/dashboard/admin/users",
    "/dashboard/admin/stats",
  ]) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    log({
      role: "admin",
      step: `page ${path}`,
      ok: (res?.status() ?? 0) === 200 && pageLooksOk(body),
    });
  }

  // Admin credit clipper wallet
  const clipperId = profileId(readStore(), "clipper@fweta.test");
  await page.goto(`${BASE}/dashboard/admin`, { waitUntil: "networkidle" });
  await page.selectOption("#userId", clipperId);
  await page.fill("#amount", "150");
  await page.fill("#reason", "QA admin credit");
  await page.getByRole("button", { name: /credit wallet/i }).click();
  await page.waitForTimeout(1500);
  const storeAfterCredit = readStore();
  const clipperWallet = storeAfterCredit?.wallets?.find((w) => w.userId === clipperId);
  log({
    role: "admin",
    step: "credit user wallet",
    ok: Boolean(
      storeAfterCredit?.ledgerEntries?.some(
        (e) => e.userId === clipperId && e.reason.includes("QA admin credit"),
      ),
    ),
    walletCents: clipperWallet?.availableCents,
  });

  // Clipper requests withdrawal → admin marks paid
  await login(page, "clipper@fweta.test");
  await page.goto(`${BASE}/dashboard/settings/withdraw`, { waitUntil: "networkidle" });
  const withdrawAmount = page.locator("#amount, input[name='amount']").first();
  if (await withdrawAmount.count()) {
    await withdrawAmount.fill("100");
    await page.getByRole("button", { name: /request withdrawal|withdraw/i }).click();
    await page.waitForTimeout(1500);
    log({ role: "clipper", step: "request withdrawal", ok: true });

    await login(page, "admin@fweta.test");
    await page.goto(`${BASE}/dashboard/admin/withdrawals`, { waitUntil: "networkidle" });
    const markPaid = page.getByRole("button", { name: /mark paid/i }).first();
    if (await markPaid.count()) {
      await page.locator('input[name="ref"]').first().fill("EFT-QA-001");
      await markPaid.click();
      await page.waitForTimeout(1500);
      const storePaid = readStore();
      const paid = storePaid?.withdrawalRequests?.some((w) => w.status === "paid" && w.bankReference);
      log({ role: "admin", step: "mark withdrawal paid", ok: Boolean(paid) });
    } else {
      log({ role: "admin", step: "mark withdrawal paid", ok: false, note: "no pending withdrawal" });
    }
  } else {
    log({ role: "clipper", step: "request withdrawal", ok: false, note: "no withdraw form" });
  }
} catch (e) {
  log({ role: "fatal", step: "test run", ok: false, note: e.message });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== OTHER DASHBOARDS: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) {
  console.log("Failed:", failed);
  process.exit(1);
}
