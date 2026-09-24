// BetterPlayer look and feel. Dark theme only, matching the landing page.
export const colors = {
  pitch: '#0F4D3A', // pitch green: cards, tab bar, header
  deep: '#0A3527', // deep green: screen background
  chalk: '#EEF2EA', // chalk: main text
  floodlight: '#FFD23F', // floodlight yellow: highlights, active tab, badge
  red: '#E03A3E', // errors only
  chalkMuted: 'rgba(238, 242, 234, 0.6)',
  line: 'rgba(238, 242, 234, 0.12)',
} as const;

// Font family names are the keys loaded with useFonts in src/app/_layout.tsx.
export const fonts = {
  heading: 'BigShouldersDisplay_800ExtraBold',
  headingMedium: 'BigShouldersDisplay_600SemiBold',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodyBold: 'Barlow_700Bold',
} as const;
