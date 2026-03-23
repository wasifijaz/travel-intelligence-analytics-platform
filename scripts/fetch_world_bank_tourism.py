"""
Fetch World Bank International Tourism Arrivals (ST.INT.ARVL).
Source: https://data.worldbank.org/indicator/ST.INT.ARVL
License: CC BY-4.0
"""
import pandas as pd
import requests
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = PROJECT_ROOT / "data" / "raw" / "world_bank_tourism_arrivals.csv"

# Countries relevant to Middle East / Europe / US travel flows
COUNTRY_CODES = [
    "ISR", "PSE", "JOR", "EGY", "ARE", "SAU", "TUR", "GRC", "PRT", "ESP", "ITA",
    "FRA", "DEU", "GBR", "USA", "THA", "CYP", "LBN", "IRN", "IRQ", "POL", "UKR", "RUS",
]

WB_INDICATOR = "ST.INT.ARVL"  # International tourism, number of arrivals


def fetch_world_bank_arrivals(country_codes: list[str] = None) -> pd.DataFrame:
    """Fetch tourism arrivals from World Bank API."""
    country_codes = country_codes or COUNTRY_CODES
    countries = ";".join(country_codes)
    url = (
        f"https://api.worldbank.org/v2/country/{countries}/indicator/{WB_INDICATOR}"
        f"?format=json&date=2019:2024&per_page=1000"
    )
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()
    if len(data) < 2:
        return pd.DataFrame()
    rows = []
    for item in data[1]:
        if item.get("value") is not None:
            rows.append({
                "country_code": item["country"]["id"],
                "country_name": item["country"]["value"],
                "year": int(item["date"]),
                "arrivals_thousands": float(item["value"]),
            })
    return pd.DataFrame(rows)


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    print("Fetching World Bank tourism arrivals...")
    df = fetch_world_bank_arrivals()
    if df.empty:
        print("No data returned. Check API.")
        return
    df = df.sort_values(["country_code", "year"])
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"Saved: {OUTPUT_PATH} ({len(df)} rows)")
    print(f"  Countries: {df['country_code'].nunique()}")
    print(f"  Years: {df['year'].min()} - {df['year'].max()}")


if __name__ == "__main__":
    main()
