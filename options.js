// Shown as the toolbar popup (options.html#popup), in a window over the page
// opened from the bar (options.html#dialog), or as a full page.
const mode = location.hash.slice(1);
if (mode === 'popup' || mode === 'dialog') document.documentElement.classList.add(mode);

const TYPOGRAPHY = { fontFamily: '', fontSize: '12', fontWeight: '400', fontStretch: 'normal', letterSpacing: 'normal', textCase: 'normal' };
const DEFAULTS = {
  enabled: true, position: 'top', pushContent: true, showTitles: true,
  showOpenDots: true, showUnreadDots: true, showUnreadCounts: true, tuckPins: false, switcherZoom: '1', ...TYPOGRAPHY,
};
const status = document.getElementById('status');

function showSaved() {
  status.textContent = 'Saved';
  setTimeout(() => (status.textContent = ''), 1500);
}

// A folder tree for choosing the Superfavorites folder. A folder's subfolders
// are only read from the favorites when it's expanded (plus one level ahead,
// to know which folders can be expanded). The folders on the way to the
// current choice start expanded. Arrow keys move and expand/collapse.
async function folderPicker(list, selectedId, onPick) {
  const cache = new Map(); // folder id -> its subfolders, once read
  const subfolders = async (id) => {
    if (!cache.has(id)) cache.set(id, (await chrome.bookmarks.getChildren(id)).filter((c) => !c.url));
    return cache.get(id);
  };

  const expanded = new Set();
  for (let id = selectedId; id; ) {
    const [node] = await chrome.bookmarks.get(id).catch(() => []);
    if (!node?.parentId || node.parentId === '0') break;
    expanded.add(node.parentId);
    id = node.parentId;
  }

  let value = selectedId;
  let visible = []; // [{ folder, parent, hasKids }] in display order

  async function rows(parentId, depth, parent) {
    const out = [];
    for (const folder of await subfolders(parentId)) {
      const hasKids = (await subfolders(folder.id)).length > 0;
      const open = expanded.has(folder.id);
      const twisty = Object.assign(document.createElement('span'), { className: 'twisty', textContent: hasKids ? (open ? '▾' : '▸') : '' });
      const name = Object.assign(document.createElement('span'), { className: 'name', textContent: folder.title || '(untitled)' });
      const row = Object.assign(document.createElement('div'), { className: `picker-row${folder.id === value ? ' selected' : ''}` });
      row.style.paddingLeft = `${2 + depth * 18}px`;
      row.append(twisty, name);
      twisty.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle(folder.id);
      });
      row.addEventListener('click', () => select(folder));
      row.addEventListener('dblclick', () => toggle(folder.id));
      visible.push({ folder, parent, hasKids });
      out.push(row);
      if (open) out.push(...(await rows(folder.id, depth + 1, folder)));
    }
    return out;
  }

  async function draw() {
    visible = [];
    list.replaceChildren(...(await rows('0', 0, null)));
    list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  async function toggle(id) {
    if (!expanded.delete(id)) expanded.add(id);
    await draw();
  }

  async function select(folder) {
    value = folder.id;
    await draw();
    onPick(folder.id);
  }

  list.addEventListener('keydown', (e) => {
    const i = visible.findIndex((v) => v.folder.id === value);
    const current = visible[i];
    if (e.key === 'ArrowDown') select(visible[Math.min(i + 1, visible.length - 1)].folder);
    else if (e.key === 'ArrowUp') select(visible[Math.max(i - 1, 0)].folder);
    else if (e.key === 'ArrowRight' && current?.hasKids) {
      if (expanded.has(value)) select(visible[i + 1].folder);
      else toggle(value);
    } else if (e.key === 'ArrowLeft' && current) {
      if (expanded.has(value)) toggle(value);
      else if (current.parent) select(current.parent);
    } else return;
    e.preventDefault();
  });

  await draw();
}

