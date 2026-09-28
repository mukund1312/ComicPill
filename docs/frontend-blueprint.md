# ComicPill — Complete End-to-End Frontend Design Blueprint

> Saved verbatim from the product brief given to the frontend build (Codex).
> Mockup collages referenced below live in `docs/mockups/` (01–08, matching the
> eight sections they illustrate). This document is the UI/UX spec;
> `README.md` in the repo root documents the backend this UI is built against
> (hooks, engines, data shapes, event model) — read that first for how to wire
> a screen to real data.

# COMICPILL — COMPLETE END-TO-END FRONTEND DESIGN BLUEPRINT

Design the complete production-ready frontend experience for **ComicPill**, a premium mobile application for comic readers and collectors.

This is NOT Goodreads, IMDb, Netflix, Amazon, or a generic comic database.

ComicPill is a **personal decision system for comics**.

Its two fundamental questions are:

1. **What should I read tonight?**
2. **What deserves a place in my physical collection?**

The library is supporting infrastructure.

The actual product is the decision-making experience.

Design the entire application end-to-end as one coherent premium product.

---

# 1. PRODUCT PERSONALITY

ComicPill should feel like:

- premium
- cinematic
- sophisticated
- collector-oriented
- fast
- opinionated
- personal
- calm
- editorial
- slightly mysterious
- extremely polished

Avoid:

- generic SaaS dashboards
- Netflix clones
- IMDb information density
- Amazon shopping UI
- excessive gradients
- excessive glassmorphism
- gaming UI
- neon cyberpunk overload
- childish comic-book typography
- superhero clichés
- excessive card nesting
- huge amounts of metadata
- complicated menus
- overwhelming recommendations

The app should feel like:

**a beautifully designed personal comic curator living inside the user's pocket.**

Think:

premium editorial magazine
× luxury bookshop
× modern native mobile app
× personal curator
× subtle noir atmosphere.

---

# 2. VISUAL THEME

Use the established **BLACK + DEEP RED ComicPill theme**.

This theme must remain consistent across every screen.

## Core palette

Background:
`#08090B`

Elevated surface:
`#101114`

Secondary surface:
`#17181C`

Border:
`#27282D`

Primary red:
`#E32636`

Deep crimson:
`#A80D1C`

Pressed red:
`#BF1726`

Primary text:
warm ivory / off-white

`#F1EDE6`

Secondary text:
`#A6A3A0`

Muted text:
`#6F6D6A`

Positive:
subtle muted green

Warning / Buy on Sale:
warm gold / amber

Digital:
subtle cool blue

Try Digital:
muted violet

Never turn the app into a multicoloured interface.

Comic artwork should provide most of the visual colour.

The UI itself stays restrained.

---

# 3. TYPOGRAPHY

Use an editorial combination.

Display / section titles:

A condensed or elegant editorial serif/condensed display typeface.

Examples of the FEEL:

- Playfair Display
- Barlow Condensed
- Instrument Serif
- similar premium editorial typography

Body/interface text:

clean modern sans-serif similar to Inter.

Hierarchy:

Hero / Display — 34px
Section title — 24px
Card title — 18px
Body — 16px
Metadata / caption — 13px

Large headings should feel almost like chapter headings in a graphic novel collection.

Do not overuse uppercase.

Use uppercase selectively for tiny editorial labels such as:

TONIGHT'S PICK

CONTINUE

YOUR COLLECTION

WHY THIS?

---

# 4. DESIGN PHILOSOPHY

Comic covers are the visual heroes.

Never compete with the comic artwork.

Use:

- large covers
- cinematic crops
- subtle shadows
- dark backgrounds
- deliberate negative space
- thin borders
- carefully restrained red highlights

Avoid putting every piece of information inside a card.

Screens should breathe.

The app should feel expensive.

---

# 5. CORE NAVIGATION

The main application has FIVE persistent destinations:

1. TODAY
2. LIBRARY
3. PATHS
4. COMPARE
5. DISCOVER

SCAN is NOT a normal tab.

Place a prominent circular **Scan FAB** floating above the bottom navigation.

The header contains:

ComicPill logo / contextual page title

notification or contextual actions when appropriate

profile avatar in the upper-right corner.

Tapping the avatar opens Profile.

Navigation should remain recognizable throughout the entire app.

---

# 6. APP STRUCTURE

Design every major flow and supporting state.

Complete structure:

## ENTRY

Splash
Welcome
Sign In
Sign Up
Forgot Password

## ONBOARDING

