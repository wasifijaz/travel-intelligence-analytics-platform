"""Travel Demand Intelligence — flights + visas + platform metrics (additive)."""
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import Response

from api.travel_demand_intel import (
    compute_travel_demand_filtered,
    compute_travel_demand_summary_filtered,
)

router = APIRouter()


@router.get("/travel-demand/intelligence")
@router.get("/travel-demand/intelligence/")
@router.get("/travel-demand-intelligence")
@router.get("/travel-demand-intelligence/")
def get_travel_demand_intelligence(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return Response(
        content=compute_travel_demand_filtered(
            date_from=date_from,
            date_to=date_to,
            destination=destination,
            crisis_id=crisis_id,
            source_market=source_market,
            travel_type=travel_type,
        ),
        media_type="application/json",
    )


@router.get("/travel-demand-intelligence/summary")
@router.get("/travel-demand-intelligence/summary/")
def get_travel_demand_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    destination: Optional[str] = None,
    crisis_id: Optional[int] = None,
    source_market: Optional[str] = None,
    travel_type: Optional[str] = None,
):
    return Response(
        content=compute_travel_demand_summary_filtered(
            date_from=date_from,
            date_to=date_to,
            destination=destination,
            crisis_id=crisis_id,
            source_market=source_market,
            travel_type=travel_type,
        ),
        media_type="application/json",
    )
