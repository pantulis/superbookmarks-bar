# Store listing text

Ready-to-paste text for the Edge Add-ons (Partner Center) and Chrome Web Store forms. The name and short description come from `manifest.json`.

## Description

Paste into **Description** (Edge: 250–10,000 characters).

```
Superfavorites Bar adds a second bookmarks bar to your browser, organized into workspaces. Keep separate sets of favorites for work, home, a project or a trip, and switch between them with one click or a keystroke, without the clutter of one long favorites bar.

HOW IT WORKS
The bar sits at the top or bottom of every web page and shows the favorites in a folder you choose. Each subfolder becomes a workspace, with its own emoji or website icon and its own color. Because everything is stored as ordinary favorites, your workspaces sync to your other devices through the browser's own sync. There's no account to create.

WORKSPACES AND SEARCH
• Switch workspaces from the selector at the left of the bar.
• Press Alt+A to open the quick switcher, then type to search every favorite and jump straight to it.
• Create, edit and reorder workspaces right from the workspace menu.

ALWAYS AT HAND
• Pinned favorites: icon-only shortcuts that appear in every workspace. A dot shows when the site is open in a tab, and a badge shows its unread count, such as your inbox.
• Sticky folders: drop-down menus that stay on the bar in every workspace.
• Other favorites, one click away at the right of the bar.
• Folders open as menus and submenus. Drag and drop to rearrange, and add separators to group things.
• Pinned favorites and search results switch to the site's tab if it's already open, instead of opening a duplicate.

TIDY TABS
Press Alt+Shift+K, or use the bar's menu, to review the tabs in the window. Close the ones you've already saved as favorites in one go, and add the ones worth keeping to your workspace or one of its folders.

MAKE IT YOURS
• Seven icon themes, inspired by Edge, Safari, Firefox, Chrome, Windows 98 and more.
• Typography: any installed font, plus size, weight, condensed widths, letter spacing and case.
• Show the bar at the top or bottom, with or without titles, and choose whether it pushes the page down.
• Optionally keep pinned-favorite tabs folded away in a single ★ tab group.
• Press Alt+Shift+Y to show or hide the bar.

PRIVATE BY DESIGN
Superfavorites Bar collects no data. It has no servers, no analytics and no tracking, and your favorites and tabs never leave your device except through your browser's own sync.

GETTING STARTED
After installing, the bar appears on web pages. Browsers don't allow extensions on their own pages, such as settings and the New Tab page. The extension creates a "Superfavorites" folder under Other favorites. Add favorites to it, or click + on the bar, and open Settings from the toolbar icon to choose another folder.

Open source: https://github.com/pantulis/superfavorites-bar
```

## Search terms

Edge: at most 7 terms, 30 characters each, 21 words in total.

```
bookmarks bar
favorites bar
workspaces
bookmark manager
tab manager
productivity
quick switcher
```

## Category

Productivity

## Single purpose

Edge: at most 1,000 characters.

```
Superfavorites Bar has a single purpose: to give the user a second bookmarks bar, organized into workspaces, so they can reach their own favorites quickly.

The bar is drawn at the top or bottom of web pages and shows the favorites in a folder the user chooses. Each subfolder is a workspace (for example Work, Home or Travel), and the user switches between them from the bar or with a keyboard shortcut. Every feature serves that bar: pinned and sticky favorites that stay visible in every workspace, folder menus, a search across favorites, a Tidy tabs dialog that closes tabs already saved as favorites and saves the rest, and settings for how the bar looks (position, icon theme, typography).

Everything is stored in the user's own favorites and on their device. There is no account, no server and no tracking.
```

## Permission justifications

| Permission | Justification |
|---|---|
| `bookmarks` | The bar is built from the user's favorites, so the extension reads the favorites folder the user chooses and shows its contents on the bar. It also changes favorites when the user asks it to: adding the current page, renaming, moving between workspaces and folders, deleting, and saving tabs from Tidy tabs. Workspaces, pinned favorites, sticky folders, colors and separators are stored as ordinary favorites, so they sync across the user's devices with the browser's own sync. On first run it creates one folder, "Superfavorites", under Other favorites. Favorites outside that folder are only read to show Other favorites on the bar and are never changed unless the user moves an item there. |
| `storage` | Keeps display settings (icon theme, typography) on the device and caches the favorites tree so the bar draws quickly. |
| `favicon` | Shows each favorite's site icon from the browser's own icon cache. |
| `scripting` | Adds the bar to tabs that were already open when the extension is installed or updated. |
| `fontSettings` | Lists the fonts installed on the device for the typography settings. |
| `tabs` | Shows which pinned favorites are open or have unread items, switches to a favorite's tab if it's already open, and lists the window's tabs in Tidy tabs. |
| `tabGroups` | Optional feature that keeps pinned-favorite tabs in a single collapsed ★ tab group. |
| Host permission `<all_urls>` / content script on all sites | The bar is drawn at the top or bottom of every page the user visits. It doesn't read or change page content beyond adding the bar and, if enabled, shifting the page down so the bar doesn't cover it. |

## Remote code

No, I am not using remote code. All scripts are included in the package.

## Data usage

Collects no user data. Nothing is sent to any server; tab titles and addresses are only used on the device. Leave every data type unchecked and tick the certifications under "I certify that the following disclosures are true".

Privacy policy: https://github.com/pantulis/superfavorites-bar/blob/main/PRIVACY.md

## Notes for certification

```
No account or setup needed. After installing, a bar appears at the top of web pages (not on edge:// pages or the New Tab page). On first run the extension creates a folder named "Superfavorites" under Other favorites; add a few favorites to it (or click + on the bar) to see them.

To try the main features:
- Click the workspace selector at the left of the bar to create or switch workspaces.
- Press Alt+A for the quick switcher; type to search favorites.
- Right-click the bar for Tidy tabs and Settings, or click the toolbar icon for settings.

The extension makes no network requests except downloading a workspace icon from a web address the user enters. Hidden favorites with https://superfavorites.invalid/... addresses are markers that store settings (sticky folder, color, separator) inside the favorites so they sync; the .invalid domain is reserved and never resolves.
```

## Images

| Store field | File |
|---|---|
| Extension logo (Edge, 300×300) | `docs/store/logo.png` |
| Small promotional tile (440×280) | `docs/store/promo-small.png` |
| Large promotional tile (1400×560) | `docs/store/promo-large.png` |
| Screenshots (1280×800, up to 6 in Edge) | `docs/store/1-workspaces.png` … `6-settings.png` |
