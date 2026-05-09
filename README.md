# PostPilot India

A minimalist bulk India Post tracking dashboard for small businesses.

## Problem

Small sellers often ship multiple orders through India Post and receive 10-50 tracking IDs at a time. India Post tracking is usually checked one tracking ID at a time, which creates a slow feedback loop with customers.

PostPilot India saves tracking IDs once and shows every shipment in a single dashboard.

## Features

- Save multiple tracking IDs at once
- Refresh all consignments when the dashboard opens
- Filter by delivered, in transit, and attention
- Store tracking data locally in the browser
- Import CSV batches
- Export current dashboard as CSV
- Swappable tracking provider layer for a real India Post API

## Current Tracking Provider

The first version uses deterministic demo updates so the UI and workflow can be tested without depending on fragile scraping or paid APIs.

The app is structured so a real provider can replace `getTrackingUpdate()` in `src/app.js`.

Recommended real provider options:

- TrackCourier API
- Tracktry
- PKGE
- A backend service that calls an approved India Post/courier API

Direct scraping of India Post should be avoided unless legal, rate-limit, and captcha issues are handled properly.

## Run Locally

Open `index.html` in a browser.

For a local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Roadmap

- Add real courier API backend
- Add account login
- Add scheduled refresh
- Add WhatsApp/customer share links
- Add delivery exception alerts
- Add order/customer columns
- Add GitHub Pages deployment