Value proposition
Import / Scan collection
Confirm scanned books
Ownership selection
Already-read selection
Quick ratings
Taste calibration
15-card discovery deck
Initial taste summary
Onboarding complete

## MAIN APP

Today
Library
Paths
Compare
Discover

## GLOBAL FLOWS

Scan
Comic detail
Check-in
Search
Filters
Sheets
Profile
Sources / metadata transparency

## SUPPORTING SCREENS

Notifications
Privacy
Data controls
Accessibility
Account
Help / feedback

Do not design these screens as disconnected mockups.

Design a coherent FLOW.

---

# 7. SPLASH SCREEN

Create a cinematic minimalist splash screen.

Black background.

ComicPill wordmark.

ComicPill:

"Comic" in ivory.

"Pill" in deep crimson.

Optional subtle illustration:

a solitary reader or detective-like silhouette standing beneath a red moon.

Tagline:

**Better decisions. More great comics.**

No clutter.

After a short elegant transition, enter authentication or onboarding.

---

# 8. AUTHENTICATION

Create:

Sign In
Sign Up
Forgot Password

Keep authentication extremely simple.

Logo at top.

Editorial heading.

Email.

Password.

Primary red CTA.

Optional:

Continue with Google
Continue with Apple

Avoid oversized login cards.

The background itself is the canvas.

---

# 9. ONBOARDING — WELCOME

Headline:

**Find your next great comic tonight.**

Supporting copy:

Personalized recommendations.

A smarter library.

Better buying decisions.

Use three clear value statements:

Read better
Discover more
Collect smarter

CTA:

**Let's Get Started**

---

# 10. ONBOARDING — BUILD YOUR LIBRARY

Ask the user how they want to begin.

Three large options:

SCAN MY SHELF

UPLOAD SCREENSHOTS

START MANUALLY

Explain:

"You can always add more later."

The recommended route should be scanning/importing.

---

# 11. SCAN INTRODUCTION

Explain visually:

**Turn your shelf into a library.**

Allow:

Camera Scan

Upload Photos

Upload Screenshots

Manual Search

Show a premium illustration of comic spines / covers being detected.

---

# 12. CAMERA SCANNER

Create an immersive camera interface.

Full-screen camera.

Dark controls.

Red framing brackets.

Live copy:

"Fit your comics inside the frame."

Allow:

Flash

Gallery

Capture

Multi-photo scanning

Manual entry

Show subtle detection rectangles when titles are recognized.

No unnecessary chrome.

---

# 13. MULTI-IMAGE UPLOAD

Allow up to several photos/screenshots.

Create a grid showing selected images.

Each selected image gets:

checkmark

remove control

reorder support if useful

CTA:

SCAN 7 IMAGES

---

# 14. SCANNING PROGRESS

Do NOT show a generic spinner.

Create progressive scanning feedback.

Example:

Scanning 9 comics...

✓ Reading covers and spines
● Matching titles
○ Checking editions
○ Preparing your results

Progress bar.

As results become available, progressively reveal them.

Make this screen beautiful enough that waiting feels intentional.

---

# 15. SCAN RESULTS

Show cover grid.

Each detected comic gets one of:

✓ MATCHED

? REVIEW

+ UNKNOWN

Matched books:

green/subtle success indicator.

Ambiguous books:

red/orange question indicator.

CTA:

REVIEW 2 MATCHES

---

# 16. RESOLVE MATCH

For ambiguous identification, display:

original scan crop

top three candidate comics

cover

title

publisher

year

edition

Select:

THIS IS IT

or:

NONE OF THESE

Never pretend uncertain identification is certain.

---

# 17. OWNERSHIP SELECTION

After matching the batch ask:

**How do you own these?**

PHYSICAL

DIGITAL

BOTH

Apply to all with optional per-comic overrides.

Use strong iconography:

book

device

stacked book/device.

---

# 18. CONFIRM LIBRARY IMPORT

Display all detected books in a clean list.

Example:

Batman: The Long Halloween — Physical

Saga Vol. 1 — Digital

Watchmen — Both

Allow inline correction.

Primary CTA:

**Add 9 Comics to Library**

---

# 19. ALREADY READ?

Immediately after library creation ask:

**Which of these have you already read?**

Use cover grid.

Tap covers to select.

Continue.

---

# 20. QUICK RATINGS

For books the user has finished, quickly gather ratings.

Do NOT use complex star ratings here.

Use:

MEH

GOOD

LOVED

Large tactile controls.

Use one book per screen/card.

Show progress:

