/**
 * @micropasts/grid-ref v0.1.0
 * Zero-dependency OSGB36 / WGS84 grid reference Web Components
 * License: MIT
 */
(function () {
'use strict';
// Ordnance Survey National Grid 100km two-letter square lookup (row 0 = south, col 0 = west)
const OS_GRID_LETTERS = [
  ['SV', 'SW', 'SX', 'SY', 'SZ', 'TV', 'TW'],
  ['SQ', 'SR', 'SS', 'ST', 'SU', 'TQ', 'TR'],
  ['SL', 'SM', 'SN', 'SO', 'SP', 'TL', 'TM'],
  ['SF', 'SG', 'SH', 'SJ', 'SK', 'TF', 'TG'],
  ['SA', 'SB', 'SC', 'SD', 'SE', 'TA', 'TB'],
  ['NV', 'NW', 'NX', 'NY', 'NZ', 'OV', 'OW'],
  ['NQ', 'NR', 'NS', 'NT', 'NU', 'OQ', 'OR'],
  ['NL', 'NM', 'NN', 'NO', 'NP', 'PL', 'PM'],
  ['NF', 'NG', 'NH', 'NJ', 'NK', 'PF', 'PG'],
  ['NA', 'NB', 'NC', 'ND', 'NE', 'PA', 'PB'],
  ['HV', 'HW', 'HX', 'HY', 'HZ', 'JV', 'JW'],
  ['HQ', 'HR', 'HS', 'HT', 'HU', 'JQ', 'JR'],
  ['HL', 'HM', 'HN', 'HO', 'HP', 'JL', 'JM'],
];

const LETTER_TO_OFFSET = new Map();
OS_GRID_LETTERS.forEach((row, rowIdx) => {
  row.forEach((letters, colIdx) => {
    LETTER_TO_OFFSET.set(letters, {
      easting: colIdx * 100000,
      northing: rowIdx * 100000,
    });
  });
});

// Airy 1830 ellipsoid parameters
const AIRY_A = 6377563.396;
const AIRY_B = 6356256.909;
const F0 = 0.9996012717;
const LAT0_RAD = (49 * Math.PI) / 180;
const LON0_RAD = (-2 * Math.PI) / 180;
const N0 = -100000;
const E0 = 400000;

// WGS84 ellipsoid parameters
const WGS84_A = 6378137.0;
const WGS84_B = 6356752.314245;

/**
 * Parse an OSGB36 grid reference string like "TL 135 072" or "TL135072".
 * Returns easting, northing (SW corner of square), precisionMeters, formatted label, and bbox.
 */
function parseGridRef(input) {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, '');
  const match = /^([A-Z]{2})(\d{0,10})$/.exec(cleaned);
  if (!match) return null;

  const [, letters, digits] = match;
  if (digits.length % 2 !== 0) return null;

  const base = LETTER_TO_OFFSET.get(letters);
  if (!base) return null;

  const half = digits.length / 2;
  const stepMeters = Math.pow(10, 5 - half); // 100000 -> 10000 -> 1000 -> 100 -> 10 -> 1

  const ePart = half > 0 ? digits.slice(0, half).padEnd(5, '0') : '00000';
  const nPart = half > 0 ? digits.slice(half).padEnd(5, '0') : '00000';

  const easting = base.easting + Number(ePart);
  const northing = base.northing + Number(nPart);

  const swWgs84 = osgbToWgs84(easting, northing);
  const neWgs84 = osgbToWgs84(easting + stepMeters, northing + stepMeters);
  const centerWgs84 = osgbToWgs84(easting + stepMeters / 2, northing + stepMeters / 2);

  const formatted =
    half > 0
      ? `${letters} ${digits.slice(0, half)} ${digits.slice(half)}`
      : letters;

  const precisionLabel = formatPrecisionLabel(stepMeters);
  const sensitivityHint =
    stepMeters >= 10000
      ? 'Coarse 10km+ square (standard sensitive findspot rounding)'
      : stepMeters >= 1000
        ? '1km square (moderate precision / typical public display)'
        : stepMeters >= 100
          ? '100m square (local site precision)'
          : 'Sub-100m high precision';

  return {
    system: 'OSGB36',
    raw: input.trim(),
    normalized: cleaned,
    formatted,
    letters,
    digits,
    easting,
    northing,
    stepMeters,
    precisionLabel,
    sensitivityHint,
    center: centerWgs84,
    bbox: {
      west: swWgs84.lon,
      south: swWgs84.lat,
      east: neWgs84.lon,
      north: neWgs84.lat,
    },
    geojson: {
      type: 'Feature',
      properties: {
        gridRef: formatted,
        precisionMeters: stepMeters,
        crs: 'EPSG:27700',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [swWgs84.lon, swWgs84.lat],
            [neWgs84.lon, swWgs84.lat],
            [neWgs84.lon, neWgs84.lat],
            [swWgs84.lon, neWgs84.lat],
            [swWgs84.lon, swWgs84.lat],
          ],
        ],
      },
    },
  };
}

