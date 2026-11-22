# @micropasts/grid-ref

Zero-dependency JavaScript Web Components for British National Grid (`OSGB36` / `EPSG:27700`) references, WGS84 conversion, grid square precision/sensitivity indicators, and SVG grid-square previews.

Includes two custom elements built from the same core library:
- **`<grid-ref>`** — Encapsulated Shadow DOM Web Component with CSS custom properties, `::part()` selectors, and custom HTML template hooks.
- **`<grid-ref-tw>`** — Light-DOM Web Component styled with Tailwind CSS utility classes and `dark:` variants.

---

## Features

- **Pure ES2022 JavaScript:** Zero runtime dependencies, no TypeScript build step, and works in vanilla HTML, static sites, or modern bundlers.
- **OSGB36 ↔ WGS84 Conversion:** Parses 2-letter 100km grid tiles plus 2- to 10-digit references (`TL10`, `TL 135 072`, `TL 1354 0728`) and computes easting/northing, square precision (`100km` down to `1m`), WGS84 centroids, bounding boxes, and GeoJSON polygons.
- **Findspot Sensitivity & Precision Context:** Highlights square size and rounding level so coarse public findspots (`10km` or `1km`) are visually distinct from site or trench coordinates.
- **Inline SVG Grid Preview:** Renders a compact preview showing where the square sits within its parent 10km grid tile.
- **Cross-Component Event Sync:** Emits and listens for `heritage:select` `CustomEvent`s so maps, timelines, and panels stay coordinated.
- **Clipboard Copy with Fallback:** Copies formatted grid and coordinate strings with a fallback when restricted clipboard contexts block `navigator.clipboard.writeText`.

---

## Installation & Build

```bash
npm install @micropasts/grid-ref

```

Or build from source with zero external dependencies:

```bash
npm run build
npm run dev

```

`npm run build` generates:

* `dist/grid-ref.esm.js` — ES Module bundle
* `dist/grid-ref.iife.js` — Global `<script>` bundle (`window.GridRefLib`)
* `docs/index.html` and `docs/grid-ref.esm.js` — Self-contained GitHub Pages demo

---

## Usage

### 1. Tailwind CSS Light-DOM (`<grid-ref-tw>`)

```html
<script type="module" src="./dist/grid-ref.esm.js"></script>

<p>
  Findspot recorded at
  <grid-ref-tw ref="TL 135 072" prevent-navigation>
    TL 135 072
  </grid-ref-tw>
  or rounded publicly to
  <grid-ref-tw ref="TL10" mode="inline"></grid-ref-tw>.
</p>

```

### 2. Shadow DOM (`<grid-ref>`)

Works anywhere without Tailwind CSS:

```html
<grid-ref ref="SP910090">SP 910 090</grid-ref>

```

### 3. Synchronized Inspector Panel Mode

```html
<grid-ref-tw mode="panel" listen="heritage:select" ref="TL 135 072"></grid-ref-tw>

```

### 4. Programmatic Helpers

```javascript
import {
  parseGridRef,
  osgbToWgs84,
  buildGridSvg,
  emitGridSelect,
} from '@micropasts/grid-ref';

const parsed = parseGridRef('TL 135 072');
console.log(parsed.center, parsed.precisionLabel, parsed.geojson);

```

---

## Customizing Styles

### Tailwind Utility Overrides (`<grid-ref-tw>`)

Pass `trigger-class` or `card-class` on individual elements:

```html
<grid-ref-tw
  ref="TL 135 072"
  trigger-class="text-amber-700 dark:text-amber-400"
  card-class="border-amber-500 ring-2 ring-amber-500/20">
  TL 135 072
</grid-ref-tw>

```

Or update `GridRefTailwind.classes` globally at startup.

### Shadow DOM CSS Variables & `::part()` (`<grid-ref>`)

```css
grid-ref.custom-grid {
  --gr-accent: #d97706;
  --gr-border: #b45309;
  --gr-radius: 0.375rem;
  --gr-width: 360px;
}

grid-ref.custom-grid::part(title) {
  color: #f59e0b;
}

```

### Custom HTML Template

```javascript
import { GridRef } from '@micropasts/grid-ref';

GridRef.setTemplate((parsed, esc) => `
  <div>
    <strong>${esc(parsed.formatted)}</strong> (${esc(parsed.precisionLabel)})
    <div>${parsed.center.lat}, ${parsed.center.lon}</div>
  </div>
`);

```

---

## Deploying to GitHub Pages

1. Push to `main` (the included `.github/workflows/pages.yml` workflow runs `npm run build` and publishes `./docs`).
2. In GitHub repository **Settings → Pages**, set **Source** to **GitHub Actions** (or **Deploy from a branch** → `main` / `/docs` after running `npm run build`).

---

## License

MIT