2 / 6

Allow skip.

---

# 21. TASTE CALIBRATION

Introduce ComicPill's signature slider interaction.

Ask questions like:

How dark do you like your stories?

Light
Balanced
Dark

or five-stop variants.

Use a large horizontal slider.

The active section glows red.

White circular thumb.

Words subtly animate while dragging.

Questions can explore:

Tone
Violence
Scale
Complexity
Mystery
Pace
Art-forwardness
Commitment

Do not expose technical fingerprint terminology to users.

Ask these as human preference questions.

---

# 22. DISCOVERY CALIBRATION DECK

After basic ratings, show approximately 15 comics.

One giant cover card.

Card information:

cover
title
genre chips
tiny one-line description

Gesture model:

SWIPE LEFT = Not for me

SWIPE RIGHT = I'd read this

SWIPE UP = Quick rate

Buttons may also be available for accessibility.

Cards should tilt slightly while dragging.

The next card should appear beneath the current one.

Make this interaction satisfying.

---

# 23. ONBOARDING COMPLETE

Show a visual summary.

Headline:

**You're all set.**

Then:

"We know enough to start helping."

Display:

Your strongest interests

Your reading style

Your exploration level

A few example genre chips

Primary CTA:

**Find My First Read**

This transitions into Today.

---

# 24. TODAY — THE HEART OF COMICPILL

This is the most important screen in the entire application.

It should immediately answer:

**What should I read tonight?**

Header:

Good evening, [Name].

Then:

**What are you in the mood for?**

Mood pills such as:

Dark

Mysterious

Epic

Character-driven

Fun

Emotional

Surprise Me

Selecting a mood recalculates recommendations instantly.

---

# 25. TONIGHT'S PICK

Large cinematic hero recommendation.

Include:

comic cover

title

series/path

2–3 restrained tags

ownership indicator

ONE reason line

Main CTA:

**Read Tonight**

Secondary:

Why this?

Never display meaningless compatibility percentages.

No "97% match".

ComicPill should explain recommendations in human language.

Example:

"You've been enjoying grounded detective stories, and this continues that mood without repeating your recent reads."

---

# 26. WHY THIS TONIGHT?

Open a bottom sheet.

Show 2–3 understandable reasons.

Examples:

Matches your mood

You're ready for it in your reading path

You liked similar creators

A change from your recent Batman streak

Already in your library

Short enough for tonight

Keep explanations short.

No technical scoring formula.

Button:

NOT TONIGHT

---

# 27. TODAY — SECONDARY DECISIONS

Below the main recommendation display exactly three decision categories:

CONTINUE

Continue a current path.

SWITCH IT UP

Different style from recent reads.

EXPLORE

Something outside the user's normal taste.

Each card should be compact.

Cover thumbnail.

Title.

One sentence.

CTA.

Do not show endless feeds.

ComicPill should provide **few strong decisions**.

---

# 28. READING NOW

Optional section below the decision cards.

Show books actively being read.

Cover.

Progress.

Continue Reading CTA.

---

# 29. NOT TONIGHT

When the user rejects a recommendation, provide elegant feedback.

Headline:

**Not tonight?**

Supporting text:

"No problem. We'll adjust."

Actions:

FIND ANOTHER PICK

KEEP CURRENT PICK

This should not feel like failure.

---

# 30. LIBRARY

Cover-first personal library.

Top:

My Library

search

filter button

stats:

182 comics

Filter pills:

ALL

OWNED

READING

READ

WISHLIST

Grid:

3-column comic covers.

Under each:

title

small status indicator.

Avoid displaying unnecessary metadata.

---

# 31. LIBRARY FILTER SHEET

Filters:

Ownership

Owned

Physical

Digital

Both

Not owned

Reading status

Unread

Reading

Finished

Dropped

Wishlist

Genre

Publisher

Universe

Format

Sort:

Recently added

Title

Recently read

Series order

Allow:

RESET

APPLY FILTERS

---

# 32. LIBRARY SEARCH

Full-screen search experience.

Search across:

titles

series

creators

characters

publisher

Display results grouped subtly.

Each row:

cover thumbnail

title

type

status

quick add/action.

Search should feel instant.

---

# 33. WORK / COMIC DETAIL

This is the universal comic information page.

Large cover/artwork header.

Title.

Years.

Publisher.

Genres.

Creator information.

Short synopsis.

Tabs or segmented content:

OVERVIEW

EDITIONS

CREATORS

RELATED

But avoid overloading the screen.

Primary actions depend on ownership/status:

