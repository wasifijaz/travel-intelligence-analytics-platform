"""
Generate realistic synthetic hospitality demand dataset.
Simulates: Normal demand, Crisis shock, Recovery phase.
Patterns: sudden drop in bookings, cancellation spike, demand shift to alternatives.
Each row = one (date, destination, source_market) aggregate.
"""
import pandas as pd
import numpy as np
from pathlib import Path

DESTINATIONS = [
    ("UKR", "Ukraine", "Eastern Europe", "crisis_affected"),
    ("RUS", "Russia", "Eastern Europe", "crisis_affected"),
    ("POL", "Poland", "Eastern Europe", "neighbor"),
    ("ROU", "Romania", "Eastern Europe", "neighbor"),
    ("MDA", "Moldova", "Eastern Europe", "crisis_affected"),
    ("ISR", "Israel", "Middle East", "crisis_affected"),
    ("PSE", "Palestine", "Middle East", "crisis_affected"),
    ("JOR", "Jordan", "Middle East", "neighbor"),
    ("EGY", "Egypt", "Middle East", "substitute"),
    ("ARE", "UAE", "Gulf", "substitute"),
    ("PRT", "Portugal", "Southern Europe", "substitute"),
    ("ESP", "Spain", "Southern Europe", "substitute"),
    ("ITA", "Italy", "Southern Europe", "substitute"),
    ("GRC", "Greece", "Southern Europe", "substitute"),
    ("FRA", "France", "Western Europe", "substitute"),
    ("DEU", "Germany", "Central Europe", "substitute"),
    ("GBR", "United Kingdom", "Northern Europe", "substitute"),
    ("NLD", "Netherlands", "Western Europe", "substitute"),
    ("TUR", "Turkey", "Eastern Mediterranean", "mixed"),
    ("CYP", "Cyprus", "Eastern Mediterranean", "substitute"),
    ("THA", "Thailand", "Southeast Asia", "substitute"),
    ("USA", "United States", "North America", "substitute"),
]

CRISES = [
    ("2022-02-24", ["UKR", "RUS", "MDA", "POL", "ROU"], 0.85),
    ("2023-10-07", ["ISR", "PSE", "JOR", "EGY"], 0.75),
    ("2024-04-01", ["ISR", "JOR", "IRQ", "LBN"], 0.65),
    ("2025-01-15", ["ISR", "JOR", "ARE"], 0.45),
    ("2026-01-01", ["ISR", "JOR", "PSE"], 0.5),
    ("2026-03-01", ["ARE", "EGY"], 0.35),
]

# Base demand scaled DOWN because each row will be split into ~4 source market rows.
# Previous values were per-destination totals; divide by ~4 to keep aggregate similar.
BASE_DEMAND = {
    "UKR": 30, "RUS": 45, "POL": 55, "ROU": 22, "MDA": 10,
    "ISR": 38, "PSE": 8, "JOR": 20, "EGY": 50, "ARE": 62,
    "PRT": 45, "ESP": 88, "ITA": 100, "GRC": 55, "FRA": 112,
    "DEU": 95, "GBR": 105, "NLD": 38, "TUR": 70, "CYP": 25,
    "THA": 80, "USA": 125,
}

SUBSTITUTE_BOOST = {
    "PRT": 1.4, "ESP": 1.35, "ITA": 1.3, "GRC": 1.45, "FRA": 1.2,
    "DEU": 1.15, "GBR": 1.25, "NLD": 1.3, "TUR": 1.35, "CYP": 1.5,
    "ARE": 1.5, "EGY": 1.2, "THA": 1.45, "USA": 1.1,
}

# --- FIX 1: Destination type for avg_stay ---
LEISURE_DESTINATIONS = {"GRC", "ESP", "ITA", "PRT", "THA", "CYP", "TUR", "EGY", "JOR", "ARE"}
BUSINESS_DESTINATIONS = {"DEU", "GBR", "NLD", "FRA", "USA"}

STAY_DISTRIBUTION_LEISURE = [3, 4, 4, 5, 5, 5, 6, 6, 7, 7, 7, 8, 8, 10, 14]
STAY_DISTRIBUTION_BUSINESS = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5]
STAY_DISTRIBUTION_OTHER = [2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 7]
STAY_DISTRIBUTION_CRISIS = [1, 1, 1, 2, 2, 2, 3, 3]

