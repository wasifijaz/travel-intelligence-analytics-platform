"""
Dashboard Data Loader
Loads from DuckDB, runs analytics/forecast if needed.
Supports date filtering for incremental/fresh data.
"""
import pandas as pd
from pathlib import Path
from typing import Optional
from datetime import datetime
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def load_db(db_path: Path, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Load all tables from DuckDB. Optional date filter on daily_metrics. Returns empty DFs on error."""
    import duckdb
    try:
        conn = duckdb.connect(str(db_path), read_only=True)
    except Exception:
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()
    try:
        metrics = conn.execute("SELECT * FROM daily_metrics").fetchdf()
    except Exception:
        metrics = pd.DataFrame()
    if not metrics.empty and (date_from or date_to):
        try:
            metrics["date"] = pd.to_datetime(metrics["date"])
            if date_from:
                metrics = metrics[metrics["date"] >= pd.to_datetime(date_from)]
            if date_to:
                metrics = metrics[metrics["date"] <= pd.to_datetime(date_to)]
        except Exception:
            pass
    try:
        crisis = conn.execute("SELECT * FROM crisis_events ORDER BY crisis_start_date").fetchdf()
    except Exception:
        crisis = pd.DataFrame()
    try:
        destinations = conn.execute("SELECT * FROM destinations").fetchdf()
    except Exception:
        destinations = pd.DataFrame()
    try:
        conn.close()
    except Exception:
        pass
    return metrics, crisis, destinations


def load_forecast_data(forecast_dir: Path):
    """Load forecast outputs if available."""
    forecast_dir = Path(forecast_dir)
    dfs = {}
    if (forecast_dir / "forecast_dataset.csv").exists():
        dfs["forecast"] = pd.read_csv(forecast_dir / "forecast_dataset.csv")
    if (forecast_dir / "forecast_accuracy.csv").exists():
        dfs["accuracy"] = pd.read_csv(forecast_dir / "forecast_accuracy.csv")
    if (forecast_dir / "crisis_recovery_timeline.csv").exists():
        dfs["recovery"] = pd.read_csv(forecast_dir / "crisis_recovery_timeline.csv")
    return dfs


def get_dashboard_data(db_path: Path = None, forecast_dir: Path = None, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """
    Load and compute all dashboard data.
    Returns dict with metrics_df, crisis_df, destinations_df, analytics, forecast_data, last_updated.
    Optional date_from/date_to for filtering (e.g. last 12 months).
    """
    from config.settings import DB_PATH, PROJECT_ROOT
    from models.analytics.demand_shock_metrics import run_full_analytics

    db_path = db_path or DB_PATH
    forecast_dir = forecast_dir or PROJECT_ROOT / "data" / "forecasts"

    if not Path(db_path).exists():
        return {
            "metrics_df": pd.DataFrame(),
            "crisis_df": pd.DataFrame(),
            "destinations_df": pd.DataFrame(),
            "analytics": None,
            "forecast_data": {},
            "crisis_start": None,
            "last_updated": None,
        }

    try:
        metrics, crisis, destinations = load_db(db_path, date_from=date_from, date_to=date_to)
    except Exception:
        return {
            "metrics_df": pd.DataFrame(),
            "crisis_df": pd.DataFrame(),
            "destinations_df": pd.DataFrame(),
            "analytics": None,
            "forecast_data": {},
            "crisis_start": None,
            "last_updated": None,
        }
    last_updated = datetime.fromtimestamp(Path(db_path).stat().st_mtime).strftime("%Y-%m-%d %H:%M") if Path(db_path).exists() else None
    forecast_data = load_forecast_data(forecast_dir)

    analytics = None
    crisis_start = None
    if len(crisis) > 0:
        crisis_start = str(crisis["crisis_start_date"].iloc[0])
    if not metrics.empty and crisis_start:
        try:
            analytics = run_full_analytics(
                metrics,
                crisis_start_date=crisis_start,
                pre_days=30,
                post_days=30,
                top_n=10,
            )
        except Exception:
            analytics = None

    return {
        "metrics_df": metrics,
        "crisis_df": crisis,
        "destinations_df": destinations,
        "analytics": analytics,
        "forecast_data": forecast_data,
        "crisis_start": crisis_start,
        "last_updated": last_updated,
    }