ADD TO LIBRARY

START READING

CONTINUE READING

CHECK IN

ADD TO WISHLIST

COMPARE

---

# 34. FORMAT VERDICT

On the comic detail page show a dedicated collector block:

**Best format for you**

Examples:

BEST IN PRINT

DIGITAL IS FINE

TRY DIGITAL FIRST

COLLECT

Explain WHY.

Example:

"Jock's moody artwork benefits from a larger physical format."

or

"A strong read, but little reason to pay collector prices."

This is a major ComicPill differentiator.

---

# 35. READING STATUS

Allow:

Unread

Reading

Finished

Dropped

If Reading:

show progress.

If Finished:

show rating and latest check-in.

---

# 36. USER NOTES

Comic details include personal notes.

Simple textarea.

Never turn ComicPill into a social review platform.

These notes are personal first.

---

# 37. PATHS

Paths solve:

**What should I read before or after this?**

Top:

Paths

Optional chips:

For You

Reading

Universe

Character

Events

Featured reading-path hero.

Show:

path title

description

number of works

estimated commitment

progress

CTA:

START PATH / CONTINUE PATH

---

# 38. PATH LIST

Display popular/personal paths.

Examples:

Batman: Gotham & Crime

Marvel Street Level

Superman & Heroic DC

Mature / Horror / Deconstruction

DC Gods, Crises & Multiverse

Marvel Cosmic → Secret Wars

Alternate Universes

Standalone & Other

Each list item:

mini cover

path name

works count

progress

bookmark.

---

# 39. PATH DETAIL

Very important screen.

Header:

path title

completion progress

Context mode:

SIMPLE

RECOMMENDED

COMPLETIONIST

Display ordered comic journey.

Vertical spine/timeline.

Each entry includes:

sequence number

cover

title

status

relationship

Use a prominent:

**YOU ARE HERE**

marker.

Completed works receive subtle success checkmarks.

Future items remain clear but muted.

---

# 40. CONTEXT LEVEL

Provide three levels:

SIMPLE

Only essential story.

RECOMMENDED

Important context + recommended side material.

COMPLETIONIST

Full connected reading experience.

Changing context should animate the path intelligently.

---

# 41. RABBIT HOLE

From a work or path allow:

**Go deeper**

Open Rabbit Hole.

Sections:

Related stories

Spin-offs

Same universe

Similar tone

Creator recommendations

Characters

Use a journey/list style.

Never create an endless algorithmic wall.

Maximum visual impression:

curated exploration.

---

# 42. DISCOVER

Discover is intentional exploration.

Header:

Discover

Filter chips:

FOR YOU

HIDDEN GEMS

NEW TO YOU

SHORT READS

LONG READS

GENRES

The core experience should be card swiping.

Large comic card.

Cover dominates screen.

Metadata minimal.

Two explicit controls:

PASS

READ

Gesture:

left = pass

right = interested/read

up = quick rate.

---

# 43. DISCOVER — SWIPE LEFT

Animate card:

translate left

rotate slightly

PASS stamp appears.

Underlying card becomes visible.

Use muted haptic feedback.

---

# 44. DISCOVER — SWIPE RIGHT

Animate right.

Red/positive READ marker.

Quick haptic feedback.

The title gets added to the user's interest queue.

---

# 45. DISCOVER — SWIPE UP

Swipe upward opens a lightweight quick rating.

MEH

GOOD

LOVED

This signal should take seconds.

The user returns directly to the deck afterward.

---

# 46. CHECK-IN

Check-ins teach ComicPill what the user actually enjoys.

Maximum approximately four cards.

Each check-in should take roughly ten seconds.

Progress indicator:

1 ● ○ ○ ○ 4

Every card can be skipped.

---

# 47. CHECK-IN CARD 1 — FEELING

Headline:

**How did it feel?**

Large signature slider.

Stops:

MEH

GOOD

GREAT / LOVED

depending on context.

Cover/title remains visible.

---

# 48. CHECK-IN CARD 2 — WHY?

Optional lightweight tags.

Examples:

Art

Characters

Mystery

World

Writing

Pacing

Too slow

Too violent

Too confusing

Allow personal note.

Keep optional.

---

# 49. CHECK-IN CARD 3 — CALIBRATION

Only when useful.

Example:

**How was the pacing?**

Too slow

Just right

Too fast

Same signature slider.

Do not always show this card.

---

# 50. CHECK-IN CARD 4 — APPETITE

Ask:

**What sounds good next?**

More like this

