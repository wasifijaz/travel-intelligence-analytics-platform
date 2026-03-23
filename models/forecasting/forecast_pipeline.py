"""
Forecast Pipeline
Orchestrates: decomposition, seasonality, train/test, models, evaluation, 90-day forecast.
"""
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

from .time_series_utils import (
    prepare_ts,
    time_series_decompose,
    detect_seasonality,
    train_test_split,
)
from .forecast_models import forecast_sarima, forecast_prophet, forecast_xgboost
from .evaluation import evaluate_forecast, EvalMetrics


FORECAST_METRICS = ["bookings", "search_demand", "adr", "cancellations"]
HORIZON_DAYS = 90
TEST_DAYS = 30


@dataclass
class PipelineResult:
    """Full pipeline output."""
    forecasts: dict = field(default_factory=dict)  # metric -> model -> ForecastResult
    accuracy: dict = field(default_factory=dict)   # metric -> model -> EvalMetrics
    decomposition: dict = field(default_factory=dict)
    seasonality: dict = field(default_factory=dict)
    forecast_df: pd.DataFrame = None


def run_forecast_pipeline(
    df: pd.DataFrame,
    date_col: str = "date",
    destination_id: Optional[str] = None,
    metrics: Optional[list[str]] = None,
    horizon: int = HORIZON_DAYS,
    test_days: int = TEST_DAYS,
    models: Optional[list[str]] = None,
) -> PipelineResult:
    """
    Full forecast pipeline:
    1. Time series decomposition
    2. Seasonality detection
    3. Train/test split
    4. Model training & evaluation
    5. 90-day forecast with prediction intervals
    """
    metrics = metrics or FORECAST_METRICS
    models = models or ["Prophet", "XGBoost", "SARIMA"]

    if destination_id:
        df = df[df["destination_id"] == destination_id].copy()

    df[date_col] = pd.to_datetime(df[date_col])
    df = df.sort_values(date_col)

    result = PipelineResult()

    for metric in metrics:
        if metric not in df.columns:
            continue

        agg = "mean" if metric == "adr" else "sum"
        ts = prepare_ts(df, date_col=date_col, value_col=metric, agg=agg)
        if len(ts) < 14:
            continue

        # 1. Decomposition
        try:
            decomp = time_series_decompose(ts, period=7)
            result.decomposition[metric] = decomp
        except Exception:
            pass

        # 2. Seasonality
        result.seasonality[metric] = detect_seasonality(ts)

        # 3. Train/test
        train, test = train_test_split(ts, test_days=test_days)
        if len(test) == 0:
            train = ts
            test = None

        result.forecasts[metric] = {}
        result.accuracy[metric] = {}

        for model_name in models:
            try:
                if model_name == "SARIMA":
                    res = forecast_sarima(train, horizon=horizon)
                elif model_name == "Prophet":
                    res = forecast_prophet(train, horizon=horizon)
                elif model_name == "XGBoost":
                    res = forecast_xgboost(train, horizon=horizon)
                else:
                    continue

                result.forecasts[metric][model_name] = res

                if test is not None and len(test) > 0:
                    pred_test = res.forecast.head(len(test))
                    common_idx = test.index.intersection(pred_test.index)
                    if len(common_idx) > 0:
                        t = test.loc[common_idx]
                        p = pred_test.reindex(common_idx).fillna(pred_test.mean())
                        eval_metrics = evaluate_forecast(t, p, y_train=train)
                        result.accuracy[metric][model_name] = eval_metrics
                    else:
                        result.accuracy[metric][model_name] = EvalMetrics(
                            mae=np.nan, rmse=np.nan, mape=np.nan, mase=None, n=0
                        )
                else:
                    result.accuracy[metric][model_name] = EvalMetrics(
                        mae=np.nan, rmse=np.nan, mape=np.nan, mase=None, n=0
                    )
            except Exception:
                result.accuracy[metric][model_name] = EvalMetrics(
                    mae=np.nan, rmse=np.nan, mape=np.nan, mase=None, n=0
                )

    # Build forecast dataset (use best model per metric by MAE, or Prophet as default)
    result.forecast_df = _build_forecast_dataset(result)
    return result


def _build_forecast_dataset(result: PipelineResult) -> pd.DataFrame:
    """Build combined forecast DataFrame with prediction intervals."""
    rows = []
    for metric, models in result.forecasts.items():
        for model_name, res in models.items():
            for dt in res.forecast.index:
                val = res.forecast.loc[dt]
                lo = res.lower.loc[dt] if dt in res.lower.index else val
                hi = res.upper.loc[dt] if dt in res.upper.index else val
                rows.append({
                    "date": dt,
                    "metric": metric,
                    "model": model_name,
                    "forecast": val,
                    "lower": lo,
                    "upper": hi,
                })
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows)


def save_forecast_output(
    result: PipelineResult,
    output_dir: Path,
    prefix: str = "forecast",
) -> dict:
    """Save forecast dataset, accuracy metrics, and prediction intervals."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    paths = {}

    if result.forecast_df is not None and len(result.forecast_df) > 0:
        fp = output_dir / f"{prefix}_dataset.csv"
        result.forecast_df.to_csv(fp, index=False)
        paths["forecast_dataset"] = str(fp)

    acc_rows = []
    for metric, models in result.accuracy.items():
        for model_name, m in models.items():
            acc_rows.append({
                "metric": metric,
                "model": model_name,
                "mae": m.mae,
                "rmse": m.rmse,
                "mape": m.mape,
                "mase": m.mase,
                "n": m.n,
            })
    if acc_rows:
        fp = output_dir / f"{prefix}_accuracy.csv"
        pd.DataFrame(acc_rows).to_csv(fp, index=False)
        paths["accuracy"] = str(fp)

    return paths
