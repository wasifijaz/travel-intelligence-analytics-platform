-- =============================================================================
-- Hospitality Demand Shock Analysis - DuckDB Schema
-- DuckDB-specific (no SERIAL, simplified types)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DESTINATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS destinations (
    destination_id     VARCHAR PRIMARY KEY,
    destination_name   VARCHAR NOT NULL,
    region             VARCHAR,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. CRISIS_EVENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crisis_events (
    crisis_id          INTEGER PRIMARY KEY,
    crisis_name        VARCHAR NOT NULL,
    crisis_start_date   DATE NOT NULL,
    crisis_end_date     DATE,
    affected_regions   VARCHAR,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. DAILY_METRICS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_metrics (
    date                   DATE NOT NULL,
    destination_id         VARCHAR NOT NULL,
    crisis_id              INTEGER,
    
    bookings               INTEGER DEFAULT 0,
    cancellations          INTEGER DEFAULT 0,
    total_reservations     INTEGER DEFAULT 0,
    search_demand          DOUBLE,
    adr                    DOUBLE,
    room_nights            DOUBLE DEFAULT 0,
    
    bookings_per_day       DOUBLE NOT NULL,
    cancellation_rate     DOUBLE NOT NULL,
    search_to_booking_ratio DOUBLE,
    adr_change            DOUBLE,
    demand_change_percent  DOUBLE,
    normalized_demand_index DOUBLE,
    
    crisis_phase           VARCHAR,
    days_since_crisis     INTEGER,
    
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (date, destination_id, COALESCE(crisis_id, 0))
);

-- -----------------------------------------------------------------------------
-- 4. RAW STAGING
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_hotel_bookings (
    hotel                VARCHAR,
    is_canceled          INTEGER,
    lead_time            INTEGER,
    arrival_date         DATE,
    stays_weekend_nights INTEGER,
    stays_week_nights    INTEGER,
    adults               INTEGER,
    children             INTEGER,
    country              VARCHAR,
    adr                  DOUBLE,
    reservation_status   VARCHAR,
    ingested_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_search_demand (
    date            DATE NOT NULL,
    destination_id  VARCHAR NOT NULL,
    searches        DOUBLE,
    ingested_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 5. FORECASTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forecast_output (
    date            DATE NOT NULL,
    destination_id  VARCHAR,
    metric          VARCHAR NOT NULL,
    model           VARCHAR NOT NULL,
    forecast        DOUBLE NOT NULL,
    lower           DOUBLE,
    upper           DOUBLE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forecast_accuracy (
    metric          VARCHAR NOT NULL,
    model           VARCHAR NOT NULL,
    mae             DOUBLE,
    rmse            DOUBLE,
    mape            DOUBLE,
    mase            DOUBLE,
    n               INTEGER,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crisis_recovery_timeline (
    destination_id      VARCHAR NOT NULL,
    crisis_start        DATE NOT NULL,
    baseline_level      DOUBLE,
    trough_level        DOUBLE,
    trough_date         DATE,
    recovery_50_date    DATE,
    recovery_90_date    DATE,
    recovery_100_date   DATE,
    days_to_50          INTEGER,
    days_to_90          INTEGER,
    days_to_100         INTEGER,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 6. BASELINE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseline_metrics (
    destination_id     VARCHAR NOT NULL,
    crisis_id          INTEGER NOT NULL,
    baseline_start     DATE NOT NULL,
    baseline_end       DATE NOT NULL,
    avg_bookings       DOUBLE,
    avg_adr            DOUBLE,
    avg_demand         DOUBLE,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (destination_id, crisis_id)
);
