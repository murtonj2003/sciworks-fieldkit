// The Anthropic API key for the AI reviewer. The Data Manager types it into HQ's settings box.
// It is kept ONLY in this browser's own storage: never in a file, a bundle, the HQ backup, a log or a commit.
// (Production would move the call behind a small server function so no key lives in the browser at all.)

const STORAGE_KEY = 'sciworks-hq.anthropic-api-key'

export function getApiKey(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) || undefined
  } catch {
    return undefined
  }
}

export function setApiKey(key: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, key.trim())
    return true
  } catch {
    return false
  }
}

export function forgetApiKey() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing stored */
  }
}

/** For display only: 'sk-ant-…a1b2'. Never shows the key itself. */
export function maskedKey(key?: string): string {
  return key ? `${key.slice(0, 7)}…${key.slice(-4)}` : ''
}

const AUTO_KEY = 'sciworks-hq.ai-auto-review'
export function getAutoReview(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off'
  } catch {
    return true
  }
}
export function setAutoReview(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? 'on' : 'off')
  } catch {
    /* per-browser convenience only */
  }
}
