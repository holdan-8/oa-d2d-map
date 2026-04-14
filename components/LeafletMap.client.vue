<script setup lang="ts">
/**
 * LeafletMap.client.vue
 *
 * Client-only Leaflet map component.  The `.client.vue` suffix tells Nuxt to
 * never server-render this component – Leaflet requires `window` / `document`.
 *
 * Displays:
 *  - swisstopo WMTS base tiles (official Swiss geodata, free, no API key)
 *  - OpenStreetMap base tiles (toggle)
 *  - Bern Quartiere / Stadtteile GeoJSON layer with action-status colours
 *  - Popup with quick-status controls on polygon click
 */

import L from 'leaflet'
import 'leaflet-draw'
import type { QuartierFeature } from '~/composables/useBernData'
import { STATUS_META, useActionStore } from '~/composables/useActionStore'
import type { ActionStatus } from '~/composables/useActionStore'
import { usePlanningStore } from '~/composables/usePlanningStore'
import type { PlannedSection } from '~/composables/usePlanningStore'

// Fix Leaflet default icon paths broken by Vite / Webpack bundling
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// @ts-expect-error: Leaflet icon default property
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
})

// ---------------------------------------------------------------------------
// Props / emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  quartiere: QuartierFeature[]
  selectedId: string | null
  mode: 'planning' | 'action'
  drawingEnabled?: boolean
  selectedSectionId?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string, name: string): void
  (e: 'polygon-drawn', coordinates: [number, number][][]): void
  (e: 'section-click', id: string): void
}>()

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = useActionStore()
const planningStore = usePlanningStore()

// ---------------------------------------------------------------------------
// Action mode state
// ---------------------------------------------------------------------------

const markingMode = ref(false)

// ---------------------------------------------------------------------------
// Map setup
// ---------------------------------------------------------------------------

const mapContainer = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let geoJsonLayer: L.GeoJSON | null = null
let markersLayer: L.LayerGroup | null = null
let plannedSectionsLayer: L.LayerGroup | null = null
let drawControl: L.Control.Draw | null = null
let drawnItems: L.FeatureGroup | null = null
let activeDrawHandler: L.Draw.Polygon | null = null

// Tile layers
const SWISSTOPO_URL =
  'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

// Center of Bern
const BERN_CENTER: L.LatLngExpression = [46.9481, 7.4474]
const DEFAULT_ZOOM = 13

// Current active base layer name
const activeLayer = ref<'swisstopo' | 'osm'>('swisstopo')

// ---------------------------------------------------------------------------
// Polygon styling
// ---------------------------------------------------------------------------

function getStyle(feature: GeoJSON.Feature | undefined): L.PathOptions {
  if (!feature?.properties?.id) return {}
  const action = store.actions.value[feature.properties.id]
  const status: ActionStatus = action?.status ?? 'not-started'
  const meta = STATUS_META[status]

  // In action mode, dim unassigned quartiere
  const isDimmed = props.mode === 'action' && status === 'not-started'

  return {
    color: isDimmed ? '#e5e7eb' : meta.color,
    fillColor: isDimmed ? '#f3f4f6' : meta.fillColor,
    fillOpacity: isDimmed ? 0.2 : 0.45,
    weight: isDimmed ? 1 : 2,
    opacity: isDimmed ? 0.5 : 0.9
  }
}

// ---------------------------------------------------------------------------
// Popup content
// ---------------------------------------------------------------------------

