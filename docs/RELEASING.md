# Releasing ComicPill

Two ways to ship, and you can use both: **APK** (share a file, no store needed)
and **Play Store** (when you're ready). Builds happen in Expo's cloud (EAS), so
no Android Studio is needed on your machine.

Everything below was set up in the repo (`eas.json`, `app.json`, the landing
page in `docs/p/`, the update manifest `docs/version.json`, `docs/privacy.html`).
The build and publish commands need **your** accounts, so you run them.

## One-time setup

1. **Expo account** — free, at expo.dev.
2. In this folder:
   ```bash
   npx eas-cli login
   npx eas-cli init          # links the project to your account
   ```
3. **GitHub Pages** — repo *Settings → Pages* → Source: *Deploy from a branch* →
   `main` / `/docs`. This serves the share page, the update manifest and the
   privacy policy at `https://mukund1312.github.io/ComicPill/`.

## Ship an APK (what your friends install)

1. Bump `version` in `app.json` (e.g. `1.0.0` → `1.1.0`).
2. Build:
   ```bash
   npx eas-cli build -p android --profile preview
   ```
   The first build asks to create an Android **keystore** — say yes and let EAS
   manage it. Then **back it up** (`npx eas-cli credentials`, download it).
   Every future update must be signed with the same key or Android will refuse to
   install it over the old one.
3. When it finishes, download the `.apk` from the link EAS prints, and rename it
   **`comicpill.apk`** (the exact name — the share page and updater link to it).
4. Publish it on GitHub:
   ```bash
   gh release create v1.1.0 comicpill.apk --title "ComicPill 1.1.0" --notes "What's new…"
   ```
5. Tell installed apps a new version exists:
   ```bash
   node scripts/publish-manifest.mjs "One sentence about what's new"
   git add docs/version.json && git commit -m "Release 1.1.0" && git push
   ```
   Installed Android apps notice within a day (or immediately via
   *Settings → About → Check for updates*) and offer the download.
   Add `--min 1.0.0` to make anything older show a *"Please update"* banner
   that can't be dismissed.

**Test it end to end once:** install the APK on a phone → share a playlist →
open the link on a phone *without* the app → it should show the install steps →
install → come back to the link → *Open in ComicPill*.

## Ship to the Play Store (when you're ready)

1. Create a **Google Play Console** developer account (one-time US$25).
2. Create the app in the console. The package name is **`com.mukund.comicpill`** —
   it can never be changed once published, so decide now if you want a different one
   (edit `android.package` in `app.json` before the first Play upload).
3. Store listing needs: a **privacy policy URL** →
   `https://mukund1312.github.io/ComicPill/privacy.html`, screenshots, a
   description, and the *Data safety* form. Accurate answers: no data collected
   by the developer; camera / photos / notifications used on-device; optional
   user-supplied AI key sends user content to the provider they choose.
4. Build the store bundle and submit:
   ```bash
   npx eas-cli build -p android --profile production   # makes an .aab
   npx eas-cli submit -p android --profile production
   ```
   `submit` needs a Google service-account key (Play Console → *Setup → API access*);
   EAS walks you through it. The first release usually has to be uploaded by hand.
5. The `production` profile sets `EXPO_PUBLIC_DISABLE_UPDATE_CHECK=1`, so the
   Play Store build doesn't run the GitHub update check — the Store updates it.

## Faster updates without a new APK (optional)

JavaScript-only changes can be pushed over the air with EAS Update:
```bash
npx eas-cli update:configure     # one time; adds expo-updates + runtime settings
npx eas-cli update --branch production --message "Fix …"
```
Anything that adds a native module still needs a new build.

## Things worth knowing
- `versionCode` (Android's internal build number) is incremented for you
  (`autoIncrement` + remote versioning). That is what lets a new APK install over an old one.
- Expo Go can't run this app fully: notifications need a real build. The APK does.
- iOS isn't set up; an Apple developer account (US$99/yr) and `-p ios` would be the path.
