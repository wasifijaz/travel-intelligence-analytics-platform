from fastapi import APIRouter
from fastapi.responses import Response
from api.data_cache import json_forecast_recovery, json_forecast_accuracy

router = APIRouter()

@router.get("/forecast/recovery")
def get_recovery():
    return Response(content=json_forecast_recovery(), media_type="application/json")

@router.get("/forecast/accuracy")
def get_forecast_accuracy():
    return Response(content=json_forecast_accuracy(), media_type="application/json")
