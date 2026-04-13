<script setup lang="ts">
/**
 * SidePanel.vue
 *
 * Slide-in panel (desktop: right side, mobile: bottom sheet) that shows:
 *  - Overall progress overview
 *  - List of all Quartiere with status
 *  - Detail view for a selected Quartier (status, assignee, notes)
 */

import type { QuartierFeature } from '~/composables/useBernData'
import { STATUS_META, useActionStore } from '~/composables/useActionStore'
import type { ActionStatus } from '~/composables/useActionStore'

// ---------------------------------------------------------------------------
// Props / emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  quartiere: QuartierFeature[]
  selectedId: string | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string, name: string): void
  (e: 'close'): void
}>()

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = useActionStore()

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

const view = ref<'list' | 'detail'>('list')
const filterStatus = ref<ActionStatus | 'all'>('all')
const searchQuery = ref('')

// Initialise actions for all quartiere so stats are correct
watch(
  () => props.quartiere,
  (qs) => {
    qs.forEach((q) => store.getAction(q.properties.id, q.properties.name))
  },
  { immediate: true }
)

// When selectedId changes from parent (map click), switch to detail view
watch(
  () => props.selectedId,
  (id) => {
    if (id) {
      const q = props.quartiere.find((q) => q.properties.id === id)
      if (q) store.getAction(q.properties.id, q.properties.name)
      view.value = 'detail'
    } else {
      view.value = 'list'
    }
  }
)

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const selectedAction = computed(() => {
  if (!props.selectedId) return null
  return store.actions.value[props.selectedId] ?? null
})

const selectedQuartier = computed(() => {
  if (!props.selectedId) return null
  return props.quartiere.find((q) => q.properties.id === props.selectedId) ?? null
})

const filteredQuartiere = computed(() => {
  return props.quartiere
    .filter((q) => {
      if (searchQuery.value) {
        const q_lower = q.properties.name.toLowerCase()
        const s_lower = searchQuery.value.toLowerCase()
        if (!q_lower.includes(s_lower)) return false
      }
      if (filterStatus.value !== 'all') {
        const action = store.actions.value[q.properties.id]
        const status = action?.status ?? 'not-started'
        if (status !== filterStatus.value) return false
      }
      return true
    })
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'))
})

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

function selectQuartier(id: string, name: string): void {
  store.getAction(id, name)
  emit('select', id, name)
  view.value = 'detail'
}

function backToList(): void {
  emit('close')
  view.value = 'list'
}

