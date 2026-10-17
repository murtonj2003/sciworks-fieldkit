// Fieldkit building blocks (Option E · Clean, from design/wireframes/fieldkit.css). Containment, not borders:
// ground › grey group › white row. Every action is a pill: black primary, white on grey, grey on white; Jack's
// round-2 picks add one outlined pill for a small secondary action beside a black one (Guide, the second Choose).
// Status is shape + glyph + word. Day and night come from the theme; nothing here hard-codes a colour.
import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { day, radius, space, type } from '@/theme/theme';

import { Icon } from './Icon';
import type { IconName } from './sprite';

// ---------- text ----------

type Variant = 'display' | 'head' | 'headBold' | 'title' | 'body' | 'sub' | 'label' | 'small' | 'micro' | 'numeral' | 'input';

export function T({
  children,
  v = 'body',
  dim,
  italic,
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  v?: Variant;
  dim?: boolean;
  italic?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { t } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[type[v], { color: color ?? (dim ? t.ink2 : t.ink) }, italic && type.species, style]}
    >
      {children}
    </Text>
  );
}

/** Legacy names kept so every screen keeps working while the pass goes screen by screen. */
export function H1({ children }: { children: ReactNode }) {
  return <T v="display">{children}</T>;
}
export function H2({ children }: { children: ReactNode }) {
  return <T v="head" style={{ marginTop: 8 }}>{children}</T>;
}
export function P({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <T v={dim ? 'sub' : 'body'} dim={dim}>{children}</T>;
}

// ---------- containment ----------

const useBox = makeStyles((t) => ({
  group: { backgroundColor: t.group, borderRadius: radius.group, padding: space.inset, gap: space.inset },
  card: { backgroundColor: t.card, borderRadius: radius.card },
  pad: { paddingVertical: space.md, paddingHorizontal: space.cardX, gap: 4 },
  gt: { ...type.small, color: t.ink2, marginTop: space.md, marginBottom: space.inset, marginHorizontal: space.cardX },
  section: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.lg, marginBottom: space.sm },
  bottom: { paddingTop: 10, paddingHorizontal: space.gutter, paddingBottom: 26, gap: 8, backgroundColor: t.ground, borderTopWidth: 1, borderTopColor: t.hair },
  row2: { flexDirection: 'row', gap: 8 },
}));

export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useBox();
  return <View style={[s.group, style]}>{children}</View>;
}

/** A white card. `pad` gives the kit's 12 × 14 inset. */
export function Row({ children, pad = true, style }: { children: ReactNode; pad?: boolean; style?: StyleProp<ViewStyle> }) {
  const s = useBox();
  return <View style={[s.card, pad && s.pad, style]}>{children}</View>;
}

/** Legacy Card: a grey group holding one padded white card. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Group style={style}>
      <Row>{children}</Row>
    </Group>
  );
}

/** The heading inside a grey tray, above its white card (comps 1D / 4C: "Weather at start", "Top match"). */
export function TrayTitle({ children, end }: { children: ReactNode; end?: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2, minHeight: 32 }}>
      <Text style={[type.title, { color: t.ink, flex: 1 }]}>{children}</Text>
      {end}
    </View>
  );
}

/** 13 px second-ink title that sits above a group. */
export function GroupTitle({ children }: { children: ReactNode }) {
  const s = useBox();
  return <Text style={s.gt}>{children}</Text>;
}

