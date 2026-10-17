// P8 · Team Lead changes the form offline (Susie's #1 pain). Only what HQ allows (`teamCan`, inside `limits`).
// Every change is a new overlay rev; new records are stamped with it at once. Nothing is ever deleted.
// Kit: info card, Add a field group (folds to a row once used), mint success, Requests to HQ, field lists with
// grey Change pills; the surveyor sees the same lists read-only.
import type { FieldDef, Overlay, TeamEdit, Unit } from '@sciworks/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Chips, NumberInput, TextBox, useFieldStyles } from '@/components/fields';
import { BandMarker, Icon } from '@/components/Icon';
import { Button, Group, GroupTitle, Hint, Row, T, Tag } from '@/components/ui';
import { newId } from '@/db/meta';
import { addChangeRequest, addProvisionalTaxon, listChangeRequests, listProvisionalTaxa, saveOverlay } from '@/db/team';
import { nowIso } from '@/lib/time';
import { UNIT_LABEL, effectiveFields, type EffectiveField } from '@/model/form';
import { checkChange, promoteRequest, startOverlay, teamFieldDef, withAddedField, withChange, type NewTeamField } from '@/model/overlay';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const EDIT_LABEL: Record<TeamEdit, string> = {
  'show-hide': 'Show or hide',
  default: 'Default',
  range: 'Usual range',
  label: 'Label',
  'choices-subset': 'Choices offered',
};

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 10 },
  info: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.card, backgroundColor: t.card },
  infoBold: { ...type.sub, fontWeight: '600', color: t.ink },
  infoText: { ...type.sub, color: t.ink2 },
  success: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: 11, paddingBottom: 12, paddingHorizontal: 14, borderRadius: radius.card, backgroundColor: t.onFill },
  successText: { ...type.sub, color: t.onInk, flex: 1 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 14 },
  rowTop: { alignItems: 'flex-start', paddingTop: 11, paddingBottom: 10 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 14 },
  sepTile: { height: 1, backgroundColor: t.hair, marginLeft: 54 },
  rowTitle: { ...type.body, color: t.ink },
  rowSub: { ...type.sub, color: t.ink2 },
  editor: { gap: 14, paddingHorizontal: 14, paddingBottom: 14 },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingLeft: 8, paddingRight: 10, borderRadius: radius.pill, backgroundColor: t.group, marginRight: 4 },
  pillText: { ...type.small, fontWeight: '600', color: t.ink },
  rowBtn: { minHeight: 56, borderRadius: radius.card, backgroundColor: t.sec, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  rowBtnText: { ...type.title, color: t.ink, flex: 1 },
  err: { flexDirection: 'row', gap: 6, alignItems: 'center', marginHorizontal: 4 },
  errText: { ...type.sub, color: t.offTintInk, flex: 1 },
}));

