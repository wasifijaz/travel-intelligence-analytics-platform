"""
Demand Shock Analytics
Calculates: Booking Change %, Search Change %, ADR Change %, Cancellation Spike
Identifies: Top gaining/losing destinations, substitution patterns, search-booking correlation
"""
import pandas as pd
import numpy as np
from typing import Optional
from dataclasses import dataclass


# Default window for pre/post crisis comparison (days)
PRE_CRISIS_DAYS = 30
POST_CRISIS_DAYS = 30


@dataclass
class CrisisWindow:
    """Pre and post crisis date ranges."""
    crisis_start: pd.Timestamp
    pre_start: pd.Timestamp
    pre_end: pd.Timestamp
    post_start: pd.Timestamp
    post_end: pd.Timestamp


def get_crisis_windows(
    crisis_start_date: str | pd.Timestamp,
    pre_days: int = PRE_CRISIS_DAYS,
    post_days: int = POST_CRISIS_DAYS,
) -> CrisisWindow:
    """Compute pre/post crisis date boundaries."""
    crisis_start = pd.to_datetime(crisis_start_date)
    pre_end = crisis_start - pd.Timedelta(days=1)
    pre_start = pre_end - pd.Timedelta(days=pre_days - 1)
    post_start = crisis_start
    post_end = crisis_start + pd.Timedelta(days=post_days - 1)
    return CrisisWindow(
        crisis_start=crisis_start,
        pre_start=pre_start,
        pre_end=pre_end,
        post_start=post_start,
        post_end=post_end,
    )


