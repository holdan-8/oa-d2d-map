# oa-d2d-map

**Tür-zu-Tür Aktionskarte Bern** – A door-to-door action map for the Bern region.

An interactive map web application to help groups organise door-to-door actions in the region of Bern, Switzerland.  Everyone with the link can open the map on their phone and see at a glance which streets and Quartiere are already covered, assigned, or still to do.

---

## Features

- 🗺 **Interactive map** centred on Bern with two base tile options:
  - **swisstopo** – official Swiss national map (free, no API key required)
  - **OpenStreetMap** – community map as an alternative
- 🏘 **Bern Quartiere & Stadtteile** loaded live from the [OpenStreetMap Overpass API](https://overpass-api.de) and drawn as coloured polygons
- 🚪 **Action-status tracking** for each Quartier:
  - ⬜ Not started
  - 🟡 Assigned (with volunteer name)
  - 🟠 In Progress
  - ✅ Done
- 💾 State is **persisted in `localStorage`** – data survives page refreshes without requiring a backend
- 📱 **Mobile-first responsive design** – slide-up bottom sheet on phones, side panel on desktop
- 📋 **Progress overview** with a progress bar and status breakdown
- 🔎 **Search & filter** the Quartier list by name or status
- 📝 **Notes & assignee field** per Quartier

---

## Tech Stack

| Tool | Purpose |
|---|---|
| [Nuxt 3](https://nuxt.com) | Vue.js framework with static generation |
| [Vue 3](https://vuejs.org) | Composition API |
| [Leaflet.js](https://leafletjs.com) | Interactive map |
| [Tailwind CSS](https://tailwindcss.com) | Styling |
| [osmtogeojson](https://github.com/tyrasd/osmtogeojson) | Converts OSM data to GeoJSON |
| [OpenStreetMap Overpass API](https://overpass-api.de) | Free Swiss geodata |
| [swisstopo WMTS](https://www.swisstopo.admin.ch) | Official Swiss map tiles |

---

## Open Data Sources

This app uses exclusively free and open data:

- **swisstopo** – Official Swiss national map tiles (free for public use via WMTS)  
  Attribution: © swisstopo
- **OpenStreetMap** – Map tiles and administrative boundary data  
  Attribution: © OpenStreetMap contributors (ODbL)
- **Overpass API** – Queries OSM data for Bern's Stadtteile (admin level 9) and Quartiere (admin level 10/place boundaries)

---

## Development

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Generate static site for deployment
npm run generate

# Preview the generated site locally
npx serve .output/public
```

---

## GitHub Pages Deployment

The app is pre-configured for GitHub Pages via the included workflow (`.github/workflows/pages.yml`).

1. Go to **Settings → Pages** in your GitHub repository and select **GitHub Actions** as the source.
2. Push to the `main` branch – the workflow will automatically build and deploy.

The base URL is set to `/oa-d2d-map/` in the workflow.  Change the `BASE_URL` env var if your repo has a different name or you use a custom domain.

---

## Future Improvements

- 🔗 Optional backend sync so multiple volunteers share the same state in real time
- 📊 Export action progress as CSV
- 🏠 Building/address data from [opendata.swiss](https://opendata.swiss) (swisstopo amtliches Strassenverzeichnis)
- 🗂 Import custom area assignments from a spreadsheet
