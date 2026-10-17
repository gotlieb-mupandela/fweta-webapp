# Whop Content Rewards — public research

Observed 17 October 2026 with REA `rea-agents@6.5.0` (`inspect-web-page`, passive Chrome DevTools Protocol attach). Chrome 154 was started locally with a dedicated profile and `--remote-debugging-port=9222`. REA did not drive the pages, evaluate page scripts, or log into any account. No private dashboards, cookies, or account data were collected. Script sources were not requested. Findings below are structural: fields, states, and flows. They are not a copy of Whop’s interface, wording, or assets.

Fweta’s rebuild uses these behaviors as a product reference and keeps Fweta’s own layout, currency (NAD), roles, and ledger.

## How the observation was done

1. `npx rea-agents@latest setup --client cursor --yes` registered REA’s MCP server in `~/.cursor/mcp.json` and installed the investigation skill. This session could not restart to load that MCP server, so the same CLI contracts were used (`list-browser-targets`, `inspect-web-page`).
2. Each capture includes accessibility text, DOM node inventory, resource URLs, and an evidence id. Completeness was `policy_filtered` (response bodies and script sources were not included).
3. `https://contentrewards.com/discover` redirected to `https://contentrewards.com/c/discover`. That app shell rendered navigation only. Campaign cards did not appear without a signed-in session, so the live marketplace grid was **not** observed. The public creator marketing page did render a campaign-feed preview.

## Evidence

| Page | URL | Evidence id |
| --- | --- | --- |
| Whop docs — Content Rewards | https://docs.whop.com/memberships-and-access/third-party-apps/content-rewards | `ev_d46a6e462ea7a2749e1bc21c98ba8202430fcc5cb27d2fdd295b6c7693088df8` |
| Setup article | https://whop.com/blog/set-up-content-rewards/ | `ev_877194df85b78f1a5f710a31976be8e59be973dd0e2c3be595029f9eece71210` |
| Terms | https://whop.com/content-rewards-terms-of-service/ | `ev_92b40b07dd86c15843ffb015e415aba3fa3290a91824155541580254793ba0a1` |
| How it works | https://help.contentrewards.com/en/articles/15319790-how-content-rewards-works | `ev_7e80ec2b940365f06c5aac3597c4daed04cb98c7e3f1fa2f115b0f9bfa2e2df0` |
| Create a campaign | https://help.contentrewards.com/en/articles/16822142-create-a-campaign | `ev_61e68bf80e92eb7fa1c92b01a9b2081a6e73000df544d056af080d5e20f75a71` |
| Fund your account | https://help.contentrewards.com/en/articles/15319798-fund-your-account | `ev_edf004adbbe642b941cf782652c825a0f40eaf7a128c908c536929a51b81c728` |
| Write a brief | https://help.contentrewards.com/en/articles/15319807-write-a-brief-creators-will-follow | `ev_c76933374e69ed4733da9345f9f7c1af542a62f43d77bc65fd358a781d38cdde` |
| Review submissions | https://help.contentrewards.com/en/articles/16822143-review-submissions | `ev_7e9ce236d94278f98f6cdd89ed16a096bb7b002826455d31305d1f1f767d6876` |
| Numbers to watch | https://help.contentrewards.com/en/articles/15319810-which-numbers-to-watch-on-a-campaign | `ev_a420cba80b58a9a810b32d3bace2e5fc6f9c752b088dced82f7d014fe0f39fd0` |
| Find and apply | https://help.contentrewards.com/en/articles/16817237-find-and-apply-to-a-campaign | `ev_b515d4e162efffad326585e6792630ce5e0e9bbb658c80ad8d610a43fc987ef7` |
| Submit a video | https://help.contentrewards.com/en/articles/15319814-submit-a-video | `ev_20a78c3eb21ad8445018d000b84a55bf3879d79bd2ea0ba7b8dbc0d0d5e8f7b1` |
| Approval and review | https://help.contentrewards.com/en/articles/15319801-approval-and-review | `ev_03df01653eb3697781c1e45bc2ff76e4b6cf9300ded020116b9d90539e6c5b6d` |
| Payouts | https://help.contentrewards.com/en/articles/15319815-payouts | `ev_c0f725c3aa647d037a0060e0e7fba34acd8358c14669d12e06ed043f8ed2fe83` |
| View counts | https://help.contentrewards.com/en/articles/16829638-why-your-view-count-does-not-match-ours | `ev_fc05334b958cc44a5e848e8c30c6ced8c2717caa5772d43965b29947fc8ffd3b` |
| Creator help index | https://help.contentrewards.com/en/collections/19651480-for-creators | `ev_176d3f7b36619efbd36a9dd675c5e71d4684425480de5b60878c2adb6203c441` |
| Creator marketing / feed preview | https://contentrewards.com/creators | `ev_2c51a55ea844145d194534fe8df4e2df6be4c3ee479e05abc82c4bc36beeb13a` |
| Launch guide | https://contentrewards.com/launch-a-campaign | `ev_40a10f6117a213d10a3c296d3e9ef766a0743a15196b706267b58c5a6bdd2f66` |
| Discover app shell (no cards) | https://contentrewards.com/c/discover | `ev_53596141ac18cc0d7688f23c908847f20e6d56b0d7378caae1e037749f27c044` |
| Whop home | https://whop.com/ | `ev_8913ff71a66d1bde4389904c12a49ae0ebae334f6390c8622f1670b551cbc492` |

