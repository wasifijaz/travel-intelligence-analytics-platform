from typing import Optional
from fastapi import APIRouter
from fastapi.responses import Response
from api.data_cache import json_analytics

router = APIRouter()

@router.get("/analytics")
def get_analytics(date_from: Optional[str] = None, date_to: Optional[str] = None):
    return Response(content=json_analytics(), media_type="application/json")
