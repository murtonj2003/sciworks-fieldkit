// Project folders: each one is its own HQ database on this laptop. The list lives in this browser's storage (it is
// only a list of names; every record stays in its project's own database, and nothing is ever deleted).

import { v7 as uuidv7 } from 'uuid'
import type { Project } from '@sciworks/shared'
import { CURRENT_DB_KEY, DEFAULT_DB, currentDbName } from '../db'
import { nowIso } from './time'

const LIST_KEY = 'sciworks-hq.projects'

export interface ProjectFolder {
  dbName: string
  /** The project's own name once its set-up is loaded. */
  name?: string
  projectId?: string
  addedAt: string
}

function read(): ProjectFolder[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function write(list: ProjectFolder[]) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
  } catch {
    /* the list just isn't remembered */
  }
}

/** Every project folder on this laptop, the one in use always included. */
export function listFolders(): ProjectFolder[] {
  const list = read()
  const current = currentDbName()
  if (!list.some((f) => f.dbName === current)) list.unshift({ dbName: current, addedAt: nowIso() })
  if (!list.some((f) => f.dbName === DEFAULT_DB)) list.unshift({ dbName: DEFAULT_DB, addedAt: nowIso() })
  return list
}

/** Called when a set-up loads, so the menu can show the project's name. */
export function rememberProject(project: Project | undefined) {
  if (!project) return
  const current = currentDbName()
  const list = listFolders()
  const f = list.find((x) => x.dbName === current)!
  if (f.name === project.name && f.projectId === project.projectId) return
  f.name = project.name
  f.projectId = project.projectId
  write(list)
}

/** Opens another project folder. HQ restarts on it (a moment; everything is local). */
export function openFolder(dbName: string) {
  try {
    localStorage.setItem(CURRENT_DB_KEY, dbName)
  } catch {
    return
  }
  location.reload()
}

/** A new, empty project folder. It opens on the set-up screen. */
export function newFolder() {
  const list = listFolders()
  const dbName = `sciworks-hq-${uuidv7().slice(-12)}`
  list.push({ dbName, addedAt: nowIso() })
  write(list)
  openFolder(dbName)
}
