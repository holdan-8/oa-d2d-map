/**
 * useActionStore – manages the door-to-door action state.
 *
 * State is persisted in localStorage so it survives page refreshes without
 * requiring a backend.  In a future integration with an existing Vue/Nuxt
 * backend the persistence layer can be swapped out without touching the UI.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionStatus = 'not-started' | 'assigned' | 'in-progress' | 'done'

export interface QuartierAction {
  /** Unique identifier – OSM id or fallback id */
  id: string
  name: string
  status: ActionStatus
  assignedTo: string
  notes: string
  updatedAt: string
}

export interface ActionStore {
  actions: Ref<Record<string, QuartierAction>>
  getAction: (id: string, name: string) => QuartierAction
  setStatus: (id: string, status: ActionStatus) => void
  setAssignedTo: (id: string, assignedTo: string) => void
  setNotes: (id: string, notes: string) => void
  resetAll: () => void
  stats: ComputedRef<{
    total: number
    notStarted: number
    assigned: number
    inProgress: number
    done: number
    progressPercent: number
  }>
}

// ---------------------------------------------------------------------------
// Status metadata (colour, label)
// ---------------------------------------------------------------------------

export const STATUS_META: Record<ActionStatus, { label: string; color: string; fillColor: string; tailwind: string }> = {
  'not-started': {
    label: 'Nicht begonnen',
    color: '#9ca3af',
    fillColor: '#d1d5db',
    tailwind: 'bg-gray-200 text-gray-700'
  },
  assigned: {
    label: 'Zugeteilt',
    color: '#d97706',
    fillColor: '#fde68a',
    tailwind: 'bg-yellow-200 text-yellow-800'
  },
  'in-progress': {
    label: 'In Bearbeitung',
    color: '#ea580c',
    fillColor: '#fed7aa',
    tailwind: 'bg-orange-200 text-orange-800'
  },
  done: {
    label: 'Erledigt',
    color: '#16a34a',
    fillColor: '#bbf7d0',
    tailwind: 'bg-green-200 text-green-800'
  }
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'd2d-bern-actions'

function loadFromStorage(): Record<string, QuartierAction> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveToStorage(data: Record<string, QuartierAction>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore storage errors (private browsing / quota exceeded)
  }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

// Single shared reactive store (singleton pattern for SPA)
const actions = ref<Record<string, QuartierAction>>({})
let initialised = false

export function useActionStore(): ActionStore {
  if (!initialised && typeof window !== 'undefined') {
    actions.value = loadFromStorage()
    initialised = true
  }

  function getAction(id: string, name: string): QuartierAction {
    if (!actions.value[id]) {
      actions.value[id] = {
        id,
        name,
        status: 'not-started',
        assignedTo: '',
        notes: '',
        updatedAt: new Date().toISOString()
      }
    }
    return actions.value[id]
  }

  function _update(id: string, patch: Partial<QuartierAction>): void {
    if (actions.value[id]) {
      actions.value[id] = {
        ...actions.value[id],
        ...patch,
        updatedAt: new Date().toISOString()
      }
    }
    saveToStorage(actions.value)
  }

  function setStatus(id: string, status: ActionStatus): void {
    _update(id, { status })
  }

  function setAssignedTo(id: string, assignedTo: string): void {
    _update(id, { assignedTo })
  }

  function setNotes(id: string, notes: string): void {
    _update(id, { notes })
  }

  function resetAll(): void {
    actions.value = {}
    saveToStorage({})
  }

  const stats = computed(() => {
    const all = Object.values(actions.value)
    const total = all.length
    const notStarted = all.filter((a) => a.status === 'not-started').length
    const assigned = all.filter((a) => a.status === 'assigned').length
    const inProgress = all.filter((a) => a.status === 'in-progress').length
    const done = all.filter((a) => a.status === 'done').length
    const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, notStarted, assigned, inProgress, done, progressPercent }
  })

  return { actions, getAction, setStatus, setAssignedTo, setNotes, resetAll, stats }
}
