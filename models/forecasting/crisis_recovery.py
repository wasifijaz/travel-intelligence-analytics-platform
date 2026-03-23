"""
Crisis Impact Forecast
Expected recovery timeline per destination.
"""
import pandas as pd
import numpy as np
from typing import Optional
from dataclasses import dataclass


@dataclass
class RecoveryTimeline:
    """Recovery timeline for a destination."""
    destination_id: str
    crisis_start: pd.Timestamp
    baseline_level: float
    trough_level: float
    trough_date: pd.Timestamp
    recovery_50_date: Optional[pd.Timestamp]  # 50% back to baseline
    recovery_90_date: Optional[pd.Timestamp]  # 90% back to baseline
    recovery_100_date: Optional[pd.Timestamp]
    estimated_days_to_50: Optional[int]
    estimated_days_to_90: Optional[int]
    estimated_days_to_100: Optional[int]


def compute_recovery_timeline(
    df: pd.DataFrame,
    crisis_start_date: str | pd.Timestamp,
    metric: str = "bookings",
    date_col: str = "date",
    baseline_days: int = 30,
) -> pd.DataFrame:
    """
    Compute expected recovery timeline per destination.
    Uses historical post-crisis trajectory to estimate recovery dates.
    """
    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col])
    crisis_start = pd.to_datetime(crisis_start_date)

    pre_end = crisis_start - pd.Timedelta(days=1)
    pre_start = pre_end - pd.Timedelta(days=baseline_days - 1)
    pre_mask = (df[date_col] >= pre_start) & (df[date_col] <= pre_end)
    post_mask = df[date_col] >= crisis_start

    baseline = df.loc[pre_mask].groupby("destination_id")[metric].mean()
    post_df = df.loc[post_mask].copy()

    if post_df.empty:
        return pd.DataFrame()

    rows = []
    for dest_id, g in post_df.groupby("destination_id"):
        base = baseline.get(dest_id, g[metric].mean())
        if pd.isna(base) or base <= 0:
            base = g[metric].mean()
        if base <= 0:
            continue

        g = g.sort_values(date_col)
        ts = g.set_index(date_col)[metric]

        trough_idx = ts.idxmin()
        trough_val = ts.min()
        trough_date = pd.Timestamp(trough_idx) if isinstance(trough_idx, (pd.Timestamp, np.datetime64)) else trough_idx

        # Recovery thresholds
        target_50 = base * 0.5 + trough_val * 0.5
        target_90 = base * 0.9 + trough_val * 0.1
        target_100 = base

        def first_cross(s: pd.Series, target: float) -> Optional[pd.Timestamp]:
            above = s >= target
            if not above.any():
                return None
            idx = above.idxmax()
            return pd.Timestamp(idx) if not isinstance(idx, pd.Timestamp) else idx

        rec_50 = first_cross(ts, target_50)
        rec_90 = first_cross(ts, target_90)
        rec_100 = first_cross(ts, target_100)

        days_50 = (rec_50 - crisis_start).days if rec_50 else None
        days_90 = (rec_90 - crisis_start).days if rec_90 else None
        days_100 = (rec_100 - crisis_start).days if rec_100 else None

        rows.append({
            "destination_id": dest_id,
            "crisis_start": crisis_start,
            "baseline_level": base,
            "trough_level": trough_val,
            "trough_date": trough_date,
            "recovery_50_date": rec_50,
            "recovery_90_date": rec_90,
            "recovery_100_date": rec_100,
            "estimated_days_to_50": days_50,
            "estimated_days_to_90": days_90,
            "estimated_days_to_100": days_100,
        })

    return pd.DataFrame(rows)


def extrapolate_recovery(
    df: pd.DataFrame,
    crisis_start_date: str | pd.Timestamp,
    forecast_horizon_days: int = 90,
    metric: str = "bookings",
) -> pd.DataFrame:
    """
    Extrapolate recovery curve for destinations with insufficient post-crisis data.
    Uses exponential recovery model: y = baseline - (baseline - trough) * exp(-k*t)
    """
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    crisis_start = pd.to_datetime(crisis_start_date)

    baseline = df[df["date"] < crisis_start].groupby("destination_id")[metric].mean()
    post = df[df["date"] >= crisis_start].groupby("destination_id")[metric].agg(["min", "mean", "count"])

    rows = []
    for dest_id in baseline.index:
        base = baseline[dest_id]
        if dest_id not in post.index:
            continue
        trough = post.loc[dest_id, "min"]
        n = post.loc[dest_id, "count"]
        if base <= 0:
            continue

        # Exponential recovery: level = trough + (baseline - trough) * (1 - exp(-k*t))
        k = 0.03 if n < 14 else 0.05
        dates = pd.date_range(crisis_start, periods=forecast_horizon_days, freq="D")
        t = np.arange(forecast_horizon_days)
        recovery = trough + (base - trough) * (1 - np.exp(-k * t))
        recovery = np.clip(recovery, 0, None)

        for i, d in enumerate(dates):
            rows.append({
                "destination_id": dest_id,
                "date": d,
                "recovery_forecast": recovery[i],
                "days_since_crisis": i,
            })

    return pd.DataFrame(rows)
