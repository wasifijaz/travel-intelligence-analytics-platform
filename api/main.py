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

from typing import Optional

from api.data_cache import refresh_cache, json_health, compute_filtered_response
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


def _filtered(endpoint: str,
              date_from: Optional[str] = None,
              date_to: Optional[str] = None,
              destination: Optional[str] = None,
              crisis_id: Optional[int] = None,
              source_market: Optional[str] = None,
              travel_type: Optional[str] = None) -> Response:
    return Response(
        content=compute_filtered_response(
            endpoint=endpoint,
            date_from=date_from,
            date_to=date_to,
            destination=destination,
            crisis_id=crisis_id,
            source_market=source_market,
            travel_type=travel_type,
        ),
        media_type=JSON_CT,
    )


@app.get("/api/health")
def health():
    return Response(content=json_health(), media_type=JSON_CT)


@app.get("/api/kpis/hotel")
def kpis_hotel(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("kpis/hotel", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/kpis/ota")
def kpis_ota(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("kpis/ota", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/risk-index")
def risk_index(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("risk-index", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/corridor")
def corridor(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("corridor", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/funnel")
def funnel(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("funnel", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/prepost")
def prepost(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("prepost", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/timeline-by-dest")
def timeline_by_dest(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("timeline-by-dest", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/behavior")
def behavior(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("behavior", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/travel-flows")
def travel_flows(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return _filtered("travel-flows", date_from, date_to, destination, crisis_id, source_market, travel_type)


@app.get("/api/source-markets")
def source_markets():
    return _filtered("source-markets")


@app.post("/api/refresh")
def do_refresh():
    refresh_cache()
    refresh_travel_demand_cache()
    return Response(content=json_health(), media_type=JSON_CT)
