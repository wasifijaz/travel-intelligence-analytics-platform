"""Fast JSON serialization for DataFrames."""
import pandas as pd
import numpy as np
import json
from datetime import date, datetime


def dataframe_to_json(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to list of dicts, fast path using .to_dict('records')."""
    if df is None or df.empty:
        return []

    df = df.copy()

    for col in df.columns:
        dtype = df[col].dtype
        if pd.api.types.is_datetime64_any_dtype(dtype):
            df[col] = df[col].dt.strftime("%Y-%m-%d")
        elif dtype == object:
            df[col] = df[col].where(df[col].notna(), None)

    df = df.replace({np.nan: None, np.inf: None, -np.inf: None})

    for col in df.select_dtypes(include=[np.integer]).columns:
        df[col] = df[col].astype(object).where(df[col].notna(), None)
    for col in df.select_dtypes(include=[np.floating]).columns:
        df[col] = df[col].astype(object).where(df[col].notna(), None)

    return df.to_dict("records")
