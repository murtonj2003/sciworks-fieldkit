# sciworks-fieldkit

Offline data collection for wildlife transect surveys, built for teams that spend weeks without signal.

Built at **Science Works: Reinvent the Wheel**, a tools-for-science hackathon at Pillar VC, King's Cross,
London, 16–18 October 2026. Everything in this repository was written during the event.

> **Status:** working end to end on the demo data (phone → bundle → laptop → bundle → phone), covered by
> automated tests. Being polished for the demo on Sunday 18 October.

## The problem

Herpetologists walking jungle transects in Costa Rica spend up to six weeks in the field, with WiFi once
or twice a week. Today they use Epicollect5, which:

- can't change the survey form without internet, and a form update can wipe data that hasn't been
  uploaded;
- doesn't stop a mistyped GPS coordinate. On paper, the team spots the point that sits far off the
  transect line and fixes it at the desk, days later.

## What we're building

Two apps that never need a server to talk to each other. They swap **bundle files**: a zip of records and
photos, passed by AirDrop, Quick Share, USB or, when there's WiFi, the cloud.

| | Field app (`field/`) | HQ app (`hq/`) |
|---|---|---|
| Who | Surveyors and Team Leads, on the transect | The Data Manager, at base camp |
| Built with | React Native + Expo, SQLite on the phone | React + Vite, an installable web app that works offline |
| Does | Survey and animal records saved on every tap; a typed-coordinate check against the transect line with a "did you mean?" fix; species search that forgives misspellings; a scale-count species key; Team Lead form changes offline | Imports bundles from every phone without duplicates; one map of all teams; a review queue; an AI reviewer that drafts fixes for a person to approve; Darwin Core export for GBIF |

**Principle: never loses, never lies.** Records are append-only and saved the moment they're typed. Checks
and the AI only suggest; people decide.

## What's in the repo

```
shared/      The contract both apps use: data types, import checks, the bundle zipper,
             the coordinate checker, range and sun/moon checks. Pure TypeScript, tested.
  fixtures/  Sample bundles (FIELD_sample.zip, HQ_sample.zip) both apps test against.
demo-data/   The demo project: Costa Rica (La Selva) transects, form template, species pack, credits.
field/       The phone app (in progress).
hq/          The laptop app (in progress).
```

## Run it yourself

You need **Node 20 or newer** (we use 24) and npm. For the phone app you also need a phone with **Expo Go**
(free, from the App Store or Google Play).

### 1. Get the code

```bash
git clone https://github.com/murtonj2003/sciworks-fieldkit.git
cd sciworks-fieldkit
npm install
```

### 2. The HQ app (laptop)

```bash
npm run dev -w @sciworks/hq
```

Open the address it prints (usually http://localhost:5173). Then:

1. Click **Load demo project**.
2. Under **More**, choose **Import sample Field bundle**, or drag any `FIELD_*.zip` onto the window. The records
   appear in the queue and on the map, with their checks.
3. Approve or reject records. Export **Darwin Core** (approved records only), or **Make an HQ bundle for a team**
   to send results back to the phones.
4. *Optional, the AI reviewer:* open **AI review** and paste your own Anthropic API key. It is kept only in that
   browser, never in a file or a bundle. The reviewer only drafts fixes, and you approve each one. Without a key,
   everything else still works.

### 3. The Field app (phone), in Expo Go

```bash
cd field
npx expo start
```

Scan the QR code: with the Camera app on an iPhone, or from inside Expo Go on Android. If your WiFi blocks
phone-to-laptop traffic (venue and office WiFi often does), use `npx expo start --tunnel` instead.

In the app:
1. Tap **Load demo project**. This works offline.
2. Choose who is using the phone: **Ben Okafor · Team Lead**.
3. Tap **Start a survey**, then **+ Add animal**.
4. Try typing the coordinate `16P 825749 1151370` (UTM 16N): it lands about 1 km off the transect, and "Did you
   mean?" offers the swapped-digit fix.

### 4. The installed Android app (works in airplane mode)

Expo Go loads the app from your laptop, so it needs a connection. For a real offline test, build the app and
install it:

```bash
cd field
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

Open the link it prints on the Android phone to install the APK. The EAS project in `field/app.json` belongs to
the team's Expo account. To build under your own, remove `owner` and `extra.eas.projectId` from
`field/app.json`, then run `npx eas-cli@latest init` first.

### 5. Hand data between the two

- **On the phone:** **Send to HQ** makes a bundle file and opens the share sheet. Get it to the laptop by
  AirDrop, USB cable or email.
- **On HQ:** drag the file onto the window. Re-importing the same file never makes duplicates.
- **Back to the phone:** **Make an HQ bundle for a team**, then on the phone **Receive from HQ**.

### 6. Run the tests

```bash
npm test -w shared
npm test -w field
npm test -w @sciworks/hq
```

To rebuild the demo data and the sample bundles: `npm run demo-data -w shared && npm run fixtures -w shared`.

## Data, credits and licences

- **Code:** MIT (see `LICENSE`).
- **App icon and design renders:** made by the team with OpenArt (AI image generation) during the hackathon.
- **Demo species pack:** an *illustrative demo pack, not for field ID*. It was built from cited open sources
  under CC BY 4.0; see `demo-data/attribution.md`. Every value keeps its source, licence and the source's
  own wording. The transects are synthetic demo lines, not real trails.
- **Quoted source wording:** each value in the pack keeps a short quote from its source (under 100 characters) for
  citation only. Those quotes stay under their sources' own terms and are not relicensed by the pack's CC BY 4.0.
- **Species photos:** one small copy per species (18 of 19) in `demo-data/species-photos/`. They're CC BY 4.0 or CC0
  only, each licence confirmed against GBIF's own record, and each credited in `index.json` and `attribution.md`.
  They're remade with `demo-data/species-photos/make-species-photos.py`.
- **Satellite picture** (`demo-data/basemaps/`): ESA WorldCover 2021 Sentinel-2 composite, 10 m, **CC BY 4.0**.
  © ESA WorldCover 2021; contains modified Copernicus Sentinel data (2021) processed by the ESA WorldCover
  consortium. It's remade with `demo-data/basemaps/make-basemap.py`, and
  both apps show the credit whenever the picture is on screen.
- **Dependencies:** all open-source under permissive licences (MIT, ISC, Apache-2.0, BSD and similar), checked
  17 Oct 2026. `lightningcss` (MPL-2.0) is only a build tool inside Expo and is not shipped in the app.
- **Exports** follow Darwin Core (Event + Occurrence + MeasurementOrFact, with Humboldt survey-effort fields).
