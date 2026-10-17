// New records, stamped with who, where, which form version and which team overlay (SHARED-CONTRACT §5).
import type { Code, Person, Project, Stamp, Template } from '@sciworks/shared';

import { newId } from '@/db/meta';
import { localDate, nowIso } from '@/lib/time';

import type { LocalEncounter, LocalSurvey } from './records';

export interface StampContext {
  project: Project;
  template: Template;
  person: Person;
  deviceId: string;
  overlayRev: number;
}

function stamp(ctx: StampContext, at: string): Stamp {
  return {
    id: newId(),
    rev: 0, // set to 1 when first sealed
    projectId: ctx.project.projectId,
    teamId: ctx.person.teamId,
    deviceId: ctx.deviceId,
    createdBy: ctx.person.personId,
    createdAt: at,
    updatedAt: at,
    templateId: ctx.template.templateId,
    coreVersion: ctx.template.coreVersion,
    overlayRev: ctx.overlayRev,
    status: 'active',
  };
}

export function newSurvey(ctx: StampContext, transectId: Code, surveyorIds: Code[]): LocalSurvey {
  const at = nowIso(ctx.project.timeZone);
  return {
    ...stamp(ctx, at),
    recordType: 'survey',
    transectId,
    date: localDate(at),
    startedAt: at,
    surveyorIds,
    surveyorCount: surveyorIds.length,
    weatherStart: { at },
  };
}

export function newEncounter(ctx: StampContext, survey: LocalSurvey): LocalEncounter {
  const at = nowIso(ctx.project.timeZone);
  return {
    ...stamp(ctx, at),
    recordType: 'encounter',
    surveyId: survey.id,
    transectId: survey.transectId,
    observedAt: at,
    observerId: ctx.person.personId,
    taxon: { idBasis: 'in-hand' },
    sex: 'not-assessed',
    lifeStage: 'unknown',
    photoIds: [],
  };
}

/** Returns a copy with `updatedAt` refreshed. Every edit goes through this. */
export function touched<T extends { updatedAt: string }>(r: T, timeZone?: string): T {
  return { ...r, updatedAt: nowIso(timeZone) };
}
