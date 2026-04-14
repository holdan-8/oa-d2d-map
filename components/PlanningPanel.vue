<script setup lang="ts">
import type { QuartierFeature } from '~/composables/useBernData'
import { usePlanningStore } from '~/composables/usePlanningStore'
import type { PlannedSection } from '~/composables/usePlanningStore'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const props = defineProps<{
    quartiere: QuartierFeature[]
    selectedId: string | null
    loading: boolean
    error: string | null
    drawingEnabled: boolean
    mapRef: { getMapElement: () => HTMLElement | null; zoomToSection: (id: string) => void } | null
}>()

const emit = defineEmits<{
    (e: 'select', id: string, name: string): void
    (e: 'close'): void
    (e: 'start-drawing'): void
    (e: 'stop-drawing'): void
    (e: 'section-click', id: string): void
}>()

const store = usePlanningStore()

const view = ref<'list' | 'create' | 'detail'>('list')
const createMode = ref<'draw' | 'quartier'>('draw')
const searchQuery = ref('')

// Form fields for new / edited section
const formAreaName = ref('')
const formLokalgruppe = ref('')
const formActionDate = ref('')
const formQuartierId = ref<string | null>(null)
const pendingCoordinates = ref<[number, number][][] | null>(null)

// Switch to create view
function startCreate(mode: 'draw' | 'quartier'): void {
    createMode.value = mode
    formAreaName.value = ''
    formLokalgruppe.value = ''
    formActionDate.value = ''
    formQuartierId.value = null
    pendingCoordinates.value = null
    view.value = 'create'
    if (mode === 'draw') {
        emit('start-drawing')
    }
}

function cancelCreate(): void {
    emit('stop-drawing')
    pendingCoordinates.value = null
    view.value = 'list'
}

// Called from parent when polygon is drawn on the map
function onPolygonDrawn(coordinates: [number, number][][]): void {
    pendingCoordinates.value = coordinates
    emit('stop-drawing')
}

// Save the section
function saveSection(): void {
    let coords: [number, number][][] | null = null
    let quartierId: string | null = null
    let quartierName: string | null = null

    if (createMode.value === 'draw') {
        if (!pendingCoordinates.value) return
        coords = pendingCoordinates.value
    } else {
        if (!formQuartierId.value) return
        const q = props.quartiere.find((q) => q.properties.id === formQuartierId.value)
        if (!q) return
        quartierId = q.properties.id
        quartierName = q.properties.name
        // Extract coordinates from the quartier geometry
        if (q.geometry.type === 'Polygon') {
            coords = (q.geometry as GeoJSON.Polygon).coordinates as [number, number][][]
        } else if (q.geometry.type === 'MultiPolygon') {
            coords = (q.geometry as GeoJSON.MultiPolygon).coordinates[0] as [number, number][][]
        }
    }

    const section = store.addSection({
        coordinates: coords,
        quartierId,
        quartierName,
        areaName: formAreaName.value,
        lokalgruppe: formLokalgruppe.value,
        actionDate: formActionDate.value,
    })

    pendingCoordinates.value = null
    store.selectSection(section.id)
    view.value = 'detail'
}

function selectSection(id: string): void {
    store.selectSection(id)
    view.value = 'detail'
    // Zoom map to section
    props.mapRef?.zoomToSection(id)
}

function backToList(): void {
    store.selectSection(null)
    emit('stop-drawing')
    view.value = 'list'
}

function deleteSection(id: string): void {
    if (confirm('Dieses Gebiet wirklich löschen?')) {
        store.removeSection(id)
        view.value = 'list'
    }
}

const filteredQuartiere = computed(() => {
    if (!searchQuery.value) return props.quartiere
    return props.quartiere
        .filter((q) => q.properties.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
        .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'de'))
})

const canSave = computed(() => {
    if (createMode.value === 'draw') {
        return !!pendingCoordinates.value && !!formAreaName.value.trim()
    }
    return !!formQuartierId.value && !!formAreaName.value.trim()
})

// Download helpers
const downloading = ref(false)

