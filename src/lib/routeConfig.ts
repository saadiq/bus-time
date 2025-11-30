/**
 * Route-specific configuration for bus lines that need special handling
 * This centralizes hardcoded route logic that was previously scattered in the codebase
 */

import { BusStop } from '@/types';

interface RouteConfig {
  /** Patterns to match the bus line ID */
  idPatterns: string[];
  /** Filter function to determine if a stop matches this route type */
  stopFilter?: (stop: BusStop) => boolean;
  /** Description for debugging/documentation */
  description: string;
}

/**
 * Configuration for routes with special handling requirements
 */
export const ROUTE_CONFIGS: RouteConfig[] = [
  {
    idPatterns: ['B44+'],
    stopFilter: (stop) => stop.direction.includes('SBS'),
    description: 'B44 Select Bus Service - only match SBS stops',
  },
  {
    idPatterns: ['B48'],
    stopFilter: (stop) =>
      stop.direction.includes('LEFFERTS GARDENS') ||
      stop.direction.includes('GREENPOINT'),
    description: 'B48 - match Lefferts Gardens or Greenpoint direction stops',
  },
];

/**
 * Get the stop filter function for a given bus line ID
 * Returns undefined if no special filtering is needed
 */
export function getStopFilterForRoute(busLineId: string): ((stop: BusStop) => boolean) | undefined {
  const config = ROUTE_CONFIGS.find(c =>
    c.idPatterns.some(pattern => busLineId.includes(pattern))
  );
  return config?.stopFilter;
}