function makePopupContent(id: string, name: string): string {
  const action = store.actions.value[id]
  const status: ActionStatus = action?.status ?? 'not-started'
  const assignedTo = action?.assignedTo ?? []
  const meta = STATUS_META[status]

  const buttons = (Object.keys(STATUS_META) as ActionStatus[])
    .map((s) => {
      const sm = STATUS_META[s]
      const active = s === status ? 'ring-2 ring-offset-1 ring-gray-600' : ''
      return `<button
        data-status="${s}"
        data-id="${id}"
        data-name="${encodeURIComponent(name)}"
        class="status-btn px-2 py-0.5 rounded text-xs font-medium ${sm.tailwind} ${active}"
        style="cursor:pointer"
      >${sm.label}</button>`
    })
    .join(' ')

  return `
    <div style="min-width:200px;font-family:system-ui,sans-serif">
      <div style="font-weight:600;font-size:1rem;margin-bottom:6px">${name}</div>
      <div style="margin-bottom:8px">
        <span style="display:inline-block;background:${meta.fillColor};color:${meta.color};padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:600;border:1px solid ${meta.color}">${meta.label}</span>
      </div>
      <div style="margin-bottom:6px;font-size:0.78rem;color:#555">Status ändern:</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${buttons}</div>
      ${assignedTo.length > 0
      ? `<div style="font-size:0.78rem;color:#555">👤 ${assignedTo.join(', ')}</div>`
      : ''
    }
      <div style="margin-top:8px">
        <button data-open-panel="${id}" data-name="${encodeURIComponent(name)}"
          style="font-size:0.78rem;color:#2563eb;cursor:pointer;background:none;border:none;padding:0;text-decoration:underline">
          Details öffnen →
        </button>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// GeoJSON layer management
// ---------------------------------------------------------------------------

function addGeoJsonLayer(features: QuartierFeature[]): void {
  if (!map) return
  if (geoJsonLayer) {
    geoJsonLayer.remove()
    geoJsonLayer = null
  }

  geoJsonLayer = L.geoJSON(
    { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
    {
      style: getStyle,
      onEachFeature(feature, layer) {
        const id = feature.properties?.id
        const name = feature.properties?.name ?? 'Unbekannt'
        if (!id) return

          ; (layer as L.Path).on('mouseover', function () {
            ; (this as L.Path).setStyle({ fillOpacity: 0.7, weight: 3 })
          })
          ; (layer as L.Path).on('mouseout', function () {
            geoJsonLayer?.resetStyle(this as L.Path)
          })

        layer.on('click', (e: L.LeafletMouseEvent) => {
          // In action mode with marking enabled: place a marker
          if (props.mode === 'action' && markingMode.value) {
            const action = store.actions.value[id]
            if (action && action.status !== 'not-started') {
              store.addMarker(id, e.latlng.lat, e.latlng.lng, '')
              if (action.status === 'assigned') {
                store.setStatus(id, 'in-progress')
              }
              refreshMarkers()
              geoJsonLayer?.resetStyle(layer as L.Path)
                ; (layer as L.Path).setStyle(getStyle(feature))
            }
            emit('select', id, name)
            return
          }

          // Normal mode: show popup
          store.getAction(id, name)
          const popup = (layer as L.Path)
            .bindPopup(makePopupContent(id, name), { maxWidth: 300 })
            .openPopup()

          // Delegate button clicks inside the popup
          setTimeout(() => {
            const container = popup.getPopup()?.getElement()
            if (!container) return

            container.querySelectorAll('.status-btn').forEach((btn) => {
              btn.addEventListener('click', () => {
                const status = btn.getAttribute('data-status') as ActionStatus
                const btnId = btn.getAttribute('data-id')!
                const btnName = decodeURIComponent(btn.getAttribute('data-name') ?? '')
                store.getAction(btnId, btnName)
                store.setStatus(btnId, status)
                  // Update popup content
                  ; (layer as L.Path).setPopupContent(makePopupContent(btnId, btnName))
                // Update polygon colour
                geoJsonLayer?.resetStyle(layer as L.Path)
                  ; (layer as L.Path).setStyle(getStyle(feature))
              })
            })

            container.querySelectorAll('[data-open-panel]').forEach((btn) => {
              btn.addEventListener('click', () => {
                const btnId = btn.getAttribute('data-open-panel')!
                const btnName = decodeURIComponent(btn.getAttribute('data-name') ?? '')
                emit('select', btnId, btnName)
                  ; (layer as L.Path).closePopup()
              })
            })
          }, 50)
        })
      }
    }
  ).addTo(map)
}

// ---------------------------------------------------------------------------
// Action markers layer
// ---------------------------------------------------------------------------

function refreshMarkers(): void {
  if (!map) return
  if (!markersLayer) {
    markersLayer = L.layerGroup().addTo(map)
  } else {
    markersLayer.clearLayers()
  }

  if (props.mode !== 'action') return

  for (const action of Object.values(store.actions.value)) {
    if (!action.markers) continue
    for (const m of action.markers) {
      const cm = L.circleMarker([m.lat, m.lng], {
        radius: 6,
        fillColor: '#16a34a',
        color: '#15803d',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.8
      })
      cm.bindPopup(`
        <div style="font-size:0.85rem;font-family:system-ui,sans-serif">
          <strong>${m.label || 'Markierung'}</strong><br>
          <span style="font-size:0.75rem;color:#999">${new Date(m.timestamp).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}</span><br>
          <button data-remove-marker="${m.id}" data-quartier-id="${action.id}"
            style="color:#ef4444;cursor:pointer;font-size:0.75rem;margin-top:4px;background:none;border:none;padding:0;text-decoration:underline">
            Markierung löschen
          </button>
        </div>
      `, { maxWidth: 200 })
      cm.on('popupopen', () => {
        setTimeout(() => {
          const el = cm.getPopup()?.getElement()
          el?.querySelectorAll('[data-remove-marker]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const markerId = btn.getAttribute('data-remove-marker')!
              const quartierId = btn.getAttribute('data-quartier-id')!
              store.removeMarker(quartierId, markerId)
              refreshMarkers()
            })
          })
        }, 50)
      })
      markersLayer.addLayer(cm)
    }
  }
}

// ---------------------------------------------------------------------------
// Refresh layer when store changes (status updates from side panel)
// ---------------------------------------------------------------------------

watch(
  () => store.actions.value,
  () => {
    if (geoJsonLayer && props.quartiere.length > 0) {
      geoJsonLayer.setStyle(getStyle)
    }
    if (props.mode === 'action') {
      refreshMarkers()
    }
  },
  { deep: true }
)

// ---------------------------------------------------------------------------
// Watch props to (re)draw layer when quartiere data arrives
// ---------------------------------------------------------------------------

watch(
  () => props.quartiere,
  (newVal) => {
    if (newVal.length > 0) addGeoJsonLayer(newVal)
  }
)

// Refresh markers and styles when mode changes
watch(
  () => props.mode,
  () => {
    if (geoJsonLayer) geoJsonLayer.setStyle(getStyle)
    refreshMarkers()
    markingMode.value = false
  }
)

// Highlight selected quartier
watch(
  () => props.selectedId,
  (id) => {
    if (!geoJsonLayer || !id) return
    geoJsonLayer.eachLayer((layer) => {
      const f = (layer as L.GeoJSON & { feature: GeoJSON.Feature }).feature
      if (f?.properties?.id === id) {
        const bounds = (layer as L.Polygon).getBounds()
        // Only pan/zoom if the selected quartier is not already fully visible
        if (!map?.getBounds().contains(bounds)) {
          map?.fitBounds(bounds, { padding: [40, 40] })
        }
      }
    })
  }
)

// ---------------------------------------------------------------------------
// Planned sections layer (planning mode)
// ---------------------------------------------------------------------------

function refreshPlannedSections(): void {
  if (!map) return
  if (!plannedSectionsLayer) {
    plannedSectionsLayer = L.layerGroup().addTo(map)
  } else {
    plannedSectionsLayer.clearLayers()
  }

  if (props.mode !== 'planning') return

  for (const section of planningStore.sections.value) {
    if (!section.coordinates) continue

    const latlngs = section.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])
    const isSelected = section.id === props.selectedSectionId

    const polygon = L.polygon(latlngs, {
      color: isSelected ? '#2563eb' : '#dc2626',
      fillColor: isSelected ? '#93c5fd' : '#fca5a5',
      fillOpacity: isSelected ? 0.4 : 0.25,
      weight: isSelected ? 3 : 2,
      dashArray: isSelected ? undefined : '6 4',
    })

    const label = section.areaName || 'Ohne Name'
    polygon.bindTooltip(label, { permanent: true, direction: 'center', className: 'planned-section-label' })

    polygon.on('click', () => {
      emit('section-click', section.id)
    })

    plannedSectionsLayer.addLayer(polygon)
  }
}

watch(
  () => planningStore.sections.value,
  () => refreshPlannedSections(),
  { deep: true }
)

watch(
  () => props.selectedSectionId,
  () => refreshPlannedSections()
)

// ---------------------------------------------------------------------------
// Drawing mode (planning)
// ---------------------------------------------------------------------------

function startDrawing(): void {
  if (!map) return
  if (!drawnItems) {
    drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
  }
  // @ts-expect-error: leaflet-draw extends L.Draw
  activeDrawHandler = new L.Draw.Polygon(map, {
    shapeOptions: {
      color: '#dc2626',
      fillColor: '#fca5a5',
      fillOpacity: 0.3,
      weight: 2,
    },
  })
  activeDrawHandler.enable()
}

function stopDrawing(): void {
  if (activeDrawHandler) {
    activeDrawHandler.disable()
    activeDrawHandler = null
  }
}

watch(
  () => props.drawingEnabled,
  (enabled) => {
    if (enabled) {
      startDrawing()
    } else {
      stopDrawing()
    }
  }
)

// Zoom to a specific planned section
function zoomToSection(sectionId: string): void {
  const section = planningStore.getSection(sectionId)
  if (!section?.coordinates || !map) return
  const latlngs = section.coordinates[0].map(([lng, lat]) => [lat, lng] as L.LatLngTuple)
  const bounds = L.latLngBounds(latlngs)
  map.fitBounds(bounds, { padding: [60, 60] })
}

// Get the map container element for screenshot capture
function getMapElement(): HTMLElement | null {
  return mapContainer.value
}

// ---------------------------------------------------------------------------
// Base layer toggle
// ---------------------------------------------------------------------------

let swisstopoLayer: L.TileLayer | null = null
let osmLayer: L.TileLayer | null = null

function switchLayer(to: 'swisstopo' | 'osm'): void {
  if (!map) return
  if (to === 'swisstopo' && osmLayer) {
    map.removeLayer(osmLayer)
    swisstopoLayer?.addTo(map)
  } else if (to === 'osm' && swisstopoLayer) {
    map.removeLayer(swisstopoLayer)
    osmLayer?.addTo(map)
  }
  activeLayer.value = to
  // Re-add the GeoJSON layer on top
  if (geoJsonLayer) {
    geoJsonLayer.remove()
    geoJsonLayer.addTo(map)
  }
  // Re-add markers on top
  if (markersLayer) {
    markersLayer.remove()
    markersLayer.addTo(map)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  if (!mapContainer.value) return

  map = L.map(mapContainer.value, {
    center: BERN_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: true
  })

  // swisstopo WMTS – official Swiss national map, free to use
  swisstopoLayer = L.tileLayer(SWISSTOPO_URL, {
    attribution:
      '© <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>',
    maxZoom: 19,
    tileSize: 256
  }).addTo(map)

  // OpenStreetMap – alternative base layer
  osmLayer = L.tileLayer(OSM_URL, {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19
  })

  if (props.quartiere.length > 0) {
    addGeoJsonLayer(props.quartiere)
  }

  // Show markers in action mode
  refreshMarkers()

  // Show planned sections in planning mode
  refreshPlannedSections()

  // Listen for draw events
  map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
    const event = e as L.DrawEvents.Created
    const layer = event.layer as L.Polygon
    const latlngs = (layer.getLatLngs()[0] as L.LatLng[])
    const coordinates: [number, number][] = latlngs.map((ll) => [ll.lng, ll.lat])
    // Close the polygon
    if (coordinates.length > 0) {
      coordinates.push(coordinates[0])
    }
    emit('polygon-drawn', [coordinates])
  })

  // Fix blank map when container size isn't resolved at mount time
  nextTick(() => {
    map?.invalidateSize()
  })
})

onUnmounted(() => {
  stopDrawing()
  map?.remove()
  map = null
  geoJsonLayer = null
  markersLayer = null
  plannedSectionsLayer = null
  drawnItems = null
})

// Expose toggle for parent use via template ref
defineExpose({ switchLayer, activeLayer, getMapElement, zoomToSection, startDrawing, stopDrawing })
</script>

<template>
  <div class="relative w-full h-full">
    <!-- Map container -->
    <div ref="mapContainer" class="w-full h-full z-0" />

    <!-- Base layer toggle (top-right, above Leaflet zoom controls) -->
    <div
      class="absolute bottom-8 left-2 z-[1000] flex flex-col gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-1.5 border border-gray-200">
      <button :class="[
        'px-2 py-1 rounded text-xs font-medium transition-colors',
        activeLayer === 'swisstopo'
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      ]" @click="switchLayer('swisstopo')">
        swisstopo
      </button>
      <button :class="[
        'px-2 py-1 rounded text-xs font-medium transition-colors',
        activeLayer === 'osm'
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      ]" @click="switchLayer('osm')">
        OSM
      </button>
    </div>

    <!-- Marking mode toggle (action mode only) -->
    <button v-if="mode === 'action'" :class="[
      'absolute top-4 right-4 z-[1000] flex items-center gap-2 px-4 py-2 rounded-lg shadow-md text-sm font-medium transition-colors border',
      markingMode
        ? 'bg-green-600 text-white border-green-700'
        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
    ]" @click="markingMode = !markingMode">
      <span v-if="markingMode">✓ Markierungsmodus</span>
      <span v-else>📍 Markieren</span>
    </button>
  </div>
</template>
