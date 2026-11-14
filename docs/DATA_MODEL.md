# Data Model — MARS//PATH

All shared TypeScript interfaces live in `/shared/types.ts` and are shared between Express backend engines and React frontend components.

## Core Entities
- **`Provenance`**: Attached to every dataset, target, evidence item, observation, route, and environmental summary (`sourceId`, `sourceName`, `mission`, `instrument`, `productId?`, `sourceUrl`, `retrievedAt`, `processing[]`, `license`, `attribution`, `status`, `confidence?`, `limitations[]`, `classification`: `VERIFIED_FACT | INFERENCE | ASSUMPTION | SIMULATION`).
- **`Dataset`**: Cataloged planetary layer (`id`, `name`, `type`, `mission`, `instrument`, `whatItShows`, `whyItMatters`, `spatialCoverage`, `temporalCoverage`, `resolution`, `crs`, `visualization`, `verifiedStatus`, `lastSynchronized`, `limitations[]`).
- **`Region`**: Study corridor (`gale-crater`) with `center`, `bbox`, `demCoverageBbox`, `crs`, `keyMissions[]`, and `provenance`.
- **`ObjectiveRule`**: Declarative rule set driving target convergence (`requiredEvidenceTypes`, `geologyKeywords`, `spectralKeywords`, `maxExclusionSlopeDeg`, `weights`, `anchorZones[]`).
- **`ScienceTarget` & `EvidenceCheck`**: Ranked `CANDIDATE_SITE` with transparent `score` (0–100), weighted `checks[]` (`criterion`, `required`, `passed`, `weight`, `contribution`, `recordId`, `recordSummary`, `provenance`), `whyHere[]`, `nearestRoverObservation`, and disclaimer.
- **`RoverObservation`**: Curiosity photo record with `sol`, `earthDate`, `instrument`, `imageUrl`, `located` boolean, `coordinates: [lon, lat] | null`, and `localizationMethod`.
- **`RouteCandidate` & `RouteWeights`**: Deterministic A* output (`feasible`, `blockedReason?`, `blockingConstraint?`, `geometry`, `distanceM`, `elevationGainM`, `elevationLossM`, `maxSlopeDeg`, `meanSlopeDeg`, `cumulativeCost`, `estimatedTimeMin`, `segments[]`, `waypoints[]`, `whyRoute[]`).
- **`MissionBrief`**: Reproducible Field Plan including `contentHash` (64-char SHA-256), `dataSources[]`, 5-part `limitations`, `nasaDisclaimer`, and optional `aiNarrative`.
- **`ApiErrorEnvelope`**: Structured error response (`code`, `message`, `source`, `retryable`).
