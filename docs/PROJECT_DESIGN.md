# Hospitality Demand Shock Analysis During War / Geopolitical Crisis

## Portfolio Project Design Document

**Version:** 1.0  
**Date:** March 2025  
**Domain:** Hospitality Analytics | Geopolitical Risk | Demand Forecasting

---

## 1. Executive Summary

This project quantifies how geopolitical conflict impacts hotel demand patterns through a full-stack analytics pipeline: **data engineering → analytical modeling → forecasting → interactive dashboard**. It demonstrates end-to-end capability in hospitality domain analytics using real-world tourism KPIs.

**Core Question:** *How do hotel bookings, cancellations, searches, ADR, and room nights shift before vs. after a geopolitical crisis, and which destinations are most resilient?*

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                    HOSPITALITY DEMAND SHOCK ANALYSIS — SYSTEM ARCHITECTURE                    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: DATA SOURCES                                                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ UNWTO Tourism│  │ STR / CoStar │  │ OTA Search   │  │ Geopolitical │  │ Economic     │   │
│  │ Data         │  │ Hotel Bench  │  │ Intent Data  │  │ Event Index  │  │ Indicators   │   │
│  │ (Arrivals)   │  │ (ADR, Occ)   │  │ (Searches)   │  │ (GDELT, etc) │  │ (GDP, FX)    │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │                 │            │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┼────────────┘
          │                 │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 2: INGESTION (Data Pipeline)                                                          │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  ETL / ELT Orchestrator (e.g., Airflow, dbt, Prefect)                                │   │