/** 20 px section heading with a leading icon (Location, Scale counts…). */
export function SectionTitle({ children, icon, style }: { children: ReactNode; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const s = useBox();
  const { t } = useTheme();
  return (
    <View style={[s.section, style]}>
      {icon && <Icon name={icon} size={20} color={t.ink2} />}
      <T v="head">{children}</T>
    </View>
  );
}

/** The screen's one primary action lives here (Bottom Bar Rule). */
export function BottomBar({ children }: { children: ReactNode }) {
  const s = useBox();
  return <View style={s.bottom}>{children}</View>;
}
export function Pair({ children }: { children: ReactNode }) {
  const s = useBox();
  return <View style={s.row2}>{children}</View>;
}

// ---------- buttons ----------

export type ButtonKind = 'primary' | 'secondary' | 'grey' | 'white' | 'outline' | 'link' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 64,
  icon,
  disabled,
  style,
  lines = 2,
  iconAfter,
  compact,
}: {
  /** Plain words, or words with an italic species name inside. */
  label: ReactNode;
  onPress: () => void;
  /** primary = black pill · white = white pill (on grey) · grey/secondary = grey pill (on white or the ground) ·
   * outline = white pill with an ink outline (small secondary beside a black one) · link = text button. */
  kind?: ButtonKind;
  size?: 72 | 64 | 56 | 48 | 40;
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** 1 = the label shrinks to fit one line instead of wrapping (half-width buttons in a Pair). */
  lines?: 1 | 2;
  /** An icon after the words ("Add animal +", comp 1D). */
  iconAfter?: IconName;
  /** 15 px medium words, for two side-by-side choices with long species names (compare). */
  compact?: boolean;
}) {
  const { t } = useTheme();
  const k = kind === 'danger' ? 'primary' : kind === 'secondary' ? 'grey' : kind; // Black Pill Rule: no red fills
  if (k === 'link') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={disabled}
        hitSlop={4}
        style={({ pressed }) => [{ minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.6 : 1 }, style]}
      >
        {icon && <Icon name={icon} size={18} color={t.ink} />}
        <Text style={[type.sub, { fontWeight: '500', color: t.ink, textDecorationLine: 'underline' }]}>{label}</Text>
      </Pressable>
    );
  }
  const bg = disabled ? t.disFill : k === 'primary' ? t.pri : k === 'white' || k === 'outline' ? t.card : t.grey;
  const press = k === 'primary' ? t.priPress : k === 'white' || k === 'outline' ? t.secPress : t.greyPress;
  const fg = disabled ? t.disInk : k === 'primary' ? t.onPri : t.ink;
  const small = size <= 48;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: size,
          borderRadius: radius.pill,
          paddingHorizontal: size >= 64 ? 26 : size === 56 ? 22 : size === 48 ? 14 : 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: small ? 6 : 10,
          backgroundColor: pressed && !disabled ? press : bg,
          ...(k === 'outline' && !disabled ? { borderWidth: 1.5, borderColor: t.ink } : {}),
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={small ? 18 : 22} color={fg} strokeWidth={2} />}
      <Text
        style={[type.title, size === 72 && { fontSize: 20 }, (size === 40 || compact) && { fontSize: 15, lineHeight: 19 }, compact && { fontWeight: '500' }, { color: fg, textAlign: 'center', flexShrink: 1 }]}
        numberOfLines={lines}
        adjustsFontSizeToFit={lines === 1}
        minimumFontScale={0.8}
      >
        {label}
      </Text>
      {iconAfter && <Icon name={iconAfter} size={small ? 18 : 22} color={fg} strokeWidth={2.25} />}
    </Pressable>
  );
}

// ---------- small parts ----------

/** Tag (24 px, 8 px radius). `outline` = the AI Draft tag; `dashed` = incomplete; `venomous` = the red-tint safety word. */
export function Tag({ label, icon, outline, dashed, venomous }: { label: string; icon?: IconName; outline?: boolean; dashed?: boolean; venomous?: boolean }) {
  const { t } = useTheme();
  const fg = venomous ? t.offTintInk : t.ink2;
  return (
    <View
      style={{
        minHeight: 24,
        paddingHorizontal: 8,
        borderRadius: radius.tag,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: outline || dashed ? 'transparent' : venomous ? t.offTint : t.group,
        borderWidth: outline || dashed ? 1.5 : 0,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: t.ink2,
      }}
    >
      {icon && <Icon name={icon} size={14} color={fg} />}
      <Text style={[type.small, venomous ? { fontSize: 12, fontWeight: '700', letterSpacing: 0.72 } : { fontWeight: '600' }, { color: fg }]}>{label}</Text>
    </View>
  );
}

