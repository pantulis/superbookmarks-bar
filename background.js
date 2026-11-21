// Service worker: owns all bookmark access. Content scripts cannot use the
// bookmarks API, so we publish a snapshot of the chosen folder to
// chrome.storage.local and every tab renders from that.

const FOLDER_NAME = 'Superfavorites';
const DEFAULT_WORKSPACE = '⭐ Default';
const PINNED_FOLDER = '📌 Pinned';
const LEGACY_LIBRARY_FOLDER = '📚 Library'; // replaced by the browser's Other favorites
const ICON_MARKER = 'Workspace icon';
// A favorite with this URL inside a Superfavorites subfolder makes it a sticky
// folder (shown in every workspace) instead of a workspace. The .invalid
// top-level domain is reserved, so the address never leads anywhere.
const STICKY_MARKER = 'Sticky folder';
const STICKY_MARKER_URL = 'https://superfavorites.invalid/sticky';
// Same idea: a "Workspace color" favorite holds the workspace's color, and a
// favorite with SEPARATOR_URL draws a divider wherever it sits.
const COLOR_MARKER = 'Workspace color';
const COLOR_MARKER_URL = 'https://superfavorites.invalid/color';
const SEPARATOR_TITLE = '────────';
const SEPARATOR_URL = 'https://superfavorites.invalid/separator';
const ICON_SIZE = 64;
const DEFAULT_SETTINGS = {
  enabled: true,
  folderId: null,
  position: 'top',
  pushContent: true,
  showTitles: true,
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set(current);
  await publishTree();
  await updateBadge();
  await injectIntoOpenTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await publishTree();
  await updateBadge();
});

// --- Bookmark snapshot -------------------------------------------------------

async function resolveFolderId() {
  const { folderId } = await chrome.storage.local.get('folderId');
  if (folderId) {
    try {
      const [node] = await chrome.bookmarks.get(folderId);
      if (node && !node.url) return folderId;
    } catch {
      // Folder was deleted; fall through and recreate the default one.
    }
  }

  const parent = await otherFavorites();
  let folder = parent.children?.find((n) => !n.url && n.title === FOLDER_NAME);
  folder ??= await chrome.bookmarks.create({ parentId: parent.id, title: FOLDER_NAME });
  await chrome.storage.local.set({ folderId: folder.id });
  return folder.id;
}

// `index` is the node's real position in its folder, which the bar needs for
// moves because the hidden icon favorite is left out of the snapshot.
// depth 1 = a workspace: its icon favorite becomes the workspace's `icon`.
// The pinned folder sits beside the workspaces and is marked `pinned`.
// Edge's "Other favorites" folder, with its children.
async function otherFavorites() {
  // Root children are "Favorites bar", "Other favorites" and sometimes "Mobile favorites".
  const [root] = await chrome.bookmarks.getTree();
  return root.children.find((n) => n.folderType === 'other') ?? root.children[1] ?? root.children[0];
}

function simplify(node, depth = 0) {
  if (node.url) return { id: node.id, title: node.title, url: node.url, index: node.index };
  let children = node.children ?? [];
  const out = { id: node.id, title: node.title, index: node.index };
  if (depth === 1 && isPinnedFolder(node)) out.pinned = true;
  if (depth === 1) {
    const marker = children.find(isIconMarker);
    if (marker) out.icon = marker.url;
    if (children.some(isStickyMarker)) out.sticky = true;
    const color = children.find(isColorMarker);
    if (color) out.color = colorFromMarker(color.url);
    children = children.filter((c) => c !== marker && c !== color && !isStickyMarker(c));
  }
  out.children = children.map((c) => simplify(c, depth + 1));
  return out;
}

