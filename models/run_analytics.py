"""
Run Demand Shock Analytics
Loads from DuckDB, computes metrics, prints results.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
from config.settings import DB_PATH
from models.analytics.demand_shock_metrics import run_full_analytics


def load_from_duckdb(db_path: str | Path):
    """Load daily_metrics and crisis_events from DuckDB. Returns (metrics_df, crisis_start)."""
    import duckdb
    conn = duckdb.connect(str(db_path))
    df = conn.execute("SELECT * FROM daily_metrics").fetchdf()
    try:
        crisis_df = conn.execute("SELECT crisis_id, crisis_start_date FROM crisis_events ORDER BY crisis_start_date LIMIT 1").fetchdf()
        crisis_start = str(crisis_df["crisis_start_date"].iloc[0]) if len(crisis_df) > 0 else None
    except Exception:
        crisis_start = None
    conn.close()
    return df, crisis_start


def main(crisis_start_override: str | None = None):
    db_path = DB_PATH
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}. Run the pipeline first: python run_pipeline.py")
        return

    df, crisis_start = load_from_duckdb(db_path)
    if df.empty:
        print("No data in daily_metrics.")
        return

    crisis_start = crisis_start_override or crisis_start or "2016-07-01"

    print(f"Using crisis start: {crisis_start}")
    print("Running demand shock analytics...")
    results = run_full_analytics(
        df,
        crisis_start_date=crisis_start,
        pre_days=30,
        post_days=30,
        top_n=10,
    )

    print("\n" + "=" * 60)
    print("DEMAND SHOCK METRICS (sample)")
    print("=" * 60)
    shock = results["shock_metrics"]
    cols = ["destination_id", "booking_change_pct", "search_change_pct", "adr_change_pct", "cancellation_spike"]
    print(shock[[c for c in cols if c in shock.columns]].head(10).to_string())

    print("\n" + "=" * 60)
    print("TOP DESTINATIONS GAINING DEMAND")
    print("=" * 60)
    print(results["top_gaining"].to_string())

    print("\n" + "=" * 60)
    print("TOP DESTINATIONS LOSING DEMAND")
    print("=" * 60)
    print(results["top_losing"].to_string())

    print("\n" + "=" * 60)
    print("DESTINATION RESILIENCE INDEX (Ranked)")
    print("=" * 60)
    res = results.get("resilience_ranking", pd.DataFrame())
    if len(res) > 0:
        cols = ["resilience_rank", "destination_id", "resilience_score", "booking_recovery_score", "search_demand_score", "adr_stability_score"]
        cols = [c for c in cols if c in res.columns]
        print(res[cols].head(15).to_string())
    else:
        print("No resilience data.")

    print("\n" + "=" * 60)
    print("SEARCH-BOOKING CORRELATION")
    print("=" * 60)
    for k, v in results["search_booking_corr"].items():
        print(f"  {k}: {v}")

    return results


if __name__ == "__main__":
    main()
