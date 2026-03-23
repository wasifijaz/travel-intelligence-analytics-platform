"""
Storage Layer
Writes data to DuckDB or PostgreSQL.
"""
import pandas as pd
from pathlib import Path
from typing import Literal

# Optional: use duckdb for embedded, or sqlalchemy for PostgreSQL
try:
    import duckdb
except ImportError:
    duckdb = None


def get_duckdb_conn(db_path: str | Path):
    """Get DuckDB connection."""
    if duckdb is None:
        raise ImportError("Install duckdb: pip install duckdb")
    return duckdb.connect(str(db_path))


def init_schema(conn) -> None:
    """Create tables if not exist. Uses DuckDB-compatible SQL."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS destinations (
            destination_id     VARCHAR PRIMARY KEY,
            destination_name   VARCHAR NOT NULL,
            region             VARCHAR,
            created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS crisis_events (
            crisis_id          INTEGER PRIMARY KEY,
            crisis_name        VARCHAR NOT NULL,
            crisis_start_date   DATE NOT NULL,
            crisis_end_date     DATE,
            affected_regions   VARCHAR,
            created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("DROP TABLE IF EXISTS daily_metrics")
    conn.execute("""
        CREATE TABLE daily_metrics (
            date                   DATE NOT NULL,
            destination_id         VARCHAR NOT NULL,
            source_market          VARCHAR,
            crisis_id              INTEGER DEFAULT 0,
            bookings               INTEGER DEFAULT 0,
            cancellations          INTEGER DEFAULT 0,
            total_reservations     INTEGER DEFAULT 0,
            search_demand          DOUBLE,
            adr                    DOUBLE,
            room_nights            DOUBLE DEFAULT 0,
            avg_length_of_stay     DOUBLE,
            travel_type            VARCHAR,
            lead_time_days         INTEGER,
            occupancy_rate         DOUBLE,
            bookings_per_day       DOUBLE NOT NULL,
            cancellation_rate     DOUBLE NOT NULL,
            search_to_booking_ratio DOUBLE,
            adr_change            DOUBLE,
            demand_change_percent  DOUBLE,
            normalized_demand_index DOUBLE,
            crisis_phase           VARCHAR,
            days_since_crisis     INTEGER,
            created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (date, destination_id, source_market, crisis_id)
        )
    """)
    # Travel Demand Intelligence layer (additive; does not alter existing tables)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fact_flights (
            date DATE NOT NULL,
            origin_country VARCHAR NOT NULL,
            destination_id VARCHAR NOT NULL,
            route VARCHAR,
            flights_count INTEGER,
            seat_capacity DOUBLE,
            load_factor DOUBLE,
            avg_airfare DOUBLE,
            airline VARCHAR
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fact_visas (
            date DATE NOT NULL,
            origin_country VARCHAR NOT NULL,
            destination_id VARCHAR NOT NULL,
            visa_applications INTEGER,
            visa_issued INTEGER,
            visa_rejected INTEGER,
            visa_type VARCHAR,
            processing_days DOUBLE
        )
    """)


def init_travel_demand_schema(conn) -> None:
    """Create only travel-demand fact tables (non-destructive to daily_metrics)."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fact_flights (
            date DATE NOT NULL,
            origin_country VARCHAR NOT NULL,
            destination_id VARCHAR NOT NULL,
            route VARCHAR,
            flights_count INTEGER,
            seat_capacity DOUBLE,
            load_factor DOUBLE,
            avg_airfare DOUBLE,
            airline VARCHAR
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fact_visas (
            date DATE NOT NULL,
            origin_country VARCHAR NOT NULL,
            destination_id VARCHAR NOT NULL,
            visa_applications INTEGER,
            visa_issued INTEGER,
            visa_rejected INTEGER,
            visa_type VARCHAR,
            processing_days DOUBLE
        )
    """)


