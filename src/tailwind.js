import {
  parseGridRef,
  buildGridSvg,
  copyTextToClipboard,
  emitGridSelect,
} from './core.js';

export class GridRefTailwind extends HTMLElement {
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