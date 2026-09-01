# Record classes

This is the memory list. One named class at a time. Inquire searches **live** rows. Everything else is next, a link-out, metered, or a no.

**Focus:** Oklahoma City / Oklahoma County until one address is dense. Tulsa, Cleveland, and other cities stay parked.

Status: `live` · `next` · `link` · `metered` · `no`

## Live

| ID | Class | Notes |
|---|---|---|
| alpr-osm | ALPR / Flock camera pins | OSM. No plates. |
| alpr-contracts | City ALPR contracts and renewals | OKC + Broken Arrow PDFs. Holes queued. |
| alpr-terms | Extracted retention, dollars, sharing | From those PDFs. |
| ok-county-parcel | Oklahoma County parcels | Live assessor query. Autocomplete situs. Owner, market, assessed, land, recorded sale if published, nearby mapped cameras, city packet. Click owner or named subdivision for the tax-roll list (cap 40). |
| ok-county-roll | Same-owner / same-plat list | Assessor `name1` / `subname`. Same string, not beneficial ownership. |
| alpr-density | Cameras / km² and share of index | Computed. |
| okc-opendata | OKC data.okc.gov catalog | 81 datasets labeled. Small civic tables pulled. Huge GIS is live-query. |
| okc-land-docs | OKC land documents | City layer (grantor, address, instrument). Not the county clerk. |
| okc-civic-facility | Police / fire / city facilities | Pulled. |
| okc-zoning | Straight / overlay zoning | Live-query (22k polygons). |
| okc-address | City address points | Live-query (326k). County assessor remains the house search. |

## Absent on data.okc.gov (labeled holes)

| ID | Class | Notes |
|---|---|---|
| okc-311 | OKC 311 / service requests | Not in the DCAT catalog. |
| okc-permits | OKC building permits | Only garage-sale permits exist. |
| okc-license | OKC business licenses | No table on this portal. |

## Next (public, $0, bounded)

| ID | Class | Notes |
|---|---|---|
| tulsa-parcel | Tulsa County assessor parcels | Parked until OKC is dense. |
| cleveland-parcel | Cleveland County (Norman) parcels | Parked. |
| ok-county-clerk | Oklahoma County recorded deeds / mortgages | OKCC.online. Attach to the parcel card. Not leases. |
| ok-sos-entity | Oklahoma SOS business entities | Name, filing number, status, registered agent. |
| oscn-docket | OSCN state court dockets | Public HTML. Case style, filings, not sealed/juvenile. |
| municode | Municipal ordinances | Link + cite, not a full copy. |
| ethics-ok | State campaign finance | ethics.ok.gov. |
| usaspending | Federal awards | API live; OK Flock was 0. |
| civic-phone | Published city/county office numbers | 311, clerk, assessor, records. Not a person. |
| property-sales | Recorded sale price | Prefer assessor `SalePrice` / clerk, not Zillow. |

## Link-out only (do not ingest into a person graph)

| ID | Class | Notes |
|---|---|---|
| oscn-search | OSCN name search | Prefilled link. User leaves our box on purpose. |
| sos-search | SOS entity search | Prefilled link. |
| entity-social-search | Facebook / Instagram search for an entity | Google `site:` search. User leaves on purpose. Not ingested. |
| sors | Oklahoma Sex Offender Registry | Public DOC registry. Dedicated lookup, never auto-run on every name. |
| okdoc-inmate | DOC inmate locator | Public. Same rule: explicit, not mixed into a general “who is this.” |
| okc-court | Municipal court | City sites. |

## Metered or ToS — do not scrape

| ID | Class | Notes |
|---|---|---|
| zillow | Zillow Zestimate / sold comps | Sold comps originate in county recorder/assessor filings and MLS (brokers opt in). Zestimate is a model. We use Oklahoma County `SalePrice`. MLS via Warner’s license is the other legitimate path — not a scrape. |
| google-places | Business reviews, hours | Metered. Entity parcels get a Google search link-out, not a scrape. |
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
| phone-reverse | Reverse-lookup a cell / Whitepages / Truecaller | Not a public record. Skip-trace is a person index. If a number is printed on a filing we already have, show that filing. |
| person-social | Auto-join a person to Facebook/Instagram from a house | Hard no on the public card. That is a dossier. |
| bank-medical | Financial / medical | Not public. |

## Operator / PI intelligence (not Pages)

Skip-trace is useful. It is not a public record class. A PI license authorizes **the operator** to use licensed databases (TLO, Accurint, etc.). It does not authorize publishing unlisted phones, social graphs, or homeowner dossiers on GitHub Pages.

That layer stays off `wearnur.github.io`. It can exist later as a local, authenticated desk that the operator logs into, joining a parcel to a commercial file he already has a right to query. It must not auto-run on every name. Locate-minors stays a hard no.

## Product rule

The **public** inquire is a catalog of civic records, not a profile of a human. One query can return a city packet, a parcel, and a link to OSCN. It must not assemble “John Smith — felony, offender, house value, reviews, Facebook” as a dossier on the public site. That is Samaritan. We index records in public. Intelligence stays gated.
