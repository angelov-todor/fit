# FIT File Viewer

**Live app: https://fit-file-viewer.web.app**

A browser-based viewer for Garmin FIT activity files. Drop a `.fit`, `.gpx` or `.zip` file and instantly explore your workout data — no uploads, everything runs locally.

## Features

- **Interactive Charts** — heart rate, speed, power, cadence, elevation, temperature, and distance displayed simultaneously with an option to overlay multiple metrics on a single chart
- **GPS Map** — view your route on an interactive Leaflet map
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

## Tech Stack

- [React 19](https://react.dev/) + TypeScript
- [Vite](https://vite.dev/) — dev server and bundler
- [Tailwind CSS v4](https://tailwindcss.com/) — styling
- [Recharts](https://recharts.org/) — charts
- [Leaflet](https://leafletjs.com/) + [React Leaflet](https://react-leaflet.js.org/) — maps
- [fit-file-parser](https://github.com/AmiranMont662/fit-file-parser) — FIT file decoding
- `DOMParser` — GPX decoding (no extra dependency)
- [JSZip](https://stuk.github.io/jszip/) — ZIP extraction

## License

MIT
