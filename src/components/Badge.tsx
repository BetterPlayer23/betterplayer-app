import { useEffect, useId, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { BADGE_LABEL, type BadgeKind } from '@shared/badges';

import { badgeColors, fonts, radius, withAlpha } from '@/constants/theme';

// Badge artwork, drawn with SVG (web and native), in a 120×120 box: a
// hexagon with a dark radial inside, a 4px ring in the tier's gradient, an
// inner bevel, a soft white reflection, a light tint of the tier colour, a
// ribbon with the text, and ornaments that grow with rarity:
//   Carbon: crosshair · Cobalt: + gem · Gold: + wings, glow
//   Neon: + sparkles · Prism: white crosshair, crown spikes, moving shine and
//   colour shift · Founder: laurel wreath, double star · Crown: crown icon.
// Prism moves only on large/medium badges, and never with "reduce motion".

type Look = {
  icon: 'crosshair' | 'stars' | 'crown';
  iconColor: string;
  gem?: boolean;
  wings?: boolean;
  spikes?: boolean;
  sparkles?: boolean;
  laurel?: boolean;
  glow?: string[];
  animated?: boolean;
};

const LOOKS: Record<BadgeKind, Look> = {
  carbon: { icon: 'crosshair', iconColor: '#D1D5DB' },
  cobalt: { icon: 'crosshair', iconColor: '#BFDBFE', gem: true },
  gold: { icon: 'crosshair', iconColor: '#FFE08A', gem: true, wings: true, glow: ['#FFB020'] },
  neon: { icon: 'crosshair', iconColor: '#67E8F9', gem: true, wings: true, sparkles: true, glow: ['#22D3EE', '#E040FB'] },
  prism: {
    icon: 'crosshair',
    iconColor: '#FFFFFF',
    gem: true,
    wings: true,
    spikes: true,
    sparkles: true,
    glow: ['#E040FB', '#22D3EE'],
    animated: true,
  },
  founder: { icon: 'stars', iconColor: '#FFFFFF', gem: true, sparkles: true, laurel: true, glow: ['#22D3EE'] },
  crown: { icon: 'crown', iconColor: '#FFD166', gem: true, wings: true, glow: ['#FFB020'] },
};

const HEX = [
  [60, 14],
  [98, 36],
  [98, 80],
  [60, 102],
  [22, 80],
  [22, 36],
];
const CX = 60;
const CY = 58;
const pts = (scale = 1) =>
  HEX.map(([x, y]) => `${CX + (x - CX) * scale},${CY + (y - CY) * scale}`).join(' ');

const SIZES = { large: 104, medium: 44, small: 18 } as const;
export type BadgeSize = keyof typeof SIZES | number;

// Re-renders every 50 ms while `on` (Prism shine and colour shift).
function useTicker(on: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    const start = Date.now();
    const id = setInterval(() => setT((Date.now() - start) / 1000), 50);
    return () => clearInterval(id);
  }, [on]);
  return t;
}

