"""
Forecast Evaluation
Metrics: MAE, RMSE, MAPE, MASE (optional)
"""
import pandas as pd
import numpy as np
from typing import Optional
from dataclasses import dataclass


@dataclass
class EvalMetrics:
    """Forecast accuracy metrics."""
    mae: float
    rmse: float
    mape: float
    mase: Optional[float]
    n: int


def mae(y_true: pd.Series, y_pred: pd.Series) -> float:
    """Mean Absolute Error."""
    y_true, y_pred = _align(y_true, y_pred)
    return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true: pd.Series, y_pred: pd.Series) -> float:
    """Root Mean Squared Error."""
    y_true, y_pred = _align(y_true, y_pred)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def mape(y_true: pd.Series, y_pred: pd.Series, epsilon: float = 1e-8) -> float:
    """Mean Absolute Percentage Error. Returns 100 * MAPE."""
    y_true, y_pred = _align(y_true, y_pred)
    mask = np.abs(y_true) > epsilon
    if mask.sum() == 0:
        return np.nan
    return float(100 * np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])))


def mase(
    y_true: pd.Series,
    y_pred: pd.Series,
    y_train: pd.Series,
    period: int = 7,
) -> float:
    """Mean Absolute Scaled Error."""
    y_true, y_pred = _align(y_true, y_pred)
    if len(y_train) < period + 1:
        return np.nan
    scale = np.mean(np.abs(np.diff(y_train.values, period)))
    if scale == 0:
        return np.nan
    return float(np.mean(np.abs(y_true - y_pred)) / scale)


def _align(a: pd.Series, b: pd.Series) -> tuple:
    """Align two series by index."""
    idx = a.index.intersection(b.index)
    return a.loc[idx], b.loc[idx]


def evaluate_forecast(
    y_true: pd.Series,
    y_pred: pd.Series,
    y_train: Optional[pd.Series] = None,
    period: int = 7,
) -> EvalMetrics:
    """Compute all evaluation metrics."""
    mase_val = None
    if y_train is not None:
        mase_val = mase(y_true, y_pred, y_train, period)
    return EvalMetrics(
        mae=mae(y_true, y_pred),
        rmse=rmse(y_true, y_pred),
        mape=mape(y_true, y_pred),
        mase=mase_val,
        n=len(_align(y_true, y_pred)[0]),
    )
