// One input per FieldDef.type. Every change is reported up at once (the screen saves a draft on each one).
// Warnings say "Check?" and never stop a save. Look: the kit's inputs (white on a grey group, 60 px, 12 px radius,
// numbers 24 px tabular with unit + keypad icon) and choice chips (56 px, 14 px radius; selected = ink ring + check).
import type { Measurement } from '@sciworks/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { clockOf } from '@/lib/time';
import { SCALE_PRECISION_G, UNIT_LABEL, rangeHint, type EffectiveField } from '@/model/form';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { day, radius, type } from '@/theme/theme';

import { Icon } from './Icon';
import { Hint as KitHint, Tag } from './ui';

/** Browser preview only: hide the browser's own focus outline (the kit draws its own ink ring). */
const WEB_NO_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};

export const useFieldStyles = makeStyles((t) => ({
  field: { gap: 6, paddingVertical: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginHorizontal: 4 },
  label: { ...type.label, color: t.ink },
  unit: { fontWeight: '400', color: t.ink2 },
  help: { ...type.small, fontWeight: '400', color: t.ink2, marginHorizontal: 4 },
  small: { ...type.sub, color: t.ink2 },
  gap: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 56,
    minWidth: 56,
    paddingHorizontal: 18,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: t.card,
  },
  chipOn: { borderColor: t.ink },
  chipText: { ...type.body, fontWeight: '500', color: t.ink },
  chipTextOn: { fontWeight: '600' },
  box: {
    minHeight: 60,
    borderRadius: radius.card,
    backgroundColor: t.card,
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 4,
    gap: 7,
  },
  boxFocus: { borderColor: t.ink },
  boxError: { borderColor: t.offMark },
  numText: { ...type.input, color: t.ink, flex: 1, minWidth: 0, paddingVertical: 0, minHeight: 56, ...WEB_NO_OUTLINE },
  prefix: { ...type.input, color: t.ink2 },
  unitText: { ...type.body, fontWeight: '500', color: t.ink2 },
  kb: { width: 36, height: 48, alignItems: 'center', justifyContent: 'center' },
  text: { ...type.body, color: t.ink, flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 0, ...WEB_NO_OUTLINE },
  multiline: { minHeight: 104, paddingTop: 14, textAlignVertical: 'top' },
  input: {
    minHeight: 60,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    ...type.body,
    color: t.ink,
    backgroundColor: t.card,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  time: { ...type.numeral, color: t.ink, minWidth: 90 },
  unitInline: { fontWeight: '400', color: t.ink2 },
}));

export function FieldLabel({ field, extra }: { field: EffectiveField; extra?: ReactNode }) {
  const s = useFieldStyles();
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>{field.label}</Text>
      {field.origin === 'team' ? <Tag label="team field" icon="users" /> : null}
      {extra}
    </View>
  );
}

