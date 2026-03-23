# Hospitality Travel Intelligence Platform

Production-grade travel intelligence application for crisis-aware demand analytics, forecasting signals, and executive decision support.

## Project Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm 9+

### Backend setup
```bash
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements-api.txt
```

### Frontend setup
```bash
cd frontend
npm install
```

### Build data (fresh)
```bash
cd ..
python scripts/run_synthetic_full.py
python data/travel_demand/generate_travel_demand_facts.py
python scripts/load_travel_demand_facts.py
```

### Run locally
```bash
# terminal 1 (backend)
python run_api.py

# terminal 2 (frontend)
cd frontend
npm run dev
```

Open: `http://localhost:5173`

## Architecture Overview

- **Backend API:** Python HTTP server (`run_api.py`) + FastAPI (`api/main.py`) style route modules.
- **Data cache and filtering:** `api/data_cache.py` pre-serializes unfiltered endpoints and computes filtered payloads.
- **Travel Demand Intelligence layer:** `api/travel_demand_intel.py` merges flights, visas, and bookings/search demand.
- **Frontend:** React + Vite + Tailwind + Recharts (`frontend/src`).
- **Storage:** DuckDB file at `data/hospitality.db`.

## Module Structure and Locations

- `api/`
  - `data_cache.py` core API cache/filter engine
  - `travel_demand_intel.py` advanced travel-demand analytics payloads
  - `routes/` FastAPI route modules
- `config/`
  - `settings.py` project paths and DB settings
- `data/`
  - `synthetic/` synthetic hospitality demand inputs
  - `travel_demand/` flights/visas fact generators
  - `raw/` external source snapshots
  - `seed/` crisis and dimension seed files
  - `hospitality.db` DuckDB analytics store
- `frontend/`
  - `src/pages/` dashboard pages
  - `src/components/` reusable UI blocks
  - `src/services/api.ts` API client
- `pipelines/`
  - `load/storage.py` schema creation and loaders
  - `transform/`, `ingest/` ETL steps
- `scripts/`
  - operational scripts for loading and refresh

## Data Sources and Integration Points

- **Bookings/Search/Room Nights:** `daily_metrics` (DuckDB) loaded via `scripts/load_synthetic_to_pipeline.py`.
- **Flights:** `fact_flights` from `data/travel_demand/generate_travel_demand_facts.py` and `scripts/load_travel_demand_facts.py`.
- **Visas:** `fact_visas` via same travel-demand load path.
- **Crisis Events:** `crisis_events` table seeded from `data/seed`.
- **External snapshots:** optional ingestion to `data/raw` (e.g., OpenSky/World Bank scripts).

## Build and Deployment

### Local production build check
```bash
cd frontend
npm run build
```

### API health check
```bash
cd ..
python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8080/api/health').status)"
```

### Deployment notes
- Frontend deploys as static assets from `frontend/dist`.
- Backend deploys as Python service exposing `/api/*`.
- Configure frontend API origin with `VITE_API_URL` for non-dev environments.
- Keep `/api/travel-demand-intelligence` and `/api/travel-demand-intelligence/summary` reachable behind the same API gateway.

## Operational Commands

```bash
# refresh cached API payloads (backend must be running)
curl -X POST http://127.0.0.1:8080/api/refresh

# rebuild only travel-demand facts
python data/travel_demand/generate_travel_demand_facts.py
python scripts/load_travel_demand_facts.py
```
