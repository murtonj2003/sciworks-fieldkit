// Team Lead changes the form offline (Susie's #1 pain). Only what HQ allows (`teamCan`, inside `limits`).
// Every change is a new overlay rev; new records are stamped with it at once. Nothing is ever deleted.
import type { FieldDef, Overlay, TeamEdit, Unit } from '@sciworks/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips, NumberInput, TextBox, s as fs } from '@/components/fields';
import { Button, Card, H2, P, colors } from '@/components/ui';
import { newId } from '@/db/meta';
import { addChangeRequest, addProvisionalTaxon, listChangeRequests, listProvisionalTaxa, saveOverlay } from '@/db/team';
import { nowIso } from '@/lib/time';
import { UNIT_LABEL, effectiveFields, type EffectiveField } from '@/model/form';
import { checkChange, promoteRequest, startOverlay, teamFieldDef, withAddedField, withChange, type NewTeamField } from '@/model/overlay';
import { useField } from '@/state/field';

const EDIT_LABEL: Record<TeamEdit, string> = {
  'show-hide': 'Show or hide',
  default: 'Default',
  range: 'Usual range',
  label: 'Label',
  'choices-subset': 'Choices offered',
};

export default function FormSettings() {
  const field = useField();
  const { template, overlay, person, project, pack } = field;
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewTeamField>({ label: '', type: 'number', unit: 'm', recordType: 'encounter' });
  const [choicesText, setChoicesText] = useState('');
  const [species, setSpecies] = useState<{ name?: string; rank?: 'species' | 'genus' | 'family' | 'morphospecies'; notes?: string }>({ rank: 'species' });

  if (!template || !person || !project) return <P>Load a project and choose a person first.</P>;
  const isLead = person.role === 'team-lead';
  const now = () => nowIso(project.timeZone);
  const base: Overlay = overlay ?? startOverlay(template, person.teamId, person, field.deviceId, now());

  function commit(next: Overlay, note: string) {
    saveOverlay(next, person!.personId);
    field.refresh();
    setMsg(`✓ ${note} (team change ${next.overlayRev}). New records use it straight away.`);
  }

  function change(f: EffectiveField, what: TeamEdit, value: unknown, note: string) {
    const err = checkChange(f, what, value);
    if (err) return setMsg(`⚠ ${err}`);
    commit(withChange(base, { fieldKey: f.key, what, value }, person!, field.deviceId, now(), template!.coreVersion), note);
  }

  function addField() {
    if (!draft.label.trim()) return setMsg('⚠ Give the new field a name.');
    const def = teamFieldDef({ ...draft, choices: choicesText.split(',') }, template!, base);
    if (def.type === 'choice' && !def.choices?.length) return setMsg('⚠ List the choices, separated by commas.');
    const at = now();
    const next = withAddedField(base, def, person!, field.deviceId, at, template!.coreVersion);
    saveOverlay(next, person!.personId);
    addChangeRequest(promoteRequest(def, template!, person!, field.deviceId, at, newId()));
    field.refresh();
    setDraft({ label: '', type: 'number', unit: 'm', recordType: draft.recordType });
    setChoicesText('');
    setMsg(`✓ Added "${def.label}" (team change ${next.overlayRev}). It's on the next ${def.recordType === 'encounter' ? 'animal' : 'survey'} form now, and a request to add it to the core form goes to HQ in the next bundle.`);
  }

  function addSpecies() {
    const name = species.name?.trim();
    if (!name) return setMsg('⚠ Type the name you want to use.');
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
    setMsg(`✓ "${name}" can be picked now. It stays provisional until HQ approves or maps it.`);
  }

  const tunable = (rt: FieldDef['recordType']) =>
    effectiveFields(template, overlay, rt).filter((f) => (f.teamCan?.length ?? 0) > 0 || f.origin === 'team');

  const editor = (f: EffectiveField) => {
    const original = template.fields.find((t) => t.key === f.key);
    const edits: TeamEdit[] = f.origin === 'team' ? ['show-hide', 'label'] : (f.teamCan ?? []);
    return (
      <View style={styles.editor}>
        {edits.map((what) => (
          <View key={what} style={fs.gap}>
            <Text style={fs.small}>{EDIT_LABEL[what]}</Text>
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
                options={pack.taxa.map((t) => ({ code: t.taxonId, label: t.scientificName }))}
                current={f.subset ?? pack.taxa.map((t) => t.taxonId)}
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

  const fieldList = (rt: FieldDef['recordType'], title: string) => (
    <>
      <H2>{title}</H2>
      {tunable(rt).map((f) => (
        <Card key={f.key}>
          <Text style={fs.label}>
            {f.label}
            {f.unit ? <Text style={fs.unit}> ({UNIT_LABEL[f.unit]})</Text> : null}
          </Text>
          <Text style={fs.small}>
            {f.origin === 'team' ? 'Added by the team' : f.tier === 'core' ? 'Core field: HQ allows some changes' : 'Team field'}
            {' · '}
            {f.hidden ? 'hidden' : 'shown'}
            {f.min !== undefined || f.max !== undefined ? ` · usual ${f.min ?? '…'}–${f.max ?? '…'}` : ''}
          </Text>
          {isLead && (
            <Button kind="secondary" label={open === f.key ? 'Close' : 'Change'} onPress={() => setOpen(open === f.key ? null : f.key)} />
          )}
          {isLead && open === f.key && editor(f)}
        </Card>
      ))}
    </>
  );

  const requests = listChangeRequests();
  const provisional = listProvisionalTaxa(person.teamId);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <P>
          Form {template.templateId} v{template.coreVersion}
          {overlay ? ` · team change ${overlay.overlayRev} by ${project.people.find((p) => p.personId === overlay.updatedBy)?.name ?? overlay.updatedBy}` : ' · no team changes yet'}
        </P>
        <P dim>
          {isLead
            ? 'Works offline. Core fields like species, coordinates, SVL and mass stay as HQ set them. Hiding a field never deletes anything already recorded.'
            : 'Only the Team Lead can change the form. You can see what is set here.'}
        </P>
      </Card>
      {msg && (
        <Card style={msg.startsWith('⚠') ? styles.warn : styles.ok}>
          <P>{msg}</P>
        </Card>
      )}

      {isLead && (
        <Card>
          <H2>Add a field</H2>
          <Text style={fs.small}>Name</Text>
          <TextBox value={draft.label || undefined} onChange={(v) => setDraft({ ...draft, label: v ?? '' })} />
          <Text style={fs.small}>On which form</Text>
          <Chips
            options={[
              { code: 'encounter', label: 'Animal' },
              { code: 'survey', label: 'Survey' },
            ]}
            value={draft.recordType}
            onChange={(v) => v && setDraft({ ...draft, recordType: v as NewTeamField['recordType'] })}
          />
          <Text style={fs.small}>Type</Text>
          <Chips
            options={[
              { code: 'number', label: 'Number' },
              { code: 'text', label: 'Text' },
              { code: 'choice', label: 'Choice' },
            ]}
            value={draft.type}
            onChange={(v) => v && setDraft({ ...draft, type: v as NewTeamField['type'] })}
          />
          {draft.type === 'number' && (
            <>
              <Text style={fs.small}>Unit</Text>
              <Chips
                options={[{ code: 'none', label: 'none' }, ...(['m', 'mm', 'g', 'degC', 'pct', 'h'] as Unit[]).map((u) => ({ code: u, label: UNIT_LABEL[u]! }))]}
                value={draft.unit ?? 'none'}
                onChange={(v) => setDraft({ ...draft, unit: !v || v === 'none' ? undefined : (v as Unit) })}
              />
            </>
          )}
          {draft.type === 'choice' && (
            <>
              <Text style={fs.small}>Choices, separated by commas</Text>
              <TextBox value={choicesText || undefined} onChange={(v) => setChoicesText(v ?? '')} />
            </>
          )}
          <Button label="Add field" onPress={addField} />
        </Card>
      )}

      {fieldList('encounter', 'Animal form')}
      {fieldList('survey', 'Survey form')}

      {isLead && (
        <Card>
          <H2>Add a species not in the pack</H2>
          <TextBox value={species.name} onChange={(v) => setSpecies({ ...species, name: v })} />
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
          <Text style={fs.small}>Notes (how to tell it apart)</Text>
          <TextBox value={species.notes} onChange={(v) => setSpecies({ ...species, notes: v })} multiline />
          <Button label="Add species" onPress={addSpecies} />
          {provisional.map((t) => (
            <P key={t.provisionalTaxonId} dim>
              • {t.proposedName} ({t.rank ?? 'species'}), provisional
            </P>
          ))}
        </Card>
      )}

      {requests.length > 0 && <H2>Requests to HQ</H2>}
      {requests.map(({ request, decision }) => (
        <P key={request.changeRequestId} dim>
          • {request.proposal} · {decision ? (decision.decision === 'accepted' ? `accepted${decision.inCoreVersion ? ` in v${decision.inCoreVersion}` : ''}` : 'declined') : 'waiting for HQ'}
        </P>
      ))}
    </ScrollView>
  );
}

function RangeEditor({ field, onSave }: { field: EffectiveField; onSave: (r: { min?: number; max?: number }) => void }) {
  const [min, setMin] = useState(field.min);
  const [max, setMax] = useState(field.max);
  const { minFloor, maxCeiling } = field.limits ?? {};
  return (
    <View style={fs.gap}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={fs.small}>Lowest</Text>
          <NumberInput value={min} onChange={setMin} />
        </View>
        <View style={styles.flex}>
          <Text style={fs.small}>Highest</Text>
          <NumberInput value={max} onChange={setMax} />
        </View>
      </View>
      {(minFloor !== undefined || maxCeiling !== undefined) && (
        <Text style={fs.small}>
          HQ allows {minFloor ?? '…'} to {maxCeiling ?? '…'}. Outside the usual range the form asks "Check?", it never blocks.
        </Text>
      )}
      <Button label="Save range" onPress={() => onSave({ ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) })} />
    </View>
  );
}

function LabelEditor({ field, onSave }: { field: EffectiveField; onSave: (label: string) => void }) {
  const [label, setLabel] = useState(field.label);
  return (
    <View style={fs.gap}>
      <TextBox value={label} onChange={(v) => setLabel(v ?? '')} />
      <Button label="Save label" onPress={() => label.trim() && onSave(label.trim())} />
    </View>
  );
}

function SubsetEditor({ options, current, onSave }: { options: { code: string; label: string }[]; current: string[]; onSave: (keep: string[]) => void }) {
  const [keep, setKeep] = useState<string[]>(current);
  return (
    <View style={fs.gap}>
      <Chips multi options={options} value={keep} onChange={(v) => setKeep((v as string[] | undefined) ?? [])} />
      <Button label={`Save (${keep.length} of ${options.length})`} onPress={() => onSave(keep)} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 64 },
  editor: { gap: 14, paddingTop: 8 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, gap: 6 },
  warn: { borderColor: colors.amber, borderWidth: 2 },
  ok: { borderColor: colors.green, borderWidth: 2 },
});
