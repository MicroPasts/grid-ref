import {
  parseGridRef,
  buildGridSvg,
  copyTextToClipboard,
  emitGridSelect,
} from './core.js';

let globalTemplate = null;

export class GridRef extends HTMLElement {
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