from typing import Optional
from fastapi import APIRouter, Query
from fastapi.responses import Response
from api.data_cache import json_metrics

router = APIRouter()

@router.get("/metrics")
def get_metrics_route(date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None), limit: int = Query(5000, le=50000)):
    return Response(content=json_metrics(), media_type="application/json")
