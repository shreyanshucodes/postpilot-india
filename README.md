# PostPilot India

PostPilot India is a batch-first dashboard for tracking multiple India Post consignments in one place.

## What It Does

- Create a batch from multiple tracking IDs
- Open a batch to view all consignments
- Expand a consignment to see route steps and provider data
- Refresh tracking data through a backend API
- Delete batches or individual consignments
- Import and export CSV

## API Status

Official India Post tracking is available on the public portal, but that flow currently uses CAPTCHA.  
That means there is no straightforward public self-serve API flow for direct app integration.

Current implementation uses a backend adapter with TrackCourier so API keys stay server-side and the UI can consume a normalized response.

If the provider returns only status and no checkpoints, PostPilot shows that honestly instead of inventing route history.

## Run Locally

Start the backend:

```bash
TRACKCOURIER_API_KEY=your_api_key node server.js
```

Open:

`http://127.0.0.1:8084`

Do not use `file://.../index.html` for live API mode.

## Current Stack

- Frontend: vanilla HTML/CSS/JS
- Backend: Node.js (`server.js`)
- Provider: TrackCourier API (`/api/track`)

## Next Work

- Add second provider adapter for better scan coverage
- Add per-batch provider/courier selection
- Add raw provider response debug panel
- Improve mapping for partial responses