Mix it up

Something new

This influences exploration without exposing engine details.

---

# 51. CHECK-IN COMPLETE

Small celebratory state.

Not confetti-heavy.

Cover.

Check.

"Logged."

Potential follow-up:

NEXT RECOMMENDATION

BACK TO TODAY

---

# 52. COMPARE — PURPOSE

Compare answers:

**Should I buy this?**

**Physical or digital?**

**Which one should I buy first?**

The experience must remain analytical but simple.

---

# 53. COMPARE HOME

Tabs:

SINGLE TITLE

MULTIPLE TITLES

Header:

Compare

Optional current budget indicator.

---

# 54. SINGLE-TITLE COMPARE

Show comic hero.

Then side-by-side:

DIGITAL

₹199

Instant access

Lower price

PHYSICAL

₹999

Shelf value

Artwork

Collector value

Below:

ComicPill Verdict

Example:

COLLECT

or

DIGITAL IS FINE

or

TRY DIGITAL FIRST

Do not simply recommend the most expensive version.

---

# 55. FIVE PURCHASE LABELS

Design distinctive reusable badges:

COLLECT

Gold crown.

Meaning:

High keeper value. Worth physical ownership.

BUY ON SALE

Amber bag/tag.

Meaning:

Worth owning, but not at the current price.

DIGITAL IS FINE

Blue display/device.

Meaning:

Good read; little need for a physical copy.

TRY DIGITAL FIRST

Purple experimental/flask or book-device icon.

Meaning:

Read digitally first before committing shelf space.

SKIP

Neutral grey prohibited icon.

Meaning:

Low current relevance or low buying value.

These labels appear across:

Compare

comic detail

wishlist

basket

recommendations.

---

# 56. MULTI-TITLE COMPARE

Allow several comics.

Example:

Batman: Black Mirror — ₹999

Batman: Earth One — ₹2194

Saga Deluxe — ₹1999

Display compact rows with:

cover

title

digital price

physical price

purchase verdict

overflow menu.

At bottom:

**Pick One for Me**

---

# 57. PICK ONE FOR ME

Create a dedicated recommendation screen.

Explain decision using three groups:

MY TASTE

MY BUDGET

MY COLLECTION

Then prominently display recommendation.

Example:

**ComicPill recommends: The Black Mirror**

Physical — ₹999

Reasons:

Fits your current taste

High keeper value

Within budget

You don't already own it

Alternative:

**Buy nothing right now**

This MUST be possible.

ComicPill should be capable of saving users money.

---

# 58. BUDGET

Create monthly comic budget sheet.

Preset:

₹500

₹1,000

₹2,000

₹3,000

₹5,000

CUSTOM

Display:

Spent

Remaining

progress

Optional:

"Keep me under this budget."

---

# 59. PURCHASE BASKET

Shows candidate purchases.

Each item:

cover

title

recommended format

price

purchase label

remove

Total.

Budget remaining.

Button:

**Buy Selected**

The basket must never exceed the user's budget unless explicitly overridden.

---

# 60. WISHLIST / BUY QUEUE

Within Library or Compare provide a buying queue.

Sort by:

Recommended first

Collector value

Price

Recently added

Use purchase labels.

Let users manually enter prices where live pricing isn't available.

---

# 61. PROFILE

Profile is about:

**Who am I as a reader?**

Display:

avatar

username

short reading persona

stats:

Titles

Series

Finished

Currently Reading

Check-ins

Primary card:

**Your Reading Persona**

Example:

THE EXPLORER

"You enjoy darker character-driven stories but frequently branch into new worlds."

---

# 62. READING STATS

Provide useful metrics only.

Possible cards:

Books finished this month

Reading days

Average monthly reads

Active paths

Physical vs digital ownership

Completion rate

Use elegant bar charts / small heatmap.

Avoid business-dashboard aesthetics.

---

# 63. TASTE PROFILE

Translate taste engine data into understandable human language.

Possible sections:

Genres

Themes

Creators

Characters

Reading Style

Show normalized preference bars.

Examples:

Mystery — strong

Character driven — strong

Cosmic scale — moderate

High commitment — low

Do NOT expose internal scoring equations.

Taste profile should feel descriptive, not mathematical.

---

# 64. JOURNAL / HISTORY

Optional supporting experience built from check-ins.

Chronological timeline.

Example:

27 May

The Long Halloween

Loved

"Atmosphere was incredible."

24 May

Saga

Good

"Great characters."

This is personal history.

No social-feed UI.

---

