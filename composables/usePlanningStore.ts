/**
 * usePlanningStore – manages planned action-day sections.
 *
 * Stores drawn polygons (or quartier references) together with metadata
 * (date, area/street name, Lokalgruppe).  Persisted in localStorage.
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannedSection {
  id: string;
  /** GeoJSON polygon coordinates – null when linked to a quartier */
  coordinates: [number, number][][] | null;
  /** If set, refers to an existing quartier id instead of a custom polygon */
  quartierId: string | null;
  quartierName: string | null;
  /** User-given street / area name */
  areaName: string;
  /** Name of the Lokalgruppe */
  lokalgruppe: string;
  /** Date of the planned action day (ISO date string, e.g. "2026-05-15") */
  actionDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningStore {
  sections: Ref<PlannedSection[]>;
  selectedSectionId: Ref<string | null>;
  addSection: (
    section: Omit<PlannedSection, "id" | "createdAt" | "updatedAt">,
  ) => PlannedSection;
  updateSection: (
    id: string,
    patch: Partial<Omit<PlannedSection, "id" | "createdAt">>,
  ) => void;
  removeSection: (id: string) => void;
  getSection: (id: string) => PlannedSection | undefined;
  selectSection: (id: string | null) => void;
  selectedSection: ComputedRef<PlannedSection | null>;
  resetAll: () => void;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "d2d-bern-planning";

function loadFromStorage(): PlannedSection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(data: PlannedSection[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Composable (singleton)
// ---------------------------------------------------------------------------

const _sections = ref<PlannedSection[]>([]);
const _selectedId = ref<string | null>(null);
let _initialised = false;

export function usePlanningStore(): PlanningStore {
  if (!_initialised && typeof window !== "undefined") {
    _sections.value = loadFromStorage();
    _initialised = true;
  }

  function addSection(
    data: Omit<PlannedSection, "id" | "createdAt" | "updatedAt">,
  ): PlannedSection {
    const section: PlannedSection = {
      ...data,
      id: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _sections.value = [..._sections.value, section];
    saveToStorage(_sections.value);
    return section;
  }

  function updateSection(
    id: string,
    patch: Partial<Omit<PlannedSection, "id" | "createdAt">>,
  ): void {
    _sections.value = _sections.value.map((s) =>
      s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
    );
    saveToStorage(_sections.value);
  }

  function removeSection(id: string): void {
    _sections.value = _sections.value.filter((s) => s.id !== id);
    if (_selectedId.value === id) _selectedId.value = null;
    saveToStorage(_sections.value);
  }

  function getSection(id: string): PlannedSection | undefined {
    return _sections.value.find((s) => s.id === id);
  }

  function selectSection(id: string | null): void {
    _selectedId.value = id;
  }

  const selectedSection = computed(() => {
    if (!_selectedId.value) return null;
    return _sections.value.find((s) => s.id === _selectedId.value) ?? null;
  });

  function resetAll(): void {
    _sections.value = [];
    _selectedId.value = null;
    saveToStorage([]);
  }

  return {
    sections: _sections,
    selectedSectionId: _selectedId,
    addSection,
    updateSection,
    removeSection,
    getSection,
    selectSection,
    selectedSection,
    resetAll,
  };
}
