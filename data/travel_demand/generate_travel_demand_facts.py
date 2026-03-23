"""Generate synthetic Fact_Flights and Fact_Visas CSVs (aligned to platform destinations / dates)."""
from __future__ import annotations

import numpy as np
import pandas as pd
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEST_IDS = [
    "ARE", "CYP", "DEU", "EGY", "ESP", "FRA", "GBR", "GRC", "ISR", "ITA",
    "JOR", "LBN", "MDA", "NLD", "POL", "PRT", "ROU", "RUS", "SAU", "THA",
    "TUR", "UKR", "USA",
]
ORIGINS = ["USA", "GBR", "DEU", "FRA", "NLD", "IND", "CHN", "CAN", "AUS", "JPN"]
AIRLINES = ["EK", "QR", "LH", "BA", "AF", "KL", "TK", "AA", "UA", "DL"]
VISA_TYPES = ["Tourist", "Business", "Transit", "Family"]


def main():
    np.random.seed(2026)
    dates = pd.date_range("2022-01-01", "2026-12-31", freq="D")
    flight_rows = []
    visa_rows = []
    for d in dates:
        dow = d.dayofweek
        for _ in range(np.random.randint(8, 28)):
            o = np.random.choice(ORIGINS)
            dest = np.random.choice(DEST_IDS)
            route = f"{o}-{dest}"
            fc = int(np.random.randint(1, 12))
            seats = float(fc * np.random.randint(140, 200))
            lf = float(np.clip(np.random.beta(6, 3), 0.45, 0.95))
            base = 180 + hash(route) % 400 + 30 * np.sin(d.dayofyear / 365 * 2 * np.pi)
            fare = float(max(60, base * (0.85 + 0.3 * np.random.rand())))
            flight_rows.append({
                "date": d.date(),
                "origin_country": o,
                "destination_id": dest,
                "route": route,
                "flights_count": fc,
                "seat_capacity": seats,
                "load_factor": round(lf, 4),
                "avg_airfare": round(fare, 2),
                "airline": np.random.choice(AIRLINES),
            })
        for _ in range(np.random.randint(3, 14)):
            o = np.random.choice(ORIGINS)
            dest = np.random.choice(DEST_IDS)
            apps = int(np.random.randint(20, 800))
            rej_rate = np.clip(np.random.beta(2, 12), 0.02, 0.25)
            issued = int(apps * (1 - rej_rate))
            rejected = max(0, apps - issued)
            visa_rows.append({
                "date": d.date(),
                "origin_country": o,
                "destination_id": dest,
                "visa_applications": apps,
                "visa_issued": issued,
                "visa_rejected": rejected,
                "visa_type": np.random.choice(VISA_TYPES),
                "processing_days": float(round(np.random.uniform(3, 28), 1)),
            })

    ff = pd.DataFrame(flight_rows)
    fv = pd.DataFrame(visa_rows)
    out = PROJECT_ROOT / "data" / "travel_demand"
    out.mkdir(parents=True, exist_ok=True)
    ff.to_csv(out / "fact_flights.csv", index=False)
    fv.to_csv(out / "fact_visas.csv", index=False)
    print(f"Wrote {len(ff)} flight rows, {len(fv)} visa rows -> {out}")


if __name__ == "__main__":
    main()
