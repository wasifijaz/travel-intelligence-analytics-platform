"""
Travel Demand Intelligence — analytical layer (Flights + Visas + existing metrics).
Measure semantics mirror DAX-style definitions; isolated from existing cache.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
import os
from urllib.parse import urlparse, parse_qs, unquote

import numpy as np
import pandas as pd

from config.settings import DB_PATH, DB_URL

log = logging.getLogger(__name__)

_json_travel_demand: bytes = b"{}"
_json_travel_demand_summary: bytes = b'{"summary":""}'


def _is_postgres() -> bool:
    return bool(DB_URL or os.getenv("DATABASE_URL"))


def _pg_connect():
    import psycopg2

    db_url = DB_URL or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL not set")
    parsed = urlparse(db_url)
    if parsed.scheme.startswith("postgres"):
        qs = parse_qs(parsed.query or "")
        sslmode = (qs.get("sslmode", ["require"])[0]) or "require"
        return psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            user=unquote(parsed.username or ""),
            password=unquote(parsed.password or ""),
            dbname=(parsed.path or "/postgres").lstrip("/"),
            sslmode=sslmode,
        )
    return psycopg2.connect(db_url)


def _query_df(sql: str, params: list[Any] | None = None) -> pd.DataFrame:
    params = params or []
    if _is_postgres():
        try:
            conn = _pg_connect()
            q = sql.replace("?", "%s")
            out = pd.read_sql_query(q, conn, params=params)
            conn.close()
            return out
        except Exception:
            return pd.DataFrame()
    try:
        import duckdb

        conn = duckdb.connect(str(DB_PATH), read_only=True)
        out = conn.execute(sql, params).fetchdf()
        conn.close()
        return out
    except Exception:
        return pd.DataFrame()


def _safe_div(num: float | None, den: float | None) -> float | None:
    if den is None or den == 0 or num is None:
        return None
    return float(num) / float(den)


def _parse_date(s: str | None) -> pd.Timestamp | None:
    if not s:
        return None
    try:
        return pd.to_datetime(s)
    except Exception:
        return None


def _fmt_pct(v: float | None) -> str:
    if v is None:
        return "0.0%"
    return f"{v * 100:.1f}%"


def _trend_word(v: float | None) -> str:
    if v is None:
        return "stable"
    if v > 0.02:
        return "rising"
    if v < -0.02:
        return "declining"
    return "stable"


def _compose_executive_summary(
    measures: dict[str, Any],
    date_from: str | None,
    date_to: str | None,
    destination: str | None,
    source_market: str | None,
    travel_type: str | None,
    crisis_id: int | None,
) -> str:
    fg = measures.get("flights_growth")
    vg = measures.get("visa_growth")
    bg = measures.get("bookings_growth")
    elastic = measures.get("flights_vs_bookings_elasticity")
    vtb = measures.get("visa_to_booking_pct")
    lag = measures.get("booking_lag_from_visa_days")
    room_nights = float(measures.get("room_nights") or 0.0)
    bookings = float(measures.get("total_bookings") or 0.0)
    visas = float(measures.get("visa_issued") or 0.0)
    flights = float(measures.get("flights_total") or 0.0)
    approval = measures.get("visa_approval_rate_pct")
    scope_bits = []
    if destination:
        scope_bits.append(f"destination {destination}")
    if source_market:
        scope_bits.append(f"origin {source_market}")
    if travel_type:
        scope_bits.append(f"{travel_type} travel")
    scope_txt = ", ".join(scope_bits) if scope_bits else "the selected market scope"
    window_txt = f"{date_from} to {date_to}" if date_from and date_to else "the active filter window"
    crisis_txt = (
        f"Crisis event {crisis_id} is in scope, and market behavior is being tracked from its effective window."
        if crisis_id is not None
        else "No specific crisis event filter is applied, so the narrative reflects baseline and cyclical demand patterns."
    )
    opp = (
        "Opportunity: strengthen yield and inventory planning in corridors where visas and flights are both rising."
        if (_trend_word(vg) == "rising" and _trend_word(fg) == "rising")
        else "Opportunity: accelerate conversion programs in markets where intent is visible but bookings are not yet scaling."
    )
    risk = (
        "Risk: booking momentum is lagging upstream demand signals, increasing short-term forecasting volatility."
        if (_trend_word(vg) == "rising" and _trend_word(bg) != "rising")
        else "Risk: weakening visa or flight momentum may pressure occupancy and ADR if not offset by demand activation."
    )
    elasticity_txt = (
        f"Elasticity is {elastic:.2f}, indicating booking sensitivity to supply shifts."
        if elastic is not None
        else "Elasticity is currently unstable in this slice; continue monitoring as additional periods accumulate."
    )
    return "\n\n".join(
        [
            f"In {scope_txt} over {window_txt}, bookings are {bookings:,.0f} with {room_nights:,.0f} room nights, while flights are {flights:,.0f} and visas issued are {visas:,.0f}.",
            f"Demand signals are mixed: flights are {_trend_word(fg)} ({_fmt_pct(fg)}), visas are {_trend_word(vg)} ({_fmt_pct(vg)}), and bookings are {_trend_word(bg)} ({_fmt_pct(bg)}). Visa approval is {approval:.1f}% and visa-to-booking conversion is {vtb:.1f}%." if approval is not None and vtb is not None else f"Demand signals are mixed: flights are {_trend_word(fg)} ({_fmt_pct(fg)}), visas are {_trend_word(vg)} ({_fmt_pct(vg)}), and bookings are {_trend_word(bg)} ({_fmt_pct(bg)}).",
            f"{crisis_txt} Lead/lag timing indicates a booking lag of {lag if lag is not None else 0} days versus visa issuance.",
            f"{elasticity_txt} {opp} {risk}",
        ]
    )


def _filter_fact_df(
    df: pd.DataFrame,
    date_from: str | None,
    date_to: str | None,
    destination: str | None,
    origin_country: str | None,
    travel_type: str | None,
) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"])
    if date_from:
        out = out[out["date"] >= pd.to_datetime(date_from)]
    if date_to:
        out = out[out["date"] <= pd.to_datetime(date_to)]
    if destination and "destination_id" in out.columns:
        out = out[out["destination_id"] == destination]
    if origin_country and "origin_country" in out.columns:
        out = out[out["origin_country"] == origin_country]
    if travel_type and "origin_country" in out.columns and "destination_id" in out.columns:
        if travel_type.lower() == "domestic":
            out = out[out["origin_country"] == out["destination_id"]]
        elif travel_type.lower() == "international":
            out = out[out["origin_country"] != out["destination_id"]]
    return out


def _metrics_totals(
    date_from: str | None,
    date_to: str | None,
    destination: str | None,
    source_market: str | None,
    travel_type: str | None,
    crisis_id: int | None = None,
) -> tuple[float, float]:
    """Total bookings and search_demand from daily_metrics (same grain as platform)."""
    try:
        q = """
            SELECT COALESCE(SUM(bookings), 0) AS b, COALESCE(SUM(search_demand), 0) AS s
            FROM daily_metrics WHERE 1=1
        """
        params: list[Any] = []
        if date_from:
            q += " AND date >= ?"
            params.append(date_from)
        if date_to:
            q += " AND date <= ?"
            params.append(date_to)
        if destination:
            q += " AND destination_id = ?"
            params.append(destination)
        if source_market:
            q += " AND source_market = ?"
            params.append(source_market)
        if travel_type:
            q += " AND travel_type = ?"
            params.append(travel_type)
        crisis_filter_available = False
        if crisis_id is not None:
            chk = _query_df(
                "SELECT 1 FROM daily_metrics WHERE crisis_id = ? LIMIT 1",
                [crisis_id],
            )
            crisis_filter_available = not chk.empty
        if crisis_id is not None and crisis_filter_available:
            q += " AND crisis_id = ?"
            params.append(crisis_id)
        rowdf = _query_df(q, params)
        if not rowdf.empty:
            return float(rowdf.iloc[0]["b"] or 0), float(rowdf.iloc[0]["s"] or 0)
    except Exception:
        log.exception("metrics totals")
    return 0.0, 0.0


def _get_crisis_window(crisis_id: int | None) -> tuple[str | None, str | None]:
    """Return crisis start/end dates from crisis_events for contextual fact filtering."""
    if crisis_id is None:
        return None, None
    try:
        rowdf = _query_df(
            """
            SELECT crisis_start_date, crisis_end_date
            FROM crisis_events
            WHERE crisis_id = ?
            LIMIT 1
            """,
            [crisis_id],
        )
        if rowdf.empty:
            return None, None
        row = rowdf.iloc[0]
        start = pd.to_datetime(row[0]).strftime("%Y-%m-%d") if row[0] is not None else None
        end = pd.to_datetime(row[1]).strftime("%Y-%m-%d") if row[1] is not None else None
        return start, end
    except Exception:
        return None, None


def _load_facts() -> tuple[pd.DataFrame, pd.DataFrame]:
    try:
        ff = _query_df(
            "SELECT date, origin_country, destination_id, route, flights_count, "
            "seat_capacity, load_factor, avg_airfare, airline FROM fact_flights"
        )
        fv = _query_df(
            "SELECT date, origin_country, destination_id, visa_applications, visa_issued, "
            "visa_rejected, visa_type, processing_days FROM fact_visas"
        )
        return ff, fv
    except Exception:
        return pd.DataFrame(), pd.DataFrame()


def _load_bookings_daily(
    date_from: str | None,
    date_to: str | None,
    destination: str | None,
    source_market: str | None,
    travel_type: str | None,
    crisis_id: int | None,
) -> pd.DataFrame:
    """Daily bookings/room_nights from daily_metrics in current filter context."""
    try:
        q = """
            SELECT date::DATE AS date,
                   COALESCE(SUM(bookings), 0) AS bookings,
                   COALESCE(SUM(room_nights), 0) AS room_nights
            FROM daily_metrics
            WHERE 1=1
        """
        params: list[Any] = []
        if date_from:
            q += " AND date >= ?"
            params.append(date_from)
        if date_to:
            q += " AND date <= ?"
            params.append(date_to)
        if destination:
            q += " AND destination_id = ?"
            params.append(destination)
        if source_market:
            q += " AND source_market = ?"
            params.append(source_market)
        if travel_type:
            q += " AND travel_type = ?"
            params.append(travel_type)
        crisis_filter_available = False
        if crisis_id is not None:
            chk = _query_df(
                "SELECT 1 FROM daily_metrics WHERE crisis_id = ? LIMIT 1",
                [crisis_id],
            )
            crisis_filter_available = not chk.empty
        if crisis_id is not None and crisis_filter_available:
            q += " AND crisis_id = ?"
            params.append(crisis_id)
        q += " GROUP BY 1 ORDER BY 1"
        out = _query_df(q, params)
        if out.empty:
            return pd.DataFrame(columns=["date", "bookings", "room_nights"])
        out["date"] = pd.to_datetime(out["date"])
        return out
    except Exception:
        log.exception("load bookings daily")
        return pd.DataFrame(columns=["date", "bookings", "room_nights"])


def _sum_flights(df: pd.DataFrame) -> dict[str, float]:
    if df.empty:
        return {"flights_total": 0.0, "seat_capacity": 0.0, "passengers": 0.0, "airfare_index": 0.0}
    fc = float(df["flights_count"].sum())
    sc = float(df["seat_capacity"].sum())
    passengers = float((df["seat_capacity"] * df["load_factor"]).sum())
    af = float(df["avg_airfare"].mean()) if "avg_airfare" in df.columns else 0.0
    return {"flights_total": fc, "seat_capacity": sc, "passengers": passengers, "airfare_index": af}


def _sum_visas(df: pd.DataFrame) -> dict[str, float]:
    if df.empty:
        return {"visa_applications": 0.0, "visa_issued": 0.0, "visa_rejected": 0.0}
    return {
        "visa_applications": float(df["visa_applications"].sum()),
        "visa_issued": float(df["visa_issued"].sum()),
        "visa_rejected": float(df["visa_rejected"].sum()),
    }


def _shift_window(
    date_from: pd.Timestamp | None,
    date_to: pd.Timestamp | None,
    days_shift: int,
) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
    if date_from is None or date_to is None:
        return None, None
    return date_from + pd.Timedelta(days=days_shift), date_to + pd.Timedelta(days=days_shift)


def _parallel_prev_window(
    date_from: pd.Timestamp | None,
    date_to: pd.Timestamp | None,
) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
    if date_from is None or date_to is None:
        return None, None
    span = (date_to - date_from).days + 1
    if span <= 0:
        return None, None
    prev_end = date_from - pd.Timedelta(days=1)
    prev_start = prev_end - pd.Timedelta(days=span - 1)
    return prev_start, prev_end


def build_travel_demand_payload(
    date_from: str | None = None,
    date_to: str | None = None,
    destination: str | None = None,
    source_market: str | None = None,
    travel_type: str | None = None,
    crisis_id: int | None = None,
) -> dict[str, Any]:
    crisis_start, crisis_end = _get_crisis_window(crisis_id)
    effective_date_from = date_from or crisis_start
    effective_date_to = date_to or crisis_end
    log.info(
        "travel-demand filters date_from=%s date_to=%s destination=%s crisis_id=%s source_market=%s travel_type=%s",
        effective_date_from,
        effective_date_to,
        destination,
        crisis_id,
        source_market,
        travel_type,
    )

    ff_raw, fv_raw = _load_facts()
    bookings_daily = _load_bookings_daily(
        effective_date_from, effective_date_to, destination, source_market, travel_type, crisis_id
    )
    d1 = _parse_date(effective_date_from)
    d2 = _parse_date(effective_date_to)

    ff = _filter_fact_df(
        ff_raw, effective_date_from, effective_date_to, destination, source_market, travel_type
    )
    fv = _filter_fact_df(
        fv_raw, effective_date_from, effective_date_to, destination, source_market, travel_type
    )
    log.info(
        "travel-demand row-counts flights=%s visas=%s bookings_daily=%s",
        len(ff),
        len(fv),
        len(bookings_daily),
    )

    f_cur = _sum_flights(ff)
    v_cur = _sum_visas(fv)
    total_bookings, total_searches = _metrics_totals(
        effective_date_from, effective_date_to, destination, source_market, travel_type, crisis_id
    )

    passengers = f_cur["passengers"]
    seat_cap = f_cur["seat_capacity"]
    load_factor_pct = _safe_div(passengers, seat_cap)
    if load_factor_pct is not None:
        load_factor_pct *= 100.0

    va = v_cur["visa_applications"]
    vi = v_cur["visa_issued"]
    vr = v_cur["visa_rejected"]

    visa_approval_rate = _safe_div(vi, va)
    visa_approval_rate_pct = visa_approval_rate * 100 if visa_approval_rate is not None else None
    visa_rejection_rate_pct = (1.0 - visa_approval_rate) * 100 if visa_approval_rate is not None else None

    visa_to_booking_pct = _safe_div(total_bookings, vi)
    search_to_visa_pct = _safe_div(va, total_searches)
    if visa_to_booking_pct is not None:
        visa_to_booking_pct *= 100.0
    if search_to_visa_pct is not None:
        search_to_visa_pct *= 100.0

    capacity_vs_demand_gap = seat_cap - total_bookings

    # Lead windows (shift filter back)
    if d1 is not None and d2 is not None:
        lf1, lf2 = _shift_window(d1, d2, -30)
        lf60_1, lf60_2 = _shift_window(d1, d2, -60)
        vf1, vf2 = _shift_window(d1, d2, -15)
        vf30_1, vf30_2 = _shift_window(d1, d2, -30)
        s_lf = (
            _sum_flights(
                _filter_fact_df(
                    ff_raw,
                    lf1.strftime("%Y-%m-%d") if lf1 is not None else None,
                    lf2.strftime("%Y-%m-%d") if lf2 is not None else None,
                    destination,
                    source_market,
                    travel_type,
                )
            )["flights_total"]
            if lf1 is not None and lf2 is not None
            else 0.0
        )
        s_vl = (
            _sum_visas(
                _filter_fact_df(
                    fv_raw,
                    vf1.strftime("%Y-%m-%d") if vf1 is not None else None,
                    vf2.strftime("%Y-%m-%d") if vf2 is not None else None,
                    destination,
                    source_market,
                    travel_type,
                )
            )["visa_issued"]
            if vf1 is not None and vf2 is not None
            else 0.0
        )
        s_lf60 = (
            _sum_flights(
                _filter_fact_df(
                    ff_raw,
                    lf60_1.strftime("%Y-%m-%d") if lf60_1 is not None else None,
                    lf60_2.strftime("%Y-%m-%d") if lf60_2 is not None else None,
                    destination,
                    source_market,
                    travel_type,
                )
            )["flights_total"]
            if lf60_1 is not None and lf60_2 is not None
            else 0.0
        )
        s_vl30 = (
            _sum_visas(
                _filter_fact_df(
                    fv_raw,
                    vf30_1.strftime("%Y-%m-%d") if vf30_1 is not None else None,
                    vf30_2.strftime("%Y-%m-%d") if vf30_2 is not None else None,
                    destination,
                    source_market,
                    travel_type,
                )
            )["visa_issued"]
            if vf30_1 is not None and vf30_2 is not None
            else 0.0
        )
    else:
        s_lf = 0.0
        s_vl = 0.0
        s_lf60 = 0.0
        s_vl30 = 0.0

    # Prev period for growth
    if d1 is not None and d2 is not None:
        p0, p1 = _parallel_prev_window(d1, d2)
        pf = _sum_flights(
            _filter_fact_df(
                ff_raw,
                p0.strftime("%Y-%m-%d") if p0 is not None else None,
                p1.strftime("%Y-%m-%d") if p1 is not None else None,
                destination,
                source_market,
                travel_type,
            )
        )["flights_total"]
        pv = _sum_visas(
            _filter_fact_df(
                fv_raw,
                p0.strftime("%Y-%m-%d") if p0 is not None else None,
                p1.strftime("%Y-%m-%d") if p1 is not None else None,
                destination,
                source_market,
                travel_type,
            )
        )["visa_issued"]
        pb, _ = _metrics_totals(
            p0.strftime("%Y-%m-%d") if p0 is not None else None,
            p1.strftime("%Y-%m-%d") if p1 is not None else None,
            destination,
            source_market,
            travel_type,
            crisis_id,
        )
    else:
        pf = pv = pb = 0.0

    ft = f_cur["flights_total"]
    fg = _safe_div(ft - pf, pf) if pf else None
    vg = _safe_div(vi - pv, pv) if pv else None
    bg = _safe_div(total_bookings - pb, pb) if pb else None
    elasticity = _safe_div(bg, fg) if (bg is not None and fg is not None) else None
    if fg is not None and vg is not None and bg is not None:
        market_health_index = (fg + vg + bg) / 3.0
    else:
        parts = [x for x in (fg, vg, bg) if x is not None]
        market_health_index = float(np.mean(parts)) if parts else None

    # Funnel: Searches → Visas → Flights (ops proxy) → Bookings → Stay (room nights proxy)
    room_nights_est = total_bookings * 2.8
    funnel = [
        {"stage": "Searches", "value": int(total_searches)},
        {"stage": "Visa applications", "value": int(va)},
        {"stage": "Flights (count)", "value": int(ft)},
        {"stage": "Bookings", "value": int(total_bookings)},
        {"stage": "Stay (room nights est.)", "value": int(room_nights_est)},
    ]

    # By route / origin
    flights_by_route = []
    if not ff.empty and "route" in ff.columns:
        g = ff.groupby("route", as_index=False)["flights_count"].sum()
        g = g.sort_values("flights_count", ascending=False).head(15)
        flights_by_route = [
            {"route": r["route"], "flights_count": int(r["flights_count"])}
            for _, r in g.iterrows()
        ]
    visas_by_origin = []
    if not fv.empty and "origin_country" in fv.columns:
        g = fv.groupby("origin_country", as_index=False)["visa_applications"].sum()
        g = g.sort_values("visa_applications", ascending=False).head(15)
        visas_by_origin = [
            {"origin_country": r["origin_country"], "visa_applications": int(r["visa_applications"])}
            for _, r in g.iterrows()
        ]

    # Trends: monthly load factor & seat vs bookings
    load_factor_trend = []
    seat_vs_bookings = []
    if not ff.empty:
        ff_m = ff.copy()
        ff_m["month"] = pd.to_datetime(ff_m["date"]).dt.to_period("M").dt.to_timestamp()
        for month, part in ff_m.groupby("month"):
            sc_m = float(part["seat_capacity"].sum())
            pax_m = float((part["seat_capacity"] * part["load_factor"]).sum())
            lf_m = _safe_div(pax_m, sc_m)
            load_factor_trend.append({
                "date": month.strftime("%Y-%m-%d"),
                "load_factor_pct": round(lf_m * 100, 2) if lf_m is not None else 0.0,
            })
        load_factor_trend = sorted(load_factor_trend, key=lambda x: x["date"])[-24:]

    if d1 is not None and d2 is not None:
        m_b, _ = _metrics_totals(
            effective_date_from, effective_date_to, destination, source_market, travel_type, crisis_id
        )
        seat_vs_bookings.append({
            "label": "Seat capacity",
            "value": round(seat_cap, 0),
        })
        seat_vs_bookings.append({
            "label": "Bookings",
            "value": round(m_b, 0),
        })

    # Visa intelligence windows
    if d1 is not None and d2 is not None:
        w0, w1 = _shift_window(d1, d2, -7)
        y0, y1 = _shift_window(d1, d2, -365)
        visa_prev_week = (
            _sum_visas(
                _filter_fact_df(
                    fv_raw,
                    w0.strftime("%Y-%m-%d") if w0 is not None else None,
                    w1.strftime("%Y-%m-%d") if w1 is not None else None,
                    destination,
                    source_market,
                    travel_type,
                )
            )["visa_issued"]
            if w0 is not None and w1 is not None
            else 0.0
        )
        visa_issued_ly = (
            _sum_visas(
                _filter_fact_df(
                    fv_raw,
                    y0.strftime("%Y-%m-%d") if y0 is not None else None,
                    y1.strftime("%Y-%m-%d") if y1 is not None else None,
                    destination,
                    source_market,
                    travel_type,
                )
            )["visa_issued"]
            if y0 is not None and y1 is not None
            else 0.0
        )
    else:
        visa_prev_week = 0.0
        visa_issued_ly = 0.0
    visa_growth_wow = _safe_div(vi - visa_prev_week, visa_prev_week) if visa_prev_week else None
    visa_growth_yoy = _safe_div(vi - visa_issued_ly, visa_issued_ly) if visa_issued_ly else None
    processing_time = float(fv["processing_days"].mean()) if (not fv.empty and "processing_days" in fv.columns) else 0.0
    policy_impact_index = _safe_div(vi - pv, pv) if pv else None

    # Shock propagation trend (monthly indexed, baseline = first 3 months avg)
    shock_trend: list[dict[str, Any]] = []
    if (not ff.empty) or (not fv.empty) or (not bookings_daily.empty):
        frames: list[pd.DataFrame] = []
        if not ff.empty:
            f_m = ff.copy()
            f_m["month"] = pd.to_datetime(f_m["date"]).dt.to_period("M").dt.to_timestamp()
            frames.append(
                f_m.groupby("month", as_index=False)["flights_count"]
                .sum()
                .rename(columns={"flights_count": "flights_total"})
            )
        if not fv.empty:
            v_m = fv.copy()
            v_m["month"] = pd.to_datetime(v_m["date"]).dt.to_period("M").dt.to_timestamp()
            frames.append(
                v_m.groupby("month", as_index=False)["visa_issued"]
                .sum()
                .rename(columns={"visa_issued": "visa_issued"})
            )
        if not bookings_daily.empty:
            b_m = bookings_daily.copy()
            b_m["month"] = pd.to_datetime(b_m["date"]).dt.to_period("M").dt.to_timestamp()
            frames.append(
                b_m.groupby("month", as_index=False)["bookings"]
                .sum()
                .rename(columns={"bookings": "total_bookings"})
            )
        if frames:
            merged = frames[0]
            for x in frames[1:]:
                merged = merged.merge(x, on="month", how="outer")
            merged = merged.sort_values("month").fillna(0.0)
            for c in ("flights_total", "visa_issued", "total_bookings"):
                if c not in merged.columns:
                    merged[c] = 0.0
            base_n = min(3, len(merged))
            fb = float(merged["flights_total"].head(base_n).mean()) if base_n else 0.0
            vb = float(merged["visa_issued"].head(base_n).mean()) if base_n else 0.0
            bb = float(merged["total_bookings"].head(base_n).mean()) if base_n else 0.0
            for _, r in merged.tail(24).iterrows():
                shock_trend.append({
                    "date": pd.Timestamp(r["month"]).strftime("%Y-%m-%d"),
                    "visa_shock": _safe_div(float(r["visa_issued"]), vb) or 0.0,
                    "flight_shock": _safe_div(float(r["flights_total"]), fb) or 0.0,
                    "booking_shock": _safe_div(float(r["total_bookings"]), bb) or 0.0,
                })
    visa_baseline = float(np.mean([x["visa_shock"] for x in shock_trend])) if shock_trend else 0.0
    flight_baseline = float(np.mean([x["flight_shock"] for x in shock_trend])) if shock_trend else 0.0
    booking_baseline = float(np.mean([x["booking_shock"] for x in shock_trend])) if shock_trend else 0.0

    avg_visa_date = pd.to_datetime(fv["date"]).mean() if not fv.empty else pd.NaT
    avg_booking_date = pd.to_datetime(bookings_daily["date"]).mean() if not bookings_daily.empty else pd.NaT
    booking_lag_from_visa = (
        int((avg_booking_date - avg_visa_date).days)
        if (not pd.isna(avg_visa_date) and not pd.isna(avg_booking_date))
        else None
    )
    visa_to_arrival_lag = booking_lag_from_visa

    lead_insight = (
        f"Flight capacity trend is {_trend_word(fg)} ({_fmt_pct(fg)}), with lead volumes at {int(s_lf):,} (30D) and {int(s_lf60):,} (60D). "
        f"Visa lead signals are {int(s_vl):,} (15D) and {int(s_vl30):,} (30D), pointing to {'stronger' if (s_vl + s_vl30) > 0 else 'weaker'} near-term demand intent."
    )
    visa_insight = (
        f"Visa approvals are {round(visa_approval_rate_pct or 0, 1)}% with {round(processing_time, 1)} days processing time; "
        f"WoW visa growth is {round((visa_growth_wow or 0) * 100, 1)}%."
    )
    elasticity_insight = (
        f"Elasticity is {round(elasticity, 2)}; bookings are {'highly' if abs(elasticity) >= 1 else 'moderately'} "
        f"sensitive to flight supply changes."
        if elasticity is not None
        else "Elasticity is not yet stable for this filter window."
    )

    if (fg or 0) > 0 and (vg or 0) > 0 and (bg or 0) >= 0:
        state_line = "Market momentum is constructive: flight supply and visa intent are expanding, and conversion is improving."
    elif (vg or 0) < 0 and (bg or 0) < 0:
        state_line = "An early slowdown signal is visible: visa issuance and bookings are both softening in the selected scope."
    elif (fg or 0) > 0 and abs(bg or 0) < 0.02:
        state_line = "A supply-demand divergence is emerging: capacity is rising while bookings are effectively flat."
    else:
        state_line = "Signal quality is mixed: upstream intent and downstream conversion are moving at different speeds."

    crisis_impact_line = (
        f"Crisis event {crisis_id} is active in this context; volatility should be expected around booking conversion and lead-time behavior."
        if crisis_id is not None
        else "No crisis-specific constraint is applied; trends represent broader market dynamics."
    )
    expectation_line = (
        f"Short term, bookings are {_trend_word(bg)} ({_fmt_pct(bg)}) while visa approvals run at {round(visa_approval_rate_pct or 0, 1)}%. "
        f"Medium term, 30/60-day flight leads ({int(s_lf):,}/{int(s_lf60):,}) and visa leads ({int(s_vl):,}/{int(s_vl30):,}) suggest {'potential demand acceleration' if (s_lf + s_lf60 + s_vl + s_vl30) > 0 else 'continued caution'}."
    )
    opportunity_line = (
        "Leadership action: optimize pricing and inventory on corridors where intent is rising, and use targeted demand stimulation where booking lag persists."
    )
    pulse = "\n\n".join([state_line, crisis_impact_line, expectation_line, opportunity_line])

    actions = [
        "Increase pricing in routes where visa approvals and flights are both rising.",
        "Prioritize campaigns in origin markets with high visa issuance but low booking conversion.",
        "Prepare inventory for demand uplift signaled by 30D/60D flight lead expansion.",
        "Mitigate risk in markets with falling approvals or rising processing times.",
        "Optimize booking windows based on visa processing lag to capture delayed demand.",
    ]

    measures = {
        "flights_total": ft,
        "seat_capacity": seat_cap,
        "passengers": passengers,
        "load_factor_pct": load_factor_pct,
        "airfare_index": f_cur["airfare_index"],
        "visa_applications": va,
        "visa_issued": vi,
        "visa_rejected": vr,
        "visa_approval_rate_pct": visa_approval_rate_pct,
        "visa_rejection_rate_pct": visa_rejection_rate_pct,
        "visa_to_booking_pct": visa_to_booking_pct,
        "search_to_visa_pct": search_to_visa_pct,
        "capacity_vs_demand_gap": capacity_vs_demand_gap,
        "market_health_index": market_health_index,
        "flights_lead_30d": s_lf,
        "flights_lead_60d": s_lf60,
        "visa_lead_15d": s_vl,
        "visa_lead_30d": s_vl30,
        "flights_prev_period": pf,
        "visa_prev_period": pv,
        "bookings_prev_period": pb,
        "total_bookings": total_bookings,
        "total_searches": total_searches,
        "flights_growth": fg,
        "visa_growth": vg,
        "bookings_growth": bg,
        "room_nights": float(bookings_daily["room_nights"].sum()) if not bookings_daily.empty else 0.0,
        "booking_lag_from_visa_days": booking_lag_from_visa,
        "processing_time_days": processing_time,
        "visa_growth_wow": visa_growth_wow,
        "visa_growth_yoy": visa_growth_yoy,
        "visa_to_arrival_lag_days": visa_to_arrival_lag,
        "policy_impact_index": policy_impact_index,
        "flights_vs_bookings_elasticity": elasticity,
        "visa_shock_baseline": visa_baseline,
        "flight_shock_baseline": flight_baseline,
        "booking_shock_baseline": booking_baseline,
    }

    return {
        "measures": measures,
        "funnel": funnel,
        "flights_by_route": flights_by_route,
        "visas_by_origin": visas_by_origin,
        "load_factor_trend": load_factor_trend,
        "seat_vs_bookings": seat_vs_bookings,
        "shock_trend": shock_trend,
        "insights": {
            "global_travel_market_pulse": pulse,
            "lead_indicators_insight": lead_insight,
            "visa_intelligence_insight": visa_insight,
            "elasticity_insight": elasticity_insight,
        },
        "action_panel": actions,
    }


def json_travel_demand_intel() -> bytes:
    return _json_travel_demand


def json_travel_demand_summary() -> bytes:
    return _json_travel_demand_summary


def refresh_travel_demand_cache() -> None:
    global _json_travel_demand, _json_travel_demand_summary
    payload = build_travel_demand_payload()
    _json_travel_demand = json.dumps(
        payload,
        ensure_ascii=False,
        default=str,
    ).encode("utf-8")
    summary = _compose_executive_summary(
        payload.get("measures", {}),
        None,
        None,
        None,
        None,
        None,
        None,
    )
    _json_travel_demand_summary = json.dumps(
        {"summary": summary},
        ensure_ascii=False,
        default=str,
    ).encode("utf-8")


def compute_travel_demand_filtered(
    date_from: str | None = None,
    date_to: str | None = None,
    destination: str | None = None,
    crisis_id: int | None = None,
    source_market: str | None = None,
    travel_type: str | None = None,
) -> bytes:
    payload = build_travel_demand_payload(
        date_from=date_from,
        date_to=date_to,
        destination=destination,
        source_market=source_market,
        travel_type=travel_type,
        crisis_id=crisis_id,
    )
    return json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")


def compute_travel_demand_summary_filtered(
    date_from: str | None = None,
    date_to: str | None = None,
    destination: str | None = None,
    crisis_id: int | None = None,
    source_market: str | None = None,
    travel_type: str | None = None,
) -> bytes:
    payload = build_travel_demand_payload(
        date_from=date_from,
        date_to=date_to,
        destination=destination,
        source_market=source_market,
        travel_type=travel_type,
        crisis_id=crisis_id,
    )
    summary = _compose_executive_summary(
        payload.get("measures", {}),
        date_from,
        date_to,
        destination,
        source_market,
        travel_type,
        crisis_id,
    )
    return json.dumps({"summary": summary}, ensure_ascii=False, default=str).encode("utf-8")


refresh_travel_demand_cache()
