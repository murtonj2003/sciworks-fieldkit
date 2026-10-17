// The AI reviewer, end to end, against a SCRIPTED stand-in for the Claude API (no network, no key, no cost).
// It proves the wiring: the real tools run, a draft is created, nothing in any record changes, and the
// request asks for the right model with the default refusal fallback.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Encounter } from '@sciworks/shared'
import { HqDb } from '../src/db'
import { AI_MODEL, runReview, scopeToReview } from '../src/lib/ai/agent'
import { checkRangesTool, draftCorrection, searchTaxaTool } from '../src/lib/ai/tools'
import { makeHqBundle } from '../src/lib/hqBundle'
import { importBundleFile } from '../src/lib/importBundle'
import { loadSetup } from '../src/lib/setup'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)))
let n = 0
async function loaded() {
  const d = new HqDb(`hq-ai-${Date.now()}-${n++}`)
  await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
  await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip', d)
  return d
}
const svlKey = async (d: HqDb) => (await d.records.toArray()).find((r) => (r.data as Encounter).svl?.value === 4350)!.key

type Block = { type: 'tool_use'; name: string; input: unknown } | { type: 'text'; text: string }
function scriptedApi(turns: Block[][]) {
  const requests: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = []
  let i = 0
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v))
    requests.push({ url: String(url), headers, body: JSON.parse(String(init?.body)) })
    const blocks = turns[Math.min(i, turns.length - 1)]!
    i++
    const content = blocks.map((b, j) => (b.type === 'tool_use' ? { ...b, id: `toolu_${i}_${j}` } : b))
    const msg = {
      id: `msg_${i}`,
      type: 'message',
      role: 'assistant',
      model: AI_MODEL,
      content,
      stop_reason: blocks.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 20 },
    }
    return new Response(JSON.stringify(msg), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { fakeFetch, requests }
}

describe('W7 · AI reviewer tools (read-only + draft)', () => {
  it('check_ranges reports the out-of-range SVL with the pack maximum and its source', async () => {
    const d = await loaded()
    const ctx = { d, setup: await loadSetup(d), runId: 'r', scopeKeys: [] }
    const r = (await checkRangesTool(ctx, { recordKey: await svlKey(d) })) as { warnings: { message: string }[]; packRanges: { svlMm?: { max?: number } } }
    expect(r.warnings[0]?.message).toContain('4,350 mm is above')
    expect(r.packRanges.svlMm?.max).toBe(646)
  })

  it('search_taxa finds a misspelled name', async () => {
    const d = await loaded()
    const ctx = { d, setup: await loadSetup(d), runId: 'r', scopeKeys: [] }
    expect((searchTaxaTool(ctx, { query: 'leptodira' }) as { scientificName: string }[])[0]?.scientificName).toBe('Leptodeira ornata')
  })

  it('draft_correction builds the full measurement, refuses unknown fields, and never duplicates', async () => {
    const d = await loaded()
    await d.aiRuns.add({ runId: 'r', startedAt: '', state: 'running', model: AI_MODEL, scopeKeys: [], scopeLabel: '', steps: [], draftIds: [], noteIds: [] })
    const ctx = { d, setup: await loadSetup(d), runId: 'r', scopeKeys: [] }
    const key = await svlKey(d)
    const bad = (await draftCorrection(ctx, { recordKey: key, fieldPath: 'status', proposedValue: 'void', reason: 'x' })) as { error?: string }
    expect(bad.error).toContain("can't be corrected")
    await draftCorrection(ctx, { recordKey: key, fieldPath: 'svl', proposedValue: 435, reason: 'extra zero' })
    await draftCorrection(ctx, { recordKey: key, fieldPath: 'svl', proposedValue: 435, reason: 'extra zero' })
    const drafts = await d.corrections.toArray()
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ state: 'draft', source: 'ai-agent', fieldPath: 'svl', proposed: { value: 435, unit: 'mm', method: 'tape', precision: 1 } })
    expect((await d.aiRuns.get('r'))?.draftIds).toHaveLength(1)
  })
})

