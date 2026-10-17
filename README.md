# sciworks-fieldkit

Offline field data collection with on-device species ID, for researchers who work for weeks without
signal.

Built at **Science Works: Reinvent the Wheel**, a tools-for-science hackathon at Pillar VC, King's
Cross, London, 16–18 October 2026. Everything in this repository was written during the event.

> **Status:** in development during the hackathon. The features below are the target for the demo,
> not a finished product.

## The problem

Ecologists, NGO survey teams and citizen scientists record observations where there is no signal,
often for weeks at a time. They typically fill in survey forms in one app and identify species in
others, then merge and re-type the results before the data can reach the systems science uses, such
as GBIF.

## What it does

- Records survey observations fully offline: forms, averaged GPS, photos and audio, saved to the
  phone's own storage
- Suggests the species on the device, with its confidence and the top five candidates; the observer
  confirms
- Syncs when a connection returns, without duplicate records or lost media
- Exports CSV, GeoJSON and a Darwin Core Archive ready for GBIF

## Tech stack

React Native with Expo SDK 57 · SQLite on the device · Supabase for sync · TensorFlow Lite models
running on the phone · MapLibre with an offline PMTiles basemap.

## Getting started

Setup steps will be added here once the app is scaffolded.

## Team

- Jack Murton

## Licence

The code in this repository is released under the [MIT License](LICENSE).

Model weights, datasets and map data are **not** covered by that licence. Each keeps its own
licence, listed below. When a model file is added to the repository, its licence file goes in the
same folder.

## Third-party licences

Checked against each source on 17 October 2026. These are the components we plan to use. Add a row
before adding any other model, dataset or library whose licence isn't MIT, Apache-2.0 or BSD.

### Models and data

| Component | Used for | Licence | What we must do |
| --- | --- | --- | --- |
| [BirdNET+ V3.0](https://github.com/birdnet-team/birdnet-live-app) weights, as bundled in BirdNET Live | Bird and wildlife sound ID | Apache-2.0 | Ship its licence with the file. Use this copy, not the Zenodo copy (CC BY-SA 4.0) |
| [BirdNET+ Geomodel V3.0.4](https://github.com/birdnet-team/geomodel) | Location and season prior for IDs | Apache-2.0 (its code is MIT) | Ship its licence with the file |
| [BirdNET V2.4](https://github.com/birdnet-team/BirdNET-Analyzer) (fallback only) | Backup sound ID | CC BY-NC-SA 4.0 | Non-commercial use only. Credit BirdNET |
| [PlantNet-300K ResNet18 (LiteRT)](https://huggingface.co/litert-community/PlantNet-300K-ResNet18-LiteRT) | European plant ID | Apache-2.0 | Ship its licence with the file |
| [Google AIY vision classifiers](https://www.kaggle.com/models/google/aiy) (plants, insects, birds) | Fast image ID | Apache-2.0 | Ship its licence with the file |
| [BioCLIP](https://huggingface.co/imageomics/bioclip) (stretch goal) | Zero-shot ID of any taxon | MIT | Keep its copyright notice |
| [Catalogue of Life](https://www.checklistbank.org/dataset/3LR) checklist | Offline species names | CC BY 4.0 | Credit Catalogue of Life |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) data, via a [Protomaps](https://docs.protomaps.com) extract | Offline basemap | ODbL 1.0 | Show "© OpenStreetMap contributors" on the map |
| [Protomaps basemaps-assets](https://github.com/protomaps/basemaps-assets) | Map fonts and icons | Fonts: SIL Open Font License; icons: MIT | Ship the font licence with the fonts |

### Libraries

MIT: Expo, React Native, expo-sqlite, Supabase JS, tus-js-client, react-native-fast-tflite, MapLibre
React Native, react-native-audio-api, React Native Skia, zod, react-hook-form, fflate and uuid.

Apache-2.0: Drizzle ORM. BSD-3-Clause: `@protomaps/basemaps`.
