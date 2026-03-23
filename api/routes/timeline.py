from typing import Optional
from fastapi import APIRouter, Query
from fastapi.responses import Response
from api.data_cache import json_timeline

router = APIRouter()

@router.get("/timeline")
def get_timeline(date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None)):
    return Response(content=json_timeline(), media_type="application/json")
