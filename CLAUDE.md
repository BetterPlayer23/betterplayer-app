# BetterPlayer

BetterPlayer lets gamers stake credits on their own EA FC 1v1 matches.
The beta is **credits only**: no real money anywhere.

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

- Each player stakes **2 credits** (pot = 4 credits).
- The house fee is **20%** of the pot (0.80 credits).
- The **winner gets 3.20 credits**.
- **Draws are decided on penalties**: there is always a winner.

## Project layout

- `src/app/` – screens (Expo Router). `(tabs)/` holds Lobby, Wallet and Profile.
- `src/components/` – shared UI (header, placeholder screen).
- `src/constants/theme.ts` – colors and fonts. Use these, don't hard-code colors.
- `src/firebase/` – Firebase app, Auth and Firestore setup.
- `.github/workflows/web-preview.yml` – publishes the web preview on every push to `main`.

## Look and feel

Dark theme only. Pitch green `#0F4D3A`, deep green `#0A3527`, chalk `#EEF2EA`,
floodlight yellow `#FFD23F`, red `#E03A3E` for errors only.
Big Shoulders Display for headings, Barlow for text.

## Before finishing a change

```bash
npx tsc --noEmit            # typecheck
npx expo export -p web      # must build without errors
```

@AGENTS.md
