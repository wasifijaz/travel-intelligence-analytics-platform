-- =============================================================================
-- Hospitality Demand Shock Analysis - Database Schema
-- Compatible with DuckDB and PostgreSQL
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DESTINATIONS (Dimension)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS destinations (
    destination_id     VARCHAR(3) PRIMARY KEY,   -- ISO 3166-1 alpha-3
    destination_name   VARCHAR(100) NOT NULL,
    region             VARCHAR(50),
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. CRISIS_EVENTS (Dimension)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crisis_events (
    crisis_id          SERIAL PRIMARY KEY,       -- PostgreSQL; use INTEGER for DuckDB
    crisis_name        VARCHAR(100) NOT NULL,
    crisis_start_date   DATE NOT NULL,
    crisis_end_date     DATE,
    affected_regions   TEXT[],
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DuckDB alternative for crisis_events (no SERIAL):
-- CREATE TABLE crisis_events (
--     crisis_id          INTEGER PRIMARY KEY,
--     crisis_name        VARCHAR(100) NOT NULL,
--     crisis_start_date   DATE NOT NULL,
--     crisis_end_date     DATE,
--     affected_regions   VARCHAR[],  -- or TEXT
--     created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -----------------------------------------------------------------------------
-- 3. DAILY_METRICS (Fact)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_metrics (
    metric_id              SERIAL PRIMARY KEY,   -- optional; use for PostgreSQL
    date                   DATE NOT NULL,
    destination_id         VARCHAR(3) NOT NULL REFERENCES destinations(destination_id),
    crisis_id              INTEGER DEFAULT 0 REFERENCES crisis_events(crisis_id),
    
    -- Raw metrics (from ingestion)
    bookings               INTEGER NOT NULL DEFAULT 0,
    cancellations          INTEGER NOT NULL DEFAULT 0,
    total_reservations     INTEGER NOT NULL DEFAULT 0,  -- bookings + cancellations
    search_demand          DECIMAL(12, 4),
    adr                    DECIMAL(10, 2),
    room_nights            DECIMAL(10, 2) NOT NULL DEFAULT 0,
    
    -- Engineered features
    bookings_per_day       DECIMAL(10, 4) NOT NULL,
    cancellation_rate     DECIMAL(5, 4) NOT NULL,     -- 0.0000 to 1.0000
    search_to_booking_ratio DECIMAL(10, 4),
    adr_change            DECIMAL(10, 4),              -- % change vs baseline
    demand_change_percent DECIMAL(10, 4),
    normalized_demand_index DECIMAL(10, 4),            -- 100 = baseline
    
    -- Crisis context
    crisis_phase           VARCHAR(20),
    days_since_crisis     INTEGER,
    
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date, destination_id, crisis_id)
);

-- DuckDB: use composite primary key, no SERIAL
-- CREATE TABLE daily_metrics (
--     date                   DATE NOT NULL,
--     destination_id         VARCHAR(3) NOT NULL,
--     crisis_id              INTEGER,
--     ... same columns ...
--     PRIMARY KEY (date, destination_id, COALESCE(crisis_id, 0))
-- );

-- -----------------------------------------------------------------------------
-- 4. RAW STAGING TABLES (for ETL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_hotel_bookings (
    id                   SERIAL PRIMARY KEY,
    hotel                VARCHAR(50),
    is_canceled          SMALLINT,
    lead_time            INTEGER,
    arrival_date         DATE,
    stays_weekend_nights INTEGER,
    stays_week_nights    INTEGER,
    adults               INTEGER,
    children             INTEGER,
    country              VARCHAR(3),
    adr                  DECIMAL(10, 2),
    reservation_status   VARCHAR(20),
    ingested_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_search_demand (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    destination_id  VARCHAR(3) NOT NULL,
    searches        DECIMAL(12, 4),
    ingested_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 5. INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_destination ON daily_metrics(destination_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_crisis ON daily_metrics(crisis_id);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date_dest ON daily_metrics(date, destination_id);

-- -----------------------------------------------------------------------------
-- 6. BASELINE REFERENCE (for normalized_demand_index, adr_change)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS baseline_metrics (
    destination_id     VARCHAR(3) NOT NULL,
    crisis_id          INTEGER NOT NULL,
    baseline_start     DATE NOT NULL,
    baseline_end       DATE NOT NULL,
    avg_bookings       DECIMAL(12, 4),
    avg_adr            DECIMAL(10, 2),
    avg_demand         DECIMAL(12, 4),
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (destination_id, crisis_id)
);
