# Dataset Research: Tourism Demand Shock Analytics

**Research Date:** March 2025  
**Purpose:** Identify publicly available datasets for building the Hospitality Demand Shock dashboard.

---

## Executive Summary: BEST Dataset Combination

| Required Column | Best Dataset | Link | Notes |
|-----------------|--------------|------|-------|
| **date** | Kaggle Hotel Booking Demand | [Link](https://www.kaggle.com/datasets/jessemostipak/hotel-booking-demand) | From arrival_date_year, month, day |
| **destination** | World Bank Tourism Arrivals | [Link](https://data.worldbank.org/indicator/ST.INT.ARVL) | Country-level; API available |
| **bookings** | Kaggle Hotel Booking Demand | [Link](https://www.kaggle.com/datasets/jessemostipak/hotel-booking-demand) | Count where is_canceled=0, aggregate by date |
| **cancellations** | Kaggle Hotel Booking Demand | Same | Count where is_canceled=1 |
| **search_demand** | Google Destination Insights or Synthetic | [Link](https://destinationinsights.withgoogle.com) | CSV export; or synthetic = f(bookings, lag) |
| **adr** | Kaggle Hotel Booking Demand | Same | `adr` column |
| **room_nights** | Kaggle Hotel Booking Demand | Same | stays_in_weekend_nights + stays_in_week_nights |
| **crisis_start_date** | Manual / ACLED | [ACLED](https://acleddata.com/) | Lookup table |
| **crisis_phase** | Derived | — | From date vs crisis_start_date |

**Strategy:** Use Kaggle + World Bank as primary; augment with synthetic search_demand and multi-destination expansion for full dashboard coverage.

---

## 1. Dataset Catalog

### 1.1 Hotel Bookings & Cancellations

| # | Dataset Name | Link | Description | Columns | Time Range | Geographic Coverage |
|---|--------------|------|-------------|----------|------------|---------------------|
| 1 | **Hotel Booking Demand** | https://www.kaggle.com/datasets/jessemostipak/hotel-booking-demand | Hotel reservation data from 2 Portugal hotels (city + resort). Contains both completed and canceled bookings. | hotel, is_canceled, lead_time, arrival_date_year/month/day, stays_in_weekend_nights, stays_in_week_nights, adults, children, babies, meal, country (guest origin), market_segment, distribution_channel, adr, reservation_status, etc. (31–32 cols) | Jul 2015 – Aug 2017 | Portugal (2 hotels) |
| 2 | **Hotel Booking Demand Complete** | https://www.kaggle.com/datasets/ramonakeira/hotel-booking-demand-complete | Extended version with additional features. | Similar to above + extras | Jul 2015 – Aug 2017 | Portugal |
| 3 | **Hotel Booking Cancellations** | https://www.kaggle.com/datasets/muhammaddawood42/hotel-booking-cancelations | Focused on cancellation prediction. | Booking attributes, cancellation flag | Varies | Varies |
| 4 | **Hotel Stay Prediction** | https://www.opendatabay.com/data/ai-ml/4197d9ec-c1e6-47ff-9114-524f2ce8ee4a | For cancellation prediction. | no_of_weekend_nights, no_of_week_nights, lead_time, room_type, meal_plan, etc. | — | — |

### 1.2 Tourism Arrivals & Accommodation

| # | Dataset Name | Link | Description | Columns | Time Range | Geographic Coverage |
|---|--------------|------|-------------|----------|------------|---------------------|
| 5 | **UNdata Inbound Tourism** | http://data.un.org/DocumentData.aspx?id=481 | UNWTO-sourced inbound tourism by country. | Country, Total arrivals, Overnight visitors, Same-day visitors, Arrivals by region, Accommodation (Guests, Overnights), Tourism expenditure | 1995 – 2021 | 200+ countries |
| 6 | **World Bank Tourism Arrivals** | https://data.worldbank.org/indicator/ST.INT.ARVL | International tourist arrivals by country. | Country, Year, Arrivals (thousands) | 1995 – 2023 | 200+ countries |
| 7 | **World Bank Tourism Receipts** | https://data.worldbank.org/indicator/ST.INT.RCPT.CD | International tourism receipts (US$). | Country, Year, Receipts (current US$) | 1995 – 2023 | 200+ countries |
| 8 | **Eurostat Tourism Nights** | https://ec.europa.eu/eurostat/databrowser/product/view/tin00175 | Nights spent at tourist accommodation (EU). | Country, NACE sector, Residents/non-residents, Nights | Monthly, 2012+ | EU member states |
| 9 | **Tourism and Economic Impact** | https://www.kaggle.com/datasets/bushraqurban/tourism-and-economic-impact | Tourism arrivals + GDP, receipts, unemployment, inflation. | Country, Year, Arrivals, GDP, Receipts, Expenditures, Unemployment, Inflation | 1999 – 2023 | 200+ countries |

### 1.3 Search & Travel Demand

| # | Dataset Name | Link | Description | Columns | Time Range | Geographic Coverage |
|---|--------------|------|-------------|----------|------------|---------------------|
| 10 | **Destination Insights with Google** | https://destinationinsights.withgoogle.com | Travel demand from Google Search (accommodation, flights). CSV download from dashboards. | Origin, Destination, Demand index, Trip type, Period | Last 30/60/90 days (rolling) | Global (country/city) |
| 11 | **Google Travel Impact Model API** | https://developers.google.com/travel/impact-model | Flight emission estimates (proxy for flight demand). | Flight route, emissions, distance | Next 11 months | Global |
| 12 | **Skift Travel Health Index** | https://research.skift.com/sectors/skift-travel-health-index/ | 64 indicators across aviation, hotels, vacation rentals. | Country, Vertical, Index value | Monthly, 2020+ | 22 countries |
| 13 | **Google Community Mobility** | https://www.google.com/covid19/mobility/ | Mobility vs baseline (retail, transit, etc.). **No longer updated** (Oct 2022). | Country/region, Date, retail_recreation, transit_stations, workplaces, residential, etc. | Feb 2020 – Oct 2022 | Global |

### 1.4 Aviation & Flight Demand

| # | Dataset Name | Link | Description | Columns | Time Range | Geographic Coverage |
|---|--------------|------|-------------|----------|------------|---------------------|
| 14 | **BTS TranStats** | https://www.transtats.bts.gov/ | U.S. airline passenger traffic, capacity, load factors. | Origin, Destination, Carrier, Passengers, Seats, Load factor | Monthly | U.S. domestic/international |
| 15 | **ICAO iCADS** | https://data.icao.int/icads | Official aviation statistics (passenger traffic, routes). | Route, Traffic, Freight | 30+ years | Global |
| 16 | **ICAO Data+** | https://dataplus.icao.int/ | Air carrier traffic, airport traffic, forecasts. | Carrier, Airport, Traffic | 1980 – 2030 | 193 member states |

### 1.5 Hospitality Revenue & Performance

| # | Dataset Name | Link | Description | Columns | Time Range | Geographic Coverage |
|---|--------------|------|-------------|----------|------------|---------------------|
| 17 | **STR / CoStar Benchmark** | https://str.com/data-insights | Industry-standard ADR, occupancy, RevPAR. | Market, Date, ADR, Occupancy, RevPAR | Daily/Monthly | Global (commercial) |
| 18 | **AirDNA** | https://www.airdna.co/ | Short-term rental occupancy, ADR, RevPAR. Enterprise API. | Market, Occupancy, ADR, RevPAR, LOS | — | 10M+ listings (commercial) |

### 1.6 Geopolitical & Crisis Events

| # | Dataset Name | Link | Description | Columns | Time Range | Geographic Coverage |
|---|--------------|------|-------------|----------|------------|---------------------|
| 19 | **GDELT Project** | https://www.gdeltproject.org/data.html | Global news events, conflict coding (CAMEO). | Date, Actors, Action, Location, Goldstein scale | 2015+ (hourly) | Global |
| 20 | **GDELT Cloud** | https://docs.gdeltcloud.com/ | Queryable events, GKG themes. API (paid tiers). | gdelt_events, gdelt_gkg, themes | Jan 2025+ | Global |
| 21 | **ACLED** | https://acleddata.com/ | Armed conflict location & event data. | Date, Location, Event type, Fatalities | 1997+ | Global |

---

## 2. Best Dataset Combination for the Dashboard

### 2.1 Target Schema

| Column | Description | Source |
|--------|-------------|--------|
| `date` | Analysis date | Multiple |
| `destination` | Country or region | UNdata, World Bank, Eurostat |
| `bookings` | Number of bookings | Kaggle hotel (aggregated) + synthetic |
| `cancellations` | Number of cancellations | Kaggle hotel |
| `search_demand` | Search/intent index | Google Destination Insights or synthetic |
| `adr` | Average daily rate | Kaggle hotel |
| `room_nights` | Room nights sold | Kaggle hotel (stays_in_weekend_nights + stays_in_week_nights) |
| `crisis_start_date` | Geopolitical event start | Manual / GDELT / ACLED |
| `crisis_phase` | pre_crisis / immediate / short_term / recovery | Derived |

### 2.2 Recommended Combination

**Primary (free, publicly available):**

| Use Case | Dataset | Rationale |
|----------|---------|-----------|
| **Bookings, Cancellations, ADR, Room nights** | **Kaggle Hotel Booking Demand** | Has `is_canceled`, `adr`, `stays_in_weekend_nights` + `stays_in_week_nights` = room nights. Aggregate by `arrival_date` to get daily metrics. |
| **Destination (country-level)** | **World Bank Tourism Arrivals** or **UNdata Inbound Tourism** | Country × year (or month) arrivals. Use as destination demand proxy. |
| **Search demand** | **Google Destination Insights** (manual CSV) or **synthetic** | Download accommodation search trends by destination. Free but manual. For portfolio: generate synthetic search series correlated with bookings. |
| **Crisis timeline** | **Manual** or **ACLED** | Define `crisis_start_date` for Russia-Ukraine (2022-02-24), Israel-Gaza (2023-10-07), etc. ACLED has structured event data. |

**Supporting (optional):**

| Use Case | Dataset |
|----------|---------|
| EU destination detail | Eurostat tourism nights |
| Flight demand proxy | BTS TranStats (U.S. routes) |
| Crisis events | GDELT or ACLED |

### 2.3 Limitations & Mitigations

| Gap | Mitigation |
|-----|------------|
| Kaggle hotel = Portugal only, 2015–2017 | **Synthetic expansion:** Generate multi-destination, multi-year data using UNWTO seasonality + crisis shock curves. Use Kaggle for schema/validation. |
| No search data in Kaggle | **Synthetic:** Create search_demand = f(bookings, lag) with realistic correlation. Or use Google Destination Insights CSV exports. |
| No ADR/occupancy at country level (free) | **Proxy:** Use World Bank tourism receipts ÷ arrivals as rough spend proxy. Or keep ADR at hotel level (Portugal) and scale for demo. |
| Crisis dates not in datasets | **Manual table:** `crisis_id`, `name`, `start_date`, `end_date`. Join to fact table. |

---

## 3. Final Dataset Architecture

### 3.1 Core Tables to Build

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  fact_daily_demand                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  date | destination | bookings | cancellations | search_demand | adr |      │
│  room_nights | crisis_start_date | crisis_phase                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Sources by Column

| Column | Primary Source | Fallback |
|--------|----------------|----------|
| date | Kaggle (arrival_date_*) | All |
| destination | World Bank / UNdata (country) | Kaggle country = guest origin; use Portugal as single destination |
| bookings | Kaggle (count where !is_canceled) | Synthetic |
| cancellations | Kaggle (count where is_canceled) | Synthetic |
| search_demand | Google Destination Insights CSV | Synthetic (lagged correlation with bookings) |
| adr | Kaggle (adr column) | Synthetic |
| room_nights | Kaggle (stays_in_weekend_nights + stays_in_week_nights) | Synthetic |
| crisis_start_date | Manual / ACLED | Static lookup table |
| crisis_phase | Derived from date vs crisis_start_date | — |

### 3.3 Geopolitical Event Timeline (Reference)

| crisis_id | name | crisis_start_date | crisis_end_date | affected_regions |
|-----------|------|-------------------|-----------------|------------------|
| 1 | Russia-Ukraine conflict | 2022-02-24 | ongoing | Eastern Europe, Russia, Ukraine |
| 2 | Israel-Gaza (2023) | 2023-10-07 | ongoing | Israel, Palestine, Middle East |
| 3 | Iran regional tensions | 2024-01-01 | ongoing | Middle East, Gulf |

**crisis_phase** logic:
- `pre_crisis`: date < crisis_start_date
- `immediate`: 0–14 days after crisis_start_date
- `short_term`: 15–90 days after
- `recovery`: 90+ days after

### 3.4 Implementation Order

1. **Ingest** Kaggle Hotel Booking Demand → extract bookings, cancellations, ADR, room_nights by date.
2. **Ingest** World Bank Tourism Arrivals (API: `ST.INT.ARVL`) → destination × year.
3. **Create** crisis lookup table (manual dates).
4. **Generate** synthetic search_demand (or pull from Google if available).
5. **Join** and aggregate to `fact_daily_demand` schema.
6. **Derive** `crisis_phase` from `crisis_start_date`.

---

## 4. Quick Reference Links

| Resource | URL |
|----------|-----|
| Kaggle Hotel Booking Demand | https://www.kaggle.com/datasets/jessemostipak/hotel-booking-demand |
| World Bank API (Arrivals) | https://api.worldbank.org/v2/en/indicator/ST.INT.ARVL?downloadformat=csv |
| World Bank API (Receipts) | https://api.worldbank.org/v2/en/indicator/ST.INT.RCPT.CD?downloadformat=csv |
| UNdata Inbound Tourism | http://data.un.org/DocumentData.aspx?id=481 |
| Eurostat API | https://ec.europa.eu/eurostat/api/dissemination |
| Google Destination Insights | https://destinationinsights.withgoogle.com |
| BTS TranStats | https://www.transtats.bts.gov/ |
| GDELT | https://www.gdeltproject.org/data.html |
| ACLED | https://acleddata.com/ |

---

*Document prepared for Hospitality Demand Shock Analytics project*
