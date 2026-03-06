import { useMemo, useCallback } from 'react';
import { BusStop, Direction } from '@/types';
import { calculateDistance } from '@/lib/geo';
import { getStopFilterForRoute } from '@/lib/routeConfig';

// Memoized stop normalization for matching
export const useStopNormalization = () => {
  return useCallback((name: string): string[] => {
    // Remove common prefixes and normalize abbreviations
    const withoutPrefix = name.replace(/^SBS\s+/, '').replace(/^[A-Z]\d+\s+/, '');

    const withNormalizedAbbrev = withoutPrefix
      .replace(/\bWLMSBRG\b/gi, 'WILLIAMSBURG')
      .replace(/\bBRDG\b/gi, 'BRIDGE')
      .replace(/\bPLZ\b/gi, 'PLAZA')
      .replace(/\bNSTRND\b/gi, 'NOSTRAND')
      .replace(/\bRGRS\b/gi, 'ROGERS')
      .replace(/\bMKR\b/gi, 'MEEKER')
      .replace(/\bAV\b/gi, 'AVENUE')
      .replace(/\bST\b/gi, 'STREET');

    // Convert to lowercase and split on slash
    const parts = withNormalizedAbbrev.toLowerCase().split('/');

    // Process each street name
    return parts.map(part => {
      // Remove common suffixes and normalize spaces
      return part
        .replace(/(avenue|ave|av)$/g, '')
        .replace(/(street|str|st)$/g, '')
        .replace(/(road|rd)$/g, '')
        .replace(/(place|pl)$/g, '')
        .replace(/(boulevard|blvd)$/g, '')
        .replace(/\s+/g, '')
        .trim();
    }).filter(Boolean);
  }, []);
};

// Memoized direction stops calculation
export const useDirectionStops = (
  stops: BusStop[],
  directions: Direction[],
  selectedDirection: string
) => {
  return useMemo(() => {
    const direction = directions.find(d => d.id === selectedDirection);

    const sortStopsBySequence = (stopsToSort: BusStop[]) => {
      return [...stopsToSort].sort((a, b) => a.sequence - b.sequence);
    };

    const groupAndSortByDirection = (stopsToGroup: BusStop[]) => {
      const groups: Record<string, BusStop[]> = {};
      stopsToGroup.forEach(stop => {
        if (!groups[stop.direction]) groups[stop.direction] = [];
        groups[stop.direction].push(stop);
      });
      return Object.values(groups).flatMap(dirStops => sortStopsBySequence(dirStops));
    };

    if (!direction) {
      if (directions.length === 0) {
        return groupAndSortByDirection(stops);
      }
      if (directions.length > 0) {
        return sortStopsBySequence(stops.filter(s => s.direction === directions[0].name));
      }
      return [];
    }

    const filteredStops = stops.filter(stop => stop.direction === direction.name);

    if (filteredStops.length === 0) {
      const allDirectionNames = [...new Set(stops.map(s => s.direction))];
      const similarDirection = allDirectionNames.find(
        dirName => dirName.includes(direction.name) || direction.name.includes(dirName)
      );

      if (similarDirection) {
        return sortStopsBySequence(stops.filter(s => s.direction === similarDirection));
      }

      if (stops.length > 0) {
        return groupAndSortByDirection(stops);
      }
    }

    return sortStopsBySequence(filteredStops);
  }, [stops, directions, selectedDirection]);
};

// Memoized bus status calculation
export const useBusStatus = (enableCutoff: boolean, cutoffTime: string) => {
  return useCallback((arrivalTime: Date | null) => {
    if (!enableCutoff || !arrivalTime) return 'normal';

    const [hours, minutes] = cutoffTime.split(':').map(Number);
    const cutoff = new Date(arrivalTime);
    cutoff.setHours(hours, minutes, 0, 0);

    const warningThreshold = new Date(cutoff.getTime() - 20 * 60000); // 20 minutes before

    if (arrivalTime > cutoff) return 'late';
    if (arrivalTime >= warningThreshold) return 'warning';
    return 'normal';
  }, [enableCutoff, cutoffTime]);
};

// Memoized time formatting
export const useTimeFormatting = () => {
  const formatTime = useCallback((date: Date | null) => {
    if (!date || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const getMinutesUntil = useCallback((date: Date | null) => {
    if (!date || isNaN(date.getTime())) return 'N/A';
    const diff = date.getTime() - new Date().getTime();
    const minutes = Math.floor(diff / 60000);
    return minutes < 1 ? 'NOW' : minutes;
  }, []);

  return { formatTime, getMinutesUntil };
};

// Memoized stop matching for nearby bus lines
export const useStopMatching = () => {
  const normalizeStops = useStopNormalization();

  return useCallback((
    stops: BusStop[],
    targetStopName: string,
    userLat: number,
    userLon: number,
    busLineId: string
  ) => {
    const targetStreets = normalizeStops(targetStopName);
    const stopFilter = getStopFilterForRoute(busLineId);

    let matchingStop: BusStop | null = null;

    for (const stop of stops) {
      if (stopFilter && !stopFilter(stop)) continue;

      const currentStreets = normalizeStops(stop.name);
      const streetsMatch =
        (targetStreets[0] === currentStreets[0] && targetStreets[1] === currentStreets[1]) ||
        (targetStreets[0] === currentStreets[1] && targetStreets[1] === currentStreets[0]);

      if (streetsMatch) {
        matchingStop = stop;
        break;
      }
    }

    if (!matchingStop && stops.length > 0) {
      const eligibleStops = stopFilter ? stops.filter(stopFilter) : stops;

      if (eligibleStops.length > 0) {
        let closestStop = eligibleStops[0];
        let minDistance = calculateDistance(userLat, userLon, closestStop.lat, closestStop.lon);

        for (const stop of eligibleStops) {
          const distance = calculateDistance(userLat, userLon, stop.lat, stop.lon);
          if (distance < minDistance) {
            minDistance = distance;
            closestStop = stop;
          }
        }
        matchingStop = closestStop;
      } else if (stops.length > 0) {
        matchingStop = stops[0];
      }
    }

    return matchingStop;
  }, [normalizeStops]);
};
