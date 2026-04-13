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
import type { QuartierFeature } from '~/composables/useBernData'
import { STATUS_META, useActionStore } from '~/composables/useActionStore'
import type { ActionStatus } from '~/composables/useActionStore'

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
}>()

const emit = defineEmits<{
  (e: 'select', id: string, name: string): void
}>()

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = useActionStore()

// ---------------------------------------------------------------------------
// Map setup
// ---------------------------------------------------------------------------

const mapContainer = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let geoJsonLayer: L.GeoJSON | null = null

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
  return {
    color: meta.color,
    fillColor: meta.fillColor,
    fillOpacity: 0.45,
    weight: 2,
    opacity: 0.9
  }
}

// ---------------------------------------------------------------------------
// Popup content
// ---------------------------------------------------------------------------

function makePopupContent(id: string, name: string): string {
  const action = store.actions.value[id]
  const status: ActionStatus = action?.status ?? 'not-started'
  const assignedTo = action?.assignedTo ?? ''
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
      ${assignedTo
      ? `<div style="font-size:0.78rem;color:#555">👤 ${assignedTo}</div>`
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

        layer.on('click', () => {
          // Ensure action exists
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
// Refresh layer when store changes (status updates from side panel)
// ---------------------------------------------------------------------------

watch(
  () => store.actions.value,
  () => {
    if (geoJsonLayer && props.quartiere.length > 0) {
      geoJsonLayer.setStyle(getStyle)
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

  // If quartiere already loaded (unlikely on first render but possible)
  if (props.quartiere.length > 0) {
    addGeoJsonLayer(props.quartiere)
  }

  // Fix blank map when container size isn't resolved at mount time
  nextTick(() => {
    map?.invalidateSize()
  })
})

onUnmounted(() => {
  map?.remove()
  map = null
  geoJsonLayer = null
})

// Expose toggle for parent use via template ref
defineExpose({ switchLayer, activeLayer })
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
  </div>
</template>