# 65. SOURCES & TRANSPARENCY

ComicPill should have a clear metadata/source page.

For a comic show:

publisher

creators

ISBN

edition

metadata source

cover source

reading-order source where applicable.

Explain:

"ComicPill shows its sources so you know where information comes from."

Separate:

official metadata

third-party metadata

community/user corrections

ComicPill-generated interpretations.

Keep design clean and trustworthy.

---

# 66. SETTINGS

Supporting settings page.

Groups:

ACCOUNT

Notifications

Reading reminders

New release alerts

DATA & PRIVACY

Personalized recommendations

Anonymous analytics

Data export

Clear local data

Delete account

APP

Appearance

Language

Currency

Accessibility

SUPPORT

Help

Feedback

About ComicPill

Keep settings visually quieter than the main application.

---

# 67. NOTIFICATIONS

Design notification center.

Examples:

Your next path title is ready

A comic on your list is available

Time for a quick check-in

New release in a followed series

Avoid engagement spam.

Notifications should feel useful.

---

# 68. EMPTY STATES

Design polished empty states for:

Empty library

No wishlist

No active path

No reading history

No search results

No purchase queue

No recommendations yet

Offline catalog unavailable

Never use generic illustrations.

Keep the ComicPill noir/editorial visual language.

---

# 69. LOADING STATES

The application should feel instant.

Use skeletons only when necessary.

Never block Today behind full-screen network loading.

Show locally available content immediately.

For scanning, show actual progress.

For images, use subtle fade-in.

---

# 70. OFFLINE STATES

The core app should still feel usable offline.

Today

Library

Paths

Check-ins

Compare

should maintain normal visual structure.

If something requires network access:

show a small unobtrusive message.

Example:

"Prices update when you're back online."

Do not cover the screen with error states.

---

# 71. ERROR STATES

Design friendly inline errors for:

scan failed

unknown book

sync issue

metadata unavailable

price unavailable

Do not use frightening red full-screen errors.

Reserve bright red primarily for ComicPill branding and meaningful actions.

---

# 72. BOTTOM SHEETS

Use bottom sheets extensively for secondary controls:

Why this?

Filters

Mood picker

Ownership

Format selection

Budget

Quick rate

More actions

Bottom sheets:

rounded upper corners

near-black background

thin border

small drag handle

fluid spring motion.

---

# 73. COMPONENT SYSTEM

Build reusable frontend components.

## COVER

2:3 aspect ratio.

Variants:

tiny

list

grid

hero

## HERO CARD

Cover

title

reason

status

CTA.

## PILL

Active:

red filled.

Inactive:

dark surface + thin border.

## LABEL BADGE

Collect

Buy on Sale

Digital is Fine

Try Digital First

Skip.

## SLIDE SELECT

Signature preference/check-in slider.

## SWIPE CARD

Discover onboarding/discovery card.

## SHEET

Universal bottom sheet.

## COMIC ROW

Thumbnail

title

metadata

label/status

action.

## SECTION HEADER

Title

optional action.

## PROGRESS

Reading/path progress.

## EMPTY STATE

Reusable.

## BUTTONS

Primary

Secondary

Ghost

Destructive.

---

# 74. BUTTON HIERARCHY

PRIMARY

Filled ComicPill red.

Examples:

READ TONIGHT

START PATH

ADD TO LIBRARY

BUY PHYSICAL

SECONDARY

Dark surface with border.

Examples:

WHY THIS?

EXPLORE MORE

GHOST

Text/icon only.

Examples:

Skip

Cancel

More Details.

Never display multiple competing primary buttons.

---

# 75. ICONOGRAPHY

Use clean thin icons.

Recommended families:

Lucide

Phosphor

similar modern icon system.

No cartoon comic-book icons.

Special proprietary symbols can exist for:

Collect crown

Scan

Paths

Taste.

---

# 76. MOTION LANGUAGE

Motion should feel:

physical

responsive

subtle

premium.

Create four conceptual animation families:

PRESS

small tactile compression

SNAP

slider / selection snapping

SHEET

bottom-sheet movement

COMMIT

swipe completion / decisive actions

Avoid decorative animation with no meaning.

---

# 77. PRESS INTERACTION

Buttons/cards:

scale approximately 1 → 0.98

very quick

spring return

optional light haptic.

---

# 78. SLIDER INTERACTION

Thumb enlarges slightly when dragged.

Red fill follows continuously.

Each stop triggers tiny haptic.

Selected word transitions smoothly.

On release, snap naturally into place.

