<script setup lang="ts">
import type { QuartierFeature } from '~/composables/useBernData'
import { STATUS_META, useActionStore } from '~/composables/useActionStore'
import type { ActionStatus } from '~/composables/useActionStore'

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

const store = useActionStore()

const view = ref<'list' | 'detail'>('list')
const filterParticipant = ref<string | 'all'>('all')
const searchQuery = ref('')

watch(
    () => props.quartiere,
    (qs) => {
        qs.forEach((q) => store.getAction(q.properties.id, q.properties.name))
    },
    { immediate: true }
)

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

const selectedAction = computed(() => {
    if (!props.selectedId) return null
    return store.actions.value[props.selectedId] ?? null
})

const selectedQuartier = computed(() => {
    if (!props.selectedId) return null
    return props.quartiere.find((q) => q.properties.id === props.selectedId) ?? null
})

// Only show quartiere that are assigned or further
const filteredQuartiere = computed(() => {
    return props.quartiere
        .filter((q) => {
            const action = store.actions.value[q.properties.id]
            const status = action?.status ?? 'not-started'
            if (status === 'not-started') return false
            if (searchQuery.value) {
                if (!q.properties.name.toLowerCase().includes(searchQuery.value.toLowerCase())) return false
            }
            if (filterParticipant.value !== 'all') {
                if (!action?.assignedTo.includes(filterParticipant.value)) return false
            }
            return true
        })
        .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'))
})

const actionStats = computed(() => {
    const actionQuartiere = props.quartiere.filter((q) => {
        const s = store.actions.value[q.properties.id]?.status ?? 'not-started'
        return s !== 'not-started'
    })
    const total = actionQuartiere.length
    const done = actionQuartiere.filter((q) => store.actions.value[q.properties.id]?.status === 'done').length
    const inProgress = actionQuartiere.filter((q) => store.actions.value[q.properties.id]?.status === 'in-progress').length
    return { total, done, inProgress, percent: total > 0 ? Math.round((done / total) * 100) : 0 }
})

function selectQuartier(id: string, name: string): void {
    store.getAction(id, name)
    emit('select', id, name)
    view.value = 'detail'
}

function backToList(): void {
    emit('close')
    view.value = 'list'
}
</script>