// Workspaces are the subfolders of the Superfavorites folder. Make sure there is
// at least one, and the first time workspaces are used, gather whatever was
// already on the bar into it so nothing disappears.
async function ensureWorkspace(rootId) {
  const [rootNode] = await chrome.bookmarks.get(rootId);
  if (rootNode.parentId === '0') return; // The browser's own top-level folders: never rearrange them.

  const { workspacesReady } = await chrome.storage.local.get('workspacesReady');
  const children = await chrome.bookmarks.getChildren(rootId);
  const stickyIds = new Set();
  for (const child of children) {
    if (!child.url && (await chrome.bookmarks.getChildren(child.id)).some(isStickyMarker)) stickyIds.add(child.id);
  }
  const keep = (c) => isPinnedFolder(c) || stickyIds.has(c.id);
  if (workspacesReady && children.some((c) => !c.url && !keep(c))) return;

  const workspace = await chrome.bookmarks.create({ parentId: rootId, index: 0, title: DEFAULT_WORKSPACE });
  for (const child of children) {
    if (!keep(child)) await chrome.bookmarks.move(child.id, { parentId: workspace.id });
  }
  await chrome.storage.local.set({ workspacesReady: true, workspaceId: workspace.id });
}

// --- Pinned favorites and Other favorites ------------------------------------
// Two things are shown in every workspace:
// - PINNED_FOLDER, beside the workspaces (recognized by name so it syncs):
//   favicons at the left of the bar. Clicking one switches to a tab that
//   already shows it instead of opening another.
// - Edge's own "Other favorites": a drop-down at the right end of the bar,
//   leaving out the Superfavorites folder if it lives there.

const isPinnedFolder = (node) => !node.url && node.title === PINNED_FOLDER;

async function pinnedFolderId() {
  const rootId = await resolveFolderId();
  const existing = (await chrome.bookmarks.getChildren(rootId)).find(isPinnedFolder);
  return (existing ?? (await chrome.bookmarks.create({ parentId: rootId, title: PINNED_FOLDER }))).id;
}

// Snapshot of Other favorites without the Superfavorites folder, or null when
// Superfavorites *is* Other favorites.
async function otherFavoritesSnapshot(rootId) {
  const { id } = await otherFavorites();
  if (id === rootId) return null;
  const strip = (node) =>
    node.url
      ? { id: node.id, title: node.title, url: node.url, index: node.index }
      : { id: node.id, title: node.title, index: node.index, children: node.children.filter((c) => c.id !== rootId).map(strip) };
  const [node] = await chrome.bookmarks.getSubTree(id);
  return strip(node);
}

// An earlier version kept a "📚 Library" folder for this. Move what's in it to
// Other favorites and remove it.
async function migrateLibrary(rootId) {
  const legacy = (await chrome.bookmarks.getChildren(rootId)).find((n) => !n.url && n.title === LEGACY_LIBRARY_FOLDER);
  if (!legacy) return;
  const { id: otherId } = await otherFavorites();
  for (const child of await chrome.bookmarks.getChildren(legacy.id)) {
    await chrome.bookmarks.move(child.id, { parentId: otherId });
  }
  await chrome.bookmarks.remove(legacy.id); // fails, harmlessly, if anything was left behind
  await chrome.storage.local.remove('libraryReady');
}

async function addPinned(msg) {
  const parentId = await pinnedFolderId();
  return msg.id
    ? chrome.bookmarks.move(msg.id, { parentId })
    : chrome.bookmarks.create({ parentId, title: msg.title, url: msg.url });
}

// --- Links dropped on the bar --------------------------------------------------

// Dragging a favorites folder from the browser's own favorites bar hands the
// page only the addresses of every favorite inside it, subfolders flattened,
// with no titles or folder names. Since they are the user's own favorites, find
// the folder they came from and copy it; otherwise add the links one by one,
// titled after an existing favorite with the same address.
async function addDropped({ links, parentId, index }) {
  parentId ??= await resolveFolderId();
  const [root] = await chrome.bookmarks.getTree();
  const urls = links.map((l) => l.url).join('\n');
  const flatUrls = (node) => (node.children ?? []).flatMap((c) => (c.url ? [c.url] : flatUrls(c)));
  // The outermost folder that matches, skipping the browser's own top folders.
  const findFolder = (node) => {
    for (const c of node.children ?? []) {
      if (c.url) continue;
      if (c.parentId !== root.id && flatUrls(c).join('\n') === urls) return c;
      const found = findFolder(c);
      if (found) return found;
    }
    return null;
  };
  const source = links.length > 1 && findFolder(root);
  if (source) return copyFolder(source, parentId, index);

  for (const [i, { url, title }] of links.entries()) {
    const known = title === url && (await chrome.bookmarks.search({ url }).catch(() => []))[0];
    await chrome.bookmarks.create({ parentId, index: index === undefined ? undefined : index + i, title: known?.title || title, url });
  }
}

