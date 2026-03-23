"""
Hospitality Decision KPIs
Stakeholder-specific metrics: Hotel Chains, OTAs, Travel Tech, TMCs, DMCs.
"""
import pandas as pd
import numpy as np
from typing import Optional


def compute_revpar(adr: float, occupancy_rate: float) -> float:
    """RevPAR = ADR × Occupancy Rate."""
    if pd.isna(adr) or pd.isna(occupancy_rate):
        return np.nan
    return adr * occupancy_rate


def hotel_chain_kpis(
    df: pd.DataFrame,
    date_col: str = "date",
    group_col: str = "destination_id",
) -> pd.DataFrame:
    """
    Hotel Chains: Occupancy, ADR, RevPAR, Booking pace, Cancellation rate, Market demand index.
    """
    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col])
    if "occupancy_rate" not in df.columns:
        df["occupancy_rate"] = 0.75  # default if missing
    df["revpar"] = df["adr"] * df["occupancy_rate"]
    agg = df.groupby(group_col).agg(
        occupancy_rate=("occupancy_rate", "mean"),
        adr=("adr", "mean"),
        revpar=("revpar", "mean"),
        bookings=("bookings", "sum"),
        cancellations=("cancellations", "sum"),
        total_reservations=("total_reservations", "sum"),
        search_demand=("search_demand", "sum"),
    ).reset_index()
    agg["cancellation_rate"] = np.where(
        agg["total_reservations"] > 0,
        agg["cancellations"] / agg["total_reservations"],
        0,
    )
    total_bookings = agg["bookings"].sum()
    agg["market_demand_index"] = (agg["bookings"] / total_bookings * 100) if total_bookings > 0 else 0
    return agg


def ota_kpis(
    df: pd.DataFrame,
    group_col: str = "destination_id",
) -> pd.DataFrame:
    """
    OTAs: Search demand, Conversion rate (bookings/searches), Market share, Lead time.
    """
    agg = df.groupby(group_col).agg(
        search_demand=("search_demand", "sum"),
        bookings=("bookings", "sum"),
    ).reset_index()
    agg["conversion_rate"] = np.where(
        agg["search_demand"] > 0,
        agg["bookings"] / agg["search_demand"],
        np.nan,
    )
    total_searches = agg["search_demand"].sum()
    agg["market_share_pct"] = (agg["search_demand"] / total_searches * 100) if total_searches > 0 else 0
    if "lead_time_days" in df.columns:
        lead = df.groupby(group_col)["lead_time_days"].mean().reset_index()
        lead = lead.rename(columns={"lead_time_days": "avg_lead_time_days"})
        agg = agg.merge(lead, on=group_col, how="left")
    return agg


def demand_elasticity(
    df: pd.DataFrame,
    crisis_start_date: str,
    pre_days: int = 30,
    post_days: int = 30,
    group_col: str = "destination_id",
) -> pd.DataFrame:
    """
    Demand Partners: Search-to-booking conversion change, demand elasticity.
    """
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    crisis_start = pd.to_datetime(crisis_start_date)
    pre_end = crisis_start - pd.Timedelta(days=1)
    pre_start = pre_end - pd.Timedelta(days=pre_days - 1)
    post_start = crisis_start
    post_end = crisis_start + pd.Timedelta(days=post_days - 1)
    pre_mask = (df["date"] >= pre_start) & (df["date"] <= pre_end)
    post_mask = (df["date"] >= post_start) & (df["date"] <= post_end)
    pre = df.loc[pre_mask].groupby(group_col).agg(
        pre_bookings=("bookings", "sum"),
        pre_searches=("search_demand", "sum"),
    ).reset_index()
    post = df.loc[post_mask].groupby(group_col).agg(
        post_bookings=("bookings", "sum"),
        post_searches=("search_demand", "sum"),
    ).reset_index()
    merged = pre.merge(post, on=group_col, how="outer")
    merged["pre_conversion"] = np.where(merged["pre_searches"] > 0, merged["pre_bookings"] / merged["pre_searches"], np.nan)
    merged["post_conversion"] = np.where(merged["post_searches"] > 0, merged["post_bookings"] / merged["post_searches"], np.nan)
    merged["conversion_change_pct"] = np.where(
        merged["pre_conversion"] > 0,
        (merged["post_conversion"] - merged["pre_conversion"]) / merged["pre_conversion"] * 100,
        np.nan,
    )
    return merged


def travel_risk_index(
    shock_metrics: pd.DataFrame,
    columns: list[str] = None,
) -> pd.DataFrame:
    """
    Travel Risk Heatmap: Composite risk from booking decline, cancellation spike, ADR volatility.
    """
    cols = columns or ["booking_change_pct", "cancellation_spike", "adr_change_pct"]
    cols = [c for c in cols if c in shock_metrics.columns]
    if not cols:
        return shock_metrics.copy()
    df = shock_metrics.copy()
    # booking_change_pct is a fraction (e.g. -0.73), convert to percentage for normalization
    if "booking_change_pct" in df.columns:
        change_pct = df["booking_change_pct"] * 100
        df["risk_booking"] = 1 - (change_pct.clip(-100, 100) + 100) / 200
    else:
        df["risk_booking"] = 0.5
    df["risk_cancel"] = (df["cancellation_spike"].clip(0, 1) if "cancellation_spike" in df.columns else 0)
    # adr_change_pct is also a fraction, convert to percentage
    if "adr_change_pct" in df.columns:
        adr_pct = df["adr_change_pct"] * 100
        df["risk_adr"] = (np.abs(adr_pct) / 50).clip(0, 1)
    else:
        df["risk_adr"] = 0
    df["travel_risk_index"] = (df["risk_booking"] * 0.4 + df["risk_cancel"] * 0.35 + df["risk_adr"] * 0.25)
    df["risk_tier"] = pd.cut(
        df["travel_risk_index"],
        bins=[0, 0.33, 0.66, 1.0],
        labels=["Low Risk", "Medium Risk", "High Risk"],
    )
    return df
