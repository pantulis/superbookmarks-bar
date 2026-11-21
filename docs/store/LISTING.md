# Store listing text

Ready-to-paste text for the Edge Add-ons (Partner Center) and Chrome Web Store forms. The name and short description come from `manifest.json`.

## Description

Paste into **Description** (Edge: 250–10,000 characters).

```
Superfavorites Bar adds a second bookmarks bar to the top (or bottom) of every page, organized into workspaces: separate sets of favorites for work, home, a project or a trip, and you switch between them with one click or a keystroke.

WORKSPACES
• Each workspace is a folder of your favorites, with its own emoji or website icon and color.
• Switch from the selector at the left of the bar, or press Alt+A for a quick switcher.
• Type in the switcher to search every favorite and jump straight to it.

ALWAYS AT HAND
• Pinned favorites: icon-only shortcuts shown in every workspace, with a dot when their tab is open and a badge with the unread count (e.g. your inbox).
• Sticky folders: drop-downs that stay on the bar in every workspace.
• Your browser's Other favorites, one click away at the right of the bar.
• Folders open as menus and submenus; drag and drop to rearrange; separators to group things.

TIDY TABS
Close the tabs you've already saved as favorites in one go, and add the ones worth keeping to your workspace or one of its folders.

MAKE IT YOURS
• Seven icon themes, inspired by Edge, Safari, Firefox, Chrome, Windows 98 and more.
• Typography settings: any installed font, size, weight, condensed widths, letter spacing and case.
• Optionally keep pinned-favorite tabs folded away in a single ★ tab group.

SYNCS WITH YOUR FAVORITES
Everything lives in an ordinary favorites folder, so your workspaces sync to your other devices with the browser's own sync. No account, no servers, no tracking.

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

```
Shows a second bookmarks bar on web pages that organizes the user's favorites into switchable workspaces.
```

## Permission justifications

| Permission | Justification |
|---|---|
| `bookmarks` | The bar shows, adds, moves and edits the user's favorites. Workspaces, pins, sticky folders, colors and separators are stored as favorites so they sync. |
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
