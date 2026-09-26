# Betterplayer

Betterplayer lets gamers enter their own online matches for credits.
The beta is a **closed beta, credits only**: no real money anywhere.
Players must be **18+** and in **Spain**.

## Who you are working with

- The owner is a beginner and works **from an iPhone only**.
- Explain every change in plain words: what changed, why, and what they will see.
  Avoid jargon; when a technical word is needed, say what it means.
- They preview the app on the web (GitHub Pages), not in Xcode. Every change must
  keep `npx expo export -p web` working.

## Money rules (never break these)

1. **The client never writes credits, matches or disputes.** Only Cloud Functions
   do. The app may read them and may call Cloud Functions, nothing more.
2. **The ledger is append-only.** Entries are never edited or deleted; mistakes
   are fixed with a new correcting entry.
3. **Balances are computed from the ledger**, never stored as an editable number.
   `wallets/{uid}` (`available`, `locked`) is a read-only summary that Cloud
   Functions update in the **same transaction** as the ledger entry it reflects.
4. **No secrets in the app.** Anything in the app ships to every user. The Firebase
   web config in `src/firebase/config.ts` is public by design; API keys for other
   services (e.g. `ANTHROPIC_API_KEY`), admin credentials and service accounts belong
   in Cloud Functions (Secret Manager).

