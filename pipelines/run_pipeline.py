"""
Hospitality Demand Shock - Full ETL Pipeline
Runs: Ingestion → Cleaning → Feature Engineering → Metric Generation → Storage
"""
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
from config.settings import PROJECT_ROOT, DATA_RAW, DB_PATH, BASELINE_DAYS
from pipelines.ingest.loaders import (
    load_hotel_bookings,
    load_search_demand,
    load_crisis_events,
    load_destinations,
    generate_synthetic_search_demand,
)
from pipelines.transform.cleaners import (
    clean_hotel_bookings,
    clean_search_demand,
    clean_crisis_events,
)
from pipelines.transform.features import run_feature_engineering
from pipelines.load.storage import (
    get_duckdb_conn,
    init_schema,
    upsert_daily_metrics,
    load_destinations as load_destinations_db,
    load_crisis_events as load_crisis_events_db,
)


def ensure_dirs():
    """Create data directories if needed."""
    (PROJECT_ROOT / "data" / "raw").mkdir(parents=True, exist_ok=True)
    (PROJECT_ROOT / "data" / "processed").mkdir(parents=True, exist_ok=True)


def run_pipeline(
    hotel_csv_path: str | Path | None = None,
    search_csv_path: str | Path | None = None,
    crisis_csv_path: str | Path | None = None,
    destinations_csv_path: str | Path | None = None,
    db_path: str | Path | None = None,
    use_synthetic_search: bool = True,
) -> pd.DataFrame:
    """
    Execute full ETL pipeline.
    If paths are None, uses default seed data or generates synthetic data.
    """
    ensure_dirs()
    db_path = db_path or DB_PATH

    # --- 1. INGEST ---
    if hotel_csv_path and Path(hotel_csv_path).exists():
        hotel_raw = load_hotel_bookings(hotel_csv_path)
    else:
        # Fallback: create minimal demo data
        hotel_raw = _create_demo_hotel_data()

    if search_csv_path and Path(search_csv_path).exists():
        search_raw = load_search_demand(search_csv_path)
    elif use_synthetic_search:
        search_raw = generate_synthetic_search_demand(
            hotel_raw,
            date_col="arrival_date",
            destination_id="PRT",
        )
    else:
        search_raw = None

    if crisis_csv_path and Path(crisis_csv_path).exists():
        crisis_raw = load_crisis_events(crisis_csv_path)
    else:
        crisis_raw = _create_demo_crisis_data()

    # When using demo hotel data (2016), use crisis in that date range
    if hotel_csv_path is None or not Path(hotel_csv_path).exists():
        crisis_raw = _create_demo_crisis_data()
    else:
        seed_crisis = PROJECT_ROOT / "data" / "seed" / "crisis_events.csv"
        if seed_crisis.exists():
            crisis_raw = load_crisis_events(seed_crisis)

    if destinations_csv_path and Path(destinations_csv_path).exists():
        destinations_raw = load_destinations(destinations_csv_path)
    else:
        seed_dest = PROJECT_ROOT / "data" / "seed" / "destinations.csv"
        if seed_dest.exists():
            destinations_raw = load_destinations(seed_dest)
        else:
            destinations_raw = _create_demo_destinations()

    # --- 2. CLEAN ---
    hotel_clean = clean_hotel_bookings(hotel_raw)
    search_clean = clean_search_demand(search_raw) if search_raw is not None else None
    crisis_clean = clean_crisis_events(crisis_raw)

    # For hotel data from Portugal, destination = Portugal (PRT)
    # Use country as guest origin; for single-hotel we use PRT as destination
    destination_id = "PRT"

    # --- 3 & 4. FEATURE ENGINEERING + METRIC GENERATION ---
    metrics_df = run_feature_engineering(
        hotel_df=hotel_clean,
        search_df=search_clean,
        crisis_df=crisis_clean if len(crisis_clean) > 0 else None,
        destination_id=destination_id,
        baseline_days=BASELINE_DAYS,
    )

    # Align search_demand: synthetic uses "country" as destination_id
    if search_clean is not None and "destination_id" in search_clean.columns:
        pass  # already merged
    elif search_raw is not None and "country" in search_raw.columns:
        metrics_df["search_demand"] = metrics_df.get("search_demand", pd.Series(dtype=float))

    # --- 5. STORAGE ---
    conn = get_duckdb_conn(db_path)
    init_schema(conn)
    load_destinations_db(conn, destinations_raw)
    load_crisis_events_db(conn, crisis_clean)
    upsert_daily_metrics(conn, metrics_df)
    conn.close()

    print(f"Pipeline complete. Loaded {len(metrics_df)} rows into daily_metrics.")
    return metrics_df


def _create_demo_hotel_data() -> pd.DataFrame:
    """Minimal demo data when no CSV is available."""
    import numpy as np
    np.random.seed(42)
    dates = pd.date_range("2016-01-01", "2016-12-31", freq="D")
    n = len(dates) * 100
    df = pd.DataFrame({
        "hotel": np.random.choice(["City Hotel", "Resort Hotel"], n),
        "is_canceled": np.random.binomial(1, 0.3, n),
        "arrival_date_year": 2016,
        "arrival_date_month": np.random.choice(range(1, 13), n),
        "arrival_date_day_of_month": np.random.randint(1, 29, n),
        "stays_in_weekend_nights": np.random.randint(0, 3, n),
        "stays_in_week_nights": np.random.randint(1, 5, n),
        "adults": np.random.randint(1, 4, n),
        "children": np.random.randint(0, 2, n),
        "country": np.random.choice(["PRT", "GBR", "FRA", "DEU"], n),
        "adr": np.random.uniform(50, 200, n),
        "reservation_status": "Check-Out",
    })
    df["arrival_date"] = pd.to_datetime(
        df["arrival_date_year"].astype(str)
        + "-"
        + df["arrival_date_month"].astype(str)
        + "-"
        + df["arrival_date_day_of_month"].astype(str),
        errors="coerce",
    )
    df = df.dropna(subset=["arrival_date"])
    return df


def _create_demo_crisis_data() -> pd.DataFrame:
    """Demo crisis events. Use mid-2016 so we have pre-crisis baseline."""
    return pd.DataFrame([
        {
            "crisis_id": 1,
            "crisis_name": "Demo Crisis",
            "crisis_start_date": "2016-07-01",
            "crisis_end_date": None,
            "affected_regions": "Europe",
        },
    ])


def _create_demo_destinations() -> pd.DataFrame:
    """Demo destinations."""
    return pd.DataFrame([
        {"destination_id": "PRT", "destination_name": "Portugal", "region": "Southern Europe"},
        {"destination_id": "GBR", "destination_name": "United Kingdom", "region": "Northern Europe"},
    ])


if __name__ == "__main__":
    run_pipeline()
