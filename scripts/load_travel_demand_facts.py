"""Load fact_flights / fact_visas into DuckDB (additive; does not modify daily_metrics schema)."""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
from config.settings import DB_PATH
from pipelines.load.storage import (
    get_duckdb_conn,
    init_travel_demand_schema,
    load_travel_demand_facts,
)


def main():
    root = PROJECT_ROOT / "data" / "travel_demand"
    fp = root / "fact_flights.csv"
    vp = root / "fact_visas.csv"
    if not fp.exists() or not vp.exists():
        print("Run: python data/travel_demand/generate_travel_demand_facts.py")
        return
    ff = pd.read_csv(fp)
    fv = pd.read_csv(vp)
    ff["date"] = pd.to_datetime(ff["date"]).dt.date
    fv["date"] = pd.to_datetime(fv["date"]).dt.date
    conn = get_duckdb_conn(DB_PATH)
    init_travel_demand_schema(conn)
    load_travel_demand_facts(conn, ff, fv)
    conn.close()
    print(f"Loaded fact_flights ({len(ff)}), fact_visas ({len(fv)}) into {DB_PATH}")


if __name__ == "__main__":
    main()