# --- FIX 2: Lead time distributions ---
LEAD_TIME_NORMAL_VALUES = [1, 2, 3, 5, 7, 10, 14, 21, 28, 35, 42, 60, 90]
LEAD_TIME_NORMAL_PROBS = [0.03, 0.05, 0.07, 0.10, 0.12, 0.13, 0.15, 0.12, 0.10, 0.05, 0.04, 0.03, 0.01]
LEAD_TIME_CRISIS_VALUES = [1, 2, 3, 5, 7, 10, 14]
LEAD_TIME_CRISIS_PROBS = [0.15, 0.20, 0.20, 0.18, 0.12, 0.10, 0.05]

# --- FIX 3: Source market distributions per destination ---
# Each destination has (source_market, weight) pairs. Weights must sum to ~1.
SOURCE_MARKETS = {
    "ISR": [("USA", 0.30), ("GBR", 0.20), ("DEU", 0.15), ("FRA", 0.15), ("RUS", 0.20)],
    "GRC": [("DEU", 0.30), ("GBR", 0.25), ("NLD", 0.15), ("FRA", 0.15), ("USA", 0.15)],
    "ESP": [("GBR", 0.35), ("DEU", 0.25), ("FRA", 0.20), ("NLD", 0.10), ("USA", 0.10)],
    "TUR": [("DEU", 0.30), ("RUS", 0.25), ("GBR", 0.20), ("NLD", 0.15), ("USA", 0.10)],
    "ITA": [("DEU", 0.25), ("GBR", 0.22), ("FRA", 0.20), ("USA", 0.18), ("NLD", 0.15)],
    "FRA": [("GBR", 0.30), ("DEU", 0.25), ("USA", 0.20), ("NLD", 0.15), ("ESP", 0.10)],
    "DEU": [("GBR", 0.25), ("USA", 0.20), ("NLD", 0.20), ("FRA", 0.20), ("POL", 0.15)],
    "GBR": [("USA", 0.30), ("DEU", 0.20), ("FRA", 0.20), ("NLD", 0.15), ("ESP", 0.15)],
    "PRT": [("GBR", 0.30), ("DEU", 0.25), ("FRA", 0.20), ("ESP", 0.15), ("USA", 0.10)],
    "NLD": [("DEU", 0.30), ("GBR", 0.25), ("FRA", 0.20), ("USA", 0.15), ("POL", 0.10)],
    "USA": [("GBR", 0.25), ("DEU", 0.20), ("FRA", 0.15), ("JPN", 0.15), ("CAN", 0.25)],
    "THA": [("GBR", 0.22), ("DEU", 0.18), ("RUS", 0.20), ("USA", 0.20), ("AUS", 0.20)],
    "ARE": [("GBR", 0.25), ("DEU", 0.15), ("RUS", 0.20), ("USA", 0.20), ("IND", 0.20)],
    "EGY": [("DEU", 0.25), ("GBR", 0.25), ("RUS", 0.20), ("FRA", 0.15), ("ITA", 0.15)],
    "CYP": [("GBR", 0.35), ("DEU", 0.20), ("RUS", 0.20), ("GRC", 0.15), ("ISR", 0.10)],
    "JOR": [("USA", 0.25), ("GBR", 0.20), ("DEU", 0.15), ("FRA", 0.15), ("SAU", 0.25)],
    "UKR": [("POL", 0.25), ("DEU", 0.20), ("GBR", 0.15), ("USA", 0.15), ("UKR", 0.25)],
    "RUS": [("DEU", 0.20), ("FRA", 0.15), ("GBR", 0.15), ("RUS", 0.30), ("USA", 0.20)],
    "POL": [("DEU", 0.30), ("GBR", 0.20), ("NLD", 0.15), ("USA", 0.15), ("POL", 0.20)],
    "ROU": [("DEU", 0.25), ("GBR", 0.20), ("FRA", 0.15), ("ITA", 0.20), ("ROU", 0.20)],
    "MDA": [("ROU", 0.30), ("DEU", 0.20), ("RUS", 0.25), ("GBR", 0.10), ("USA", 0.15)],
    "PSE": [("USA", 0.25), ("GBR", 0.20), ("DEU", 0.15), ("FRA", 0.15), ("JOR", 0.25)],
}

# During crisis, Russian tourists shift away from certain destinations
CRISIS_SOURCE_SHIFTS = {
    "RUS": -0.60,  # Russian outbound tourism drops significantly
}


def _get_avg_stay(dest_id: str, in_crisis: bool) -> float:
    if in_crisis:
        return float(np.random.choice(STAY_DISTRIBUTION_CRISIS))
    if dest_id in LEISURE_DESTINATIONS:
        return float(np.random.choice(STAY_DISTRIBUTION_LEISURE))
    if dest_id in BUSINESS_DESTINATIONS:
        return float(np.random.choice(STAY_DISTRIBUTION_BUSINESS))
    return float(np.random.choice(STAY_DISTRIBUTION_OTHER))