## Product loop

Public help describes one loop: a brand funds a campaign and writes a brief; a creator posts on TikTok, Instagram, YouTube, or X and submits the link; the brand approves or rejects; approved views are paid from that campaign’s budget.

Docs split campaigns into two content types:

- **Clipping** — short cuts of the brand’s existing long-form video (podcasts, streams, webinars) for TikTok, YouTube Shorts, Instagram Reels, and X.
- **UGC** — original posts made to the brand’s guidelines.

The current help center also names three **pay models**: CPM (per 1,000 views, with a per-clip maximum and the budget as the ceiling), per post (flat fee once a minimum view count is hit), and retainer (a set amount per cycle). Fweta’s v1 equivalent is the CPM model only, which is the one this task specifies.

The terms page describes an offer as a rate (example shape: an amount per 1,000 views), a maximum payout, an end date, uploaded source content, and written requirements. Payment stops when the max payout or the end date is reached, whichever comes first.

## Campaign creation

Docs field list (create form):

1. Campaign name (public).
2. Type: clipping or UGC.
3. Brand category.
4. Budget, with a currency.
5. Reward rate per 1,000 views.
6. Minimum payout — estimated earnings must clear this before a clip enters the review queue. A worked example on the docs page: rate $3 and minimum $6 means 2,000 views.
7. Maximum payout per video, so one viral post cannot drain the budget.
8. Optional flat fee added to every approved submission.
9. Platforms accepted.
10. Available content / asset links (guidelines, examples, footage).
11. Requirements the brand will approve or reject against.

The May 2025 setup article says six fields are mandatory: title, content type (clipping, other, UGC), category, total budget, reward rate per 1k views, and platforms. Tutorial video, asset links, audio links, and maximum payout are described as optional there. It also says budget, rate, and flat fee cannot be edited after create. The September 2026 help article is stricter: after launch, model, platforms, access type, and budget are locked; money is added with a top-up; other settings stay editable.

September 2026 create flow (help article), as a wizard:

1. Choose model (CPM, per post, or retainer). Retainer is fixed per cycle; CPM is per 1,000 views; per post is a flat fee per approved video.
2. **Details** — name, description, type, category, thumbnail, reference links, videos, and files.
3. **Configuration** — who can join (open to public vs application), platforms, budget (help text says at least $1,000 for a new campaign), CPM rate, minimum and maximum per clip, and an optional “require pre-approval before posting” toggle. Public campaigns appear on Discover when “show on Discover” is on (default). Private campaigns are invite-only.
4. **Requirements** — rules the brand may later reject against. A rule that is not written here is not a valid rejection reason.
5. **Creator details**, then a summary, then **Fund now**. Nothing is saved until “Save as draft” or “Fund now”. Continue stays disabled until required fields are filled. The campaign goes live when payment confirms.

The brief article says a campaign page should lead with the work, the rate, and the per-clip cap. Reference material (videos, images, brand files, up to four links) sits on the campaign page. Requirements should be checkable (format, source footage, caption, audience, proof), not vague taste words. Reject by naming the missed rule.

## Funding and budget progress

- Money sits on the campaign, not as a monthly subscription.
- Help center (September 2026): first payment is the budget, described as at least $1,000; later top-ups are described as $100 or more. The top-up dialog shows current budget, amount added, a processing estimate, and total charged.
- Nothing is reserved for a clip until approval. Approval draws what the clip has earned so far (creator payout plus their platform fee). Rejecting after that returns the reserved amount if it has not already paid out.
- When the budget is exhausted the campaign pauses and leaves Discover: no new submissions, and approved clips stop earning on new views. A top-up restarts it.
- Unspent budget can be requested back after the pending queue is cleared. The campaign pauses immediately. A team reviews the refund; it is not automatic.
- The docs article is older and says there is no minimum budget, and that a campaign moves from “Pending budget” to “Active” after the deposit. The blog article matches that pending → live transition. The help center is the newer, more specific source and does state minimums. Fweta already funds from the brand wallet with no platform minimum; that stays.

