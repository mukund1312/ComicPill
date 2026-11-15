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

## Hidden shelf and haptics (15 Nov 2026, phone emulator, release build)

- [x] Swipe On My Phone right-to-left: panel follows the finger, settles half open. Not set up yet: offers "Set it up" → full-screen password form.
- [x] Set up (1234 twice) → saved; next swipe asks for the password with the keyboard already up.
- [x] Wrong password: red field, "Wrong password", panel shakes, warning haptic. Right password: slides fully open.
- [x] Long-press a comic → "Move to hidden shelf": shelf count 7 → 6, toast, comic only on the hidden shelf; not in Reading Now.
- [x] Leave the app (Home) and come back: hidden shelf shut, password asked again.
- [x] Open a hidden comic from the panel; Back returns to the open hidden shelf; Back again locks it.
- [x] Settings → Hidden shelf: status, count, change password, forgot (deletes hidden comics), turn off (moves them back).
- [ ] Onboarding "Want a hidden shelf?" step (after the storage step) — covered by the stage-order unit test only, not run on a device.
- [x] Haptics recorded by the system (dumpsys vibrator_manager) for menus, selection, hide, unlock; the emulator plays them at 0 strength, so feel them on a real phone.
- Note: on phones with gesture navigation, start the swipe away from the very right edge — a swipe from the edge itself is Android's Back gesture.

## Design fixes (15 Nov 2026)

- [x] Fresh install (Android 8): opens on the welcome screen, no sign-up. Settings → Create an account (optional) → signed in, email shown → Delete account → second prompt offers clearing reading data (Keep it) → relaunch opens Today, no sign-in.
- [x] Library → Add comics: four rows (Copy to this phone / Link from the cloud / Connect a comic server / Scan your shelf); the first two ask Files or A whole folder.
- [x] My Collection header: Search, Add, More only; Select · Filter · Sort written out above the grid. Discover: Search, "Wishlist" and "Filter" with words; Comics per row inside the filter sheet.
- [x] Library sub-pages (Playlists, Wallet, Mind Space, Compare) have a back button; tapping the Library tab from them returns to Library home.
- [x] Settings regrouped: You (profile, notifications, account), Reading, Privacy & security, Permissions, App, Help.
- [x] Reader balloon bar: "Balloon 1 of 6 · reading left to right →", bigger A−/A+, page icon; one-time tip on the first lifted balloon, again from ⋯ → "What do the balloon buttons do?".
- [x] Help & feedback: "Email it" opens the email app addressed to the support address (Gmail opened on the emulator); "Save for later" keeps notes; "Email all" sends saved notes.

## Play blockers pass (15 Nov 2026, release build, phone emulator)

- [x] AAB/APK built without EXPO_PUBLIC_ENABLE_UPDATE_CHECK: Settings has no "Check for updates", the footer doesn't mention it, About has no update row.
- [x] Permissions: Camera, Internet, Network state, Vibrate, Wake lock, Notifications, Foreground service, Biometric, Boot completed, badge. No READ_MEDIA/storage/location/audio.
- [x] Settings → Permissions lists Camera and Notifications only; copy no longer mentions screenshots of your library.
- [x] Mind Space: "Add screenshots" opens the system PhotoPicker ("This app can only access the photos you select"); picked images are copied to private storage, read on the phone and listed for review; unrelated ones are skipped. Settings no longer offers album watching.
- [x] Today: eyebrow is "TONIGHT'S PICK" (no internal bucket name); a new reader is told "A good place to start" instead of "Fits your taste" (covered by a unit test); mood chips render.
- [x] expo install --fix: 14 packages on the SDK 57 versions; expo-doctor 21/21; tsc, lint (0 errors), 1,095 tests pass.
- Not done here: pushing the privacy page to GitHub Pages and the Play Console forms (see docs/PLAY-CONSOLE.md).

## Fingerprint unlock (15 Nov 2026, phone emulator with an enrolled fingerprint)

- [x] Swipe to the hidden shelf: the system fingerprint prompt appears; a touch opens the shelf fully.
- [x] Tap a locked comic: fingerprint prompt; a touch opens it in the reader.
- [x] Cancel the prompt ("Use password"): ComicPill's password box appears, and the password opens it.
- [x] Leaving the app (Home) and coming back locks the comic again (relockAll was never called before; now on going to the background).
- [x] Settings → Privacy & security → "Unlock with fingerprint" (shown only when the phone has one); on by default.
- [ ] iPhone/iPad Face ID: built in (NSFaceIDUsageDescription set) but not tried on a device.

## Theme, appearance and fingerprint choice (15 Nov 2026, phone emulator)

- [x] Appearance: tapping a theme previews it and shows "Apply <name>" + Cancel right under that card; same for fonts. The saved one says "✓ Current". Page no longer scrolls under the status bar.
- [x] Gotham applied: Library, Playlists, Mind Space, Wallet, Compare, On My Phone and the tab bar all gold (37 screens used to read fixed crimson tokens; their stylesheets are now built from the theme).
- [x] Amazon (light) applied: Playlists, Mind Space, Help & feedback, shelf, action sheets readable on parchment.
- [x] Locking a comic with a fingerprint enrolled asks "Open this comic with your fingerprint?" → Password only → reopening asks only for the password (no fingerprint prompt).
- [x] The shelf redraws when the app comes back, so a re-locked cover is masked straight away.
- [ ] Hidden-shelf setup question (panel, Settings, onboarding) and the per-item "Open with fingerprint" menu switch use the same code path; not each clicked through on the device.
- Note: the comic page background in the reader stays dark on every theme (comics read best on dark; the reader's display settings change it).

## All themes + Display sheet (15 Nov 2026, phone emulator)

- [x] All 21 themes applied one by one and checked on Today, Library, Discover, Settings and Mind Space: backgrounds, cards, chips, buttons, tab bar, headings follow the theme (including the light ones: Krypton, Amazon, Doom, Symbiote, Reverse, Freeze, Harlequin).
- [x] Fonts are themed too: every screen's stylesheet now takes the chosen typography (35 files).
- [x] Fixed: Discover's featured card showed dark text on its dark photo wash under light themes; its text is now always light.
- [x] Reader → ⋯ → Display, filters and page animation: fixed heading, content scrolls (also when the swipe starts on a slider), sliders still drag sideways, sheet never taller than the screen.
- Deliberate exceptions (not themed): the comic page backdrop in the reader, the sepia filter, cover/placeholder art, the boot splash.

## Reader page strip (15 Nov 2026)

- [x] The bar under the page is now a slim strip: smaller thumbnails, a 4px progress bar with the page counter beside it, tighter spacing, sitting right against the bottom edge. The page being read stays visible above it (portrait and landscape).
- [x] Tapping or dragging the thin bar still seeks (it has a 28px touch area; tap at the middle of the bar jumped 41 → 71 of 116).
