"""
Entry point for running the Hospitality Demand Shock ETL pipeline.
Run from project root: python run_pipeline.py
"""
import sys
from pathlib import Path

# Ensure project root is on path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

import argparse
from pipelines.run_pipeline import run_pipeline


def main():
    parser = argparse.ArgumentParser(description="Hospitality Demand Shock ETL Pipeline")
    parser.add_argument("--hotel", type=str, help="Path to hotel bookings CSV")
    parser.add_argument("--search", type=str, help="Path to search demand CSV")
    parser.add_argument("--crisis", type=str, help="Path to crisis events CSV")
    parser.add_argument("--destinations", type=str, help="Path to destinations CSV")
    parser.add_argument("--db", type=str, help="Path to DuckDB file")
    parser.add_argument("--no-synthetic-search", action="store_true", help="Disable synthetic search generation")
    args = parser.parse_args()

    run_pipeline(
        hotel_csv_path=args.hotel,
        search_csv_path=args.search,
        crisis_csv_path=args.crisis,
        destinations_csv_path=args.destinations,
        db_path=args.db,
        use_synthetic_search=not args.no_synthetic_search,
    )


if __name__ == "__main__":
    main()