Budget progress is visible to the brand as the bar moves toward the limit when submissions are approved (setup article). The public creator page preview shows cards as spent / total (for example a fraction of the budget already paid).

## Discover feed

App shell observed at `/c/discover` without campaign data. Navigation items: Home, Campaigns, Discover, Analytics, Submissions, Drafts, Earnings, Settings.

Public creator page (`/creators`) rendered a feed preview:

- Cards show campaign name, age, paid / budget, a clip count, and a rate per 1k.
- Sort: Featured, Newest, Budget (highest to lowest), CPM (highest to lowest), Paid out (highest to lowest), Creators (highest to lowest).
- Filters: Content, Category, Type, Budget.
- A separate stats strip shows payouts, effective CPM, stated CPM, and views.

Help article “Find and apply”:

- Discover can be searched by name and narrowed by platform, model, and category.
- Cards show the campaign, accepted platforms, and budget remaining. Rate, minimum, and maximum are on the campaign page.
- Open campaigns: join immediately. Application campaigns: short form (account, why you fit, brand questions) then pending until the brand accepts. Private campaigns are absent from Discover.
- After join, the action becomes “Submit clip”.

## Campaign page

From the brief and find articles, a creator should be able to see, quickly:

- What to make.
- Rate, and the most one clip can earn (repeated per platform in stronger campaigns).
- Budget remaining.
- Requirements used at review time.
- Reference files and links.
- Platforms.
- Submit (or Apply, if the brand screens creators).

## Submission

Help article “Submit a video”:

- One published post is tied to one campaign.
- Creator posts first on a connected account, then pastes the link (short share links work). Several links can be pasted, one per line.
- Three checks: post is from a linked account; post is not already in this campaign; post is under 30 minutes old, because they count views from when they start watching.
- Clip lands on Submissions as **Pending**. Views can count once a CPM minimum is passed, but nothing is reserved until approval.
- Pre-approval campaigns take a draft file instead of a link. Draft states named: Needs changes, Pending, Approved, Posted, Rejected. Fweta v1 stays link-only and manual review (existing product decision).

Fweta does not connect social accounts and must accept ordinary public demo links, so the 30-minute window and “linked account” check were **not** copied. Platform is detected from the host (TikTok, Instagram, YouTube, X) and must be one the campaign allows. Duplicate links in the same campaign are rejected.

## View tracking

“Why your view count does not match ours”:

- They read the platform’s public view count on a schedule, not live, so their number lags.
- Two clocks: an **earning** window (views count after the campaign minimum; on CPM, earning stops 7 days after approval) and a **monitoring** window (the post must stay public; unusual engagement can be flagged). Views after the earning window are real but unpaid.
- Hitting the per-clip maximum stops earnings while the platform view count keeps rising.
- A paused or exhausted campaign stops counting new earning views until the brand adds budget. An ended campaign still settles views already inside the earning window.

Fweta already polls with `poll-submission-views` (Apify when configured, otherwise simulated growth) and stores `view_snapshots`. The rebuild also snapshots **pending** clips so the review queue can see views before approval. Earnings still post only after approval. The 7-day-then-hold schedule was not copied: once a clip is approved, verified views pay immediately into the existing wallet, still capped by the per-post maximum and remaining budget. Further polls keep crediting new verified views until the cap, the budget, the end date, or a pause.

## Review queue

Brand help and the setup article agree on tabs: **Pending**, **Approved**, **Rejected**. Flagged is a separate action, not a creator-facing status in the newer help (the 2025 article listed Flagged as a fourth category).

- Pending cards show the post, views, and estimated payout. Newer help also mentions engagement rate, bot likelihood, and a view curve. Sort by time, views, or bot confidence.
- **Approve** applies immediately and starts the payout clock. It does not by itself release cash before the hold in their system.
- **Reject** requires a typed reason. The control stays disabled until a reason is entered. The creator sees that reason. Rejecting returns anything reserved, if it has not already paid.
- **Flag** freezes payout for suspected fake engagement or abuse and does not itself reject. A bot score is a signal, not an automatic rejection.
- Nothing auto-approves in the September 2026 help. The May 2025 article described an AI reviewer and auto-approve after 48 hours. Those two public sources disagree; the newer help center says overdue clips are marked overdue and are **not** paid automatically. Fweta stays manual-only, which matches the current product decision and the newer help article.
- A clip below the minimum payout is not ready for the queue.

