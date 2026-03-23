"""
Time Series Utilities
Decomposition, seasonality detection, train/test split.
"""
import pandas as pd
import numpy as np
from typing import Optional, Tuple
from dataclasses import dataclass


@dataclass
class DecompositionResult:
    """Result of time series decomposition."""
    trend: pd.Series
    seasonal: pd.Series
    residual: pd.Series
    observed: pd.Series
    period: int


def prepare_ts(
    df: pd.DataFrame,
    date_col: str = "date",
    value_col: str = "bookings",
    freq: str = "D",
    agg: str = "sum",
) -> pd.Series:
    """Convert DataFrame to daily time series, filling gaps. Use agg='mean' for ADR."""
    d = df[[date_col, value_col]].copy()
    d[date_col] = pd.to_datetime(d[date_col])
    d = d.set_index(date_col).sort_index()
    ts = d[value_col].resample(freq).agg(agg)
    ts = ts.ffill().bfill().fillna(0)
    return ts


def time_series_decompose(
    ts: pd.Series,
    period: Optional[int] = None,
    model: str = "additive",
) -> DecompositionResult:
    """
    Decompose time series into trend, seasonal, residual.
    Uses statsmodels seasonal_decompose.
    """
    try:
        from statsmodels.tsa.seasonal import seasonal_decompose
    except ImportError:
        raise ImportError("Install statsmodels: pip install statsmodels")

    if period is None:
        period = 7 if len(ts) >= 14 else min(7, max(2, len(ts) // 2))

    result = seasonal_decompose(ts, model=model, period=period, extrapolate_trend="freq")
    return DecompositionResult(
        trend=result.trend,
        seasonal=result.seasonal,
        residual=result.resid,
        observed=result.observed,
        period=period,
    )


def detect_seasonality(
    ts: pd.Series,
    max_period: int = 30,
) -> dict:
    """
    Detect seasonality using ACF and variance of seasonal component.
    Returns: dominant_period, strength, is_weekly, is_monthly.
    """
    try:
        from statsmodels.tsa.stattools import acf
    except ImportError:
        return {"dominant_period": 7, "strength": 0, "is_weekly": True, "is_monthly": False}

    ts_clean = ts.fillna(ts.mean()).dropna()
    if len(ts_clean) < 14:
        return {"dominant_period": 7, "strength": 0, "is_weekly": True, "is_monthly": False}

    acf_vals = acf(ts_clean, nlags=min(max_period, len(ts_clean) // 2), fft=True)
    acf_vals = np.abs(acf_vals[1:])  # skip lag 0

    # Find peaks at 7, 14, 30 (weekly, bi-weekly, monthly)
    candidates = [7, 14, 30]
    peaks = [(p, acf_vals[min(p - 1, len(acf_vals) - 1)]) for p in candidates if p < len(acf_vals)]
    if not peaks:
        dominant = 7
    else:
        dominant = max(peaks, key=lambda x: x[1])[0]

    strength = float(acf_vals[dominant - 1]) if dominant <= len(acf_vals) else 0
    return {
        "dominant_period": int(dominant),
        "strength": strength,
        "is_weekly": dominant == 7,
        "is_monthly": dominant >= 28,
    }


def train_test_split(
    ts: pd.Series,
    test_days: int = 30,
) -> Tuple[pd.Series, pd.Series]:
    """Split time series into train and test. Test = last test_days."""
    if len(ts) <= test_days:
        return ts, pd.Series(dtype=float)
    train = ts.iloc[:-test_days]
    test = ts.iloc[-test_days:]
    return train, test


def create_lag_features(
    ts: pd.Series,
    lags: list[int],
) -> pd.DataFrame:
    """Create lag features for XGBoost."""
    df = pd.DataFrame({"y": ts})
    for lag in lags:
        df[f"lag_{lag}"] = df["y"].shift(lag)
    return df.dropna()
