# Oklahoma ALPR public-record index

A **union index** of Oklahoma automated license-plate reader deployments and the public record around them: camera pins, agency lists, contract PDFs, and extracted terms.

This is not a tracker. We do not store plates, footage, faces, or vehicle paths. The map is cameras and contracts, the same class of object already on OpenStreetMap and in city clerk files.

Humans browse the map. Agents can `GET` the JSON. Same objects.

## Use it

```text
python run.py ingest
python run.py export
python serve.py
```

Open http://127.0.0.1:8765/

Static files live in `web/` (`data/cameras.geojson`, `agencies.json`, `documents.json`, `terms.json`). Point any HTTP client at those.

## What is on file

| Layer | Status |
|---|---|
| OSM ALPR / Flock pins in Oklahoma | ingested |
| Agency list (55 communities) | ingested |
| Oklahoma City contract **C241032** + renewals | PDFs + structured terms |
| Broken Arrow Legistar **23-1170** | PDFs + structured terms |
| Federal USASpending Flock awards sited in Oklahoma | **0** (municipal money is not there) |
| Tulsa / Edmond / Norman contract PDFs | **missing** — see `REQUESTS.md` |

Oklahoma City: **$270,000 / year**, Flock Group, rolling **30-day** deletion in the 2023 MSA, four one-year renewals. City ops manual says 60 days for “ALPR” and limited sharing; OCPD later wrote that **no Flock-specific policy, audit, or transparency report exists**. A later (Aug 2026) council vote reported 7-day retention and nationwide sharing off — that packet is not in this repo yet.

Broken Arrow: **$18,250**, five Falcons, **60-day pilot** then a year, **30-day** retention on the order form. Tracker marks the contract expired.

## Refuse

- License plates, hotlists of people, live video
- Guessing a pole location from an agency centroid
- Metered search APIs as the default crawler

## Sources (no API keys)

Overpass / OSM (ODbL), areyouflocked / Atlas of Surveillance (CC-BY), whoapprovedthis.org, USASpending.gov, Oklahoma City packet mirrored at deflockokc.com, Broken Arrow Legistar.

## Request the holes

`REQUESTS.md` — portal URLs and the exact Open Records text for Tulsa, Edmond, Norman, and the rest.

## License

Code: MIT. OSM data: ODbL. City PDFs: public records we did not write.
