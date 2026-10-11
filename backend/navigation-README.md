# Navigation 6.1

Navigation is available to active IMPERIUM participants. It supports car and truck profiles, route comparison, toll estimates in PLN/EUR, distance/time, fuel and per-kilometre budgets, saved destinations and foreground GPS guidance.

## Connect HERE

The owner supplies their own HERE API key in **Nawigacja → Połącz HERE**. The account must have access to Routing API v8, Toll Costs and Geocoding & Search. Until configured, route calculation and address search are unavailable; no simulated routes or prices are substituted. HERE usage and toll calculation may incur provider charges.

Deploy `backend/navigation.sql` after the existing communications/social migrations. The production migration installs the Supabase `http` extension. The key is stored in `imperium_private.navigation_config`; authenticated clients cannot read it. Only the owner can replace or remove it. Public RPCs expose configuration status, address search and validated route calculation through fixed HERE endpoints. Active-user checks, a limit of 20 requests/minute and 200/day per user, and generic upstream errors apply. These are request limits, not a financial spending cap.

Truck measurements must be reviewed and confirmed. Dimensions are sent in centimetres and weights in kilograms, with axles, trailers, Euro class and CO2 class. Critical route restriction notices disable guidance. Avoiding tolls is a preference; **Tylko bezpłatne** additionally rejects routes with tolls, incomplete tariff information or toll-avoidance violations. Fare alternatives form a price range; repeated fare IDs across sections are counted once. Missing currency conversion or tariffs remain visibly incomplete.

## GPS and privacy

Android 6.1 (version code 17) requests location permission when GPS is started. It uses Android location services and Polish text-to-speech while IMPERIUM is visible, with rerouting on sustained deviation. Guidance pauses when the app is hidden. This is not offline or background navigation. Older APKs can plan routes but need the 6.1 APK for native GPS. Current positions are not stored in the application database or shared with other members. HERE receives route/search inputs needed for calculations; the map uses attributed OpenStreetMap tiles with normal HTTP caching and no offline downloads.

## Validation and release

`tests/navigation-core.cjs` checks polyline decoding, fare alternatives/deduplication, incomplete prices, costs and route restrictions. `tests/navigation-http.cjs` checks the proxy with a local HTTP fixture and role/quota checks. `tests/navigation-db.sql` uses a savepoint and rollback and is safe to run against production without issuing external requests. `tests/navigation-http-fixture.sql` is CI-only and must never be deployed. Browser tests mock routing and tiles and exercise setup, profiles, comparison, GPS, stale requests and mobile layout.

The navigation release workflow validates PostgreSQL, browser behavior and Android compilation before signing the APK. It uploads and verifies the web package before the migration and update activation transaction. Live HERE responses and tariffs still require verification with the owner's configured HERE account; fixture tests do not establish live provider availability.