describe('W7 · numbers sent as text (found in the first live run)', () => {
  it('draft_correction accepts "435", "435 mm" or proposedNumber for a measurement', async () => {
    const d = await loaded()
    await d.aiRuns.add({ runId: 'r', startedAt: '', state: 'running', model: AI_MODEL, scopeKeys: [], scopeLabel: '', steps: [], draftIds: [], noteIds: [] })
    const ctx = { d, setup: await loadSetup(d), runId: 'r', scopeKeys: [] }
    const key = await svlKey(d)
    const asText = (await draftCorrection(ctx, { recordKey: key, fieldPath: 'svl', proposedValue: '435', reason: 'extra zero' })) as { error?: string }
    expect(asText.error).toBeUndefined()
    expect((await d.corrections.toArray())[0]?.proposed).toMatchObject({ value: 435, unit: 'mm' })
    const withUnit = (await draftCorrection(ctx, { recordKey: key, fieldPath: 'mass', proposedValue: '3.8 g', reason: 'x' })) as { error?: string }
    expect(withUnit.error).toBeUndefined()
    const typed = (await draftCorrection(ctx, { recordKey: key, fieldPath: 'tailLength', proposedNumber: 14, reason: 'x' })) as { error?: string }
    expect(typed.error).toBeUndefined()
    const bad = (await draftCorrection(ctx, { recordKey: key, fieldPath: 'svl', proposedValue: 'about four hundred', reason: 'x' })) as { error?: string }
    expect(bad.error).toContain('got "about four hundred"')
  })
})

describe('W7 · the review loop (scripted API)', () => {
  it('flags the 4,350 mm SVL and drafts 435 mm; records are untouched; the draft stays at HQ until approved', async () => {
    const d = await loaded()
    const key = await svlKey(d)
    const before = await d.records.toArray()
    const { fakeFetch, requests } = scriptedApi([
      [{ type: 'tool_use', name: 'list_records', input: { scope: 'this-review' } }],
      [{ type: 'tool_use', name: 'check_ranges', input: { recordKey: key } }],
      [
        { type: 'text', text: 'SVL 4,350 mm is far above the 646 mm maximum; 435 mm fits.' },
        { type: 'tool_use', name: 'draft_correction', input: { recordKey: key, fieldPath: 'svl', proposedValue: 435, reason: 'SVL 4,350 mm is far above the pack maximum (646 mm); 435 mm fits. An extra zero?' } },
      ],
      [{ type: 'tool_use', name: 'write_summary', input: { summary: 'Team B: 4 records. 1 coordinate typo fixed in the field. 1 SVL outside the pack range: drafted 435 mm.' } }],
      [{ type: 'text', text: 'Done.' }],
    ])

    const out = await runReview(await scopeToReview(undefined, d), { apiKey: 'sk-ant-test', d, fetch: fakeFetch, online: true })
    expect(out.ok).toBe(true)
    if (!out.ok) return

    // The request: latest model, explicit effort, default refusal fallback, only our read/draft tools.
    const first = requests[0]!
    expect(first.url).toContain('/v1/messages')
    expect(first.body.model).toBe('claude-opus-5-5')
    expect(first.body.fallbacks).toBe('default')
    expect(first.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01')
    expect((first.body.output_config as { effort: string }).effort).toBe('medium')
    const toolNames = (first.body.tools as { name: string }[]).map((t) => t.name).sort()
    expect(toolNames).toEqual(['add_note', 'batch_check_transect', 'check_coordinate', 'check_point_set', 'check_ranges', 'draft_correction', 'get_record', 'list_records', 'run_key', 'search_taxa', 'write_summary'])
    // The real tools ran: the range result went back to the model.
    expect(JSON.stringify(requests[2]!.body.messages)).toContain('646')

    const run = (await d.aiRuns.get(out.runId))!
    expect(run.state).toBe('done')
    expect(run.summary).toContain('drafted 435 mm')
    expect(run.draftIds).toHaveLength(1)
    expect(run.steps.map((s) => s.text)).toContain('Writing the summary')

    const draft = (await d.corrections.get(run.draftIds[0]!))!
    expect(draft).toMatchObject({ state: 'draft', source: 'ai-agent', fieldPath: 'svl', proposed: { value: 435 } })
    // The AI never edits data.
    expect(await d.records.toArray()).toEqual(before)
    // An unapproved draft never leaves HQ.
    const hq = await makeHqBundle('team-b', {}, d)
    expect(hq.counts.corrections).toBe(0)
  })

  it('with no key or no internet it says so plainly, and nothing runs', async () => {
    const d = await loaded()
    const scope = await scopeToReview(undefined, d)
    const noKey = await runReview(scope, { d })
    expect(noKey.ok).toBe(false)
    if (!noKey.ok) expect(noKey.message).toContain('Add an Anthropic API key')
    const offline = await runReview(scope, { d, apiKey: 'sk-ant-test', online: false })
    if (!offline.ok) expect(offline.message).toContain('No internet connection')
    expect(await d.aiRuns.count()).toBe(0)
  })

  it('a rejected key is reported in plain words and the run is logged as failed', async () => {
    const d = await loaded()
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch
    const out = await runReview(await scopeToReview(undefined, d), { d, apiKey: 'sk-ant-wrong', fetch: fakeFetch, online: true })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.message).toBe('The API key was not accepted. Check it in AI settings.')
    expect((await d.aiRuns.toArray())[0]?.state).toBe('failed')
  })
})