async function copyFolder(folder, parentId, index) {
  const copy = await chrome.bookmarks.create({ parentId, index, title: folder.title });
  for (const c of folder.children ?? []) {
    if (c.url) await chrome.bookmarks.create({ parentId: copy.id, title: c.title, url: c.url });
    else await copyFolder(c, copy.id);
  }
  return copy;
}

// A tab matches if its address is the same (ignoring #fragment and a trailing
// slash) or lies under it, so a pinned https://mail.google.com/ finds the inbox.
// Prefer exact matches, then the sender's window, then the most recently used tab.
function tabMatch(tabUrl = '', url) {
  const strip = (u) => u.split('#')[0].replace(/\/$/, '');
  const target = strip(url);
  const u = strip(tabUrl);
  if (u === target) return 2;
  return u.startsWith(`${target}/`) || u.startsWith(`${target}?`) ? 1 : 0;
}

// --- Tidy tabs -----------------------------------------------------------------

// The tabs in the sender's window, each with `favorite` set to the folder path
// of a favorite with the same address (ignoring #fragments and a trailing
// slash), or null. Paths inside the Superfavorites folder start below it.
async function tidyTabs(sender) {
  const strip = (u) => u.split('#')[0].replace(/\/$/, '');
  const rootId = await resolveFolderId();
  const pinnedId = await pinnedFolderId();
  const favorites = new Map(); // address -> folder path
  const pins = new Set();
  const walk = (node, path) => {
    for (const child of node.children ?? []) {
      if (child.url) {
        if (child.url.startsWith('https://superfavorites.invalid/')) continue;
        if (!favorites.has(strip(child.url))) favorites.set(strip(child.url), path);
        if (node.id === pinnedId) pins.add(strip(child.url));
      } else {
        walk(child, child.id === rootId ? [] : [...path, child.title]);
      }
    }
  };
  const [tree] = await chrome.bookmarks.getTree();
  walk(tree, []);

  // Every tab is listed. Empty pages (New Tab, about:blank) can be closed but
  // there's nothing to add, so they're marked `blank`.
  const tabs = await chrome.tabs.query({ windowId: sender.tab.windowId });
  return tabs.map((tab) => {
    const url = tab.url || tab.pendingUrl || '';
    const blank = !url || /^(about:blank|(edge|chrome):\/\/(newtab|new-tab-page))/.test(url);
    return {
      id: tab.id,
      title: tab.title || (blank ? 'New Tab' : url),
      url,
      blank,
      active: tab.id === sender.tab.id,
      pinnedTab: tab.pinned,
      pin: !blank && pins.has(strip(url)),
      favorite: blank ? null : (favorites.get(strip(url)) ?? null),
    };
  });
}

// Adds `add` ([{ title, url, parentId }]) to the end of each one's folder,
// then closes the tabs in `close`. Returns the counts done.
async function tidyApply({ close = [], add = [] }) {
  for (const { title, url, parentId } of add) await chrome.bookmarks.create({ parentId, title, url });
  if (close.length) await chrome.tabs.remove(close);
  return { closed: close.length, added: add.length };
}