def _get_lead_time(in_crisis: bool) -> int:
    if in_crisis:
        return int(np.random.choice(LEAD_TIME_CRISIS_VALUES, p=LEAD_TIME_CRISIS_PROBS))
    return int(np.random.choice(LEAD_TIME_NORMAL_VALUES, p=LEAD_TIME_NORMAL_PROBS))


def _get_crisis_severity(dest_id: str, date: pd.Timestamp) -> tuple[float, float, bool]:
    """Returns (crisis_factor, cancel_boost, is_in_active_crisis)."""
    crisis_factor = 1.0
    cancel_boost = 1.0
    in_crisis = False

    for crisis_start, affected, severity in CRISES:
        c_start = pd.to_datetime(crisis_start)
        days_since = (date - c_start).days

        if dest_id in affected:
            if days_since < 0:
                continue
            in_crisis = True
            if days_since <= 14:
                crisis_factor *= (1 - severity * 0.9)
                cancel_boost = 1.0 + severity * 4
            elif days_since <= 90:
                recovery = 0.3 + 0.5 * (days_since - 14) / 76
                crisis_factor *= (1 - severity * (1 - recovery))
                cancel_boost = 1.0 + severity * (2 - 1.5 * (days_since - 14) / 76)
            else:
                recovery = min(1.0, 0.8 + 0.05 * (days_since - 90) / 365)
                crisis_factor *= (1 - severity * (1 - recovery))
                cancel_boost = 1.0 + severity * 0.3
        else:
            substitute_mult = SUBSTITUTE_BOOST.get(dest_id, 1.0)
            if 0 <= days_since <= 180:
                boost = substitute_mult * (0.2 + 0.3 * np.exp(-days_since / 60))
                crisis_factor *= (1 + boost)

    return crisis_factor, cancel_boost, in_crisis


def _adjust_source_weights_for_crisis(
    dest_id: str, markets: list[tuple[str, float]], in_crisis: bool
) -> list[tuple[str, float]]:
    """Shift source market weights during crisis (e.g. Russian tourists drop)."""
    if not in_crisis:
        return markets

    adjusted = []
    removed_weight = 0.0
    for src, w in markets:
        shift = CRISIS_SOURCE_SHIFTS.get(src, 0.0)
        if shift < 0:
            new_w = max(0.02, w * (1 + shift))
            removed_weight += w - new_w
            adjusted.append((src, new_w))
        else:
            adjusted.append((src, w))

    if removed_weight > 0:
        non_shifted = [(s, w) for s, w in adjusted if s not in CRISIS_SOURCE_SHIFTS]
        boost_each = removed_weight / len(non_shifted) if non_shifted else 0
        adjusted = [
            (s, w + boost_each) if s not in CRISIS_SOURCE_SHIFTS else (s, w)
            for s, w in adjusted
        ]

    total = sum(w for _, w in adjusted)
    return [(s, w / total) for s, w in adjusted]


