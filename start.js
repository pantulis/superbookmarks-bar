// The New Tab page (start.html): the pinned favorites on top, then the current
// workspace across the page, then the other workspaces, most recently used
// first, and the sticky folders. Settings also offers its address for the
// browser's Home or startup page. It draws from the same copy of the favorites
// tree the bar uses, and redraws when that changes.

const SEPARATOR_URL = 'https://superfavorites.invalid/separator';
const iconThemes = globalThis.superfavoritesIcons;

const pinsEl = document.getElementById('pins');
const currentEl = document.getElementById('current');
const othersTitleEl = document.getElementById('others-title');
const cardsEl = document.getElementById('cards');
const searchEl = document.getElementById('search');
const emptyEl = document.getElementById('empty');

let settings = {};
let iconTheme = iconThemes.DEFAULT;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}

const icon = (name) => iconThemes.render(iconTheme, name);
const span = (text) => h('span', { textContent: text });

function favicon(url) {
  return h('img', { alt: '', src: `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32` });
}

// "💼 Work" -> { emoji: '💼', name: 'Work' }, as on the bar.
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function parseWorkspace(title) {
  const first = graphemes.segment(title)[Symbol.iterator]().next().value?.segment ?? '';
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first)
    ? { emoji: first, name: title.slice(first.length).trim() }
    : { emoji: '', name: title };
}

function workspaceIcon(ws) {
  const image = ws.icon && settings.workspaceIcons?.[ws.icon];
  if (image) return h('img', { className: 'ws-image', alt: '', src: image });
  const { emoji } = parseWorkspace(ws.title);
  return emoji ? h('span', { className: 'emoji', textContent: emoji }) : icon(ws.sticky ? 'folder' : 'workspace');
}

const count = (node) => (node.children ?? []).reduce((n, c) => n + (c.url ? (c.url === SEPARATOR_URL ? 0 : 1) : count(c)), 0);

// Folders start closed on every new tab and open on a click. The ones opened
// here stay open while the page redraws.
const expanded = new Set();

// A favorite opens in this tab, like a link. Bookmarklets (javascript:) can't
// run from an extension page, so they're listed but inert.
function favoriteLink(node) {
  const title = node.title || node.url;
  if (node.url.startsWith('javascript:')) {
    return h('span', { className: 'fav inert', title: 'Bookmarklets only work from the bar' }, icon('workspace'), span(title));
  }
  return h('a', { className: 'fav', href: node.url, title: node.url }, favicon(node.url), span(title));
}

function renderList(nodes) {
  const list = h('ul');
  for (const node of nodes) {
    if (node.url === SEPARATOR_URL) {
      list.append(h('li', {}, h('hr')));
    } else if (node.url) {
      const li = h('li', {}, favoriteLink(node));
      li.dataset.search = `${node.title} ${node.url}`.toLowerCase();
      list.append(li);
    } else {
      const summary = h('summary', {}, icon('chevron'), icon('folder'), span(node.title), h('span', { className: 'count', textContent: count(node) || '' }));
      const details = h('details', { open: expanded.has(node.id) }, summary, renderList(node.children ?? []));
      // A click (or Enter/Space) toggles it next, so `open` is still the old
      // state here. Folders the search opens aren't recorded.
      summary.addEventListener('click', () => (details.open ? expanded.delete(node.id) : expanded.add(node.id)));
      list.append(h('li', { className: 'folder' }, details));
    }
  }
  return list;
}

function renderCard(ws) {
  const { name } = parseWorkspace(ws.title);
  const card = h('section', { className: 'card' },
    h('h2', {}, workspaceIcon(ws), span(name || '(untitled)'), ws.sticky ? h('small', { textContent: 'Sticky folder' }) : ''),
    renderList(ws.children ?? []));
  if (ws.color) card.style.setProperty('--ws-color', ws.color);
  if (!ws.sticky) card.dataset.workspace = ws.id;
  return card;
}

function renderPins(pinned) {
  const status = settings.pinStatus ?? {};
  pinsEl.replaceChildren(...(pinned?.children ?? [])
    .filter((n) => n.url && n.url !== SEPARATOR_URL && !n.url.startsWith('javascript:'))
    .map((n) => {
      const pin = h('a', { className: 'pin', href: n.url, title: n.url }, favicon(n.url), span(n.title || n.url));
      const unread = status[n.url]?.unread;
      if (unread) pin.append(h('span', { className: `badge${unread === true ? ' dot' : ''}`, textContent: unread === true ? '' : unread }));
      return pin;
    }));
}