## Payouts and earnings

CPM, as described on the payouts and approval articles:

- Pay = rate per 1,000 views, up to the per-clip maximum, and only while budget remains.
- Views accumulate before review. Approval reserves what has been earned so far. Their product then keeps earning for 7 days, holds 3 days, and pays on day 10, minus a creator fee they describe as 10%.
- Earnings UI words they name: Total earned, Received, Pending, plus a timeline (processing, sent, or returned).
- Brand analytics they tell operators to watch: spend, submissions vs approvals, effective CPM (spend / views), and creator concentration (views, earnings, and approved clips per creator). That creators list is the per-campaign leaderboard.

Fweta mapping, including the later owner counting rules and the competitor teardown:

- CPM uses qualified views only: views after the baseline saved at submit. `floor(qualified / 1000 * net rate)`, then the per-post cap and the remaining reserved budget.
- The number on the card is the clipper's rate. A 10% platform fee is reserved from the brand wallet at launch and charged only as views are paid. Unused fee is returned. Clippers are not charged that fee.
- A pool campaign does not pay per view during the flight. At the end it splits the reserved budget by qualified views among approved clips that clear the view floor. Mid-flight amounts are estimates. If nobody qualifies, the pot returns to the brand.
- On approve, CPM money is set aside in the pending wallet (`campaign_reserve`). Views count for 7 days after approval, or until the campaign ends, whichever is sooner. A 3-day fraud hold follows. If the post is still live, pending moves to available (`campaign_release`). If it was removed, that clip is clawed back. Other clips stay payable.
- Bank payout is the existing manual Namibian EFT, minimum N$100. No payment gateway and no crypto. Identity is collected on the first withdrawal, not at signup.

## States

| Object | States observed |
| --- | --- |
| Campaign | Draft, pending budget, active, paused (budget empty or refund requested), ended. Access: public, application, or private. |
| Submission | Pending, approved, rejected. Flag freezes payout without a creator-visible flag tab in the newer help. Drafts have their own states when pre-approval is on. |
| Payout | Pending, cleared, blocked. |
| Refund request | Requested, in review. |

## What Fweta adopted

- Brand form: reserved budget, net NAD rate per 1,000 views or a pool, view floor (default 100), minimum before review, max per post, platforms, brief, caption rules, reference links, start and end, Namibia and SADC countries by default.
- A campaign is public only after the creator budget and the 10% fee set-aside are reserved from the wallet.
- Discover defaults to campaigns that include Namibia. Cards show type, platforms, rate or pot, budget left, end date, min and max, countries, brand approval, source files, and caption rules.
- Paste a post link after a bio-code check. Platform is detected from the URL. Baseline views are stored so earlier views are not paid. The clip shows when views were last checked.
- Statuses a clipper can read: Tracking, In review, Approved, Rejected with a note, Stopped, Paid (in the wallet).
- View counts are manual. An admin saves a count, or confirms a creator screenshot. Earnings, the wallet, the budget, and the leaderboards recompute in that same save. YouTube, TikTok, Instagram, X, and Apify fetchers stay off unless their flags are exactly true. There is no simulated growth.
- The view floor freezes when the campaign goes live. A rejected or forfeited clip returns only the unsettled share to the brand. Money already in the wallet is not reversed.
- Discover is a public catalog: featured campaigns, top campaigns, and top clips. The campaign leaderboard shows handle, views, and clip count.
- Bot score is shown to the brand. The clipper sees a plain reason and can appeal once. Upholding a flag forfeits that clip only.
- Published abuse rules are on the campaign and enforced per clip (duplicate links, 5 posts per account per day, post must be public).
- Settlement writes ledger entries only. Admin still marks the bank payout paid.

## What was deliberately not copied

- Whop name, visual system, marketing lines, screenshots, and testimonials.
- Their creator-side 10% fee, $1,000 launch minimum, and $100 top-up minimum.
- 30-minute submit window and OAuth account linking. Fweta uses a public bio code.
- Per-post and retainer pay models, application gating, draft pre-approval, and AI auto-approve.
- Crypto payout rails.
- A published bot-score formula. The reason is shown. The weights are not.

## Notifications

Pull request 16 (Resend email and an in-app bell) was still a draft and was not on `main` at implementation time, so this change does not call it. Existing withdrawal notification jobs are unchanged.
