# Privacy policy

*Superfavorites Bar, last updated 23 November 2026*

Superfavorites Bar doesn't collect, sell or share any personal data. It has no servers, no analytics and no tracking, and it never sends your bookmarks, tabs or browsing activity anywhere.

## What it stores, and where

- **Your workspaces, sticky folders, pins, colors and workspace icons** are stored as ordinary bookmarks (favorites) in the folder you choose. The browser syncs them like any other bookmarks if you've turned on sync, under your browser account's own privacy terms.
- **Display settings** (icon theme, typography, which dots and numbers to show and similar) are kept in the extension's local storage on each device and aren't synced.
- **A copy of the bookmarks tree, plus small copies of workspace icon images,** is kept in the extension's local storage so the bar draws quickly.

Removing the extension deletes its local storage. Your bookmarks stay where they are.

## Network requests

The extension makes one kind of request: when you give a workspace an icon by web address, it downloads that image (or, for a page, the icons the page declares) so it can show it. The request goes straight from your browser to the address you entered, and nowhere else. Website icons on the bar come from the browser's own icon cache.

## Permissions

- **Read and change bookmarks:** the bar shows, adds, moves and edits bookmarks in the folder you choose, and shows the browser's *Other favorites* / *Other bookmarks* folder.
- **Access to all websites:** the bar is drawn at the top or bottom of every page you visit. The extension doesn't read or change the page's content beyond adding the bar and, if you ask it to, shifting the page so the bar doesn't cover it.
- **Tabs and tab groups:** used to show which pinned favorites are open or have unread items, to list and close tabs in **Tidy tabs**, and for the optional ★ group that holds pinned-favorite tabs. Tab titles and addresses are only used on your device.
- **Favicons:** shows each site's icon from the browser's icon cache.
- **Font settings:** lists the fonts installed on your device for the typography settings.
- **New Tab page and search:** new tabs show the extension's start page, drawn on your device from your favorites. When a search there matches none of your favorites, pressing Enter hands the text to your browser's default search engine, exactly as typing it in the address bar would. The extension doesn't keep or send it anywhere else.
- **Storage and scripting:** keeps settings on the device, and adds the bar to tabs that were already open when the extension was installed or updated.

## Contact

Questions or concerns: open an issue at https://github.com/pantulis/superfavorites-bar/issues.
