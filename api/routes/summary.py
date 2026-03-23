from typing import Optional
from fastapi import APIRouter
from fastapi.responses import Response
from api.data_cache import json_summary

router = APIRouter()

@router.get("/summary")
def get_summary(date_from: Optional[str] = None, date_to: Optional[str] = None):
    return Response(content=json_summary(), media_type="application/json")