async function focusOrOpen(url, sender) {
  const score = (tab) => tabMatch(tab.url, url);
  const windowId = sender.tab?.windowId;
  const [best] = (await chrome.tabs.query({}))
    .filter(score)
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        (b.windowId === windowId) - (a.windowId === windowId) ||
        (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
    );
  if (best) {
    await chrome.tabs.update(best.id, { active: true });
    await chrome.windows.update(best.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url, windowId, index: sender.tab ? sender.tab.index + 1 : undefined });
}

// --- Pin status --------------------------------------------------------------
// For each pin: whether a tab already shows it, and an unread count read from
// that tab's title ("Inbox (3) - Gmail", "(12) Slack", or a leading "•"/"*"
// for unread without a count). It describes this device's tabs, so it's kept
// in chrome.storage.local (pinStatus: { url: { open, unread } }), not synced.

// A number, true (unread, no count) or 0.
function unreadFromTitle(title = '') {
  const count = /[([](\d{1,5})\+?[)\]]/.exec(title);
  if (count) return Number(count[1]);
  return /^[•*]\s/.test(title) ? true : 0;
}

async function refreshPinStatus() {
  const { tree, pinStatus: previous = {} } = await chrome.storage.local.get(['tree', 'pinStatus']);
  const pins = (tree?.children.find((n) => n.pinned)?.children ?? []).filter((n) => n.url && n.url !== SEPARATOR_URL);
  const tabs = await chrome.tabs.query({});
  const status = {};
  for (const { url } of pins) {
    const counts = tabs.filter((t) => tabMatch(t.url, url)).map((t) => unreadFromTitle(t.title));
    if (!counts.length) continue;
    const highest = Math.max(0, ...counts.filter((c) => typeof c === 'number'));
    status[url] = { open: true, unread: highest || counts.includes(true) };
  }
  if (JSON.stringify(status) !== JSON.stringify(previous)) await chrome.storage.local.set({ pinStatus: status });
}

let pinStatusTimer;
function schedulePinStatus() {
  clearTimeout(pinStatusTimer);
  pinStatusTimer = setTimeout(refreshPinStatus, 300);
}

chrome.tabs.onCreated.addListener(schedulePinStatus);
chrome.tabs.onRemoved.addListener(schedulePinStatus);
chrome.tabs.onReplaced.addListener(schedulePinStatus);
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.title) schedulePinStatus();
});

// --- Pin tabs in a group --------------------------------------------------------
// With "Keep pin tabs in a ★ group" on, tabs showing a pinned favorite's page
// (or a page under it) live in a collapsed ★ tab group in each window, so they
// take one small chip in the tab bar. Activating one of them (e.g. by clicking
// its pin) opens the group; switching to another tab folds it away again.
// Tabs pinned in Edge are left alone, since pinned tabs can't be grouped.

const TUCK_TITLE = '★';
const TUCK_COLOR = 'grey';

async function pinUrls() {
  const children = await chrome.bookmarks.getChildren(await pinnedFolderId());
  return children.filter((c) => c.url && !c.url.startsWith('https://superfavorites.invalid/')).map((c) => c.url);
}

const isPinTab = (tab, urls) => !tab.pinned && urls.some((url) => tabMatch(tab.url || tab.pendingUrl, url));

// Moves the window's pin tabs into its ★ group and other tabs out of it, then
// folds the group unless the active tab is in it.
async function tuckWindow(windowId, urls) {
  const tabs = await chrome.tabs.query({ windowId });
  let [group] = await chrome.tabGroups.query({ windowId, title: TUCK_TITLE });
  const want = new Set(tabs.filter((t) => isPinTab(t, urls)).map((t) => t.id));

  const stray = group ? tabs.filter((t) => t.groupId === group.id && !want.has(t.id)) : [];
  if (stray.length) await chrome.tabs.ungroup(stray.map((t) => t.id));
  const missing = tabs.filter((t) => want.has(t.id) && t.groupId !== group?.id);
  if (missing.length) {
    const tabIds = missing.map((t) => t.id);
    const groupId = await chrome.tabs.group(group ? { tabIds, groupId: group.id } : { tabIds, createProperties: { windowId } });
    if (!group) {
      await chrome.tabGroups.update(groupId, { title: TUCK_TITLE, color: TUCK_COLOR });
      // First in the tab bar, after the tabs pinned in Edge.
      await chrome.tabGroups.move(groupId, { index: tabs.filter((t) => t.pinned).length }).catch(() => {});
    }
    group = await chrome.tabGroups.get(groupId);
  }
  if (!want.size || !group) return; // an emptied group disappears by itself

  const open = tabs.some((t) => t.active && want.has(t.id));
  if (group.collapsed === open) await chrome.tabGroups.update(group.id, { collapsed: !open });
}

