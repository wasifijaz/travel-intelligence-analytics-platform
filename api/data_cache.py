"""
Startup data cache with dynamic filtering support.

Architecture:
- Raw dataframes kept as module-level globals (loaded once at startup)
- Pre-serialized JSON bytes for the "no filter" fast path
- compute_filtered_response() recomputes from in-memory DFs on the fly
"""
import logging
import json
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

from config.settings import DB_PATH, PROJECT_ROOT
from dashboard.data_loader import load_db, load_forecast_data

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory raw dataframes (populated by refresh_cache)
# ---------------------------------------------------------------------------
_raw_metrics: pd.DataFrame = pd.DataFrame()
_raw_crisis: pd.DataFrame = pd.DataFrame()
_raw_destinations: pd.DataFrame = pd.DataFrame()
_raw_analytics_dict: dict | None = None
_raw_last_updated: str | None = None

# ---------------------------------------------------------------------------
# Pre-serialized JSON bytes — returned directly for "no filter" requests
# ---------------------------------------------------------------------------
_json_health: bytes = b'{"status":"ok","metrics_rows":0,"crisis_events":0}'
_json_summary: bytes = b'{}'
_json_crisis: bytes = b'{"data":[],"count":0}'
_json_timeline: bytes = b'{"data":[],"count":0}'
_json_analytics: bytes = b'{}'
_json_metrics: bytes = b'{"data":[],"count":0}'
_json_destinations: bytes = b'{"data":[],"count":0}'
_json_forecast_recovery: bytes = b'{"data":[],"count":0}'
_json_forecast_accuracy: bytes = b'{"data":[],"count":0}'
_json_kpis_hotel: bytes = b'{"data":[],"count":0}'
_json_kpis_ota: bytes = b'{"data":[],"count":0}'
_json_risk_index: bytes = b'{"data":[],"count":0}'
_json_corridor: bytes = b'{"data":[],"count":0}'
_json_funnel: bytes = b'{"stages":[]}'
_json_prepost: bytes = b'{"pre":{},"post":{},"crisis_date":null}'
_json_forecast_dataset: bytes = b'{"data":[],"count":0}'
_json_timeline_by_dest: bytes = b'{"data":[],"count":0}'
_json_behavior: bytes = b'{"length_of_stay":[],"booking_window":[],"traveler_type":[]}'
_json_travel_flows: bytes = b'{"data":[],"count":0}'
_json_source_markets: bytes = b'{"data":[],"count":0}'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _df_to_records(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> list[dict] with JSON-safe types."""
    if df is None or df.empty:
        return []
    df = df.copy()
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col].dtype):
            df[col] = df[col].dt.strftime("%Y-%m-%d")
    df = df.replace({np.nan: None, np.inf: None, -np.inf: None})
    for col in df.select_dtypes(include=[np.integer]).columns:
        df[col] = df[col].astype(object).where(df[col].notna(), None)
    for col in df.select_dtypes(include=[np.floating]).columns:
        df[col] = df[col].astype(object).where(df[col].notna(), None)
    return df.to_dict("records")


def _to_bytes(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")


def _get_crisis_start(crisis_df: pd.DataFrame, crisis_id: int | None = None) -> str | None:
    """Return the crisis start date string for a given crisis_id, or the first crisis."""
    if crisis_df.empty:
        return None
    if crisis_id is not None and "crisis_id" in crisis_df.columns:
        match = crisis_df[crisis_df["crisis_id"] == crisis_id]
        if not match.empty:
            return str(match["crisis_start_date"].iloc[0])
    return str(crisis_df["crisis_start_date"].iloc[0])


def _filter_metrics(
    metrics_df: pd.DataFrame,
    date_from: str | None = None,
    date_to: str | None = None,
    destination: str | None = None,
    source_market: str | None = None,
    travel_type: str | None = None,
) -> pd.DataFrame:
    """Apply date, destination, source_market, and travel_type filters to a metrics dataframe."""
    if metrics_df.empty:
        return metrics_df
    df = metrics_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    if date_from:
        df = df[df["date"] >= pd.to_datetime(date_from)]
    if date_to:
        df = df[df["date"] <= pd.to_datetime(date_to)]
    if destination and "destination_id" in df.columns:
        df = df[df["destination_id"] == destination]
    if source_market and "source_market" in df.columns:
        df = df[df["source_market"] == source_market]
    if travel_type and "travel_type" in df.columns:
        df = df[df["travel_type"] == travel_type]
    return df


# ---------------------------------------------------------------------------
# Endpoint computation helpers (shared by cache build + filtered path)
# ---------------------------------------------------------------------------

def _compute_summary(metrics_df: pd.DataFrame, last_updated: str | None) -> dict:
    if metrics_df.empty:
        return {
            "date_min": None, "date_max": None, "total_bookings": 0,
            "total_room_nights": 0, "destinations_count": 0,
            "records_count": 0, "last_updated": last_updated,
        }
    df = metrics_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    return {
        "date_min": df["date"].min().strftime("%Y-%m-%d"),
        "date_max": df["date"].max().strftime("%Y-%m-%d"),
        "total_bookings": int(df["bookings"].sum()) if "bookings" in df.columns else 0,
        "total_room_nights": int(df["room_nights"].sum()) if "room_nights" in df.columns else 0,
        "destinations_count": int(df["destination_id"].nunique()) if "destination_id" in df.columns else 0,
        "records_count": len(df),
        "last_updated": last_updated,
    }


def _compute_timeline(metrics_df: pd.DataFrame) -> dict:
    if metrics_df.empty:
        return {"data": [], "count": 0}
    df = metrics_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    agg_cols = {}
    for col, op in [("bookings", "sum"), ("search_demand", "sum"), ("adr", "mean"), ("room_nights", "sum")]:
        if col in df.columns:
            agg_cols[col] = (col, op)
    if not agg_cols:
        return {"data": [], "count": 0}
    agg = df.groupby("date").agg(**agg_cols).reset_index()
    agg["date"] = agg["date"].dt.strftime("%Y-%m-%d")
    return {"data": _df_to_records(agg), "count": len(agg)}


def _compute_analytics(metrics_df: pd.DataFrame, crisis_start: str | None) -> dict | None:
    if metrics_df.empty or not crisis_start:
        return None
    try:
        from models.analytics.demand_shock_metrics import run_full_analytics
        return run_full_analytics(
            metrics_df, crisis_start_date=crisis_start,
            pre_days=30, post_days=30, top_n=10,
        )
    except Exception:
        log.exception("Analytics computation failed.")
        return None


def _analytics_to_payload(analytics_dict: dict | None) -> dict:
    if not analytics_dict:
        return {
            "shock_metrics": [], "top_gaining": [], "top_losing": [],
            "substitution": [], "sankey_flows": [], "resilience_ranking": [],
            "search_booking_corr": {},
        }
    return {
        "shock_metrics": _df_to_records(analytics_dict.get("shock_metrics")),
        "top_gaining": _df_to_records(analytics_dict.get("top_gaining")),
        "top_losing": _df_to_records(analytics_dict.get("top_losing")),
        "substitution": _df_to_records(analytics_dict.get("substitution")),
        "sankey_flows": _df_to_records(analytics_dict.get("sankey_flows")),
        "resilience_ranking": _df_to_records(analytics_dict.get("resilience_ranking")),
        "search_booking_corr": analytics_dict.get("search_booking_corr") or {},
    }


def _compute_metrics_payload(metrics_df: pd.DataFrame) -> dict:
    if metrics_df.empty:
        return {"data": [], "count": 0}
    df = metrics_df.tail(5000).copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return {"data": _df_to_records(df), "count": len(df)}


def _compute_kpis_hotel(metrics_df: pd.DataFrame) -> dict:
    if metrics_df.empty:
        return {"data": [], "count": 0}
    try:
        from models.analytics.hospitality_kpis import hotel_chain_kpis
        hk = hotel_chain_kpis(metrics_df)
        return {"data": _df_to_records(hk), "count": len(hk)}
    except Exception:
        log.exception("hotel_chain_kpis failed.")
        return {"data": [], "count": 0}


def _compute_kpis_ota(metrics_df: pd.DataFrame) -> dict:
    if metrics_df.empty:
        return {"data": [], "count": 0}
    try:
        from models.analytics.hospitality_kpis import ota_kpis
        ok = ota_kpis(metrics_df)
        return {"data": _df_to_records(ok), "count": len(ok)}
    except Exception:
        log.exception("ota_kpis failed.")
        return {"data": [], "count": 0}


def _compute_risk_index(analytics_dict: dict | None) -> dict:
    shock_metrics = analytics_dict.get("shock_metrics") if analytics_dict else None
    if shock_metrics is None or (isinstance(shock_metrics, pd.DataFrame) and shock_metrics.empty):
        return {"data": [], "count": 0}
    try:
        from models.analytics.hospitality_kpis import travel_risk_index
        ri = travel_risk_index(shock_metrics)
        keep_cols = [c for c in ["destination_id", "travel_risk_index", "risk_tier",
                                 "risk_booking", "risk_cancel", "risk_adr"] if c in ri.columns]
        records = _df_to_records(ri[keep_cols])
        tier_to_level = {"Low Risk": "low", "Medium Risk": "medium", "High Risk": "high"}
        for rec in records:
            tier = rec.get("risk_tier")
            rec["risk_level"] = tier_to_level.get(tier, "unknown") if tier else "unknown"
        return {"data": records, "count": len(records)}
    except Exception:
        log.exception("travel_risk_index failed.")
        return {"data": [], "count": 0}


def _compute_corridor(metrics_df: pd.DataFrame, crisis_start: str | None) -> dict:
    if metrics_df.empty or not crisis_start:
        return {"data": [], "count": 0}
    try:
        crisis_start_dt = pd.to_datetime(crisis_start)
        df_c = metrics_df.copy()
        df_c["date"] = pd.to_datetime(df_c["date"])

        has_source = "source_market" in df_c.columns
        group_cols = ["source_market", "destination_id"] if has_source else ["destination_id"]

        pre_c = df_c[df_c["date"] < crisis_start_dt]
        post_c = df_c[df_c["date"] >= crisis_start_dt]

        agg_pre = pre_c.groupby(group_cols).agg(
            bookings_pre=("bookings", "sum"),
            search_pre=("search_demand", "sum"),
            adr_pre=("adr", "mean"),
        ).reset_index()
        agg_post = post_c.groupby(group_cols).agg(
            bookings_post=("bookings", "sum"),
            search_post=("search_demand", "sum"),
            adr_post=("adr", "mean"),
        ).reset_index()

        corridor = agg_pre.merge(agg_post, on=group_cols, how="outer").fillna(0)
        corridor["change_pct"] = np.where(
            corridor["bookings_pre"] > 0,
            (corridor["bookings_post"] - corridor["bookings_pre"]) / corridor["bookings_pre"] * 100,
            0,
        )

        rows = []
        for _, r in corridor.iterrows():
            row = {
                "destination": r["destination_id"],
                "bookings_pre": float(r["bookings_pre"]),
                "bookings_post": float(r["bookings_post"]),
                "change_pct": float(r["change_pct"]),
                "search_pre": float(r["search_pre"]),
                "search_post": float(r["search_post"]),
            }
            if has_source:
                row["source"] = r["source_market"]
            else:
                row["source"] = r["destination_id"]
            rows.append(row)
        return {"data": rows, "count": len(rows)}
    except Exception:
        log.exception("corridor matrix failed.")
        return {"data": [], "count": 0}


def _compute_funnel(metrics_df: pd.DataFrame) -> dict:
    """4-stage funnel: Search Volume, Prebooks, Room Night Bookings, Cancellations."""
    if metrics_df.empty:
        return {"stages": []}
    total_search = int(metrics_df["search_demand"].sum()) if "search_demand" in metrics_df.columns else 0
    total_bookings = int(metrics_df["bookings"].sum()) if "bookings" in metrics_df.columns else 0
    prebooks = int(total_bookings * 1.3)
    total_cancellations = int(metrics_df["cancellations"].sum()) if "cancellations" in metrics_df.columns else 0
    return {"stages": [
        {"name": "Search Volume", "value": total_search},
        {"name": "Prebooks", "value": prebooks},
        {"name": "Room Night Bookings", "value": total_bookings},
        {"name": "Cancellations", "value": total_cancellations},
    ]}


def _period_stats(part: pd.DataFrame) -> dict:
    return {
        "total_bookings": int(part["bookings"].sum()) if "bookings" in part.columns else 0,
        "avg_adr": float(part["adr"].mean()) if "adr" in part.columns and not part["adr"].empty else 0,
        "total_search_demand": int(part["search_demand"].sum()) if "search_demand" in part.columns else 0,
        "total_room_nights": int(part["room_nights"].sum()) if "room_nights" in part.columns else 0,
        "avg_occupancy_rate": float(part["occupancy_rate"].mean()) if "occupancy_rate" in part.columns and not part["occupancy_rate"].empty else 0,
        "total_cancellations": int(part["cancellations"].sum()) if "cancellations" in part.columns else 0,
    }


def _compute_prepost(metrics_df: pd.DataFrame, crisis_start: str | None) -> dict:
    if metrics_df.empty or not crisis_start:
        return {"pre": {}, "post": {}, "crisis_date": None}
    try:
        crisis_dt = pd.to_datetime(crisis_start)
        df_pp = metrics_df.copy()
        df_pp["date"] = pd.to_datetime(df_pp["date"])
        pre_df = df_pp[df_pp["date"] < crisis_dt]
        post_df = df_pp[df_pp["date"] >= crisis_dt]
        return {
            "pre": _period_stats(pre_df),
            "post": _period_stats(post_df),
            "crisis_date": crisis_start,
        }
    except Exception:
        log.exception("prepost failed.")
        return {"pre": {}, "post": {}, "crisis_date": None}


def _compute_timeline_by_dest(metrics_df: pd.DataFrame) -> dict:
    if metrics_df.empty:
        return {"data": [], "count": 0}
    try:
        df_tbd = metrics_df.copy()
        df_tbd["date"] = pd.to_datetime(df_tbd["date"])
        df_tbd["month"] = df_tbd["date"].dt.to_period("M")
        agg_tbd = df_tbd.groupby(["month", "destination_id"]).agg(
            bookings=("bookings", "sum"),
        ).reset_index()
        agg_tbd["date"] = agg_tbd["month"].dt.to_timestamp().dt.strftime("%Y-%m-%d")
        agg_tbd = agg_tbd.drop(columns=["month"])
        return {
            "data": _df_to_records(agg_tbd[["date", "destination_id", "bookings"]]),
            "count": len(agg_tbd),
        }
    except Exception:
        log.exception("timeline_by_dest failed.")
        return {"data": [], "count": 0}


def _compute_behavior(metrics_df: pd.DataFrame) -> dict:
    """Travel behavior distributions computed from metrics."""
    empty = {"length_of_stay": [], "booking_window": [], "traveler_type": []}
    if metrics_df.empty:
        return empty

    los_dist = []
    if "avg_length_of_stay" in metrics_df.columns:
        valid = metrics_df[metrics_df["avg_length_of_stay"].notna()].copy()
        if not valid.empty:
            bins = [0, 2, 4, 7, 14, float("inf")]
            labels = ["1-2 nights", "3-4 nights", "5-7 nights", "8-14 nights", "15+ nights"]
            valid["los_bucket"] = pd.cut(valid["avg_length_of_stay"], bins=bins, labels=labels, right=True)
            counts = valid["los_bucket"].value_counts().reindex(labels, fill_value=0)
            total = counts.sum()
            for label in labels:
                c = int(counts.get(label, 0))
                los_dist.append({
                    "category": label,
                    "count": c,
                    "pct": round(c / total * 100, 1) if total > 0 else 0,
                })
    elif "room_nights" in metrics_df.columns and "bookings" in metrics_df.columns:
        valid = metrics_df[(metrics_df["bookings"] > 0)].copy()
        if not valid.empty:
            valid["avg_los"] = valid["room_nights"] / valid["bookings"]
            bins = [0, 2, 4, 7, 14, float("inf")]
            labels = ["1-2 nights", "3-4 nights", "5-7 nights", "8-14 nights", "15+ nights"]
            valid["los_bucket"] = pd.cut(valid["avg_los"], bins=bins, labels=labels, right=True)
            counts = valid["los_bucket"].value_counts().reindex(labels, fill_value=0)
            total = counts.sum()
            for label in labels:
                c = int(counts.get(label, 0))
                los_dist.append({
                    "category": label,
                    "count": c,
                    "pct": round(c / total * 100, 1) if total > 0 else 0,
                })

    bw_dist = []
    if "lead_time_days" in metrics_df.columns:
        lt = metrics_df["lead_time_days"].dropna()
        if not lt.empty:
            bins = [0, 3, 7, 14, 30, float("inf")]
            labels = ["0-3 days", "4-7 days", "8-14 days", "15-30 days", "30+ days"]
            bucketed = pd.cut(lt, bins=bins, labels=labels, right=True)
            counts = bucketed.value_counts().reindex(labels, fill_value=0)
            total = counts.sum()
            for label in labels:
                c = int(counts.get(label, 0))
                bw_dist.append({
                    "category": label,
                    "count": c,
                    "pct": round(c / total * 100, 1) if total > 0 else 0,
                })

    tt_dist = []
    if "destination_id" in metrics_df.columns:
        n_dest = metrics_df["destination_id"].nunique()
        has_high_adr = False
        if "adr" in metrics_df.columns:
            dest_adr = metrics_df.groupby("destination_id")["adr"].mean()
            has_high_adr = (dest_adr > dest_adr.quantile(0.8)).any()
        avg_los = 3.0
        if "room_nights" in metrics_df.columns and "bookings" in metrics_df.columns:
            total_b = metrics_df["bookings"].sum()
            if total_b > 0:
                avg_los = metrics_df["room_nights"].sum() / total_b
        leisure_pct = min(55, 35 + avg_los * 3)
        business_pct = max(10, 30 - avg_los * 2)
        luxury_pct = 15 if has_high_adr else 5
        family_pct = max(5, 25 - business_pct)
        group_pct = max(5, 100 - leisure_pct - business_pct - luxury_pct - family_pct)
        raw = {
            "Leisure": leisure_pct,
            "Business": business_pct,
            "Family": family_pct,
            "Group": group_pct,
            "Luxury": luxury_pct,
        }
        raw_total = sum(raw.values())
        total_bookings = int(metrics_df["bookings"].sum()) if "bookings" in metrics_df.columns else 1000
        for cat, pct_raw in raw.items():
            pct = round(pct_raw / raw_total * 100, 1)
            count = int(total_bookings * pct_raw / raw_total)
            tt_dist.append({"category": cat, "count": count, "pct": pct})

    return {
        "length_of_stay": los_dist,
        "booking_window": bw_dist,
        "traveler_type": tt_dist,
    }


def _compute_travel_flows(metrics_df: pd.DataFrame) -> dict:
    if metrics_df.empty or "travel_type" not in metrics_df.columns:
        return {"data": [], "count": 0}
    agg = metrics_df.groupby("travel_type").agg(
        bookings=("bookings", "sum"),
        search_demand=("search_demand", "sum"),
        room_nights=("room_nights", "sum"),
        avg_adr=("adr", "mean"),
    ).reset_index()
    total = agg["bookings"].sum()
    agg["share_pct"] = (agg["bookings"] / total * 100).round(1) if total > 0 else 0
    return {"data": _df_to_records(agg), "count": len(agg)}


def _compute_source_markets(metrics_df: pd.DataFrame) -> dict:
    if metrics_df.empty or "source_market" not in metrics_df.columns:
        return {"data": [], "count": 0}
    markets = sorted(metrics_df["source_market"].dropna().unique().tolist())
    return {"data": [{"id": m} for m in markets], "count": len(markets)}


# ---------------------------------------------------------------------------
# FILTERABLE ENDPOINTS — which endpoints support per-request filtering
# ---------------------------------------------------------------------------
_FILTERABLE = frozenset({
    "summary", "timeline", "analytics", "metrics",
    "kpis/hotel", "kpis/ota", "risk-index", "corridor",
    "funnel", "prepost", "timeline-by-dest", "behavior",
    "travel-flows",
})

_STATIC = frozenset({
    "crisis-events", "destinations",
    "forecast/recovery", "forecast/accuracy", "forecast/dataset",
    "health", "source-markets",
})


def compute_filtered_response(
    endpoint: str,
    date_from: str = None,
    date_to: str = None,
    destination: str = None,
    crisis_id: int = None,
    source_market: str = None,
    travel_type: str = None,
) -> bytes:
    """Compute a filtered JSON response for any endpoint.

    Fast path: if no filters, returns pre-cached bytes.
    Slow path: filters in-memory DFs and recomputes the endpoint payload.
    """
    has_filters = any(v is not None for v in (date_from, date_to, destination, crisis_id, source_market, travel_type))

    if not has_filters:
        if endpoint == "travel-demand/intelligence":
            from api.travel_demand_intel import json_travel_demand_intel

            return json_travel_demand_intel()
        if endpoint == "travel-demand-intelligence/summary":
            from api.travel_demand_intel import json_travel_demand_summary

            return json_travel_demand_summary()
        return _get_cached_bytes(endpoint)

    if endpoint in _STATIC:
        return _get_cached_bytes(endpoint)

    if endpoint == "travel-demand/intelligence":
        from api.travel_demand_intel import compute_travel_demand_filtered

        return compute_travel_demand_filtered(
            date_from=date_from,
            date_to=date_to,
            destination=destination,
            crisis_id=crisis_id,
            source_market=source_market,
            travel_type=travel_type,
        )
    if endpoint == "travel-demand-intelligence/summary":
        from api.travel_demand_intel import compute_travel_demand_summary_filtered

        return compute_travel_demand_summary_filtered(
            date_from=date_from,
            date_to=date_to,
            destination=destination,
            crisis_id=crisis_id,
            source_market=source_market,
            travel_type=travel_type,
        )

    filt = _filter_metrics(_raw_metrics, date_from, date_to, destination, source_market, travel_type)
    crisis_start = _get_crisis_start(_raw_crisis, crisis_id)

    if endpoint == "summary":
        return _to_bytes(_compute_summary(filt, _raw_last_updated))

    if endpoint == "timeline":
        return _to_bytes(_compute_timeline(filt))

    if endpoint == "analytics":
        ad = _compute_analytics(filt, crisis_start)
        return _to_bytes(_analytics_to_payload(ad))

    if endpoint == "metrics":
        return _to_bytes(_compute_metrics_payload(filt))

    if endpoint == "kpis/hotel":
        return _to_bytes(_compute_kpis_hotel(filt))

    if endpoint == "kpis/ota":
        return _to_bytes(_compute_kpis_ota(filt))

    if endpoint == "risk-index":
        ad = _compute_analytics(filt, crisis_start)
        return _to_bytes(_compute_risk_index(ad))

    if endpoint == "corridor":
        return _to_bytes(_compute_corridor(filt, crisis_start))

    if endpoint == "funnel":
        return _to_bytes(_compute_funnel(filt))

    if endpoint == "prepost":
        return _to_bytes(_compute_prepost(filt, crisis_start))

    if endpoint == "timeline-by-dest":
        return _to_bytes(_compute_timeline_by_dest(filt))

    if endpoint == "behavior":
        return _to_bytes(_compute_behavior(filt))

    if endpoint == "travel-flows":
        return _to_bytes(_compute_travel_flows(filt))

    return _get_cached_bytes(endpoint)


def _get_cached_bytes(endpoint: str) -> bytes:
    """Map an endpoint key to its pre-cached bytes."""
    mapping = {
        "health": _json_health,
        "summary": _json_summary,
        "crisis-events": _json_crisis,
        "timeline": _json_timeline,
        "analytics": _json_analytics,
        "metrics": _json_metrics,
        "destinations": _json_destinations,
        "forecast/recovery": _json_forecast_recovery,
        "forecast/accuracy": _json_forecast_accuracy,
        "forecast/dataset": _json_forecast_dataset,
        "kpis/hotel": _json_kpis_hotel,
        "kpis/ota": _json_kpis_ota,
        "risk-index": _json_risk_index,
        "corridor": _json_corridor,
        "funnel": _json_funnel,
        "prepost": _json_prepost,
        "timeline-by-dest": _json_timeline_by_dest,
        "behavior": _json_behavior,
        "travel-flows": _json_travel_flows,
        "source-markets": _json_source_markets,
    }
    return mapping.get(endpoint, b'{"detail":"unknown endpoint"}')


# ---------------------------------------------------------------------------
# refresh_cache — loads data and pre-serializes "no filter" responses
# ---------------------------------------------------------------------------

def refresh_cache() -> None:
    """Load everything from DB, compute analytics, serialize to JSON bytes."""
    global _raw_metrics, _raw_crisis, _raw_destinations
    global _raw_analytics_dict, _raw_last_updated
    global _json_health, _json_summary, _json_crisis, _json_timeline
    global _json_analytics, _json_metrics, _json_destinations
    global _json_forecast_recovery, _json_forecast_accuracy
    global _json_kpis_hotel, _json_kpis_ota, _json_risk_index
    global _json_corridor, _json_funnel, _json_prepost
    global _json_forecast_dataset, _json_timeline_by_dest
    global _json_behavior
    global _json_travel_flows, _json_source_markets

    log.info("Loading database from %s ...", DB_PATH)
    metrics_df, crisis_df, destinations_df = load_db(DB_PATH)
    log.info("Loaded %d metrics, %d crisis events, %d destinations",
             len(metrics_df), len(crisis_df), len(destinations_df))

    _raw_metrics = metrics_df
    _raw_crisis = crisis_df
    _raw_destinations = destinations_df

    last_updated = None
    if DB_PATH.exists():
        last_updated = datetime.fromtimestamp(DB_PATH.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
    _raw_last_updated = last_updated

    # --- HEALTH ---
    _json_health = _to_bytes({
        "status": "ok",
        "metrics_rows": len(metrics_df),
        "crisis_events": len(crisis_df),
    })

    # --- SUMMARY ---
    _json_summary = _to_bytes(_compute_summary(metrics_df, last_updated))

    # --- CRISIS EVENTS ---
    if crisis_df.empty:
        _json_crisis = _to_bytes({"data": [], "count": 0})
    else:
        cr = crisis_df.copy()
        if "crisis_start_date" in cr.columns:
            cr["crisis_start_date"] = pd.to_datetime(cr["crisis_start_date"]).dt.strftime("%Y-%m-%d")
        _json_crisis = _to_bytes({"data": _df_to_records(cr), "count": len(cr)})

    # --- TIMELINE ---
    _json_timeline = _to_bytes(_compute_timeline(metrics_df))

    # --- ANALYTICS ---
    crisis_start = _get_crisis_start(crisis_df)
    analytics_dict = _compute_analytics(metrics_df, crisis_start)
    _raw_analytics_dict = analytics_dict
    _json_analytics = _to_bytes(_analytics_to_payload(analytics_dict))

    # --- METRICS ---
    _json_metrics = _to_bytes(_compute_metrics_payload(metrics_df))

    # --- DESTINATIONS ---
    if destinations_df.empty:
        _json_destinations = _to_bytes({"data": [], "count": 0})
    else:
        _json_destinations = _to_bytes({"data": _df_to_records(destinations_df), "count": len(destinations_df)})

    # --- FORECASTS ---
    forecast_dir = PROJECT_ROOT / "data" / "forecasts"
    forecast_data = load_forecast_data(forecast_dir)
    rec = forecast_data.get("recovery")
    _json_forecast_recovery = _to_bytes(
        {"data": _df_to_records(rec), "count": len(rec)} if rec is not None and not rec.empty
        else {"data": [], "count": 0}
    )
    acc = forecast_data.get("accuracy")
    _json_forecast_accuracy = _to_bytes(
        {"data": _df_to_records(acc), "count": len(acc)} if acc is not None and not acc.empty
        else {"data": [], "count": 0}
    )

    # --- HOTEL CHAIN KPIs ---
    _json_kpis_hotel = _to_bytes(_compute_kpis_hotel(metrics_df))

    # --- OTA KPIs ---
    _json_kpis_ota = _to_bytes(_compute_kpis_ota(metrics_df))

    # --- TRAVEL RISK INDEX (with risk_level field) ---
    _json_risk_index = _to_bytes(_compute_risk_index(analytics_dict))

    # --- CORRIDOR ---
    _json_corridor = _to_bytes(_compute_corridor(metrics_df, crisis_start))

    # --- FUNNEL (4 stages) ---
    _json_funnel = _to_bytes(_compute_funnel(metrics_df))

    # --- PRE/POST ---
    _json_prepost = _to_bytes(_compute_prepost(metrics_df, crisis_start))

    # --- FORECAST DATASET ---
    try:
        forecast_csv = PROJECT_ROOT / "data" / "forecasts" / "forecast_dataset.csv"
        if forecast_csv.exists():
            fdf = pd.read_csv(forecast_csv)
            _json_forecast_dataset = _to_bytes({"data": _df_to_records(fdf), "count": len(fdf)})
        else:
            _json_forecast_dataset = _to_bytes({"data": [], "count": 0})
    except Exception:
        log.exception("forecast_dataset failed.")
        _json_forecast_dataset = _to_bytes({"data": [], "count": 0})

    # --- TIMELINE BY DESTINATION ---
    _json_timeline_by_dest = _to_bytes(_compute_timeline_by_dest(metrics_df))

    # --- BEHAVIOR ---
    _json_behavior = _to_bytes(_compute_behavior(metrics_df))

    # --- TRAVEL FLOWS ---
    _json_travel_flows = _to_bytes(_compute_travel_flows(metrics_df))

    # --- SOURCE MARKETS ---
    _json_source_markets = _to_bytes(_compute_source_markets(metrics_df))

    all_cached = [
        _json_health, _json_summary, _json_crisis, _json_timeline,
        _json_analytics, _json_metrics, _json_destinations,
        _json_forecast_recovery, _json_forecast_accuracy,
        _json_kpis_hotel, _json_kpis_ota, _json_risk_index,
        _json_corridor, _json_funnel, _json_prepost,
        _json_forecast_dataset, _json_timeline_by_dest, _json_behavior,
        _json_travel_flows, _json_source_markets,
    ]
    log.info("Cache ready. All JSON pre-serialized (%d bytes total).",
             sum(len(b) for b in all_cached))


# ---------------------------------------------------------------------------
# Accessors — return raw pre-serialized bytes (fast path, no filters)
# ---------------------------------------------------------------------------
def json_health() -> bytes: return _json_health
def json_summary() -> bytes: return _json_summary
def json_crisis() -> bytes: return _json_crisis
def json_timeline() -> bytes: return _json_timeline
def json_analytics() -> bytes: return _json_analytics
def json_metrics() -> bytes: return _json_metrics
def json_destinations() -> bytes: return _json_destinations
def json_forecast_recovery() -> bytes: return _json_forecast_recovery
def json_forecast_accuracy() -> bytes: return _json_forecast_accuracy
def json_kpis_hotel() -> bytes: return _json_kpis_hotel
def json_kpis_ota() -> bytes: return _json_kpis_ota
def json_risk_index() -> bytes: return _json_risk_index
def json_corridor() -> bytes: return _json_corridor
def json_funnel() -> bytes: return _json_funnel
def json_prepost() -> bytes: return _json_prepost
def json_forecast_dataset() -> bytes: return _json_forecast_dataset
def json_timeline_by_dest() -> bytes: return _json_timeline_by_dest
def json_behavior() -> bytes: return _json_behavior
def json_travel_flows() -> bytes: return _json_travel_flows
def json_source_markets() -> bytes: return _json_source_markets