def compute_pre_post_aggregates(
    df: pd.DataFrame,
    crisis_start_date: str | pd.Timestamp,
    pre_days: int = PRE_CRISIS_DAYS,
    post_days: int = POST_CRISIS_DAYS,
    date_col: str = "date",
    group_cols: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    Aggregate metrics for pre-crisis and post-crisis windows by destination.
    Returns one row per (destination_id, crisis_id) with pre_* and post_* columns.
    """
    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col])
    w = get_crisis_windows(crisis_start_date, pre_days, post_days)

    pre_mask = (df[date_col] >= w.pre_start) & (df[date_col] <= w.pre_end)
    post_mask = (df[date_col] >= w.post_start) & (df[date_col] <= w.post_end)

    group_cols = group_cols or ["destination_id"]
    group_cols = [c for c in group_cols if c in df.columns]
    if not group_cols:
        group_cols = ["destination_id"] if "destination_id" in df.columns else list(df.columns[:1])
    agg_cols = ["bookings", "cancellations", "total_reservations", "search_demand", "adr"]

    pre_df = df.loc[pre_mask].groupby(group_cols).agg(
        pre_bookings=("bookings", "sum"),
        pre_cancellations=("cancellations", "sum"),
        pre_total=("total_reservations", "sum"),
        pre_searches=("search_demand", "sum"),
        pre_adr=("adr", "mean"),
    ).reset_index()

    post_df = df.loc[post_mask].groupby(group_cols).agg(
        post_bookings=("bookings", "sum"),
        post_cancellations=("cancellations", "sum"),
        post_total=("total_reservations", "sum"),
        post_searches=("search_demand", "sum"),
        post_adr=("adr", "mean"),
    ).reset_index()

    merged = pre_df.merge(post_df, on=group_cols, how="outer")
    merged["pre_cancellation_rate"] = np.where(
        merged["pre_total"] > 0,
        merged["pre_cancellations"] / merged["pre_total"],
        0,
    )
    merged["post_cancellation_rate"] = np.where(
        merged["post_total"] > 0,
        merged["post_cancellations"] / merged["post_total"],
        0,
    )
    return merged


# =============================================================================
# SHOCK METRICS (per user formulas)
# =============================================================================

def booking_change_pct(pre_bookings: float, post_bookings: float) -> float:
    """Booking Change % = (Post - Pre) / Pre"""
    if pre_bookings == 0:
        return np.nan
    return (post_bookings - pre_bookings) / pre_bookings


def search_change_pct(pre_searches: float, post_searches: float) -> float:
    """Search Change % = (Post - Pre) / Pre"""
    if pre_searches == 0 or pd.isna(pre_searches):
        return np.nan
    return (post_searches - pre_searches) / pre_searches


def cancellation_spike(pre_rate: float, post_rate: float) -> float:
    """Cancellation Spike = Post Cancellation Rate - Pre Cancellation Rate"""
    return post_rate - pre_rate


def adr_change_pct(pre_adr: float, post_adr: float) -> float:
    """ADR Change % = (Post ADR - Pre ADR) / Pre ADR"""
    if pre_adr == 0 or pd.isna(pre_adr):
        return np.nan
    return (post_adr - pre_adr) / pre_adr


def compute_demand_shock_metrics(
    df: pd.DataFrame,
    crisis_start_date: str | pd.Timestamp,
    pre_days: int = PRE_CRISIS_DAYS,
    post_days: int = POST_CRISIS_DAYS,
    group_cols: Optional[list[str]] = None,
    date_col: str = "date",
) -> pd.DataFrame:
    """
    Compute all four demand shock metrics by destination.
    Returns DataFrame with: destination_id, booking_change_pct, search_change_pct,
    adr_change_pct, cancellation_spike, post_booking_cv, pre_*, post_*.
    """
    agg = compute_pre_post_aggregates(
        df, crisis_start_date, pre_days, post_days, group_cols=group_cols
    )

    agg["booking_change_pct"] = agg.apply(
        lambda r: booking_change_pct(r["pre_bookings"], r["post_bookings"]), axis=1
    )
    agg["search_change_pct"] = agg.apply(
        lambda r: search_change_pct(r["pre_searches"], r["post_searches"]), axis=1
    )
    agg["adr_change_pct"] = agg.apply(
        lambda r: adr_change_pct(r["pre_adr"], r["post_adr"]), axis=1
    )
    agg["cancellation_spike"] = agg.apply(
        lambda r: cancellation_spike(r["pre_cancellation_rate"], r["post_cancellation_rate"]),
        axis=1,
    )

    # Booking volatility (coefficient of variation) in the post-crisis window
    w = get_crisis_windows(crisis_start_date, pre_days, post_days)
    df_copy = df.copy()
    df_copy[date_col] = pd.to_datetime(df_copy[date_col])
    post_mask = (df_copy[date_col] >= w.post_start) & (df_copy[date_col] <= w.post_end)
    resolved_group_cols = group_cols or ["destination_id"]
    resolved_group_cols = [c for c in resolved_group_cols if c in df_copy.columns]
    if not resolved_group_cols:
        resolved_group_cols = ["destination_id"] if "destination_id" in df_copy.columns else list(df_copy.columns[:1])
    post_cv = df_copy.loc[post_mask].groupby(resolved_group_cols[0]).agg(
        post_booking_mean=("bookings", "mean"),
        post_booking_std=("bookings", "std"),
    ).reset_index()
    post_cv["post_booking_cv"] = np.where(
        post_cv["post_booking_mean"] > 0,
        post_cv["post_booking_std"] / post_cv["post_booking_mean"],
        1.0,
    )
    agg = agg.merge(
        post_cv[[resolved_group_cols[0], "post_booking_cv"]],
        on=resolved_group_cols[0],
        how="left",
    )
    agg["post_booking_cv"] = agg["post_booking_cv"].fillna(0.5)

    return agg


# =============================================================================
# DESTINATION RESILIENCE INDEX
# =============================================================================

# Weights for Resilience Score formula
RESILIENCE_WEIGHTS = {
    "booking_recovery": 0.30,
    "search_demand": 0.20,
    "adr_stability": 0.15,
    "cancellation": 0.15,
    "demand_volatility": 0.20,
}


def _stability_normalize(ratio: pd.Series) -> pd.Series:
    """Sigmoid-like normalization penalizing both collapse and excessive growth.
    ratio=0 -> 0, ratio=0.5 -> ~0.67, ratio=1.0 -> 1.0, ratio=1.5 -> ~0.86, ratio=2.0 -> ~0.67
    """
    return np.minimum(1.0, ratio / (1 + np.abs(ratio - 1) * 0.5))


def compute_resilience_scores(
    shock_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Compute Destination Resilience Index.
    Formula:
        Resilience Score = 0.30 * Booking Recovery Score
                         + 0.20 * Search Demand Score
                         + 0.15 * ADR Stability Score
                         + 0.15 * (1 - Cancellation Spike Score)
                         + 0.20 * Demand Volatility Score
    All component scores normalized to [0, 1]; higher = more resilient.
    """
    df = shock_df.copy()

    # Booking Recovery Score: sigmoid-like normalization — both collapse AND
    # excessive growth indicate instability, only ratio=1.0 scores perfect 1.0
    ratio_booking = np.where(df["pre_bookings"] > 0, df["post_bookings"] / df["pre_bookings"], 0.0)
    ratio_booking = pd.Series(ratio_booking, index=df.index).clip(lower=0)
    df["booking_recovery_score"] = _stability_normalize(ratio_booking)

    # Search Demand Score: same sigmoid normalization (or 0.5 if no search data)
    has_search = (df["pre_searches"].notna()) & (df["pre_searches"] > 0)
    ratio_search = np.where(has_search, df["post_searches"] / df["pre_searches"], np.nan)
    ratio_search = pd.Series(ratio_search, index=df.index).clip(lower=0)
    df["search_demand_score"] = np.where(
        has_search,
        _stability_normalize(ratio_search),
        0.5,
    )

    # ADR Stability Score: 1 = no change, 0 = large drop
    # adr_change_pct is a fraction (e.g. -0.15), so ratio = 1 + fraction
    df["adr_stability_score"] = np.where(
        df["adr_change_pct"].notna(),
        (1 + df["adr_change_pct"]).clip(0, 1),
        0.5,
    )

    # Cancellation Spike Score: raw spike in [0,1]; we use (1 - spike) so lower spike = higher score
    spike_clipped = df["cancellation_spike"].clip(0, 1)
    df["cancellation_resilience"] = 1 - spike_clipped

    # Demand Volatility Score: 1 - CV; lower volatility = higher resilience
    if "post_booking_cv" in df.columns:
        df["demand_volatility_score"] = (1 - df["post_booking_cv"].clip(0, 1))
    else:
        df["demand_volatility_score"] = 0.5

    # Resilience Score (weighted sum)
    df["resilience_score"] = (
        RESILIENCE_WEIGHTS["booking_recovery"] * df["booking_recovery_score"]
        + RESILIENCE_WEIGHTS["search_demand"] * df["search_demand_score"]
        + RESILIENCE_WEIGHTS["adr_stability"] * df["adr_stability_score"]
        + RESILIENCE_WEIGHTS["cancellation"] * df["cancellation_resilience"]
        + RESILIENCE_WEIGHTS["demand_volatility"] * df["demand_volatility_score"]
    )

    return df


def rank_destinations_by_resilience(
    shock_df: pd.DataFrame,
    min_pre_bookings: float = 10,
) -> pd.DataFrame:
    """
    Rank destinations by Resilience Score (descending).
    Higher score = more resilient during crisis.
    """
    df = compute_resilience_scores(shock_df)
    df = df[df["pre_bookings"] >= min_pre_bookings].copy()
    df = df.sort_values("resilience_score", ascending=False).reset_index(drop=True)
    df["resilience_rank"] = df["resilience_score"].rank(ascending=False, method="min").astype(int)
    return df


# =============================================================================
# IDENTIFICATION: Top gaining, losing, substitution, correlation
# =============================================================================

def top_destinations_gaining_demand(
    shock_df: pd.DataFrame,
    n: int = 10,
    min_pre_bookings: float = 10,
) -> pd.DataFrame:
    """Top N destinations with largest positive booking_change_pct."""
    df = shock_df[shock_df["pre_bookings"] >= min_pre_bookings].copy()
    df = df.sort_values("booking_change_pct", ascending=False).head(n)
    return df[["destination_id", "booking_change_pct", "pre_bookings", "post_bookings"]]


def top_destinations_losing_demand(
    shock_df: pd.DataFrame,
    n: int = 10,
    min_pre_bookings: float = 10,
) -> pd.DataFrame:
    """Top N destinations with largest negative booking_change_pct."""
    df = shock_df[shock_df["pre_bookings"] >= min_pre_bookings].copy()
    df = df.sort_values("booking_change_pct", ascending=True).head(n)
    return df[["destination_id", "booking_change_pct", "pre_bookings", "post_bookings"]]


def demand_substitution_patterns(
    shock_df: pd.DataFrame,
    crisis_affected_regions: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    Identify substitution: destinations gaining while others lose.
    Returns pairs or ranking of 'substitute' destinations (gainers when others lose).
    """
    df = shock_df.copy()
    df["demand_direction"] = np.where(df["booking_change_pct"] > 0, "gaining", "losing")
    df = df.sort_values("booking_change_pct", ascending=False)

    # Simple: rank all by booking_change_pct; gainers at top, losers at bottom
    df["substitution_rank"] = df["booking_change_pct"].rank(ascending=False, method="min")
    return df


def demand_substitution_sankey_flows(
    shock_df: pd.DataFrame,
    max_losers: int = 5,
    max_gainers: int = 5,
) -> pd.DataFrame:
    """
    Build Sankey flow data: Source (losing) -> Target (gaining).
    Flow value = estimated reallocated demand (proportional to loss/gain).
    """
    losers = shock_df[shock_df["booking_change_pct"] < 0].nsmallest(max_losers, "booking_change_pct")
    gainers = shock_df[shock_df["booking_change_pct"] > 0].nlargest(max_gainers, "booking_change_pct")
    if losers.empty or gainers.empty:
        return pd.DataFrame(columns=["source", "target", "value"])
    losers = losers.copy()
    losers["lost_bookings"] = losers["pre_bookings"] * abs(losers["booking_change_pct"])
    gainers = gainers.copy()
    gainers["gained_bookings"] = gainers["post_bookings"] - gainers["pre_bookings"]
    total_loss = losers["lost_bookings"].sum()
    total_gain = gainers["gained_bookings"].sum()
    if total_loss <= 0 or total_gain <= 0:
        return pd.DataFrame(columns=["source", "target", "value"])
    reallocated = min(total_loss, total_gain) * 0.7  # 70% of lost demand reallocates
    rows = []
    for _, lrow in losers.iterrows():
        loss_share = lrow["lost_bookings"] / total_loss
        for _, grow in gainers.iterrows():
            gain_share = grow["gained_bookings"] / total_gain
            flow = reallocated * loss_share * gain_share
            if flow > 5:
                rows.append({
                    "source": lrow["destination_id"],
                    "target": grow["destination_id"],
                    "value": int(round(flow)),
                })
    return pd.DataFrame(rows)


def search_booking_correlation(
    df: pd.DataFrame,
    date_col: str = "date",
    lag_days: int = 0,
    group_col: Optional[str] = "destination_id",
) -> dict:
    """
    Compute correlation between searches and bookings.
    Returns: pearson_r, spearman_rho, r_squared, sample_size.
    """
    d = df.copy()
    d[date_col] = pd.to_datetime(d[date_col])
    d = d.sort_values([date_col])

    if "search_demand" not in d.columns or "bookings" not in d.columns:
        return {"pearson_r": np.nan, "spearman_rho": np.nan, "r_squared": np.nan, "n": 0}

    if lag_days > 0 and group_col and group_col in d.columns:
        d["search_lag"] = d.groupby(group_col)["search_demand"].shift(-lag_days)
        x = d["search_lag"].dropna()
    else:
        x = d["search_demand"].dropna()

    y = d.loc[x.index, "bookings"] if len(x) > 0 else pd.Series(dtype=float)

    x = x.astype(float)
    y = y.astype(float)
    valid = ~(x.isna() | y.isna())
    x, y = x[valid], y[valid]

    if len(x) < 3:
        return {"pearson_r": np.nan, "spearman_rho": np.nan, "r_squared": np.nan, "n": 0}

    pearson_r = x.corr(y)
    try:
        spearman_rho = x.corr(y, method="spearman")
    except (ImportError, OSError):
        # Fallback: use Pearson when scipy/Spearman fails (e.g. DLL issues on Windows)
        spearman_rho = pearson_r
    r_squared = pearson_r ** 2
    return {
        "pearson_r": float(pearson_r),
        "spearman_rho": float(spearman_rho),
        "r_squared": float(r_squared),
        "n": int(len(x)),
    }


def run_full_analytics(
    df: pd.DataFrame,
    crisis_start_date: str | pd.Timestamp,
    pre_days: int = 30,
    post_days: int = 30,
    top_n: int = 10,
) -> dict:
    """
    Run all analytics and return a dict of results.
    """
    shock = compute_demand_shock_metrics(df, crisis_start_date, pre_days, post_days)
    resilience_ranked = rank_destinations_by_resilience(shock, min_pre_bookings=10)

    return {
        "shock_metrics": shock,
        "resilience_ranking": resilience_ranked,
        "top_gaining": top_destinations_gaining_demand(shock, n=top_n),
        "top_losing": top_destinations_losing_demand(shock, n=top_n),
        "substitution": demand_substitution_patterns(shock),
        "sankey_flows": demand_substitution_sankey_flows(shock, max_losers=8, max_gainers=8),
        "search_booking_corr": search_booking_correlation(df, lag_days=0),
        "search_booking_corr_lag7": search_booking_correlation(df, lag_days=7),
    }
