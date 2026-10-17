// What a Team Lead makes in the field: overlay versions, change requests to HQ, provisional species.
// All insert-only; every overlay rev ever made is kept.
import type { ChangeRequest, ChangeRequestDecision, Overlay, ProvisionalTaxon } from '@sciworks/shared';

import { all, first, run } from './db';
import { overlayKey, putSetupVersion } from './setup';

export function saveOverlay(o: Overlay, by: string): void {
  putSetupVersion(overlayKey(o.teamId), o.overlayRev, o, `team-lead:${by}`);
}

export function addChangeRequest(cr: ChangeRequest): void {
  run('INSERT OR IGNORE INTO change_requests (id, json) VALUES (?, ?)', [cr.changeRequestId, JSON.stringify(cr)]);
}

export function listChangeRequests(): { request: ChangeRequest; decision: ChangeRequestDecision | null }[] {
  return all<{ json: string; decision: string | null }>(
    `SELECT c.json, (SELECT d.json FROM decisions d WHERE d.kind = 'change-request' AND d.target_id = c.id
                       ORDER BY d.rowid DESC LIMIT 1) AS decision
       FROM change_requests c ORDER BY c.rowid`,
  ).map((r) => ({ request: JSON.parse(r.json), decision: r.decision ? JSON.parse(r.decision) : null }));
}

export function addProvisionalTaxon(t: ProvisionalTaxon): void {
  run('INSERT OR IGNORE INTO provisional_taxa (id, json) VALUES (?, ?)', [t.provisionalTaxonId, JSON.stringify(t)]);
}

export function listProvisionalTaxa(teamId?: string): ProvisionalTaxon[] {
  return all<{ json: string }>('SELECT json FROM provisional_taxa ORDER BY rowid')
    .map((r) => JSON.parse(r.json) as ProvisionalTaxon)
    .filter((t) => !teamId || t.teamId === teamId);
}

export function provisionalTaxon(id: string): ProvisionalTaxon | null {
  const row = first<{ json: string }>('SELECT json FROM provisional_taxa WHERE id = ?', [id]);
  return row ? (JSON.parse(row.json) as ProvisionalTaxon) : null;
}
