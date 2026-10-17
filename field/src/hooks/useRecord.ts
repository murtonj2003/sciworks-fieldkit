// Edit one record: every change is a draft write; leaving the screen seals it into the next rev.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getRecord, saveDraft, seal } from '@/db/records';
import { touched } from '@/model/factory';
import type { LocalRecord } from '@/model/records';
import { useField } from '@/state/field';

export function useRecord<T extends LocalRecord>(id: string | undefined) {
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
        if (id) seal(id);
        field.refresh();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]),
  );

  const update = useCallback(
    (change: (r: T) => T) => {
      const cur = latest.current;
      if (!cur) return;
      const next = touched(change(cur), tz);
      latest.current = next;
      setRecord(next);
      saveDraft(next);
    },
    [tz],
  );

  const sealNow = useCallback(() => {
    if (id) seal(id);
    field.refresh();
  }, [id, field]);

  return { record, update, sealNow };
}