async function untuckAll() {
  for (const group of await chrome.tabGroups.query({ title: TUCK_TITLE })) {
    const tabs = await chrome.tabs.query({ groupId: group.id });
    if (tabs.length) await chrome.tabs.ungroup(tabs.map((t) => t.id)).catch(() => {});
  }
}

const tuckTimers = new Map(); // window id (or 'all') -> timer
function scheduleTuck(windowId) {
  const key = windowId ?? 'all';
  clearTimeout(tuckTimers.get(key));
  tuckTimers.set(
    key,
    setTimeout(async () => {
      tuckTimers.delete(key);
      const { tuckPins } = await chrome.storage.local.get({ tuckPins: false });
      if (!tuckPins) return;
      const urls = await pinUrls();
      const windowIds = windowId != null ? [windowId] : (await chrome.windows.getAll({ windowTypes: ['normal'] })).map((w) => w.id);
      // A window or tab may close mid-way; the next event tidies up.
      for (const id of windowIds) await tuckWindow(id, urls).catch(() => {});
    }, 150),
  );
}

chrome.tabs.onActivated.addListener(({ windowId }) => scheduleTuck(windowId));

// The bar undoes page zoom so it keeps its size (see applyZoom in content.js).
chrome.tabs.onZoomChange.addListener(({ tabId, newZoomFactor }) => {
  chrome.tabs.sendMessage(tabId, { type: 'zoom', factor: newZoomFactor }).catch(() => {});
});
chrome.tabs.onAttached.addListener((_id, { newWindowId }) => scheduleTuck(newWindowId));
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.url) scheduleTuck(tab.windowId);
});

// Serialized so overlapping publishes can't both create a default workspace.
let publishing = Promise.resolve();
function publishTree() {
  publishing = publishing.then(doPublish, doPublish);
  return publishing;
}

async function doPublish() {
  const id = await resolveFolderId();
  await migrateLibrary(id).catch(() => {});
  await ensureWorkspace(id);
  const [node] = await chrome.bookmarks.getSubTree(id);
  const tree = simplify(node);
  const others = await otherFavoritesSnapshot(id);
  // Pages read only the small othersInfo to draw the bar; the full tree is
  // fetched when its menu or search needs it.
  const count = (node) => (node.children ?? []).reduce((n, c) => n + (c.url ? 1 : count(c)), 0);
  const othersInfo = others && { id: others.id, title: others.title, count: count(others) };
  await chrome.storage.local.set({ tree, others, othersInfo });
  refreshIcons(tree);
  schedulePinStatus();
  scheduleTuck(); // the pins may have changed
}

// --- Workspace icons ---------------------------------------------------------
// A workspace can use an image from a URL as its icon. The URL is kept in a
// favorite named ICON_MARKER inside the workspace folder, so it syncs with the
// rest of the favorites. Each device downloads the image and keeps a small PNG
// copy in chrome.storage.local (workspaceIcons: { url: dataUrl }).

const isIconMarker = (node) => !!node.url && node.title === ICON_MARKER;
const isStickyMarker = (node) => node.url === STICKY_MARKER_URL;
const isColorMarker = (node) => !!node.url?.startsWith(`${COLOR_MARKER_URL}?`);

function colorFromMarker(url) {
  const color = new URL(url).searchParams.get('c') ?? '';
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : undefined;
}

