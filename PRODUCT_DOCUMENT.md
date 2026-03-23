# Product Document - Travel Intelligence Platform

## Product Scope

The platform is designed for hospitality leaders to monitor travel demand, detect risk early, and take revenue-maximizing actions across pricing, inventory, channel, and market strategy.  
It combines bookings behavior, search intent, visa issuance, and flight accessibility into one decision layer.

## Global Decision Framework

The dashboard supports four executive questions:

1. **What is happening now?**  
   Current performance via bookings, room nights, demand, and conversion indicators.
2. **Why is it happening?**  
   Drivers from flights, visas, crisis events, and origin-destination behavior.
3. **What is likely next?**  
   Lead/lag metrics, shock trends, and elasticity signals.
4. **What should leadership do?**  
   Dynamic executive summary and action panel recommendations.

## Dashboard Modules and Business Use

### 1) Executive Overview (`/`)
**Purpose:** Operational health and top-line market movement.

- **KPIs visualized**
  - Total bookings
  - Total room nights
  - Search demand
  - ADR and demand changes
- **Core visuals**
  - Time-series trends (bookings, search, ADR, room nights)
  - Funnel and substitution behavior
  - Cross-market comparisons
- **Leadership usage**
  - Confirm if demand pace supports rate uplift.
  - Detect booking slowdown before occupancy misses.
  - Reallocate budget to markets with stronger demand growth.

### 2) Global Crisis & Forecast (`/global-crisis`)
**Purpose:** Quantify disruption impact and recovery pace.

- **KPIs visualized**
  - Booking change %
  - Search change %
  - ADR change %
  - Cancellation spike
  - Recovery progression
- **Core visuals**
  - Crisis timeline overlays
  - Pre/post impact charts
  - Recovery trajectories
- **Leadership usage**
  - Trigger risk playbooks by destination.
  - Protect downside with pricing/cancellation policy updates.
  - Plan recovery-phase promotions based on rebound velocity.

### 3) Hotel Chains (`/hotel-chains`)
**Purpose:** Hotel operator revenue management lens.

- **KPIs visualized**
  - Occupancy proxy
  - ADR trend and volatility
  - RevPAR-style performance indicators
  - Cancellation pressure
- **Core visuals**
  - Performance cards and trend lines
  - Destination risk/return comparisons
- **Leadership usage**
  - Optimize pricing by demand tier and risk status.
  - Protect margin by balancing occupancy versus ADR.
  - Reforecast staffing and inventory by demand regime.

### 4) OTA Dashboard (`/ota`)
**Purpose:** Distribution efficiency and conversion management.

- **KPIs visualized**
  - Search demand
  - Conversion proxy metrics
  - Channel-level demand shifts
- **Core visuals**
  - Funnel and conversion trend views
  - Market/channel movement analysis
- **Leadership usage**
  - Shift spend toward high-conversion feeder markets.
  - Identify leakage between search and booking stages.
  - Reduce dependency on weak-performing channels.

### 5) DMC & TMC (`/tmc-dmc`)
**Purpose:** B2B travel intermediary demand and corridor planning.

- **KPIs visualized**
  - Corridor demand movement
  - Market resilience and volatility
- **Core visuals**
  - Route/corridor performance visuals
  - Comparative demand maps
- **Leadership usage**
  - Negotiate corridor capacity and partner terms.
  - Prioritize contracts where demand and margin align.

### 6) Travel Tech (`/travel-tech`)
**Purpose:** Traveler behavior and booking pattern diagnostics.

- **KPIs visualized**
  - Lead-time changes
  - Demand volatility signals
  - Behavioral trend indicators
- **Core visuals**
  - Behavioral trend charts
  - Segment-level movement views
- **Leadership usage**
  - Tune booking windows and campaign timing.
  - Identify friction points in traveler decision cycles.

### 7) Market Intelligence (`/market-intel`)
**Purpose:** Comparative destination momentum and opportunity scanning.

- **KPIs visualized**
  - Relative booking momentum
  - Risk-adjusted demand trends
- **Core visuals**
  - Ranking and comparison visuals
  - Growth/decline movement views
- **Leadership usage**
  - Rebalance market mix to maximize expected revenue.
  - Reduce concentration risk in fragile destinations.

### 8) Stock Market Analysis (`/stock-analysis`)
**Purpose:** Macro and sentiment context for demand planning.

- **KPIs visualized**
  - Market sentiment proxies and directional movement
- **Core visuals**
  - Financial trend overlays with demand context
- **Leadership usage**
  - Align pricing and investment pace with macro confidence.
  - Stress-test demand plans under risk-off conditions.

### 9) Raw Metrics (`/metrics`)
**Purpose:** Data quality and transparency layer for analysts.

- **KPIs visualized**
  - Row-level daily metrics (`date`, `destination`, `bookings`, `search_demand`, `adr`, `room_nights`)
- **Core visuals**
  - Filtered table and date controls
- **Leadership usage**
  - Validate assumptions behind executive KPIs.
  - Audit anomalies before high-impact decisions.