/** "Check?" and other hints: amber, advise, never block. `tone="info"` is a plain second-ink line. */
export function Hint({ text, tone = 'warn' }: { text: string | null; tone?: 'warn' | 'info' }) {
  const s = useFieldStyles();
  if (!text) return null;
  if (tone === 'info') return <Text style={s.help}>{text}</Text>;
  return <KitHint>{text}</KitHint>;
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  multi,
  onGround,
  grid,
  grid2,
}: {
  options: { code: T; label: string }[];
  value: T | T[] | undefined;
  onChange: (v: T | T[] | undefined) => void;
  multi?: boolean;
  /** Equal-width chips on one line, so a trait's options line up (kit `.k-grid2/3`); long words wrap inside. */
  grid?: boolean;
  /** Two equal columns (kit `.pg-grid2`), e.g. the four Sex choices. */
  grid2?: boolean;
  /** Chips sitting straight on the screen ground (not in a grey group) are grey; selected turns white + ring. */
  onGround?: boolean;
}) {
  const s = useFieldStyles();
  const { t } = useTheme();
  const selected = (code: T) => (Array.isArray(value) ? value.includes(code) : value === code);
  return (
    <View style={[s.chips, grid && { flexWrap: 'nowrap' }]}>
      {options.map((o) => {
        const on = selected(o.code);
        return (
          <Pressable
            key={String(o.code)}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on }}
            onPress={() => {
              if (multi) {
                const arr = Array.isArray(value) ? value : [];
                onChange(on ? arr.filter((c) => c !== o.code) : [...arr, o.code]);
              } else onChange(on ? undefined : o.code);
            }}
            style={({ pressed }) => [
              s.chip,
              grid && { flex: 1, minWidth: 0, paddingHorizontal: 8 },
              grid2 && { flexBasis: '47%', flexGrow: 1, paddingHorizontal: 10 },
              onGround && !on && { backgroundColor: t.grey },
              on && s.chipOn,
              pressed && { backgroundColor: onGround ? t.greyPress : t.secPress },
            ]}
          >
            {on && <Icon name="check" size={20} color={t.ink} strokeWidth={2.25} />}
            <Text style={[s.chipText, on && s.chipTextOn, grid && { textAlign: 'center', flexShrink: 1, lineHeight: 20 }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Keeps the typed text (so "12." survives) and reports a number, or undefined when the box is emptied.
 * Text that isn't a number (e.g. "4..5") is never saved and never wipes the last good value; the box says so. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  integer,
  unit,
  prefix,
  accessibilityLabel,
  onBlur,
  boxStyle,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  onBlur?: () => void;
  /** e.g. a grey box when the input sits on a white card (kit `.k-next .fk-num`). */
  boxStyle?: object;
  placeholder?: string;
  integer?: boolean;
  unit?: string;
  prefix?: string;
  accessibilityLabel?: string;
}) {
  const s = useFieldStyles();
  const { t } = useTheme();
  const [focus, setFocus] = useState(false);
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const parse = (x: string) => (x.trim() === '' ? undefined : Number(x.trim().replace(',', '.')));
  const typed = parse(text);
  const notANumber = typed !== undefined && Number.isNaN(typed);
  useEffect(() => {
    // Only follow the stored value when it changed from outside (e.g. a correction was accepted).
    const x = parse(text);
    if (x !== value && !(x !== undefined && Number.isNaN(x))) setText(value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <View style={s.gap}>
      <View style={[s.box, boxStyle, focus && s.boxFocus, notANumber && s.boxError]}>
        {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput
          style={s.numText}
          value={text}
          accessibilityLabel={accessibilityLabel}
          placeholder={placeholder}
          placeholderTextColor={t.ink2}
          keyboardType={integer ? 'number-pad' : 'decimal-pad'}
          returnKeyType="done"
          onFocus={() => setFocus(true)}
          onBlur={() => {
            setFocus(false);
            onBlur?.();
          }}
          onChangeText={(x) => {
            setText(x);
            const n = parse(x);
            if (n !== undefined && Number.isNaN(n)) return; // not a number yet: keep what is saved
            onChange(n);
          }}
        />
        {unit ? <Text style={s.unitText}>{unit}</Text> : null}
        <View style={s.kb} accessibilityElementsHidden importantForAccessibility="no">
          <Icon name="keypad" size={20} color={t.ink2} />
        </View>
      </View>
      {notANumber && (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginHorizontal: 4 }}>
          <Icon name="warning" size={16} color={t.offTintInk} />
          <Text style={[type.sub, { color: t.offTintInk, flex: 1 }]}>
            Not a number, so not saved{value !== undefined ? ` (still ${value})` : ''}. Fix it, or clear the box.
          </Text>
        </View>
      )}
    </View>
  );
}

export function TextBox({ value, onChange, multiline, placeholder, error }: { value: string | undefined; onChange: (v: string | undefined) => void; multiline?: boolean; placeholder?: string; error?: boolean }) {
  const s = useFieldStyles();
  const { t } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[s.box, focus && s.boxFocus, error && s.boxError, multiline && { alignItems: 'flex-start' }]}>
      <TextInput
        style={[s.text, multiline && s.multiline]}
        value={value ?? ''}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={t.ink2}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onChangeText={(x) => onChange(x === '' ? undefined : x)}
      />
    </View>
  );
}

export function MeasurementInput({
  field,
  value,
  onChange,
}: {
  field: EffectiveField;
  value: (Measurement & { scaleUsed?: string }) | undefined;
  onChange: (v: (Measurement & { scaleUsed?: string }) | undefined) => void;
}) {
  const s = useFieldStyles();
  const unit = field.unit ?? 'mm';
  const isMass = field.key === 'mass';
  const [method, setMethod] = useState<string | undefined>(value?.method ?? (field.default as string | undefined));
  const build = (n: number | undefined, m: string | undefined) => {
    if (n === undefined) return undefined;
    const precision = isMass && m ? SCALE_PRECISION_G[m] : undefined;
    return {
      value: n,
      unit,
      ...(m ? { method: m } : {}),
      ...(precision !== undefined ? { precision } : {}),
      ...(isMass && m ? { scaleUsed: m } : {}),
    } as Measurement & { scaleUsed?: string };
  };
  return (
    <View style={s.gap}>
      <NumberInput value={value?.value} unit={UNIT_LABEL[unit] ?? unit} onChange={(n) => onChange(build(n, method))} accessibilityLabel={field.label} />
      <Hint text={rangeHint(field, value?.value)} />
      {field.choices && field.choices.length > 0 && (
        <>
          <Text style={[s.help, { marginTop: 4 }]}>{isMass ? 'Scale used' : 'Method'}</Text>
          <Chips
            options={field.choices}
            value={method}
            onChange={(m) => {
              const next = m as string | undefined;
              setMethod(next);
              if (value) onChange(build(value.value, next));
            }}
          />
        </>
      )}
    </View>
  );
}

export function TimeInput({ value, onChange, nowIso }: { value: string | undefined; onChange: (v: string) => void; nowIso: () => string }) {
  const s = useFieldStyles();
  const { t } = useTheme();
  return (
    <View style={s.timeRow}>
      <Text style={s.time}>{clockOf(value)}</Text>
      <Pressable style={({ pressed }) => [s.chip, pressed && { backgroundColor: t.secPress }]} onPress={() => onChange(nowIso())}>
        <Icon name="clock" size={18} color={t.ink} />
        <Text style={s.chipText}>Set to now</Text>
      </Pressable>
    </View>
  );
}

/** Renders a simple field from its definition. Special types (taxon, location, photos, people, transect)
 * are drawn by the screen and passed in as `special`. */
export function FieldInput({
  field,
  value,
  onChange,
  nowIso,
  special,
}: {
  field: EffectiveField;
  value: unknown;
  onChange: (v: unknown) => void;
  nowIso: () => string;
  special?: ReactNode;
}) {
  const s = useFieldStyles();
  let body: ReactNode = special ?? null;
  if (!special) {
    switch (field.type) {
      case 'text':
        body = <TextBox value={value as string | undefined} onChange={onChange} multiline={field.group === 'notes'} />;
        break;
      case 'number':
        body = (
          <>
            <NumberInput
              value={value as number | undefined}
              onChange={onChange}
              unit={field.unit ? UNIT_LABEL[field.unit] ?? field.unit : undefined}
              integer={field.path.startsWith('scaleCounts.') || field.key === 'surveyorCount'}
              accessibilityLabel={field.label}
            />
            <Hint text={rangeHint(field, value as number | undefined)} />
          </>
        );
        break;
      case 'measurement':
        body = <MeasurementInput field={field} value={value as Measurement | undefined} onChange={onChange} />;
        break;
      case 'choice': {
        const options = (field.choices ?? []).map((c) => ({
          code: field.valueType === 'number' ? Number(c.code) : c.code,
          label: c.label,
        }));
        // Four choices on an animal sit in two even columns, as in comp P4 (Sex, Scale used).
        body = <Chips grid2={field.recordType === 'encounter' && options.length === 4} options={options} value={value as string | number | undefined} onChange={onChange} />;
        break;
      }
      case 'multi-choice':
        body = <Chips options={field.choices ?? []} value={value as string[] | undefined} onChange={onChange} multi />;
        break;
      case 'boolean':
        body = (
          <Chips
            options={[
              { code: 'yes', label: 'Yes' },
              { code: 'no', label: 'No' },
            ]}
            value={value === true ? 'yes' : value === false ? 'no' : undefined}
            onChange={(v) => onChange(v === 'yes' ? true : v === 'no' ? false : undefined)}
          />
        );
        break;
      case 'time':
        body = <TimeInput value={value as string | undefined} onChange={onChange} nowIso={nowIso} />;
        break;
      default:
        body = <Text style={s.help}>({field.type} field)</Text>;
    }
  }
  return (
    <View style={s.field}>
      <FieldLabel field={field} />
      {field.help ? <Text style={s.help}>{field.help}</Text> : null}
      {body}
    </View>
  );
}

/** Static day styles for screens not yet moved onto the theme (legacy `s as fs` imports). */
export const s = StyleSheet.create({
  field: { gap: 6, paddingVertical: 4 },
  label: { ...type.label, color: day.ink },
  unit: { fontWeight: '400', color: day.ink2 },
  small: { ...type.sub, color: day.ink2 },
  gap: { gap: 8 },
  input: { minHeight: 60, borderRadius: radius.card, paddingHorizontal: 14, ...type.body, color: day.ink, backgroundColor: day.card },
  multiline: { minHeight: 104, paddingTop: 14, textAlignVertical: 'top' },
});
