# Record classes

This is the memory list. One named class at a time. Inquire searches **live** rows. Everything else is next, a link-out, metered, or a no.

Status: `live` · `next` · `link` · `metered` · `no`

## Live

| ID | Class | Notes |
|---|---|---|
| alpr-osm | ALPR / Flock camera pins | OSM. No plates. |
| alpr-contracts | City ALPR contracts and renewals | OKC + Broken Arrow PDFs. Holes queued. |
| alpr-terms | Extracted retention, dollars, sharing | From those PDFs. |
| ok-county-parcel | Oklahoma County parcels | Owner, situs, market, assessed, land, recorded sale if the assessor has it. |
| alpr-density | Cameras / km² and share of index | Computed. |

## Next (public, $0, bounded)

| ID | Class | Notes |
|---|---|---|
| tulsa-parcel | Tulsa County assessor parcels | Same pattern as Oklahoma County. |
| cleveland-parcel | Cleveland County (Norman) parcels | Same pattern. |
| ok-sos-entity | Oklahoma SOS business entities | Name, filing number, status, registered agent. |
| oscn-docket | OSCN state court dockets | Public HTML. Case style, filings, not sealed/juvenile. |
| ok-county-clerk | Recorded documents | Deeds, mortgages, *recorded* instruments. Not residential leases. |
| okc-311 | OKC 311 / code cases | If a public feed exists. |
| municode | Municipal ordinances | Link + cite, not a full copy. |
| ethics-ok | State campaign finance | ethics.ok.gov. |
| usaspending | Federal awards | API live; OK Flock was 0. |
| business-license | City business licenses | Per-city portals. |
| property-sales | Recorded sale price | Prefer assessor `SalePrice` / clerk, not Zillow. |

## Link-out only (do not ingest into a person graph)

| ID | Class | Notes |
|---|---|---|
| oscn-search | OSCN name search | Prefilled link. User leaves our box on purpose. |
| sos-search | SOS entity search | Prefilled link. |
| sors | Oklahoma Sex Offender Registry | Public DOC registry. Dedicated lookup, never auto-run on every name. |
| okdoc-inmate | DOC inmate locator | Public. Same rule: explicit, not mixed into a general “who is this.” |
| okc-court | Municipal court | City sites. |

## Metered or ToS — do not scrape

| ID | Class | Notes |
|---|---|---|
| zillow | Zillow Zestimate / sold comps | Scrape is ToS. Use assessor recorded sale. Paid API only with Warner’s word. |
| google-places | Business reviews, hours | Metered. |
| yelp | Reviews | Metered / ToS. |
| pacer | Federal court | PACER fees. |
| lexes-nexis | Aggregated people | Commercial, not our index. |

## No

| ID | Class | Why |
|---|---|---|
| residential-lease | Apartment / house leases | Not a public record. |
| plates-footage | Flock reads, video, hotlists | We refuse. |
| juvenile | Juvenile court | Sealed / protected. |
| locate-minors | Anything to find a child | No. |
| unlisted-contact | Phones, emails not in a filing | Not public. |
| bank-medical | Financial / medical | Not public. |

## Product rule

Inquire is a **catalog search**, not a profile of a human. One query can return a city packet, a parcel, and a link to OSCN. It must not assemble “John Smith — felony, offender, house value, reviews” as a dossier. That is Samaritan. We index records, not people.