def generate_synthetic_dataset(
    start_date: str = "2022-01-01",
    end_date: str = "2026-12-31",
    seed: int = 42,
) -> pd.DataFrame:
    np.random.seed(seed)
    dates = pd.date_range(start_date, end_date, freq="D")

    rows = []
    for dest_id, dest_name, region, dest_type in DESTINATIONS:
        base = BASE_DEMAND.get(dest_id, 25)
        source_markets = SOURCE_MARKETS.get(dest_id, [("USA", 0.5), ("GBR", 0.5)])

        for d in dates:
            day_of_week = d.dayofweek
            month = d.month
            weekly = 1.0 + 0.15 * (1 if day_of_week >= 5 else 0)
            monthly = 1.0 + 0.4 * np.sin(2 * np.pi * (month - 7) / 12)

            bookings_base = base * weekly * monthly * (0.8 + 0.4 * np.random.rand())
            bookings_base = max(2, bookings_base)

            crisis_factor, cancel_boost, in_crisis = _get_crisis_severity(dest_id, d)

            bookings_total = max(0, bookings_base * crisis_factor * (0.9 + 0.2 * np.random.rand()))
            bookings_total = int(round(bookings_total))

            if bookings_total == 0:
                continue

            adr_base = 80 + (hash(dest_id) % 120)
            adr_crisis = 1.0
            for crisis_start, affected, severity in CRISES:
                c_start = pd.to_datetime(crisis_start)
                days_since = (d - c_start).days
                if dest_id in affected and 0 <= days_since <= 90:
                    adr_crisis *= (1 - severity * 0.2 * np.exp(-days_since / 30))
            adr = adr_base * adr_crisis * (0.95 + 0.1 * np.random.rand())

            occ_base = 0.65 + 0.2 * (hash(dest_id) % 100) / 100
            affected_ids = {a for c in CRISES for a in c[1] if a in BASE_DEMAND}
            occ_factor = crisis_factor if dest_id in affected_ids else 1.0
            occupancy_rate = min(0.95, occ_base * occ_factor * (0.9 + 0.2 * np.random.rand()))

            adjusted_markets = _adjust_source_weights_for_crisis(
                dest_id, source_markets, in_crisis
            )

            for src_market, weight in adjusted_markets:
                src_bookings = max(1, int(round(bookings_total * weight)))
                src_noise = 0.85 + 0.3 * np.random.rand()
                src_bookings = max(1, int(round(src_bookings * src_noise)))

                cancel_rate = 0.10 * cancel_boost * (0.9 + 0.2 * np.random.rand())
                cancel_rate = min(0.95, cancel_rate)
                cancellations = int(round(src_bookings * cancel_rate / (1 - cancel_rate))) if cancel_rate < 1 else int(src_bookings * 0.5)

                searches = (src_bookings + cancellations) * (1.2 + 0.6 * np.random.rand())
                searches = max(0, int(round(searches)))

                avg_stay = _get_avg_stay(dest_id, in_crisis)
                room_nights = round(src_bookings * avg_stay, 2)

                lead_time = _get_lead_time(in_crisis)

                travel_type = "domestic" if src_market == dest_id else "international"

                rows.append({
                    "date": d.date(),
                    "destination": dest_id,
                    "source_market": src_market,
                    "bookings": src_bookings,
                    "searches": searches,
                    "cancellations": cancellations,
                    "adr": round(adr, 2),
                    "room_nights": room_nights,
                    "lead_time_days": lead_time,
                    "occupancy_rate": round(occupancy_rate, 4),
                    "avg_length_of_stay": avg_stay,
                    "travel_type": travel_type,
                })

    return pd.DataFrame(rows)


def save_and_prepare_for_pipeline(df: pd.DataFrame, output_dir: Path) -> dict:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_path = output_dir / "synthetic_demand.csv"
    df.to_csv(csv_path, index=False)
    print(f"Saved: {csv_path} ({len(df):,} rows)")

    dest_df = pd.DataFrame([
        {"destination_id": d[0], "destination_name": d[1], "region": d[2]}
        for d in DESTINATIONS
    ])
    dest_path = output_dir / "destinations.csv"
    dest_df.to_csv(dest_path, index=False)
    print(f"Saved: {dest_path}")

    return {"demand": csv_path, "destinations": dest_path}


if __name__ == "__main__":
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
    output_dir = PROJECT_ROOT / "data" / "synthetic"

    print("Generating synthetic dataset...")
    print("  - 22 destinations")
    print("  - 2022-01-01 to 2026-12-31")
    print("  - Source market corridors per destination")
    print("  - Crises: Russia-Ukraine, Israel-Hamas, Iran-Israel, regional instability")
    print("  - Patterns: demand drop, cancellation spike, substitution, lead time compression")

    df = generate_synthetic_dataset()
    paths = save_and_prepare_for_pipeline(df, output_dir)

    print(f"\nSummary:")
    print(f"  Total rows: {len(df):,}")
    print(f"  Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"  Destinations: {df['destination'].nunique()}")
    print(f"  Source markets: {df['source_market'].nunique()}")
    print(f"  Avg bookings/row: {df['bookings'].mean():.1f}")
    print(f"  Avg stay distribution:")
    print(f"    mean={df['avg_length_of_stay'].mean():.1f}, "
          f"std={df['avg_length_of_stay'].std():.1f}, "
          f"min={df['avg_length_of_stay'].min():.0f}, "
          f"max={df['avg_length_of_stay'].max():.0f}")
    print(f"  Lead time distribution:")
    for bucket, (lo, hi) in {"0-6 days": (0, 6), "7-13 days": (7, 13),
                              "14-20 days": (14, 20), "21-29 days": (21, 29),
                              "30+ days": (30, 999)}.items():
        pct = ((df['lead_time_days'] >= lo) & (df['lead_time_days'] <= hi)).mean() * 100
        print(f"    {bucket}: {pct:.1f}%")
    print(f"  Travel types: {df['travel_type'].value_counts().to_dict()}")
    print(f"  Columns: {list(df.columns)}")
