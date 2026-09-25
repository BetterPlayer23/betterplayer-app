// The beta rules text, shown in the app and versioned for acceptance.
// Import-free: used by the Cloud Functions and the app ('@shared/betaRules').
// To change the rules: edit the text AND bump BETA_RULES_VERSION, so every
// player is asked to accept the new version once.

export const BETA_RULES_VERSION = 'v3';

export const BETA_RULES_TITLE = 'BETTERPLAYER CLOSED BETA — RULES & PRIVACY (v3)';

export const BETA_RULES_CONTACT_EMAIL = 'Better.player.one@gmail.com';

export const BETA_RULES: readonly { title: string; text: string }[] = [
  {
    title: 'Who can join',
    text: 'Invited people aged 18 or over living in Spain. One account per person.',
  },
  {
    title: 'Credits',
    text: 'Virtual and free, for testing only. They have no cash value and cannot be bought, sold, transferred or exchanged for money or prizes. They may be reset at any time.',
  },
  {
    title: 'Fair play',
    text: "Report results truthfully, with a screenshot showing the final score and both players' names. Cheating, fake screenshots or arranged results lead to removal.",
  },
  {
    title: 'Review',
    text: "Results are checked automatically. If the check is unclear or a player disputes, a Betterplayer admin reviews the match, and the admin's decision is final during the beta.",
  },
  {
    title: 'Beta',
    text: 'The app may have bugs and may change or stop at any time.',
  },
  {
    title: 'Your data',
    text: 'Frantz Benois (Better.player.one@gmail.com) stores your email, gamer tag, game IDs, match history and result screenshots only to run this beta, on Google Firebase. Nothing is sold or used for advertising. Data is deleted when the beta ends or on request. Email us to access, correct or delete your data; you can also complain to the AEPD (aepd.es). Result screenshots are checked automatically by an AI system (Anthropic) to confirm scores. Any player can dispute a result and a Betterplayer admin will review it.',
  },
];

export const BETA_RULES_CHECKBOX = 'I am 18+ and accept the beta rules';
