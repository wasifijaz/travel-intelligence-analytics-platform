"""
Data Cleaning Module
Validates and cleans raw data before feature engineering.
"""
import pandas as pd
import numpy as np
from typing import Optional


def clean_hotel_bookings(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean hotel booking data.
    - Drop rows with invalid dates
    - Handle missing ADR
    - Cap outliers
    - Ensure correct dtypes
    """
    df = df.copy()
    # Drop invalid dates
    df = df.dropna(subset=["arrival_date"])
    df["arrival_date"] = pd.to_datetime(df["arrival_date"])
    df = df[df["arrival_date"].dt.year.between(2015, 2030)]

    # ADR: fill missing with median, cap outliers
    if "adr" in df.columns:
        adr_median = df["adr"].median()
        df["adr"] = df["adr"].fillna(adr_median)
        df["adr"] = df["adr"].clip(lower=0, upper=df["adr"].quantile(0.99))

    # Room nights: ensure non-negative
    for col in ["stays_in_weekend_nights", "stays_in_week_nights"]:
        if col in df.columns:
            df[col] = df[col].fillna(0).clip(lower=0)

    # is_canceled: ensure binary
    if "is_canceled" in df.columns:
        df["is_canceled"] = df["is_canceled"].fillna(0).astype(int).clip(0, 1)

    return df


def clean_search_demand(df: pd.DataFrame) -> pd.DataFrame:
    """Clean search demand data. Accepts 'searches' or 'search_demand' column."""
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"]).dt.date
    col = "search_demand" if "search_demand" in df.columns else "searches"
    df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).clip(lower=0)
    if col == "search_demand" and "searches" not in df.columns:
        df["searches"] = df["search_demand"]
    return df.dropna(subset=["date", "destination_id"])


def clean_crisis_events(df: pd.DataFrame) -> pd.DataFrame:
    """Clean crisis events data."""
    df = df.copy()
    df["crisis_start_date"] = pd.to_datetime(df["crisis_start_date"]).dt.date
    if "crisis_end_date" in df.columns:
        df["crisis_end_date"] = pd.to_datetime(df["crisis_end_date"], errors="coerce").dt.date
    return df.dropna(subset=["crisis_id", "crisis_name", "crisis_start_date"])