function resetConfirm(): void {
  if (confirm('Alle Einträge zurücksetzen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
    store.resetAll()
    // Re-initialise
    props.quartiere.forEach((q) => store.getAction(q.properties.id, q.properties.name))
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-white">
    <!-- ------------------------------------------------------------------ -->
    <!-- Header                                                               -->
    <!-- ------------------------------------------------------------------ -->
    <div class="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-gray-50">
      <!-- Back button when in detail view -->
      <div v-if="view === 'detail'" class="flex items-center gap-2 mb-1">
        <button
          class="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
          @click="backToList"
        >
          ← Liste
        </button>
      </div>

      <!-- Title -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-base font-bold text-gray-900 leading-tight">
            <span class="text-red-600">D2D</span> Aktionskarte Bern
          </h1>
          <p class="text-xs text-gray-500 mt-0.5">Tür-zu-Tür Aktion – Region Bern</p>
        </div>
        <!-- Mobile close button -->
        <button class="md:hidden text-gray-400 hover:text-gray-600 text-xl" @click="$emit('close')">
          ✕
        </button>
      </div>

      <!-- Progress bar -->
      <div class="mt-2">
        <div class="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>Fortschritt</span>
          <span class="font-semibold">
            {{ store.stats.value.done }} / {{ store.stats.value.total }} erledigt
            ({{ store.stats.value.progressPercent }}%)
          </span>
        </div>
        <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-green-500 rounded-full transition-all duration-500"
            :style="{ width: store.stats.value.progressPercent + '%' }"
          />
        </div>

        <!-- Status summary chips -->
        <div class="flex flex-wrap gap-1 mt-2">
          <span
            v-for="(meta, status) in STATUS_META"
            :key="status"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
            :class="meta.tailwind"
          >
            <span>{{ meta.label }}</span>
            <span class="font-bold">
              {{
                status === 'not-started'
                  ? store.stats.value.notStarted
                  : status === 'assigned'
                  ? store.stats.value.assigned
                  : status === 'in-progress'
                  ? store.stats.value.inProgress
                  : store.stats.value.done
              }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- ------------------------------------------------------------------ -->
    <!-- Loading / Error states                                               -->
    <!-- ------------------------------------------------------------------ -->
    <div v-if="loading" class="flex items-center justify-center py-8 gap-2 text-gray-500 text-sm">
      <svg class="spinner w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      Quartiersdaten werden geladen…
    </div>

    <div
      v-else-if="error && quartiere.length === 0"
      class="px-4 py-3 mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs"
    >
      <p class="font-semibold">Fehler beim Laden der Daten</p>
      <p class="mt-1 text-red-600">{{ error }}</p>
      <p class="mt-1 text-red-500">Es werden Fallback-Daten angezeigt.</p>
    </div>

    <div
      v-else-if="error"
      class="px-4 py-2 mx-4 mt-2 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs"
    >
      ⚠ Fallback-Daten werden verwendet ({{ error }})
    </div>

    <!-- ------------------------------------------------------------------ -->
    <!-- LIST VIEW                                                             -->
    <!-- ------------------------------------------------------------------ -->
    <template v-if="view === 'list'">
      <!-- Search + filter -->
      <div class="flex-shrink-0 px-4 pt-3 pb-2 space-y-2 border-b border-gray-100">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Quartier suchen…"
          class="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div class="flex gap-1 flex-wrap">
          <button
            :class="[
              'px-2 py-0.5 rounded text-xs font-medium transition-colors',
              filterStatus === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            ]"
            @click="filterStatus = 'all'"
          >
            Alle
          </button>
          <button
            v-for="(meta, status) in STATUS_META"
            :key="status"
            :class="[
              'px-2 py-0.5 rounded text-xs font-medium transition-colors',
              filterStatus === status ? meta.tailwind + ' ring-1 ring-offset-0 ring-current' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            ]"
            @click="filterStatus = filterStatus === status ? 'all' : status as ActionStatus"
          >
            {{ meta.label }}
          </button>
        </div>
      </div>

      <!-- Quartier list -->
      <div class="flex-1 overflow-y-auto scrollbar-thin">
        <div v-if="filteredQuartiere.length === 0" class="px-4 py-8 text-center text-gray-400 text-sm">
          Keine Quartiere gefunden.
        </div>

        <button
          v-for="q in filteredQuartiere"
          :key="q.properties.id"
          class="w-full text-left px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-3"
          :class="{ 'bg-blue-50': selectedId === q.properties.id }"
          @click="selectQuartier(q.properties.id, q.properties.name)"
        >
          <!-- Status dot -->
          <span
            class="flex-shrink-0 w-3 h-3 rounded-full border-2"
            :style="{
              background: STATUS_META[store.actions.value[q.properties.id]?.status ?? 'not-started'].fillColor,
              borderColor: STATUS_META[store.actions.value[q.properties.id]?.status ?? 'not-started'].color
            }"
          />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-800 truncate">{{ q.properties.name }}</div>
            <div class="text-xs text-gray-400 truncate">
              {{ store.actions.value[q.properties.id]?.assignedTo || '—' }}
            </div>
          </div>
          <span
            class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium"
            :class="STATUS_META[store.actions.value[q.properties.id]?.status ?? 'not-started'].tailwind"
          >
            {{ STATUS_META[store.actions.value[q.properties.id]?.status ?? 'not-started'].label }}
          </span>
        </button>
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 px-4 py-2 border-t border-gray-100 flex justify-between items-center">
        <span class="text-xs text-gray-400">{{ filteredQuartiere.length }} Einträge</span>
        <button
          class="text-xs text-red-500 hover:text-red-700 font-medium"
          @click="resetConfirm"
        >
          Zurücksetzen
        </button>
      </div>
    </template>

    <!-- ------------------------------------------------------------------ -->
    <!-- DETAIL VIEW                                                           -->
    <!-- ------------------------------------------------------------------ -->
    <template v-else-if="view === 'detail' && selectedAction && selectedQuartier">
      <div class="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
        <!-- Quartier name -->
        <div>
          <h2 class="text-lg font-bold text-gray-900">{{ selectedQuartier.properties.name }}</h2>
          <p class="text-xs text-gray-500">
            Admin-Ebene: {{ selectedQuartier.properties.adminLevel || '–' }}
            <template v-if="selectedQuartier.properties.wikidata">
              ·
              <a
                :href="`https://www.wikidata.org/wiki/${selectedQuartier.properties.wikidata}`"
                target="_blank"
                rel="noopener"
                class="text-blue-500 hover:underline"
              >Wikidata</a>
            </template>
          </p>
        </div>

        <!-- Status selector -->
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="(meta, status) in STATUS_META"
              :key="status"
              :class="[
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                selectedAction.status === status
                  ? meta.tailwind + ' border-current shadow-sm'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              ]"
              @click="store.setStatus(selectedAction.id, status as ActionStatus)"
            >
              {{ meta.label }}
            </button>
          </div>
        </div>

        <!-- Assigned to -->
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Zuständige Person
          </label>
          <input
            :value="selectedAction.assignedTo"
            type="text"
            placeholder="Name der Person…"
            class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            @input="store.setAssignedTo(selectedAction.id, ($event.target as HTMLInputElement).value)"
          />
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Notizen
          </label>
          <textarea
            :value="selectedAction.notes"
            rows="4"
            placeholder="z.B. Anzahl Türen, besondere Hinweise, Feedback…"
            class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            @input="store.setNotes(selectedAction.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>

        <!-- Last updated -->
        <p v-if="selectedAction.updatedAt" class="text-xs text-gray-400">
          Zuletzt geändert: {{ new Date(selectedAction.updatedAt).toLocaleString('de-CH') }}
        </p>

        <!-- OSM link -->
        <a
          v-if="selectedQuartier.properties.osmId && !selectedQuartier.properties.osmId.startsWith('fallback')"
          :href="`https://www.openstreetmap.org/relation/${selectedQuartier.properties.osmId.replace('relation/', '')}`"
          target="_blank"
          rel="noopener"
          class="block text-xs text-blue-500 hover:underline"
        >
          🔗 In OpenStreetMap anzeigen
        </a>
      </div>
    </template>
  </div>
</template>