async function captureMap(): Promise<HTMLCanvasElement | null> {
    const el = props.mapRef?.getMapElement()
    if (!el) return null

    // html2canvas can't handle CSS translate3d transforms that Leaflet uses
    // for the map pane (panning) and tile containers (zoom positioning).
    // We temporarily convert ONLY these specific elements to top/left offsets.
    // We must NOT touch SVG internals or generic descendants.
    const saved: { el: HTMLElement; transform: string; top: string; left: string }[] = []

    function neutraliseTransform(target: HTMLElement): void {
        const cs = window.getComputedStyle(target)
        const t = cs.transform
        if (!t || t === 'none') return

        const match = t.match(/matrix.*?\((.+)\)/)
        if (!match) return
        const v = match[1].split(',').map(Number)
        const tx = v.length === 6 ? v[4] : v[12]
        const ty = v.length === 6 ? v[5] : v[13]
        if (isNaN(tx) || isNaN(ty)) return

        saved.push({
            el: target,
            transform: target.style.transform,
            top: target.style.top,
            left: target.style.left,
        })

        target.style.transform = 'none'
        target.style.left = `${(parseFloat(target.style.left) || 0) + tx}px`
        target.style.top = `${(parseFloat(target.style.top) || 0) + ty}px`
    }

    // 1. The main map pane (panning offset)
    const mapPane = el.querySelector<HTMLElement>('.leaflet-map-pane')
    if (mapPane) neutraliseTransform(mapPane)

    // 2. Tile containers (zoom-level offset)
    el.querySelectorAll<HTMLElement>('.leaflet-tile-container').forEach(neutraliseTransform)

    // 3. The overlay-pane SVG root element (polygon layer)
    el.querySelectorAll<HTMLElement>('.leaflet-overlay-pane > svg, .leaflet-overlay-pane > canvas').forEach(neutraliseTransform)

    // 4. The marker panes / tooltip panes (if any)
    el.querySelectorAll<HTMLElement>('.leaflet-marker-pane, .leaflet-tooltip-pane, .leaflet-popup-pane, .leaflet-shadow-pane').forEach(neutraliseTransform)

    try {
        return await html2canvas(el, {
            useCORS: true,
            allowTaint: true,
            scale: 2,
            logging: false,
        })
    } finally {
        for (const entry of saved) {
            entry.el.style.transform = entry.transform
            entry.el.style.top = entry.top
            entry.el.style.left = entry.left
        }
    }
}

function drawOverlay(canvas: HTMLCanvasElement, section: PlannedSection): HTMLCanvasElement {
    const ctx = canvas.getContext('2d')!
    const padding = 16
    const lineHeight = 28
    const lines: string[] = []

    if (section.areaName) lines.push(`Gebiet: ${section.areaName}`)
    if (section.actionDate) lines.push(`Datum: ${new Date(section.actionDate).toLocaleDateString('de-CH')}`)
    if (section.lokalgruppe) lines.push(`Lokalgruppe: ${section.lokalgruppe}`)

    if (lines.length === 0) return canvas

    const boxHeight = padding * 2 + lines.length * lineHeight
    const boxWidth = 400
    const x = canvas.width - boxWidth - padding
    const y = padding

    // Semi-transparent background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x, y, boxWidth, boxHeight, 8)
    ctx.fill()
    ctx.stroke()

    // Text
    ctx.fillStyle = '#111827'
    ctx.font = 'bold 22px system-ui, sans-serif'
    lines.forEach((line, i) => {
        ctx.fillText(line, x + padding, y + padding + (i + 1) * lineHeight - 6)
    })

    return canvas
}