function formatPrecisionLabel(meters) {
  if (meters >= 1000) return `${meters / 1000} km square`;
  return `${meters} m square`;
}

/**
 * Convert OSGB36 easting/northing (meters) to WGS84 { lat, lon }.
 */
function osgbToWgs84(E, N) {
  const e2 = 1 - (AIRY_B * AIRY_B) / (AIRY_A * AIRY_A);
  const n = (AIRY_A - AIRY_B) / (AIRY_A + AIRY_B);

  let lat = LAT0_RAD;
  let M = 0;

  do {
    lat = (N - N0 - M) / (AIRY_A * F0) + lat;
    const Ma =
      (1 + n + (5 / 4) * n * n + (5 / 4) * n * n * n) * (lat - LAT0_RAD);
    const Mb =
      (3 * n + 3 * n * n + (21 / 8) * n * n * n) *
      Math.sin(lat - LAT0_RAD) *
      Math.cos(lat + LAT0_RAD);
    const Mc =
      ((15 / 8) * n * n + (15 / 8) * n * n * n) *
      Math.sin(2 * (lat - LAT0_RAD)) *
      Math.cos(2 * (lat + LAT0_RAD));
    const Md =
      (35 / 24) *
      n *
      n *
      n *
      Math.sin(3 * (lat - LAT0_RAD)) *
      Math.cos(3 * (lat + LAT0_RAD));
    M = AIRY_B * F0 * (Ma - Mb + Mc - Md);
  } while (Math.abs(N - N0 - M) >= 0.00001);

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const nu = (AIRY_A * F0) / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho =
    (AIRY_A * F0 * (1 - e2)) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;

  const dE = E - E0;
  const dE2 = dE * dE;
  const dE3 = dE2 * dE;
  const dE4 = dE3 * dE;
  const dE5 = dE4 * dE;
  const dE6 = dE5 * dE;

  const VII = tanLat / (2 * rho * nu);
  const VIII =
    (tanLat / (24 * rho * Math.pow(nu, 3))) *
    (5 + 3 * tanLat * tanLat + eta2 - 9 * tanLat * tanLat * eta2);
  const IX =
    (tanLat / (720 * rho * Math.pow(nu, 5))) *
    (61 + 90 * tanLat * tanLat + 45 * Math.pow(tanLat, 4));

  const X = Math.sec ? Math.sec(lat) : 1 / cosLat;
  const XI = (1 / (6 * nu * nu * nu * cosLat)) * (nu / rho + 2 * tanLat * tanLat);
  const XII =
    (1 / (120 * Math.pow(nu, 5) * cosLat)) *
    (5 + 28 * tanLat * tanLat + 24 * Math.pow(tanLat, 4));
  const XIIA =
    (1 / (5040 * Math.pow(nu, 7) * cosLat)) *
    (61 + 662 * tanLat * tanLat + 1320 * Math.pow(tanLat, 4) + 720 * Math.pow(tanLat, 6));

  const airyLat = lat - VII * dE2 + VIII * dE4 - IX * dE6;
  const airyLon = LON0_RAD + X * dE - XI * dE3 + XII * dE5 - XIIA * dE7(dE5, dE2);

  return helmertAiryToWgs84(airyLat, airyLon, 0);
}

function dE7(dE5, dE2) {
  return dE5 * dE2;
}

