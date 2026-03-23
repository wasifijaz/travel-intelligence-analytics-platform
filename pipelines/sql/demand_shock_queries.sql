-- =============================================================================
-- Demand Shock Analytics - SQL Queries
-- Compatible with DuckDB and PostgreSQL
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PRE/POST CRISIS AGGREGATES (CTE for reuse)
-- -----------------------------------------------------------------------------
-- Replace :crisis_start, :pre_days, :post_days with actual values
-- Example: crisis_start = '2022-02-24', pre_days = 30, post_days = 30

WITH crisis_params AS (
    SELECT
        DATE '2022-02-24' AS crisis_start,
        30 AS pre_days,
        30 AS post_days
),
pre_crisis AS (
    SELECT
        destination_id,
        crisis_id,
        SUM(bookings) AS pre_bookings,
        SUM(cancellations) AS pre_cancellations,
        SUM(total_reservations) AS pre_total,
        SUM(COALESCE(search_demand, 0)) AS pre_searches,
        AVG(adr) AS pre_adr
    FROM daily_metrics dm
    CROSS JOIN crisis_params cp
    WHERE date BETWEEN (cp.crisis_start - cp.pre_days) AND (cp.crisis_start - 1)
    GROUP BY destination_id, crisis_id
),
post_crisis AS (
    SELECT
        destination_id,
        crisis_id,
        SUM(bookings) AS post_bookings,
        SUM(cancellations) AS post_cancellations,
        SUM(total_reservations) AS post_total,
        SUM(COALESCE(search_demand, 0)) AS post_searches,
        AVG(adr) AS post_adr
    FROM daily_metrics dm
    CROSS JOIN crisis_params cp
    WHERE date BETWEEN cp.crisis_start AND (cp.crisis_start + cp.post_days - 1)
    GROUP BY destination_id, crisis_id
),
pre_post AS (
    SELECT
        COALESCE(p.destination_id, po.destination_id) AS destination_id,
        COALESCE(p.crisis_id, po.crisis_id) AS crisis_id,
        p.pre_bookings,
        p.pre_cancellations,
        p.pre_total,
        p.pre_searches,
        p.pre_adr,
        po.post_bookings,
        po.post_cancellations,
        po.post_total,
        po.post_searches,
        po.post_adr
    FROM pre_crisis p
    FULL OUTER JOIN post_crisis po
        ON p.destination_id = po.destination_id AND p.crisis_id = po.crisis_id
)
-- -----------------------------------------------------------------------------
-- 2. DEMAND SHOCK METRICS (all four formulas)
-- -----------------------------------------------------------------------------
SELECT
    destination_id,
    crisis_id,
    pre_bookings,
    post_bookings,
    pre_searches,
    post_searches,
    pre_adr,
    post_adr,
    pre_cancellations::DOUBLE / NULLIF(pre_total, 0) AS pre_cancellation_rate,
    post_cancellations::DOUBLE / NULLIF(post_total, 0) AS post_cancellation_rate,

    -- Booking Change % = (Post - Pre) / Pre
    (post_bookings - pre_bookings)::DOUBLE / NULLIF(pre_bookings, 0) AS booking_change_pct,

    -- Search Change % = (Post - Pre) / Pre
    (post_searches - pre_searches)::DOUBLE / NULLIF(pre_searches, 0) AS search_change_pct,

    -- ADR Change % = (Post - Pre) / Pre
    (post_adr - pre_adr)::DOUBLE / NULLIF(pre_adr, 0) AS adr_change_pct,

    -- Cancellation Spike = Post Rate - Pre Rate
    (post_cancellations::DOUBLE / NULLIF(post_total, 0))
        - (pre_cancellations::DOUBLE / NULLIF(pre_total, 0)) AS cancellation_spike

FROM pre_post
WHERE pre_bookings > 0 OR post_bookings > 0;


-- -----------------------------------------------------------------------------
-- 3. TOP DESTINATIONS GAINING DEMAND
-- -----------------------------------------------------------------------------
WITH shock_metrics AS (
    -- Use the same CTE as above, or create a view
    SELECT 1 AS dummy
)
SELECT
    destination_id,
    booking_change_pct,
    pre_bookings,
    post_bookings
