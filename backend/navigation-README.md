# Free navigation (web update 51, Android 6.1 compatible)

Navigation uses **openrouteservice / HeiGIT Standard**, with no HERE requests or paid fallback. The owner creates a free key at https://account.heigit.org/ and enters it in **Nawigacja → Połącz bezpłatną nawigację**. Existing HERE keys are not reused. Until the free key is configured, calculations remain disabled rather than fabricated.

Car/truck routing, distance/time, foreground GPS and voice guidance, favorites, toll-road/highway/ferry avoidance and fuel/per-kilometre budgets are available. The free provider does not return toll prices. Each route has an optional manual toll-budget amount, clearly distinguished from provider pricing; totals exclude tolls until an amount is entered. OSM toll annotations can be incomplete: absence of marked tollways is not a guarantee of zero charges. Strict avoidance requires complete toll annotations without paid spans. Access/restriction warnings block guidance. Unsupported tunnel/unpaved-road switches and tariff-only truck options are removed from the free UI.

Truck routing sends height, width and length in metres, actual weight and maximum axle load in tonnes, and vehicle_type=hgv. Drivers must confirm the profile and observe road signs. DMC is retained to validate actual weight; Euro/CO2/axle counts are not used to invent tariff estimates. Guidance pauses when IMPERIUM is hidden; no offline/background navigation is provided.

Deploy backend/navigation-free.sql after backend/navigation.sql. This additive migration overrides public navigation RPCs and stores the free key in a separate private table. Fixed endpoints use the current api.heigit.org/openrouteservice/v2/directions and api.heigit.org/pelias/v1/search; the deprecated API host is not used. Keys are never returned to clients. Role checks, user limits of 200/day and 20/minute, plus conservative shared-key limits of 1,900 route and 900 search requests/day and 35/minute each, stop excess calls. There is no automatic purchase or paid fallback. Provider quotas can also apply outside this app.

Tests cover GeoJSON, incomplete toll data, route restrictions, manual budgets, authenticated HTTP mapping, secret handling, shared quotas, GPS and mobile/desktop layouts. tests/free-navigation-db.sql rolls back all changes and issues no external requests, so it can validate production before activation. HTTP fixtures are CI-only and must never be deployed. Live service availability still needs the owner's free key; fixture tests do not establish this.

The free-navigation workflow validates and uploads the complete web package, verifies its bytes with authenticated download, then runs production migration/checks and update activation in one transaction. Existing Android 6.1 receives the web update without another APK installation.

Provider references, checked 2026-10-11:
- https://account.heigit.org/info/plans
- https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options
- https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/
- https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912
