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
export function parseGridRef(input) {
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

export function formatPrecisionLabel(meters) {
  if (meters >= 1000) return `${meters / 1000} km square`;
  return `${meters} m square`;
}

/**
 * Convert OSGB36 easting/northing (meters) to WGS84 { lat, lon }.
 */
export function osgbToWgs84(E, N) {
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
export function buildGridSvg(parsed, accentColor = '#0284c7') {
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

export async function copyTextToClipboard(text) {
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

export function emitGridSelect(target, parsed) {
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