FROM (
    -- Subquery from metrics above; inline for brevity
    SELECT
        destination_id,
        (post_bookings - pre_bookings)::DOUBLE / NULLIF(pre_bookings, 0) AS booking_change_pct,
        pre_bookings,
        post_bookings
    FROM (
        SELECT destination_id,
               SUM(CASE WHEN date < '2022-02-24' THEN bookings ELSE 0 END) AS pre_bookings,
               SUM(CASE WHEN date >= '2022-02-24' THEN bookings ELSE 0 END) AS post_bookings
        FROM daily_metrics
        WHERE date BETWEEN '2022-01-25' AND '2022-03-25'
        GROUP BY destination_id
    ) x
    WHERE pre_bookings >= 10
) m
ORDER BY booking_change_pct DESC
LIMIT 10;


-- -----------------------------------------------------------------------------
-- 4. TOP DESTINATIONS LOSING DEMAND
-- -----------------------------------------------------------------------------
-- Same as above but ORDER BY booking_change_pct ASC LIMIT 10


-- -----------------------------------------------------------------------------
-- 5. DEMAND SUBSTITUTION (ranking of gainers vs losers)
-- -----------------------------------------------------------------------------
WITH shock AS (
    SELECT
        destination_id,
        (post_bookings - pre_bookings)::DOUBLE / NULLIF(pre_bookings, 0) AS booking_change_pct
    FROM (
        SELECT destination_id,
               SUM(CASE WHEN date < '2022-02-24' THEN bookings ELSE 0 END) AS pre_bookings,
               SUM(CASE WHEN date >= '2022-02-24' THEN bookings ELSE 0 END) AS post_bookings
        FROM daily_metrics
        WHERE date BETWEEN '2022-01-25' AND '2022-03-25'
        GROUP BY destination_id
    ) x
    WHERE pre_bookings >= 10
)
SELECT
    destination_id,
    booking_change_pct,
    CASE WHEN booking_change_pct > 0 THEN 'gaining' ELSE 'losing' END AS demand_direction,
    RANK() OVER (ORDER BY booking_change_pct DESC) AS substitution_rank
FROM shock;


-- -----------------------------------------------------------------------------
-- 6. DESTINATION RESILIENCE INDEX
-- -----------------------------------------------------------------------------
-- Formula: 0.35 * Booking Recovery + 0.25 * Search Demand + 0.20 * ADR Stability + 0.20 * (1 - Cancellation Spike)
-- All component scores in [0, 1]; higher = more resilient
WITH shock AS (
    SELECT
        destination_id,
        pre_bookings,
        post_bookings,
        pre_searches,
        post_searches,
        pre_adr,
        post_adr,
        pre_cancellations::DOUBLE / NULLIF(pre_total, 0) AS pre_cancel_rate,
        post_cancellations::DOUBLE / NULLIF(post_total, 0) AS post_cancel_rate
    FROM (
        SELECT destination_id,
               SUM(CASE WHEN date < '2022-02-24' THEN bookings ELSE 0 END) AS pre_bookings,
               SUM(CASE WHEN date >= '2022-02-24' THEN bookings ELSE 0 END) AS post_bookings,
               SUM(CASE WHEN date < '2022-02-24' THEN COALESCE(search_demand, 0) ELSE 0 END) AS pre_searches,
               SUM(CASE WHEN date >= '2022-02-24' THEN COALESCE(search_demand, 0) ELSE 0 END) AS post_searches,
               AVG(CASE WHEN date < '2022-02-24' THEN adr END) AS pre_adr,
               AVG(CASE WHEN date >= '2022-02-24' THEN adr END) AS post_adr,
               SUM(CASE WHEN date < '2022-02-24' THEN total_reservations ELSE 0 END) AS pre_total,
               SUM(CASE WHEN date >= '2022-02-24' THEN total_reservations ELSE 0 END) AS post_total,
               SUM(CASE WHEN date < '2022-02-24' THEN cancellations ELSE 0 END) AS pre_cancellations,
               SUM(CASE WHEN date >= '2022-02-24' THEN cancellations ELSE 0 END) AS post_cancellations
        FROM daily_metrics
        WHERE date BETWEEN '2022-01-25' AND '2022-03-25'
        GROUP BY destination_id
    ) x
    WHERE pre_bookings >= 10
),
scored AS (
    SELECT
        destination_id,
        LEAST(1, GREATEST(0, post_bookings::DOUBLE / NULLIF(pre_bookings, 0))) AS booking_recovery_score,
        CASE WHEN pre_searches > 0 THEN LEAST(1, GREATEST(0, post_searches::DOUBLE / pre_searches)) ELSE 0.5 END AS search_demand_score,
        LEAST(1, GREATEST(0, 1 + (post_adr - pre_adr) / NULLIF(pre_adr, 0))) AS adr_stability_score,
        LEAST(1, GREATEST(0, (post_cancel_rate - pre_cancel_rate))) AS cancellation_spike_raw
    FROM shock
)
SELECT
    destination_id,
    (0.35 * booking_recovery_score
     + 0.25 * search_demand_score
     + 0.20 * adr_stability_score
     + 0.20 * (1 - cancellation_spike_raw)) AS resilience_score,
    booking_recovery_score,
    search_demand_score,
    adr_stability_score,
    RANK() OVER (ORDER BY (0.35 * booking_recovery_score + 0.25 * search_demand_score + 0.20 * adr_stability_score + 0.20 * (1 - cancellation_spike_raw)) DESC) AS resilience_rank
