"""
Data Ingestion Module
Loads raw data from CSV, API, or synthetic sources.
"""
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Optional


def load_hotel_bookings(path: str | Path) -> pd.DataFrame:
    """
    Load Kaggle hotel booking demand CSV.
    Expects columns: hotel, is_canceled, arrival_date_year, arrival_date_month,
    arrival_date_day_of_month, stays_in_weekend_nights, stays_in_week_nights,
    adults, children, country, adr, reservation_status.
    """
    df = pd.read_csv(path)
    # Build arrival_date (month can be name "July" or number 7)
    try:
        df["arrival_date"] = pd.to_datetime(
            df["arrival_date_year"].astype(str)
            + "-"
            + df["arrival_date_month"].astype(str)
            + "-"
            + df["arrival_date_day_of_month"].astype(str),
            format="%Y-%B-%d",
            errors="coerce",
        )
    except (ValueError, TypeError):
        pass
    if "arrival_date" not in df.columns or df["arrival_date"].isna().all():
        df["arrival_date"] = pd.to_datetime(
            df[["arrival_date_year", "arrival_date_month", "arrival_date_day_of_month"]]
        )
    return df


def load_search_demand(path: str | Path) -> pd.DataFrame:
    """Load search demand CSV. Expected: date, destination_id, searches (or search_demand)."""
    df = pd.read_csv(path)
    df["date"] = pd.to_datetime(df["date"]).dt.date
    if "search_demand" not in df.columns and "searches" in df.columns:
        df = df.rename(columns={"searches": "search_demand"})
    return df


def load_crisis_events(path: str | Path) -> pd.DataFrame:
    """Load crisis events CSV. Expected: crisis_id, crisis_name, crisis_start_date, crisis_end_date."""
    df = pd.read_csv(path)
    df["crisis_start_date"] = pd.to_datetime(df["crisis_start_date"]).dt.date
    df["crisis_end_date"] = pd.to_datetime(df["crisis_end_date"], errors="coerce").dt.date
    return df


def load_destinations(path: str | Path) -> pd.DataFrame:
    """Load destinations CSV. Expected: destination_id, destination_name, region."""
    return pd.read_csv(path)


def generate_synthetic_search_demand(
    bookings_df: pd.DataFrame,
    destination_col: str = "country",
    date_col: str = "arrival_date",
    destination_id: str = "PRT",
    correlation_noise: float = 0.2,
) -> pd.DataFrame:
    """
    Generate synthetic search_demand correlated with bookings.
    search_demand ≈ bookings * (1 + noise) with 7-day lead.
    Aggregates by date and assigns destination_id (for single-destination hotels).
    """
    import numpy as np

    agg = (
        bookings_df.groupby(date_col)
        .agg(bookings=("is_canceled", lambda x: (x == 0).sum()))
        .reset_index()
    )
    agg[date_col] = pd.to_datetime(agg[date_col])
    agg = agg.sort_values(date_col)

    # Lag bookings by 7 days as proxy for search (people search before booking)
    agg["search_demand"] = agg["bookings"].shift(-7).ffill().fillna(agg["bookings"])
    np.random.seed(42)
    agg["search_demand"] = agg["search_demand"] * (
        1 + (np.random.rand(len(agg)) - 0.5) * correlation_noise
    )
    agg["search_demand"] = agg["search_demand"].clip(lower=1).round(2)
    agg["destination_id"] = destination_id

    return agg[[date_col, "destination_id", "search_demand"]].rename(
        columns={date_col: "date"}
    )
