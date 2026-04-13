/**
 * useBernData – fetches open geodata for the Bern region.
 *
 * Primary source: OSM Overpass API (free, no API key required).
 * Fallback: embedded minimal GeoJSON for the 6 Bern Stadtteile so the app
 * always renders something even when the network is unavailable.
 *
 * Swisstopo / geo.admin.ch tile layer is used as the base map.
 */

import osmtogeojson from "osmtogeojson";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuartierFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: {
    id: string;
    name: string;
    adminLevel: string;
    osmId: string;
    population?: number;
    wikidata?: string;
  };
}

export interface BernDataResult {
  loading: Ref<boolean>;
  error: Ref<string | null>;
  quartiere: Ref<QuartierFeature[]>;
  fetchBernData: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Overpass API query
// ---------------------------------------------------------------------------

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Build an Overpass QL query that fetches the administrative sub-divisions
 * (Stadtteile admin_level=9 and Quartiere admin_level=10) inside the city of
 * Bern (admin_level=8).  Falls back to place=suburb / place=neighbourhood
 * nodes/ways/relations so we always get *something* useful.
 */
function buildOverpassQuery(): string {
  return `
[out:json][timeout:60];
area["name"="Bern"]["admin_level"="8"]["boundary"="administrative"]->.bern;
(
  relation["boundary"="administrative"]["admin_level"~"^(9|10)$"](area.bern);
  way["place"~"^(neighbourhood|suburb|quarter)$"](area.bern);
  relation["place"~"^(neighbourhood|suburb|quarter)$"](area.bern);
);
(._;>;);
out body;
`.trim();
}

// ---------------------------------------------------------------------------
// Fallback GeoJSON – simplified Bern Stadtteile polygons
// (approximate bounding boxes, replaced by real data when Overpass responds)
// ---------------------------------------------------------------------------

const FALLBACK_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "I",
        name: "Innere Stadt",
        adminLevel: "9",
        osmId: "fallback-1",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.43, 46.943],
            [7.46, 46.943],
            [7.46, 46.957],
            [7.43, 46.957],
            [7.43, 46.943],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "II",
        name: "Länggasse-Felsenau",
        adminLevel: "9",
        osmId: "fallback-2",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.39, 46.955],
            [7.435, 46.955],
            [7.435, 46.975],
            [7.39, 46.975],
            [7.39, 46.955],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "III",
        name: "Mattenhof-Weissenbühl",
        adminLevel: "9",
        osmId: "fallback-3",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.415, 46.93],
            [7.46, 46.93],
            [7.46, 46.95],
            [7.415, 46.95],
            [7.415, 46.93],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "IV",
        name: "Kirchenfeld-Schosshalde",
        adminLevel: "9",
        osmId: "fallback-4",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.455, 46.935],
            [7.5, 46.935],
            [7.5, 46.96],
            [7.455, 46.96],
            [7.455, 46.935],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "V",
        name: "Breitenrain-Lorraine",
        adminLevel: "9",
        osmId: "fallback-5",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.43, 46.957],
            [7.465, 46.957],
            [7.465, 46.975],
            [7.43, 46.975],
            [7.43, 46.957],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "VI",
        name: "Bümpliz-Oberbottigen",
        adminLevel: "9",
        osmId: "fallback-6",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.36, 46.935],
            [7.415, 46.935],
            [7.415, 46.965],
            [7.36, 46.965],
            [7.36, 46.935],
          ],
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

// Single shared state (singleton pattern – survives route navigations)
const _loading = ref(false);
const _error = ref<string | null>(null);
const _quartiere = ref<QuartierFeature[]>([]);
let _fetched = false;

export function useBernData(): BernDataResult {
  async function fetchBernData(): Promise<void> {
    if (_fetched && _quartiere.value.length > 0) return;
    _loading.value = true;
    _error.value = null;

    try {
      const query = buildOverpassQuery();
      const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error(
          `Overpass API responded with status ${response.status}`,
        );
      }

      const osmData = await response.json();
      const geoJson = osmtogeojson(osmData) as GeoJSON.FeatureCollection;

      let seqCounter = 0;
      const features = geoJson.features
        .filter((f) => f.geometry !== null && f.geometry.type !== "Point")
        .map((f) => {
          const props = f.properties || {};
          // Prefer the stable OSM id; fall back to a name-based key so the ID
          // remains consistent across page reloads and localStorage lookups work.
          const osmId = String(props.id || props["@id"] || "");
          const name = String(props.name || props.official_name || "");
          const stableId =
            osmId || (name ? `name-${name}` : `seq-${++seqCounter}`);
          return {
            type: "Feature" as const,
            geometry: f.geometry,
            properties: {
              id: stableId,
              name: name || "Unbekannt",
              adminLevel: String(props.admin_level || props.place || ""),
              osmId,
              population: props.population
                ? Number(props.population)
                : undefined,
              wikidata: props.wikidata,
            },
          } as QuartierFeature;
        });

      if (features.length > 0) {
        _quartiere.value = features;
      } else {
        // No real data returned – use fallback
        console.warn(
          "Overpass returned no polygon features, using fallback data.",
        );
        _quartiere.value = FALLBACK_GEOJSON.features as QuartierFeature[];
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch Bern data:", message);
      _error.value = message;
      // Still show the map with fallback data
      _quartiere.value = FALLBACK_GEOJSON.features as QuartierFeature[];
    } finally {
      _loading.value = false;
      _fetched = true;
    }
  }

  return {
    loading: _loading,
    error: _error,
    quartiere: _quartiere,
    fetchBernData,
  };
}