// Make sure folder `folderId` has exactly the marker favorite described by
// `title` and `url`, or none if `url` is null.
async function setMarker(folderId, isMarker, title, url) {
  const marker = (await chrome.bookmarks.getChildren(folderId)).find(isMarker);
  if (url && marker) {
    if (marker.url !== url) await chrome.bookmarks.update(marker.id, { url });
  } else if (url) {
    await chrome.bookmarks.create({ parentId: folderId, index: 0, title, url });
  } else if (marker) {
    await chrome.bookmarks.remove(marker.id);
  }
}
const attemptedIcons = new Set(); // URLs tried since the service worker started

const setSticky = (folderId, sticky) => setMarker(folderId, isStickyMarker, STICKY_MARKER, sticky ? STICKY_MARKER_URL : null);

// Create or update a workspace or sticky folder: its name, icon, color and type.
async function saveWorkspace({ id, parentId, title, iconUrl, color, sticky }) {
  const folder = id
    ? await chrome.bookmarks.update(id, { title })
    : await chrome.bookmarks.create({ parentId: parentId ?? (await resolveFolderId()), title });
  await setMarker(folder.id, isIconMarker, ICON_MARKER, iconUrl || null);
  if (color !== undefined) {
    await setMarker(folder.id, isColorMarker, COLOR_MARKER, color ? `${COLOR_MARKER_URL}?c=${encodeURIComponent(color)}` : null);
  }
  if (sticky !== undefined) await setSticky(folder.id, sticky);
  return folder;
}

// Download icons for workspaces that need one and drop ones no longer used.
async function refreshIcons(tree) {
  const urls = new Set(tree.children.map((n) => n.icon).filter(Boolean));
  const { workspaceIcons = {} } = await chrome.storage.local.get('workspaceIcons');
  const kept = Object.fromEntries(Object.entries(workspaceIcons).filter(([url]) => urls.has(url)));
  if (Object.keys(kept).length !== Object.keys(workspaceIcons).length) {
    await chrome.storage.local.set({ workspaceIcons: kept });
  }
  for (const url of urls) {
    if (kept[url] || attemptedIcons.has(url)) continue;
    attemptedIcons.add(url);
    await fetchIcon(url).catch(() => null);
  }
}

async function fetchIcon(url) {
  const { workspaceIcons = {} } = await chrome.storage.local.get('workspaceIcons');
  if (workspaceIcons[url]) return workspaceIcons[url];
  const dataUrl = await downloadIcon(url);
  if (!dataUrl) return null;
  const { workspaceIcons: latest = {} } = await chrome.storage.local.get('workspaceIcons');
  await chrome.storage.local.set({ workspaceIcons: { ...latest, [url]: dataUrl } });
  return dataUrl;
}

// `url` may be an image or a web page. For a page, try the icons it declares,
// then /favicon.ico.
async function downloadIcon(url) {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  if (!(res.headers.get('content-type') ?? '').includes('html')) return rasterize(await res.blob());

  const candidates = [...declaredIcons(await res.text(), res.url), new URL('/favicon.ico', res.url).href];
  for (const candidate of candidates) {
    const icon = await fetch(candidate).catch(() => null);
    if (!icon?.ok) continue;
    const dataUrl = await rasterize(await icon.blob());
    if (dataUrl) return dataUrl;
  }
  return null;
}

// Icon URLs from a page's <link rel="icon"> tags, largest first. SVG icons are
// skipped because a service worker can't decode them.
function declaredIcons(html, base) {
  const icons = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (/\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1] ?? '').toLowerCase().split(/\s+/);
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]?.replace(/&amp;/g, '&');
    if (!href || !rel.some((r) => r === 'icon' || r === 'apple-touch-icon')) continue;
    if (/\.svg(\?|#|$)/i.test(href) || /image\/svg/i.test(tag)) continue;
    const size = rel.includes('apple-touch-icon') ? 180 : Number(/\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    try {
      icons.push({ href: new URL(href, base).href, size });
    } catch {
      // Malformed href; ignore it.
    }
  }
  return icons.sort((a, b) => b.size - a.size).map((i) => i.href);
}

// Scale any decodable image (PNG, ICO, JPEG, GIF, WebP…) to a small PNG data URL.
async function rasterize(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
    const ctx = canvas.getContext('2d');
    const scale = Math.min(ICON_SIZE / bitmap.width, ICON_SIZE / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

let publishTimer;
function schedulePublish() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(publishTree, 150);
}

for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
  chrome.bookmarks[event].addListener(schedulePublish);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if ('folderId' in changes) schedulePublish();
  if ('enabled' in changes) updateBadge();
  if ('tuckPins' in changes) changes.tuckPins.newValue ? scheduleTuck() : untuckAll();
});

