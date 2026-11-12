# Reader: end-to-end test checklist

Run it on each device in the table (portrait **and** landscape where it says so). Mark each line ✅ pass, ❌ fail (note what happened), or ➖ not applicable.
Test comic: any `.cbz` with several panels per page and lettered balloons (the checklist was written against *Clayface: Celebrity Dirt #1*).

| Device | Build | Date | Tester |
|---|---|---|---|
| Phone (Android emulator, 1080×2400) | release APK | | |
| Tablet (Android, Pixel Tablet 1000×1600) | release APK | | |
| iPad (simulator, iPad Pro 11") | Release | | |
| A real phone | release APK | | |

## 0. Setup
- [ ] App installs and opens to Reading Now with no crash.
- [ ] Import the comic from Files / Downloads; it appears on the shelf with a cover and the right page count.
- [ ] Open it: page 1 shows whole, not stretched, centred, with margins matching the page.
- [ ] Tap the centre: overlay appears (back, title, ★, ⋯, page strip, scrubber). Tap again: it hides.

## 1. Basic reading (nothing special switched on)
- [ ] Swipe left/right turns pages; position counter and scrubber follow.
- [ ] Tap the right/left 30% turns pages (and the scrubber jumps to a page).
- [ ] Pinch zooms about the fingers; drag pans; double-tap zooms in and out. Panning past an edge hands the swipe to the pager.
- [ ] Pull a page down at 1× leaves the comic.
- [ ] Close and reopen: it returns to the same page.
- [ ] ★ bookmark adds/removes; Bookmarks list jumps to the page.
- [ ] Reading mode LTR / Manga (RTL) / Webtoon each work; the current page is kept when switching.

## 2. Page animations (Display ▸ Page animation)
- [ ] **Slide**: normal paging.
- [ ] **Fade**: pages cross-fade, no flash of black.
- [ ] **Page flip**: the leaving page swings about the left edge and darkens; the next page is under it; no gaps.
- [ ] **Page curl**: dragging bends the page around a cylinder (back of the paper visible, fold shadow/highlight, shadow on the next page). Release past halfway completes it, before halfway cancels it. A tap on the edge plays the whole turn. Works forward **and** backward.
- [ ] Curl falls back to a plain slide in RTL, webtoon, spread and fit-width, with no errors.
- [ ] No blank frame or flicker at the start or end of any turn.

## 3. Guided panel reading
- [ ] ⋯ ▸ **Guided view** turns it on; bar shows `Page n · i/N`.
- [ ] **Double-tap** a panel on the whole page: the camera moves to *that* panel, centred, filling the width or height without distortion.
- [ ] Other panels are **dimmed** (Display ▸ Guided reading ▸ Dimmed), **hidden** (Solid) or **left alone** (Off); the bar's ◐ ● ○ button cycles them.
- [ ] Right 70% = next panel, left 30% = previous; the ‹ › buttons do the same. In Manga mode the zones mirror.
- [ ] Camera moves smoothly, no jump or flash; speed changes with Display ▸ camera speed.
- [ ] **Last panel → next**: camera pulls back, the next page appears whole, pauses (Display ▸ pause, default 0.5 s), then moves into its first panel.
- [ ] **First panel ← back**: pulls back, goes to the previous page and lands on its **last** panel.
- [ ] End of the comic: stays on the last panel, no crash. Start of the comic: same.
- [ ] Double-tap while focused (or the Android back button) returns to the whole page and exits guided.
- [ ] Controls hide after ~3 s and come back on a tap.
- [ ] **Manual fixes** (⋯ while guided): *Add a panel by hand* (drag a box; it slots into reading order and is remembered after closing the comic), *Remove this panel*, *Redo panel detection*.
- [ ] Pages with no gutters (full-bleed art) fall back to one whole-page "panel" and still page forward.
- [ ] Panel counts look right on several pages (spot-check at least 5 pages against the real layout).

## 4. Bubble Zoom
- [ ] ⋯ ▸ **Bubble zoom** on: bar says *Finding balloons…* then *Tap a balloon*.
- [ ] Tap a balloon: **that balloon alone** grows **in place over its original** (no second copy anywhere else on the page), whole outline and tail visible, lettering sharp.
- [ ] Page behind is only lightly dimmed and is not changed.
- [ ] **A− / A+** make it smaller / larger smoothly; Display ▸ *Bubble zoom size* slider does the same; the size is remembered.
- [ ] ‹ › step to the previous/next balloon in reading order (LTR and RTL); the old one settles back as the next lifts.
- [ ] **Swipe sideways** while lifted: the current balloon contracts as the next expands, following the finger; letting go past ~⅓ (or a flick) commits, otherwise it eases back.
- [ ] Double-tap, tap the page, or ⤡ zooms back out; the page is exactly where it was.
- [ ] Tapping a different balloon while one is up switches to it.
- [ ] A balloon near the screen edge slides back on-screen and stays whole.
- [ ] No balloons detected: tapping the middle of the page lifts a hand-picked window; edges still turn the page.
- [ ] **＋** draws a balloon by hand (it joins the order and is remembered); **⌫** removes a wrong one.
- [ ] Detection is cached: reopen the same page, the balloons are there instantly.
- [ ] Turning the page while a balloon is up drops it cleanly.
- [ ] Bubble Zoom off: reading is unchanged.

## 5. Rotation (do each of these on **phone, tablet and iPad**)
- [ ] Rotate on a plain page: two-page spread in landscape, back to one page in portrait, **same page**.
- [ ] **Landscape choice**: ⋯ ▸ *Landscape: show one page / show two pages (open book)* and Display ▸ *When the screen is turned sideways* both switch between the open-book spread and a single page, on the same page, and the choice is remembered after closing the comic.
- [ ] Two-page spread in RTL puts the first page on the right.
- [ ] With **guided** on, rotate to landscape: single page filling the screen, camera still on the same panel (re-centred for the new shape), mask follows, bar still usable.
- [ ] With **bubble zoom** on, rotate while a balloon is lifted: it re-lifts correctly for the new size; no duplicate; ‹ › and A−/A+ work.
- [ ] With **page curl** chosen, rotate to landscape: single page, curl still works.
- [ ] In landscape, turning on Guided / Bubble zoom from ⋯ switches the spread to a single page and keeps the page.
- [ ] Double-tap in landscape (spread) starts guided reading.
- [ ] Rotate back and forth five times quickly: no crash, no blank screen, no stuck mask.

## 6. Tablet / iPad specifics
- [ ] Layout uses the larger screen; controls are not tiny; nothing overlaps the system bars.
- [ ] Guided camera and balloon sizes look right (not over-zoomed on a big screen).
- [ ] Split-screen / resize (Android multi-window, iPad Stage Manager) re-lays out without a crash.
- [ ] Touch targets in the bottom bar are comfortable.

## 7. Settings persistence
- [ ] Force-stop and reopen: animation, mask style, camera speed, pause, double-tap choice, bubble size, bubble on/off are all remembered.
- [ ] Brightness and colour filters still work with every feature above.
- [ ] Incognito: no progress saved.

## 8. Robustness and performance
- [ ] Flip through a 25-page comic quickly: memory stays flat, no slowdown.
- [ ] Guided and balloon detection never block paging.
- [ ] Airplane mode / no server: local comics read normally.
- [ ] Kill the app mid-animation and reopen: no crash, position restored.
- [ ] `adb logcat` (Android) / Console (iOS) show no fatal exceptions during the whole run.

## 9. Library regressions (nothing else broke)
- [ ] Shelf, folders, drag to reorganise, delete (keep/delete contents), search, Physical/Digital filters.
- [ ] Reading orders, playlists, My Collection.
- [ ] Server library (OPDS) browse and download.
- [ ] Privacy lock, Make room, share page / share panel.
- [ ] Copy or translate text on a page.

## Known gaps (not bugs)
- Borderless / floating panels on some pages are not split; fix them with *Add a panel by hand*.
- Balloon detection can include a TV's on-screen text; use ⌫.
- Page curl is single-page, left-to-right, fit-to-screen only.

## Unified navigation (Android phone emulator, FF1 CBR)
- [x] LTR bubble mode: volume Up/Down cross page boundaries both ways (last bubble → next page's first; first → previous page's last); long press = one step; system volume untouched in the reader
- [x] LTR guided (panel) mode: last panel → next page's first panel, and back
- [x] Page mode: one page per press
- [x] RTL: bar shows "← RTL"; Left arrow = Next, Right arrow = Previous; volume Up still Next; left bar button = Next; centre/left taps mirrored
- [x] Android Back: leaves guided view first, then the reader; progress kept
- [x] Volume keys change system volume again outside the reader
- [x] Rotation portrait ↔ landscape (two-page spread): keys keep working
- [x] Mode choice survives full app restart (folder presets no longer override a hand-picked mode); guided on/off and LTR/RTL switches stay on the same page
- [x] Two comics keep their own direction (Midnight Sons LTR, FF1 Manga)
- [x] Balloon zoom → guided view starts on the panel that holds the balloon (was always the first panel)
- [x] Tablet emulator (2560x1600, landscape spreads): volume keys turn spreads, no crash
- [ ] Not tested: iOS (volume/arrow key capture is Android-only), iPad

## Permissions, http and iOS
- [x] Android APK declares no gallery permissions (no READ_MEDIA_*, READ_EXTERNAL_STORAGE); pictures come only from the system photo picker and the camera
- [x] Album watching (Mind Space) removed with expo-media-library; screens keep working, the toggle explains how to add screenshots by hand
- [x] Plain-http home servers allowed: Android usesCleartextTraffic=true; iOS NSAllowsLocalNetworking (LAN / .local only)
- [x] iOS Release simulator build succeeds (iPhone 17, iPad Pro 11"), app launches; arrow-key catcher compiled in
- [ ] iOS arrow keys not exercised at runtime (no way to tap through the simulator from here); volume buttons not captured on iOS
