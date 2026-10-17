"""Cut the demo satellite picture for the La Selva transects from ESA WorldCover (CC BY 4.0).

Source: ESA WorldCover Sentinel-2 median L2A (RGBNIR) composite 2021, v2.0.0, 10 m, public on AWS
(s3://esa-worldcover-s2, no account needed). Only the window below is read, over HTTP range requests.

Needs Python 3 with rasterio, numpy and pillow (pip install rasterio numpy pillow). Not part of either app's
build: the output (the .jpg and index.json beside this file) is committed. Run from anywhere:
    python make-basemap.py
"""
import hashlib, json, os
import numpy as np
import rasterio
from rasterio.merge import merge
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BASEMAP_ID = "la-selva-s2-2021"
URL = "/vsicurl/https://esa-worldcover-s2.s3.eu-central-1.amazonaws.com/rgbnir/2021/N10/ESA_WorldCover_10m_2021_v200_{}_S2RGBNIR.tif"
TILES = ("N10W085", "N10W084")  # the transects straddle 84° W
PX = 1 / 12000  # the product's pixel size in degrees (0.3 arc seconds, about 10 m)

# The three demo transects plus about 600 m all round, snapped to the product's pixel grid.
snap = lambda v, f: float(f(v / PX) * PX)
west, south = snap(-84.037, np.floor), snap(10.398, np.floor)
east, north = snap(-83.975, np.ceil), snap(10.440, np.ceil)

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
sources = [rasterio.open(URL.format(t)) for t in TILES]
rgb, _ = merge(sources, bounds=(west, south, east, north), indexes=[1, 2, 3])  # B04 red, B03 green, B02 blue

# Stretch between the 1st and 99.5th percentiles, with a light gamma, so dark rainforest still shows texture.
a = rgb.astype("float32")
lo, hi = np.percentile(a[a > 0], 1), np.percentile(a[a > 0], 99.5)
a = np.clip((a - lo) / (hi - lo), 0, 1) ** 0.85
img = Image.fromarray((a * 255).astype("uint8").transpose(1, 2, 0))
jpg = os.path.join(HERE, f"{BASEMAP_ID}.jpg")
img.save(jpg, quality=88, optimize=True)

data = open(jpg, "rb").read()
index = [{
    "basemapId": BASEMAP_ID,
    "name": "Satellite (Sentinel-2, 2021)",
    "file": f"setup/basemaps/{BASEMAP_ID}.jpg",
    "bytes": len(data),
    "sha256": hashlib.sha256(data).hexdigest(),
    "bounds": {"latMin": south, "latMax": north, "lonMin": west, "lonMax": east},
    "widthPx": img.width,
    "heightPx": img.height,
    "resolutionM": 10,
    "transectIds": ["T-LS-01", "T-LS-02", "T-LS-03"],
    "source": "ESA WorldCover Sentinel-2 median L2A (RGBNIR) composite 2021, v2.0.0, tiles " + " + ".join(TILES)
              + ", bands B04/B03/B02, https://doi.org/10.71570/79k4-x482",
    "licence": "CC BY 4.0",
    "attribution": "Satellite: ESA WorldCover 2021 · contains modified Copernicus Sentinel data (2021) · CC BY 4.0",
}]
json.dump(index, open(os.path.join(HERE, "index.json"), "w"), indent=2)
print(json.dumps(index[0]["bounds"]), img.size, len(data), "bytes")
