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
4. **No secrets in the app.** Anything in the app ships to every user. The Firebase
   web config in `src/firebase/config.ts` is public by design; API keys for other
   services, admin credentials and service accounts belong in Cloud Functions.

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
- **A Betterplayer admin validates every match before any credits move.**
  Until then the match shows as "awaiting result".

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
- `src/constants/games.ts` – the supported games and their tile colours.
- `src/firebase/` – Firebase app, Auth and Firestore setup.
- `.github/workflows/web-preview.yml` – publishes the web preview on every push to `main`.

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
```

@AGENTS.md