function helmertAiryToWgs84(lat, lon, h) {
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const e2 = 1 - (AIRY_B * AIRY_B) / (AIRY_A * AIRY_A);
  const v = AIRY_A / Math.sqrt(1 - e2 * sinLat * sinLat);

  const x1 = (v + h) * cosLat * cosLon;
  const y1 = (v + h) * cosLat * sinLon;
  const z1 = ((1 - e2) * v + h) * sinLat;

  // OSTN02 / OSGB36 to WGS84 7-parameter Helmert transformation
  const tx = 446.448;
  const ty = -125.157;
  const tz = 542.06;
  const s = -20.4894 * 1e-6;
  const rx = (0.1502 * Math.PI) / (180 * 3600);
  const ry = (0.247 * Math.PI) / (180 * 3600);
  const rz = (0.8421 * Math.PI) / (180 * 3600);

  const x2 = tx + (1 + s) * x1 - rz * y1 + ry * z1;
  const y2 = ty + rz * x1 + (1 + s) * y1 - rx * z1;
  const z2 = tz - ry * x1 + rx * y1 + (1 + s) * z1;

  const wgsE2 = 1 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let wgsLat = Math.atan2(z2, p * (1 - wgsE2));
  let prevLat = 0;

  do {
    prevLat = wgsLat;
    const wgsV = WGS84_A / Math.sqrt(1 - wgsE2 * Math.sin(wgsLat) * Math.sin(wgsLat));
    wgsLat = Math.atan2(z2 + wgsE2 * wgsV * Math.sin(wgsLat), p);
  } while (Math.abs(wgsLat - prevLat) > 1e-12);

  const wgsLon = Math.atan2(y2, x2);

  return {
    lat: Number(((wgsLat * 180) / Math.PI).toFixed(5)),
    lon: Number(((wgsLon * 180) / Math.PI).toFixed(5)),
  };
}

/**
 * Build a crisp 96x96 SVG showing where the parsed square sits inside its 10km parent grid.
 */
function buildGridSvg(parsed, accentColor = '#0284c7') {
  if (!parsed) return '';
  // Position inside parent 10km square (0..10000m)
  const modE = ((parsed.easting % 10000) + 10000) % 10000;
  const modN = ((parsed.northing % 10000) + 10000) % 10000;
  const span = Math.min(parsed.stepMeters, 10000);

  const sizePx = 84;
  const pad = 6;
  const inner = sizePx - pad * 2;

  const x = pad + (modE / 10000) * inner;
  const y = pad + ((10000 - modN - span) / 10000) * inner;
  const w = Math.max(6, (span / 10000) * inner);
  const h = Math.max(6, (span / 10000) * inner);

  const cx = x + w / 2;
  const cy = y + h / 2;

  return `
    <svg viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}" role="img" aria-label="Grid square ${parsed.formatted}">
      <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" fill="none" stroke="currentColor" stroke-opacity="0.22" stroke-width="1" />
      <line x1="${pad + inner / 2}" y1="${pad}" x2="${pad + inner / 2}" y2="${pad + inner}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="2 2" />
      <line x1="${pad}" y1="${pad + inner / 2}" x2="${pad + inner}" y2="${pad + inner / 2}" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="2 2" />
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${accentColor}" fill-opacity="0.28" stroke="${accentColor}" stroke-width="1.5" />
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2" fill="${accentColor}" />
    </svg>
  `.trim();
}

async function copyTextToClipboard(text) {
  const value = String(text ?? '').trim();
  if (!value) return false;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fallback below
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}

function emitGridSelect(target, parsed) {
  if (!parsed) return;
  target.dispatchEvent(
    new CustomEvent('heritage:select', {
      bubbles: true,
      composed: true,
      detail: {
        uri: `https://gridreferencefinder.com/os.php?grid=${encodeURIComponent(parsed.normalized)}`,
        gridRef: parsed.formatted,
        precisionMeters: parsed.stepMeters,
        center: parsed.center,
        bbox: parsed.bbox,
        geojson: parsed.geojson,
      },
    })
  );
}

let globalTemplate = null;

class GridRef extends HTMLElement {
  static get observedAttributes() {
    return ['ref', 'mode', 'listen'];
  }

  static setTemplate(fn) {
    globalTemplate = fn;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = false;
    this.template = null;
    this._onExternalSelect = this._onExternalSelect.bind(this);
  }

  connectedCallback() {
    this.render();
    this._bindEvents();
  }