### 10) Travel Demand Intelligence (`/travel-demand-intelligence`)
**Purpose:** End-to-end demand engine from intent to revenue.

#### Core KPI blocks
- **Flights**
  - Flights total, seat capacity, load factor %, airfare index, flights growth
  - **Decision value:** Supply expectations, route readiness, and pricing headroom.
- **Visas**
  - Applications, issued, approval/rejection %, processing time, visa growth (WoW/YoY)
  - **Decision value:** Early intent signal and policy friction diagnostics.
- **Bookings**
  - Total bookings, room nights, bookings growth
  - **Decision value:** Revenue capture and conversion health.
- **Conversion**
  - Visa-to-booking %, Search-to-visa %
  - **Decision value:** Funnel leakage detection and campaign correction.
- **Supply vs demand**
  - Capacity vs demand gap
  - **Decision value:** Identify oversupply risk or inventory shortfall.

#### Visual and insight modules
- **Executive Summary**
  - Multi-sentence decision narrative for the current filter scope.
  - **Leadership use:** Immediate strategic briefing for commercial calls.
- **Global Travel Market Pulse**
  - Multi-line story combining trend state, crisis context, short/medium-term expectation, and action posture.
  - **Leadership use:** Single narrative for board and executive updates.
- **Demand Funnel**
  - Searches -> Visa applications -> Flights -> Bookings -> Stay proxy.
  - **Leadership use:** Locate conversion bottlenecks and allocate spend.
- **Lead Indicators**
  - Flights and visa lead windows (T-15/T-30/T-60 where applicable).
  - **Leadership use:** Anticipate demand before bookings fully materialize.
- **Supply vs Demand**
  - Seat capacity vs bookings + load factor trend.
  - **Leadership use:** Adjust pricing, promotions, and inventory release.
- **Market Health**
  - Composite growth across flights, visas, bookings.
  - **Leadership use:** Prioritize markets with healthier fundamentals.
- **Route / Origin Analysis**
  - Flights by route, visa applications by origin country.
  - **Leadership use:** Focus acquisition and partnerships by source strength.
- **Lead & Lag (Advanced)**
  - Lead windows + booking lag from visa.
  - **Leadership use:** Time campaigns and inventory to conversion cadence.
- **Visa Intelligence**
  - Approval quality, processing friction, growth velocity.
  - **Leadership use:** Forecast arrival timing and demand reliability.
- **Elasticity & Shock Propagation**
  - Flights-vs-bookings elasticity and indexed visa/flight/booking shocks.
  - **Leadership use:** Quantify sensitivity and stress propagation risk.
- **Action Panel**
  - Dynamic recommendations (pricing, marketing, inventory, risk mitigation).
  - **Leadership use:** Directly executable commercial actions.

## Filter Logic and Interactions

Global filters shared across pages:
- Date range (`date_from`, `date_to`)
- Destination
- Crisis event (`crisis_id`)
- Source market
- Travel type

Travel Demand Intelligence behavior:
- If date is not selected, default range is `2026-01-01` to `2026-12-31`.
- Crisis filtering is applied safely via context-aware windows, without forcing booking rows to zero.
- Metrics and narratives are computed in the same filtered context to keep charts and stories consistent.

## Crisis Event Handling

- Crisis definitions are maintained in `crisis_events`.
- Crisis selection influences trend interpretation and effective analytical windows.
- Bookings, flights, visas, and advanced sections remain populated under valid context.
- Narrative modules explicitly mention crisis context when active.

## Executive Narrative and Action Panel Standards

### Executive Summary
- 3-5 sentences, multi-line narrative.
- Includes:
  - current state (bookings, flights, visas),
  - trend explanation,
  - lead/lag interpretation,
  - opportunities and risks,
  - strategic commentary.

### Global Travel Market Pulse
- 3-5 sentence multi-line pulse.
- Includes:
  - demand state,
  - crisis impact framing,
  - short-term and medium-term expectation,
  - leadership action posture.

### Action Panel
- Dynamic recommendation set (3-5 actions).
- Typical strategy classes:
  - pricing optimization,
  - demand stimulation,
  - inventory positioning,
  - market risk mitigation,
  - conversion acceleration.

## Data Dependencies

- `daily_metrics` - bookings, room nights, search demand, ADR, behavior fields
- `fact_flights` - route-level accessibility and supply indicators
- `fact_visas` - intent and policy-friction indicators
- `crisis_events` - event windows and contextual overlays
- optional external snapshots in `data/raw`

## Travel Demand API Endpoints

- `GET /api/travel-demand-intelligence`
- `GET /api/travel-demand-intelligence/summary`

Supported query params:
- `date_from`, `date_to`, `destination`, `crisis_id`, `source_market`, `travel_type`

## Product Outcome for Hospitality Leaders

Using this dashboard, leadership teams can:
- Increase revenue by raising rates where intent and accessibility are rising.
- Protect occupancy by identifying conversion lag early and activating campaigns.
- Reduce crisis downside through risk-aware market and inventory reallocation.
- Improve forecast confidence with lead/lag and shock-propagation evidence.
- Turn analytics into action through narrative summaries and recommendation panels.
