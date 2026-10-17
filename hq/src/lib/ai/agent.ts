// The AI review agent (HQ-WEB-BRIEF §6). Runs only when online, after an import or on request.
// It reads the records with the shared checkers as tools and DRAFTS corrections and notes. It has no tool that
// changes a record, approves, rejects or sends anything: the Data Manager decides every draft.

import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import { v7 as uuidv7 } from 'uuid'
import { db, type AiRunRow, type HqDb } from '../../db'
import { loadSetup } from '../setup'
import { nowIso } from '../time'
import {
  addNote,
  batchCheckTransectTool,
  checkCoordinateTool,
  checkPointSetTool,
  checkRangesTool,
  draftCorrection,
  getRecord,
  listRecords,
  runKeyTool,
  searchTaxaTool,
  writeSummary,
  type ToolContext,
} from './tools'

export const AI_MODEL = 'claude-opus-5-5'

const SYSTEM = `You are the data-quality reviewer at the base camp of a herpetology field project (reptiles and amphibians on pre-mapped transects in Costa Rica). Surveyors record animals offline on phones; the records reach the Data Manager's laptop in bundles. You help the Data Manager review them.

What you can and can't do:
- You can only read records and run the project's own deterministic checkers (the same code the phones run). You cannot change any record, approve, reject or send anything.
- When a value is very likely a typing slip and the checkers support one specific fix, call draft_correction. A person approves or discards every draft, so give a short, plain-words reason a surveyor would understand, and say what the checker found.
- When something deserves a look but there is no single safe fix, call add_note instead.
- Never invent species, measurements or coordinates. Base every draft on a checker result: a range from the species pack, a "did you mean?" coordinate suggestion, or a name match. If the evidence is weak, add a note rather than a draft.
- Typical slips: an extra or missing zero (4350 for 435), two digits swapped in a GPS easting or northing, a misheard or misspelled species name. A coordinate that the surveyor already fixed in the field (fixedInTheField) is fine; don't re-flag it.
- An out-of-walking-order point on a one-way transect is worth a note, not a correction.

How to work:
1. Call list_records to see the records in this review.
2. For each animal, use check_ranges and check_coordinate where its warnings or values suggest a problem. Use search_taxa for unknown or provisional species names, run_key if scale counts are present, and batch_check_transect for a walk with five or more animals.
3. Draft corrections or add notes as above. Don't draft the same fix twice.
4. Finish by calling write_summary once: a few short lines for the Data Manager, per team (records reviewed, what was fixed in the field, what you drafted or noted, anything that needs their eye). Plain words, no markdown headings.`

export interface ReviewScope {
  keys: string[]
  label: string
}

export type ReviewOutcome = { ok: true; runId: string } | { ok: false; runId?: string; message: string }

const stepText = (name: string, input: unknown) => {
  const i = input as Record<string, unknown>
  const key = typeof i?.recordKey === 'string' ? ` ${i.recordKey.split(':')[0]} …${i.recordKey.slice(-4)}` : ''
  switch (name) {
    case 'list_records':
      return 'Listing the records to review'
    case 'get_record':
      return `Reading record${key}`
    case 'check_coordinate':
      return `Checking the coordinate of${key}`
    case 'check_ranges':
      return `Checking measurements of${key} against the species pack`
    case 'batch_check_transect':
      return `Checking every point on ${String(i?.transectId)} on ${String(i?.date)}`
    case 'check_point_set':
      return 'Checking a set of points against each other'
    case 'search_taxa':
      return `Looking up the name "${String(i?.query)}" in the species pack`
    case 'run_key':
      return `Running the scale-count key on${key}`
    case 'draft_correction':
      return `Drafting a correction for${key} (${String(i?.fieldPath)})`
    case 'add_note':
      return `Adding a note on${key}`
    case 'write_summary':
      return 'Writing the summary'
    default:
      return name
  }
}

