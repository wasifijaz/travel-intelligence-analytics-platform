# Dashboard Wireframe — Detailed Layout

## Page 1: Overview

### Header Bar
| Element | Specification |
|---------|---------------|
| Title | "Hospitality Demand Shock Analysis" |
| Crisis dropdown | Options: Russia-Ukraine (Feb 2022), Israel-Gaza (Oct 2023), Iran Tensions (2024), All |
| Date range | Start date — End date (default: 6 months pre to 12 months post crisis) |
| Export | Button: Export to CSV/PDF |

---

### Section A: KPI Cards (6 cards)

| Card | Metric | Sub-metric | Color logic |
|------|--------|------------|-------------|
| 1 | Bookings | Δ vs pre-crisis baseline | Red if < -10%, Green if > 0% |
| 2 | Cancellations | Δ vs pre-crisis baseline | Red if > +20% |
| 3 | Searches | Δ vs pre-crisis baseline | Same as bookings |
| 4 | ADR | Δ vs pre-crisis baseline | Red if < -5% |
| 5 | Room Nights | Δ vs pre-crisis baseline | Same as bookings |
| 6 | RevPAR | Δ vs pre-crisis baseline | Red if < -10% |

**Layout:** 6 equal-width cards, responsive grid (2×3 on desktop, 1×6 on mobile).

---

### Section B: Demand Index Chart

**Type:** Multi-line time series  
**X-axis:** Date  
**Y-axis:** Index (100 = pre-crisis 30-day average)  
**Lines:** Bookings, Cancellations, Searches, ADR, Room Nights  
**Annotations:** Vertical line at crisis start date  
**Interactions:** Toggle lines on/off, zoom, pan  

---

### Section C: Pre vs Post Comparison

**Type:** Grouped bar chart  
**X-axis:** Metric (Bookings, Cancellations, Searches, ADR, Room Nights, RevPAR)  
**Y-axis:** Value or % change  
**Groups:** Pre-crisis (30d avg) | Post-crisis (30d avg) | Δ%  
**Filter:** Country / Region dropdown  
**Optional:** Side-by-side or stacked  

---

### Section D: Resilience Ranking

**Left:** Horizontal bar chart — Top 10 most resilient destinations (by composite score)  
**Right:** Choropleth map — Countries colored by resilience score (green = resilient, red = impacted)  
**Score definition:** Weighted: (1) Recovery speed, (2) % change from baseline, (3) Volatility  

---

### Section E: Search → Booking Correlation

**Type:** Scatter plot  
**X-axis:** Search volume (with optional lag: 0, 7, 14 days)  
**Y-axis:** Bookings  
**Points:** One per destination × date  
**Display:** Pearson r, Spearman ρ, R²  
**Interaction:** Lag selector dropdown  

---

### Section F: Forecast

**Type:** Line chart with confidence band  
**X-axis:** Date  
**Y-axis:** Demand (bookings or room nights)  
**Elements:** Historical (solid), Forecast (dashed), 80% CI (shaded), 95% CI (lighter)  
**Toggle:** Crisis scenario vs No-crisis scenario  
**Horizon selector:** 7 days | 30 days | 90 days  

---

### Section G: Destination Drill-Down Table

| Column | Sortable | Filter |
|--------|----------|--------|
| Country | ✓ | ✓ |
| Region | ✓ | ✓ |
| Bookings Δ% | ✓ | — |
| Cancellations Δ% | ✓ | — |
| ADR Δ% | ✓ | — |
| Room Nights Δ% | ✓ | — |
| RevPAR Δ% | ✓ | — |
| Resilience Score | ✓ | ✓ |
| Search-Book Correlation | ✓ | — |

**Interactions:** Click row → filter other charts to that country.

---

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| Desktop (≥1200px) | 2-column charts, full table |
| Tablet (768–1199px) | 1-column charts, scrollable table |
| Mobile (<768px) | Stacked, KPI cards 1-col, collapsible sections |

---

## Color Palette (Suggested)

| Use | Color |
|-----|-------|
| Pre-crisis | #4A90D9 (blue) |
| Post-crisis | #E94B3C (red) |
| Resilient | #50C878 (green) |
| Impacted | #FF6B6B (coral) |
| Neutral | #6B7280 (gray) |
| Crisis marker | #F59E0B (amber) |
