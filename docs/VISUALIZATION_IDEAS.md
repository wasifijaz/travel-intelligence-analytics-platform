# Demand Shock Analytics — Visualization Ideas

## 1. Shock Metrics Overview

### 1.1 KPI Cards (4 cards)
| Metric | Visualization | Notes |
|--------|----------------|-------|
| **Booking Change %** | Large number with ↑/↓ arrow, color (green/red) | Show overall or by selected destination |
| **Search Change %** | Same | Indicates intent shift |
| **ADR Change %** | Same | Pricing response |
| **Cancellation Spike** | Same (in pp, e.g. +5.2 pp) | Absolute rate change |

**Layout:** 4 equal-width cards in a row. Optional: sparkline of daily trend.

---

### 1.2 Pre vs Post Comparison Bar Chart
- **Type:** Grouped bar
- **X-axis:** Destination (or metric name)
- **Y-axis:** Value
- **Groups:** Pre-crisis | Post-crisis
- **Metrics:** Bookings, Searches, ADR (separate charts or faceted)

**Use case:** Compare pre/post levels side by side.

---

### 1.3 Waterfall Chart
- **Flow:** Pre-crisis baseline → Change → Post-crisis
- **Bars:** Booking Change %, Search Change %, ADR Change %, Cancellation Spike
- **Use case:** Show net impact of crisis on each metric.

---

## 2. Top Destinations Gaining / Losing Demand

### 2.1 Horizontal Bar Chart (Gainers)
- **Type:** Horizontal bar
- **X-axis:** booking_change_pct (%)
- **Y-axis:** destination_id (or destination_name)
- **Color:** Green gradient (darker = higher gain)
- **Sort:** Descending by booking_change_pct

### 2.2 Horizontal Bar Chart (Losers)
- **Same layout, color:** Red gradient
- **Sort:** Ascending (most negative first)

### 2.3 Diverging Bar Chart (Combined)
- **X-axis:** booking_change_pct (0 in center)
- **Left:** Losers (red)
- **Right:** Gainers (green)
- **Use case:** Single chart for both gainers and losers.

---

## 3. Demand Substitution Patterns

### 3.1 Ranked List / Table
- **Columns:** Rank, Destination, Booking Change %, Pre Bookings, Post Bookings, Direction (gaining/losing)
- **Sort:** By substitution_rank
- **Highlight:** Top 5 gainers, Top 5 losers

### 3.2 Bubble Chart
- **X-axis:** Pre-crisis bookings (or share)
- **Y-axis:** Booking Change %
- **Size:** Post-crisis bookings
- **Color:** Gaining (green) vs Losing (red)
- **Use case:** See which large destinations gained vs lost.

### 3.3 Sankey Diagram (if origin-destination data exists)
- **Flow:** Origin country → Destination (pre-crisis) vs Destination (post-crisis)
- **Use case:** Show flow diversion from affected to substitute destinations.

### 3.4 Heatmap: Destination × Time
- **Rows:** Destinations
- **Columns:** Week or month
- **Color:** Normalized demand index (e.g. 100 = baseline)
- **Use case:** Spot substitution over time (gainers light up post-crisis).

---

## 4. Correlation Between Searches and Bookings

### 4.1 Scatter Plot
- **X-axis:** search_demand (or search_demand lagged)
- **Y-axis:** bookings
- **Points:** One per (date, destination) or aggregated
- **Trend line:** Linear regression
- **Annotation:** Pearson r, R²

### 4.2 Lagged Scatter (7-day)
- **X-axis:** search_demand (date t)
- **Y-axis:** bookings (date t+7)
- **Use case:** Validate search as leading indicator.

### 4.3 Correlation by Destination (Bar Chart)
- **X-axis:** destination_id
- **Y-axis:** pearson_r
- **Color:** Positive (blue) vs Negative (red)
- **Use case:** Which destinations have strongest search→booking link.

### 4.4 Time Series Overlay
- **X-axis:** Date
- **Y-axis:** Dual axis — Searches (line 1) and Bookings (line 2)
- **Use case:** Visual alignment of search and booking trends.

---

## 5. Additional Ideas

### 5.1 Crisis Timeline
- **Gantt-style:** Crisis start, pre window, post window
- **Markers:** Key events (e.g. sanctions, flight bans)

### 5.2 Geographic Map (Choropleth)
- **Color:** booking_change_pct by country
- **Green:** Gainers
- **Red:** Losers
- **Use case:** Spatial view of demand shift.

### 5.3 Small Multiples
- **Grid:** One small chart per destination
- **Each:** Pre vs post bookings (or time series)
- **Use case:** Compare many destinations at once.

---

## 6. Recommended Tech Stack

| Tool | Use |
|------|-----|
| **Plotly** | Interactive scatter, bar, line, heatmap |
| **Altair** | Declarative, good for faceted charts |
| **Matplotlib/Seaborn** | Static publication-quality |
| **Streamlit** | Dashboard with filters (crisis, destination, date range) |

---

## 7. Dashboard Layout Suggestion

```
┌─────────────────────────────────────────────────────────────────┐
│  Demand Shock Analytics                    [Crisis ▼] [Dates ▼]  │
├─────────────────────────────────────────────────────────────────┤
│  [Booking Δ%]  [Search Δ%]  [ADR Δ%]  [Cancellation Spike]       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────┐  ┌────────────────────────────┐│
│  │ Top Gainers (bar)            │  │ Top Losers (bar)           ││
│  └─────────────────────────────┘  └────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Search vs Bookings (scatter + trend)                        │ │
│  │ Correlation: r = 0.XX                                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Substitution Ranking (table)                                │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```