function makeTools(ctx: ToolContext) {
  const json = (v: unknown) => JSON.stringify(v)
  const guarded =
    <A,>(fn: (input: A) => unknown) =>
    async (input: A) => {
      try {
        return json(await fn(input))
      } catch (err) {
        return json({ error: (err as Error).message })
      }
    }
  const recordKey = z.string().describe('The record key from list_records, e.g. "encounter:0199…"')
  return [
    betaZodTool({
      name: 'list_records',
      description: 'List records with a one-line summary each (species, measurements, coordinate band, warnings). Call this first. Scope "this-review" = the records you were asked to review.',
      inputSchema: z.object({
        scope: z.enum(['this-review', 'all']).optional(),
        teamId: z.string().optional(),
        onlyWithWarnings: z.boolean().optional(),
      }),
      run: guarded((i) => listRecords(ctx, i)),
    }),
    betaZodTool({
      name: 'get_record',
      description: 'Read one record in full, with every field, the phone check and HQ check results, and field labels with units.',
      inputSchema: z.object({ recordKey }),
      run: guarded((i) => getRecord(ctx, i)),
    }),
    betaZodTool({
      name: 'check_coordinate',
      description: "Re-run the transect coordinate check on an animal's point: distance from the line, band, and 'did you mean?' fixes for typing slips. Call when a point is amber/red or looks odd.",
      inputSchema: z.object({ recordKey }),
      run: guarded((i) => checkCoordinateTool(ctx, i)),
    }),
    betaZodTool({
      name: 'check_ranges',
      description: "Compare an animal's SVL, tail and mass with the species pack's published ranges, with the source. Call for every animal with measurements.",
      inputSchema: z.object({ recordKey }),
      run: guarded((i) => checkRangesTool(ctx, i)),
    }),
    betaZodTool({
      name: 'batch_check_transect',
      description: 'Check every animal point on one transect walk together (robust outlier, shared GPS datum shift). Needs five or more points.',
      inputSchema: z.object({ transectId: z.string(), date: z.string().describe('YYYY-MM-DD') }),
      run: guarded((i) => batchCheckTransectTool(ctx, i)),
    }),
    betaZodTool({
      name: 'check_point_set',
      description: 'Check a set of points that should sit together (e.g. the outline of a pond) against each other, with "did you mean?" fixes.',
      inputSchema: z.object({
        points: z.array(z.object({ label: z.string(), lat: z.number(), lon: z.number() })).min(4),
        closed: z.boolean().optional(),
      }),
      run: guarded((i) => checkPointSetTool(ctx, i)),
    }),
    betaZodTool({
      name: 'search_taxa',
      description: 'Find species in the site pack by a possibly misspelled or misheard name. Returns up to 5 matches with the reason (exact, spelling, sounds-like…).',
      inputSchema: z.object({ query: z.string() }),
      run: guarded((i) => searchTaxaTool(ctx, i)),
    }),
    betaZodTool({
      name: 'run_key',
      description: "Run the scale-count species key on an animal's recorded scale counts. Use when the recorded species and the counts might disagree.",
      inputSchema: z.object({ recordKey }),
      run: guarded((i) => runKeyTool(ctx, i)),
    }),
    betaZodTool({
      name: 'draft_correction',
      description:
        'Draft a correction request for the Data Manager to approve. It does NOT change the record. fieldPath is the template path (e.g. "svl", "mass", "tailLength", "sex", "location"). For a measurement or number give proposedNumber (a JSON number in the field unit, mm or g, e.g. 435). For a choice or text give proposedValue. For location give proposedLat and proposedLon.',
      inputSchema: z.object({
        recordKey,
        fieldPath: z.string(),
        proposedNumber: z.number().optional().describe('For measurements and numbers: the value as a JSON number in the field unit, e.g. 435'),
        proposedValue: z.union([z.number(), z.string(), z.boolean()]).optional().describe('For choices (the choice code) and text'),
        proposedLat: z.number().optional(),
        proposedLon: z.number().optional(),
        reason: z.string().describe('One or two plain-words sentences the surveyor will read, citing what the checker found.'),
      }),
      run: guarded((i) => draftCorrection(ctx, i)),
    }),
    betaZodTool({
      name: 'add_note',
      description: 'Leave a plain-words note on a record for the Data Manager when something needs a look but there is no single safe fix. Does not change the record.',
      inputSchema: z.object({ recordKey, note: z.string() }),
      run: guarded((i) => addNote(ctx, i)),
    }),
    betaZodTool({
      name: 'write_summary',
      description: 'Save the short data-quality summary for the Data Manager. Call once, at the end.',
      inputSchema: z.object({ summary: z.string() }),
      run: guarded((i) => writeSummary(ctx, i)),
    }),
  ]
}

const running = new Set<string>()
export const isRunning = () => running.size > 0
let stopRequested = false
export const requestStop = () => {
  stopRequested = true
}