---

# 79. DISCOVER SWIPE

Horizontal card rotation should remain restrained.

Maximum approximately 12 degrees.

Swipe threshold should feel deliberate.

PASS and READ stamps fade in as commitment increases.

Up swipe should clearly differ from horizontal swipe.

---

# 80. SCREEN TRANSITIONS

Use directional transitions.

Forward navigation:

slight horizontal push.

Back:

reverse.

Modal:

vertical sheet.

Hero artwork can subtly maintain visual continuity.

Avoid flashy 3D transitions.

---

# 81. HAPTICS

Use haptics sparingly.

Slider stop

Successful scan

Swipe commit

Check-in completion

Add to library

Purchase decision.

Never vibrate every tap.

---

# 82. ACCESSIBILITY

Every gesture must have a tap alternative.

Swipe cards must include PASS and READ buttons.

Slider must support:

tap positions

increment/decrement actions.

Support reduced motion.

Maintain strong contrast.

Touch targets at least comfortable native-mobile size.

Respect dynamic text where possible without destroying layout.

---

# 83. RESPONSIVE DESIGN

Primary target:

modern Android phone.

Then adaptable to iOS.

Design using scalable spacing.

Do not hard-code around one device.

Cover grids should adapt gracefully to screen width.

---

# 84. SPACING SYSTEM

Use an 8px-based system.

Typical values:

4

8

12

16

24

32

48

Screen horizontal padding:

16–20px.

Cards should not feel cramped.

---

# 85. CARD DESIGN

Most cards:

near-black

1px subtle border

12–18px radius

very subtle shadow.

Do not put cards inside cards inside cards.

Use open layout sections whenever possible.

---

# 86. COVER PRESENTATION

Comic art is sacred.

Never:

crop faces carelessly

overlay huge labels over cover artwork

hide covers under gradients excessively

use aggressive colour filters.

Use tiny contextual badges in corners when necessary.

---

# 87. RED USAGE

Red is ComicPill's identity colour.

Use red for:

active tab

primary CTA

selected pills

slider fill

critical recommendation emphasis

small editorial accents.

Do not cover whole screens in red.

Red should feel valuable because it is restrained.

---

# 88. GOLD USAGE

Gold is reserved for collector-related meaning:

COLLECT

premium physical recommendation

special keeper status.

Do not use gold as a generic premium decoration.

---

# 89. INFORMATION DENSITY

Core rule:

**Progressive disclosure.**

A user should see the decision first.

Supporting details second.

Technical details last.

Example Comic Detail:

FIRST:

Title

Cover

Read / Buy verdict

THEN:

Summary

Reading order

Format

Creators

Metadata.

---

# 90. COPY STYLE

Voice:

confident

short

helpful

human.

Avoid:

algorithm jargon

marketing fluff

"AI-powered" everywhere

compatibility percentages

fake certainty.

Good:

"Great digitally. Save the shelf space."

"Worth owning if you love the artwork."

"You've read a lot of Batman lately. Try something different."

"This is the next story in your path."

"Not worth ₹2,199 for you right now."

---

# 91. FRONTEND PAGE MAP

The final design system should cover this complete page tree:

COMICPILL

→ Splash

→ Authentication

 → Sign In
 → Sign Up
 → Forgot Password

→ Onboarding

 → Welcome
 → Build Library
 → Scan / Upload
 → Match Results
 → Ownership
 → Already Read
 → Ratings
 → Taste Calibration
 → Discovery Deck
 → Ready

→ Main App

 → Today

  → Mood
  → Tonight's Pick
  → Why This?
  → Continue
  → Switch
  → Explore
  → Reading Now
  → Not Tonight

 → Library

  → Library Grid
  → Search
  → Filters
  → Work Detail
  → Reading Status
  → Notes
  → Format Verdict

 → Paths

  → Path List
  → Path Detail
  → Context Level
  → Rabbit Hole

 → Compare

  → Single Title
  → Multi Title
  → Labels
  → Budget
  → Basket
  → Pick One for Me

 → Discover

  → Deck
  → Pass
  → Read
  → Quick Rate

→ Global Scan

 → Camera
 → Upload
 → Processing
 → Results
 → Resolve Match
 → Ownership
 → Confirmation

→ Check-In

 → Feeling
 → Details
 → Calibration
 → Appetite
 → Complete

→ Profile

 → Overview
 → Reading Stats
 → Taste Profile
 → Reading History / Journal

→ Sources

→ Settings

 → Notifications
 → Privacy
 → Data
 → Appearance
 → Accessibility
 → Help.