  disconnectedCallback() {
    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.removeEventListener(listenEvent, this._onExternalSelect);
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this.isConnected) return;
    if (name === 'ref' || name === 'mode') {
      this.render();
      this._bindEvents();
    }
  }

  get mode() {
    return this.getAttribute('mode') || 'popover';
  }

  _onExternalSelect(e) {
    if (e.detail?.gridRef) {
      this.setAttribute('ref', e.detail.gridRef);
    }
  }

  _bindEvents() {
    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.addEventListener(listenEvent, this._onExternalSelect);
    }

    const rawRef = this.getAttribute('ref') || this.textContent.trim();
    const parsed = parseGridRef(rawRef);

    if (this.mode === 'popover') {
      const trigger = this.shadowRoot.querySelector('[part="trigger"]');
      trigger?.addEventListener('mouseenter', () => this.open());
      trigger?.addEventListener('focus', () => this.open());
      trigger?.addEventListener('click', (e) => {
        emitGridSelect(this, parsed);
        if (this.hasAttribute('prevent-navigation')) e.preventDefault();
      });
      this.addEventListener('mouseleave', () => this.close());
      this.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    }

    const copyBtn = this.shadowRoot.querySelector('[part="copy-button"]');
    copyBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = e.currentTarget.getAttribute('data-copy') || parsed?.formatted || '';
      const copied = await copyTextToClipboard(text);
      if (copied) {
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = prev;
        }, 1200);
      }
    });
  }

  open() {
    if (this.mode !== 'popover') return;
    this._open = true;
    const card = this.shadowRoot.querySelector('[part="card"]');
    if (card) card.hidden = false;
  }

  close() {
    if (this.mode !== 'popover') return;
    this._open = false;
    const card = this.shadowRoot.querySelector('[part="card"]');
    if (card) card.hidden = true;
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _renderBody(parsed) {
    if (!parsed) {
      return `<div class="invalid">Invalid or unsupported OSGB36 grid reference.</div>`;
    }

    const customFn = this.template || globalTemplate;
    if (typeof customFn === 'function') {
      return customFn(parsed, this._esc.bind(this));
    }

    const accent =
      getComputedStyle(this).getPropertyValue('--gr-accent').trim() || '#0284c7';
    const svg = buildGridSvg(parsed, accent);
    const copyPayload = `${parsed.formatted} (${parsed.center.lat}, ${parsed.center.lon})`;

    return `
      <div part="header" class="header">
        <span part="badge" class="badge">${this._esc(parsed.precisionLabel)}</span>
        <span part="epsg" class="epsg">EPSG:27700</span>
      </div>
      <div part="body" class="body">
        <div part="map" class="map">${svg}</div>
        <div class="info">
          <div part="title" class="title">${this._esc(parsed.formatted)}</div>
          <div part="coords" class="coords">${parsed.center.lat}° N, ${parsed.center.lon}° E</div>
          <div part="en" class="en">E ${parsed.easting} · N ${parsed.northing}</div>
        </div>
      </div>
      <p part="note" class="note">${this._esc(parsed.sensitivityHint)}</p>
      <div part="footer" class="footer">
        <code part="bbox" class="bbox">${parsed.bbox.south}, ${parsed.bbox.west} → ${parsed.bbox.north}, ${parsed.bbox.east}</code>
        <button part="copy-button" type="button" class="copy" data-copy="${this._esc(copyPayload)}">Copy</button>
      </div>
    `;
  }

  render() {
    const rawRef = this.getAttribute('ref') || this.textContent.trim();
    const parsed = parseGridRef(rawRef);
    const labelText = this.textContent.trim() || parsed?.formatted || rawRef;
    const isPanel = this.mode === 'panel';
    const isInline = this.mode === 'inline';

    const styles = `
      <style>
        :host {
          --gr-bg: #ffffff;
          --gr-fg: #18181b;
          --gr-muted: #71717a;
          --gr-accent: #0284c7;
          --gr-border: #e4e4e7;
          --gr-surface: rgba(127, 127, 127, 0.08);
          --gr-radius: 0.5rem;
          --gr-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.14);
          --gr-width: 340px;
          --gr-font: system-ui, -apple-system, sans-serif;

          position: relative;
          display: ${isPanel ? 'block' : 'inline-block'};
          font-family: var(--gr-font);
        }

        @media (prefers-color-scheme: dark) {
          :host(:not([theme="light"])) {
            --gr-bg: #18181b;
            --gr-fg: #f4f4f5;
            --gr-muted: #a1a1aa;
            --gr-border: #27272a;
          }
        }

        :host([theme="dark"]) {
          --gr-bg: #18181b;
          --gr-fg: #f4f4f5;
          --gr-muted: #a1a1aa;
          --gr-border: #27272a;
        }

        .trigger {
          color: inherit;
          text-decoration: underline;
          text-decoration-style: dotted;
          text-underline-offset: 3px;
          cursor: pointer;
        }

        .inline-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 9999px;
          border: 1px solid var(--gr-border);
          background: var(--gr-surface);
          font-size: 12px;
          font-weight: 500;
        }

        .card {
          box-sizing: border-box;
          background: var(--gr-bg);
          color: var(--gr-fg);
          border: 1px solid var(--gr-border);
          border-radius: var(--gr-radius);
          padding: 12px;
          font-size: 13px;
          line-height: 1.45;
          ${
            isPanel
              ? 'width: 100%;'
              : 'position: absolute; top: calc(100% + 6px); left: 0; z-index: 1000; width: var(--gr-width); box-shadow: var(--gr-shadow);'
          }
        }

        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .badge { background: var(--gr-accent); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
        .epsg { font-size: 11px; font-family: ui-monospace, monospace; color: var(--gr-muted); }
        .body { display: flex; gap: 10px; align-items: center; }
        .map { flex-shrink: 0; border-radius: 6px; background: var(--gr-surface); padding: 2px; }
        .info { min-width: 0; }
        .title { font-weight: 600; font-size: 15px; font-family: ui-monospace, monospace; }
        .coords { font-size: 12px; margin-top: 2px; }
        .en { font-size: 11px; font-family: ui-monospace, monospace; color: var(--gr-muted); margin-top: 2px; }
        .note { margin: 8px 0 0; font-size: 12px; color: var(--gr-muted); }
        .footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--gr-border); padding-top: 8px; margin-top: 8px; }
        .bbox { font-size: 10px; color: var(--gr-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .copy { font-size: 11px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--gr-border); background: transparent; color: inherit; cursor: pointer; }
        .copy:hover { background: var(--gr-surface); }
        .invalid { font-size: 12px; color: #dc2626; }
      </style>
    `;

    if (isPanel) {
      this.shadowRoot.innerHTML = `${styles}<div part="card" class="card">${this._renderBody(parsed)}</div>`;
      return;
    }

    if (isInline) {
      this.shadowRoot.innerHTML = `
        ${styles}
        <span part="inline" class="inline-chip">
          <span>${this._esc(labelText)}</span>
          ${parsed ? `<span style="opacity:0.65">· ${this._esc(parsed.precisionLabel)}</span>` : ''}
        </span>
      `;
      return;
    }

    this.shadowRoot.innerHTML = `
      ${styles}
      <a part="trigger" class="trigger" href="#grid-${this._esc(parsed?.normalized || '')}">${this._esc(labelText)}</a>
      <div part="card" class="card" role="tooltip" ${this._open ? '' : 'hidden'}>
        ${this._renderBody(parsed)}
      </div>
    `;
  }
}