│  │  • Scheduled pulls (daily/weekly)                                                     │   │
│  │  • API connectors, CSV/Excel loaders                                                  │   │
│  │  • Incremental & full refresh modes                                                   │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                                   │
│                                          ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  Raw Data Lake (Parquet / Delta)                                                     │   │
│  │  • Partitioned by: source, date, country                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                                   │
└──────────────────────────────────────────┼───────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: TRANSFORMATION (Feature Engineering)                                               │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ Normalization   │  │ Crisis Windows  │  │ Lag Features    │  │ Derived KPIs    │         │
│  │ (daily index)   │  │ (pre/post)      │  │ (7d, 14d, 30d)  │  │ RevPAR, MPI     │         │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
│           │                    │                     │                    │                  │
│           └────────────────────┴─────────────────────┴────────────────────┴──────────────────│
│                                                │                                              │
│                                                ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  Analytics-Ready Tables (Star Schema)                                                │   │
│  │  • fact_daily_demand | dim_destination | dim_crisis_event | fact_search_intent       │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                                   │
└──────────────────────────────────────────┼───────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 4: ANALYTICS & MODELING                                                               │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐          │
│  │  ANALYTICAL MODEL                    │  │  FORECASTING MODEL                   │          │
│  │  • Pre vs Post comparison            │  │  • Prophet / ARIMA / LightGBM        │          │
│  │  • Delta & % change metrics           │  │  • Multi-horizon (7d, 30d, 90d)      │          │
│  │  • Resilience scoring                 │  │  • Scenario: crisis vs no-crisis      │          │
│  │  • Search → Booking correlation       │  │  • Confidence intervals              │          │
│  └─────────────────────────────────────┘  └─────────────────────────────────────┘          │
│                                          │                                                   │
└──────────────────────────────────────────┼───────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 5: SERVING & VISUALIZATION                                                            │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  Interactive Web Dashboard (Streamlit / Dash / React + D3)                           │   │
│  │  • Crisis selector | Destination drill-down | Time series | Forecast charts          │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                                   │
└──────────────────────────────────────────┴───────────────────────────────────────────────────┘
```

---

## 3. Dataset List

### 3.1 Primary Datasets

| Dataset | Source | Metrics | Granularity | Access |
|---------|--------|---------|-------------|--------|
| **International Tourist Arrivals** | UNWTO Tourism Data Dashboard | Arrivals by country, month | Country × Month | Web / API |
| **Accommodation Statistics** | UNWTO | Rooms, guests, nights | Country × Month | Web |
| **Hotel Performance (ADR, Occupancy, RevPAR)** | STR / CoStar Benchmark | ADR, Occ%, RevPAR, room nights | Market × Day | Commercial API |
| **OTA Search Intent** | Simulated / Skift / SimilarWeb | Search volume by destination | Destination × Day | Proxy or synthetic |
| **Booking & Cancellation Events** | Simulated / Expedia Open Data | Bookings, cancellations | Hotel × Day | Synthetic for portfolio |

### 3.2 Contextual Datasets

| Dataset | Source | Use Case |
|---------|--------|----------|
| **Geopolitical Event Index** | GDELT, ACLED, or manual crisis dates | Crisis start/end windows |
| **GDP, FX, Inflation** | World Bank, IMF | Macro controls |
| **Flight Capacity / Schedules** | OAG, Cirium (or proxy) | Supply-side shock |
| **Travel Advisories** | Govt. travel.state.gov, FCO | Risk perception |

### 3.3 Reference Crisis Events (for analysis)

| Event | Start | Affected Regions | Data Window |
|-------|-------|------------------|-------------|
| Russia–Ukraine conflict | Feb 2022 | Eastern Europe, Russia, Ukraine | 2021–2023 |
| Israel–Gaza (2023) | Oct 2023 | Israel, Palestine, Middle East | 2023–2024 |
| Iran regional tensions | 2024+ | Middle East, Gulf | 2024–2025 |

### 3.4 Synthetic Data Strategy (Portfolio Use)

For portfolio demonstration without commercial API access:

- **Generate synthetic hotel demand** using UNWTO-style seasonality + crisis shock curves
- **Calibrate** to published UNWTO/WTTC impact figures (e.g., -69% flights Moldova, -42% Slovenia)
- **Document** clearly that production would use STR, UNWTO, OTA APIs

---

## 4. Feature Engineering Plan

### 4.1 Core Metrics (Hospitality KPIs)

| Metric | Formula | Use |
|--------|---------|-----|
| **ADR** | Total Room Revenue ÷ Rooms Sold | Pricing power |
| **Occupancy** | Rooms Sold ÷ Total Available Rooms | Utilization |
| **RevPAR** | ADR × Occupancy (or Total Room Rev ÷ Available Rooms) | Combined efficiency |
| **Room Nights** | Rooms Sold × Length of Stay | Volume |
| **Cancellation Rate** | Cancellations ÷ (Bookings + Cancellations) | Risk signal |
| **Search-to-Book Ratio** | Bookings ÷ Searches | Conversion intent |

### 4.2 Normalization Features

| Feature | Definition |
|---------|------------|
| `demand_index_daily` | Daily metric ÷ 7-day pre-crisis baseline (index = 100) |
| `demand_index_weekly` | Weekly metric ÷ same week prior year |
| `yoy_pct_change` | (Current − Prior Year) ÷ Prior Year × 100 |
| `mom_pct_change` | Month-over-month % change |

### 4.3 Crisis Window Features

| Feature | Definition |
|---------|------------|
| `crisis_start_date` | Event onset (e.g., invasion date) |
| `days_since_crisis` | Days from crisis start |
| `phase` | `pre_crisis` \| `immediate` (0–14d) \| `short_term` (15–90d) \| `recovery` (90d+) |
| `pre_crisis_baseline` | 30-day average before crisis |
| `post_crisis_delta` | Metric − pre_crisis_baseline |
| `post_crisis_pct_change` | (Metric − baseline) ÷ baseline × 100 |

### 4.4 Lag & Rolling Features

| Feature | Window |
|---------|--------|
| `bookings_7d_ma` | 7-day moving average |
| `searches_14d_lag` | Search volume 14 days prior (lead indicator) |
| `cancellation_rate_30d` | 30-day rolling cancellation rate |
| `volatility_30d` | Std dev of daily demand over 30 days |

### 4.5 Derived KPIs (Industry Standard)

| KPI | Definition |
|-----|------------|
| **MPI (Market Penetration Index)** | Hotel Occ ÷ Market Occ × 100 |
| **ARI (Average Rate Index)** | Hotel ADR ÷ Market ADR × 100 |
| **RGI (Revenue Generation Index)** | Hotel RevPAR ÷ Market RevPAR × 100 |

### 4.6 Destination-Level Features

| Feature | Definition |
|---------|------------|
| `resilience_score` | Composite: (ΔOcc + ΔRevPAR recovery) normalized |
| `distance_to_crisis_km` | Geographic distance from crisis epicenter |
| `travel_advisory_level` | 1–4 scale (if available) |
| `source_market_diversification` | Herfindahl index of source countries |

---

## 5. Modeling Plan

### 5.1 Analytical Model (Descriptive)

**Objective:** Quantify pre vs post crisis impact and identify resilient destinations.

| Analysis | Method | Output |
|----------|--------|--------|
| Pre vs Post comparison | Paired t-test / Wilcoxon | Mean delta, p-value |
| Delta & % change | Simple arithmetic | Tables, bar charts |
| Daily normalized metrics | Index (baseline = 100) | Time series charts |
| Most resilient destinations | Ranking by recovery speed, % change | Leaderboard |
| Search → Booking correlation | Pearson/Spearman, lagged regression | Correlation matrix, coefficients |
| Segment analysis | Stratified by country, hotel tier | Heatmaps, treemaps |

### 5.2 Forecasting Model (Predictive)

**Objective:** Forecast demand under crisis vs no-crisis scenarios.

| Component | Approach | Horizon |
|-----------|----------|---------|
| **Baseline forecast** | Prophet or ARIMA | 7d, 30d, 90d |
| **Regressors** | Crisis dummy, search volume, FX | Included in Prophet |
| **Scenario modeling** | Two runs: with/without crisis shock | Compare trajectories |
| **Uncertainty** | Bootstrap or MCMC | 80%, 95% intervals |
| **Alternative** | LightGBM with lag features | Same horizons |

**Model Selection Criteria:**
- Interpretability for stakeholders
- Handling of seasonality (weekly, monthly, yearly)
- Ability to incorporate crisis regime switch

### 5.3 Evaluation Metrics

| Metric | Use |
|--------|-----|
| MAPE, MAE, RMSE | Forecast accuracy |
| Directional accuracy | % correct up/down |
| Correlation (search vs booking) | Lead indicator validation |

---

## 6. Dashboard Layout

### 6.1 High-Level Structure

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  HOSPITALITY DEMAND SHOCK ANALYSIS                                    [Crisis ▼] [Date ▼]   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  KPI CARDS (Row 1)                                                                    │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │   │
│  │  │ Bookings │ │ Cancels  │ │ Searches │ │   ADR    │ │ Room Nts │ │ RevPAR   │      │   │
│  │  │  Δ -23%  │ │  Δ +45%  │ │  Δ -18%  │ │  Δ -8%   │ │  Δ -21%  │ │  Δ -15%  │      │   │
│  │  │ vs base  │ │ vs base  │ │ vs base  │ │ vs base  │ │ vs base  │ │ vs base  │      │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
│  ┌────────────────────────────────────────────┐ ┌────────────────────────────────────────┐ │
│  │  DEMAND INDEX (Normalized)                  │ │  PRE vs POST COMPARISON                 │ │
│  │  ─────────────────────────────────────     │ │  ───────────────────────────────────    │ │
│  │  [Line chart: Bookings, Cancellations,     │ │  [Grouped bar: Pre vs Post by metric]   │ │
│  │   Searches, ADR — index 100 = baseline]    │ │  [Dropdown: Country / Region]          │ │
│  │  [Crisis start marker]                      │ │                                        │ │
│  └────────────────────────────────────────────┘ └────────────────────────────────────────┘ │
│                                                                                              │
│  ┌────────────────────────────────────────────┐ ┌────────────────────────────────────────┐ │
│  │  RESILIENCE RANKING                         │ │  SEARCH → BOOKING CORRELATION          │ │
│  │  ─────────────────────────────────────     │ │  ───────────────────────────────────    │ │
│  │  [Horizontal bar: Top 10 resilient          │ │  [Scatter: Searches vs Bookings]       │ │
│  │   destinations by recovery score]          │ │  [Lag selector: 0, 7, 14 days]         │ │
│  │  [Map: Color by resilience]                 │ │  [Correlation coefficient display]     │ │
│  └────────────────────────────────────────────┘ └────────────────────────────────────────┘ │
│                                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  FORECAST                                                                             │   │
│  │  ───────────────────────────────────────────────────────────────────────────────    │   │
│  │  [Line chart: Historical + Forecast with CI]                                          │   │
│  │  [Toggle: Crisis scenario vs No-crisis scenario]                                       │   │
│  │  [Horizon: 7d | 30d | 90d]                                                            │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  DESTINATION DRILL-DOWN (Table)                                                       │   │
│  │  Country | Bookings Δ | Cancellations Δ | ADR Δ | Room Nights Δ | Resilience Score    │   │
│  └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Interaction Specifications

| Element | Interaction |
|---------|-------------|
| Crisis selector | Filter all views by crisis event |
| Date range | Slider or picker for analysis window |
| Destination click | Drill-down to country-level detail |
| Lag selector | Adjust search–booking lag in correlation view |
| Scenario toggle | Switch forecast between crisis / no-crisis |

### 6.3 Technology Stack Recommendation

| Layer | Option A | Option B |
|-------|----------|----------|
| Dashboard | Streamlit | Dash (Plotly) |
| Charts | Plotly / Altair | D3.js |
| Backend | Python (pandas, scikit-learn) | Python + FastAPI |
| Data | DuckDB / SQLite | PostgreSQL |
| Deployment | Streamlit Cloud / Hugging Face | Docker + cloud |

---

## 7. Project Structure (Proposed)

```
hospitality-demand-shock/
├── data/
│   ├── raw/           # Ingested data
│   ├── processed/     # Transformed tables
│   └── synthetic/     # Portfolio demo data
├── pipelines/
│   ├── ingest/        # ETL scripts
│   ├── transform/     # dbt or Python transforms
│   └── dbt/           # (optional) dbt models
├── models/
│   ├── analytical/    # Pre-post, resilience, correlation
│   └── forecasting/   # Prophet, ARIMA, etc.
├── dashboard/
│   ├── app.py         # Streamlit/Dash entry
│   └── components/
├── docs/
│   ├── PROJECT_DESIGN.md   # This document
│   └── ARCHITECTURE.md     # Diagram export
├── config/
├── tests/
└── README.md
```

---

## 8. Success Criteria

| Criterion | Target |
|-----------|--------|
| Data pipeline | Automated ingest, idempotent, documented |
| Analytical model | Pre vs post deltas, resilience ranking, search–booking correlation |
| Forecasting model | Multi-horizon forecast with scenario comparison |
| Dashboard | Interactive, crisis selector, drill-down, forecast view |
| Domain accuracy | KPIs align with STR/UNWTO definitions |

---

## 9. References

- UNWTO Tourism Data Dashboard: https://www.unwto.org/market-intelligence
- STR / CoStar Benchmark: https://str.com/data-insights
- AltexSoft: RevPAR, ADR, Hotel Metrics — https://www.altexsoft.com/blog/revpar-occupancy-rate-adr-hotel-metrics/
- UNWTO: Impact of Russian offensive in Ukraine on tourism
- WTTC: Geopolitical conflict cost estimates

---

*Document prepared for portfolio project: Hospitality Demand Shock Analysis During War / Geopolitical Crisis*
