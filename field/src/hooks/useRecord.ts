// Edit one record: every change is a draft write; leaving the screen seals it into the next rev.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clearFresh, getRecord, isFresh, saveDraft, seal, sealOrDiscard } from '@/db/records';
import { touched } from '@/model/factory';
import type { LocalRecord } from '@/model/records';
import { useField } from '@/state/field';

/**
 * `owner`: this screen made the record (the Animal screen after "Add animal"). Only the owner may throw away a
 * still-empty new record, and only when it closes; screens opened on top of it (species picker, scale key) just
 * leave a fresh record alone, so it is still there when the user comes back.
 */
export function useRecord<T extends LocalRecord>(id: string | undefined, opts: { owner?: boolean } = {}) {
  const owner = !!opts.owner;
  const field = useField();
  const tz = field.project?.timeZone;
  const [record, setRecord] = useState<T | null>(() => (id ? getRecord<T>(id) : null));
  const latest = useRef(record);
  latest.current = record;

  // Re-read when the screen comes back into view (another screen may have edited the same draft, e.g. the
  // species picker), and seal when it leaves.
  useFocusEffect(
    useCallback(() => {
      if (id) setRecord(getRecord<T>(id));
      return () => {
        if (id && !isFresh(id)) seal(id); // a fresh, empty record waits: the owner decides when it closes
        field.refresh();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]),
  );

  // The owner closing (Back, swipe, Done): seal, or drop the record if nothing was ever entered.
  useEffect(
    () => () => {
      if (owner && id) {
        sealOrDiscard(id);
        field.refresh();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, owner],
  );

  const entered = useRef(false);
  const update = useCallback(
    (change: (r: T) => T) => {
      const cur = latest.current;
      if (!cur) return;
      if (!entered.current && id) {
        entered.current = true;
        clearFresh(id); // something was entered: keep this record
      }
      const next = touched(change(cur), tz);
      latest.current = next;
      setRecord(next);
      saveDraft(next);
    },
    [tz, id],
  );

  const sealNow = useCallback(() => {
    if (id) {
      if (owner) sealOrDiscard(id);
      else if (!isFresh(id)) seal(id);
    }
    field.refresh();
  }, [id, field, owner]);

  return { record, update, sealNow };
}
