import { matchError } from '@/matches/api';

// Turns Firebase error codes into plain messages for players.
export function friendlyError(error: unknown): string {
  const code =
    typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  // Our Cloud Functions already send plain messages (e.g. "Wait a minute…").
  if (code.startsWith('functions/')) return matchError(error);

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account already uses this email. Try logging in instead.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/invalid-email':
      return 'That email doesn’t look right. Check for typos.';
    case 'auth/weak-password':
      return 'Password must be at least 8 characters.';
    case 'auth/expired-action-code':
      return 'This link has expired. Ask for a new one below.';
    case 'auth/invalid-action-code':
      return 'This link was already used or isn’t valid any more. Ask for a new one below.';
    case 'auth/user-disabled':
      return 'This account has been switched off. Email Better.player.one@gmail.com for help.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'No connection. Check your internet and try again.';
    case 'permission-denied':
      return 'We couldn’t save that. Please try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