def upsert_daily_metrics(conn, df: pd.DataFrame) -> None:
    """Insert or replace daily_metrics. Uses DuckDB REPLACE semantics."""
    base_cols = [
        "date", "destination_id", "crisis_id", "bookings", "cancellations",
        "total_reservations", "search_demand", "adr", "room_nights",
        "bookings_per_day", "cancellation_rate", "search_to_booking_ratio",
        "adr_change", "demand_change_percent", "normalized_demand_index",
        "crisis_phase", "days_since_crisis",
    ]
    optional = [
        "source_market",
        "avg_length_of_stay",
        "travel_type",
        "lead_time_days",
        "occupancy_rate",
    ]
    cols = base_cols + [c for c in optional if c in df.columns]
    df = df[[c for c in cols if c in df.columns]].copy()
    df["date"] = pd.to_datetime(df["date"]).dt.date
    df["crisis_id"] = df["crisis_id"].fillna(0).astype(int)

    conn.execute("DELETE FROM daily_metrics")
    conn.register("metrics_df", df)
    col_list = ", ".join(cols)
    conn.execute(
        f"INSERT INTO daily_metrics ({col_list}) "
        f"SELECT {col_list} FROM metrics_df"
    )
    try:
        conn.unregister("metrics_df")
    except Exception:
        pass


def load_destinations(conn, df: pd.DataFrame) -> None:
    """Load destinations dimension. Expects: destination_id, destination_name, region."""
    cols = ["destination_id", "destination_name", "region"]
    df = df[[c for c in cols if c in df.columns]].copy()
    if "region" not in df.columns:
        df["region"] = None
    conn.execute("DELETE FROM destinations")
    conn.register("dest_df", df)
    conn.execute(
        "INSERT INTO destinations (destination_id, destination_name, region) "
        "SELECT destination_id, destination_name, region FROM dest_df"
    )
    try:
        conn.unregister("dest_df")
    except Exception:
        pass


def load_crisis_events(conn, df: pd.DataFrame) -> None:
    """Load crisis_events dimension. Expects: crisis_id, crisis_name, crisis_start_date."""
    cols = ["crisis_id", "crisis_name", "crisis_start_date", "crisis_end_date", "affected_regions"]
    df = df[[c for c in cols if c in df.columns]].copy()
    if "crisis_end_date" not in df.columns:
        df["crisis_end_date"] = None
    if "affected_regions" not in df.columns:
        df["affected_regions"] = None
    conn.execute("DELETE FROM crisis_events")
    conn.register("crisis_df", df)
    conn.execute(
        "INSERT INTO crisis_events (crisis_id, crisis_name, crisis_start_date, crisis_end_date, affected_regions) "
        "SELECT crisis_id, crisis_name, crisis_start_date, crisis_end_date, affected_regions FROM crisis_df"
    )
    try:
        conn.unregister("crisis_df")
    except Exception:
        pass


def load_travel_demand_facts(conn, flights_df: pd.DataFrame, visas_df: pd.DataFrame) -> None:
    """Replace fact_flights and fact_visas content. Tables must exist (see init_schema)."""
    cols_f = [
        "date", "origin_country", "destination_id", "route", "flights_count",
        "seat_capacity", "load_factor", "avg_airfare", "airline",
    ]
    cols_v = [
        "date", "origin_country", "destination_id", "visa_applications",
        "visa_issued", "visa_rejected", "visa_type", "processing_days",
    ]
    flights_df = flights_df[[c for c in cols_f if c in flights_df.columns]].copy()
    visas_df = visas_df[[c for c in cols_v if c in visas_df.columns]].copy()
    flights_df["date"] = pd.to_datetime(flights_df["date"]).dt.date
    visas_df["date"] = pd.to_datetime(visas_df["date"]).dt.date
    conn.execute("DELETE FROM fact_flights")
    conn.execute("DELETE FROM fact_visas")
    conn.register("ff", flights_df)
    conn.register("fv", visas_df)
    conn.execute(
        f"INSERT INTO fact_flights ({', '.join(cols_f)}) SELECT {', '.join(cols_f)} FROM ff"
    )
    conn.execute(
        f"INSERT INTO fact_visas ({', '.join(cols_v)}) SELECT {', '.join(cols_v)} FROM fv"
    )
    try:
        conn.unregister("ff")
        conn.unregister("fv")
    except Exception:
        pass
