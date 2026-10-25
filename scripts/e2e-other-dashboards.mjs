import {
  ADMIN_EMAIL,
  baseUrl,
  confirmPayIn,
  fillPostUrl,
  launchBrowser,
  loadPlaywright,
  login,
  readStore,
  samplePngPath,
  submitEftDeposit,
} from "./e2e-helpers.mjs";

const BASE = baseUrl();
const results = [];

function log(entry) {
  results.push(entry);
  console.log(entry.ok ? "✓" : "✗", JSON.stringify(entry));
}

function pageLooksOk(body) {
  return (
    !/application error|something went wrong|404 not found|internal server error/i.test(body) &&
    !/^500$/m.test(body.trim())
  );
}

function profileId(store, email) {
  return store?.profiles?.find((p) => p.email === email)?.id;
}

const playwright = await loadPlaywright();
const browser = await launchBrowser(playwright);
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
  await page.getByRole("button", { name: "Save payout method", exact: true }).click();
  await page.waitForTimeout(1500);
  const payoutBody = await page.locator("body").innerText();
  log({ role: "clipper", step: "save payout method", ok: /FNB|6200/i.test(payoutBody) });

  // Submit clip to first active campaign
  await page.goto(`${BASE}/dashboard/clipper/campaigns`, { waitUntil: "domcontentloaded" });
  const firstCard = page.locator("li").filter({ has: page.getByLabel("Post URL", { exact: true }) }).first();
  const hasCampaigns = await firstCard.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  if (hasCampaigns) {
    const uniqueUrl = `https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=${Date.now()}`;
    await fillPostUrl(firstCard, uniqueUrl);
    const platform = firstCard.getByLabel("Platform", { exact: true });
    await platform.selectOption("youtube").catch(async () => {
      await platform.selectOption({ index: 0 });
    });
    await firstCard.getByRole("button", { name: "Submit clip", exact: true }).click();
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
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
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
  await page.getByRole("button", { name: "Add item", exact: true }).click();
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
  await page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "domcontentloaded" });
  const bookingNote = `Booking E2E ${Date.now()}`;
  await submitEftDeposit(page, "2000", bookingNote);
  await login(page, ADMIN_EMAIL);
  await confirmPayIn(page, bookingNote);
  await login(page, "brand@fweta.test");

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
    await page.getByRole("button", { name: "Request booking", exact: true }).click();
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
    const creatorRow = page.locator("li").filter({ hasText: "QA booking brief for influencer dashboard test." }).first();
    const acceptBtn = creatorRow.getByRole("button", { name: "Accept", exact: true });
    if (await acceptBtn.count()) {
      await acceptBtn.click();
      await creatorRow.getByLabel("Deliverable URL", { exact: true }).waitFor({ timeout: 15000 });
      log({ role: "influencer", step: "accept booking", ok: true });

      await creatorRow.getByLabel("Deliverable URL", { exact: true }).fill("https://www.tiktok.com/@example/video/123");
      await creatorRow.getByRole("button", { name: "Mark delivered", exact: true }).click();
      await page.waitForTimeout(1500);
      log({ role: "influencer", step: "deliver booking", ok: true });

      // Brand approves. The button is only rendered once the booking is delivered.
      await login(page, "brand@fweta.test");
      await page.goto(`${BASE}/dashboard/brand/bookings`, { waitUntil: "networkidle" });
      const brandRow = page.locator("li").filter({ hasText: "QA booking brief for influencer dashboard test." }).first();
      const approveBooking = brandRow.getByRole("button", { name: "Approve & release payment", exact: true });
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
        const status = readStore()?.bookings?.find((b) => b.id === booking?.id)?.status;
        log({ role: "brand", step: "approve booking payment", ok: false, note: `no approve button (status ${status ?? "missing"})` });
      }
    } else {
      log({ role: "influencer", step: "accept booking", ok: false, note: "no accept button" });
    }
  } else {
    log({ role: "brand", step: "booking flow", ok: false, note: "missing slug or rate card" });
  }

  // ── ADMIN ────────────────────────────────────────────────
  await login(page, ADMIN_EMAIL);
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
  await page.getByRole("button", { name: "Credit wallet", exact: true }).click();
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

  // Clipper requests withdrawal → admin marks paid.
  // The amount field is hidden until a payout method exists and an admin verifies identity.
  await login(page, "clipper@fweta.test");
  await page.goto(`${BASE}/dashboard/settings/withdraw`, { waitUntil: "networkidle" });
  if (await page.locator("#legalName").isVisible().catch(() => false)) {
    await page.fill("#legalName", "Kai Clips");
    await page.fill("#idNumber", "9001010000000");
    await page.fill("#country", "NA");
    await page.setInputFiles("#idDocument", samplePngPath());
    await page.getByRole("button", { name: "Save identity", exact: true }).click();
    await page.getByText("Waiting for a review").waitFor({ timeout: 15000 });
    await login(page, ADMIN_EMAIL);
    await page.goto(`${BASE}/dashboard/admin/kyc`, { waitUntil: "networkidle" });
    await page
      .locator("li")
      .filter({ hasText: "clipper@fweta.test" })
      .getByRole("button", { name: "Verify identity", exact: true })
      .click();
    await page.waitForTimeout(1500);
    await login(page, "clipper@fweta.test");
    await page.goto(`${BASE}/dashboard/settings/withdraw`, { waitUntil: "networkidle" });
  }
  const withdrawAmount = page.locator("#amount");
  if (await withdrawAmount.count()) {
    await withdrawAmount.fill("100");
    await page.getByRole("button", { name: "Request withdrawal", exact: true }).click();
    await page.waitForTimeout(1500);
    log({ role: "clipper", step: "request withdrawal", ok: true });

    await login(page, ADMIN_EMAIL);
    await page.goto(`${BASE}/dashboard/admin/withdrawals`, { waitUntil: "networkidle" });
    const markPaid = page.getByRole("button", { name: "Mark paid", exact: true }).first();
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
