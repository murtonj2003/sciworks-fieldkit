// One input per FieldDef.type. Every change is reported up at once (the screen saves a draft on each one).
// Warnings say "Check?" and never stop a save.
import type { Measurement } from '@sciworks/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { clockOf } from '@/lib/time';
import { SCALE_PRECISION_G, UNIT_LABEL, rangeHint, type EffectiveField } from '@/model/form';

import { colors } from './ui';

export function FieldLabel({ field, extra }: { field: EffectiveField; extra?: ReactNode }) {
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>
        {field.label}
        {field.unit ? <Text style={s.unit}> ({UNIT_LABEL[field.unit] ?? field.unit})</Text> : null}
        {field.origin === 'team' ? <Text style={s.team}>  team field</Text> : null}
      </Text>
      {extra}
    </View>
  );
}

export function Hint({ text, tone = 'warn' }: { text: string | null; tone?: 'warn' | 'info' }) {
  if (!text) return null;
  return <Text style={[s.hint, tone === 'warn' ? s.hintWarn : s.hintInfo]}>{tone === 'warn' ? '⚠ ' : ''}{text}</Text>;
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  multi,
}: {
  options: { code: T; label: string }[];
  value: T | T[] | undefined;
  onChange: (v: T | T[] | undefined) => void;
  multi?: boolean;
}) {
  const selected = (code: T) => (Array.isArray(value) ? value.includes(code) : value === code);
  return (
    <View style={s.chips}>
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
            style={({ pressed }) => [s.chip, on && s.chipOn, pressed && s.pressed]}
          >
            <Text style={[s.chipText, on && s.chipTextOn]}>
              {on ? '✓ ' : ''}
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Keeps the typed text (so "12." survives) and reports a number, or undefined when empty. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  integer,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  integer?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    // Only follow the stored value when it changed from outside (e.g. a correction was accepted).
    const typed = text.trim() === '' ? undefined : Number(text.replace(',', '.'));
    if (typed !== value && !Number.isNaN(typed)) setText(value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextInput
      style={s.input}
      value={text}
      placeholder={placeholder ?? '—'}
      placeholderTextColor={colors.dim}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      returnKeyType="done"
      onChangeText={(t) => {
        setText(t);
        const n = Number(t.replace(',', '.'));
        onChange(t.trim() === '' || Number.isNaN(n) ? undefined : n);
      }}
    />
  );
}

export function TextBox({ value, onChange, multiline }: { value: string | undefined; onChange: (v: string | undefined) => void; multiline?: boolean }) {
  return (
    <TextInput
      style={[s.input, multiline && s.multiline]}
      value={value ?? ''}
      multiline={multiline}
      placeholder="—"
      placeholderTextColor={colors.dim}
      onChangeText={(t) => onChange(t === '' ? undefined : t)}
    />
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
      <NumberInput value={value?.value} onChange={(n) => onChange(build(n, method))} />
      <Hint text={rangeHint(field, value?.value)} />
      {field.choices && field.choices.length > 0 && (
        <>
          <Text style={s.small}>{isMass ? 'Scale used' : 'Method'}</Text>
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
  return (
    <View style={s.timeRow}>
      <Text style={s.time}>{clockOf(value)}</Text>
      <Pressable style={({ pressed }) => [s.chip, pressed && s.pressed]} onPress={() => onChange(nowIso())}>
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
              integer={field.path.startsWith('scaleCounts.') || field.key === 'surveyorCount'}
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
        body = <Chips options={options} value={value as string | number | undefined} onChange={onChange} />;
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
        body = <Text style={s.small}>({field.type} field)</Text>;
    }
  }
  return (
    <View style={s.field}>
      <FieldLabel field={field} />
      {field.help ? <Text style={s.small}>{field.help}</Text> : null}
      {body}
    </View>
  );
}

export const s = StyleSheet.create({
  field: { gap: 8, paddingVertical: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 18, fontWeight: '700', color: colors.ink },
  unit: { fontWeight: '400', color: colors.dim },
  team: { fontSize: 14, fontWeight: '600', color: colors.primary },
  small: { fontSize: 15, color: colors.dim },
  gap: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 56,
    minWidth: 56,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: 17, fontWeight: '600', color: colors.ink },
  chipTextOn: { color: '#FFFFFF' },
  pressed: { opacity: 0.6 },
  input: {
    minHeight: 60,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 22,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  multiline: { minHeight: 110, fontSize: 18, paddingTop: 12, textAlignVertical: 'top' },
  hint: { fontSize: 16, fontWeight: '600' },
  hintWarn: { color: colors.amber },
  hintInfo: { color: colors.dim },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  time: { fontSize: 28, fontWeight: '800', color: colors.ink, minWidth: 90 },
});
