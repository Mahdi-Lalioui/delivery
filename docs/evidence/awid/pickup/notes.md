# Pickup mode (lane B, 2026-11-12)

- `pins-real-tiles-390.png`: the pin markup and `feed.css` pickup rules on OpenFreeMap positron
  tiles at phone width (local dev has no AWID basemap tiles). The map fits all five fictional
  demo pins; the closed restaurant uses the surface colour. Pins rise one after another (70 ms
  apart); reduced motion turns the rise off.
- Real app at 390 px, Arabic: the Delivery / Pickup switch sets `?fulfilment=pickup`, the list
  shows the five pickup restaurants, and nothing overflows sideways. The map shows a loading
  line, then hides itself when tiles fail, so the list stays usable.
- Still to check on the preview deployment: the map on AWID's own tiles.
