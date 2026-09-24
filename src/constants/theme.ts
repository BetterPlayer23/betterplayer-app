// Betterplayer look and feel. Dark theme only.
export const colors = {
  background: '#070B16', // dark navy: screen background
  surface: '#0E1628', // cards, header, tab bar
  border: '#1C2A4A', // thin blue borders
  primary: '#1E6BFF', // electric blue: primary actions (with a soft glow)
  accent: '#29B6FF', // cyan accent
  success: '#22C55E', // green: Join and success
  awaiting: '#FACC15', // yellow: "awaiting result"
  error: '#EF4444', // red: errors and full matches
  text: '#F5F7FF',
  textMuted: '#8A97B5',
} as const;

// Soft blue glow around primary actions. `boxShadow` works on iOS, Android and web.
export const primaryGlow = '0 0 18px rgba(30, 107, 255, 0.55)';

// Font family names are the keys loaded with useFonts in src/app/_layout.tsx.
export const fonts = {
  heading: 'Exo2_700Bold_Italic', // logo and headings
  headingHeavy: 'Exo2_800ExtraBold_Italic',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;
