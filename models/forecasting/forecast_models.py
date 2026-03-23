"""
Forecasting Models: SARIMA, Prophet, XGBoost
"""
import pandas as pd
import numpy as np
from typing import Optional, Tuple
from dataclasses import dataclass


@dataclass
class ForecastResult:
    """Forecast output with prediction intervals."""
    forecast: pd.Series
    lower: pd.Series
    upper: pd.Series
    model_name: str


# -----------------------------------------------------------------------------
# SARIMA
# -----------------------------------------------------------------------------
def forecast_sarima(
    ts: pd.Series,
    horizon: int = 90,
    order: Tuple[int, int, int] = (1, 0, 1),
    seasonal_order: Tuple[int, int, int, int] = (1, 0, 1, 7),
    alpha: float = 0.2,
) -> ForecastResult:
    """
    SARIMA forecast with prediction intervals.
    """
    try:
        from statsmodels.tsa.statespace.sarimax import SARIMAX
    except ImportError:
        raise ImportError("Install statsmodels: pip install statsmodels")

    ts_clean = ts.fillna(ts.mean()).dropna()
    if len(ts_clean) < 30:
        # Fallback: constant forecast
        last_val = ts_clean.iloc[-1]
        dates = pd.date_range(ts_clean.index[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
        return ForecastResult(
            forecast=pd.Series(last_val, index=dates),
            lower=pd.Series(last_val * 0.8, index=dates),
            upper=pd.Series(last_val * 1.2, index=dates),
            model_name="SARIMA",
        )

    model = SARIMAX(
        ts_clean,
        order=order,
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    fitted = model.fit(disp=False)
    fcast = fitted.get_forecast(steps=horizon)
    pred = fcast.predicted_mean
    ci = fcast.conf_int(alpha=alpha)

    return ForecastResult(
        forecast=pred,
        lower=ci.iloc[:, 0],
        upper=ci.iloc[:, 1],
        model_name="SARIMA",
    )


# -----------------------------------------------------------------------------
# Prophet
# -----------------------------------------------------------------------------
def forecast_prophet(
    ts: pd.Series,
    horizon: int = 90,
    interval_width: float = 0.8,
) -> ForecastResult:
    """
    Prophet forecast. Expects DatetimeIndex.
    """
    try:
        from prophet import Prophet
    except ImportError:
        raise ImportError("Install prophet: pip install prophet")

    df = ts.reset_index()
    df.columns = ["ds", "y"]
    df["ds"] = pd.to_datetime(df["ds"])
    df = df.dropna(subset=["y"])

    if len(df) < 7:
        last_val = df["y"].iloc[-1]
        dates = pd.date_range(df["ds"].iloc[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
        return ForecastResult(
            forecast=pd.Series(last_val, index=dates),
            lower=pd.Series(last_val * 0.8, index=dates),
            upper=pd.Series(last_val * 1.2, index=dates),
            model_name="Prophet",
        )

    m = Prophet(interval_width=interval_width, yearly_seasonality=False)
    m.fit(df)

    future = m.make_future_dataframe(periods=horizon)
    pred = m.predict(future)

    pred_tail = pred.tail(horizon).set_index("ds")
    return ForecastResult(
        forecast=pred_tail["yhat"],
        lower=pred_tail["yhat_lower"],
        upper=pred_tail["yhat_upper"],
        model_name="Prophet",
    )


# -----------------------------------------------------------------------------
# XGBoost (lag-based)
# -----------------------------------------------------------------------------
def forecast_xgboost(
    ts: pd.Series,
    horizon: int = 90,
    lags: Optional[list[int]] = None,
    alpha: float = 0.2,
) -> ForecastResult:
    """
    XGBoost time series forecast using recursive prediction with lag features.
    """
    try:
        import xgboost as xgb
    except ImportError:
        raise ImportError("Install xgboost: pip install xgboost")

    lags = lags or [1, 2, 3, 7, 14, 21]
    ts_clean = ts.fillna(ts.mean()).dropna()

    if len(ts_clean) < max(lags) + 10:
        last_val = ts_clean.iloc[-1]
        dates = pd.date_range(ts_clean.index[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
        return ForecastResult(
            forecast=pd.Series(last_val, index=dates),
            lower=pd.Series(last_val * 0.8, index=dates),
            upper=pd.Series(last_val * 1.2, index=dates),
            model_name="XGBoost",
        )

    # Build lag features
    X_list, y_list = [], []
    for i in range(max(lags), len(ts_clean)):
        row = [ts_clean.iloc[i - lag] for lag in lags]
        X_list.append(row)
        y_list.append(ts_clean.iloc[i])
    X = np.array(X_list)
    y = np.array(y_list)

    model = xgb.XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42)
    model.fit(X, y)

    # Recursive forecast
    hist = list(ts_clean.values)
    forecasts = []
    for _ in range(horizon):
        x = np.array([[hist[-lag] for lag in lags]])
        pred = model.predict(x)[0]
        pred = max(0, pred)  # non-negative
        forecasts.append(pred)
        hist.append(pred)

    dates = pd.date_range(ts_clean.index[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
    forecast_series = pd.Series(forecasts, index=dates)

    # Simple prediction intervals (assume ~20% width)
    std_est = np.std(forecasts) if len(forecasts) > 1 else forecast_series.mean() * 0.1
    z = 1.28  # ~80% interval
    lower = (forecast_series - z * std_est).clip(lower=0)
    upper = forecast_series + z * std_est

    return ForecastResult(
        forecast=forecast_series,
        lower=lower,
        upper=upper,
        model_name="XGBoost",
    )
