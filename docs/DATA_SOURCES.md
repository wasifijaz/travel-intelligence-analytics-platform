# Data Sources & Pipeline Design

## 1. Data Source List

| Source | Link | Data Type | Use Case |
|--------|------|-----------|----------|
| **World Bank Tourism Arrivals** | https://data.worldbank.org/indicator/ST.INT.ARVL | Country × Year arrivals | Destination demand proxy |
| **Kaggle Hotel Booking Demand** | https://www.kaggle.com/datasets/jessemostipak/hotel-booking-demand | Bookings, ADR, cancellations, lead time | Schema & patterns |
| **UNWTO Tourism Statistics** | https://www.e-unwto.org/toc/unwtotfb/current | Inbound/outbound tourism | Country-level validation |
| **Google Destination Insights** | https://destinationinsights.withgoogle.com | Search demand by destination | Search volume (manual CSV) |
| **ACLED** | https://acleddata.com/ | Conflict events | Crisis timeline validation |

## 2. Dataset Schema (Unified)

```
daily_metrics:
  date, destination_id, crisis_id
  bookings, cancellations, total_reservations
  search_demand, adr, room_nights
  lead_time_days, occupancy_rate
  bookings_per_day, cancellation_rate, search_to_booking_ratio
  adr_change, demand_change_percent, normalized_demand_index
  crisis_phase, days_since_crisis

destinations:
  destination_id, destination_name, region

crisis_events:
  crisis_id, crisis_name, crisis_start_date, crisis_end_date
  region_affected, crisis_phase, event_type
```

## 3. Data Preparation

- **Synthetic generator** (`data/synthetic/generate_synthetic_data.py`): 2022–2026, 22 destinations, crisis shocks (Russia-Ukraine, Israel-Hamas, Iran-Israel).
- **World Bank fetcher** (`scripts/fetch_world_bank_tourism.py`): Optional real arrivals for scaling.
- **Load pipeline** (`scripts/load_synthetic_to_pipeline.py`): Converts to `daily_metrics`, loads crisis events from `data/seed/crisis_events_extended.csv`.

## 4. Crisis Event Markers (2022–2026)

| Date | Event | Region | Phase |
|------|-------|--------|-------|
| 2022-02-24 | Russia-Ukraine conflict | Eastern Europe | escalation |
| 2023-10-07 | Israel-Hamas War | Israel, Palestine, Jordan, Egypt | peak |
| 2024-04-01 | Iran-Israel escalation | Israel, Jordan, Iraq, Lebanon | escalation |
| 2025-01-15 | Iran-Israel tensions 2025 | Israel, Jordan, UAE, Saudi Arabia | escalation |

## 5. Demand Shock Patterns (Simulated)

- **Israel, Jordan, Egypt** ↓ bookings & searches
- **UAE, Turkey, Thailand, Greece** ↑ demand (substitution)
- **Lead time**: 35 days (normal) → 12 days (crisis)
- **Cancellation spike**: 4× in immediate phase
- **ADR volatility**: -20% in affected destinations
