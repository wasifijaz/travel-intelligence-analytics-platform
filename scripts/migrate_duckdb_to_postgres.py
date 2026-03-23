"""
Migrate local DuckDB analytics tables into PostgreSQL (Supabase-compatible).

Usage:
  python scripts/migrate_duckdb_to_postgres.py --pg-host <host> --pg-port 5432 \
    --pg-user postgres --pg-password <password> --pg-db postgres
"""
from __future__ import annotations

import argparse
from typing import Iterable

import duckdb
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values


DUCKDB_PATH = "data/hospitality.db"
TABLES = ("destinations", "crisis_events", "daily_metrics", "fact_flights", "fact_visas")


DDL = {
    "destinations": """
        CREATE TABLE IF NOT EXISTS destinations (
            destination_id TEXT PRIMARY KEY,
            destination_name TEXT NOT NULL,
            region TEXT,
            created_at TIMESTAMP NULL
        )
    """,
    "crisis_events": """
        CREATE TABLE IF NOT EXISTS crisis_events (
            crisis_id INTEGER PRIMARY KEY,
            crisis_name TEXT NOT NULL,
            crisis_start_date DATE NOT NULL,
            crisis_end_date DATE NULL,
            affected_regions TEXT,
            created_at TIMESTAMP NULL
        )
    """,
    "daily_metrics": """
        CREATE TABLE IF NOT EXISTS daily_metrics (
            date DATE NOT NULL,
            destination_id TEXT NOT NULL,
            source_market TEXT NULL,
            crisis_id INTEGER NOT NULL DEFAULT 0,
            bookings INTEGER NOT NULL DEFAULT 0,
            cancellations INTEGER NOT NULL DEFAULT 0,
            total_reservations INTEGER NOT NULL DEFAULT 0,
            search_demand DOUBLE PRECISION NULL,
            adr DOUBLE PRECISION NULL,
            room_nights DOUBLE PRECISION NULL,
            avg_length_of_stay DOUBLE PRECISION NULL,
            travel_type TEXT NULL,
            lead_time_days INTEGER NULL,
            occupancy_rate DOUBLE PRECISION NULL,
            bookings_per_day DOUBLE PRECISION NOT NULL,
            cancellation_rate DOUBLE PRECISION NOT NULL,
            search_to_booking_ratio DOUBLE PRECISION NULL,
            adr_change DOUBLE PRECISION NULL,
            demand_change_percent DOUBLE PRECISION NULL,
            normalized_demand_index DOUBLE PRECISION NULL,
            crisis_phase TEXT NULL,
            days_since_crisis INTEGER NULL,
            created_at TIMESTAMP NULL,
            PRIMARY KEY (date, destination_id, source_market, crisis_id)
        )
    """,
    "fact_flights": """
        CREATE TABLE IF NOT EXISTS fact_flights (
            date DATE NOT NULL,
            origin_country TEXT NOT NULL,
            destination_id TEXT NOT NULL,
            route TEXT NULL,
            flights_count INTEGER NULL,
            seat_capacity DOUBLE PRECISION NULL,
            load_factor DOUBLE PRECISION NULL,
            avg_airfare DOUBLE PRECISION NULL,
            airline TEXT NULL
        )
    """,
    "fact_visas": """
        CREATE TABLE IF NOT EXISTS fact_visas (
            date DATE NOT NULL,
            origin_country TEXT NOT NULL,
            destination_id TEXT NOT NULL,
            visa_applications INTEGER NULL,
            visa_issued INTEGER NULL,
            visa_rejected INTEGER NULL,
            visa_type TEXT NULL,
            processing_days DOUBLE PRECISION NULL
        )
    """,
}


def _chunks(rows: list[tuple], size: int) -> Iterable[list[tuple]]:
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def _to_rows(df: pd.DataFrame) -> list[tuple]:
    """Convert dataframe rows with NULL-safe values for psycopg2."""
    clean = df.where(pd.notnull(df), None)
    rows: list[tuple] = []
    for row in clean.itertuples(index=False, name=None):
        out = []
        for v in row:
            if pd.isna(v):
                out.append(None)
            elif isinstance(v, pd.Timestamp):
                out.append(v.to_pydatetime())
            elif isinstance(v, str) and v.strip().lower() in {"nat", "nan", "none", ""}:
                out.append(None)
            elif hasattr(v, "item"):
                try:
                    vv = v.item()
                    if isinstance(vv, str) and vv.strip().lower() in {"nat", "nan", "none", ""}:
                        out.append(None)
                    else:
                        out.append(vv)
                except Exception:
                    out.append(v)
            else:
                out.append(v)
        rows.append(tuple(out))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pg-host", required=True)
    ap.add_argument("--pg-port", type=int, default=5432)
    ap.add_argument("--pg-user", required=True)
    ap.add_argument("--pg-password", required=True)
    ap.add_argument("--pg-db", default="postgres")
    ap.add_argument("--sslmode", default="require")
    ap.add_argument("--batch-size", type=int, default=5000)
    args = ap.parse_args()

    dcon = duckdb.connect(DUCKDB_PATH, read_only=True)
    pcon = psycopg2.connect(
        host=args.pg_host,
        port=args.pg_port,
        user=args.pg_user,
        password=args.pg_password,
        dbname=args.pg_db,
        sslmode=args.sslmode,
    )
    pcon.autocommit = False

    try:
        with pcon.cursor() as cur:
            for table in TABLES:
                print(f"[schema] {table}")
                cur.execute(DDL[table])
            pcon.commit()

            for table in TABLES:
                print(f"[copy] {table}")
                df = dcon.execute(f"SELECT * FROM {table}").fetchdf()
                cols = list(df.columns)
                col_list = ", ".join(cols)
                cur.execute(f"TRUNCATE TABLE {table}")
                rows = _to_rows(df)
                if rows:
                    insert_sql = f"INSERT INTO {table} ({col_list}) VALUES %s"
                    for batch in _chunks(rows, args.batch_size):
                        execute_values(cur, insert_sql, batch, page_size=args.batch_size)
                pcon.commit()
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                print(f"[ok] {table}: {cur.fetchone()[0]} rows")
    finally:
        dcon.close()
        pcon.close()


if __name__ == "__main__":
    main()