export function Badge({
  kind,
  text,
  size = 'medium',
  animate = true,
}: {
  kind: BadgeKind;
  text?: string; // ribbon text; defaults to the tier name
  size?: BadgeSize;
  animate?: boolean;
}) {
  const px = typeof size === 'number' ? size : SIZES[size];
  const mini = px < 30; // tiny chip: hexagon and icon only
  const look = LOOKS[kind];
  const reduceMotion = useReducedMotion();
  const moving = !!look.animated && animate && !mini && !reduceMotion;
  const t = useTicker(moving);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const stops = badgeColors[kind].stops;
  const ribbon = (text ?? BADGE_LABEL[kind]).toUpperCase();

  // Prism: a white band sweeping across every 2.6 s, and the colours turning slowly.
  const sweep = moving ? ((t % 2.6) / 2.6) * 190 - 50 : -100;
  const turn = moving ? (t * 30) % 360 : 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${text ?? BADGE_LABEL[kind]} badge`}
      style={{ width: px, height: px }}>
      <Svg width={px} height={px} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient
            id={`ring${id}`}
            x1="20"
            y1="10"
            x2="100"
            y2="110"
            gradientUnits="userSpaceOnUse"
            gradientTransform={`rotate(${turn} ${CX} ${CY})`}>
            {stops.map((c, i) => (
              <Stop key={i} offset={i / Math.max(1, stops.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
          <LinearGradient id={`band${id}`} x1="0" y1="0" x2="1" y2="0">
            {stops.map((c, i) => (
              <Stop key={i} offset={i / Math.max(1, stops.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
          <RadialGradient id={`fill${id}`} cx="60" cy="46" r="60" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={badgeColors.fill[0]} />
            <Stop offset="0.55" stopColor={badgeColors.fill[1]} />
            <Stop offset="1" stopColor={badgeColors.fill[2]} />
          </RadialGradient>
          <LinearGradient id={`shine${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id={`gem${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="1" stopColor={stops[Math.min(1, stops.length - 1)]} />
          </LinearGradient>
          <ClipPath id={`hex${id}`}>
            <Polygon points={pts()} />
          </ClipPath>
        </Defs>

        {/* Soft glow: wider, faint copies of the ring behind the badge. */}
        {look.glow && !mini &&
          look.glow.map((c, i) => (
            <G key={c}>
              <Polygon points={pts()} fill="none" stroke={c} strokeOpacity={0.1} strokeWidth={18 - i * 4} strokeLinejoin="round" />
              <Polygon points={pts()} fill="none" stroke={c} strokeOpacity={0.18} strokeWidth={10 - i * 2} strokeLinejoin="round" />
            </G>
          ))}

        {look.laurel && !mini && <Laurel color={stops[1]} />}
        {look.wings && !mini && <Wings gradient={`url(#ring${id})`} />}
        {look.spikes && !mini && (
          <Polygon
            points="36,22 40,4 49,15 60,0 71,15 80,4 84,22"
            fill={`url(#ring${id})`}
            stroke={badgeColors.fill[2]}
            strokeWidth={1}
          />
        )}

        {/* Body: dark radial, tier tint, reflection, bevel, ring. */}
        <Polygon points={pts()} fill={`url(#fill${id})`} />
        <Polygon points={pts()} fill={stops[Math.floor(stops.length / 2)]} fillOpacity={0.12} />
        <G clipPath={`url(#hex${id})`}>
          <Polygon points="22,36 60,14 98,36 98,50 22,60" fill={`url(#shine${id})`} />
          {moving && (
            <Rect x={sweep} y={-10} width={16} height={140} fill="#FFFFFF" fillOpacity={0.35} transform={`rotate(20 ${sweep + 8} 58)`} />
          )}
        </G>
        <Polygon points={pts(0.84)} fill="none" stroke="#FFFFFF" strokeOpacity={0.14} strokeWidth={1.2} />
        <Polygon points={pts()} fill="none" stroke={`url(#ring${id})`} strokeWidth={4} strokeLinejoin="round" />

        <Icon kind={look.icon} color={look.iconColor} accent={stops[stops.length - 1]} mini={mini} />

        {look.gem && !mini && (
          <G>
            <Polygon points="60,4 68,13 60,22 52,13" fill={`url(#gem${id})`} stroke={badgeColors.fill[2]} strokeWidth={1} />
            <Polygon points="60,6 64,11 60,12 56,11" fill="#FFFFFF" fillOpacity={0.7} />
          </G>
        )}
        {look.sparkles && !mini && (
          <G fill="#FFFFFF">
            <Sparkle x={12} y={22} r={5} />
            <Sparkle x={108} y={30} r={4} />
            <Sparkle x={104} y={94} r={3.5} />
            <Sparkle x={16} y={92} r={3} />
          </G>
        )}

        {!mini && (
          <G>
            <Polygon points="12,86 108,86 102,95 108,104 12,104 18,95" fill={`url(#band${id})`} stroke={badgeColors.fill[2]} strokeWidth={1} />
            <SvgText
              x={60}
              y={99}
              textAnchor="middle"
              fontFamily={fonts.bodyBold}
              fontWeight="700"
              fontSize={ribbon.length > 10 ? 9 : 11}
              letterSpacing={ribbon.length > 10 ? 0.4 : 1}
              fill={badgeColors.ribbonText}>
              {ribbon}
            </SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}

function Icon({ kind, color, accent, mini }: { kind: Look['icon']; color: string; accent: string; mini: boolean }) {
  const cy = mini ? CY : 54;
  if (kind === 'crown') {
    return (
      <G>
        <Path d={`M42,${cy + 10} L45,${cy - 10} L53,${cy - 1} L60,${cy - 14} L67,${cy - 1} L75,${cy - 10} L78,${cy + 10} Z`} fill={color} />
        <Rect x={42} y={cy + 12} width={36} height={5} rx={1.5} fill={color} />
        <Circle cx={60} cy={cy - 16} r={2.5} fill={color} />
      </G>
    );
  }
  if (kind === 'stars') {
    return (
      <G>
        <Path d={star(70, cy - 8, 9)} fill={accent} fillOpacity={0.95} />
        <Path d={star(56, cy + 2, 15)} fill={color} />
      </G>
    );
  }
  const w = mini ? 6 : 2.6;
  return (
    <G stroke={color} strokeWidth={w} strokeLinecap="round" fill="none">
      <Circle cx={60} cy={cy} r={mini ? 20 : 14} />
      {!mini && (
        <>
          <Line x1={60} y1={cy - 22} x2={60} y2={cy - 8} />
          <Line x1={60} y1={cy + 8} x2={60} y2={cy + 22} />
          <Line x1={38} y1={cy} x2={52} y2={cy} />
          <Line x1={68} y1={cy} x2={82} y2={cy} />
        </>
      )}
      <Circle cx={60} cy={cy} r={mini ? 4 : 2.5} fill={color} stroke="none" />
    </G>
  );
}

// A 5-point star path.
function star(cx: number, cy: number, r: number): string {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${p.join(' L')} Z`;
}

function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  const s = r * 0.28;
  return <Path d={`M${x},${y - r} L${x + s},${y - s} L${x + r},${y} L${x + s},${y + s} L${x},${y + r} L${x - s},${y + s} L${x - r},${y} L${x - s},${y - s} Z`} />;
}

// Three feathers on each side of the hexagon.
function Wings({ gradient }: { gradient: string }) {
  const feathers = (
    <G fill={gradient} stroke={badgeColors.fill[2]} strokeWidth={0.8}>
      <Path d="M24,42 Q8,36 1,24 Q12,30 24,34 Z" />
      <Path d="M24,54 Q6,52 0,42 Q12,46 24,47 Z" />
      <Path d="M24,66 Q8,68 3,60 Q13,61 24,60 Z" />
    </G>
  );
  return (
    <G>
      {feathers}
      <G transform="translate(120,0) scale(-1,1)">{feathers}</G>
    </G>
  );
}

// A laurel wreath around the hexagon (Founder).
function Laurel({ color }: { color: string }) {
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const a = (Math.PI * (0.62 + i * 0.075)) as number; // lower-left → upper-left
    const x = CX + 54 * Math.cos(a);
    const y = CY + 50 * Math.sin(a) * -1 + 8;
    const deg = (a * 180) / Math.PI + 90;
    leaves.push(<Ellipse key={i} cx={x} cy={y} rx={3.2} ry={8} fill={color} fillOpacity={0.9} transform={`rotate(${-deg + 180} ${x} ${y})`} />);
  }
  const side = <G>{leaves}</G>;
  return (
    <G>
      {side}
      <G transform="translate(120,0) scale(-1,1)">{side}</G>
    </G>
  );
}

// A small chip next to a name: tiny hexagon + tier name.
export function BadgeChip({ kind, label }: { kind: BadgeKind; label?: string }) {
  const color = badgeColors[kind].color;
  return (
    <View style={[chip.wrap, { borderColor: withAlpha(color, 0.45), backgroundColor: withAlpha(color, 0.08) }]}>
      <Badge kind={kind} size="small" animate={false} />
      <Text style={[chip.text, { color }]} numberOfLines={1}>
        {label ?? BADGE_LABEL[kind]}
      </Text>
    </View>
  );
}

const chip = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingLeft: 3,
    paddingRight: 8,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
  },
});
