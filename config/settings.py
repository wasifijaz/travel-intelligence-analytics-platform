"""Pipeline configuration."""
from pathlib import Path
import os

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
DATA_SEED = PROJECT_ROOT / "data" / "seed"
PIPELINES_DIR = PROJECT_ROOT / "pipelines"

# Database
DB_PATH = PROJECT_ROOT / "data" / "hospitality.db"  # DuckDB
DB_URL = os.getenv("DATABASE_URL")  # Optional PostgreSQL URL for production runtime

# Baseline window (days before crisis for computing baseline metrics)
BASELINE_DAYS = 30

# Crisis phase thresholds (days after crisis start)
CRISIS_PHASE_IMMEDIATE = 14
CRISIS_PHASE_SHORT_TERM = 90
