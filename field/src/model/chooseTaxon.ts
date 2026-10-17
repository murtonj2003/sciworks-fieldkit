// Choosing a species for an animal, from the picker, the field notebook or the compare sheet: one rule.
import type { Taxon } from '@sciworks/shared';

import { clearFresh, getRecord, saveDraftNow } from '@/db/records';
import { touched } from '@/model/factory';
import type { LocalEncounter } from '@/model/records';

export function chooseTaxon(encounterId: string, x: Taxon, timeZone?: string): void {
  const e = getRecord<LocalEncounter>(encounterId);
  if (!e) return;
  saveDraftNow(
    touched(
      {
        ...e,
        taxon: {
          ...e.taxon,
          taxonId: x.taxonId,
          scientificName: x.scientificName,
          unidentified: undefined,
          provisionalTaxonId: undefined,
          idBasis: e.taxon.idBasis === 'scale-key' || e.taxon.idBasis === 'photo-later' ? 'in-hand' : e.taxon.idBasis,
        },
      },
      timeZone,
    ),
  );
  clearFresh(encounterId); // a species was chosen: keep this animal
}