async function downloadPNG(): Promise<void> {
    const section = store.selectedSection.value
    if (!section) return
    downloading.value = true
    try {
        // Zoom to section first
        props.mapRef?.zoomToSection(section.id)
        await new Promise((r) => setTimeout(r, 600))

        const canvas = await captureMap()
        if (!canvas) return
        drawOverlay(canvas, section)

        const link = document.createElement('a')
        link.download = `aktionskarte-${section.areaName || 'gebiet'}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
    } finally {
        downloading.value = false
    }
}

async function downloadPDF(): Promise<void> {
    const section = store.selectedSection.value
    if (!section) return
    downloading.value = true
    try {
        props.mapRef?.zoomToSection(section.id)
        await new Promise((r) => setTimeout(r, 600))

        const canvas = await captureMap()
        if (!canvas) return
        drawOverlay(canvas, section)

        const imgData = canvas.toDataURL('image/png')
        const pdf = new jsPDF({
            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [canvas.width / 2, canvas.height / 2],
        })
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2)
        pdf.save(`aktionskarte-${section.areaName || 'gebiet'}.pdf`)
    } finally {
        downloading.value = false
    }
}

function resetConfirm(): void {
    if (confirm('Alle geplanten Gebiete zurücksetzen?')) {
        store.resetAll()
        view.value = 'list'
    }
}

// When parent selects a section (e.g., via map click)
watch(
    () => props.selectedId,
    (id) => {
        if (id) {
            const section = store.getSection(id)
            if (section) {
                store.selectSection(id)
                view.value = 'detail'
            }
        }
    }
)

defineExpose({ onPolygonDrawn })
</script>

<template>
    <div class="flex flex-col h-full bg-white">
        <!-- Header -->
        <div class="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div v-if="view !== 'list'" class="flex items-center gap-2 mb-1">
                <button class="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    @click="backToList">
                    ← Übersicht
                </button>
            </div>
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-base font-bold text-gray-900 leading-tight">
                        <span class="text-red-600">Planung</span>
                    </h1>
                    <p class="text-xs text-gray-500 mt-0.5">Aktions-Gebiete planen &amp; verwalten</p>
                </div>
                <button class="md:hidden text-gray-400 hover:text-gray-600 text-xl" @click="$emit('close')">
                    ✕
                </button>
            </div>

            <!-- Summary -->
            <div class="mt-2 text-xs text-gray-600">
                {{ store.sections.value.length }} Gebiet{{ store.sections.value.length !== 1 ? 'e' : '' }} geplant
            </div>
        </div>

        <!-- Loading / Error states -->
        <div v-if="loading" class="flex items-center justify-center py-8 gap-2 text-gray-500 text-sm">
            <svg class="spinner w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2">
                <path
                    d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Quartiersdaten werden geladen…
        </div>

        <div v-else-if="error && quartiere.length === 0"
            class="px-4 py-3 mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <p class="font-semibold">Fehler beim Laden der Daten</p>
            <p class="mt-1 text-red-600">{{ error }}</p>
        </div>

        <!-- ===================== LIST VIEW ===================== -->
        <template v-if="view === 'list'">
            <!-- Create buttons -->
            <div class="flex-shrink-0 px-4 pt-3 pb-2 space-y-2 border-b border-gray-100">
                <button
                    class="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
                    @click="startCreate('draw')">
                    ✏️ Gebiet auf Karte zeichnen
                </button>
                <button
                    class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                    @click="startCreate('quartier')">
                    📋 Quartier aus Liste wählen
                </button>
            </div>

            <!-- Sections list -->
            <div class="flex-1 overflow-y-auto scrollbar-thin">
                <div v-if="store.sections.value.length === 0" class="px-4 py-8 text-center text-gray-400 text-sm">
                    Noch keine Gebiete geplant.<br />Zeichne ein Gebiet auf der Karte oder wähle ein Quartier.
                </div>

                <button v-for="s in store.sections.value" :key="s.id"
                    class="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    :class="{ 'bg-blue-50 border-l-4 border-l-blue-500': store.selectedSectionId.value === s.id }"
                    @click="selectSection(s.id)">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-semibold text-gray-800 truncate">
                                {{ s.areaName || 'Ohne Name' }}
                            </div>
                            <div class="text-xs text-gray-500 mt-0.5">
                                <span v-if="s.lokalgruppe">{{ s.lokalgruppe }}</span>
                                <span v-if="s.lokalgruppe && s.actionDate"> · </span>
                                <span v-if="s.actionDate">{{
                                    new Date(s.actionDate).toLocaleDateString('de-CH') }}</span>
                            </div>
                            <div v-if="s.quartierName" class="text-xs text-gray-400 mt-0.5">
                                Quartier: {{ s.quartierName }}
                            </div>
                        </div>
                        <span
                            class="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                            :class="s.coordinates ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'">
                            {{ s.coordinates ? 'Gezeichnet' : 'Quartier' }}
                        </span>
                    </div>
                </button>
            </div>

            <!-- Footer -->
            <div v-if="store.sections.value.length > 0"
                class="flex-shrink-0 px-4 py-2 border-t border-gray-100 flex justify-between items-center">
                <span class="text-xs text-gray-400">{{ store.sections.value.length }} Einträge</span>
                <button class="text-xs text-red-500 hover:text-red-700 font-medium" @click="resetConfirm">
                    Alle löschen
                </button>
            </div>
        </template>

        <!-- ===================== CREATE VIEW ===================== -->
        <template v-if="view === 'create'">
            <div class="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
                <!-- Draw mode -->
                <template v-if="createMode === 'draw'">
                    <div class="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
                        <template v-if="!pendingCoordinates">
                            <strong>Zeichne ein Gebiet auf der Karte.</strong><br />
                            Klicke auf die Karte, um Eckpunkte zu setzen. Klicke auf den ersten Punkt oder doppelklicke, um das Polygon abzuschliessen.
                        </template>
                        <template v-else>
                            ✅ Gebiet wurde gezeichnet!
                        </template>
                    </div>
                    <button v-if="!pendingCoordinates && !drawingEnabled"
                        class="w-full px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                        @click="$emit('start-drawing')">
                        Erneut zeichnen
                    </button>
                </template>

                <!-- Quartier mode -->
                <template v-if="createMode === 'quartier'">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                            Quartier auswählen
                        </label>
                        <input v-model="searchQuery" type="search" placeholder="Quartier suchen…"
                            class="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        <div class="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                            <button v-for="q in filteredQuartiere" :key="q.properties.id"
                                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 transition-colors"
                                :class="{ 'bg-blue-50 font-semibold': formQuartierId === q.properties.id }"
                                @click="formQuartierId = q.properties.id">
                                {{ q.properties.name }}
                            </button>
                        </div>
                        <p v-if="formQuartierId" class="mt-1 text-xs text-green-600 font-medium">
                            ✅ {{ quartiere.find((q) => q.properties.id === formQuartierId)?.properties.name }}
                            ausgewählt
                        </p>
                    </div>
                </template>

                <!-- Shared form fields -->
                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Gebietsname / Strasse *
                    </label>
                    <input v-model="formAreaName" type="text" placeholder="z.B. Aarbergergasse"
                        class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>

                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Datum Aktionstag
                    </label>
                    <input v-model="formActionDate" type="date"
                        class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>

                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Lokalgruppe
                    </label>
                    <input v-model="formLokalgruppe" type="text" placeholder="z.B. Bern Nord"
                        class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>

                <!-- Actions -->
                <div class="flex gap-2 pt-2">
                    <button
                        class="flex-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                        @click="cancelCreate">
                        Abbrechen
                    </button>
                    <button :disabled="!canSave"
                        class="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        @click="saveSection">
                        Speichern
                    </button>
                </div>
            </div>
        </template>

        <!-- ===================== DETAIL VIEW ===================== -->
        <template v-if="view === 'detail' && store.selectedSection.value">
            <div class="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
                <div>
                    <h2 class="text-lg font-bold text-gray-900">
                        {{ store.selectedSection.value.areaName || 'Ohne Name' }}
                    </h2>
                    <p v-if="store.selectedSection.value.quartierName" class="text-xs text-gray-500 mt-0.5">
                        Quartier: {{ store.selectedSection.value.quartierName }}
                    </p>
                </div>

                <!-- Metadata display / edit -->
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Gebietsname / Strasse
                        </label>
                        <input :value="store.selectedSection.value.areaName" type="text"
                            class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            @input="store.updateSection(store.selectedSection.value!.id, { areaName: ($event.target as HTMLInputElement).value })" />
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Datum Aktionstag
                        </label>
                        <input :value="store.selectedSection.value.actionDate" type="date"
                            class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            @input="store.updateSection(store.selectedSection.value!.id, { actionDate: ($event.target as HTMLInputElement).value })" />
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                            Lokalgruppe
                        </label>
                        <input :value="store.selectedSection.value.lokalgruppe" type="text"
                            class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            @input="store.updateSection(store.selectedSection.value!.id, { lokalgruppe: ($event.target as HTMLInputElement).value })" />
                    </div>
                </div>

                <!-- Download section -->
                <div class="pt-2 border-t border-gray-100 space-y-2">
                    <label class="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                        Karte herunterladen
                    </label>
                    <div class="flex gap-2">
                        <button :disabled="downloading"
                            class="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                            @click="downloadPNG">
                            <span v-if="downloading" class="spinner w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                            📷 PNG
                        </button>
                        <button :disabled="downloading"
                            class="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                            @click="downloadPDF">
                            <span v-if="downloading" class="spinner w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                            📄 PDF
                        </button>
                    </div>
                </div>

                <!-- Meta info -->
                <p v-if="store.selectedSection.value.updatedAt" class="text-xs text-gray-400">
                    Zuletzt geändert: {{ new Date(store.selectedSection.value.updatedAt).toLocaleString('de-CH') }}
                </p>

                <!-- Delete -->
                <button class="text-xs text-red-500 hover:text-red-700 font-medium"
                    @click="deleteSection(store.selectedSection.value.id)">
                    Gebiet löschen
                </button>
            </div>
        </template>
    </div>
</template>