if (!customElements.get('grid-ref')) {
  customElements.define('grid-ref', GridRef);
}

class GridRefTailwind extends HTMLElement {
  static classes = {
    trigger:
      'underline decoration-dotted underline-offset-4 text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 cursor-pointer font-mono text-sm font-medium',
    inlineChip:
      'inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-zinc-800 dark:text-zinc-200',
    popover:
      'absolute left-0 top-full mt-1.5 z-50 w-80 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 text-left text-sm text-zinc-900 dark:text-zinc-100 shadow-xl',
    panel:
      'w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left text-sm text-zinc-900 dark:text-zinc-100',
    badge:
      'inline-flex items-center rounded bg-sky-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white',
    copyBtn:
      'shrink-0 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-[11px] font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors',
  };

  constructor() {
    super();
    this._open = false;
    this._initialized = false;
    this._onExternalSelect = this._onExternalSelect.bind(this);
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.render();

    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.addEventListener(listenEvent, this._onExternalSelect);
    }
  }

  disconnectedCallback() {
    const listenEvent = this.getAttribute('listen');
    if (listenEvent) {
      window.removeEventListener(listenEvent, this._onExternalSelect);
    }
  }

  _onExternalSelect(e) {
    if (e.detail?.gridRef) {
      this.setAttribute('ref', e.detail.gridRef);
      this.render();
    }
  }

  open() {
    this._open = true;
    const card = this.querySelector('[data-gr-card]');
    if (card) card.hidden = false;
  }

  close() {
    this._open = false;
    const card = this.querySelector('[data-gr-card]');
    if (card) card.hidden = true;
  }

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _renderCardHtml(parsed) {
    const c = GridRefTailwind.classes;
    if (!parsed) {
      return `<p class="text-xs text-red-600 dark:text-red-400">Invalid OSGB36 grid reference.</p>`;
    }

    const svg = buildGridSvg(parsed, '#0284c7');
    const copyPayload = `${parsed.formatted} (${parsed.center.lat}, ${parsed.center.lon})`;

    return `
      <div class="flex items-center justify-between mb-2">
        <span class="${c.badge}">${this._esc(parsed.precisionLabel)}</span>
        <span class="font-mono text-[11px] text-zinc-500">EPSG:27700</span>
      </div>
      <div class="flex items-center gap-3">
        <div class="shrink-0 rounded-md bg-zinc-100 dark:bg-zinc-800/70 p-1 text-zinc-700 dark:text-zinc-300">${svg}</div>
        <div class="min-w-0">
          <div class="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-50">${this._esc(parsed.formatted)}</div>
          <div class="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">${parsed.center.lat}° N, ${parsed.center.lon}° E</div>
          <div class="font-mono text-[11px] text-zinc-500 mt-0.5">E ${parsed.easting} · N ${parsed.northing}</div>
        </div>
      </div>
      <p class="mt-2.5 text-xs text-zinc-600 dark:text-zinc-400">${this._esc(parsed.sensitivityHint)}</p>
      <div class="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-2">
        <code class="truncate text-[10px] text-zinc-500">${parsed.bbox.south}, ${parsed.bbox.west} → ${parsed.bbox.north}, ${parsed.bbox.east}</code>
        <button type="button" data-gr-copy data-copy="${this._esc(copyPayload)}" class="${c.copyBtn}">Copy</button>
      </div>
    `;
  }

  render() {
    const rawRef = this.getAttribute('ref') || this.textContent.trim();
    const parsed = parseGridRef(rawRef);
    const labelText = this.textContent.trim() || parsed?.formatted || rawRef;
    const mode = this.getAttribute('mode') || 'popover';
    const c = GridRefTailwind.classes;

    const triggerClass = `${c.trigger} ${this.getAttribute('trigger-class') || ''}`.trim();
    const cardClass = `${mode === 'panel' ? c.panel : c.popover} ${this.getAttribute('card-class') || ''}`.trim();

    this.classList.add(mode === 'panel' ? 'block' : 'relative', mode === 'panel' ? 'w-full' : 'inline-block');

    if (mode === 'panel') {
      this.innerHTML = `<div data-gr-card class="${cardClass}">${this._renderCardHtml(parsed)}</div>`;
    } else if (mode === 'inline') {
      const chipClass = `${c.inlineChip} ${this.getAttribute('trigger-class') || ''}`.trim();
      this.innerHTML = `<span class="${chipClass}">${this._esc(labelText)}${parsed ? `<span class="opacity-70">· ${this._esc(parsed.precisionLabel)}</span>` : ''}</span>`;
    } else {
      this.innerHTML = `
        <a data-gr-trigger href="#grid-${this._esc(parsed?.normalized || '')}" class="${triggerClass}">${this._esc(labelText)}</a>
        <div data-gr-card role="tooltip" ${this._open ? '' : 'hidden'} class="${cardClass}">${this._renderCardHtml(parsed)}</div>
      `;

      const trigger = this.querySelector('[data-gr-trigger]');
      trigger?.addEventListener('mouseenter', () => this.open());
      trigger?.addEventListener('focus', () => this.open());
      trigger?.addEventListener('click', (e) => {
        emitGridSelect(this, parsed);
        if (this.hasAttribute('prevent-navigation')) e.preventDefault();
      });
      this.addEventListener('mouseleave', () => this.close());
      this.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    }

    this.querySelector('[data-gr-copy]')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = e.currentTarget.getAttribute('data-copy') || parsed?.formatted || '';
      const copied = await copyTextToClipboard(text);
      if (copied) {
        const btn = e.currentTarget;
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      }
    });
  }
}

if (!customElements.get('grid-ref-tw')) {
  customElements.define('grid-ref-tw', GridRefTailwind);
}

window.GridRefLib = {
    parseGridRef,
    formatPrecisionLabel,
    osgbToWgs84,
    buildGridSvg,
    copyTextToClipboard,
    emitGridSelect,
    GridRef,
    GridRefTailwind
  };
})();
