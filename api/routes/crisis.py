from fastapi import APIRouter
from fastapi.responses import Response
from api.data_cache import json_crisis

router = APIRouter()

@router.get("/crisis-events")
def get_crisis_events():
    return Response(content=json_crisis(), media_type="application/json")
