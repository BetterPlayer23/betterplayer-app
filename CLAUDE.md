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

## Game rules

- Games:
  - **EA FC**: 1v1. Draws are decided on penalties, so there is always a winner.
  - **Warzone Rebirth**: 2–4 players.
  - **Fortnite**: 2–4 players.
  - **Clash Royale**: 1v1.
- Every player gets **10 starter credits, once**.
- Entry is **fixed at 2 credits** per player.
- Betterplayer always takes a **20% fee of the whole pot** (all entries added
  together), whatever the number of players. It is simulated: credits only, no money.
  - 1v1: pot 4 credits, fee 0.80, the winner gets 3.20.
  - 3 players: pot 6 credits, fee 1.20, the winner gets 4.80.
  - 4 players: pot 8 credits, fee 1.60, the winner gets 6.40.
- **Winner takes all:** in every game the single winner gets the whole 80% left
  after the fee. Nobody else in the match gets credits back.
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
- `src/firebase/` – Firebase app, Auth and Firestore setup.
- `src/wallet/` – live, read-only wallet and ledger data, credit formatting and labels.
- `src/matches/` – match types, live Firestore hooks, and `api.ts` (the only way the
  app changes matches: callable Cloud Functions). `src/app/match.tsx` is the Match
  room (`/match?id=…`; a query parameter so it works as a static page on GitHub Pages).
- `functions/` – Cloud Functions (TypeScript, Functions v2, Node 22, region `europe-west1`).
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

## Accounts

- Email and password sign-in (Firebase Auth). Users stay signed in.
- The tabs are only reachable when signed in (`Stack.Protected` in `src/app/_layout.tsx`).
- `users/{uid}` holds: `gamerTag`, `platform` (`pc`, `playstation`, `xbox`, `mobile`),
  `ageConfirmed: true`, `ageConfirmedAt`, `country: "ES"` (self-declared), `gameIds`
  (`eaId`, `activisionId`, `epicName`, `clashRoyaleTag`), `createdAt`.
- **Never put credits or reputation in `users/{uid}`**: they are server-only.
- The app may only change `gamerTag` and `gameIds` after sign-up.
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
- Current version: **v2** (section 6 says screenshots are checked by an AI system
  (Anthropic) and any player can dispute).

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
    reversing an automatic decision. Never edits the old `settle_…` entries.
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
  app form and the server): EA FC goals (+ penalties only when level, never level),
  Clash Royale crowns 0–3 (no level results), Warzone/Fortnite distinct placements
  (1 = best). The winner must match the score.
- Screenshots: Storage `results/{matchId}/{uid}/{file}`. A player of a started or
  awaiting match uploads into their own folder only, after `startedAt` and before
  `responseDeadline`; jpeg/png/webp (no HEIC: the server can't read it), ≤ 10 MB;
  never overwritten or deleted (`resource == null` on create). Players of the match
  and admins can read. Functions check the file exists, is in the caller's folder,
  was uploaded inside the match window, and isn't a (near-)duplicate.
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

## Automatic result check (Claude vision)

- All server-side (`functions/src/matches/vision.ts`, europe-west1). `submitResult`
  (timeout 120 s, 512 MiB) loads the photo with `sharp`, checks timing and duplicates,
  then sends it to the Anthropic Messages API (`@anthropic-ai/sdk`) with a per-game
  hint and a JSON schema: `playerNames`, `scores`, `winnerName`, `isFinalScreen`,
  `confidence` (0–1), `notes`. The prompt never contains the reported names/score.
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
- Emulator tests: put `GMAIL_APP_PASSWORD=...` and `ANTHROPIC_API_KEY=...` in `functions/.secret.local`
  (git-ignored); in the emulator mail is only built (jsonTransport), never sent.

## Look and feel

Dark theme only.

- Background dark navy `#070B16`; cards `#0E1628` with thin blue borders `#1C2A4A`.
- Electric blue `#1E6BFF` for primary actions, with a soft glow.
- Cyan `#29B6FF` accent.
- Green `#22C55E` for Join and success.
- Yellow `#FACC15` for "awaiting result".
- Red `#EF4444` for errors and full matches.
- Text `#F5F7FF`, muted text `#8A97B5`.
- Fonts: Exo 2 bold italic for the logo and headings, Inter for body text.
- Every screen has the header: "Betterplayer" logo, outlined "CLOSED BETA" badge,
  and "18+ · Spain only".

## Before finishing a change

```bash
npx tsc --noEmit            # typecheck
npx expo export -p web      # must build without errors
npm --prefix functions run build   # if functions/ changed
```

@AGENTS.md
