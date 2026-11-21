// Icon themes for the Superfavorites Bar, shared by the bar (content.js) and
// the Settings page. Each icon is a list of SVG elements in a 16×16 box;
// `currentColor` follows the text color. `folder` is the folder color in
// light and dark mode (used where a folder icon is drawn in currentColor).
(() => {
  const NS = 'http://www.w3.org/2000/svg';

  const stroke = (d, width = 1.5, extra = {}) => ({
    tag: 'path', d, fill: 'none', stroke: 'currentColor', 'stroke-width': width,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra,
  });
  const fill = (d, color = 'currentColor', extra = {}) => ({ tag: 'path', d, fill: color, ...extra });
  const rect = (x, y, width, height, extra = {}) => ({ tag: 'rect', x, y, width, height, ...extra });
  const circle = (cx, cy, r, extra = {}) => ({ tag: 'circle', cx, cy, r, ...extra });
  const square = { 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter' };
  const crisp = { 'shape-rendering': 'crispEdges' };
  const grid = (size, gap, extra) => {
    const far = 2 + size + gap;
    return [rect(2, 2, size, size, extra), rect(far, 2, size, size, extra), rect(2, far, size, size, extra), rect(far, far, size, size, extra)];
  };

  const THEMES = {
    edge: {
      name: 'Edge',
      description: 'Fluent: rounded lines, amber folders',
      folder: ['#d99a1e', '#f2c14e'],
      icons: {
        folder: [fill('M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2l1.6 1.6H13a1.5 1.5 0 0 1 1.5 1.5v6.4A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5z')],
        chevron: [stroke('M6 3.5 10.5 8 6 12.5')],
        down: [stroke('M4 6l4 4 4-4')],
        check: [stroke('M3.5 8.5l3 3 6-7')],
        more: [stroke('M3.5 4 7.5 8l-4 4M8.5 4l4 4-4 4')],
        add: [stroke('M8 3v10M3 8h10')],
        workspace: [stroke('M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z')],
        tidy: [stroke('M14 2 8 8'), stroke('M6.5 6.5 9.5 9.5 6.6 14.4 1.6 9.4z'), stroke('M7.3 7.3 3.6 11M8.7 8.7 5 12.4', 1.2)],
        library: [stroke('M2.5 2.5h3v11h-3zM5.5 4h3v9.5h-3zM9.3 4.6l2.6-.7 2.4 8.9-2.6.7z', 1.2)],
      },
    },

    safari: {
      name: 'Safari',
      description: 'SF Symbols: thin, rounded, blue folders',
      folder: ['#007aff', '#0a84ff'],
      icons: {
        folder: [
          stroke('M1.75 4.5A1.75 1.75 0 0 1 3.5 2.75h2.4c.4 0 .8.16 1.1.44l.9.91h4.6a1.75 1.75 0 0 1 1.75 1.75v5.4a1.75 1.75 0 0 1-1.75 1.75h-9A1.75 1.75 0 0 1 1.75 11.25zM1.75 6.25h12.5', 1.25),
        ],
        chevron: [stroke('M6.25 3.75 10.5 8l-4.25 4.25', 1.4)],
        down: [stroke('M3.75 6.25 8 10.5l4.25-4.25', 1.4)],
        check: [stroke('M3.25 8.5 6.5 11.75 12.75 4.5', 1.5)],
        more: [stroke('M3.5 4.25 7.25 8 3.5 11.75M8.75 4.25 12.5 8l-3.75 3.75', 1.3)],
        add: [stroke('M8 2.75v10.5M2.75 8h10.5', 1.3)],
        workspace: grid(4.75, 2, { rx: 1.25, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.25 }),
        tidy: [stroke('M14 2 8 8', 1.25), stroke('M6.5 6.5 9.5 9.5 6.6 14.4 1.6 9.4z', 1.25), stroke('M7.3 7.3 3.6 11M8.7 8.7 5 12.4', 1)],
        library: [stroke('M8 4.25C6.6 3.2 4.6 2.9 2 3.1v9.4c2.6-.2 4.6.1 6 1.15 1.4-1.05 3.4-1.35 6-1.15V3.1c-2.6-.2-4.6.1-6 1.15zM8 4.25v9.4', 1.25)],
      },
    },

    firefox: {
      name: 'Firefox',
      description: 'Photon: crisp lines, gray folders, solid arrowheads',
      folder: ['#5b5b66', '#cfcfd8'],
      icons: {
        folder: [stroke('M1.5 3.5h4.3l1.5 1.5h7.2v8h-13z', 1.2, square), stroke('M1.5 6.5h13', 1.2, square)],
        chevron: [fill('M6 4v8l4.5-4z')],
        down: [fill('M4 6h8l-4 4.5z')],
        check: [stroke('M3 8.5l3 3 7-7', 1.6, square)],
        more: [stroke('M3 4l4 4-4 4M8 4l4 4-4 4', 1.5, square)],
        add: [stroke('M8 2.5v11M2.5 8h11', 1.4, square)],
        workspace: [stroke('M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z', 1.2, square)],
        tidy: [stroke('M14 2 8 8', 1.2, square), stroke('M6.5 6.5 9.5 9.5 6.6 14.4 1.6 9.4z', 1.2, square), stroke('M7.3 7.3 3.6 11M8.7 8.7 5 12.4', 1.2, square)],
        library: [stroke('M2 2.5h2.5v11H2zM5.5 2.5H8v11H5.5zM9.3 3l2.4-.6 2.8 10.7-2.4.6z', 1.1, square)],
      },
    },

    material: {
      name: 'Chrome',
      description: 'Material: solid shapes, gray folders',
      folder: ['#5f6368', '#9aa0a6'],
      icons: {
        folder: [fill('M6.6 2.5H2.8a1.3 1.3 0 0 0-1.3 1.3v8.4a1.3 1.3 0 0 0 1.3 1.3h10.4a1.3 1.3 0 0 0 1.3-1.3V5.6a1.3 1.3 0 0 0-1.3-1.3H8.3z')],
        chevron: [fill('M6.3 3.3 5.2 4.4 8.8 8l-3.6 3.6 1.1 1.1L11 8z')],
        down: [fill('M4.4 5.2 3.3 6.3 8 11l4.7-4.7-1.1-1.1L8 8.8z')],
        check: [fill('M6.2 10.6 3.4 7.8 2.3 8.9l3.9 3.9 7.5-7.5-1.1-1.1z')],
        more: [fill('M2.7 4.1 3.8 3l5 5-5 5-1.1-1.1L6.6 8zm5 0L8.8 3l5 5-5 5-1.1-1.1L11.6 8z')],
        add: [fill('M7.25 2.5h1.5v4.75h4.75v1.5H8.75v4.75h-1.5V8.75H2.5v-1.5h4.75z')],
        workspace: grid(5, 2, { rx: 1, fill: 'currentColor' }),
        tidy: [stroke('M14 2 8.5 7.5', 1.6), fill('M6.5 6.5 9.5 9.5 6.6 14.4 1.6 9.4z'), stroke('M7.6 9.6 4.6 12.6', 0.9, { stroke: 'var(--menu-bg, #fff)' })],
        library: [
          fill('M2 4h1.25v8.75c0 .14.11.25.25.25H12v1.25H3.5A1.5 1.5 0 0 1 2 12.75z'),
          rect(4.75, 1.75, 9.5, 9.5, { rx: 1.25, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.25 }),
          stroke('M7 4.5h5M7 6.5h5M7 8.5h3', 1.25),
        ],
      },
    },

    classic: {
      name: 'Classic',
      description: 'Windows 98: pixel-crisp, yellow folders',
      folder: ['#f4d35e', '#f4d35e'],
      icons: {
        folder: [
          { tag: 'path', d: 'M1.5 3.5h5l1 1h7v9h-13z', fill: '#f4d35e', stroke: '#7a5c00', 'stroke-width': 1, ...crisp },
          { tag: 'path', d: 'M2.5 6.5h11', stroke: '#fff3b0', 'stroke-width': 1, ...crisp },
        ],
        chevron: [fill('M6 4v8l4-4z', 'currentColor', crisp)],
        down: [fill('M4 6h8l-4 4z', 'currentColor', crisp)],
        check: [stroke('M3 7.5l3 3 7-7', 2, { 'stroke-linecap': 'square', 'stroke-linejoin': 'miter' })],
        more: [fill('M3 4v8l4-4zM8 4v8l4-4z', 'currentColor', crisp)],
        add: [stroke('M8 3v10M3 8h10', 2, { 'stroke-linecap': 'butt', ...crisp })],
        workspace: [
          { tag: 'path', d: 'M1.5 2.5h13v11h-13z', fill: '#ffffff', stroke: 'currentColor', 'stroke-width': 1, ...crisp },
          fill('M2 3h12v2.5H2z', '#000080', crisp),
        ],
        tidy: [
          stroke('M14 2 8 8', 2, { stroke: '#8a5a2b', 'stroke-linecap': 'butt' }),
          { tag: 'path', d: 'M6.5 6.5 9.5 9.5 6.6 14.4 1.6 9.4z', fill: '#f4d35e', stroke: '#7a5c00', 'stroke-width': 1 },
          stroke('M7.3 7.3 3.6 11M8.7 8.7 5 12.4', 1.5, { stroke: '#c0392b', 'stroke-linecap': 'butt' }),
        ],
        library: [
          rect(2.5, 2.5, 3, 11, { fill: '#c0392b', stroke: '#000000', 'stroke-width': 1, ...crisp }),
          rect(5.5, 4.5, 3, 9, { fill: '#27ae60', stroke: '#000000', 'stroke-width': 1, ...crisp }),
          rect(8.5, 3.5, 3, 10, { fill: '#2c3e9e', stroke: '#000000', 'stroke-width': 1, ...crisp }),
        ],
      },
    },

    minimal: {
      name: 'Minimal',
      description: 'Hairline strokes, no color',
      folder: ['#6b6b6b', '#a6a6a6'],
      icons: {
        folder: [stroke('M1.5 4v8.5h13V5.5H8L6.5 4z', 1)],
        chevron: [stroke('M6.5 4.5 10 8l-3.5 3.5', 1)],
        down: [stroke('M4.5 6.5 8 10l3.5-3.5', 1)],
        check: [stroke('M4 8.5 6.5 11 12 5.5', 1)],
        more: [stroke('M4 5l3 3-3 3M9 5l3 3-3 3', 1)],
        add: [stroke('M8 4v8M4 8h8', 1)],
        workspace: [circle(5, 5, 1.25, { fill: 'currentColor' }), circle(11, 5, 1.25, { fill: 'currentColor' }), circle(5, 11, 1.25, { fill: 'currentColor' }), circle(11, 11, 1.25, { fill: 'currentColor' })],
        tidy: [stroke('M14 2 8 8', 1), stroke('M6.5 6.5 9.5 9.5 6.6 14.4 1.6 9.4z', 1), stroke('M8 8 4.1 11.9', 1)],
        library: [stroke('M4 3v10M7 3v10M10 3.5l3 9', 1)],
      },
    },

    duotone: {
      name: 'Duotone',
      description: 'Colorful two-tone shapes, bold arrows',
      folder: ['#2b88d8', '#2b88d8'],
      icons: {
        folder: [
          fill('M1.5 3.5a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v1.5h-13z', '#7cb8f2'),
          fill('M1.5 6h13v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z', '#2b88d8'),
        ],
        chevron: [stroke('M6 3.5 10.5 8 6 12.5', 2)],
        down: [stroke('M4 6l4 4 4-4', 2)],
        check: [stroke('M3.5 8.5l3 3 6-7', 2.2, { stroke: '#3fae49' })],
        more: [stroke('M3.5 4 7.5 8l-4 4M8.5 4l4 4-4 4', 2)],
        add: [circle(8, 8, 6.5, { fill: '#2b88d8' }), stroke('M8 5v6M5 8h6', 1.6, { stroke: '#ffffff' })],
        workspace: [
          rect(2, 2, 5.25, 5.25, { rx: 1.5, fill: '#e74856' }),
          rect(8.75, 2, 5.25, 5.25, { rx: 1.5, fill: '#ffb900' }),
          rect(2, 8.75, 5.25, 5.25, { rx: 1.5, fill: '#16c60c' }),
          rect(8.75, 8.75, 5.25, 5.25, { rx: 1.5, fill: '#0078d4' }),
        ],
        tidy: [
          stroke('M14 2 8 8', 2, { stroke: '#8a5a2b' }),
          fill('M6.5 6.5 9.5 9.5 6.6 14.4 1.6 9.4z', '#ffb900'),
          stroke('M7.3 7.3 3.6 11M8.7 8.7 5 12.4', 1.5, { stroke: '#e74856' }),
        ],
        library: [
          rect(2, 2.5, 3, 11, { rx: 0.75, fill: '#8764b8' }),
          rect(5.5, 4, 3, 9.5, { rx: 0.75, fill: '#00b7c3' }),
          fill('M9.3 4.6l2.6-.7 2.4 8.9-2.6.7z', '#f7630c'),
        ],
      },
    },
  };

  const DEFAULT = 'edge';

  // An <svg class="ico NAME"> for icon `name` in theme `themeId`. Unknown themes
  // and icons a theme leaves out fall back to the default theme.
  function render(themeId, name) {
    const parts = (THEMES[themeId] ?? THEMES[DEFAULT]).icons[name] ?? THEMES[DEFAULT].icons[name];
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', `ico ${name}`);
    for (const { tag, ...attrs } of parts) {
      const el = document.createElementNS(NS, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      svg.append(el);
    }
    return svg;
  }

  globalThis.superfavoritesIcons = { THEMES, DEFAULT, render };
})();