/** Plain words for every way a run can fail. Everything else in HQ keeps working. */
function explain(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The API key was not accepted. Check it in AI settings.'
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use the model. Check the key's workspace in the Anthropic console."
  if (err instanceof Anthropic.RateLimitError) return 'The AI service is busy (rate limit). Try again in a minute.'
  if (err instanceof Anthropic.APIConnectionError) return "Can't reach the AI service: no internet connection. The checks have already run; everything else works offline."
  if (err instanceof Anthropic.InternalServerError) return 'The AI service had a problem. Try again shortly.'
  if (err instanceof Anthropic.APIError) return `The AI service returned an error (${err.status ?? 'unknown'}): ${err.message}`
  return (err as Error)?.message ?? String(err)
}

export async function runReview(
  scope: ReviewScope,
  opts: { apiKey?: string; d?: HqDb; fetch?: typeof fetch; online?: boolean } = {},
): Promise<ReviewOutcome> {
  const d = opts.d ?? db
  if (!opts.apiKey) return { ok: false, message: 'Add an Anthropic API key in AI settings to use the AI reviewer. Everything else works without it.' }
  const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine)
  if (!online) return { ok: false, message: "No internet connection, so the AI reviewer can't run now. The checks have already run on import; everything else works offline." }
  if (!scope.keys.length) return { ok: false, message: 'Nothing to review.' }
  if (running.size) return { ok: false, message: 'A review is already running.' }

  const setup = await loadSetup(d)
  const runId = uuidv7()
  running.add(runId)
  stopRequested = false
  const run: AiRunRow = { runId, startedAt: nowIso(), state: 'running', model: AI_MODEL, scopeKeys: scope.keys, scopeLabel: scope.label, steps: [], draftIds: [], noteIds: [] }
  await d.aiRuns.add(run)
  const log = (kind: AiRunRow['steps'][number]['kind'], text: string) =>
    d.aiRuns.where('runId').equals(runId).modify((r: AiRunRow) => void r.steps.push({ at: nowIso(), kind, text }))

  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, ...(opts.fetch ? { fetch: opts.fetch } : {}) })
  const ctx: ToolContext = { d, setup, runId, scopeKeys: scope.keys }
  const usage = { inputTokens: 0, outputTokens: 0 }

  try {
    const runner = client.beta.messages.toolRunner({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_iterations: 30,
      system: SYSTEM,
      tools: makeTools(ctx),
      messages: [
        {
          role: 'user',
          content: `Please review ${scope.keys.length} record(s): ${scope.label}. Project "${setup.project?.name ?? '?'}", species pack "${setup.speciesPack?.packId ?? 'none'}". Draft corrections only where a checker supports one specific fix; finish with write_summary.`,
        },
      ],
    })

    let last: Anthropic.Beta.BetaMessage | undefined
    for await (const message of runner) {
      last = message
      usage.inputTokens += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0)
      usage.outputTokens += message.usage.output_tokens
      for (const block of message.content) {
        if (block.type === 'tool_use') await log('tool', stepText(block.name, block.input))
        else if (block.type === 'text' && block.text.trim()) await log('text', block.text.trim())
      }
      if (message.stop_reason === 'refusal') {
        await log('error', 'The model declined this request.')
        break
      }
      if (stopRequested) {
        await log('info', 'Stopped by the Data Manager.')
        await d.aiRuns.update(runId, { state: 'stopped', finishedAt: nowIso(), usage })
        return { ok: true, runId }
      }
    }
    const final = await d.aiRuns.get(runId)
    if (last?.stop_reason === 'max_tokens') await log('error', 'The reply was cut off (too long). Drafts made so far are kept.')
    if (!final?.summary) {
      const text = last?.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()
      if (text) await d.aiRuns.update(runId, { summary: text })
    }
    await d.aiRuns.update(runId, { state: 'done', finishedAt: nowIso(), usage })
    return { ok: true, runId }
  } catch (err) {
    const message = explain(err)
    await log('error', message)
    await d.aiRuns.update(runId, { state: 'failed', finishedAt: nowIso(), error: message, usage })
    return { ok: false, runId, message }
  } finally {
    running.delete(runId)
  }
}

/** The records a review should look at: everything not yet approved or rejected (optionally just some keys). */
export async function scopeToReview(keys?: string[], d: HqDb = db): Promise<ReviewScope> {
  const rows = (await d.records.toArray()).filter((r) => !r.voided && r.status !== 'approved' && r.status !== 'rejected')
  const chosen = keys ? rows.filter((r) => keys.includes(r.key)) : rows
  const teams = [...new Set(chosen.map((r) => r.teamId))].join(', ')
  return { keys: chosen.map((r) => r.key), label: keys ? `just imported (${teams})` : `everything not yet approved (${teams || 'none'})` }
}
