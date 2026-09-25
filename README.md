# FIT File Viewer

**Live app: https://fit-file-viewer.web.app**

A browser-based viewer for Garmin FIT activity files. Drop a `.fit`, `.gpx` or `.zip` file and instantly explore your workout data — no uploads, everything runs locally.

## Features

- **Interactive Charts** — heart rate, speed, power, cadence, elevation, temperature, and distance displayed simultaneously with an option to overlay multiple metrics on a single chart
- **GPS Map** — view your route on an interactive Leaflet map
- **3D Flyover** — a camera chases your route over satellite imagery on 3D terrain, with play/pause, speed and a scrubber (needs a MapTiler key, see below)
- **Data Tables** — browse raw FIT messages (records, laps, sessions)
- **Lap Analysis** — filter by lap, view lap boundary lines, and lap summary pills
- **GPX Export** — convert and download your activity as a GPX file
- **GPX Import** — open a `.gpx` track or route; elevation, timestamps and Garmin `TrackPointExtension` data (HR, cadence, temperature, power) are read when present, and distance and speed are derived from the geometry. Tabs the file has no data for are grayed out, and the trim editor stays FIT-only.
- **ZIP Support** — drop a ZIP containing a FIT or GPX file and it will be extracted automatically

## Getting Started

### Prerequisites

- Node.js 18+

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

### 3D Flyover (MapTiler key)

The **3D** tab flies a camera along the route over [MapTiler](https://www.maptiler.com/) satellite imagery on 3D terrain. Without a key the tab stays disabled, and everything else works.

1. Create a free MapTiler account and an API key.
2. In the key's settings, restrict the allowed origins to `https://fit-file-viewer.web.app`, `https://fit-file-viewer.firebaseapp.com`, `http://localhost:5173` and `http://localhost:4173`. The key ships in the browser bundle, so the origin list is what stops others spending your quota.
3. For local development, put it in `.env.local`, which is gitignored:

   ```bash
   VITE_MAPTILER_KEY=your-key
   ```

4. For deploys, add it as the `MAPTILER_KEY` secret in the GitHub repository's Actions settings.

## Tech Stack

- [React 19](https://react.dev/) + TypeScript
- [Vite](https://vite.dev/) — dev server and bundler
- [Tailwind CSS v4](https://tailwindcss.com/) — styling
- [Recharts](https://recharts.org/) — charts
- [Leaflet](https://leafletjs.com/) + [React Leaflet](https://react-leaflet.js.org/) — maps
- [MapLibre GL JS](https://maplibre.org/) + [MapTiler](https://www.maptiler.com/) — 3D flyover
- [fit-file-parser](https://github.com/AmiranMont662/fit-file-parser) — FIT file decoding
- `DOMParser` — GPX decoding (no extra dependency)
- [JSZip](https://stuk.github.io/jszip/) — ZIP extraction

## License

MIT
