"""
Sync HTTP server for the Hospitality Dashboard API.
Uses Python's built-in http.server with ThreadingMixin for reliable Windows support.

Routing:
- Requests with no query params → return pre-cached bytes (zero-cost)
- Requests with filter params → compute_filtered_response() on the fly
"""
import sys
import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

from api.data_cache import (
    refresh_cache,
    compute_filtered_response,
    json_health, json_summary, json_crisis, json_timeline,
    json_analytics, json_metrics, json_destinations,
    json_forecast_recovery, json_forecast_accuracy,
    json_kpis_hotel, json_kpis_ota, json_risk_index,
    json_corridor, json_funnel, json_prepost,
    json_forecast_dataset, json_timeline_by_dest,
    json_behavior, json_travel_flows, json_source_markets,
)
from api.travel_demand_intel import (
    json_travel_demand_intel,
    json_travel_demand_summary,
    refresh_travel_demand_cache,
)

refresh_cache()
refresh_travel_demand_cache()

# Fast-path routes: endpoint key → cached-bytes accessor
ROUTES = {
    "/api/health": json_health,
    "/api/summary": json_summary,
    "/api/crisis-events": json_crisis,
    "/api/timeline": json_timeline,
    "/api/analytics": json_analytics,
    "/api/metrics": json_metrics,
    "/api/destinations": json_destinations,
    "/api/forecast/recovery": json_forecast_recovery,
    "/api/forecast/accuracy": json_forecast_accuracy,
    "/api/kpis/hotel": json_kpis_hotel,
    "/api/kpis/ota": json_kpis_ota,
    "/api/risk-index": json_risk_index,
    "/api/corridor": json_corridor,
    "/api/funnel": json_funnel,
    "/api/prepost": json_prepost,
    "/api/forecast/dataset": json_forecast_dataset,
    "/api/timeline-by-dest": json_timeline_by_dest,
    "/api/behavior": json_behavior,
    "/api/travel-flows": json_travel_flows,
    "/api/source-markets": json_source_markets,
    "/api/travel-demand/intelligence": json_travel_demand_intel,
    "/api/travel-demand-intelligence": json_travel_demand_intel,
    "/api/travel-demand-intelligence/summary": json_travel_demand_summary,
}

PATH_TO_ENDPOINT = {
    "/api/health": "health",
    "/api/summary": "summary",
    "/api/crisis-events": "crisis-events",
    "/api/timeline": "timeline",
    "/api/analytics": "analytics",
    "/api/metrics": "metrics",
    "/api/destinations": "destinations",
    "/api/forecast/recovery": "forecast/recovery",
    "/api/forecast/accuracy": "forecast/accuracy",
    "/api/forecast/dataset": "forecast/dataset",
    "/api/kpis/hotel": "kpis/hotel",
    "/api/kpis/ota": "kpis/ota",
    "/api/risk-index": "risk-index",
    "/api/corridor": "corridor",
    "/api/funnel": "funnel",
    "/api/prepost": "prepost",
    "/api/timeline-by-dest": "timeline-by-dest",
    "/api/behavior": "behavior",
    "/api/travel-flows": "travel-flows",
    "/api/source-markets": "source-markets",
    "/api/travel-demand/intelligence": "travel-demand/intelligence",
    "/api/travel-demand-intelligence": "travel-demand/intelligence",
    "/api/travel-demand-intelligence/summary": "travel-demand-intelligence/summary",
}

FILTER_PARAMS = frozenset({"date_from", "date_to", "destination", "crisis_id", "source_market", "travel_type"})


def _parse_filters(query_string: str) -> dict:
    """Extract recognized filter params from the URL query string."""
    qs = parse_qs(query_string, keep_blank_values=False)
    filters = {}
    for key in FILTER_PARAMS:
        val = qs.get(key)
        if val:
            filters[key] = val[0]
    if "crisis_id" in filters:
        try:
            filters["crisis_id"] = int(filters["crisis_id"])
        except (ValueError, TypeError):
            del filters["crisis_id"]
    return filters


class APIHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = (parsed.path.rstrip("/") or "/")

        handler = ROUTES.get(path)

        if handler is None:
            self._send_json(404, b'{"detail":"Not found"}')
            return

        filters = _parse_filters(parsed.query)
        if filters:
            endpoint_key = PATH_TO_ENDPOINT.get(path)
            if endpoint_key:
                body = compute_filtered_response(
                    endpoint=endpoint_key,
                    date_from=filters.get("date_from"),
                    date_to=filters.get("date_to"),
                    destination=filters.get("destination"),
                    crisis_id=filters.get("crisis_id"),
                    source_market=filters.get("source_market"),
                    travel_type=filters.get("travel_type"),
                )
            else:
                body = handler()
        else:
            body = handler()

        self._send_json(200, body)

    def do_POST(self):
        if self.path == "/api/refresh":
            refresh_cache()
            refresh_travel_demand_cache()
            self._send_json(200, json_health())
        else:
            self.send_response(404)
            self._cors_headers()
            self.end_headers()

    def _send_json(self, code: int, body: bytes):
        self.send_response(code)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def log_message(self, format, *args):
        logging.getLogger("http").info(format % args)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    server = ThreadedHTTPServer(("0.0.0.0", 8080), APIHandler)
    print("API running on http://localhost:8080")
    print("  Travel Demand Intelligence: GET /api/travel-demand/intelligence")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()