<template>
    <div class="flex flex-col h-full bg-white">
        <!-- Header -->
        <div class="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div v-if="view === 'detail'" class="flex items-center gap-2 mb-1">
                <button class="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    @click="backToList">
                    ← Liste
                </button>
            </div>
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-base font-bold text-gray-900 leading-tight">
                        <span class="text-red-600">Aktion</span>
                    </h1>
                    <p class="text-xs text-gray-500 mt-0.5">Häuser &amp; Strassen markieren</p>
                </div>
                <button class="md:hidden text-gray-400 hover:text-gray-600 text-xl" @click="$emit('close')">
                    ✕
                </button>
            </div>

            <!-- Progress bar -->
            <div class="mt-2">
                <div class="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>Fortschritt</span>
                    <span class="font-semibold">
                        {{ actionStats.done }} / {{ actionStats.total }} erledigt ({{ actionStats.percent }}%)
                    </span>
                </div>
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div class="h-full bg-green-500 rounded-full transition-all duration-500"
                        :style="{ width: actionStats.percent + '%' }" />
                </div>
                <div class="flex gap-2 mt-1.5 text-xs text-gray-500">
                    <span>{{ actionStats.inProgress }} in Bearbeitung</span>
                </div>
            </div>
        </div>

        <!-- Loading/Error -->
        <div v-if="loading" class="flex items-center justify-center py-8 gap-2 text-gray-500 text-sm">
            Quartiersdaten werden geladen…
        </div>

        <div v-else-if="error"
            class="px-4 py-2 mx-4 mt-2 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs">
            ⚠ Fallback-Daten ({{ error }})
        </div>

        <!-- LIST VIEW -->
        <template v-if="view === 'list'">
            <!-- Filter -->
            <div class="flex-shrink-0 px-4 pt-3 pb-2 space-y-2 border-b border-gray-100">
                <input v-model="searchQuery" type="search" placeholder="Quartier suchen…"
                    class="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <!-- Filter by participant -->
                <div v-if="store.participants.value.length > 0" class="flex gap-1 flex-wrap">
                    <button :class="[
                        'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                        filterParticipant === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    ]" @click="filterParticipant = 'all'">
                        Alle
                    </button>
                    <button v-for="p in store.participants.value" :key="p" :class="[
                        'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                        filterParticipant === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    ]" @click="filterParticipant = filterParticipant === p ? 'all' : p">
                        {{ p }}
                    </button>
                </div>
            </div>

            <!-- Quartier list -->
            <div class="flex-1 overflow-y-auto scrollbar-thin">
                <div v-if="filteredQuartiere.length === 0" class="px-4 py-8 text-center text-gray-400 text-sm">
                    <p>Keine zugeteilten Quartiere.</p>
                    <p class="mt-1">Weise zuerst Quartiere im Planungsmodus zu.</p>
                </div>

                <button v-for="q in filteredQuartiere" :key="q.properties.id"
                    class="w-full text-left px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center gap-3"
                    :class="{ 'bg-blue-50': selectedId === q.properties.id }"
                    @click="selectQuartier(q.properties.id, q.properties.name)">
                    <span class="flex-shrink-0 w-3 h-3 rounded-full border-2" :style="{
                        background: STATUS_META[store.actions.value[q.properties.id]?.status ?? 'not-started'].fillColor,
                        borderColor: STATUS_META[store.actions.value[q.properties.id]?.status ?? 'not-started'].color
                    }" />
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-gray-800 truncate">{{ q.properties.name }}</div>
                        <div class="text-xs text-gray-400">
                            {{ (store.actions.value[q.properties.id]?.assignedTo ?? []).join(', ') }}
                            · {{ (store.actions.value[q.properties.id]?.markers ?? []).length }} Markierungen
                        </div>
                    </div>
                    <span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium"
                        :class="STATUS_META[store.actions.value[q.properties.id]?.status ?? 'not-started'].tailwind">
                        {{ STATUS_META[store.actions.value[q.properties.id]?.status ?? 'not-started'].label }}
                    </span>
                </button>
            </div>

            <!-- Footer -->
            <div class="flex-shrink-0 px-4 py-2 border-t border-gray-100">
                <span class="text-xs text-gray-400">{{ filteredQuartiere.length }} zugeteilte Quartiere</span>
            </div>
        </template>

        <!-- DETAIL VIEW -->
        <template v-else-if="view === 'detail' && selectedAction && selectedQuartier">
            <div class="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
                <div>
                    <h2 class="text-lg font-bold text-gray-900">{{ selectedQuartier.properties.name }}</h2>
                    <div class="flex flex-wrap gap-1 mt-1">
                        <span v-for="p in selectedAction.assignedTo" :key="p"
                            class="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                            {{ p }}
                        </span>
                    </div>
                </div>

                <!-- Status selector -->
                <div>
                    <label
                        class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</label>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="(meta, status) in STATUS_META" :key="status" :class="[
                            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                            selectedAction.status === status
                                ? meta.tailwind + ' border-current shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                        ]" @click="store.setStatus(selectedAction.id, status as ActionStatus)">
                            {{ meta.label }}
                        </button>
                    </div>
                </div>

                <!-- Map instruction -->
                <div class="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                    Aktiviere den Markierungsmodus auf der Karte, um Häuser oder Strassen als besucht zu markieren.
                </div>

                <!-- Markers list -->
                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Markierungen ({{ selectedAction.markers.length }})
                    </label>
                    <div v-if="selectedAction.markers.length === 0" class="text-xs text-gray-400">
                        Noch keine Markierungen gesetzt.
                    </div>
                    <div v-else class="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                        <div v-for="marker in selectedAction.markers" :key="marker.id"
                            class="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg text-sm group">
                            <span class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                            <input :value="marker.label || 'Markierung'"
                                class="flex-1 bg-transparent border-none text-sm text-gray-700 focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 rounded px-1 min-w-0"
                                @change="store.updateMarkerLabel(selectedAction.id, marker.id, ($event.target as HTMLInputElement).value)" />
                            <span class="text-xs text-gray-400 flex-shrink-0">
                                {{ new Date(marker.timestamp).toLocaleTimeString('de-CH', {
                                    hour: '2-digit', minute:
                                '2-digit' }) }}
                            </span>
                            <button
                                class="text-gray-300 hover:text-red-500 text-sm flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                @click="store.removeMarker(selectedAction.id, marker.id)">
                                ✕
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Notizen
                    </label>
                    <textarea :value="selectedAction.notes" rows="3"
                        placeholder="z.B. Anzahl Türen, besondere Hinweise, Feedback…"
                        class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                        @input="store.setNotes(selectedAction.id, ($event.target as HTMLTextAreaElement).value)" />
                </div>

                <!-- Last updated -->
                <p v-if="selectedAction.updatedAt" class="text-xs text-gray-400">
                    Zuletzt geändert: {{ new Date(selectedAction.updatedAt).toLocaleString('de-CH') }}
                </p>
            </div>
        </template>
    </div>
</template>