export type Status = 'received' | 'flagged' | 'edited' | 'approved' | 'rejected';
const STATUS: Record<Status, { word: string; icon: IconName }> = {
  received: { word: 'Received', icon: 'tray' },
  flagged: { word: 'Flagged', icon: 'flag' },
  edited: { word: 'Edited', icon: 'pencil' },
  approved: { word: 'Approved', icon: 'check-circle' },
  rejected: { word: 'Rejected', icon: 'cross' },
};

/** The same five status chips as HQ: icon + word, never colour alone. */
export function StatusChip({ status }: { status: Status }) {
  const { t } = useTheme();
  const pair: Record<Status, [string, string]> = {
    received: [t.recFill, t.recInk],
    flagged: [t.nearFill, t.nearInk],
    edited: [t.editFill, t.editInk],
    approved: [t.onFill, t.onInk],
    rejected: [t.offTint, t.offTintInk],
  };
  const [bg, fg] = pair[status];
  return (
    <View style={{ height: 26, paddingHorizontal: 8, borderRadius: radius.tag, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
      <Icon name={STATUS[status].icon} size={15} color={fg} />
      <Text style={[type.small, { color: fg, fontWeight: '600' }]}>{STATUS[status].word}</Text>
    </View>
  );
}

/** Amber hint: advises, never blocks. `line` = the quiet one-line flag variant. */
export function Hint({ children, line, actions, icon = 'warning', side }: { children: ReactNode; line?: boolean; actions?: ReactNode; icon?: IconName; side?: boolean }) {
  const { t } = useTheme();
  if (line) {
    return (
      <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'flex-start' }}>
        <Icon name="warning" size={16} color={t.nearMark} strokeWidth={2.25} />
        <Text style={[type.small, { color: t.ink, flex: 1, fontWeight: '400' }]}>{children}</Text>
      </View>
    );
  }
  if (side) {
    return (
      <View style={{ backgroundColor: t.nearFill, borderRadius: radius.group, paddingVertical: 12, paddingLeft: 14, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name={icon} size={26} color={t.nearInk} strokeWidth={1.75} />
        <Text style={[type.sub, { color: t.nearInk, flex: 1 }]}>{children}</Text>
        {actions}
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: t.nearFill, borderRadius: radius.card, paddingTop: 11, paddingBottom: 12, paddingHorizontal: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Icon name={icon} size={20} color={t.nearInk} strokeWidth={2} />
        <Text style={[type.sub, { color: t.nearInk, flex: 1 }]}>{children}</Text>
      </View>
      {actions}
    </View>
  );
}

/** Static day colours for parts not yet moved onto the theme. New code uses useTheme(). */
export const colors = {
  ink: day.ink,
  dim: day.ink2,
  line: day.hair,
  paper: day.card,
  primary: day.pri,
  danger: day.offFill,
  green: day.onMark,
  amber: day.nearMark,
  red: day.offMark,
};

/** The 72 px primary pill with a white disc holding the icon (kit `.fk-btn--disc`): Add animal. */
export function DiscButton({ label, icon = 'plus', onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 72,
        borderRadius: radius.pill,
        backgroundColor: pressed ? t.priPress : t.pri,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 28,
        paddingRight: 8,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Text style={[type.title, { fontSize: 20, color: t.onPri }]}>{label}</Text>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.onPri, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={t.pri} strokeWidth={2.25} />
      </View>
    </Pressable>
  );
}

/** "Saved" with a mint tick, for the small bar's trailing slot on record screens. */
export function SavedMark() {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 10 }} accessibilityLabel="Saved on this phone">
      <Icon name="check" size={18} color={t.onMark} strokeWidth={2.25} />
      <Text style={[type.sub, { color: t.ink2 }]}>Saved</Text>
    </View>
  );
}
