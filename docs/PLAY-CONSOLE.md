# Play Console checklist for ComicPill

Everything here is something only you can do in Google Play Console (your account, your declarations). It is written from what the app
actually does as of 15 Nov 2026 (version 1.0.0, versionCode 26). Google changes the wording of its forms, so read each question and
answer it truthfully; where this file says "my reading", that is a judgement for you to confirm, not legal advice.

## Before you upload

- [ ] Upload `release/ComicPill-1.0.0.aab` (not the APK). It is built **without** the GitHub update checker: Settings has no
      "Check for updates" row. (The checker is off unless a build sets `EXPO_PUBLIC_ENABLE_UPDATE_CHECK=1`; only the shareable `preview` APK does.)
- [ ] **Publish the privacy policy first.** It must open without a login at the URL you paste into Play Console
      (planned: `https://mukund1312.github.io/ComicPill/privacy.html`). GitHub → repo *Settings → Pages* → Deploy from branch → `main` / `/docs`,
      after pushing the latest commits. Open the link on your phone to check it loads.
- [ ] Choose **Play App Signing** when asked (recommended; it is the default for new apps). Google keeps the app-signing key; the key
      you sign the upload with is `~/.comicpill-signing/` (the `keystore.properties` file and the keystore it points to).
      **Back that folder up now** (two copies, one off this Mac). Losing the upload key is recoverable through Play support;
      losing both is not.

## App content (Policy → App content)

| Section | What to enter |
|---|---|
| Privacy policy | The URL above |
| Ads | **No**, the app contains no ads |
| App access | All functionality is available without logging in. (An account is optional and lives only on the phone.) No test account needed |
| Target audience | Age groups **13+** (for example 13–15, 16–17, 18+). Do **not** pick under-13: the app is not designed for children |
| Content rating (IARC questionnaire) | Category: reference / utility or "other". It displays comic covers and titles and opens files the user provides, including from servers the user connects. Answer the violence / mature-theme questions for the *catalog and the sample content shown*, and say users can open content you don't control. My reading: **Teen** is a safe expectation; answer honestly rather than aiming for a rating |
| News app / Government / COVID / Health | **No** to each |
| Financial features | The Comic Wallet is a virtual ledger (no real money, no payments, no bank connection). Answer the form's questions literally; if a "financial features" option fits only a payments or banking app, choose none |
| Data safety | See below |
| Account deletion | The app lets someone create an optional account, so the form asks for a deletion method. In-app: **Settings → Delete account** (removes the email and password from the phone, and offers to clear reading data). The account is stored only on the device, so there is no server-side data to delete; the privacy policy says so |

## Data safety form

Principle: say what **leaves the phone**. The developer runs no server and receives nothing. Third parties receive data only when the user
uses an optional feature.

**Do you collect or share any of the required user data types?** My reading: **Yes**, because optional features send text or pictures
to third parties the user chooses. Declare the following, each marked **optional** (the app works without it), **not required**,
purpose **App functionality**, **processed ephemerally: no** unless the provider's terms say otherwise:

| Data type | When it leaves the phone | Recipient | Shared? |
|---|---|---|---|
| Photos (Mind Space screenshots the user approves, AI shelf scan photos) | Only when the user adds their own AI key and taps Send / Scan | Anthropic or OpenAI (the user's choice, the user's own key) | Yes, with a service provider the user chose |
| App activity → in-app search history (words typed when adding a comic) | When the user searches for a comic to add | Open Library, Comic Vine (if the user adds a key), AniList (Mind Space) | Yes |
| Other user-generated content (typed text sent to the AI for "Build my journey") | When the user taps Build my journey with their own key | Anthropic or OpenAI | Yes |

Not collected: name, email, address, phone number, contacts, location, files, audio, health, financial info, device or other IDs,
crash logs, diagnostics. (The optional account's email and password hash stay on the device in secure storage and are never transmitted.)

Security practices: **Data is encrypted in transit** (all lookups use HTTPS; plain-http is used only if the user connects their own
server that way). **Users can request that data be deleted**: yes (in-app, plus the contact email in the privacy policy).
The app has **not** been independently security reviewed unless you have had that done.

## Permissions declarations

The release manifest requests only: Camera, Internet, Network state, Vibrate, Wake lock, Notifications (Android 13+), Foreground service,
Biometric (optional passcode), Boot completed (reschedule reminders) and Google's standard notification/install-referrer ones.
There are **no** photo, video, storage, location, contacts, microphone or SMS permissions, so no "sensitive permissions" or
photo-and-video declaration form should appear. If Play Console asks about one anyway, tell me which and I will check the build.

## Store listing

- Contact email: **mukund.umashankar@gmail.com** (it is also the address inside the app's Help & feedback).
- Short description / full description: describe what the app does (a comic reader for your own CBZ/CBR/PDF/EPUB files, home comic
  servers, reading guides). Don't call it "free Marvel/DC comics"; it doesn't supply comics.
- **Screenshots: don't use Marvel, DC, Image or manga cover art.** Use the bundled sample comics (Nightwatch, Test pages) or your own
  artwork, otherwise a copyright complaint can get the listing pulled. The in-app catalog uses publisher covers as small thumbnails for
  identification; if you want zero risk, ask me to switch the catalog to text-only cards before launch.
- App icon 512×512, feature graphic 1024×500, at least 2 phone screenshots (and tablet screenshots if you want the tablet listing).
- Category: **Comics** (Books & Reference is the alternative).

## After the first upload

- Start on the **Internal testing** track, install from the Play link on a real phone, and open a comic, hide one, create and delete an
  account before promoting to production. New personal developer accounts must run a closed test with a minimum number of testers for
  a minimum number of days before production access: check *Dashboard → "Set up your app / Publish"* for the current requirement.