5. **Never log secrets.** No API keys, passwords, tokens or whole error objects in
   logs. In Cloud Functions log errors only with `safeError(e)` / `logError()` from
   `functions/src/safeLog.ts`; every function runs inside `guardCallable` /
   `guardBackground`, so the Firebase library never logs a raw error ("Unhandled
   error"). `functions/scripts/check-logging.mjs` runs on every functions build
   (and so on every deploy) and fails on `console.*`, `String(e)`, an error object
   passed to `logger`, or a secret passed to `logger`.

## Game rules

- Games (short line `tile` on the game tile, full `rules` on the create and match
  pages, both in `functions/src/shared/games.ts`):
  - **EA FC**: 1v1. Draws are decided on penalties, so there is always a winner.
    Tile "1v1 · Draw decided on penalties".
  - **Fortnite** and **Warzone Rebirth**: squad of 2–4 Betterplayer players in the
    SAME in-game squad. Most eliminations wins; tie → most damage; still tied → the
    80% is split equally between the tied players. Report = eliminations + damage
    per player; proof = the end-of-match squad scoreboard.
    Tile "Squad 2–4 · Most eliminations wins the pot".
  - **Clash Royale**: 1v1 Friendly Battle between friends. Most crowns wins; a draw
    is refunded (every entry back, no fee). No lobby code: the match room shows both
    players' Clash Royale tags with Copy buttons and how to add each other.
    Tile "1v1 · Friendly battle · Most crowns wins".
- Proof capture (`capture` in shared games): EA FC, Fortnite, Warzone = camera only
  (a console/PC screen); Clash Royale (played on the phone) = camera or a screenshot
  from the photo library. Duplicate and timing checks apply to both.
- Every player gets **10 starter credits, once**.
- Entry is **fixed at 2 credits** per player.
- Betterplayer takes a **10% fee of the whole pot** (all entries added together),
  whatever the number of players. It is simulated: credits only, no money.
  - 1v1: pot 4 credits, fee 0.40, the winner gets 3.60.
  - 3 players: pot 6 credits, fee 0.60, the winner gets 5.40.
  - 4 players: pot 8 credits, fee 0.80, the winner gets 7.20.
- **The fee rate lives in Firestore `config/fees.rate`** (0.10; missing or invalid →
  `DEFAULT_FEE_RATE` 0.10). `createMatch` reads it and stores `feeRate` (with `pot`,
  `fee`, `winnerGets`) on the match; settlement and reversal always use the match's
  own rate (`feeRateOf`; matches created before this have no `feeRate` and keep
  20% = `LEGACY_FEE_RATE`). Old ledger lines are never edited. The app reads
  `config/fees` (`useFeeRate`) for tiles, Create and Wallet; a match page shows the
  match's own rate. The beta rules text says 10%: change it (new version) if the
  rate changes.
- **Winner takes all:** the winner gets everything left after the fee. Nobody
  else in the match gets credits back. On a tie (squads) the tied winners share
  it equally in cents (`splitWinnings`; leftover cents go to the first tied
  players in join order, e.g. 6.40 / 3 = 2.14 + 2.13 + 2.13).
- A player can play **at most 10 matches per day**.
- **No credits move until a match is validated**: either approved automatically by
  the photo check (only when `config/review.autoApprove` is on and every condition
  in "Automatic result check" holds) or decided by a Betterplayer admin. Until then
  the match shows as "awaiting result" / "under review".

## Words in the app

- **No cash words.** Never show "cashout", "stakes", "bet" (or similar, like
  "wager", "gamble", "payout", "odds") anywhere in the app. Say "credits",
  "entry", "match", "win" instead.
- **No game publisher logos or artwork.** Show games as their name on a coloured
  tile (`src/components/GameTile.tsx`, games listed in `src/constants/games.ts`).

## Project layout

- `src/app/` – screens (Expo Router). `(tabs)/` holds Home (`index`), Matches,
  Create (the raised round + button), Wallet and Profile.
- `src/components/` – shared UI: header, cards, buttons, empty states, game tiles.
- `src/constants/theme.ts` – colors and fonts. Use these, don't hard-code colors.
- `functions/src/shared/games.ts` – **the one place for game and credit rules**
  (players, format, rules text, needed game ID, entry, fee, payout, limits). Used by
  the Cloud Functions and by the app (imported as `@shared/games`). Keep it import-free.
- `src/constants/games.ts` – adds tile colours to the shared game config.
- `src/app/(auth)/` – Sign up and Log in, shown only when signed out.
- `src/app/complete-profile.tsx` – shown if someone is signed in but has no profile yet.
- `src/auth/` – sign-in state (`AuthProvider`), form checks and plain error messages.
- `src/firebase/` – Firebase app, Auth and Firestore setup. On the web Firestore uses a
  persistent local cache (IndexedDB, `persistentLocalCache`): screens paint from the
  cache and a reopened app only downloads what changed.
- `src/wallet/` – live, read-only wallet and ledger data, credit formatting and labels.
  Wallet history is read 20 lines at a time ("Show more", up to 100). A negative
  available balance (an admin reversal after a payout) shows an explanation.
- `src/matches/` – match types, live Firestore hooks, and `api.ts` (the only way the
  app changes matches: callable Cloud Functions). `MatchesProvider` keeps ONE live
  copy of "open matches" (30) and "my matches" (20) for the whole app; Home and
  Matches slice it (`useOpenMatches(max)` / `useMyMatches(max)`), so they don't open
  duplicate listeners. `src/app/match.tsx` is the Match
  room (`/match?id=…`; a query parameter so it works as a static page on GitHub Pages).
- `functions/` – Cloud Functions (TypeScript, Functions v2, Node 22, region `europe-west1`,
  `maxInstances` 10; the photo functions `submitResult` / `disputeResult` run with
  1 GiB, 1 CPU, `concurrency` 8 and `maxInstances` 30). sharp, the Anthropic SDK and
  nodemailer are loaded lazily (`await import`) so the light functions start faster.
  `onUserCreated` gives the 10 starter credits once (`ledger/grant_{uid}` + `wallets/{uid}`).
- `firestore.rules`, `firestore.indexes.json` – security rules and indexes.
- `storage.rules` – Firebase Storage rules for result screenshots.
- `firebase.json`, `.firebaserc` – Firebase project config (`betterplayer-beta`).
- `.github/workflows/firebase-deploy.yml` – **the normal way to deploy Firebase**: on
  every push to `main` that touches `functions/`, rules, indexes or Firebase config
  (or "Run workflow" in the Actions tab), deploys functions, Firestore rules and
  indexes and Storage rules with `--non-interactive --force` (Node 22; signs in with
  `google-github-actions/auth` using the `GCP_SA_KEY` secret). It also grants the
  Storage service agent `roles/firebaserules.firestoreServiceAgent` (the CLI skips
  that question when unattended). Uses the repository secret `GCP_SA_KEY` = JSON key
  of the service account `github-deploy` (roles: Editor, Firebase Admin, Cloud Run
  Admin, Project IAM Admin, Service Account User; the workflow adds Secret Manager
  Admin itself). Never runs on pull requests.
- `deploy.sh` – backup way to deploy (same `firebase deploy` as the workflow). If
  `~/.deployer-key.json` exists (the `github-deploy` key, kept outside the repo) it
  sets `GOOGLE_APPLICATION_CREDENTIALS` to it; otherwise it uses the machine's own
  Google credentials. No gcloud sign-in checks. Key files are in `.gitignore`.
- `top-up.sh` – starter credits for players who signed up before the Cloud Function
  existed. Not run by `deploy.sh`. `./top-up.sh` previews, `./top-up.sh --apply` grants. Safe to re-run
  (uses the same idempotent `grantStarterCredits`).
- `.github/workflows/web-preview.yml` – publishes the web preview on every push to `main`.
- `.github/workflows/maintenance.yml` – one-off data jobs run by hand, preview unless
  "apply" is ticked: `migrate-platforms`, `rebuild-stats`, `backfill-image-hashes`
  (adds `segments` to old image fingerprints), `migrate-private` (moves old matches'
  lobby code and game IDs into `matches/{id}/private/data`). Prints counts only.
- `storage.lifecycle.json` – result photos are deleted 90 days after upload (the deploy
  workflow applies it to the bucket with `gcloud storage buckets update`). The image
  fingerprints in `imageHashes` are kept. The beta rules (section 7) say so.
- `BACKLOG.md` – agreed ideas not built yet (native iOS app, Clash Royale battle log).
- `.github/workflows/inspect-log.yml` – read-only, run by hand (function name + time
  window): describes WARNING+ log entries WITHOUT printing their text, and says
  YES/NO whether they contain any of our secrets. Note: GitHub stars out every line
  of the `GCP_SA_KEY` secret, including lines that are just `{` or `}`, so an empty
  `{}` shows as `***` in Actions logs; that alone doesn't mean a secret leaked.
- `.github/workflows/check-match.yml` – read-only, run by hand (two gamer tags): did the
  automatic check run on their latest match, what it returned, and warnings/errors in
  the `submitResult` logs. Prints no emails or in-game names (Actions logs may be public).

## Accounts

- Email and password sign-in (Firebase Auth). Users stay signed in.
- **Email verification**: sign-up sends a verification link; while `emailVerified` is
  false the app shows `src/app/verify-email.tsx` (`AuthStatus` `needsEmail`). No button
  to confirm: it reloads the user every 5 s and when the app/tab comes back into focus
  (`checkVerified`), and moves on by itself; "Resend email" has a 60 s cooldown
  (`useResendCooldown` in `src/auth/verification.ts`). Existing players see it once at
  their next login.
- **Email action links** (`src/app/auth/action.tsx`, `/auth/action?mode=…&oobCode=…`,
  outside the sign-in gates): Firebase's emails link here once the console's
  "Customize action URL" is set to `https://betterplayer23.github.io/betterplayer-app/auth/action`.
  `verifyEmail` applies the code and goes straight to Home (or the next gate) with a
  short "Email verified" message (`setFlash` / `useFlash`); signed out → "Log in".
  `resetPassword` shows a new-password form (`confirmPasswordReset`). `recoverEmail`
  undoes an email change and offers a password reset. Expired / used / incomplete links
  show a plain error and a way to get a new link. Results are kept per code so the page
  survives the brief loading screen after verifying. `createMatch` and `joinMatch` refuse an unverified email
  (`requireVerifiedEmail`, `request.auth.token.email_verified`). Emulator tests mark
  users verified with the Admin SDK (`updateUser(uid, { emailVerified: true })`).
- The tabs are only reachable when signed in (`Stack.Protected` in `src/app/_layout.tsx`).
- `users/{uid}` holds: `gamerTag`, `platforms` (a list of 1–5 of `pc`, `playstation`,
  `xbox`, `switch`, `mobile`; multi-select chips at sign-up and in Profile; older
  profiles had a single `platform`, moved by the Maintenance job `migrate-platforms`;
  read with `platformsOf()`),
  `ageConfirmed: true`, `ageConfirmedAt`, `country: "ES"` (self-declared), `gameIds`
  (`eaId`, `activisionId`, `epicName`, `clashRoyaleTag`), `createdAt`.
- **Never put credits or reputation in `users/{uid}`**: they are server-only.
- The app may only change `gamerTag`, `gameIds` and `platforms` after sign-up (and
  remove the old `platform` field).
- Gamer tag: 3–20 letters, numbers or underscores. Password: at least 8 characters.

## Beta rules acceptance

- Text and version live in `functions/src/shared/betaRules.ts` (`@shared/betaRules`).
  To change the rules, edit the text **and bump `BETA_RULES_VERSION`**: everyone is
  then asked to accept the new version once.
- Callable `acceptRules({ version })` (`functions/src/rules.ts`) writes
  `acceptedRulesVersion` and `acceptedAt` (server timestamp) on `users/{uid}`. Only
  the current version; accepting again keeps the first date. The app can't write
  these fields (users update rule allows only `gamerTag` and `gameIds`).
- App: `AuthStatus` `needsRules` → `src/app/accept-rules.tsx` (gate after sign-up and,
  for existing players, once at next login; checkbox "I am 18+ and accept the beta
  rules"). Read-only `src/app/beta-rules.tsx`, linked from Profile and Sign up.
- `createMatch` / `joinMatch` refuse players who haven't accepted the current version.
- Current version: **v6**. Sections: 1 Who can join, 2 Credits, 3 Games and winners
  (the game rules above; 10% fee, winner 90%), 4 Fair play, 5 Review (checked
  automatically; unclear checks and disputes go to an admin, whose decision is
  final), 6 Beta, 7 Your data (controller "Betterplayer (Better.player.one@gmail.com)";
  stats visible to other players; screenshots checked by an AI system (Anthropic);
  any player can dispute; result screenshots deleted after 90 days, fingerprints kept).

## Credits data

- `ledger/{entryId}`: `uid`, `type`, `amount`, `description`, `createdAt`. Players
  read only their own entries; nobody writes from the app. The starter grant's ID
  is `grant_{uid}`, which is what makes it impossible to grant twice.
- Ledger types and their effect on the wallet (settlement entries also store
  `availableDelta` / `lockedDelta`, so every wallet can be rebuilt from the ledger):
  - `starter_grant` (`grant_{uid}`): available +10.
  - `stake_lock` (`lock_{matchId}_{uid}`): available −2, locked +2.
  - `winnings` (`settle_{matchId}_{uid}`): available + (pot − 20% fee), locked −2.
  - `stake_lost` (`settle_…`): locked −2 (the entry went into the pot).
  - `refund` (`settle_…`, admin cancel): available +2, locked −2.
  - `stake_returned`: label only for now ("Entry returned"); nothing writes it yet.
- App labels: "Starter credits", "Entry locked: [game] match", "Winnings",
  "Entry lost", "Entry returned", "Refund". Never "stake" on screen.
  - `correction` / `refund` (`reverse_{matchId}_{uid}`, lockedDelta 0): an admin
    reversing an automatic decision; each is the difference between what the
    player got and should have got (no entry when it's 0). Never edits the old `settle_…` entries.
- `platform_ledger/{matchId}`: the 20% fee per completed match (server-only).
  `platform_ledger/{matchId}_reversal` gives the fee back (negative) when a reversal
  cancels the match.
- `wallets/{uid}`: `available`, `locked`, `updatedAt`. Owner can read; nobody writes
  from the app.
- Every Cloud Function that moves credits must be idempotent (safe to run twice)
  and write the ledger entry and wallet change in one transaction.

## Matches

- Lifecycle: `open` → `full` → `started` → `awaiting_result` → `under_review` →
  `completed`, or `cancelled`. Round A covers open → started; round B (results,
  review, settlement) covers the rest.
- All match changes go through callable Cloud Functions in `europe-west1`
  (`functions/src/matches/actions.ts`): `createMatch`, `joinMatch` (by id or share
  code), `leaveMatch`, `setLobbyCode`, `startMatch`, `cancelMatch`, plus the scheduled
  `expireOpenMatches` (every 5 min, cancels open matches after 15 minutes).
- Create/join need a profile with the game's ID, at least 2 available credits, and
  fewer than 10 matches created or joined today (Europe/Madrid, `dailyCounts/{uid}_{day}`).
- Share codes: 6 characters without 0/O/1/I, reserved in `matchCodes/{code}`.
- **Private match data**: the lobby code and each player's in-game ID live in
  `matches/{id}/private/data` (`MatchPrivateDoc`: `lobbyCode`, `gameIds` uid → id),
  readable only by the match's players and admins (`useMatchPrivate` in the app,
  `gameIdOf()` to read a player's id). The match document (readable by every
  signed-in player) holds only `uid` + `gamerTag` per player. Matches created before
  this keep `players[].gameId` / `lobbyCode` until the `migrate-private` job runs;
  `gameIdsOf()` (functions) and `gameIdOf()` (app) read both shapes.
- `startMatch` locks 2 credits per player in one transaction: ledger
  `lock_{matchId}_{uid}` (type `stake_lock`, amount 2) and wallet available → locked.
  Idempotent. If any player is short, nothing is locked.
- Signed-in players can read `matches`; nobody writes them from the app.
  `dailyCounts` and `matchCodes` are server-only (closed by the catch-all).
- The internal type name is `stake_lock`, but the app shows it as
  **"Entry locked: [game] match"** (no cash words on screen).
- Callable errors: the Firebase library appends " [400]"-style codes to messages;
  always show them through `matchError()` in `src/matches/api.ts`.

## Results and review (round B)

- Flow: `started` → a player reports (`submitResult`) → `awaiting_result` with
  `responseDeadline` = +30 min → the other players `confirmResult` or
  `disputeResult` → `under_review` (`disputed` true/false) → an admin decides
  (`adminDecide`) → `completed` or `cancelled` (settled).
- Only ONE report per match (the first player to report; no edits). The others
  confirm or dispute. All others confirmed, or any dispute → `under_review`.
  `closeResponseWindows` (every 5 min) moves `awaiting_result` past the deadline to
  `under_review` with `disputed: false` (silence counts as confirmation).
- Reports: `matches/{id}/reports/{uid}`; disputes: `matches/{id}/disputes/{uid}`.
  Readable by players of that match and admins; written only by functions.
- Score checks live in `checkResult` in `functions/src/shared/games.ts` (used by the
  app form and the server). It returns the `winners` (join order): EA FC goals (+
  penalties only when level; the reporter picks the winner, which must match),
  Clash Royale crowns 0–3 (level = draw, `winners` empty), Fortnite/Warzone
  eliminations 0–199 + damage 0–99 999 (tie rules above). For Clash Royale and squads
  the winner is worked out from the numbers (`winnerUid` optional).
- Reports and settled matches store `winnerUids` (2+ = tie, none = draw) and
  `draw`; `winnerUid` only when there is exactly one winner. Use `winnersOf()` to
  read them (older data only has `winnerUid`). Old reports may have `placements`.
- A draw settles as `completed` with `draw: true`: `refund` entries for everyone,
  no `platform_ledger` fee, reputation +1 each. `adminDecide` `approve` uses the
  reported winners; `override` always sets one winner.
- Screenshots: Storage `results/{matchId}/{uid}/{file}`. A player of a started or
  awaiting match uploads into their own folder only, after `startedAt` and before
  `responseDeadline`; jpeg/png/webp (no HEIC: the server can't read it), ≤ 10 MB;
  never overwritten (`resource == null` on create); deleted after 90 days by the bucket
  lifecycle rule. Players of the match and admins can read. Functions check the file
  exists, is in the caller's folder, was uploaded inside the match window, and isn't a
  (near-)duplicate. The app shrinks the picture before upload (`shrinkImage` in
  `src/matches/upload.ts`: longest side 1600 px, JPEG 85%; web canvas / native
  `expo-image-manipulator`), so uploads are small and fast.
- Score boxes: "Next" (`enterKeyHint`) moves to the following box and "Done" on the
  last; on iOS native an `InputAccessoryView` bar adds Next/Done above the number
  pad (the iPhone number pad has no return key). Clash Royale crowns jump to the
  next box after one digit; goals, eliminations and damage don't.
- The app opens the **camera only** (`src/matches/upload.ts` `takePhoto`): on the web a
  file input with `accept="image/*" capture="environment"`; native uses the system
  camera for now (expo-camera later). `src/components/ResultScreenExample.tsx` shows
  a drawn example of the right screen per game (`resultScreen` in shared games).
- Admins: a document at `admins/{uid}`, created by hand in the Firebase console.
  The Admin tab shows only for them. `adminDecide(decision, winnerUid?, note)`:
  `approve` (reported winner), `override` (another player), `cancel_refund`.
  Note required (3–500 chars). Writes `admin_reviews/{matchId}` (`decidedBy`
  `admin` or `vision`, `players`).
- An admin can never decide a match they played in: `adminDecide` refuses with
  "You can't review a match you played in", and the Admin tab shows "You played in
  this match, another admin must review it" with the buttons disabled.
- Settlement is one idempotent transaction in `functions/src/matches/admin.ts`
  (`prepareSettlement` reads, `writeSettlement` writes), shared by `adminDecide` and
  automatic approval.
- Reputation `reputation/{uid}` {points, matchesCompleted, disputesLost}, server-only,
  owner-readable: +1 per completed match; −5 (and disputesLost +1) when your report
  is overridden or your dispute is rejected. Cancel & refund changes nothing.

## Player stats

- Phase 1 (built): stats per game from our own settled matches. `playerStats/{uid}`
  = { gamerTag, games: { [gameId]: { played, wins, losses, draws, creditsWon, streak,
  elo, lastMatchId } } }; readable by any signed-in player, written only by functions.
  Logic in `functions/src/shared/stats.ts` (import-free, used by functions and app).
- Updated in the SAME transaction as settlement (`writeSettlement`) for every settled
  match except cancel & refund (a draw counts as played + draw). What each match did
  is kept in `statsEntries/{matchId}` (server-only) so `reverseAutoDecision` can take
  it out and count the corrected result (cancel → not counted).
- Skill rating = Elo, start 1000, K = 32, from ratings before the match. Each winner
  beats each non-winner (squads: the winner beats every other player); tied winners
  draw each other; non-winners don't play each other; a draw = draw between all.
- Streak: +n wins in a row, −n losses in a row, 0 after a draw. Credits won = winnings
  received (not refunds). Win rate = wins / played.
- App: Stats card in Profile → "See all stats" (`src/app/stats.tsx`, `/stats?uid=…`);
  tap a player's name in the match room to see their stats. No tab.
- Maintenance job `rebuild-stats` rebuilds all stats from settled matches
  (`functions/src/maintenance.ts`).
- Phase 2 (external game stats) is planned in `BACKLOG.md`, not built.

## Automatic result check (Claude vision)

- All server-side (`functions/src/matches/vision.ts`, europe-west1). `submitResult`
  (timeout 120 s, 512 MiB) loads the photo with `sharp`, checks timing and duplicates,
  then sends it to the Anthropic Messages API (`@anthropic-ai/sdk`) with a per-game
  hint and a JSON schema: `playerNames`, `scores` (goals / crowns / eliminations),
  `damage` (squads only), `winnerName`, `isFinalScreen`, `confidence` (0–1), `notes`.
  Squads: every player's eliminations and damage must match (no winner name).
  Clash Royale draw: the picture must not name a winner. The prompt never contains the reported names/score.
- API key: Firebase secret `ANTHROPIC_API_KEY` (Secret Manager), never in code. Missing
  / placeholder key or API error → the report is still accepted with verification
  `unreadable` and an admin reviews it.
- `config/review` (created by hand in the console; server-only): `autoApprove`
  (default false), `threshold` (default 0.9), `visionModel` (default `claude-sonnet-5`).
- The server compares the reading with the players' saved game IDs (or gamer tags;
  tolerant: case/accents/symbols ignored, clan tags, ~1 in 5 letters misread) and
  with the reported score and winner, and saves `matches/{id}.verification`
  `{status: match|mismatch|unreadable, confidence, reason, similarTo?, model}`;
  the raw reading goes on the report (`vision`).
- Duplicates: 256-bit difference hash + SHA-256 of every accepted result image in
  `imageHashes/{matchId}_{uid}_{report|dispute}` (server-only). ≤ 26 bits apart →
  refused; ≤ 48 → accepted but flagged `similarTo` (never auto-approved).
  `checkDuplicate` never reads the whole collection: one query on `sha256` (same
  file) and one `array-contains-any` on `segments` (the hash cut into 27 pieces,
  `hashSegments`; two hashes ≤ 26 bits apart always share a piece), so only real
  candidates are read. Entries saved before `segments` existed get it from the
  `backfill-image-hashes` maintenance job.
- Auto-approval happens at the moment a match would go to `under_review`
  (everyone confirmed, or the 30-minute window closed), in the same transaction:
  `autoReviewReasons` in shared games must be empty (auto-approve on, no dispute,
  status `match`, confidence ≥ threshold, no look-alike). Then it settles like an
  admin Approve, with `decidedBy: "vision"`, `adminUid: null`. Otherwise the match
  goes to `under_review` with `reviewReasons` (dispute, mismatch, low_confidence,
  unreadable, duplicate, not_checked, auto_off).
- Admin tab: `VerificationBadge` on queued matches; Past decisions label automatic
  ones "Auto (Vision)". `reverseAutoDecision(matchId, override|cancel_refund,
  winnerUid?, note)`: admins only, not their own match, within 24 h of an automatic
  decision, once (`admin_reviews/{matchId}_reversal`). New ledger entries only
  (see Credits data); the wrong reporter gets −5 on override; cancel removes the +1
  completed match.
- Emulator tests: in the emulator the API is never called; the answer comes from
  `_emulator/visionMock` (`{reading}` or `{error}`) and the request is saved in
  `_emulator/visionLastCall`.

## Admin email alerts

- `alertAdminOnReview` (`functions/src/matches/alerts.ts`, trigger on `matches/{id}`
  updates): when a match becomes `under_review`, emails `frantzbenois+admin@gmail.com`
  from `Better.player.one@gmail.com` via Gmail SMTP (nodemailer). Subject
  "Review needed: [game] match"; body: why it needs review (`reviewReasons`), game,
  players, reported winner + score, disputed yes/no (+ reason), automatic check
  result, app link. Once per match (`adminAlerts/{matchId}`,
  server-only). `retry: false`.
- The Gmail **app password** is the Firebase secret `GMAIL_APP_PASSWORD` (Secret
  Manager), never in code. The deploy workflow grants the `github-deploy` account
  Secret Manager Admin and creates a `not-set` placeholder if a secret
  (`GMAIL_APP_PASSWORD`, `ANTHROPIC_API_KEY`) is missing;
  with the placeholder the function logs a warning and sends nothing. After setting
  the real value, **redeploy** (Actions → Firebase deploy → Run workflow): functions
  use the secret version that was current at deploy time.
- Emulator tests: copy `functions/.secret.local.example` to `functions/.secret.local`
  (git-ignored; any value ≥ 8 characters works). Without it the emulator has no
  `GMAIL_APP_PASSWORD`, no alert is recorded and the alert tests hang. In the emulator
  mail is only built (jsonTransport), never sent, and the vision API is never called.

## Look and feel ("esports neon")

Dark theme only. All tokens live in `src/constants/theme.ts` (colours, `glow`,
`textGlow`, `radius`, `MIN_TOUCH`, fonts); never hard-code colours in screens.

- Background `#07080F`; header and bottom bar `#0A0C16`; cards `#0E1120` with a 1px
  border `rgba(255,255,255,0.06)`, radius 14–16; buttons radius 12–14.
- Cyan `#22D3EE` primary (text on it `#04121A`); magenta `#E040FB` secondary (text
  `#F0A6FF`); amber `#FFB020` locked/waiting; green `#39FF88` active/success/wins;
  danger `#FF4D6D`; text `#E6E9F2`, secondary `#A3ABBE`, muted `#8B93A7`.
  Game colours (`src/constants/games.ts`): EA FC green, Clash Royale `#38BDF8`,
  Warzone orange, Fortnite purple. All text colours pass WCAG AA on the backgrounds.
- Glow = soft outer shadow in the element's colour (`glow.*`): primary buttons
  0 0 18px 55%, magenta 0 0 16px 45%, active match card 0 0 18px 18%, badges
  0 0 10px 25%; highlighted numbers `textGlow` (0 0 12px 60%). Never on body text.
  Don't combine `textGlow` with `numberOfLines` (the glow gets clipped into a box).
- Fonts: Exo 2 ExtraBold Italic (800) for titles, big numbers and game names;
  Chakra Petch 400–700 for everything else (`@expo-google-fonts/chakra-petch`).
- `Button` variants: primary (cyan), secondary (magenta outline), success (green),
  outline (dark), danger (red outline), tint (outline in a given colour, e.g. the
  game colour); `size="small"` is still 44px. Every tappable thing ≥ 44px tall.
- Animations respect "reduce motion" (`PulseDot` uses reanimated `useReducedMotion`).
- Every screen has the header: "Better" white + "player" cyan (Exo 2 italic 24),
  outlined cyan "CLOSED BETA" pill with a soft glow, "18+ · Spain only" in muted grey.
- Bottom bar: inactive muted grey; active tab cyan with a 5px glowing dot under the
  label; the centre + is filled cyan with a glow and a 4px background-coloured ring.
- Match cards: `MatchCard` `compact` (lists: game-coloured 35% border, outlined
  status pill, small Join in the game colour) and `active` (Home: pulsing dot, glow,
  "1v1 · Winner gets X credits", "vs …", "Open match room").

## Before finishing a change

```bash
npx tsc --noEmit            # typecheck
npx expo export -p web      # must build without errors
npm --prefix functions run build   # if functions/ changed
```

@AGENTS.md