---

# 92. CRITICAL USER JOURNEY 1

NEW USER:

Install

→ Splash

→ Sign Up

→ Scan Shelf

→ Confirm Matches

→ Select Physical/Digital

→ Select Already Read

→ Rate Finished Books

→ 15-card Discovery Deck

→ Taste Ready

→ Today

→ Read Tonight

→ Check-In

→ Better next recommendation.

Design this entire journey visually.

---

# 93. CRITICAL USER JOURNEY 2

RETURNING USER:

Open App

→ Today loads instantly

→ Pick mood

→ View Tonight's Pick

→ Why This?

→ Read

→ Finish comic

→ Check-In

→ Taste profile adjusts

→ Tomorrow's recommendation improves.

---

# 94. CRITICAL USER JOURNEY 3

COLLECTOR:

Open Compare

→ Add several comics

→ Enter prices

→ Set ₹2,500 budget

→ ComicPill labels each item

→ Collect / Digital / Skip

→ Pick One for Me

→ Basket stays inside budget

→ Buy physical only where worthwhile.

---

# 95. CRITICAL USER JOURNEY 4

READING ORDER:

Open comic

→ View Path

→ See where the user currently is

→ Change Simple → Recommended

→ Understand prerequisites

→ Read next

→ Explore Rabbit Hole if interested.

---

# 96. CRITICAL USER JOURNEY 5

DISCOVERY:

Open Discover

→ Swipe through cards

→ Pass

→ Interested

→ Quick rate

→ Deck learns

→ Return Today

→ recommendations subtly improve.

---

# 97. DESIGN DELIVERABLES

Do not produce only five hero mockups.

Design the **complete interface system**.

Create designs for at least:

1. Splash
2. Sign In
3. Welcome
4. Library import
5. Scanner
6. Scan progress
7. Match results
8. Resolve match
9. Ownership
10. Already read
11. Rating
12. Taste calibration
13. Discovery calibration
14. Onboarding complete
15. Today
16. Mood picker
17. Why this?
18. Not tonight
19. Library
20. Search
21. Filters
22. Comic detail
23. Reading status
24. Format verdict
25. Paths
26. Path detail
27. Context mode
28. Rabbit Hole
29. Discover
30. Swipe left
31. Swipe right
32. Swipe up
33. Check-in 1
34. Check-in 2
35. Check-in 3
36. Check-in 4
37. Check-in complete
38. Compare single title
39. Compare multiple titles
40. Purchase labels
41. Budget
42. Basket
43. Pick One for Me
44. Profile
45. Reading stats
46. Taste profile
47. Journal/history
48. Sources
49. Settings
50. Empty states / loading / errors.

---

# 98. DESIGN SYSTEM DELIVERABLE

Also create one master UI-kit board containing:

Colour tokens

Typography

Spacing

Buttons

Iconography

Navigation

FAB

Comic cards

Cover sizes

Pills

Purchase badges

Status badges

Sliders

Swipe cards

Bottom sheets

Progress

Forms

Search

Filters

Tabs

Lists

Charts

Empty states

Error states

Loading states.

Every component should show:

Default

Pressed

Selected

Disabled

Loading

where applicable.

---

# 99. FINAL DESIGN GOAL

When somebody sees ComicPill without knowing what it is, they should immediately understand:

This app loves comics.

This app respects collectors.

This app helps me choose.

This app is not trying to show me everything.

It is trying to help me make a good decision.

The final product should feel like:

**a personal comic curator + reading guide + collection advisor.**

Not another database.

Not another storefront.

Not another recommendation feed.

ComicPill should feel like a product people open because they trust its judgement.

Use the same premium BLACK / IVORY / DEEP CRIMSON design language across the entire experience.

The interface should be visually distinctive enough that a screenshot is immediately recognizable as **ComicPill**.

## Reference mockups

Eight annotated collages accompanied this brief, showing the app shell, onboarding,
Today, Library/Paths, Discover/check-in, Compare, Scan, and Profile/Settings.
They're saved in this repo at:

- `docs/mockups/01-app-shell-design-system.png`
- `docs/mockups/02-onboarding-taste-setup.png`
- `docs/mockups/03-today-experience.png`
- `docs/mockups/04-library-paths.png`
- `docs/mockups/05-discover-swipe-checkin.png`
- `docs/mockups/06-compare-buy-smart.png`
- `docs/mockups/07-scan-match.png`
- `docs/mockups/08-profile-stats-settings.png`
