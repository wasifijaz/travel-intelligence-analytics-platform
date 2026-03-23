"""
REST API for Hospitality Demand Shock Analysis.
All JSON is pre-serialized at import time. Handlers return raw bytes.
"""
import sys
import logging
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

from api.data_cache import refresh_cache, json_health
from api.travel_demand_intel import refresh_travel_demand_cache

refresh_cache()
refresh_travel_demand_cache()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from api.routes import metrics, crisis, summary, analytics, timeline, destinations, forecast, travel_demand

app = FastAPI(
    title="Hospitality Demand Shock API",
    description="Data and analytics for travel demand during geopolitical crises",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(metrics.router, prefix="/api", tags=["metrics"])
app.include_router(crisis.router, prefix="/api", tags=["crisis"])
app.include_router(summary.router, prefix="/api", tags=["summary"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])
app.include_router(timeline.router, prefix="/api", tags=["timeline"])
app.include_router(destinations.router, prefix="/api", tags=["destinations"])
app.include_router(forecast.router, prefix="/api", tags=["forecast"])
app.include_router(travel_demand.router, prefix="/api", tags=["travel-demand"])

JSON_CT = "application/json"


@app.get("/api/health")
def health():
    return Response(content=json_health(), media_type=JSON_CT)


@app.post("/api/refresh")
def do_refresh():
    refresh_cache()
    refresh_travel_demand_cache()
    return Response(content=json_health(), media_type=JSON_CT)