function render() {
  iconTheme = iconThemes.THEMES[settings.iconTheme] ? settings.iconTheme : iconThemes.DEFAULT;
  const [light, dark] = iconThemes.THEMES[iconTheme].folder;
  document.documentElement.style.setProperty('--folder', matchMedia('(prefers-color-scheme: dark)').matches ? dark : light);

  const top = (settings.tree?.children ?? []).filter((n) => !n.url);
  renderPins(top.find((n) => n.pinned));
  const workspaces = top.filter((n) => !n.pinned && !n.sticky);
  const stickies = top.filter((n) => n.sticky && !n.pinned);
  // The bar shows the first workspace when none is selected yet.
  const current = workspaces.find((w) => w.id === settings.workspaceId) ?? workspaces[0];
  // The rest by when they were last selected; never-used ones keep bar order.
  const recency = new Map((settings.recentWorkspaces ?? []).map((id, i) => [id, i]));
  const rank = (w) => recency.get(w.id) ?? Infinity;
  const others = workspaces.filter((w) => w !== current).sort((a, b) => rank(a) - rank(b) || a.index - b.index);
  currentEl.replaceChildren(...(current ? [renderCard(current)] : []));
  cardsEl.replaceChildren(...[...others, ...stickies].map(renderCard));
  filter();
}

// Hides favorites that don't match, and folders and cards left empty.
function filter() {
  const query = searchEl.value.trim().toLowerCase();
  const all = (selector) => [...currentEl.querySelectorAll(selector), ...cardsEl.querySelectorAll(selector)];
  for (const li of all('li[data-search]')) li.classList.toggle('hidden', !!query && !li.dataset.search.includes(query));
  // Deepest folders first, so a parent sees its subfolders' result.
  for (const folder of all('li.folder').reverse()) {
    const details = folder.firstElementChild;
    const hasMatch = !!details.querySelector(':scope > ul > li[data-search]:not(.hidden), :scope > ul > li.folder:not(.hidden)');
    folder.classList.toggle('hidden', !!query && !hasMatch);
    if (query && hasMatch) details.open = true;
  }
  for (const li of all('li:has(> hr)')) li.classList.toggle('hidden', !!query);
  let any = false;
  for (const card of all('.card')) {
    const hasMatch = !!card.querySelector(':scope > ul > li:not(.hidden)');
    card.classList.toggle('hidden', !!query && !hasMatch);
    any ||= hasMatch;
  }
  emptyEl.classList.toggle('hidden', !query || any);
  othersTitleEl.classList.toggle('hidden', ![...cardsEl.children].some((card) => !card.classList.contains('hidden')));
}

// Opening a favorite from a workspace makes that the bar's workspace too. For
// a plain click the page is about to be replaced, so the switch is saved first.
function switchOnOpen(e) {
  const link = e.target.closest?.('a.fav');
  const id = link?.closest('[data-workspace]')?.dataset.workspace;
  if (!id || id === settings.workspaceId || (e.type === 'auxclick' && e.button !== 1)) return;
  const save = chrome.storage.local.set({ workspaceId: id });
  if (e.type !== 'click' || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  save.finally(() => location.assign(link.href));
}
document.addEventListener('click', switchOnOpen);
document.addEventListener('auxclick', switchOnOpen);

// Clearing the search redraws, closing the folders it opened.
searchEl.addEventListener('input', () => (searchEl.value.trim() ? filter() : render()));
// Enter opens the first match, or searches the web with the browser's default
// search engine when no favorite matches.
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchEl.value = '';
    searchEl.dispatchEvent(new Event('input'));
  }
  if (e.key !== 'Enter') return;
  const query = searchEl.value.trim();
  const first = query && document.querySelector('li[data-search]:not(.hidden) a.fav');
  if (first) first.click();
  else if (query) chrome.search.query({ text: query, disposition: 'CURRENT_TAB' });
});
// Typing anywhere on the page goes to the search box.
addEventListener('keydown', (e) => {
  if (e.target === searchEl || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  searchEl.focus();
});

const KEYS = ['tree', 'workspaceId', 'recentWorkspaces', 'workspaceIcons', 'iconTheme', 'pinStatus'];
async function load() {
  settings = await chrome.storage.local.get(KEYS);
  // The background writes the tree on startup; ask for it if it isn't there yet.
  if (!settings.tree) chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !KEYS.some((key) => key in changes)) return;
  for (const key of KEYS) if (key in changes) settings[key] = changes[key].newValue;
  // Pin status changes often (tab titles), so redraw just the pins for it.
  if (Object.keys(changes).every((key) => key === 'pinStatus')) renderPins(settings.tree?.children?.find((n) => n.pinned));
  else render();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

load();
