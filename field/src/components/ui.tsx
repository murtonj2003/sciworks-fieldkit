// Plain building blocks for the logic phase. The look is deliberately neutral: the real design pass goes
// through Impeccable (MOBILE-BRIEF §7). Targets are already big (≥ 64 dp) because of wet, gloved hands.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function P({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <Text style={[styles.p, dim && styles.dim]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'danger' && styles.buttonDanger,
        (pressed || disabled) && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.buttonText, kind === 'secondary' && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const colors = {
  ink: '#111111',
  dim: '#4A4A4A',
  line: '#C9C9C9',
  paper: '#FFFFFF',
  primary: '#0B5D3B',
  danger: '#9B1C1C',
  green: '#0B6B2E',
  amber: '#8A5A00',
  red: '#A11414',
};

export const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.paper },
  h1: { fontSize: 26, fontWeight: '800', color: colors.ink },
  h2: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 8 },
  p: { fontSize: 17, lineHeight: 24, color: colors.ink },
  dim: { color: colors.dim },
  button: {
    minHeight: 64,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  buttonSecondary: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.primary },
  buttonDanger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.6 },
  buttonText: { fontSize: 19, fontWeight: '700', color: '#FFFFFF' },
  buttonTextSecondary: { color: colors.primary },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, gap: 6 },
});
