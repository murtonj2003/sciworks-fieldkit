// The demo set-up (Costa Rica, La Selva, illustrative) and the golden sample Field bundle, straight from
// shared/fixtures. Both are precached by the PWA, so they load with no internet.

import hqSampleUrl from '../../../shared/fixtures/HQ_sample.zip?url'
import fieldSampleUrl from '../../../shared/fixtures/FIELD_sample.zip?url'
import { importBundleFile } from './importBundle'

async function fetchBytes(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not read ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Loads project, form core v1, transects, species pack and attribution. Its feedback part is ignored. */
export async function loadDemoProject() {
  return importBundleFile(await fetchBytes(hqSampleUrl), 'HQ_sample.zip (demo set-up)')
}

/** The Foundations sample: Team B's night survey and 3 animals. A stand-in if no phone is to hand. */
export async function loadSampleFieldBundle() {
  return importBundleFile(await fetchBytes(fieldSampleUrl), 'FIELD_sample.zip')
}