export default function FormSettings() {
  const field = useField();
  const { template, overlay, person, project, pack } = field;
  const s = useStyles();
  const fs = useFieldStyles();
  const { t } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameError, setNameError] = useState(false);
  const [addOpen, setAddOpen] = useState(true);
  const [draft, setDraft] = useState<NewTeamField>({ label: '', type: 'number', recordType: 'encounter' });
  const [choicesText, setChoicesText] = useState('');
  const [species, setSpecies] = useState<{ name?: string; rank?: 'species' | 'genus' | 'family' | 'morphospecies'; notes?: string }>({ rank: 'species' });

  if (!template || !person || !project) return <T>Load a project and choose a person first.</T>;
  const isLead = person.role === 'team-lead';
  const now = () => nowIso(project.timeZone);
  const base: Overlay = overlay ?? startOverlay(template, person.teamId, person, field.deviceId, now());
  const who = (code: string) => project.people.find((p) => p.personId === code)?.name ?? code;

  function commit(next: Overlay, note: string) {
    saveOverlay(next, person!.personId);
    field.refresh();
    setMsg({ ok: true, text: `${note} (team change ${next.overlayRev}). New records use it straight away.` });
  }

  function change(f: EffectiveField, what: TeamEdit, value: unknown, note: string) {
    const err = checkChange(f, what, value);
    if (err) return setMsg({ ok: false, text: err });
    commit(withChange(base, { fieldKey: f.key, what, value }, person!, field.deviceId, now(), template!.coreVersion), note);
  }

  function addField() {
    if (!draft.label.trim()) {
      setNameError(true);
      return;
    }
    const def = teamFieldDef({ ...draft, choices: choicesText.split(',') }, template!, base);
    if (def.type === 'choice' && !def.choices?.length) return setMsg({ ok: false, text: 'List the choices, separated by commas.' });
    const at = now();
    const next = withAddedField(base, def, person!, field.deviceId, at, template!.coreVersion);
    saveOverlay(next, person!.personId);
    addChangeRequest(promoteRequest(def, template!, person!, field.deviceId, at, newId()));
    field.refresh();
    setDraft({ label: '', type: 'number', recordType: draft.recordType });
    setChoicesText('');
    setNameError(false);
    setAddOpen(false);
    setMsg({
      ok: true,
      text: `Added "${def.label}" (team change ${next.overlayRev}). It's on the next ${def.recordType === 'encounter' ? 'animal' : 'survey'} form now, and a request to add it to the core form goes to HQ in the next bundle.`,
    });
  }

  function addSpecies() {
    const name = species.name?.trim();
    if (!name) return setMsg({ ok: false, text: 'Type the name you want to use.' });
    addProvisionalTaxon({
      provisionalTaxonId: newId(),
      proposedName: name,
      rank: species.rank,
      ...(species.notes ? { notes: species.notes } : {}),
      teamId: person!.teamId,
      createdBy: person!.personId,
      deviceId: field.deviceId,
      createdAt: now(),
    });
    setSpecies({ rank: 'species' });
    setMsg({ ok: true, text: `"${name}" can be picked now. It stays provisional until HQ approves or maps it.` });
  }

  // Team-added fields first, newest first (design P8b), then the template's own order.
  const tunable = (rt: FieldDef['recordType']) => {
    const list = effectiveFields(template, overlay, rt).filter((f) => (f.teamCan?.length ?? 0) > 0 || f.origin === 'team');
    return [...list.filter((f) => f.origin === 'team').reverse(), ...list.filter((f) => f.origin !== 'team')];
  };

  const editor = (f: EffectiveField) => {
    const original = template.fields.find((x) => x.key === f.key);
    const edits: TeamEdit[] = f.origin === 'team' ? ['show-hide', 'label'] : (f.teamCan ?? []);
    return (
      <View style={s.editor}>
        {edits.map((what) => (
          <View key={what} style={fs.gap}>
            <Text style={fs.label}>{EDIT_LABEL[what]}</Text>
            {what === 'show-hide' && (
              <Chips
                options={[
                  { code: 'shown', label: 'Shown' },
                  { code: 'hidden', label: 'Hidden' },
                ]}
                value={f.hidden ? 'hidden' : 'shown'}
                onChange={(v) => v && change(f, 'show-hide', v === 'hidden', `${f.label} ${v === 'hidden' ? 'hidden' : 'shown'}`)}
              />
            )}
            {what === 'default' && (original?.choices?.length ?? 0) > 0 && (
              <Chips
                options={(f.choices ?? original!.choices!).map((c) => ({ code: c.code, label: c.label }))}
                value={typeof f.default === 'string' ? f.default : undefined}
                onChange={(v) => change(f, 'default', v ?? null, `Default for ${f.label} set`)}
              />
            )}
            {what === 'range' && <RangeEditor field={f} onSave={(r) => change(f, 'range', r, `Usual range for ${f.label} set`)} />}
            {what === 'label' && <LabelEditor field={f} onSave={(l) => change(f, 'label', l, `Renamed to "${l}"`)} />}
            {what === 'choices-subset' && f.type === 'taxon' && pack && (
              <SubsetEditor
                options={pack.taxa.map((x) => ({ code: x.taxonId, label: x.scientificName }))}
                current={f.subset ?? pack.taxa.map((x) => x.taxonId)}
                onSave={(keep) => change(f, 'choices-subset', keep, `Site shortlist set to ${keep.length} species`)}
              />
            )}
            {what === 'choices-subset' && f.type !== 'taxon' && original?.choices && (
              <SubsetEditor
                options={original.choices}
                current={(f.choices ?? original.choices).map((c) => c.code)}
                onSave={(keep) => change(f, 'choices-subset', keep, `Choices for ${f.label} set`)}
              />
            )}
          </View>
        ))}
      </View>
    );
  };

  const fieldList = (rt: FieldDef['recordType'], title: string) => {
    const list = tunable(rt);
    return (
      <>
        <GroupTitle>{title}</GroupTitle>
        <Group>
          <View style={s.list}>
            {list.map((f, i) => (
              <View key={f.key}>
                {i > 0 && <View style={s.sep} />}
                <View style={s.row}>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.rowTitle}>
                      {f.label}
                      {f.unit ? ` (${UNIT_LABEL[f.unit]})` : ''}
                    </Text>
                    <Text style={s.rowSub}>
                      {f.origin === 'team' ? 'Added by the team' : f.tier === 'core' ? 'Core field: HQ allows some changes' : 'Team field'}
                      {' · '}
                      {f.hidden ? 'hidden' : 'shown'}
                      {f.min !== undefined || f.max !== undefined ? ` · usual ${f.min ?? '…'}–${f.max ?? '…'}` : ''}
                    </Text>
                  </View>
                  {isLead && (
                    <Button kind="grey" size={48} label={open === f.key ? 'Close' : 'Change'} onPress={() => setOpen(open === f.key ? null : f.key)} />
                  )}
                </View>
                {isLead && open === f.key && editor(f)}
              </View>
            ))}
          </View>
        </Group>
      </>
    );
  };

  const requests = listChangeRequests();
  const provisional = listProvisionalTaxa(person.teamId);

  const requestsBlock = requests.length > 0 && (
    <>
      <GroupTitle>Requests to HQ</GroupTitle>
      <Group>
        <View style={s.list}>
          {requests.map(({ request, decision }, i) => (
            <View key={request.changeRequestId}>
              {i > 0 && <View style={s.sepTile} />}
              <View style={[s.row, s.rowTop]}>
                <View style={s.tile}>
                  <Icon name="send" size={18} color={t.ink} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[type.sub, { fontWeight: '600', color: t.ink }]}>{request.proposal}</Text>
                  <Tag
                    icon={decision ? (decision.decision === 'accepted' ? 'check' : 'cross') : 'clock'}
                    label={
                      decision
                        ? decision.decision === 'accepted'
                          ? `accepted${decision.inCoreVersion ? ` in version ${decision.inCoreVersion}` : ''}`
                          : 'declined'
                        : 'waiting for HQ'
                    }
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </Group>
    </>
  );

  return (
    <View style={s.wrap}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={s.pill}>
              <Icon name="user" size={15} color={t.ink2} />
              <Text style={s.pillText}>{person.name}</Text>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Group>
          <View style={s.info}>
            <Icon name="sliders" size={20} color={t.ink2} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.infoBold}>
                Form {template.templateId} v{template.coreVersion}
                {overlay ? ` · team change ${overlay.overlayRev} by ${who(overlay.updatedBy)}` : ' · no team changes yet'}
              </Text>
              <Text style={s.infoText}>
                {isLead
                  ? 'Works offline. Core fields like species, coordinates, SVL and mass stay as HQ set them. Hiding a field never deletes anything already recorded.'
                  : 'Only the Team Lead can change the form. You can see what is set here.'}
              </Text>
            </View>
          </View>
        </Group>

        {msg &&
          (msg.ok ? (
            <View style={s.success} accessibilityLiveRegion="polite">
              <BandMarker band="green" size={20} />
              <Text style={s.successText}>{msg.text}</Text>
            </View>
          ) : (
            <Hint>{msg.text}</Hint>
          ))}

        {/* After a field is added, Requests to HQ moves up under the message and the card folds to a row (P8b). */}
        {!addOpen && requestsBlock}

        {isLead && !addOpen && (
          <Group>
            <Pressable accessibilityRole="button" style={({ pressed }) => [s.rowBtn, pressed && { backgroundColor: t.secPress }]} onPress={() => setAddOpen(true)}>
              <Icon name="plus" size={22} color={t.ink} strokeWidth={2} />
              <Text style={s.rowBtnText}>Add a field</Text>
              <Icon name="chev" size={20} color={t.ink2} />
            </Pressable>
          </Group>
        )}

        {isLead && addOpen && (
          <>
            <GroupTitle>Add a field</GroupTitle>
            <Group style={{ gap: 12, paddingVertical: 12 }}>
              <View style={fs.field}>
                <Text style={[fs.label, { marginHorizontal: 4 }]}>Name</Text>
                <TextBox
                  value={draft.label || undefined}
                  onChange={(v) => {
                    setDraft({ ...draft, label: v ?? '' });
                    if (v) setNameError(false);
                  }}
                />
                {nameError && (
                  <View style={s.err}>
                    <Icon name="warning" size={16} color={t.offTintInk} />
                    <Text style={s.errText}>Give the new field a name.</Text>
                  </View>
                )}
              </View>
              <View style={fs.field}>
                <Text style={[fs.label, { marginHorizontal: 4 }]}>On which form</Text>
                <Chips
                  options={[
                    { code: 'encounter', label: 'Animal' },
                    { code: 'survey', label: 'Survey' },
                  ]}
                  value={draft.recordType}
                  onChange={(v) => v && setDraft({ ...draft, recordType: v as NewTeamField['recordType'] })}
                />
              </View>
              <View style={fs.field}>
                <Text style={[fs.label, { marginHorizontal: 4 }]}>Type</Text>
                <Chips
                  options={[
                    { code: 'number', label: 'Number' },
                    { code: 'text', label: 'Text' },
                    { code: 'choice', label: 'Choice' },
                  ]}
                  value={draft.type}
                  onChange={(v) => v && setDraft({ ...draft, type: v as NewTeamField['type'] })}
                />
              </View>
              {draft.type === 'number' && (
                <View style={fs.field}>
                  <Text style={[fs.label, { marginHorizontal: 4 }]}>Unit</Text>
                  <Chips
                    options={[{ code: 'none', label: 'none' }, ...(['m', 'mm', 'g', 'degC', 'pct', 'h'] as Unit[]).map((u) => ({ code: u, label: UNIT_LABEL[u]! }))]}
                    value={draft.unit ?? 'none'}
                    onChange={(v) => setDraft({ ...draft, unit: !v || v === 'none' ? undefined : (v as Unit) })}
                  />
                </View>
              )}
              {draft.type === 'choice' && (
                <View style={fs.field}>
                  <Text style={[fs.label, { marginHorizontal: 4 }]}>Choices, separated by commas</Text>
                  <TextBox value={choicesText || undefined} onChange={(v) => setChoicesText(v ?? '')} />
                </View>
              )}
              <Button label="Add field" icon="plus" onPress={addField} />
            </Group>
          </>
        )}

        {fieldList('encounter', 'Animal form')}
        {fieldList('survey', 'Survey form')}

        {addOpen && requestsBlock}

        {isLead && (
          <>
            <GroupTitle>Add a species not in the pack</GroupTitle>
            <Group style={{ gap: 12, paddingVertical: 12 }}>
              <View style={fs.field}>
                <Text style={[fs.label, { marginHorizontal: 4 }]}>Name</Text>
                <TextBox value={species.name} onChange={(v) => setSpecies({ ...species, name: v })} placeholder="e.g. Ninia sp. (orange collar)" />
              </View>
              <Chips
                options={[
                  { code: 'species', label: 'Species' },
                  { code: 'genus', label: 'Genus' },
                  { code: 'family', label: 'Family' },
                  { code: 'morphospecies', label: 'Morphospecies' },
                ]}
                value={species.rank}
                onChange={(v) => setSpecies({ ...species, rank: (v as typeof species.rank) ?? 'species' })}
              />
              <View style={fs.field}>
                <Text style={[fs.label, { marginHorizontal: 4 }]}>Notes (how to tell it apart)</Text>
                <TextBox value={species.notes} onChange={(v) => setSpecies({ ...species, notes: v })} multiline />
              </View>
              <Button label="Add species" kind="white" size={56} onPress={addSpecies} />
              {provisional.map((x) => (
                <Row key={x.provisionalTaxonId} style={{ gap: 2 }}>
                  <T italic>{x.proposedName}</T>
                  <T v="sub" dim>
                    {x.rank ?? 'species'} · provisional until HQ decides
                  </T>
                </Row>
              ))}
            </Group>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function RangeEditor({ field, onSave }: { field: EffectiveField; onSave: (r: { min?: number; max?: number }) => void }) {
  const fs = useFieldStyles();
  const [min, setMin] = useState(field.min);
  const [max, setMax] = useState(field.max);
  const { minFloor, maxCeiling } = field.limits ?? {};
  return (
    <View style={fs.gap}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={fs.help}>Lowest</Text>
          <NumberInput value={min} onChange={setMin} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={fs.help}>Highest</Text>
          <NumberInput value={max} onChange={setMax} />
        </View>
      </View>
      {(minFloor !== undefined || maxCeiling !== undefined) && (
        <Text style={fs.help}>
          HQ allows {minFloor ?? '…'} to {maxCeiling ?? '…'}. Outside the usual range the form asks "Check?", it never blocks.
        </Text>
      )}
      <Button label="Save range" kind="white" size={56} onPress={() => onSave({ ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) })} />
    </View>
  );
}

function LabelEditor({ field, onSave }: { field: EffectiveField; onSave: (label: string) => void }) {
  const fs = useFieldStyles();
  const [label, setLabel] = useState(field.label);
  return (
    <View style={fs.gap}>
      <TextBox value={label} onChange={(v) => setLabel(v ?? '')} />
      <Button label="Save label" kind="white" size={56} onPress={() => label.trim() && onSave(label.trim())} />
    </View>
  );
}

function SubsetEditor({ options, current, onSave }: { options: { code: string; label: string }[]; current: string[]; onSave: (keep: string[]) => void }) {
  const fs = useFieldStyles();
  const [keep, setKeep] = useState<string[]>(current);
  return (
    <View style={fs.gap}>
      <Chips multi options={options} value={keep} onChange={(v) => setKeep((v as string[] | undefined) ?? [])} />
      <Button label={`Save (${keep.length} of ${options.length})`} kind="white" size={56} onPress={() => onSave(keep)} />
    </View>
  );
}