// Icon theme cards, each previewing the theme's icons. The choice is kept on
// this device only (chrome.storage.local), unlike the favorites themselves.
async function iconThemePicker(container) {
  const { THEMES, DEFAULT, render } = globalThis.superfavoritesIcons;
  let { iconTheme: current = DEFAULT } = await chrome.storage.local.get('iconTheme');
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;

  const draw = () =>
    container.replaceChildren(
      ...Object.entries(THEMES).map(([id, theme]) => {
        const card = Object.assign(document.createElement('button'), { type: 'button', className: `theme${id === current ? ' selected' : ''}` });
        const preview = Object.assign(document.createElement('span'), { className: 'theme-icons' });
        for (const name of ['folder', 'library', 'workspace', 'add', 'more', 'down', 'chevron', 'check']) {
          const svg = render(id, name);
          if (name === 'folder') svg.style.color = theme.folder[dark ? 1 : 0];
          preview.append(svg);
        }
        card.append(
          preview,
          Object.assign(document.createElement('span'), { className: 'theme-name', textContent: theme.name }),
          Object.assign(document.createElement('small'), { textContent: theme.description }),
        );
        card.addEventListener('click', async () => {
          current = id;
          draw();
          await chrome.storage.local.set({ iconTheme: id });
          updatePreview();
          showSaved();
        });
        return card;
      }),
    );
  draw();
}

// Installed fonts for the Font menu. Families are listed once, so a font's
// condensed styles show up as its own family only where the system names it so.
async function fillFonts(select) {
  const fonts = await chrome.fontSettings?.getFontList().catch(() => []) ?? [];
  const seen = new Set();
  for (const { fontId, displayName } of fonts) {
    if (seen.has(fontId)) continue;
    seen.add(fontId);
    select.append(Object.assign(document.createElement('option'), { value: fontId, textContent: displayName || fontId }));
  }
}

// A strip that looks like the bar, drawn with the chosen typography.
function updatePreview() {
  const preview = document.getElementById('preview');
  const value = (id) => document.getElementById(id).value;
  const { DEFAULT, render } = globalThis.superfavoritesIcons;
  chrome.storage.local.get({ iconTheme: DEFAULT }).then(({ iconTheme }) => {
    const item = (text, iconName, strong) => {
      const span = Object.assign(document.createElement('span'), { className: strong ? 'strong' : '' });
      if (iconName) span.append(render(iconTheme, iconName));
      span.append(Object.assign(document.createElement('b'), { textContent: text }));
      span.lastChild.style.fontWeight = strong ? (Number(value('fontWeight')) >= 600 ? 800 : 600) : 'inherit';
      return span;
    };
    preview.replaceChildren(item('Work', 'workspace', true), item('Sprint board'), item('Team wiki'), item('Docs', 'folder'), item('Metrics'));
  });
  const family = value('fontFamily').replace(/["\\;{}<>]/g, '');
  Object.assign(preview.style, {
    fontFamily: family ? `"${family}", "Segoe UI", system-ui, sans-serif` : '"Segoe UI", system-ui, -apple-system, sans-serif',
    fontSize: `${value('fontSize')}px`,
    fontWeight: value('fontWeight'),
    fontStretch: { 'extra-condensed': '62.5%', condensed: '75%', 'semi-condensed': '87.5%', 'semi-expanded': '112.5%', expanded: '125%' }[value('fontStretch')] ?? 'normal',
    letterSpacing: { tight: '-0.02em', wide: '0.03em', wider: '0.06em' }[value('letterSpacing')] ?? 'normal',
    textTransform: value('textCase') === 'upper' ? 'uppercase' : 'none',
    fontVariantCaps: value('textCase') === 'small-caps' ? 'all-small-caps' : 'normal',
  });
  document.getElementById('fontSizeValue').textContent = `${value('fontSize')} px`;
}

// The chosen folder's path, e.g. "Other favorites › Superfavorites".
async function showFolderPath(folderId) {
  const names = [];
  for (let id = folderId; id && id !== '0'; ) {
    const [node] = await chrome.bookmarks.get(id).catch(() => []);
    if (!node) break;
    names.unshift(node.title || '(untitled)');
    id = node.parentId;
  }
  const path = document.getElementById('folderPath');
  const last = Object.assign(document.createElement('b'), { textContent: names.pop() ?? '(none)' });
  path.replaceChildren(...names.map((n) => `${n} › `), last);
  path.title = [...names, last.textContent].join(' › ');
}

// "Change…" opens the folder tree in its own dialog, so the settings stay
// compact. The tree is rebuilt on each open, starting at the current folder.
async function folderChooser(folderId) {
  const dialog = document.getElementById('folderDialog');
  let picked = folderId;
  await showFolderPath(folderId);

  document.getElementById('changeFolder').addEventListener('click', async () => {
    picked = folderId;
    const old = document.getElementById('folderPicker');
    const list = Object.assign(old.cloneNode(false), { id: 'folderPicker' }); // drops old listeners
    old.replaceWith(list);
    list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        dialog.close('choose');
      }
    });
    await folderPicker(list, folderId, (id) => (picked = id));
    dialog.returnValue = ''; // Esc keeps the last value; don't let it count as Choose
    dialog.showModal();
    list.focus();
  });

  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'choose' || picked === folderId) return;
    folderId = picked;
    await chrome.storage.local.set({ folderId });
    await showFolderPath(folderId);
    showSaved();
  });
}

