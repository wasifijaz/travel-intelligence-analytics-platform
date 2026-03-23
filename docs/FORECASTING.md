# Forecasting Module

## Overview

Predict hotel demand after crisis events for:
- **Bookings**
- **Search demand**
- **ADR**
- **Cancellations**

## Models

| Model | Use Case | Prediction Intervals |
|-------|----------|----------------------|
| **SARIMA** | Seasonal patterns, small data | Yes (statsmodels) |
| **Prophet** | Trend + seasonality, robust | Yes (built-in) |
| **XGBoost** | Non-linear, lag features | Yes (estimated) |

## Pipeline Steps

1. **Time series decomposition** — Trend, seasonal, residual (statsmodels)
2. **Seasonality detection** — ACF-based period (7, 14, 30 days)
3. **Train/test split** — Last 30 days = test
4. **Model evaluation** — MAE, RMSE, MAPE, MASE
5. **Forecast next 90 days** — With lower/upper bounds

## Output

| File | Description |
|------|-------------|
| `forecast_dataset.csv` | date, metric, model, forecast, lower, upper |
| `forecast_accuracy.csv` | metric, model, mae, rmse, mape, mase, n |
| `crisis_recovery_timeline.csv` | destination, days_to_50, days_to_90, days_to_100 |

## Crisis Impact Forecast

**Recovery timeline** per destination:
- `baseline_level` — Pre-crisis 30-day average
- `trough_level` — Minimum post-crisis
- `recovery_50_date` — First date reaching 50% of baseline
- `recovery_90_date` — First date reaching 90%
- `recovery_100_date` — Full recovery
- `estimated_days_to_50/90/100` — Days from crisis start

## Usage

```bash
# Run pipeline first
python run_pipeline.py

# Run forecasting
python models/run_forecast.py
```

```python
from models.forecasting import run_forecast_pipeline, compute_recovery_timeline

result = run_forecast_pipeline(
    df,
    metrics=["bookings", "search_demand", "adr", "cancellations"],
    horizon=90,
    models=["Prophet", "XGBoost", "SARIMA"],
)

recovery = compute_recovery_timeline(df, crisis_start_date="2022-02-24")
```
