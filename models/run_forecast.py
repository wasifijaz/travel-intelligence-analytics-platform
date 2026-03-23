"""
Run Forecasting Pipeline
Loads from DuckDB, runs forecast, saves output.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
from config.settings import DB_PATH, PROJECT_ROOT
from models.forecasting import (
    run_forecast_pipeline,
    save_forecast_output,
    compute_recovery_timeline,
)


def load_from_duckdb(db_path: Path):
    """Load daily_metrics and crisis_events from DuckDB."""
    import duckdb
    conn = duckdb.connect(str(db_path))
    df = conn.execute("SELECT * FROM daily_metrics").fetchdf()
    try:
        crisis = conn.execute(
            "SELECT crisis_start_date FROM crisis_events ORDER BY crisis_start_date LIMIT 1"
        ).fetchdf()
        crisis_start = str(crisis["crisis_start_date"].iloc[0]) if len(crisis) > 0 else None
    except Exception:
        crisis_start = None
    conn.close()
    return df, crisis_start


def main():
    db_path = DB_PATH
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}. Run pipeline first: python run_pipeline.py")
        return

    df, crisis_start = load_from_duckdb(db_path)
    if df.empty:
        print("No data in daily_metrics.")
        return

    output_dir = PROJECT_ROOT / "data" / "forecasts"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Running forecast pipeline...")
    result = run_forecast_pipeline(
        df,
        date_col="date",
        destination_id=None,
        metrics=["bookings", "search_demand", "adr", "cancellations"],
        horizon=90,
        test_days=30,
        models=["Prophet", "XGBoost", "SARIMA"],
    )

    paths = save_forecast_output(result, output_dir)
    print(f"Saved forecast dataset: {paths.get('forecast_dataset', 'N/A')}")
    print(f"Saved accuracy metrics: {paths.get('accuracy', 'N/A')}")

    print("\n--- Forecast Accuracy (sample) ---")
    for metric, models in result.accuracy.items():
        for model_name, m in models.items():
            print(f"  {metric} / {model_name}: MAE={m.mae:.2f}, MAPE={m.mape:.1f}%")

    if crisis_start:
        print("\n--- Crisis Recovery Timeline ---")
        recovery = compute_recovery_timeline(df, crisis_start, metric="bookings")
        if len(recovery) > 0:
            cols = ["destination_id", "estimated_days_to_50", "estimated_days_to_90", "estimated_days_to_100"]
            print(recovery[[c for c in cols if c in recovery.columns]].to_string())
            recovery.to_csv(output_dir / "crisis_recovery_timeline.csv", index=False)
            print(f"Saved: {output_dir / 'crisis_recovery_timeline.csv'}")

    return result


if __name__ == "__main__":
    main()
