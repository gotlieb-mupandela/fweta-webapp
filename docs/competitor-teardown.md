# Competitor teardown — clipping platforms

Public-page research for Fweta, observed on **17 October 2026**. Whop’s own product is out of scope (another pass). This note covers what a visitor can learn without an account, then a prioritized list of what Fweta should copy as table stakes and what it should do differently for Namibia and the rest of Africa.

## How this was observed

REA `6.5.0` (`npx rea-agents setup`, then `capture-browser-scenario`) opened a temporary Chrome profile and recorded each page’s accessibility tree. No accounts were created, no logins were attempted, and no site code, design, or marketing lines were copied into the repo. Numbers below are what those public pages stated that day. Marketing pages and legal pages on the same site sometimes disagree; both are recorded.

**Could not be read**

- **ClipAffiliates** (`clipaffiliates.com`, `www.clipaffiliates.com`, `/pricing`, `/terms`) returned Cloudflare error 1000 (“DNS points to prohibited IP”). `docs.clipaffiliates.com` and `help.clipaffiliates.com` served a default host placeholder. `app.clipaffiliates.com` did the same. The apex host timed out. Nothing here is treated as a ClipAffiliates product fact.
- **Reddit** blocked this network on both `www.reddit.com` and `old.reddit.com`. Clipper complaints below come from Trustpilot pages that did load, and from the platforms’ own help and terms, which describe the same failure modes (pending balances, bot flags, budget exhaustion).
- **Promote.fun campaign detail** did not render. The public board on the homepage did.
- **sideshift.com** is a boat-thruster company. The creator product is [sideshift.app](https://sideshift.app/).

## Snapshot

| Platform | Model a visitor can see | Who sets the price | Payout rail on public pages | Fee the site states | Fraud control the site states |
| --- | --- | --- | --- | --- | --- |
| [Vues](https://vues.app/) | CPM clipping; clipper applies, then posts | Brand CPM + budget cap | Bank or USDC via Stripe on the marketing site; terms also list PayPal, Zelle, and USDT paid by the brand | Illustrative 10% taken from the cash-out, on the brand side of the clipper’s earnings | Platform view counts; bots banned; brand FAQ says country, gender, and reach are checked |
| [Vyro](https://vyro.com/) | CPM clipping of supplied long-form | Brand CPM + budget | Stripe or PayPal by region. Help says no IBAN, ACH, or crypto | Not stated as a percent | Automated scan plus human review; paid boosts banned |
| [Clipping.net](https://clipping.net/) | CPM **and** a shared pot; plus bounties | Brand budget; rate often set with their team | PayPal, or USDC/USDT on Ethereum. Campaign picks the rail | Not stated as a percent | View-spike and viewbot checks, then staff review |
| [Clipping.io](https://www.clipping.io/) | Managed CPM clipping / reposts | Sales-led, not a public rate card | Not stated | Not stated | “AntiBot”, demographic check, auto video review |
| [Reach.cat](https://reach.cat/) | CPM; brand approves every post | Brand CPM, brief, daily cap | USDT now; creator FAQ says bank transfer “very soon”. Onboarding copy says a crypto wallet is enough to start | About 10% of CPM payouts | Behavioral score plus brand approval. Terms say a bot-free result is not guaranteed |
| ClipAffiliates | Not observable | — | — | — | — |
| [Promote.fun](https://www.promote.fun/) | CPM; pay when the campaign ends | Rate shown per campaign | USDC on Solana | Not stated | Not stated on the pages that rendered |
| [FindClout](https://findclout.com/) | Done-for-you distribution on vetted pages, not an open board | They quote a CPM; large monthly budgets | Terms allow card, bank, or crypto and let them change the rail | Clipper page says clippers are not charged | “Multiple detection systems”, AI plus human review, vetted pages |
| [ClipHaven](https://cliphaven.app/) | CPM, budget held up front | Rate on the campaign | Weekly bank transfer | Not stated | “Verified views”; method not specified |
| [ClipStake](https://www.clipstake.com/) | CPM clipping, logo overlays, music; UGC marked coming | Brand CPM + budget | Solana wallet; fiat invoice by email | A percent may be shown before confirm; amount not published | Demographics and a guided look at the post’s analytics page |
| [SideShift](https://sideshift.app/) | Hire a roster: UGC, ambassadors, affiliates. Not an open clip board | Subscription plus separate creator pay | In-platform payouts and 1099s | Software: $210 / $349 / $699 per month on annual billing | “Checked” views and per-creator CPM, inside plan limits |
| [Content Rewards](https://contentrewards.com/) | CPM, per-post, retainer, **and pool** | Brand sets each | Wallet, then bank, PayPal, mobile wallet, or crypto via Whop | 10% on delivered work (8% if the org is verified). Creator fee is 10% on CPM and pool; $0 creator fee on per-post/retainer at $5,000+ | 0–100 bot score, shown to the reviewer; high scores can hold a payout |

## Per platform

### Vues — [vues.app](https://vues.app/)

Open CPM clipping on TikTok, Instagram, YouTube, and X. The creator path is **apply, get approved, then submit a link**. Views are pulled from the platforms. Marketing says there is no follower minimum, the balance is withdrawable on demand, and payouts are a bank account or a USDC wallet through Stripe. A calculator example uses $3 per 1,000 views. The brand page’s controls are a CPM, a budget cap, a brief, and an approve/deny queue, with a claim that spend only moves on approved views and that country, gender, and reach are checked.

The [affiliate page](https://vues.app/affiliate) walks an example where a $1,000 clipper cash-out includes a $100 platform fee (10%), and the referrer keeps 20% of that fee. The [terms](https://vues.app/terms) (5 October 2026) say the payout obligation sits with the brand, not with Vues as custodian, and that available methods may include USDT, PayPal, or Zelle, with minimums and screening. Bots, bought traffic, and paid boosts are banned. A rejected clip is not paid; the terms say unrelated legitimate payouts stay payable. Privacy says automated systems can decide which views count. Public org pages show live campaign counts and paid-out totals, but exact live CPMs sit behind login. The [iOS page](https://vues.app/ios) is the clearest creator UX: rate and remaining budget before you commit, submit from the phone share sheet, and pending versus settled balances.

### Vyro — [vyro.com](https://vyro.com/)

A Beast Industries clipping board. Creators connect social accounts, download source video, post on TikTok, Reels, Shorts, or X, and submit the live URL. [About](https://vyro.com/about) says there is no follower minimum, listings are reviewed before they go live, earnings refresh hourly, and unused brand budget is refunded. [Help](https://vyro.com/help/earnings-and-payments) is more specific:

- Each approved post must reach **5,000 views** on its own before it earns.
- Cap of **$1,000 per clip**, shown on the brief.
- Withdraw from **$10**, once a week, Stripe or PayPal only. No IBAN, ACH, or crypto.
- After a campaign ends, money stays pending for a **7–10 day** review.
- Views are counted from submit time and refreshed about every **30 minutes**, so they will not match the social app.
- Near the end of a budget, pay is prorated, so the headline CPM is not a promise.

[Brand FAQ](https://vyro.com/for-brands): minimum budget **$1,000**, pause or top up anytime. [Content rules](https://vyro.com/content-requirements) ban bots, reposts of another clipper’s post, duplicate posts on the same account, and paid ads. [Clips help](https://vyro.com/help/clips-and-content): at most 5 posts per social account per campaign per 24 hours; until a first approval, at most 3 clips can sit in review; views count from submit, even before approval; rejection includes a note. [Clipper terms](https://vyro.com/clipper-terms) say a campaign can be published before the client’s funds have settled, and can then be cancelled with no payout.

Trustpilot for [www.vyro.com](https://www.trustpilot.com/review/vyro.com) showed **TrustScore 2.3 from 7 reviews**, almost all 1-star: organic-looking views rejected as fake with no traffic proof, accounts banned, and balances (one reviewer cited $50, another $400) left unpaid. That is a small sample, and it matches the product’s own “pending until we review” design.

### Clipping.net — [clipping.net](https://clipping.net/)

Two pay shapes, documented for clippers:

- **Payrate:** a flat amount per views (their example is $1 per 1,000).
- **Pot:** a fixed pot split by share of views.
- **Bounties:** extra tasks (a sound, a product shot) chosen at upload, not mixed on the same clip.

[Payments](https://clipping.net/docs/clippers/payments): most campaigns require **1,000 views on the post** before those views count, and usually **25,000 views across the clipper’s posts on that campaign** before earnings release. Rails are PayPal, USDC, or USDT, and USDC/USDT are sent on Ethereum. The campaign chooses the rail. Older Cash App and Zelle methods linger but cannot be added. Payout is not instant: campaign ends, staff check that posts are still public, the sponsor approves the numbers, then payment is sent. Dashboard figures are estimates and can fall if a clip is removed.

[Getting started](https://clipping.net/docs/clippers/getting-started): Discord login, verify a social account by pasting a code into the bio, then add a payout method. [Rules](https://clipping.net/docs/clippers/rules): bought views, bot followers, view-trade groups, and automated likes get you removed; an English-audience campaign can require 50%+ of the audience from English-speaking countries; posts must stay public until payment; staff decisions are final.

The [brand](https://clipping.net/brands) and [enterprise](https://clipping.net/enterprise) pages are a managed service (they scope the campaign), not a pure self-serve form. They advertise viewbot detection, spike detection, manual bans, a live dashboard, and a hard spend cap. Rates on the marketing site are quoted **per 100,000 views**.

### Clipping.io — [clipping.io](https://www.clipping.io/)

A sales site for brands: a network of reposters, CPM campaigns, and a tools list that includes view tracking, a demographic check, anti-bot detection, and auto video review. The public homepage does not state a CPM, a minimum, a cap, a fee, or a payout rail. [Terms](https://www.clipping.io/terms-of-use) are a generic template (California law, last updated 16 December 2024) and do not describe the clipping product. Trustpilot showed a profile with a single review and TrustScore 3.2. Treat the public product as “managed clipping, details on a call.”

### Reach.cat — [reach.cat](https://reach.cat/)

Brand side: list a campaign, creators submit, the brand approves, Reach tracks impressions. The brand sets the brief, the CPM, and a **daily cap**, and can pause. [Creator page](https://reach.cat/creator): pay from 1,000 views, CPM set by the brand, plus a weekly random bonus. FAQ on that page says payouts are USDT, with bank transfer “very soon.” [Become a clipper](https://reach.cat/become-a-clipper/) says no application, no ID to start, a free wallet such as Phantom, no minimum payout, and an example of $1.50 CPM. [Fee page](https://reach.cat/clipping-fee-calculator/) markets a flat **10%** and contrasts it with a stack of Whop fees.

[Terms](https://reach.cat/terms) (effective 13 September 2026) are stricter than the landing page: about **10%** commission on CPM payouts; posts must stay up for the campaign and **60 days** after; accounts under 30 days old cannot join a public campaign in its first 7 days; one account per person; payouts can be held for suspicious impressions; **KYC through iDenfy is required once cumulative payout requests pass $500**, and can also be required before a flagged account joins a public campaign. The merchant of record named in the terms is Inflowpay SAS (France); governing law is the UAE. The terms also say Reach does not guarantee a bot-free marketplace.

Trustpilot [ReachCat](https://www.trustpilot.com/review/reach.cat): **TrustScore 3.0, 17 reviews**. Complaints include a brand who could not withdraw a test deposit, a clipper owed $60, support that is slow, and an account blocked with an $86 balance and no explanation. One reviewer said they could not join a campaign because they are Black and African. That is an allegation on a review site, not a rule written on Reach’s pages. Positive reviews say views were actually paid. The company reply rate on negative reviews was shown as 50%, with a typical reply time over a month.

### Promote.fun — [promote.fun](https://www.promote.fun/)

The homepage is the campaign board. Cards show a budget and a rate; the rates that rendered sat between **$0.60 and $2.50** per 1,000 views, on budgets from about $1,600 to $8,000, across gaming, TV, music, and similar labels. Flow on the page: connect TikTok, Instagram, YouTube, or X without giving the platform the social password; join a campaign; post to the brief; earnings land when the campaign ends; withdraw **USDC on Solana**. No fee, minimum, cap, or bot method was in the accessibility tree. Opening a campaign URL did not render a detail view.

### FindClout — [findclout.com](https://findclout.com/)

Not an open clipper marketplace. Brands buy distribution across a vetted set of pages: logo-on-memes, a vertical-targeted version of that, or the brand’s own content cut into meme variants. The homepage asks for monthly budgets from **$100,000 to $1,000,000+**, quotes effective CPMs down to **$0.05** at scale, and states delivery floors of **15 million views** (logo) and **2 million** (content). They say they guarantee the view count by running more posts if one flops. Review is AI plus human, and a brand can ban a page. Audience claim: authentic, tier-1 US.

[Clipper page](https://findclout.com/clipper): no view minimum and no view cap, posts keep earning after the first days, US/UK/CA/AU audiences only, onboarding in Discord, posting through a Telegram bot at `app.findclout.com`, and no clipper fee. [Terms](https://findclout.com/termsofservice) (AIggregate Labs LLC) reserve a much wider discretion: they may change payout rails, thresholds, and schedules; withhold on suspicion; and they say they are not a bank or escrow. The marketing promise and the contract do not read as the same product.

### ClipHaven — [cliphaven.app](https://cliphaven.app/)

Homepage: sponsors fund a campaign up front, clippers submit YouTube, TikTok, or Instagram URLs, pay is weekly to a bank once a **$5** balance is hit. [Terms](https://cliphaven.app/terms) say the budget is escrowed and payouts are automatic, and then stop. They do not name a fee, a CPM, a fraud method, or KYC. The [how-to-earn post](https://cliphaven.app/blog/how-to-make-money-from-clips) is category education (typical 2026 campaigns at $1–$5 CPM, YouTube views via an official API, TikTok via scraping) and says ClipHaven pays weekly to a bank with a small per-clip minimum around $5. Public product detail is thin next to Vyro or Content Rewards.

### ClipStake — [clipstake.com](https://www.clipstake.com/)

[Brand](https://www.clipstake.com/brand) campaign types: clipping, logo overlay on trending posts, music/sound, and UGC marked as coming soon. Brand sets CPM and budget and pays only after approval and a minimum view threshold. Deposits are an embedded Solana wallet; a fiat invoice is available via email. The public [marketplace](https://app.clipstake.com/marketplace) lists live cards with CPM, budget, percent consumed, and end date (observed examples from $0.20 to $3 per 1,000 views).

[Creator FAQ](https://www.clipstake.com/creator): no follower minimum, but each campaign has its own view floor; views refresh about every **6 hours**; claim once the floor is hit; **20 submissions per campaign**, sent in batches of 3. View checks are a guided open of the post’s analytics page, which they say does not grant account access. [Terms](https://www.clipstake.com/terms-and-conditions) (5 August 2025) say the product is in beta, payouts are not guaranteed, gas is sponsored, fiat is not processed on-platform, and accounts can be closed for skipping KYC.

### SideShift — [sideshift.app](https://sideshift.app/)

This is the hiring tool, not a clip board. [Plans](https://sideshift.app/plans/brands), annual prices shown: **Starter $210/month** (15 creators at once, 200 invites, CPM per creator, contracts, automated payouts and 1099s), **Growth $349/month** (50 creators, 2,000 tracked videos), **Scale $699/month** (unlimited creators and tracked videos). Creator pay is extra. Funds stay in the brand wallet until work is approved. [Payments](https://sideshift.app/platform/payments) are agree terms, review, then pay, with 1099s. Trustpilot [sideshift.app](https://www.trustpilot.com/review/sideshift.app) was **Poor**: billing after a trial, charges on both the brand and the creator, a reviewer whose country phone number was unsupported, and creators who could not withdraw or disconnect accounts. Useful as a warning about subscription-plus-creator-pay, not as a clipping CPM design.

### Content Rewards — [contentrewards.com](https://contentrewards.com/)

The most complete public spec, and it states that it runs as an app inside Whop. Four campaign types on the [terms](https://contentrewards.com/terms):

- **CPM** — per 1,000 verified views. Minimum budget $1,000. Brand can set a minimum and a maximum a clip must earn.
- **Per-post** — flat amount at approval, no ongoing view pay. A view floor can still void the post.
- **Retainer** — a fixed sum per cycle for an agreed volume of posts. The cycle amount must be under the total budget.
- **Pool** — the budget (including the org’s platform fee) is split by counted views on approved posts **when the pool ends**. Anyone under the pool’s view minimum gets nothing. Amounts shown before the end are estimates. If nobody qualifies, nobody is paid.

[Pricing](https://contentrewards.com/pricing): no subscription; **10%** of delivered work, **8%** if the organization is verified. Creator fee is a flat **10%** on CPM and pool payouts. Per-post and retainer campaigns of $5,000 or more charge the creator **0%**.

[Creator FAQ](https://contentrewards.com/creators): a CPM clip earns for **7 days** from approval, then a **3-day** hold (about 10 days to available balance). Recurring CPM tracking is normally 30 days. Withdrawal has no Content Rewards minimum and no Content Rewards withdrawal fee; Whop then sends to a bank, PayPal, a mobile wallet, or crypto, in a stated 3–5 business days or instantly for a Whop fee. KYC is Whop’s.

A live public campaign, [$8,000 IShowSpeed x Expedia](https://contentrewards.com/c/campaigns/03bda4fd-3474-4b1e-a914-88aaf3ac8372), showed the pattern brands already expect on a card: platforms, **$1.00 / 1K**, **min payout $10**, **max payout $500**, budget spent versus remaining, and requirements locked until you join. [Bot score](https://contentrewards.com/terms) is a 0–100 third-party risk score shown to the brand. At a threshold the submission is flagged and the payout can be held. The score’s inputs are not public.

## What clippers are already angry about

These are the patterns that show up in help centers and on the Trustpilot pages that loaded. They are the spec for Fweta’s empty states and rejection copy.

1. **“Pending” with no clock.** Vyro holds earnings until days after the campaign ends. Clipping.net will not pay until staff and the sponsor both sign. Clippers read that as a stall, especially when the view counter does not match the social app.
2. **A CPM that is not the payout.** Budget proration (Vyro), a creator fee (Content Rewards, Reach), a per-clip cap, and a view floor all shrink the headline rate. If the UI only shows the gross CPM, the payout feels like a cut.
3. **Bot flags with no evidence.** Vyro’s Trustpilot reviews are dominated by “fake views” rejections and bans. Content Rewards’ own terms let a score hold money. FindClout’s terms let them zero a balance on suspicion. The clipper cannot tell a real fraud rule from a way to keep the budget.
4. **View floors that delete small wins.** Vyro’s 5,000 views per post and Clipping.net’s extra 25,000-view campaign total mean a lot of work pays zero. FindClout’s clipper pitch is aimed straight at that resentment.
5. **Country and rail lockout.** Vyro campaigns can be invisible outside the targeted country, and Vyro will not pay by IBAN or crypto. Reach’s onboarding says a wallet is enough, then the terms require KYC at $500. FindClout only wants US/UK/CA/AU audiences. A Reach reviewer said African creators were blocked from campaigns. SideShift reviewers report unsupported phone numbers and failed withdrawals.
6. **Campaigns that go live before the money is real.** Vyro’s clipper terms allow a cancel with no payout if the client’s funds never settle. Content Rewards at least says unspent budget is refunded only after a review, and pool estimates can fall to zero.
7. **Support that does not answer.** Reach’s Trustpilot profile showed slow replies. Vyro reviewers say there is no campaign-manager conversation, only an email. That compounds every hold above.

## What this means for Fweta

Fweta already has the skeleton these sites converge on: a brand sets a CPM and a budget, a clipper submits a link, a human approves, views are polled, and a ledger backs the wallet. The gap is not “add a campaign.” The gap is **whose money is safe, who can cash out in Namibia, and whether a clipper can see why a view did not pay.**

SideShift shows the other pole: a monthly seat ($210–$699) plus creator invoices and 1099s. That is a US hiring tool. It is a poor fit for a Windhoek payout product, and Fweta’s request/accept influencer booking already covers “pay a known creator” without that subscription.

## Prioritized list

Must-have means clippers and brands already expect it, and skipping it makes Fweta look unfinished next to Vyro and Content Rewards. Differentiator means it is where an African, EFT-native product can be the one they stay on.

1. **Reserve the budget before a campaign is public, and show what is left.** Must-have. Vyro can publish a campaign before funds settle and then cancel payouts. Content Rewards and ClipHaven both talk about holding the budget until it is earned. The public card should show amount left, end date, and percent consumed the way [ClipStake’s marketplace](https://app.clipstake.com/marketplace) and [Vues’ campaign index](https://vues.app/campaigns) already do. Unspent budget returns to the brand when the campaign ends.

2. **Print the net rate the clipper will actually receive.** Differentiator, and the fix for complaint 2. Charge the platform fee on the brand side, on delivered spend only, and let the number on the card be the clipper’s number. Vues’ affiliate math and Reach’s “10% on top” pitch both aim here. Content Rewards’ extra 10% creator fee on CPM and pool is the model to avoid. Say the fee before the brand launches and again before the clipper joins.

3. **Ship CPM and pool as the two open-campaign types.** Must-have for pool, because the brief calls for it and only Content Rewards and Clipping.net explain it in public. CPM pays per 1,000 verified views until the budget or the end date. A pool splits the reserved creator budget by verified views at the close. Copy Content Rewards’ honesty: mid-campaign pool amounts are estimates, a view minimum can exclude someone, and if nobody qualifies the pool is not silently kept. Add Clipping.net-style bounties later, not in the first pool.

4. **Lock the payout math when the campaign ends, after a short fraud hold, without waiting for a second human to “approve the numbers.”** Differentiator. Clipping.net waits on staff and the sponsor. Vyro waits 7–10 days with a weak explanation. Content Rewards is the closest: a defined earn window and a defined hold, then the balance is withdrawable. For Fweta, campaign-end settlement should write the ledger entries automatically. The admin queue stays the EFT release, which is the part that still needs a person in v1. Show the hold length in days on the campaign.

5. **Pay creators by Namibian EFT, using the bank fields already in the product, above N$100.** Differentiator. None of the observed sites offer a local African bank payout as the primary rail. Vyro refuses IBAN and crypto and uses Stripe or PayPal. Reach, Promote, and ClipStake push USDT or Solana. FindClout will not even take a non-tier-1 audience. Keep a crypto rail off the critical path so a clipper in Windhoek is not blocked on a wallet. Mask and encrypt the account, and never log it.

6. **Let a brand target countries, including Namibia and SADC, and default discovery to those campaigns.** Differentiator. Vyro already hides campaigns by country, which is why some clippers see an empty board. FindClout’s whole offer is US-heavy pages. A Reach reviewer alleged African clippers were excluded. Fweta should make the country rule visible on the card (“views counted only from these countries”) and should not hide African campaigns behind a US default.

7. **Put a bot score on the submission, and tell the clipper the reason.** Must-have. Content Rewards has the right shape: a 0–100 score the brand sees, a threshold that flags rather than silently deletes, and a hold while a human looks. Vyro’s Trustpilot page is what happens when the clipper only hears “fake views.” Store the signals you are willing to defend (view velocity, country mix, duplicate media, paid-boost detection) and show a short reason plus an appeal. Forfeit the affected clip only. Vues’ terms already say unaffected earnings stay payable; match that.

8. **Cap each clip and cap the campaign, both visible before anyone posts.** Must-have. Vyro uses $1,000 per clip. The Expedia campaign on Content Rewards uses $500 per clip and a $10 minimum payout per platform. A per-clip max is how a pool or a CPM budget survives one viral post. The campaign cap is the brand’s hard stop.

9. **Make the view floor a brand setting, and default it low.** Must-have, because the alternative is the main clipper complaint. Do not ship Vyro’s universal 5,000 or Clipping.net’s usual extra 25,000 as silent platform law. If a brand sets a floor, print it on the card and show progress toward it. FindClout’s “every real view pays” line is popular for a reason; Fweta can offer that as the default and let a brand opt into a floor.

10. **One public campaign card with the fields brands and clippers both need.** Must-have. From the pages above, the card that works is: type (CPM, pool, or per-post), platforms, rate or pot size, budget left, end date, per-clip min and max, countries counted, whether approval is required, source assets, and caption or disclosure rules. Content Rewards also splits CPM by platform. Vues adds “how much of the budget is already paid out.” Per-post (flat fee on approval) can follow pool; it is how Content Rewards pays UGC that should not keep accruing views. Retainer cycles can stay on the influencer booking flow rather than a third campaign engine.

11. **Submit by public link, and show when views were last checked.** Must-have. Every serious board accepts a TikTok, Reel, Short, or X URL and pulls counts. Vyro counts from the moment of submit and says the total will differ from the app for about 30 minutes. ClipStake refreshes about every 6 hours. Fweta’s hourly job is fine if the clip shows “last checked” and the raw platform count beside the verified count. No screenshots.

12. **Statuses a clipper can understand: tracking, in review, approved, rejected with a note, stopped because the budget ended, paid.** Must-have. Clipping.net already publishes this set. Vyro’s rejection note is the minimum bar. “Pending” without a date is the complaint. Rejection and budget-end are different statuses.

13. **KYC at the first EFT, not at signup.** Differentiator relative to blocking new clippers, and a must-have before money moves. Reach lets people start with no ID and then stops them at $500 via iDenfy. Vyro requires the payment processor’s own check before a withdrawal. For Namibian bank payouts, identity belongs on the withdrawal, together with the encrypted bank form, not on the campaign list. Do not copy Reach’s “no ID ever” marketing; the terms already walk that back.

14. **Keep influencer bookings next to open campaigns, and do not charge a monthly seat.** Differentiator versus SideShift. Brands who want a named creator, a rate card, and an approve-the-deliverable flow already have that path in Fweta. Brands who want volume use CPM or a pool. SideShift’s Trustpilot complaints are about subscriptions, double-sided charges, and not being able to disconnect accounts. Do not add a $200–$700 platform subscription on top of creator pay.

15. **Write the abuse rules where the clipper will see them, and apply them to the clip.** Must-have. The shared list across Vyro, Clipping.net, Reach, and Vues: no bought views, no bots, no view trades, no paid boosts, no duplicate posts on the same account, no second Fweta account, posts stay public until paid, disclose that the post is sponsored. A daily submit cap (Vyro uses 5 per account per campaign) keeps one person from flooding a pool. Staff overrides need a reason code so they do not look like the bans on Vyro’s Trustpilot page.

### Explicitly later

- Referral share of the platform fee (Vues pays referrers 20% of the fee).
- Phone share-sheet submit (Vues iOS).
- Agency seats and a managed-service tier (Clipping.net enterprise, SideShift Scale).
- Random weekly bonuses (Reach). They read as a lottery and are easy to dispute.
- A public bot-score algorithm. Publish the reason, not the weights.

### ClipAffiliates

No public page of theirs could be read from this environment. Do not treat third-party writeups as their terms. Re-check `https://www.clipaffiliates.com/` when it resolves, and add a row to the snapshot before building anything aimed specifically at them.