// Browser pages open under edge:// in Edge and chrome:// in Chrome.
const BROWSER = /\bEdg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
const FAVORITES_PAGE = BROWSER === 'edge' ? 'edge://favorites/' : 'chrome://bookmarks/';

// The extension's commands and the keys the browser has assigned them. Read again
// when the page regains focus, e.g. after changing them at
// edge://extensions/shortcuts or chrome://extensions/shortcuts.
async function showShortcuts() {
  const container = document.getElementById('shortcuts');
  const commands = (await chrome.commands?.getAll().catch(() => [])) ?? [];
  container.replaceChildren(
    ...commands
      .filter((c) => c.description)
      .map((c) => {
        const row = Object.assign(document.createElement('div'), { className: 'row' });
        const key = c.shortcut
          ? Object.assign(document.createElement('kbd'), { textContent: c.shortcut })
          : Object.assign(document.createElement('span'), { className: 'shortcut-none', textContent: 'Not set' });
        row.append(Object.assign(document.createElement('span'), { textContent: c.description }), key);
        return row;
      }),
  );
  const toggle = commands.find((c) => c.name === 'toggle-bar');
  document.getElementById('toggleShortcut').textContent = toggle?.shortcut
    ? `You can also press ${toggle.shortcut}.`
    : 'Tip: set a shortcut below.';
}

async function init() {
  const closeDialog = () => parent.postMessage({ type: 'superfavorites:close-settings' }, '*');
  if (mode === 'dialog') {
    document.getElementById('done').addEventListener('click', closeDialog);
    // Esc closes the folder chooser first, if it's open.
    addEventListener('keydown', (e) => e.key === 'Escape' && !document.getElementById('folderDialog').open && closeDialog());
  }
  await fillFonts(document.getElementById('fontFamily'));

  await showShortcuts();
  addEventListener('focus', showShortcuts);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && showShortcuts());
  document.getElementById('changeShortcuts').addEventListener('click', () => chrome.tabs.create({ url: `${BROWSER}://extensions/shortcuts` }));

  // The service worker creates the default folder on install; wait for it if needed.
  let { folderId } = await chrome.storage.local.get('folderId');
  if (!folderId) {
    await chrome.runtime.sendMessage({ type: 'refresh' });
    ({ folderId } = await chrome.storage.local.get('folderId'));
  }
  await folderChooser(folderId);

  const settings = await chrome.storage.local.get(DEFAULTS);
  for (const key of Object.keys(DEFAULTS)) {
    const el = document.getElementById(key);
    if (el.type === 'checkbox') el.checked = settings[key];
    else el.value = settings[key];

    el.addEventListener('change', async () => {
      await chrome.storage.local.set({ [key]: el.type === 'checkbox' ? el.checked : el.value });
      showSaved();
    });
    if (key in TYPOGRAPHY) el.addEventListener('input', updatePreview);
  }
  updatePreview();

  document.getElementById('resetTypography').addEventListener('click', async () => {
    for (const [key, value] of Object.entries(TYPOGRAPHY)) document.getElementById(key).value = value;
    updatePreview();
    await chrome.storage.local.set(TYPOGRAPHY);
    showSaved();
  });

  await iconThemePicker(document.getElementById('iconThemes'));

  document.getElementById('openTab').addEventListener('click', () => chrome.runtime.openOptionsPage());
  // Edge's page for this extension: permissions, site access, shortcuts, remove.
  document.getElementById('manageExtension').addEventListener('click', () =>
    chrome.tabs.create({ url: `${BROWSER}://extensions/?id=${chrome.runtime.id}` }),
  );
  const manage = document.getElementById('manage');
  if (BROWSER === 'chrome') manage.textContent = 'Manage bookmarks';
  manage.addEventListener('click', () => chrome.tabs.create({ url: FAVORITES_PAGE }));
}

init();
