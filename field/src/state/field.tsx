// App-wide state: what HQ set up, who is holding the phone, and the "not with HQ" counter.
// The database is the truth; this only caches it for the screens and re-reads on refresh().
import type { Person } from '@sciworks/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { listBasemaps, type StoredBasemap } from '@/db/basemaps';
import { listSpeciesPhotos, type StoredSpeciesPhoto } from '@/db/speciesPhotos';
import { computeCounter, type Counter } from '@/db/feedback';
import { deviceId, getMeta, setMeta } from '@/db/meta';
import { loadSetup, type SetupState } from '@/db/setup';

export interface FieldState extends SetupState {
  deviceId: string;
  person: Person | null;
  counter: Counter;
  /** Satellite pictures to draw under the transect maps (newest per basemapId, file on the phone). */
  basemaps: StoredBasemap[];
  /** Species photos saved from HQ bundles, by taxonId (shown offline, each with its credit). */
  speciesPhotos: Record<string, StoredSpeciesPhoto>;
  /** Re-read everything from the database. */
  refresh: () => void;
  choosePerson: (personId: string) => void;
}

const Ctx = createContext<FieldState | null>(null);

function read(): Omit<FieldState, 'refresh' | 'choosePerson'> {
  const personId = getMeta('personId');
  const project = loadSetup(null).project;
  const person = project?.people.find((p) => p.personId === personId) ?? null;
  return {
    ...loadSetup(person?.teamId ?? null),
    deviceId: deviceId(),
    person,
    counter: computeCounter(),
    basemaps: listBasemaps(),
    speciesPhotos: listSpeciesPhotos(),
  };
}

export function FieldProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(read);
  const refresh = useCallback(() => setState(read()), []);
  const choosePerson = useCallback((personId: string) => {
    setMeta('personId', personId);
    setState(read());
  }, []);
  const value = useMemo(() => ({ ...state, refresh, choosePerson }), [state, refresh, choosePerson]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useField(): FieldState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useField outside FieldProvider');
  return v;
}

export const ROLE_LABEL: Record<Person['role'], string> = {
  'project-lead': 'Project Lead',
  'data-manager': 'Data Manager',
  'team-lead': 'Team Lead',
  surveyor: 'Surveyor',
};
