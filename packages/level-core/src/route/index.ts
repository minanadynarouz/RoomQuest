/**
 * Hybrid route helpers: code builds valid routes over {@link routeLinks};
 * Gemini only picks a route id and decorates it (applyDecoration).
 */
export { routeLinks, cheapestRoute, hopBetween } from './route-links';
export type { RouteLink, RouteLinkMap, RouteLinksOptions } from './route-links';
export { candidateRoutes, HAZARD_TYPES } from './candidates';
export type {
  CandidateRoute,
  CandidateRoutesOptions,
  HazardType,
  RouteOptions,
} from './candidates';
export { repairRoute } from './repair-route';
export type { RepairRouteOptions, RepairRouteResult } from './repair-route';
export {
  applyDecoration,
  MAX_DECORATION_LINE_CHARS,
  MAX_DECORATION_LINES,
  sanitizeDecorationLines,
} from './decoration';
export type {
  ApplyDecorationResult,
  DecorationLine,
  LevelDecoration,
} from './decoration';
