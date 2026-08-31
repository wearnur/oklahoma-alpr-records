# Record schema (v0)

One object per line in `index/records.jsonl`.

```json
{
  "id": "cam:osm:n123",
  "type": "camera | agency_record | award | document",
  "class": "alpr",
  "vendor": "Flock Safety | unknown | null",
  "name": "string",
  "jurisdiction": {"state": "OK", "city": null, "county": null},
  "geom": {"lat": 35.46, "lon": -97.51, "precision": "pole | agency_centroid | unknown"},
  "source": {"name": "osm", "url": "https://...", "retrieved": "2026-08-31T00:00:00+00:00"},
  "extra": {}
}
```

`agency_centroid` pins are not camera locations. Downstream map must label them as such.
