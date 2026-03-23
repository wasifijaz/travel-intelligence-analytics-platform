from fastapi import APIRouter
from fastapi.responses import Response
from api.data_cache import json_destinations

router = APIRouter()

@router.get("/destinations")
def get_destinations_route():
    return Response(content=json_destinations(), media_type="application/json")
