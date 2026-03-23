"""
Load synthetic dataset into the pipeline and database.
Converts synthetic format to daily_metrics schema.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import numpy as np
from config.settings import DB_PATH, PROJECT_ROOT
from pipelines.load.storage import get_duckdb_conn, init_schema, upsert_daily_metrics, load_destinations, load_crisis_events


def load_synthetic_csv(path: Path) -> pd.DataFrame:
    """Load synthetic demand CSV."""
    df = pd.read_csv(path)
    df["date"] = pd.to_datetime(df["date"])
    return df


def synthetic_to_daily_metrics(
    df: pd.DataFrame,
    crisis_start_date: str = "2022-02-24",
    baseline_days: int = 30,
) -> pd.DataFrame:
    """
    Convert synthetic format to daily_metrics with engineered features.
    """
    df = df.copy()
    df["destination_id"] = df["destination"]
    df["total_reservations"] = df["bookings"] + df["cancellations"]
    df["search_demand"] = df["searches"]

    crisis_start = pd.to_datetime(crisis_start_date)

    # Engineered features
    df["bookings_per_day"] = df["bookings"].astype(float)
    df["cancellation_rate"] = np.where(
        df["total_reservations"] > 0,
        df["cancellations"] / df["total_reservations"],
        0,
    )
    df["search_to_booking_ratio"] = np.where(
        df["bookings"] > 0,
        df["search_demand"] / df["bookings"],
        np.nan,
    )

    # Baseline per destination (30 days before crisis)
    pre_end = crisis_start - pd.Timedelta(days=1)
    pre_start = pre_end - pd.Timedelta(days=baseline_days - 1)
    pre_mask = (df["date"] >= pre_start) & (df["date"] <= pre_end)
    baseline = df.loc[pre_mask].groupby("destination_id").agg(
        baseline_bookings=("bookings", "mean"),
        baseline_adr=("adr", "mean"),
    ).reset_index()

    df = df.merge(baseline, on="destination_id", how="left")
    df["baseline_bookings"] = df["baseline_bookings"].fillna(df["bookings"].mean())
    df["baseline_adr"] = df["baseline_adr"].fillna(df["adr"].mean())
    df["baseline_bookings"] = df["baseline_bookings"].replace(0, 1)

    df["adr_change"] = (df["adr"] - df["baseline_adr"]) / df["baseline_adr"] * 100
    df["demand_change_percent"] = (df["bookings"] - df["baseline_bookings"]) / df["baseline_bookings"] * 100
    df["normalized_demand_index"] = (df["bookings"] / df["baseline_bookings"]) * 100

    df["days_since_crisis"] = (df["date"] - crisis_start).dt.days
    df["days_since_crisis"] = df["days_since_crisis"].clip(lower=0)
    df["crisis_phase"] = np.where(df["days_since_crisis"] == 0, "pre_crisis",
        np.where(df["days_since_crisis"] <= 14, "immediate",
        np.where(df["days_since_crisis"] <= 90, "short_term", "recovery")))
    df["crisis_id"] = 1

    cols = ["date", "destination_id", "crisis_id", "bookings", "cancellations", "total_reservations",
            "search_demand", "adr", "room_nights", "bookings_per_day", "cancellation_rate",
            "search_to_booking_ratio", "adr_change", "demand_change_percent", "normalized_demand_index",
            "crisis_phase", "days_since_crisis"]
    if "lead_time_days" in df.columns:
        cols.append("lead_time_days")
    if "occupancy_rate" in df.columns:
        cols.append("occupancy_rate")
    cols.extend(["source_market", "avg_length_of_stay", "travel_type"])
    return df[[c for c in cols if c in df.columns]]


def main():
    synthetic_path = PROJECT_ROOT / "data" / "synthetic" / "synthetic_demand.csv"
    if not synthetic_path.exists():
        print("Synthetic data not found. Run: python data/synthetic/generate_synthetic_data.py")
        return

    print("Loading synthetic data...")
    df = load_synthetic_csv(synthetic_path)
    print(f"  Rows: {len(df):,}, Destinations: {df['destination'].nunique()}")

    print("Converting to daily_metrics format...")
    metrics = synthetic_to_daily_metrics(df, crisis_start_date="2022-02-24")

    # Destinations
    dest_path = PROJECT_ROOT / "data" / "synthetic" / "destinations.csv"
    if dest_path.exists():
        destinations = pd.read_csv(dest_path)
    else:
        destinations = pd.DataFrame([
            {"destination_id": d, "destination_name": d, "region": ""}
            for d in df["destination"].unique()
        ])

    # Crisis events (extended 2022-2026)
    crisis_path = PROJECT_ROOT / "data" / "seed" / "crisis_events_extended.csv"
    if crisis_path.exists():
        crisis = pd.read_csv(crisis_path)
        if "region_affected" in crisis.columns:
            crisis["affected_regions"] = crisis["region_affected"]
        crisis["crisis_end_date"] = crisis.get("crisis_end_date", pd.NA)
    else:
        crisis = pd.DataFrame([
            {"crisis_id": 1, "crisis_name": "Russia-Ukraine conflict", "crisis_start_date": "2022-02-24", "crisis_end_date": None, "affected_regions": "Eastern Europe"},
            {"crisis_id": 2, "crisis_name": "Israel-Hamas War", "crisis_start_date": "2023-10-07", "crisis_end_date": None, "affected_regions": "Middle East"},
            {"crisis_id": 3, "crisis_name": "Iran-Israel escalation", "crisis_start_date": "2024-04-01", "crisis_end_date": None, "affected_regions": "Middle East"},
        ])

    print("Writing to database...")
    conn = get_duckdb_conn(DB_PATH)
    init_schema(conn)
    load_destinations(conn, destinations)
    load_crisis_events(conn, crisis)
    upsert_daily_metrics(conn, metrics)
    conn.close()

    print(f"Done. Loaded {len(metrics):,} rows into {DB_PATH}")


if __name__ == "__main__":
    main()