// --- Toggle ------------------------------------------------------------------

async function toggle() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.storage.local.set({ enabled: !enabled });
}

async function updateBadge() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.action.setBadgeBackgroundColor({ color: '#6b6b6b' });
  await chrome.action.setBadgeText({ text: enabled ? '' : 'off' });
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-bar') toggle();
  if (command === 'tidy-tabs') {
    tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (tab) chrome.tabs.sendMessage(tab.id, { type: 'openTidy' }).catch(() => {});
  }
  if (command === 'switch-workspace') {
    tab ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    // Fails on pages without the bar (edge:// pages, the New Tab page).
    if (tab) chrome.tabs.sendMessage(tab.id, { type: 'openSwitcher' }).catch(() => {});
  }
});

// --- Requests from the bar ---------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ error: String(err) }),
  );
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case 'refresh':
      return publishTree();
    case 'add':
      return chrome.bookmarks.create({
        parentId: msg.parentId ?? (await resolveFolderId()),
        index: msg.index,
        title: msg.title,
        url: msg.url,
      });
    case 'addDropped':
      return addDropped(msg);
    case 'createFolder':
      return chrome.bookmarks.create({
        parentId: msg.parentId ?? (await resolveFolderId()),
        index: msg.index,
        title: msg.title,
      });
    case 'pin':
      return addPinned(msg);
    case 'toOtherFavorites':
      return chrome.bookmarks.move(msg.id, { parentId: (await otherFavorites()).id });
    case 'getZoom':
      return chrome.tabs.getZoom(sender.tab.id);
    case 'tidyTabs':
      return tidyTabs(sender);
    case 'tidyApply':
      return tidyApply(msg);
    case 'focusOrOpen':
      return focusOrOpen(msg.url, sender);
    case 'addSeparator':
      return chrome.bookmarks.create({
        parentId: msg.parentId ?? (await resolveFolderId()),
        index: msg.index,
        title: SEPARATOR_TITLE,
        url: SEPARATOR_URL,
      });
    case 'setSticky':
      return setSticky(msg.id, msg.sticky);
    case 'saveWorkspace':
      return saveWorkspace(msg);
    case 'fetchIcon':
      return fetchIcon(msg.url);
    case 'move':
      return chrome.bookmarks.move(msg.id, { parentId: msg.parentId, index: msg.index });
    case 'open':
      if (msg.where === 'window') return chrome.windows.create({ url: msg.urls });
      return Promise.all(
        msg.urls.map((url, i) =>
          chrome.tabs.create({
            url,
            active: false,
            windowId: sender.tab?.windowId,
            index: sender.tab ? sender.tab.index + 1 + i : undefined,
          }),
        ),
      );
    case 'edit':
      await chrome.bookmarks.update(msg.id, msg.url === undefined ? { title: msg.title } : { title: msg.title, url: msg.url });
      if (msg.parentId) await chrome.bookmarks.move(msg.id, { parentId: msg.parentId });
      return;
    case 'remove':
      return msg.folder ? chrome.bookmarks.removeTree(msg.id) : chrome.bookmarks.remove(msg.id);
  }
}

// Content scripts only load into pages opened after install, so add the bar
// to tabs that were already open.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.allSettled(
    tabs.map((tab) => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['icon-themes.js', 'content.js'] })),
  );
}
