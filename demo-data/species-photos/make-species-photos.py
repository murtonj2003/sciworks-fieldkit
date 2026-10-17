"""Small offline copies of one open-licence photo per species in the demo pack.

For each taxon, takes the first photo listed in demo-data/species-pack.json whose licence GBIF confirms is CC BY 4.0
or CC0 (never non-commercial), downloads iNaturalist's medium copy, shrinks it to at most 400 px, and writes
index.json with the credit for each. Run with Python 3 + pillow:  python make-species-photos.py
"""
import hashlib, io, json, os, re, time, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.join(HERE, "..", "species-pack.json")
OK = {"http://creativecommons.org/licenses/by/4.0/": "CC BY 4.0",
      "http://creativecommons.org/publicdomain/zero/1.0/": "CC0 1.0"}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "sciworks-fieldkit demo-data (hackathon)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def gbif_media_licence(occurrence_url, photo_url):
    key = re.search(r"/occurrence/(\d+)", occurrence_url).group(1)
    occ = json.loads(get(f"https://api.gbif.org/v1/occurrence/{key}"))
    for m in occ.get("media", []):
        if m.get("identifier") == photo_url:
            return m.get("license"), m.get("rightsHolder") or m.get("creator")
    return None, None

# Picked by eye (Sat 17 Oct, 20:55) for a clear view of the snake: index into the pack's photo list. Unlisted species
# use their first photo. Every pick still has to pass the licence check below. (The pack's first Boa imperator
# photo showed a mammal, so it was removed from the pack itself.)
PREFERRED = {
    "Corallus annulatus": 1, "Imantodes cenchoa": 1, "Sibon annulatus": 1,
    "Rhadinaea decorata": 1, "Leptodeira ornata": 1, "Ninia sebae": 1,
    "Chironius grandisquamis": 1, "Oxybelis fulgidus": 1, "Micrurus alleni": 1,
}

pack = json.load(open(PACK))
index, skipped = [], []
for t in pack["taxa"]:
    chosen = None
    photos = list(t.get("photos") or [])
    first = PREFERRED.get(t["scientificName"], 0)
    if first < len(photos):
        photos.insert(0, photos.pop(first))
    for ph in photos:
        lic, holder = gbif_media_licence(ph["source"], ph["url"])
        time.sleep(0.2)
        if lic in OK:
            chosen = (ph, OK[lic], holder or ph.get("rightsHolder"))
            break
    if not chosen:
        skipped.append(t["scientificName"]); continue
    ph, licence, holder = chosen
    medium = ph["url"].replace("/original.", "/medium.")
    img = Image.open(io.BytesIO(get(medium))).convert("RGB")
    img.thumbnail((400, 400))
    slug = t["taxonId"].replace(":", "-")
    path = os.path.join(HERE, f"{slug}.jpg")
    img.save(path, quality=82, optimize=True)
    data = open(path, "rb").read()
    index.append({
        "taxonId": t["taxonId"],
        "file": f"setup/species-photos/{slug}.jpg",
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "widthPx": img.width,
        "heightPx": img.height,
        "licence": licence,
        "credit": f"{holder} · {licence} · via iNaturalist / GBIF",
        "source": ph["source"],
        "originalUrl": ph["url"],
    })
    print(f"{t['scientificName']:<28} {licence:<9} {holder}  {img.width}x{img.height} {len(data)//1024} KB")
json.dump(index, open(os.path.join(HERE, "index.json"), "w"), indent=2, ensure_ascii=False)
print("skipped (no CC BY / CC0 photo):", skipped or "none")
print("total", sum(i["bytes"] for i in index) // 1024, "KB")
