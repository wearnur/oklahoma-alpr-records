# How to request the missing packets

Oklahoma Open Records Act: **51 O.S. § 24A.1 et seq.** You do not need a lawyer. You do not need to say why. Be specific. Ask for records, not answers.

This index already has Oklahoma City’s C241032 packet and Broken Arrow file 23-1170. Everything below is a hole.

## What to ask for (copy this)

Use the same text in every portal. Swap the city name.

> Under the Oklahoma Open Records Act, 51 O.S. § 24A.1 et seq., please provide electronic copies of:
>
> 1. Every contract, master services agreement, order form, statement of work, quote, renewal, addendum, and invoice between the City / Police Department and Flock Group, Inc. (Flock Safety), including any other ALPR vendor (Motorola/Vigilant, Axon, Rekor, ELSAG, Genetec), from 2018 to present.
> 2. The current and prior data-retention settings, data-sharing / network-opt-in settings, and any agreement that lets another agency query this city’s ALPR data (or lets this city query another agency).
> 3. The number of ALPR cameras deployed, by vendor, and any map or location list the city treats as public. If locations are withheld, state the statutory exemption.
> 4. Policies, SOPs, audit procedures, and usage/transparency reports for ALPR / Flock. If none exist, say so in writing.
>
> Please produce PDFs by email. I am not requesting license-plate reads, footage, or investigative files.

If they say “too broad,” shrink to: “Flock Group contract file and the last two renewal packets.”

## Portals (do these online)

| City | Portal | If the portal fights you |
|---|---|---|
| **Oklahoma City** | [JustFOIA public portal](https://oklahomacityok.justfoia.com/publicportal/) | City Clerk / Police records. We already have C241032; only re-request if you want the **August 2026** renewal that cut retention to 7 days and turned off nationwide sharing (not in the 2023 PDF). |
| **Tulsa** | [JustFOIA](https://tulsaok.justfoia.com/publicportal) · [Open Records page](https://www.cityoftulsa.org/government/departments/finance/open-records/) | Council agenda archive was hit by ransomware. Ask Police + City Clerk for the Flock file anyway. Tracker says **105 cameras, no dollar figure**. |
| **Edmond** | [JustFOIA](https://edmondok.justfoia.com/publicportal/) · [City Clerk](https://www.edmondok.gov/155/City-Clerk) | Tracker: **21 cameras, no amount, no contract date**. |
| **Norman** | [NextRequest](https://normanok.nextrequest.com/) · [record-request info](https://www.normanok.gov/online-request-records) | **Not on the statewide tracker.** Still request it — OSM has ALPR pins in Cleveland County. Fees: photocopies $0.25/$0.20; search/review hours billed; prepay if estimate > $75. |
| **Broken Arrow** | We have Legistar [23-1170](https://brokenarrow.legistar.com/LegislationDetail.aspx?GUID=0FEC941D-F708-4143-A707-80E43B426851&ID=6354512). | Optional: ask whether the 60-day pilot was renewed or killed, and for any later Flock file. Tracker marks it **Expired**. |
| **Ardmore** | City Clerk; tracker cites a 2026-08-17 news story, **$70,000 / 23 cameras**. | Request the contract PDF. |
| **Bartlesville / Choctaw / others** | City clerk email or whatever portal the clerk names. | Same four-point ask. |

Create an account if the portal requires email. Use a mailbox you check. Screenshot the confirmation number.

## If you have to walk in

You probably will not. If a portal is dead:

1. City Hall, **City Clerk**. Not the police front desk first — clerk is the records custodian. Police records units are a fallback.
2. Bring the request **printed**, plus ID.
3. Say: “Open Records request for the Flock Safety / ALPR contract file.” Hand them the four points.
4. Ask for a **written receipt** with date and request number.
5. You are looking for a **PDF or paper contract**, not a verbal briefing and not a camera tour.
6. If they say come back, get the date and the person’s name.

OKC Clerk is downtown; Police HQ 700 Colcord is the MSA notice address, not the walk-in target unless the clerk sends you there.

## Automated receive (not automated send)

We do **not** auto-file 55 portal submissions. That is send-gated. What is automated:

1. `python run.py export` drafts a queue in `index/requests/queue.json` (and `web/data/requests.json`) for every city with cameras and no contract PDF.
2. The dossier **Copy request** + **Open portal** is the human submit.
3. Ask the city to email PDFs to `RECORDS_INBOX` (env).
4. `python run.py mailbox` polls IMAP (`RECORDS_IMAP_HOST/USER/PASS`), saves PDFs under `data/docs/incoming/<city>/`, marks that city `received`.

Stand up a mailbox you control before this is live. Do not put a personal inbox in the public repo.

## After they produce

Drop the PDF in this repo’s `data/docs/` and run `python run.py ingest`. Do not send us plate reads if they accidentally include any — that does not go in the index.
