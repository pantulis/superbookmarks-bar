// Renders the Superfavorites Bar inside a closed shadow root so page
// styles can't leak in. All bookmark data comes from chrome.storage.local,
// which the service worker keeps current.
//
// Each subfolder of the Superfavorites folder is a workspace; the bar shows
// the contents of the selected one. A workspace's icon is the emoji at the
// start of its folder name ("💼 Work").
(() => {
  // No extension APIs here: a copy left over from before the extension was
  // reloaded, or a page where Edge doesn't give them to content scripts.
  if (!globalThis.chrome?.runtime?.id) return;
  if (window.top !== window || window.__altFavoritesBar) return;
  window.__altFavoritesBar = true;

  const HOST_ID = 'alt-favorites-bar-host';
  const PUSH_STYLE_ID = 'alt-favorites-bar-push';
  const BAR_HEIGHT = 32;
  const SPRING_DELAY = 600; // ms to hover a folder while dragging before it opens
  // A favorite with this URL draws a divider (the .invalid domain never resolves).
  const SEPARATOR_URL = 'https://superfavorites.invalid/separator';
  const isSeparator = (node) => node?.url === SEPARATOR_URL;
  const COLORS = ['#0f6cbd', '#8764b8', '#c239b3', '#d13438', '#ca5010', '#c19c00', '#498205', '#038387', '#69797e'];
  const IS_MAC = /Mac/.test(navigator.platform);
  const EMOJIS = [
    '💼', '🏠', '💻', '📚', '🎓', '🎨', '🎵', '🎮',
    '🛒', '✈️', '🍳', '💰', '📈', '🧪', '🩺', '🏋️',
    '⚽', '🌱', '🐾', '📰', '🎬', '📷', '🛠️', '🚀',
    '⭐', '❤️', '🔥', '💡', '📌', '🌍', '🧘',
  ];

  // Left behind by a previous copy of the extension (e.g. after an update).
  document.getElementById(HOST_ID)?.remove();
  document.getElementById(PUSH_STYLE_ID)?.remove();

  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const CSS = `
    :host {
      --bg: #f7f7f7; --fg: #1b1b1b; --muted: #6b6b6b; --border: #dcdcdc;
      --hover: rgba(0, 0, 0, .06); --active: rgba(0, 0, 0, .1); --accent: #0f6cbd;
      --menu-bg: #ffffff; --shadow: 0 6px 20px rgba(0, 0, 0, .16); --folder: #d99a1e;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #2b2b2b; --fg: #f2f2f2; --muted: #a6a6a6; --border: #3d3d3d;
        --hover: rgba(255, 255, 255, .08); --active: rgba(255, 255, 255, .13); --accent: #4aa0f0;
        --menu-bg: #2f2f2f; --shadow: 0 6px 20px rgba(0, 0, 0, .5); --folder: #f2c14e;
      }
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .bar, .menu, .overlay {
      font: 12px/1.2 "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--fg); text-align: left; letter-spacing: normal;
    }
    .bar {
      position: fixed; left: 0; right: 0; height: ${BAR_HEIGHT}px;
      display: flex; align-items: center; gap: 2px; padding: 0 6px;
      background: var(--bg);
    }
    .bar.top { top: 0; border-bottom: 1px solid var(--border); box-shadow: inset 0 -2px 0 var(--ws-color, transparent); }
    .bar.bottom { bottom: 0; border-top: 1px solid var(--border); box-shadow: inset 0 2px 0 var(--ws-color, transparent); }
    .items { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; height: 100%; overflow: hidden; }
    .item {
      display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
      height: 24px; max-width: 180px; padding: 0 8px; margin: 0;
      border: 0; border-radius: 4px; background: transparent;
      color: inherit; font: inherit; text-decoration: none; cursor: default; outline: none;
    }
    .item:hover, .item:focus-visible { background: var(--hover); }
    .item.open, .item:active { background: var(--active); }
    .bar, .menu {
      font-family: var(--ui-family, "Segoe UI", system-ui, -apple-system, sans-serif);
      font-size: var(--ui-size, 12px); font-weight: var(--ui-weight, 400);
      font-stretch: var(--ui-stretch, normal); letter-spacing: var(--ui-spacing, normal);
    }
    .item .label {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      text-transform: var(--ui-transform, none); font-variant-caps: var(--ui-caps, normal);
    }
    .item img, .ico { width: 16px; height: 16px; flex-shrink: 0; }
    .ico.folder { color: var(--folder); }
    .ico.chevron, .ico.down { width: 12px; height: 12px; margin-left: auto; color: var(--muted); }
    .ico.check { margin-left: auto; color: var(--accent); }
    .emoji { width: 16px; flex-shrink: 0; font: 14px/16px ${EMOJI_FONT}; text-align: center; }
    .selector { max-width: 200px; font-weight: var(--ui-strong, 600); }
    .pins { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
    .pins .item { position: relative; padding: 0 5px; }
    .pin-dot {
      position: absolute; bottom: 0; left: 50%; width: 4px; height: 4px; margin-left: -2px;
      border-radius: 50%; background: var(--accent);
    }
    .pin-badge {
      position: absolute; top: -2px; right: -3px; min-width: 14px; height: 14px; padding: 0 3px;
      font: 600 9px/14px "Segoe UI", system-ui, sans-serif; text-align: center; color: #fff;
      background: #d13438; border-radius: 7px; box-shadow: 0 0 0 1.5px var(--bg);
    }
    .pin-badge.dot { top: 1px; right: 0; min-width: 8px; width: 8px; height: 8px; padding: 0; }
    .item.colored { background: color-mix(in srgb, var(--ws-color) 18%, transparent); }
    .item.colored:hover, .item.colored.open { background: color-mix(in srgb, var(--ws-color) 30%, transparent); }
    .item.separator { width: 9px; padding: 0; justify-content: center; background: transparent; }
    .item.separator::before { content: ''; width: 1px; height: 16px; background: var(--border); }
    .menu .item.separator { width: 100%; height: 9px; }
    .menu .item.separator::before { width: 100%; height: 1px; }
    .color-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .swatch {
      width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; cursor: default;
      box-shadow: inset 0 0 0 1px rgba(127, 127, 127, .35);
    }
    .swatch.none { background: linear-gradient(135deg, transparent 46%, var(--muted) 46% 54%, transparent 54%), var(--bg); }
    .swatch.custom { background: conic-gradient(#d13438, #c19c00, #498205, #038387, #0f6cbd, #8764b8, #c239b3, #d13438); }
    .swatch.selected { outline: 2px solid var(--accent); outline-offset: 2px; }
    .color-input { position: absolute; width: 0; height: 0; padding: 0; border: 0; opacity: 0; }
    .bar.icons-only .others .label, .bar.icons-only .stickies .label { display: none; }
    .stickies { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
    .type-row { display: flex; gap: 8px; }
    .picker {
      max-height: 220px; overflow-y: auto; padding: 2px; outline: none;
      background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
    }
    .picker:focus { border-color: var(--accent); }
    .picker-row {
      display: flex; align-items: center; gap: 4px; height: 26px; padding-right: 6px;
      border-radius: 4px; white-space: nowrap; cursor: default;
    }
    .picker-row:hover { background: var(--hover); }
    .picker-row.selected { color: #fff; background: var(--accent); }
    .picker-row .label { overflow: hidden; text-overflow: ellipsis; }
    .twisty { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 16px; height: 16px; }
    .twisty .ico { width: 12px; height: 12px; margin: 0; color: inherit; opacity: .7; }
    .type-option {
      display: flex; flex: 1; align-items: flex-start; gap: 8px; padding: 8px;
      border: 1px solid var(--border); border-radius: 6px;
    }
    .type-option:has(input:checked) { background: var(--active); border-color: var(--accent); }
    .type-option:has(input:disabled) { opacity: .5; }
    .type-option input { margin: 2px 0 0; accent-color: var(--accent); }
    .type-option strong { display: block; font-weight: 600; }
    .type-option small { color: var(--muted); font-size: 11px; }
    .divider { width: 1px; height: 18px; margin: 0 4px; flex-shrink: 0; background: var(--border); }
    .bar.icons-only .items .item { padding: 0 4px; }
    .bar.icons-only .items .item .label { display: none; }
    .hint { color: var(--muted); padding: 0 8px; white-space: nowrap; }
    .menu {
      position: fixed; min-width: 200px; max-width: 340px; max-height: calc(70vh * var(--pz, 1)); overflow-y: auto;
      padding: 4px; background: var(--menu-bg); border: 1px solid var(--border);
      border-radius: 8px; box-shadow: var(--shadow);
    }
    .menu .item { display: flex; width: 100%; max-width: none; height: 28px; }
    .menu .hint { padding: 6px 8px; }
    .menu .item[disabled] { opacity: .45; pointer-events: none; }
    .sep { height: 1px; margin: 4px 2px; background: var(--border); }
    .item.drop-before { box-shadow: inset 2px 0 0 var(--accent); border-radius: 0 4px 4px 0; }
    .item.drop-after { box-shadow: inset -2px 0 0 var(--accent); border-radius: 4px 0 0 4px; }
    .menu .item.drop-before { box-shadow: inset 0 2px 0 var(--accent); border-radius: 0 0 4px 4px; }
    .menu .item.drop-after { box-shadow: inset 0 -2px 0 var(--accent); border-radius: 4px 4px 0 0; }
    .item.drop-into, .items.drop-into, .menu.drop-into { background: var(--active); box-shadow: inset 0 0 0 1px var(--accent); }

    .settings-frame {
      width: 640px; height: 820px; max-width: calc(100vw * var(--pz, 1) - 32px); max-height: calc(100vh * var(--pz, 1) - 32px);
      border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); background: var(--menu-bg);
      color-scheme: light dark;
    }
    .overlay {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, .35); font-size: 13px; line-height: 1.4;
    }
    .dialog {
      display: flex; flex-direction: column; gap: 8px; width: 360px; max-width: calc(100vw * var(--pz, 1) - 32px);
      max-height: calc(100vh * var(--pz, 1) - 32px); overflow-y: auto;
      padding: 20px; background: var(--menu-bg); border: 1px solid var(--border);
      border-radius: 10px; box-shadow: var(--shadow);
    }
    .dialog-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .dialog.tidy { width: 560px; }
    .tidy-intro { margin-top: -6px; color: var(--muted); font-size: 12px; }
    .tidy-head { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-weight: 600; }
    .tidy-count { margin-left: auto; color: var(--muted); font-size: 12px; font-weight: 400; }
    .tidy-list { max-height: calc(28vh * var(--pz, 1)); overflow-y: auto; padding: 2px; border: 1px solid var(--border); border-radius: 6px; }
    .tidy-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 4px; }
    .tidy-row:hover { background: var(--hover); }
    .tidy-row img { width: 16px; height: 16px; flex-shrink: 0; }
    .tidy-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tidy-meta { max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
    .tidy-empty { padding: 6px 2px; color: var(--muted); font-size: 12px; }
    .tidy-add {
      display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; height: 22px; padding: 0 8px;
      font: inherit; font-size: 12px; color: var(--muted); background: transparent;
      border: 1px solid var(--border); border-radius: 11px;
    }
    .tidy-add .ico { width: 12px; height: 12px; }
    .tidy-add:hover { color: var(--fg); background: var(--hover); }
    .tidy-add[aria-pressed="true"] { color: #fff; background: var(--accent); border-color: var(--accent); }
    .tidy-add .label { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tidy-picker {
      position: fixed; z-index: 1; display: flex; flex-direction: column; min-width: 180px; max-width: 280px;
      max-height: calc(50vh * var(--pz, 1)); overflow-y: auto; padding: 4px; background: var(--menu-bg);
      border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow);
    }
    .tidy-picker button {
      display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 10px; flex-shrink: 0;
      font: inherit; color: inherit; text-align: left; background: transparent; border: 0; border-radius: 4px;
    }
    .tidy-picker button:hover, .tidy-picker button:focus-visible { background: var(--hover); outline: none; }
    .tidy-picker button.chosen { font-weight: 600; }
    .tidy-picker .muted { color: var(--muted); }
    .tidy-picker .sep { height: 1px; margin: 4px 6px; background: var(--border); }
    .dialog input[type="checkbox"] { margin: 0; accent-color: var(--accent); }
    .field-label { margin-top: 4px; color: var(--muted); font-size: 12px; }
    .field {
      width: 100%; padding: 6px 8px; font: inherit; color: inherit; background: var(--bg);
      border: 1px solid var(--border); border-radius: 4px; outline: none;
    }
    .field:focus { border-color: var(--accent); }
    .emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
    .emoji-choice {
      display: flex; align-items: center; justify-content: center; height: 34px; padding: 0;
      font: 18px/1 ${EMOJI_FONT}; color: var(--muted); background: transparent;
      border: 1px solid transparent; border-radius: 6px; cursor: default;
    }
    .emoji-choice:hover { background: var(--hover); }
    .emoji-choice.selected { background: var(--active); border-color: var(--accent); }
    .custom-row { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
    .custom-row .field { width: 90px; font-family: ${EMOJI_FONT}; }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .btn {
      padding: 6px 16px; font: inherit; color: inherit; background: var(--bg);
      border: 1px solid var(--border); border-radius: 4px;
    }
    .btn.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    .url-row { display: flex; align-items: center; gap: 8px; }
    .url-row .field { flex: 1; }
    .url-preview {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 6px;
    }
    .url-preview canvas { width: 24px; height: 24px; }
    .url-status { min-height: 16px; color: var(--muted); font-size: 12px; }

    /* --zoom (Settings → Switcher size) scales the whole palette. Window-relative
       sizes are divided by it so the zoomed palette still fits the window. */
    .switcher {
      zoom: var(--zoom, 1);
      width: 420px; max-width: calc((100vw * var(--pz, 1) - 32px) / var(--zoom, 1)); padding: 6px; outline: none;
      background: var(--menu-bg); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow);
    }
    .switcher .search { margin: 2px 0 6px; padding: 9px 12px; font-size: 14px; }
    .switcher .hint { padding: 12px; }
    .row img { width: 20px; height: 20px; margin: 4px; flex-shrink: 0; }
    .row-path { max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
    .rows { display: flex; flex-direction: column; gap: 2px; max-height: calc(60vh * var(--pz, 1)); overflow-y: auto; }
    .switcher .rows { max-height: calc(60vh * var(--pz, 1) / var(--zoom, 1)); }
    .row {
      display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px;
      font: inherit; font-size: 14px; color: inherit; text-align: left;
      background: transparent; border: 0; border-radius: 6px; cursor: default; outline: none;
    }
    .row .ico { width: 28px; height: 28px; color: var(--muted); }
    .row .emoji { width: 28px; font: 22px/28px ${EMOJI_FONT}; }
    .row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .row-meta { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .row-key {
      min-width: 18px; padding: 1px 4px; color: var(--muted); font-size: 11px; text-align: center;
      border: 1px solid var(--border); border-radius: 4px;
    }
    .row.create { padding: 6px 10px; font-size: 12px; color: var(--muted); }
    .row.create .ico { width: 14px; height: 14px; margin: 0 7px; }
    .row.create .row-name { font-weight: 400; }
    .row.selected { color: #fff; background: var(--accent); }
    .row.selected .ico, .row.selected .row-meta { color: rgba(255, 255, 255, .85); }
    .row.selected .row-key { color: rgba(255, 255, 255, .85); border-color: rgba(255, 255, 255, .5); }
    .switcher-help { margin: 6px 12px 4px; color: var(--muted); font-size: 11px; }
  `;

  // Built-in icons come from the selected icon theme (icon-themes.js, loaded
  // before this script). The theme is a per-device setting, not synced.
  const iconThemes = globalThis.superfavoritesIcons;
  let iconTheme = iconThemes.DEFAULT;

  // --- DOM helpers (no innerHTML, so pages with Trusted Types are fine) ------

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    el.append(...children);
    return el;
  }

  const icon = (name) => iconThemes.render(iconTheme, name);

  function favicon(url) {
    const img = h('img', { alt: '', draggable: false });
    img.src = `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`;
    return img;
  }

  const label = (text) => h('span', { className: 'label', textContent: text });

  // --- Workspace names -------------------------------------------------------

  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const firstGrapheme = (text) => graphemes.segment(text)[Symbol.iterator]().next().value?.segment ?? '';
  const isEmoji = (text) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text);

  // "💼 Work" -> { emoji: '💼', name: 'Work' }
  function parseWorkspace(title) {
    const first = firstGrapheme(title);
    return isEmoji(first) ? { emoji: first, name: title.slice(first.length).trim() } : { emoji: '', name: title };
  }

  // Draws a PNG data URL on a canvas. Unlike <img>, this can't be blocked by
  // the page's Content Security Policy.
  function imageIcon(dataUrl, size = 16) {
    const canvas = h('canvas', { className: 'ico' });
    canvas.width = canvas.height = Math.round(size * (devicePixelRatio || 1));
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      .then((bitmap) => canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height))
      .catch(() => {});
    return canvas;
  }

  // A workspace's icon: a downloaded image, else the emoji in its name, else a generic icon.
  function workspaceIcon(ws, size = 16, fallback = 'workspace') {
    const image = ws?.icon && settings.workspaceIcons?.[ws.icon];
    if (image) return imageIcon(image, size);
    const { emoji } = parseWorkspace(ws?.title ?? '');
    return emoji ? h('span', { className: 'emoji', textContent: emoji }) : icon(fallback);
  }

  // "github.com" -> "https://github.com/"; null if it can't be parsed. Any
  // scheme is kept ("javascript:", "file:"), but "localhost:3000" is a host.
  function parseUrl(text) {
    text = text.trim();
    if (!text) return null;
    try {
      return new URL(/^[a-z][\w+.-]*:(?!\d)/i.test(text) ? text : `https://${text}`).href;
    } catch {
      return null;
    }
  }

  // Like parseUrl, but only web addresses (for downloading icons).
  function normalizeUrl(text) {
    const href = parseUrl(text);
    if (!href) return null;
    const url = new URL(href);
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') ? href : null;
  }

  // --- Skeleton --------------------------------------------------------------

  const host = h('div', { id: HOST_ID });
  host.style.cssText = 'all: initial !important; position: fixed !important; z-index: 2147483647 !important;';
  const root = host.attachShadow({ mode: 'closed' });

  // Page zoom (Ctrl +/-) scales everything in the page, the bar included. The
  // host is zoomed by the inverse so the bar keeps its size; the service worker
  // reports the tab's zoom. Inside the host, `--pz` undoes the inverse zoom for
  // viewport units, and toCss() does it for positions measured on screen.
  let pageZoom = 1;
  const toCss = (screenPx) => `${screenPx * pageZoom}px`;
  function applyZoom(factor) {
    if (!(factor > 0) || factor === pageZoom) return;
    pageZoom = factor;
    host.style.setProperty('zoom', String(1 / factor), 'important');
    host.style.setProperty('--pz', String(factor));
    if (tree) render();
  }

  const selector = h('button', { className: 'item selector', title: 'Switch workspace' });
  const items = h('div', { className: 'items' });
  const overflowBtn = h('button', { className: 'item', title: 'More favorites', hidden: true }, icon('more'));
  const addBtn = h('button', { className: 'item', title: 'Add this page to the bar' }, icon('add'));
  const tidyBtn = h('button', { className: 'item', title: 'Tidy tabs…' }, icon('tidy'));
  const pins = h('div', { className: 'pins' });
  const pinsDivider = h('div', { className: 'divider' });
  const stickiesDivider = h('div', { className: 'divider' });
  const stickies = h('div', { className: 'stickies' });
  const othersDivider = h('div', { className: 'divider' });
  const othersBtn = h('button', { className: 'item others' });
  const bar = h(
    'div',
    { className: 'bar top', hidden: true },
    pins,
    pinsDivider,
    selector,
    h('div', { className: 'divider' }),
    items,
    overflowBtn,
    addBtn,
    tidyBtn,
    stickiesDivider,
    stickies,
    othersDivider,
    othersBtn,
  );
  // The theme's folder color, set by render().
  const themeStyle = h('style');
  root.append(h('style', { textContent: CSS }), themeStyle, bar);
  document.documentElement.append(host);

  let settings = {};
  let tree = null; // the Superfavorites folder
  let workspaces = []; // its subfolders
  let workspace = null; // the selected one, whose contents are on the bar
  let pinned = null; // the pinned folder, shown as icons in every workspace
  // The browser's own name for its Other favorites (Edge) / Other bookmarks (Chrome)
  // folder, until its real title is known.
  const OTHERS_NAME = /\bEdg\//.test(navigator.userAgent) ? 'Other favorites' : 'Other bookmarks';
  let others = null; // Edge's Other favorites (minus Superfavorites), a drop-down at the right end
  let overflowStart = 0; // index of the first item that didn't fit on the bar
  const menus = []; // stack of { el, owner }; menus[0] hangs off the bar

  // --- Messaging -------------------------------------------------------------

  function teardown() {
    host.remove();
    document.getElementById(PUSH_STYLE_ID)?.remove();
  }

  function send(msg) {
    // After the extension is reloaded/updated this copy of the script is orphaned.
    if (!chrome.runtime?.id) {
      teardown();
      return Promise.resolve(null);
    }
    return chrome.runtime.sendMessage(msg).catch(() => null);
  }

  function selectWorkspace(id) {
    if (chrome.runtime?.id) chrome.storage.local.set({ workspaceId: id });
  }

  // Everything but the Other favorites tree, which only its menu, search and
  // the folder picker need (see loadOthers). Without getKeys (older Edge),
  // everything is read.
  async function readSettings() {
    const store = chrome.storage.local;
    if (!store.getKeys) return store.get(null);
    return store.get((await store.getKeys()).filter((key) => key !== 'others'));
  }

  // The Other favorites tree, read once on first use (hovering or dragging
  // onto the bar, opening the switcher) and then kept current by onChanged.
  let othersRead = null;
  function loadOthers() {
    if (!settings.othersInfo) return Promise.resolve(null);
    othersRead ??= chrome.storage.local.get('others').then((res) => (others = res.others ?? null));
    return othersRead;
  }

  async function load() {
    if (!chrome.runtime?.id) return teardown();
    settings = await readSettings();
    tree = settings.tree ?? null;
    if (!tree) send({ type: 'refresh' });
    pinned = tree?.children.find((n) => n.pinned) ?? null;
    if ('others' in settings) {
      others = settings.others ?? null;
      othersRead = Promise.resolve(others);
    }
    workspaces = (tree?.children ?? []).filter((n) => !n.url && !n.pinned && !n.sticky);
    workspace = workspaces.find((w) => w.id === settings.workspaceId) ?? workspaces[0] ?? null;
    render();
  }

  // --- Rendering -------------------------------------------------------------

  // The bar's font settings (Settings → Typography) as custom properties.
  // Unset or unknown values keep the defaults in CSS.
  function typography() {
    const props = [];
    const family = String(settings.fontFamily || '').replace(/["\\;{}<>]/g, '');
    if (family) props.push(`--ui-family: "${family}", "Segoe UI", system-ui, sans-serif;`);
    const size = Number(settings.fontSize);
    if (size >= 9 && size <= 20) props.push(`--ui-size: ${size}px;`);
    const weight = Number(settings.fontWeight);
    if ([300, 400, 500, 600, 700].includes(weight)) props.push(`--ui-weight: ${weight}; --ui-strong: ${weight >= 600 ? 800 : 600};`);
    const stretch = { 'extra-condensed': '62.5%', condensed: '75%', 'semi-condensed': '87.5%', 'semi-expanded': '112.5%', expanded: '125%' }[settings.fontStretch];
    if (stretch) props.push(`--ui-stretch: ${stretch};`);
    const spacing = { tight: '-0.02em', wide: '0.03em', wider: '0.06em' }[settings.letterSpacing];
    if (spacing) props.push(`--ui-spacing: ${spacing};`);
    if (settings.textCase === 'upper') props.push('--ui-transform: uppercase;');
    if (settings.textCase === 'small-caps') props.push('--ui-caps: all-small-caps;');
    return props.join(' ');
  }

  // The full settings page in a large window over the page. The page sends a
  // message to close it (its Done button or Esc).
  function openSettings() {
    const frame = h('iframe', { className: 'settings-frame', src: chrome.runtime.getURL('options.html#dialog'), title: 'Superfavorites Bar settings' });
    const close = showDialog(frame);
    const onMessage = (e) => {
      if (e.source !== frame.contentWindow || e.data?.type !== 'superfavorites:close-settings') return;
      removeEventListener('message', onMessage);
      close();
    };
    addEventListener('message', onMessage);
    frame.addEventListener('load', () => frame.focus());
  }

  function render() {
    closeMenus();
    iconTheme = iconThemes.THEMES[settings.iconTheme] ? settings.iconTheme : iconThemes.DEFAULT;
    const [light, dark] = iconThemes.THEMES[iconTheme].folder;
    themeStyle.textContent = `:host { --folder: ${light}; ${typography()} } @media (prefers-color-scheme: dark) { :host { --folder: ${dark}; } }`;
    overflowBtn.replaceChildren(icon('more'));
    addBtn.replaceChildren(icon('add'));
    tidyBtn.replaceChildren(icon('tidy'));

    const visible = settings.enabled !== false && !document.fullscreenElement;
    bar.hidden = !visible;
    bar.className = ['bar', settings.position === 'bottom' ? 'bottom' : 'top', settings.showTitles === false && 'icons-only']
      .filter(Boolean)
      .join(' ');
    applyPush(visible && settings.pushContent !== false);
    if (!visible) return;

    const { name } = workspace ? parseWorkspace(workspace.title) : { name: 'Workspaces' };
    selector.replaceChildren(workspaceIcon(workspace), label(name || '(untitled)'), icon('down'));
    // The workspace's color tints the selector and draws a line along the bar.
    selector.classList.toggle('colored', !!workspace?.color);
    bar.style.setProperty('--ws-color', workspace?.color ?? 'transparent');

    const pinNodes = (pinned?.children ?? []).filter((n) => n.url);
    pins.replaceChildren(
      ...pinNodes.map((n) => {
        if (!isSeparator(n)) return renderPin(n);
        const el = renderNode(n, 0, pinned);
        el.isPin = true;
        return el;
      }),
    );
    pins.hidden = pinsDivider.hidden = !pinNodes.length;
    updatePinStatus();

    const stickyFolders = (tree?.children ?? []).filter((n) => n.sticky && !n.pinned);
    stickies.replaceChildren(...stickyFolders.map(renderSticky));
    stickies.hidden = stickiesDivider.hidden = !stickyFolders.length;

    const info = settings.othersInfo;
    othersBtn.hidden = othersDivider.hidden = !info;
    if (info) {
      othersBtn.replaceChildren(icon('library'), label(info.title || OTHERS_NAME));
      othersBtn.title = `${info.title} (${info.count} favorites)`;
    }
    // Until the tree is read, a stand-in with the id is enough to drop onto.
    Object.assign(othersBtn, { node: others ?? (info && { id: info.id, title: info.title, children: [] }), depth: 0, isOthers: true });

    const nodes = workspace?.children ?? [];
    const hint = workspace ? 'This workspace is empty. Click + or drag a link here.' : 'Create a workspace to get started.';
    items.replaceChildren(
      ...(nodes.length ? nodes.map((n) => renderNode(n, 0, workspace)) : [h('span', { className: 'hint', textContent: hint })]),
    );
    layoutOverflow();
  }

  // depth 0 = item on the bar; depth d > 0 = item inside menus[d - 1].
  // A folder at depth d opens its contents as menus[d].
  function renderNode(node, depth, parent) {
    let el;
    if (isSeparator(node)) {
      el = h('div', { className: 'item separator' });
      if (depth > 0) el.addEventListener('mouseenter', () => !contextMenuOpen() && closeMenus(depth));
    } else if (node.url) {
      el = h('a', { className: 'item', title: `${node.title}\n${node.url}` }, favicon(node.url), label(node.title || node.url));
      if (!node.url.startsWith('javascript:')) el.href = node.url;
      el.addEventListener('click', () => closeMenus());
      if (depth > 0) el.addEventListener('mouseenter', () => !contextMenuOpen() && closeMenus(depth));
    } else {
      el = h('button', { className: 'item', title: node.title }, icon('folder'), label(node.title));
      const open = () => openMenu(node, el, depth);
      if (depth > 0) {
        el.append(icon('chevron'));
        el.addEventListener('mouseenter', () => !contextMenuOpen() && open());
        el.addEventListener('click', open);
      } else {
        el.addEventListener('click', () => (menus[0]?.owner === el ? closeMenus() : open()));
        // Like a menubar: once a menu is open, hovering other folders switches to them.
        el.addEventListener('mouseenter', () => switchMenuTo(el, open));
      }
    }
    Object.assign(el, { node, parent, index: node.index, depth, draggable: true });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(el, e.clientX, e.clientY);
    });
    return el;
  }

  // Sticky folders: Superfavorites subfolders shown as drop-downs at the right
  // of the bar in every workspace, like Other favorites.
  function renderSticky(folder) {
    const { name } = parseWorkspace(folder.title);
    const el = h('button', { className: 'item', title: folder.title }, workspaceIcon(folder, 16, 'folder'), label(name || '(untitled)'));
    Object.assign(el, { node: folder, parent: tree, index: folder.index, depth: 0, isSticky: true });
    if (folder.color) {
      el.classList.add('colored');
      el.style.setProperty('--ws-color', folder.color);
    }
    el.addEventListener('click', () => (menus[0]?.owner === el ? closeMenus() : openMenu(folder, el, 0)));
    el.addEventListener('mouseenter', () => switchMenuTo(el, () => openMenu(folder, el, 0)));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(el, e.clientX, e.clientY);
    });
    return el;
  }

  // Pinned favorites: favicons that stay on the bar in every workspace.
  // Clicking one switches to a tab already showing it, or opens it.
  // Ctrl/Cmd/Shift-click and middle-click still open a new tab or window.
  function renderPin(node) {
    const el = h('a', { className: 'item', title: `${node.title}\n${node.url}` }, favicon(node.url));
    if (!node.url.startsWith('javascript:')) el.href = node.url;
    el.addEventListener('click', (e) => {
      closeMenus();
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      send({ type: 'focusOrOpen', url: node.url });
    });
    // Filled in by updatePinStatus().
    const dot = h('span', { className: 'pin-dot', hidden: true });
    const badge = h('span', { className: 'pin-badge', hidden: true });
    el.append(dot, badge);
    Object.assign(el, { node, parent: pinned, index: node.index, depth: 0, isPin: true, draggable: true, dot, badge });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(el, e.clientX, e.clientY);
    });
    return el;
  }

  // The "open" dot and unread badge on each pin, from pinStatus, which the
  // service worker keeps up to date from this device's tabs.
  function updatePinStatus() {
    for (const el of pins.children) {
      if (!el.dot) continue;
      const status = settings.pinStatus?.[el.node.url];
      // Settings → Pinned favorites. Without numbers, a count shows as a dot.
      let unread = status?.unread;
      if (typeof unread === 'number' && settings.showUnreadCounts === false) unread = unread > 0;
      if (unread === true && settings.showUnreadDots === false) unread = 0;
      el.dot.hidden = !status?.open || settings.showOpenDots === false;
      el.badge.hidden = !unread;
      el.badge.classList.toggle('dot', unread === true);
      el.badge.textContent = typeof unread === 'number' ? (unread > 99 ? '99+' : String(unread)) : '';
      const note = unread === true ? ' · unread' : unread ? ` · ${unread} unread` : status?.open ? ' · open' : '';
      el.title = `${el.node.title}${note}\n${el.node.url}`;
    }
  }

  // Hide bar items that don't fit and list them under the » button.
  function layoutOverflow() {
    const kids = [...items.children];
    for (const k of kids) k.hidden = false;
    overflowBtn.hidden = items.scrollWidth <= items.clientWidth;
    if (overflowBtn.hidden) return;

    const limit = items.getBoundingClientRect().right;
    overflowStart = kids.findIndex((k) => k.getBoundingClientRect().right > limit + 0.5);
    kids.slice(overflowStart).forEach((k) => (k.hidden = true));
  }

  // Shift the page so the bar doesn't cover its content.
  function applyPush(on) {
    let style = document.getElementById(PUSH_STYLE_ID);
    if (!on) return style?.remove();
    style ??= h('style', { id: PUSH_STYLE_ID });
    const side = settings.position === 'bottom' ? 'margin-bottom' : 'margin-top';
    style.textContent = `html { ${side}: ${BAR_HEIGHT / pageZoom}px !important; }`;
    if (!style.isConnected) (document.head ?? document.documentElement).append(style);
  }

  // --- Menus -----------------------------------------------------------------

  function closeMenus(fromDepth = 0) {
    while (menus.length > fromDepth) {
      const { el, owner } = menus.pop();
      el.remove();
      owner?.classList.remove('open');
    }
  }

  function showMenu(menu, owner, position) {
    root.append(menu);
    menus.push({ el: menu, owner });
    owner?.classList.add('open');

    // On-screen size; positions are converted back with toCss (page zoom).
    const { width: w, height: hgt } = menu.getBoundingClientRect();
    let { left, top } = position;
    if (position.beside) {
      const r = position.beside;
      left = r.right + w > innerWidth ? r.left - w : r.right;
      top = r.top - 5;
    } else if (position.below) {
      const r = position.below;
      left = r.left;
      top = settings.position === 'bottom' ? r.top - hgt - 2 : r.bottom + 2;
    }
    menu.style.left = toCss(Math.max(4, Math.min(left, innerWidth - w - 4)));
    menu.style.top = toCss(Math.max(4, Math.min(top, innerHeight - hgt - 4)));
  }

  // Shows folder.children (from index `start`) as menus[depth].
  function openMenu(folder, owner, depth, start = 0) {
    if (menus[depth]?.owner === owner) return;
    closeMenus(depth);
    const nodes = folder.children.slice(start);
    const menu = h(
      'div',
      { className: 'menu' },
      ...(nodes.length
        ? nodes.map((n) => renderNode(n, depth + 1, folder))
        : [h('div', { className: 'hint', textContent: '(empty)' })]),
    );
    menu.folder = folder;
    const rect = owner.getBoundingClientRect();
    showMenu(menu, owner, depth === 0 ? { below: rect } : { beside: rect });
  }

  // Like a menubar: once a menu is open, hovering another bar button switches to it.
  function switchMenuTo(owner, open) {
    if (menus.length && menus[0].owner !== owner && !contextMenuOpen()) open();
  }

  const contextMenuOpen = () => menus.some((m) => m.context);

  // `actions` is a list of [text, run, disabled?, { icon?, submenu?, dialog? }?]
  // with null for separators. `submenu` returns the actions to show beside the
  // item. `dialog` marks actions that open a dialog: the drop-downs under the
  // menu stay open until that dialog closes.
  // The menu is shown as menus[depth]; `base` is the index of the top menu of
  // this right-click menu (its submenus have higher indexes).
  function actionMenu(actions, depth = 0, base = depth) {
    const menu = h('div', { className: 'menu' });
    for (const action of actions) {
      if (!action) {
        menu.append(h('div', { className: 'sep' }));
        continue;
      }
      const [text, run, disabled, { icon: lead, submenu, dialog } = {}] = action;
      const btn = h('button', { className: 'item', disabled: !!disabled }, ...(lead ? [lead] : []), label(text));
      if (submenu) {
        btn.append(icon('chevron'));
        const open = () => {
          if (menus[depth + 1]?.owner === btn) return;
          closeMenus(depth + 1);
          showMenu(actionMenu(submenu(), depth + 1, base), btn, { beside: btn.getBoundingClientRect() });
        };
        btn.addEventListener('mouseenter', open);
        btn.addEventListener('click', open);
      } else {
        btn.addEventListener('mouseenter', () => closeMenus(depth + 1));
        btn.addEventListener('click', () => {
          closeMenus(base);
          run();
          if (!dialog) closeMenus();
        });
      }
      menu.append(btn);
    }
    return menu;
  }

  function urlsIn(node) {
    if (node.url) return node.url.startsWith('javascript:') || isSeparator(node) ? [] : [node.url];
    return node.children.flatMap(urlsIn);
  }

  function addCurrentPage(where = { parentId: workspace?.id }) {
    if (!where.parentId) return editWorkspace(null);
    send({ type: 'add', title: document.title || location.href, url: location.href, ...where });
  }

  // Shows a right-click menu as menus[depth], over any drop-downs below that.
  function showContextMenu(actions, depth, x, y) {
    closeMenus(depth);
    showMenu(actionMenu(actions, depth), null, { left: x, top: y });
    menus.at(-1).context = true;
  }

  // `el` is the right-clicked item, or null for the empty part of the bar.
  // An item inside a drop-down keeps that drop-down open underneath.
  function openContextMenu(el, x, y) {
    const node = el?.node;
    if (isSeparator(node)) {
      const remove = () => send({ type: 'remove', id: node.id });
      return showContextMenu([['Delete separator', remove], null, ['Settings…', () => openSettings()]], el.depth, x, y);
    }
    const isFolder = node && !node.url;
    const inWorkspace = !!node && !!workspace && containsNode(workspace, node.id);
    const inOthers = !!node && !!others && containsNode(others, node.id);
    const actions = [];
    if (node) {
      const urls = urlsIn(node);
      actions.push([isFolder ? `Open all (${urls.length})` : 'Open in new tab', () => send({ type: 'open', urls }), !urls.length]);
      actions.push([isFolder ? 'Open all in new window' : 'Open in new window', () => send({ type: 'open', urls, where: 'window' }), !urls.length]);
      actions.push(null);
    }

    // New things go inside a folder, right after a favorite, or at the end of the workspace.
    const where = isFolder ? { parentId: node.id } : node ? { parentId: el.parent.id, index: el.index + 1 } : { parentId: workspace?.id };
    actions.push([isFolder ? 'Add this page here' : 'Add this page', () => addCurrentPage(where)]);
    if (!node) actions.push(['Pin this page', () => send({ type: 'pin', title: document.title || location.href, url: location.href })]);
    // Pinned favorites are shown as icons only, so no folders there.
    actions.push([isFolder ? 'New folder inside…' : 'New folder…', () => {
      const title = prompt('Folder name', 'New folder');
      if (title) send({ type: 'createFolder', title, ...where });
    }, !where.parentId || el?.isPin]);
    actions.push(['Add separator', () => send({ type: 'addSeparator', ...where }), !where.parentId]);
    if (!node) actions.push(['New sticky folder…', () => editWorkspace(null, { sticky: true }), false, { dialog: true }]);

    if (node && el.isSticky) {
      actions.push(null);
      actions.push(['Edit sticky folder…', () => editWorkspace(node), false, { dialog: true }]);
      actions.push(['Turn into workspace', () => send({ type: 'setSticky', id: node.id, sticky: false })]);
      actions.push(['Delete sticky folder', () => deleteWorkspace(node)]);
    }

    // Other favorites and sticky folders have their own actions (above).
    if (node && !el.isOthers && !el.isSticky) {
      actions.push(null);
      if (el.isPin) {
        actions.push(['Unpin', () => send({ type: 'move', id: node.id, parentId: workspace?.id }), !workspace]);
      } else if (!isFolder) {
        actions.push(['Pin', () => send({ type: 'pin', id: node.id })]);
      }
      if (!inOthers) actions.push([`Move to ${settings.othersInfo?.title || OTHERS_NAME}`, () => send({ type: 'toOtherFavorites', id: node.id })]);
      // Leave out the workspace the item is already in.
      const moveTargets = () =>
        workspaces.map((ws) => {
          const { name } = parseWorkspace(ws.title);
          const move = () => send({ type: 'move', id: node.id, parentId: ws.id });
          return [name || '(untitled)', move, inWorkspace && ws === workspace, { icon: workspaceIcon(ws) }];
        });
      actions.push(['Move to workspace', null, !workspaces.length || (inWorkspace && workspaces.length < 2), { submenu: moveTargets }]);
      actions.push(['Edit…', () => editNode(node, el.parent), false, { dialog: true }]);
      actions.push(['Delete', () => {
        if (!isFolder || confirm(`Delete the folder "${node.title}" and everything in it?`)) {
          send({ type: 'remove', id: node.id, folder: isFolder });
        }
      }]);
    }
    actions.push(null);
    actions.push(['Tidy tabs…', () => openTidy(), false, { icon: icon('tidy'), dialog: true }]);
    actions.push(['Settings…', () => openSettings()]);
    showContextMenu(actions, el?.depth ?? 0, x, y);
  }

  // --- Workspaces ------------------------------------------------------------

  const isWorkspace = (node) => !!node && workspaces.some((w) => w.id === node.id);

  function openWorkspaceMenu() {
    if (menus[0]?.owner === selector) return;
    closeMenus();
    const menu = h('div', { className: 'menu' });
    for (const ws of workspaces) {
      const { name } = parseWorkspace(ws.title);
      const el = h('button', { className: 'item' }, workspaceIcon(ws), label(name || '(untitled)'));
      if (ws.color) el.style.boxShadow = `inset 3px 0 0 ${ws.color}`;
      if (ws === workspace) el.append(icon('check'));
      Object.assign(el, { node: ws, parent: tree, index: ws.index, depth: 1, isWorkspace: true, draggable: true });
      el.addEventListener('click', () => {
        closeMenus();
        selectWorkspace(ws.id);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(workspaceActions(ws), 1, e.clientX, e.clientY);
      });
      menu.append(el);
    }
    if (workspaces.length) menu.append(h('div', { className: 'sep' }));
    for (const [text, run, disabled] of [['New workspace…', () => editWorkspace(null)], ...(workspace ? workspaceActions(workspace) : [])]) {
      const btn = h('button', { className: 'item', disabled: !!disabled }, label(text));
      btn.addEventListener('click', () => {
        closeMenus();
        run();
      });
      menu.append(btn);
    }
    showMenu(menu, selector, { below: selector.getBoundingClientRect() });
  }

  function workspaceActions(ws) {
    return [
      ['Edit workspace…', () => editWorkspace(ws), false, { dialog: true }],
      ['Turn into sticky folder', () => send({ type: 'setSticky', id: ws.id, sticky: true }), workspaces.length < 2],
      ['Delete workspace', () => deleteWorkspace(ws), workspaces.length < 2],
    ];
  }

  function deleteWorkspace(ws) {
    const { name } = parseWorkspace(ws.title);
    const count = urlsIn(ws).length;
    const contents = count ? ` and its ${count} favorite${count === 1 ? '' : 's'}` : '';
    const kind = ws.sticky ? 'sticky folder' : 'workspace';
    if (confirm(`Delete the ${kind} "${name}"${contents}?`)) send({ type: 'remove', id: ws.id, folder: true });
  }

  // Dialog to create a workspace or sticky folder (ws = null) or change its
  // name, icon and type. The icon is an emoji (kept in the folder name) or an
  // image from a URL.
  function editWorkspace(ws, { sticky = false } = {}) {
    sticky = ws ? !!ws.sticky : sticky;
    // There must always be at least one workspace.
    const lastWorkspace = !!ws && !ws.sticky && workspaces.length < 2;
    const dialogTitle = h('div', { className: 'dialog-title' });
    const typeRow = h('div', { className: 'type-row' });
    const setType = (value) => {
      sticky = value;
      dialogTitle.textContent = `${ws ? 'Edit' : 'New'} ${sticky ? 'sticky folder' : 'workspace'}`;
      for (const input of typeRow.querySelectorAll('input')) input.checked = (input.value === 'sticky') === sticky;
    };
    for (const [value, text, hint] of [
      ['workspace', 'Workspace', 'Its favorites fill the bar when selected'],
      ['sticky', 'Sticky folder', 'A drop-down at the right, in every workspace'],
    ]) {
      const input = h('input', { type: 'radio', name: 'type', value, disabled: value === 'sticky' && lastWorkspace });
      input.addEventListener('change', () => setType(value === 'sticky'));
      const option = h('label', { className: 'type-option' }, input, h('span', {}, h('strong', { textContent: text }), h('small', { textContent: hint })));
      if (input.disabled) option.title = 'At least one workspace is needed';
      typeRow.append(option);
    }

    // Color: one of the swatches, a custom color, or none. Stored in a hidden
    // "Workspace color" favorite so it syncs.
    let color = ws?.color ?? '';
    const colorRow = h('div', { className: 'color-row' });
    const customColor = h('input', { type: 'color', className: 'color-input', value: color || COLORS[0] });
    const customSwatch = h('button', { type: 'button', className: 'swatch custom', title: 'Custom color…' });
    customSwatch.addEventListener('click', () => customColor.click());
    const pickColor = (value) => {
      color = value;
      for (const b of colorRow.querySelectorAll('.swatch')) b.classList.toggle('selected', b.value === value);
      const custom = !!value && !COLORS.includes(value);
      customSwatch.classList.toggle('selected', custom);
      customSwatch.style.background = custom ? value : '';
    };
    for (const value of ['', ...COLORS]) {
      const swatch = h('button', { type: 'button', className: `swatch${value ? '' : ' none'}`, value, title: value || 'No color' });
      if (value) swatch.style.background = value;
      swatch.addEventListener('click', () => pickColor(value));
      colorRow.append(swatch);
    }
    customColor.addEventListener('input', () => pickColor(customColor.value.toLowerCase()));
    colorRow.append(customSwatch, customColor);
    pickColor(color);
    const current = ws ? parseWorkspace(ws.title) : { emoji: '💼', name: '' };
    let chosen = current.emoji; // null while a URL icon is in use

    const nameInput = h('input', { type: 'text', className: 'field', value: current.name, placeholder: 'e.g. Work, Research, Travel' });
    const customInput = h('input', { type: 'text', className: 'field', placeholder: 'Any emoji', value: EMOJIS.includes(chosen) ? '' : chosen });
    const urlInput = h('input', { type: 'text', className: 'field', value: ws?.icon ?? '', placeholder: 'github.com or https://…/icon.png' });
    const preview = h('span', { className: 'url-preview' });
    const urlStatus = h('div', { className: 'url-status' });
    const grid = h('div', { className: 'emoji-grid' });

    const pick = (emoji) => {
      chosen = emoji;
      for (const b of grid.children) b.classList.toggle('selected', b.value === emoji);
    };

    // URL icons are downloaded by the service worker; iconCheck resolves to
    // { url, dataUrl } for the address in the field, or null if it has no icon.
    let iconCheck = null;
    let checkedText = null;
    let urlTimer;
    const clearUrl = () => {
      clearTimeout(urlTimer);
      urlInput.value = '';
      preview.replaceChildren();
      urlStatus.textContent = '';
      iconCheck = checkedText = null;
    };
    const pickEmoji = (emoji) => {
      clearUrl();
      pick(emoji);
    };
    async function checkUrl() {
      clearTimeout(urlTimer);
      checkedText = urlInput.value;
      preview.replaceChildren();
      if (!checkedText.trim()) {
        urlStatus.textContent = '';
        iconCheck = null;
        if (chosen === null) pick('');
        return;
      }
      pick(null);
      customInput.value = '';
      const url = normalizeUrl(checkedText);
      if (!url) {
        urlStatus.textContent = 'Enter a website or an image address.';
        iconCheck = Promise.resolve(null);
        return;
      }
      urlStatus.textContent = 'Looking for an icon…';
      const check = (iconCheck = send({ type: 'fetchIcon', url }).then((res) => (res?.result ? { url, dataUrl: res.result } : null)));
      const found = await check;
      if (check !== iconCheck) return; // the address changed meanwhile
      urlStatus.textContent = found ? 'This icon will be used.' : "Couldn't find an icon at that address.";
      if (found) preview.append(imageIcon(found.dataUrl, 24));
    }

    for (const emoji of ['', ...EMOJIS]) {
      const b = h('button', { type: 'button', className: 'emoji-choice', value: emoji, title: emoji || 'No icon' }, emoji || icon('workspace'));
      b.addEventListener('click', () => {
        customInput.value = '';
        pickEmoji(emoji);
      });
      grid.append(b);
    }
    customInput.addEventListener('input', () => {
      const emoji = firstGrapheme(customInput.value.trim());
      if (!emoji || isEmoji(emoji)) pickEmoji(emoji);
    });
    urlInput.addEventListener('input', () => {
      clearTimeout(urlTimer);
      urlTimer = setTimeout(checkUrl, 600);
    });
    if (ws?.icon) checkUrl();
    else pick(chosen);

    const cancelBtn = h('button', { type: 'button', className: 'btn', textContent: 'Cancel' });
    const saveBtn = h('button', { type: 'submit', className: 'btn primary', textContent: ws ? 'Save' : 'Create' });
    const form = h(
      'form',
      { className: 'dialog' },
      dialogTitle,
      h('div', { className: 'field-label', textContent: 'Name' }),
      nameInput,
      h('div', { className: 'field-label', textContent: 'Type' }),
      typeRow,
      h('div', { className: 'field-label', textContent: 'Color' }),
      colorRow,
      h('div', { className: 'field-label', textContent: 'Icon' }),
      grid,
      h('div', { className: 'custom-row' }, 'Or type any emoji:', customInput),
      h('div', { className: 'field-label', textContent: 'Or use the icon of a website or image' }),
      h('div', { className: 'url-row' }, urlInput, preview),
      urlStatus,
      h('div', { className: 'dialog-buttons' }, cancelBtn, saveBtn),
    );
    setType(sticky);
    const close = showDialog(form, () => clearTimeout(urlTimer));
    cancelBtn.addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return nameInput.focus();

      let iconUrl = null;
      if (urlInput.value.trim()) {
        if (urlInput.value !== checkedText) checkUrl();
        const found = await iconCheck;
        if (!found) return urlInput.focus();
        iconUrl = found.url;
      }
      const title = iconUrl || !chosen ? name : `${chosen} ${name}`;
      close();
      const res = await send({ type: 'saveWorkspace', id: ws?.id, parentId: tree?.id, title, iconUrl, color, sticky });
      if (!ws && !sticky && res?.result) selectWorkspace(res.result.id);
    });

    nameInput.focus();
    nameInput.select();
  }

  // --- Editing favorites -----------------------------------------------------

  // Shows `form` in a modal over the page and returns a function that closes
  // it. Menus left open underneath close along with it.
  function showDialog(form, onClose) {
    const overlay = h('div', { className: 'overlay' }, form);
    const close = () => {
      overlay.remove();
      closeMenus();
      onClose?.();
    };
    overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
    // Keep the page's own keyboard shortcuts from firing while typing here.
    for (const type of ['keydown', 'keyup', 'keypress']) {
      overlay.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'keydown' && e.key === 'Escape') close();
      });
    }
    root.append(overlay);
    return close;
  }

  // A collapsible folder tree to pick a destination. Only the folders on the
  // way to `selectedId` start expanded, and a folder's subfolders are only
  // rendered while it's expanded. `excludeId` (and what's inside it) is left
  // out. Arrow keys move the selection and expand/collapse, like a file tree.
  function folderPicker(roots, selectedId, excludeId) {
    let value = selectedId;
    let visible = []; // [{ node, parent }] in display order
    const subfolders = (node) => (node.children ?? []).filter((c) => !c.url && c.id !== excludeId);
    const pathTo = (nodes, id, path = []) => {
      for (const n of nodes) {
        if (n.url) continue;
        if (n.id === id) return path;
        const found = pathTo(n.children ?? [], id, [...path, n.id]);
        if (found) return found;
      }
      return null;
    };
    const expanded = new Set(pathTo(roots, selectedId) ?? []);
    const list = h('div', { className: 'picker', tabIndex: 0 });

    function rows(nodes, depth, parent) {
      return nodes.flatMap((node) => {
        const kids = subfolders(node);
        const open = expanded.has(node.id);
        const twisty = h('span', { className: 'twisty' }, ...(kids.length ? [icon(open ? 'down' : 'chevron')] : []));
        const lead = depth === 0 ? (node === others ? icon('library') : workspaceIcon(node, 16, 'folder')) : icon('folder');
        const row = h('div', { className: `picker-row${node.id === value ? ' selected' : ''}` }, twisty, lead, label(node.title || '(untitled)'));
        row.style.paddingLeft = `${2 + depth * 16}px`;
        twisty.addEventListener('click', (e) => {
          e.stopPropagation();
          toggle(node.id);
        });
        row.addEventListener('click', () => select(node));
        row.addEventListener('dblclick', () => toggle(node.id));
        visible.push({ node, parent });
        return [row, ...(open ? rows(kids, depth + 1, node) : [])];
      });
    }
    function draw() {
      visible = [];
      list.replaceChildren(...rows(roots.filter((n) => !n.url && n.id !== excludeId), 0, null));
      list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    }
    function toggle(id) {
      if (!expanded.delete(id)) expanded.add(id);
      draw();
    }
    function select(node) {
      value = node.id;
      draw();
    }

    list.addEventListener('keydown', (e) => {
      const i = visible.findIndex((v) => v.node.id === value);
      const current = visible[i];
      if (e.key === 'ArrowDown') select(visible[Math.min(i + 1, visible.length - 1)].node);
      else if (e.key === 'ArrowUp') select(visible[Math.max(i - 1, 0)].node);
      else if (e.key === 'ArrowRight' && current && subfolders(current.node).length) {
        if (expanded.has(current.node.id)) select(visible[i + 1].node);
        else toggle(current.node.id);
      } else if (e.key === 'ArrowLeft' && current) {
        if (expanded.has(current.node.id)) toggle(current.node.id);
        else if (current.parent) select(current.parent);
      } else return;
      e.preventDefault();
    });

    draw();
    return {
      el: list,
      get value() {
        return value;
      },
      // Scroll the selection into view once the picker is on the page.
      reveal: () => list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' }),
    };
  }

  // Dialog to edit a favorite (name, URL, folder) or a folder (name, folder).
  // `parent` is the folder it's in now.
  function editNode(node, parent) {
    const isFolder = !node.url;
    const nameInput = h('input', { type: 'text', className: 'field', value: node.title });
    const urlInput = h('input', { type: 'text', className: 'field', value: node.url ?? '', spellcheck: false });
    const status = h('div', { className: 'url-status' });
    // Workspaces, sticky folders, Pinned and Other favorites. A folder can't go inside itself.
    const picker = folderPicker([...(tree?.children ?? []), ...(others ? [others] : [])], parent.id, isFolder ? node.id : null);

    const cancelBtn = h('button', { type: 'button', className: 'btn', textContent: 'Cancel' });
    const saveBtn = h('button', { type: 'submit', className: 'btn primary', textContent: 'Save' });
    const form = h(
      'form',
      { className: 'dialog' },
      h('div', { className: 'dialog-title', textContent: isFolder ? 'Edit folder' : 'Edit favorite' }),
      h('div', { className: 'field-label', textContent: 'Name' }),
      nameInput,
      ...(isFolder ? [] : [h('div', { className: 'field-label', textContent: 'URL' }), urlInput]),
      h('div', { className: 'field-label', textContent: isFolder ? 'Location' : 'Folder' }),
      picker.el,
      status,
      h('div', { className: 'dialog-buttons' }, cancelBtn, saveBtn),
    );
    const close = showDialog(form);
    cancelBtn.addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = isFolder ? undefined : parseUrl(urlInput.value);
      if (url === null) {
        status.textContent = 'Enter a valid address.';
        return urlInput.focus();
      }
      saveBtn.disabled = true;
      const res = await send({
        type: 'edit',
        id: node.id,
        title: nameInput.value.trim(),
        url,
        parentId: picker.value !== parent.id ? picker.value : undefined,
      });
      if (res?.error) {
        saveBtn.disabled = false;
        status.textContent = `Couldn't save: ${res.error.replace(/^Error:\s*/, '')}`;
        return;
      }
      close();
    });

    picker.reveal();
    nameInput.focus();
    nameInput.select();
  }

  // --- Quick switcher and search ---------------------------------------------
  // Alt+A (Option+A on a Mac) opens a palette in the middle of the screen. With
  // nothing typed it lists the workspaces; typing searches workspace names and
  // every favorite (workspaces, sticky folders, pins and Other favorites).
  // Enter opens a favorite, switching to its tab if one is already open.

  let switcher = null; // { move } while open

  // How well `text` matches `query` (lowercase); 0 = not at all. A substring
  // beats scattered letters (only allowed when `loose`), and early or
  // word-start matches rank higher.
  function matchScore(text, query, loose = true) {
    const t = (text || '').toLowerCase();
    const i = t.indexOf(query);
    if (i >= 0) return 100 - Math.min(i, 50) + (i === 0 || /[^\p{L}\p{N}]/u.test(t[i - 1]) ? 50 : 0);
    if (!loose) return 0;
    let j = 0;
    for (const c of t) if (c === query[j] && ++j === query.length) return 10;
    return 0;
  }

  // Best matches first: { kind: 'workspace' | 'favorite', node, path? }.
  // --- Tidy tabs -------------------------------------------------------------
  // Lists this window's tabs in two groups: bookmarked ones (any Edge favorite)
  // and the rest. Every tab starts checked to close, except this tab, tabs
  // pinned in Edge and pins, which are usually kept open on purpose. Each
  // unbookmarked tab also has an Add toggle to save it to the current
  // workspace, whether or not it's closed.

  let tidying = false;

  async function openTidy() {
    if (tidying) return;
    tidying = true;
    const res = await send({ type: 'tidyTabs' }).finally(() => (tidying = false));
    const tabs = res?.result;
    if (!Array.isArray(tabs)) return closeMenus();

    const applyBtn = h('button', { type: 'submit', className: 'btn primary' });
    const cancelBtn = h('button', { type: 'button', className: 'btn', textContent: 'Cancel' });
    const status = h('div', { className: 'url-status' });
    const checked = (rows) => rows.filter((r) => r.box.checked);
    const target = workspace ? parseWorkspace(workspace.title) : null;
    const targetName = target ? `${target.emoji ? `${target.emoji} ` : ''}${target.name || '(untitled)'}` : '';

    const row = (tab, isChecked, meta, addable) => {
      const box = h('input', { type: 'checkbox', checked: isChecked, title: 'Close this tab' });
      const el = h(
        'label',
        { className: 'tidy-row', title: tab.url || tab.title },
        box,
        favicon(tab.url),
        h('span', { className: 'tidy-name', textContent: tab.title }),
        h('span', { className: 'tidy-meta', textContent: meta }),
      );
      const r = { tab, box, el, add: null }; // add: the folder to add it to
      if (addable && workspace) {
        const addBtn = h('button', { type: 'button', className: 'tidy-add', title: `Add to ${targetName}…` });
        const show = () => {
          addBtn.replaceChildren(icon('add'), label(r.add ? (r.add === workspace ? target.name : r.add.title) || '(untitled)' : 'Add'));
          addBtn.setAttribute('aria-pressed', String(!!r.add));
        };
        show();
        addBtn.addEventListener('click', (e) => {
          e.preventDefault(); // don't toggle the row's checkbox
          pickFolder(addBtn, r.add, (folder) => {
            r.add = folder;
            show();
            update();
          });
        });
        el.append(addBtn);
      }
      return r;
    };

    // The Add menu: the workspace itself (a favorite on the bar) or one of its
    // top-level folders, plus "Don't add" once something is chosen.
    let picker = null;
    const closePicker = () => {
      picker?.remove();
      picker = null;
    };
    function pickFolder(anchor, current, onPick) {
      const reopen = picker?.anchor !== anchor;
      closePicker();
      if (!reopen) return;
      const choice = (folder, lead, text) => {
        const b = h('button', { type: 'button', className: folder === null ? 'muted' : folder === current ? 'chosen' : '' }, lead, label(text));
        b.addEventListener('click', () => {
          closePicker();
          onPick(folder);
        });
        return b;
      };
      const folders = (workspace.children ?? []).filter((c) => !c.url);
      picker = h(
        'div',
        { className: 'tidy-picker', anchor },
        choice(workspace, workspaceIcon(workspace, 16), `${target.name || '(untitled)'}`),
        ...(folders.length ? [h('div', { className: 'sep' })] : []),
        ...folders.map((f) => choice(f, icon('folder'), f.title || '(untitled)')),
        ...(current ? [h('div', { className: 'sep' }), choice(null, h('span', { className: 'ico' }), "Don't add")] : []),
      );
      form.parentNode.append(picker);
      // Below the button, right-aligned with it; above it if there's no room.
      const a = anchor.getBoundingClientRect();
      const p = picker.getBoundingClientRect();
      picker.style.left = toCss(Math.max(8, a.right - p.width));
      picker.style.top = toCss(a.bottom + 4 + p.height > innerHeight - 8 ? Math.max(8, a.top - 4 - p.height) : a.bottom + 4);
      (picker.querySelector('.chosen') ?? picker.querySelector('button'))?.focus();
      picker.addEventListener('keydown', (e) => {
        const buttons = [...picker.querySelectorAll('button')];
        const i = buttons.indexOf(e.target);
        if (e.key === 'Escape') {
          e.stopPropagation(); // close only this menu, not the dialog
          closePicker();
          anchor.focus();
        } else if (e.key === 'ArrowDown') buttons[(i + 1) % buttons.length].focus();
        else if (e.key === 'ArrowUp') buttons[(i - 1 + buttons.length) % buttons.length].focus();
        else return;
        e.preventDefault();
      });
    }

    const keep = (tab) => (tab.active ? 'this tab' : tab.pinnedTab ? 'pinned tab' : tab.pin ? 'pin' : '');
    const closeRows = tabs
      .filter((tab) => tab.favorite)
      .map((tab) => row(tab, !keep(tab), keep(tab) || tab.favorite.slice(-2).join(' › ') || parseWorkspace(tree?.title ?? '').name));
    const addRows = tabs.filter((tab) => !tab.favorite).map((tab) => row(tab, !keep(tab), keep(tab) || (tab.blank ? 'empty' : ''), !tab.blank));

    function update() {
      const adding = addRows.filter((r) => r.add).length;
      const closing = checked(closeRows).length + checked(addRows).length;
      const parts = [closing && `Close ${closing} tab${closing === 1 ? '' : 's'}`, adding && `Add ${adding}`].filter(Boolean);
      applyBtn.textContent = parts.join(' · ') || 'Nothing selected';
      applyBtn.disabled = !parts.length;
    }

    function group(title, rows, empty) {
      const all = h('input', { type: 'checkbox', disabled: !rows.length || rows.every((r) => r.box.disabled) });
      const count = h('span', { className: 'tidy-count' });
      const sync = () => {
        const n = checked(rows).length;
        all.checked = n > 0 && n === rows.length;
        all.indeterminate = n > 0 && n < rows.length;
        count.textContent = rows.length ? `${n} of ${rows.length}` : '';
        update();
      };
      all.addEventListener('change', () => {
        for (const r of rows) r.box.checked = all.checked;
        sync();
      });
      for (const r of rows) r.box.addEventListener('change', sync);
      const list = rows.length ? h('div', { className: 'tidy-list' }, ...rows.map((r) => r.el)) : h('div', { className: 'tidy-empty', textContent: empty });
      return { el: [h('label', { className: 'tidy-head' }, all, h('span', { textContent: title }), count), list], sync };
    }

    const closeGroup = group('Bookmarked', closeRows, 'No tab in this window is a favorite.');
    const addGroup = group('Not bookmarked', addRows, 'Every tab in this window is already a favorite.');

    const form = h(
      'form',
      { className: 'dialog tidy' },
      h('div', { className: 'dialog-title', textContent: 'Tidy tabs' }),
      h('div', {
        className: 'tidy-intro',
        textContent: workspace
          ? `Checked tabs close. Use Add to keep a tab as a favorite in ${targetName} or one of its folders.`
          : 'Checked tabs close. Create a workspace to also save tabs as favorites here.',
      }),
      ...closeGroup.el,
      ...addGroup.el,
      status,
      h('div', { className: 'dialog-buttons' }, cancelBtn, applyBtn),
    );
    closeGroup.sync();
    addGroup.sync();

    const close = showDialog(form);
    cancelBtn.addEventListener('click', close);
    // A click anywhere else closes the Add menu.
    form.parentNode.addEventListener('mousedown', (e) => picker && !picker.contains(e.target) && !e.target.closest?.('.tidy-add') && closePicker());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const add = addRows.filter((r) => r.add).map((r) => ({ ...r.tab, parentId: r.add.id }));
      const closing = [...checked(closeRows), ...checked(addRows)].map((r) => r.tab);
      applyBtn.disabled = true;
      const result = await send({
        type: 'tidyApply',
        close: closing.map((tab) => tab.id),
        add: add.map(({ title, url, parentId }) => ({ title, url, parentId })),
      });
      if (!result || result.error) {
        applyBtn.disabled = false;
        status.textContent = `Couldn't finish: ${(result?.error ?? 'no answer').replace(/^Error:\s*/, '')}`;
        return;
      }
      close();
    });
    applyBtn.focus();
  }

  function search(text) {
    const query = text.toLowerCase();
    const results = [];
    for (const ws of workspaces) {
      const score = matchScore(parseWorkspace(ws.title).name, query);
      if (score) results.push({ kind: 'workspace', node: ws, score: score + 25 });
    }
    const walk = (folder, path) => {
      for (const node of folder.children ?? []) {
        if (!node.url) {
          walk(node, [...path, node.title]);
        } else if (!isSeparator(node)) {
          const host = node.url.replace(/^[a-z]+:\/\/(www\.)?/i, '');
          const score = Math.max(matchScore(node.title, query) * 2, matchScore(host, query, false));
          if (score) results.push({ kind: 'favorite', node, path, score });
        }
      }
    };
    for (const top of tree?.children ?? []) if (!top.url) walk(top, [top.title]);
    if (others) walk(others, [others.title || OTHERS_NAME]);
    return results.sort((a, b) => b.score - a.score).slice(0, 50);
  }

  function openSwitcher() {
    if (switcher) return switcher.move(1);
    closeMenus();

    const alt = IS_MAC ? '⌥' : 'Alt+';
    const mod = IS_MAC ? '⌘' : 'Ctrl+';
    const input = h('input', { type: 'text', className: 'field search', placeholder: 'Search favorites or switch workspace…', spellcheck: false });
    const list = h('div', { className: 'rows' });
    const help = h('div', { className: 'switcher-help' });
    const panel = h('div', { className: 'switcher' }, input, list, help);
    const zoom = Number(settings.switcherZoom);
    if (zoom >= 0.5 && zoom <= 2) panel.style.setProperty('--zoom', zoom);
    const overlay = h('div', { className: 'overlay' }, panel);
    let entries = []; // { kind: 'workspace' | 'favorite' | 'create', node?, path? }
    let rows = [];
    let selected = 0;

    function renderEntry(entry, i, showKeys) {
      let row;
      if (entry.kind === 'workspace') {
        const ws = entry.node;
        const { name } = parseWorkspace(ws.title);
        const count = urlsIn(ws).length;
        const meta = ws === workspace ? 'Current' : `${count} favorite${count === 1 ? '' : 's'}`;
        row = h(
          'button',
          { type: 'button', className: 'row' },
          workspaceIcon(ws, 28),
          h('span', { className: 'row-name', textContent: name || '(untitled)' }),
          h('span', { className: 'row-meta', textContent: meta }),
        );
        if (ws.color) row.style.boxShadow = `inset 3px 0 0 ${ws.color}`;
        if (showKeys && i < 9) row.append(h('span', { className: 'row-key', textContent: `${alt}${i + 1}` }));
      } else if (entry.kind === 'favorite') {
        const { node } = entry;
        row = h(
          'button',
          { type: 'button', className: 'row', title: node.url },
          favicon(node.url),
          h('span', { className: 'row-name', textContent: node.title || node.url }),
          h('span', { className: 'row-meta row-path', textContent: entry.path.join(' › ') }),
        );
      } else if (entry.kind === 'tidy') {
        row = h('button', { type: 'button', className: 'row create' }, icon('tidy'), h('span', { className: 'row-name', textContent: 'Tidy tabs…' }));
      } else {
        row = h('button', { type: 'button', className: 'row create' }, icon('add'), h('span', { className: 'row-name', textContent: 'New workspace…' }));
      }
      row.addEventListener('click', (e) => choose(i, e));
      row.addEventListener('mousemove', () => select(i));
      return row;
    }

    function build() {
      const query = input.value.trim();
      entries = query
        ? [...search(query), ...('tidy tabs'.includes(query.toLowerCase()) ? [{ kind: 'tidy' }] : [])]
        : [...workspaces.map((node) => ({ kind: 'workspace', node })), { kind: 'create' }, { kind: 'tidy' }];
      rows = entries.map((entry, i) => renderEntry(entry, i, !query));
      if (!rows.length) list.replaceChildren(h('div', { className: 'hint', textContent: 'No matches' }));
      else if (query) list.replaceChildren(...rows);
      else list.replaceChildren(...rows.slice(0, -2), h('div', { className: 'sep' }), ...rows.slice(-2));
      help.textContent = query
        ? `↑↓ choose · Enter open (switches to its tab if it's open) · ${mod}Enter new tab · Esc close`
        : `↑↓ choose · Enter switch · ${alt}1–9 jump · type to search · Esc close`;
      if (rows.length) select(query ? 0 : Math.max(0, workspaces.indexOf(workspace)));
    }

    function select(i) {
      selected = i;
      rows.forEach((r, j) => r.classList.toggle('selected', j === i));
      rows[i]?.scrollIntoView({ block: 'nearest' });
    }
    function move(delta) {
      if (rows.length) select((selected + delta + rows.length) % rows.length);
    }
    function close() {
      overlay.remove();
      removeEventListener('blur', close);
      switcher = null;
    }
    // Shift opens a favorite in a new window, Ctrl/Cmd in a new tab.
    function choose(i, e = {}) {
      const entry = entries[i];
      if (!entry) return;
      close();
      if (entry.kind === 'workspace') return selectWorkspace(entry.node.id);
      if (entry.kind === 'create') return editWorkspace(null);
      if (entry.kind === 'tidy') return openTidy();
      const { url } = entry.node;
      if (url.startsWith('javascript:')) return;
      if (e.shiftKey) send({ type: 'open', urls: [url], where: 'window' });
      else if (e.ctrlKey || e.metaKey) send({ type: 'open', urls: [url] });
      else send({ type: 'focusOrOpen', url });
    }

    overlay.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) move(-1);
      else if (e.key === 'ArrowDown' || e.key === 'Tab') move(1);
      else if (e.key === 'Enter') choose(selected, e);
      else if (e.key === 'Escape') close();
      else if (e.altKey && e.code === 'KeyA') move(1);
      else if (e.altKey && /^Digit[1-9]$/.test(e.code) && !input.value.trim()) {
        const n = Number(e.code.slice(5));
        if (n <= workspaces.length) choose(n - 1);
      } else return;
      e.preventDefault();
    });
    for (const type of ['keyup', 'keypress']) overlay.addEventListener(type, (e) => e.stopPropagation());
    input.addEventListener('input', build);
    overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
    addEventListener('blur', close);

    root.append(overlay);
    build();
    input.focus();
    switcher = { move };
    // Search covers Other favorites too; rebuild once its tree is read.
    if (!othersRead) loadOthers().then(() => switcher && input.value.trim() && build());
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'openSwitcher') openSwitcher();
    if (msg.type === 'openTidy') openTidy();
    if (msg.type === 'zoom') applyZoom(msg.factor);
  });

  // --- Drag and drop ---------------------------------------------------------
  // Favorites can be reordered, moved into folders (hovering a folder opens it)
  // or into other workspaces (via the workspace menu), and links can be dragged
  // in from the page. Workspaces can be reordered inside the workspace menu.

  let dragged = null; // node dragged from the bar; null for links dragged in from outside
  let dropTarget = null; // { el, cls, parentId, index }
  let springEl = null;
  let springTimer = null;

  const containsNode = (folder, id) => folder.id === id || (folder.children ?? []).some((c) => containsNode(c, id));

  // A folder can't be moved into itself or one of its own subfolders.
  const canDropInto = (folderId) => !(dragged && !dragged.url && containsNode(dragged, folderId));

  function targetForItem(el, e) {
    const r = el.getBoundingClientRect();
    const pos = el.depth > 0 ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    const into = { el, cls: 'drop-into', parentId: el.node.id };
    const beside = () => {
      const after = pos >= 0.5;
      return { el, cls: after ? 'drop-after' : 'drop-before', parentId: el.parent.id, index: el.index + (after ? 1 : 0) };
    };

    // Workspaces only sit next to each other; favorites only go inside them.
    if (isWorkspace(dragged)) return el.isWorkspace ? beside() : null;
    if (el.isWorkspace || el.isOthers || el.isSticky) return canDropInto(el.node.id) ? into : null;
    if (el.isPin && dragged && !dragged.url) return null; // pins are favorites only

    if (!el.node.url && pos > 0.25 && pos < 0.75) return canDropInto(el.node.id) ? into : null;
    return canDropInto(el.parent.id) ? beside() : null;
  }

  // Dropping on empty space in the bar or a menu appends to that folder.
  function targetForContainer(container) {
    const folder = container === items ? workspace : container === pins ? pinned : container?.folder;
    if (folder && folder === pinned && dragged && !dragged.url) return null;
    if (!folder || isWorkspace(dragged) || !canDropInto(folder.id)) return null;
    const last = [...container.children].reverse().find((c) => c.node && !c.hidden);
    return { el: last ?? container, cls: last ? 'drop-after' : 'drop-into', parentId: folder.id };
  }

  function setDropTarget(target) {
    if (dropTarget?.el !== target?.el || dropTarget?.cls !== target?.cls) {
      dropTarget?.el.classList.remove(dropTarget.cls);
      target?.el.classList.add(target.cls);
    }
    dropTarget = target;
  }

  function springLoad(el) {
    if (el === springEl) return;
    clearTimeout(springTimer);
    springEl = el;
    if (!el) return;
    springTimer = setTimeout(() => {
      if (el === selector) openWorkspaceMenu();
      else if (el === overflowBtn) openMenu(workspace, overflowBtn, 0, overflowStart);
      else openMenu(el.node, el, el.depth);
    }, SPRING_DELAY);
  }

  function endDrag() {
    dragged = null;
    setDropTarget(null);
    springLoad(null);
  }

  const decodeHtml = (html) =>
    html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

  // Links dragged in from outside, as [{ url, title }]. Chromium lists the
  // addresses in text/uri-list and, for links dragged from a page, supplies the
  // titles as HTML links. A folder dragged from the browser's favorites bar
  // brings only addresses; the background fills in the rest (addDropped).
  function draggedLinks(dt) {
    const urls = dt.getData('text/uri-list').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
    const html = dt.getData('text/html');
    const anchors = [...html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
      href: decodeHtml(m[1] ?? m[2]),
      title: decodeHtml(m[3]),
    }));
    return urls.map((url, i) => {
      const anchor = anchors.find((a) => a.href === url) ?? (anchors.length === urls.length ? anchors[i] : null);
      const title = anchor?.title || (urls.length === 1 ? decodeHtml(html) : '');
      return { url, title: title || url };
    });
  }

  root.addEventListener('dragstart', (e) => {
    const el = e.target.closest?.('.item');
    if (!el?.node) return;
    dragged = el.node;
    e.dataTransfer.effectAllowed = 'copyMove';
    if (dragged.url && !isSeparator(dragged)) {
      e.dataTransfer.setData('text/uri-list', dragged.url);
      e.dataTransfer.setData('text/plain', dragged.url);
    } else {
      e.dataTransfer.setData('text/plain', dragged.title);
    }
  });

  root.addEventListener('dragover', (e) => {
    if (!dragged && !e.dataTransfer.types.includes('text/uri-list')) return;
    const el = e.target.closest?.('.item');
    const target = el?.node ? targetForItem(el, e) : targetForContainer(e.target.closest?.('.items, .pins, .menu'));
    setDropTarget(target);
    const springy = el === selector || el === overflowBtn || (target?.cls === 'drop-into' && target.el.node && !target.el.isWorkspace);
    springLoad(springy ? (el === selector || el === overflowBtn ? el : target.el) : null);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragged ? 'move' : 'copy';
  });

  root.addEventListener('drop', (e) => {
    const target = dropTarget;
    const node = dragged;
    endDrag();
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    const { parentId, index } = target;
    if (node) {
      send({ type: 'move', id: node.id, parentId, index });
      return;
    }
    const links = draggedLinks(e.dataTransfer);
    if (links.length) send({ type: 'addDropped', links, parentId, index });
  });

  root.addEventListener('dragend', endDrag);

  // Dragging off the bar onto the page clears the drop indicator.
  document.addEventListener('dragover', (e) => {
    if (!e.composedPath().includes(host)) {
      setDropTarget(null);
      springLoad(null);
    }
  });

  // --- Events ----------------------------------------------------------------

  selector.addEventListener('click', () => (menus[0]?.owner === selector ? closeMenus() : openWorkspaceMenu()));
  selector.addEventListener('mouseenter', () => switchMenuTo(selector, openWorkspaceMenu));
  selector.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openWorkspaceMenu();
  });
  overflowBtn.addEventListener('click', () =>
    menus[0]?.owner === overflowBtn ? closeMenus() : openMenu(workspace, overflowBtn, 0, overflowStart),
  );
  tidyBtn.addEventListener('click', () => openTidy());
  addBtn.addEventListener('click', () => addCurrentPage());
  const openOthers = () => loadOthers().then(() => others && openMenu(others, othersBtn, 0));
  othersBtn.addEventListener('click', () => (menus[0]?.owner === othersBtn ? closeMenus() : openOthers()));
  othersBtn.addEventListener('mouseenter', () => switchMenuTo(othersBtn, openOthers));
  // Read the tree ahead of the first use that needs it.
  bar.addEventListener('pointerenter', () => loadOthers().then(() => (othersBtn.node = others ?? othersBtn.node)));
  bar.addEventListener('dragenter', () => loadOthers().then(() => (othersBtn.node = others ?? othersBtn.node)));
  othersBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(othersBtn, e.clientX, e.clientY);
  });
  bar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openContextMenu(null, e.clientX, e.clientY);
  });

  document.addEventListener('mousedown', (e) => {
    if (menus.length && !e.composedPath().includes(host)) closeMenus();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menus.length) closeMenus();
    // Fallback for when Edge didn't assign the Alt+A extension shortcut (it
    // skips shortcuts that clash with others). e.code, because Option+A types "å".
    if (e.altKey && e.code === 'KeyA' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !switcher) {
      e.preventDefault();
      e.stopPropagation();
      openSwitcher();
    }
  }, true);
  document.addEventListener('fullscreenchange', render);
  addEventListener('blur', () => closeMenus());
  addEventListener('resize', () => {
    closeMenus();
    layoutOverflow();
  });

  // Tabs in the background don't redraw: they note what changed and catch up
  // when shown, so a change costs one redraw instead of one per open tab.
  let stale = null; // null, 'pins' or 'all'
  const IGNORED = ['folderId', 'others']; // read by the service worker / lazily
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('others' in changes && othersRead) {
      others = changes.others.newValue ?? null;
      othersRead = Promise.resolve(others);
    }
    const keys = Object.keys(changes).filter((key) => !IGNORED.includes(key));
    if (!keys.length) return;
    // Pin status changes often (tab titles), so update just the pins: redrawing
    // the bar would also close any open menu.
    if (keys.every((key) => key === 'pinStatus')) {
      settings.pinStatus = changes.pinStatus.newValue;
      if (document.hidden) stale ??= 'pins';
      else updatePinStatus();
    } else if (document.hidden) {
      stale = 'all';
    } else {
      load();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !stale) return;
    const was = stale;
    stale = null;
    was === 'all' ? load() : updatePinStatus();
  });

  load();
  send({ type: 'getZoom' }).then((res) => applyZoom(res?.result));
})();
