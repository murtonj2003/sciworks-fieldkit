// Fieldkit building blocks (Option E · Clean, from design/wireframes/fieldkit.css). Containment, not borders:
// ground › grey group › white row. Every action is a pill: black primary, white on grey, grey on white.
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

/** 13 px second-ink title that sits above a group. */
export function GroupTitle({ children }: { children: ReactNode }) {
  const s = useBox();
  return <Text style={s.gt}>{children}</Text>;
}

/** 20 px section heading with a leading icon (Location, Scale counts…). */
export function SectionTitle({ children, icon }: { children: ReactNode; icon?: IconName }) {
  const s = useBox();
  const { t } = useTheme();
  return (
    <View style={s.section}>
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

export type ButtonKind = 'primary' | 'secondary' | 'grey' | 'white' | 'link' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 64,
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  /** primary = black pill · white = white pill (on grey) · grey/secondary = grey pill (on white or the ground) · link = text button. */
  kind?: ButtonKind;
  size?: 72 | 64 | 56 | 48;
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
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
  const bg = disabled ? t.disFill : k === 'primary' ? t.pri : k === 'white' ? t.sec : t.grey;
  const press = k === 'primary' ? t.priPress : k === 'white' ? t.secPress : t.greyPress;
  const fg = disabled ? t.disInk : k === 'primary' ? t.onPri : t.ink;
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
          paddingHorizontal: size >= 64 ? 26 : 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: pressed && !disabled ? press : bg,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={22} color={fg} strokeWidth={2} />}
      <Text style={[type.title, size === 72 && { fontSize: 20 }, { color: fg, textAlign: 'center' }]} numberOfLines={2}>
        {label}
      </Text>
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
      <Text style={[type.small, { color: fg, fontWeight: venomous ? '800' : '600', letterSpacing: venomous ? 0.8 : 0 }]}>{label}</Text>
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
export function Hint({ children, line, actions }: { children: ReactNode; line?: boolean; actions?: ReactNode }) {
  const { t } = useTheme();
  if (line) {
    return (
      <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'flex-start' }}>
        <Icon name="warning" size={16} color={t.nearMark} strokeWidth={2.25} />
        <Text style={[type.small, { color: t.ink, flex: 1, fontWeight: '400' }]}>{children}</Text>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: t.nearFill, borderRadius: radius.card, paddingTop: 11, paddingBottom: 12, paddingHorizontal: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Icon name="warning" size={20} color={t.nearInk} strokeWidth={2} />
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
