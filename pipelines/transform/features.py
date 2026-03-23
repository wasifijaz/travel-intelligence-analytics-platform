"""
Feature Engineering Module
Computes: bookings_per_day, cancellation_rate, search_to_booking_ratio,
ADR_change, demand_change_percent, normalized_demand_index.
"""
import pandas as pd
import numpy as np
from typing import Optional
from datetime import timedelta


# Crisis phase thresholds (days after crisis start)
IMMEDIATE_DAYS = 14
SHORT_TERM_DAYS = 90


def get_crisis_phase(date: pd.Timestamp, crisis_start: pd.Timestamp) -> str:
    """Return crisis_phase: pre_crisis, immediate, short_term, recovery."""
    if pd.isna(crisis_start) or date < crisis_start:
        return "pre_crisis"
    days = (date - crisis_start).days
    if days <= IMMEDIATE_DAYS:
        return "immediate"
    if days <= SHORT_TERM_DAYS:
        return "short_term"
    return "recovery"


def compute_daily_aggregates(
    hotel_df: pd.DataFrame,
    search_df: Optional[pd.DataFrame] = None,
    destination_id: str = "PRT",
) -> pd.DataFrame:
    """
    Aggregate hotel data by date to get daily metrics.
    Assumes hotel_df has: arrival_date, is_canceled, adr, stays_in_weekend_nights, stays_in_week_nights.
    """
    hotel_df = hotel_df.copy()
    hotel_df["date"] = pd.to_datetime(hotel_df["arrival_date"]).dt.date
    hotel_df["room_nights"] = (
        hotel_df["stays_in_weekend_nights"].fillna(0) + hotel_df["stays_in_week_nights"].fillna(0)
    )

    agg = (
        hotel_df.groupby("date")
        .agg(
            bookings=("is_canceled", lambda x: (x == 0).sum()),
            cancellations=("is_canceled", lambda x: (x == 1).sum()),
            total_reservations=("is_canceled", "count"),
            adr=("adr", "mean"),
            room_nights=("room_nights", "sum"),
        )
        .reset_index()
    )
    agg["destination_id"] = destination_id

    if search_df is not None:
        search_df = search_df.copy()
        search_df["date"] = pd.to_datetime(search_df["date"]).dt.date
        search_col = "search_demand" if "search_demand" in search_df.columns else "searches"
        cols = ["date", "destination_id", search_col]
        search_sub = search_df[cols].rename(columns={search_col: "search_demand"})
        agg = agg.merge(search_sub, on=["date", "destination_id"], how="left")
    else:
        agg["search_demand"] = np.nan

    return agg


def engineer_features(
    daily_df: pd.DataFrame,
    crisis_df: pd.DataFrame,
    baseline_days: int = 30,
) -> pd.DataFrame:
    """
    Add engineered features to daily aggregates.
    - bookings_per_day
    - cancellation_rate
    - search_to_booking_ratio
    - adr_change
    - demand_change_percent
    - normalized_demand_index
    - crisis_phase
    - days_since_crisis
    """
    df = daily_df.copy()
    df["date"] = pd.to_datetime(df["date"])

    # Use first crisis for baseline (or join by affected region)
    crisis = crisis_df.iloc[0]
    crisis_start = pd.to_datetime(crisis["crisis_start_date"])
    crisis_id = crisis["crisis_id"]

    # Baseline: 30-day average before crisis (or first 30 days if no pre-crisis data)
    baseline_mask = (df["date"] >= crisis_start - timedelta(days=baseline_days)) & (
        df["date"] < crisis_start
    )
    if baseline_mask.sum() == 0:
        # Fallback: use first baseline_days of data
        baseline_mask = df["date"] < df["date"].min() + timedelta(days=baseline_days)
    baseline = df.loc[baseline_mask].agg({"bookings": "mean", "adr": "mean"})
    baseline_bookings = float(baseline["bookings"]) if baseline["bookings"] > 0 else 1.0
    baseline_adr = float(baseline["adr"]) if baseline["adr"] > 0 else 1.0

    # Engineered features
    df["bookings_per_day"] = df["bookings"].astype(float)
    df["cancellation_rate"] = np.where(
        df["total_reservations"] > 0,
        df["cancellations"] / df["total_reservations"],
        0,
    )
    df["search_to_booking_ratio"] = np.where(
        df["bookings"] > 0,
        df["search_demand"].fillna(0) / df["bookings"],
        np.nan,
    )
    df["search_to_booking_ratio"] = df["search_to_booking_ratio"].clip(upper=1000)

    df["adr_change"] = np.where(
        baseline_adr > 0,
        (df["adr"] - baseline_adr) / baseline_adr * 100,
        np.nan,
    )
    df["demand_change_percent"] = np.where(
        baseline_bookings > 0,
        (df["bookings"] - baseline_bookings) / baseline_bookings * 100,
        np.nan,
    )
    df["normalized_demand_index"] = np.where(
        baseline_bookings > 0,
        (df["bookings"] / baseline_bookings) * 100,
        np.nan,
    )

    df["crisis_phase"] = df["date"].apply(lambda d: get_crisis_phase(d, crisis_start))
    df["days_since_crisis"] = (df["date"] - crisis_start).dt.days
    df["days_since_crisis"] = df["days_since_crisis"].clip(lower=0)
    df["crisis_id"] = crisis_id

    return df


def run_feature_engineering(
    hotel_df: pd.DataFrame,
    search_df: Optional[pd.DataFrame] = None,
    crisis_df: pd.DataFrame = None,
    destination_id: str = "PRT",
    baseline_days: int = 30,
) -> pd.DataFrame:
    """
    Full feature engineering pipeline.
    Combines aggregation + feature derivation.
    """
    if crisis_df is None or len(crisis_df) == 0:
        # No crisis: use simple features without baseline comparison
        daily = compute_daily_aggregates(hotel_df, search_df, destination_id)
        daily["bookings_per_day"] = daily["bookings"]
        daily["cancellation_rate"] = np.where(
            daily["total_reservations"] > 0,
            daily["cancellations"] / daily["total_reservations"],
            0,
        )
        daily["search_to_booking_ratio"] = np.where(
            daily["bookings"] > 0,
            daily["search_demand"].fillna(0) / daily["bookings"],
            np.nan,
        )
        daily["adr_change"] = np.nan
        daily["demand_change_percent"] = np.nan
        daily["normalized_demand_index"] = 100.0  # no baseline
        daily["crisis_phase"] = "pre_crisis"
        daily["days_since_crisis"] = 0
        daily["crisis_id"] = 0
        return daily

    daily = compute_daily_aggregates(hotel_df, search_df, destination_id)
    return engineer_features(daily, crisis_df, baseline_days)
