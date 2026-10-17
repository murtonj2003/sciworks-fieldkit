// Project folders: each project is its own database; the list of folders lives in this browser's storage.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '@sciworks/shared'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
const reload = vi.fn()
vi.stubGlobal('location', { reload })

const { listFolders, newFolder, openFolder, rememberProject } = await import('../src/lib/projects')
const { currentDbName, DEFAULT_DB } = await import('../src/db')

beforeEach(() => {
  store.clear()
  reload.mockClear()
})

describe('project folders', () => {
  it('starts with the one default folder, named once its set-up loads', () => {
    expect(listFolders().map((f) => f.dbName)).toEqual([DEFAULT_DB])
    rememberProject({ projectId: 'cr-herps', name: 'Costa Rica herp transects (demo)' } as Project)
    expect(listFolders()[0]).toMatchObject({ dbName: DEFAULT_DB, projectId: 'cr-herps', name: 'Costa Rica herp transects (demo)' })
  })

  it('a new folder gets its own database, is listed, and opens', () => {
    newFolder()
    const now = currentDbName()
    expect(now).not.toBe(DEFAULT_DB)
    expect(now).toMatch(/^sciworks-hq-/)
    expect(listFolders().map((f) => f.dbName)).toEqual([DEFAULT_DB, now])
    expect(reload).toHaveBeenCalledOnce()
    openFolder(DEFAULT_DB)
    expect(currentDbName()).toBe(DEFAULT_DB)
  })
})