FROM scored
ORDER BY resilience_rank;


-- -----------------------------------------------------------------------------
-- 7. CORRELATION BETWEEN SEARCHES AND BOOKINGS
-- -----------------------------------------------------------------------------
-- Pearson correlation (DuckDB): CORR(x, y)
-- For PostgreSQL: use CORR or aggregate with stats
SELECT
    destination_id,
    CORR(search_demand, bookings) AS pearson_r,
    COUNT(*) AS n
FROM daily_metrics
WHERE search_demand IS NOT NULL AND search_demand > 0
GROUP BY destination_id
HAVING COUNT(*) >= 10;


-- -----------------------------------------------------------------------------
-- 8. LAGGED CORRELATION (7-day lead: searches today → bookings in 7 days)
-- -----------------------------------------------------------------------------
WITH lagged AS (
    SELECT
        destination_id,
        date,
        search_demand,
        LEAD(bookings, 7) OVER (PARTITION BY destination_id ORDER BY date) AS bookings_lag7
    FROM daily_metrics
)
SELECT
    destination_id,
    CORR(search_demand, bookings_lag7) AS search_booking_corr_lag7,
    COUNT(*) AS n
FROM lagged
WHERE search_demand IS NOT NULL AND bookings_lag7 IS NOT NULL
GROUP BY destination_id
HAVING COUNT(*) >= 10;


-- -----------------------------------------------------------------------------
-- 9. FULL DEMAND SHOCK VIEW (reusable)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_demand_shock_metrics AS
WITH params AS (
    SELECT DATE '2022-02-24' AS crisis_start, 30 AS pre_days, 30 AS post_days
),
pre AS (
    SELECT destination_id, crisis_id,
           SUM(bookings) AS pre_bookings,
           SUM(cancellations) AS pre_cancellations,
           SUM(total_reservations) AS pre_total,
           SUM(COALESCE(search_demand, 0)) AS pre_searches,
           AVG(adr) AS pre_adr
    FROM daily_metrics, params
    WHERE date BETWEEN (crisis_start - pre_days) AND (crisis_start - 1)
    GROUP BY destination_id, crisis_id
),
post AS (
    SELECT destination_id, crisis_id,
           SUM(bookings) AS post_bookings,
           SUM(cancellations) AS post_cancellations,
           SUM(total_reservations) AS post_total,
           SUM(COALESCE(search_demand, 0)) AS post_searches,
           AVG(adr) AS post_adr
    FROM daily_metrics, params
    WHERE date BETWEEN crisis_start AND (crisis_start + 30)
    GROUP BY destination_id, crisis_id
)
SELECT
    COALESCE(p.destination_id, po.destination_id) AS destination_id,
    COALESCE(p.crisis_id, po.crisis_id) AS crisis_id,
    pre_bookings, post_bookings,
    pre_searches, post_searches,
    pre_adr, post_adr,
    pre_cancellations::DOUBLE / NULLIF(pre_total, 0) AS pre_cancellation_rate,
    post_cancellations::DOUBLE / NULLIF(post_total, 0) AS post_cancellation_rate,
    (post_bookings - pre_bookings)::DOUBLE / NULLIF(pre_bookings, 0) AS booking_change_pct,
    (post_searches - pre_searches)::DOUBLE / NULLIF(pre_searches, 0) AS search_change_pct,
    (post_adr - pre_adr)::DOUBLE / NULLIF(pre_adr, 0) AS adr_change_pct,
    (post_cancellations::DOUBLE / NULLIF(post_total, 0))
      - (pre_cancellations::DOUBLE / NULLIF(pre_total, 0)) AS cancellation_spike
FROM pre p
FULL OUTER JOIN post po ON p.destination_id = po.destination_id AND p.crisis_id = po.crisis_id;
