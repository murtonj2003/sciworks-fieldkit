# sciworks-fieldkit

Offline data collection for wildlife transect surveys, built for teams that spend weeks without signal.

Built at **Science Works: Reinvent the Wheel**, a tools-for-science hackathon at Pillar VC, King's Cross,
London, 16–18 October 2026. Everything in this repository was written during the event.

> **Status:** in development during the hackathon. The shared code and sample data are in place; the two
> apps are being built now.

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
| Does | Survey and animal records saved on every tap; a typed-coordinate check against the transect line with a "did you mean?" fix; a scale-count species key; Team Lead form changes offline | Imports bundles from every phone without duplicates; one map of all teams; a review queue; an AI reviewer that drafts fixes for a person to approve; Darwin Core export for GBIF |

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

## Run the shared tests

Needs Node 20 or newer.

```bash
npm install
npm test
```

To rebuild the demo data and the sample bundles:

```bash
npm run demo-data -w shared && npm run fixtures -w shared
```

## Data, credits and licences

- **Code:** MIT (see `LICENSE`).
- **Demo species pack:** an *illustrative demo pack, not for field ID*. It was built from cited open sources
  under CC BY 4.0; see `demo-data/attribution.md`. Every value keeps its source, licence and the source's
  own wording. The transects are synthetic demo lines, not real trails.
- **Exports** follow Darwin Core (Event + Occurrence + MeasurementOrFact, with Humboldt survey-effort fields).
