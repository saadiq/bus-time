import { useMemo, useCallback } from 'react';
import { BusStop, Direction, BusArrival } from '@/types';

// Memoized Haversine distance calculation
export const useDistanceCalculation = () => {
  return useCallback((
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);
};

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

    // Simple sorting function that uses the API-provided sequence numbers
    const sortStopsBySequence = (stops: BusStop[]) => {
      return [...stops].sort((a, b) => a.sequence - b.sequence);
    };

    if (!direction) {
      // If there are no directions at all, return all stops sorted by sequence
      if (directions.length === 0) {
        // First group by direction, then sort each group by sequence
        const directionGroups: Record<string, BusStop[]> = {};
        stops.forEach(stop => {
          if (!directionGroups[stop.direction]) {
            directionGroups[stop.direction] = [];
          }
          directionGroups[stop.direction].push(stop);
        });

        // Sort each direction group by sequence
        const allSortedStops: BusStop[] = [];
        Object.values(directionGroups).forEach(dirStops => {
          allSortedStops.push(...sortStopsBySequence(dirStops));
        });

        return allSortedStops;
      }

      // If we have directions but selected one is not found,
      // use the first direction instead
      if (directions.length > 0) {
        const firstDirection = directions[0];
        const filteredStops = stops.filter(s => s.direction === firstDirection.name);
        const sortedStops = sortStopsBySequence(filteredStops);

        return sortedStops;
      }

      return [];
    }

    const filteredStops = stops.filter(stop => stop.direction === direction.name);

    if (filteredStops.length === 0) {
      // If no stops match the exact direction name, try a more flexible approach
      const allDirectionNames = [...new Set(stops.map(s => s.direction))];

      // Try to find a direction name that contains our direction name or vice versa
      const similarDirection = allDirectionNames.find(
        dirName => dirName.includes(direction.name) || direction.name.includes(dirName)
      );

      if (similarDirection) {
        const similarStops = stops.filter(s => s.direction === similarDirection);
        const sortedStops = sortStopsBySequence(similarStops);

        return sortedStops;
      }

      // If still no stops found, group by direction and sort each group
      if (stops.length > 0) {
        // Group by direction first
        const directionGroups: Record<string, BusStop[]> = {};
        stops.forEach(stop => {
          if (!directionGroups[stop.direction]) {
            directionGroups[stop.direction] = [];
          }
          directionGroups[stop.direction].push(stop);
        });

        // Sort each direction group by sequence
        const allSortedStops: BusStop[] = [];
        Object.values(directionGroups).forEach(dirStops => {
          allSortedStops.push(...sortStopsBySequence(dirStops));
        });

        return allSortedStops;
      }
    }

    // Sort the filtered stops by sequence
    const sortedStops = sortStopsBySequence(filteredStops);

    return sortedStops;
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
  const calculateDistance = useDistanceCalculation();

  return useCallback((
    stops: BusStop[],
    targetStopName: string,
    userLat: number,
    userLon: number,
    busLineId: string
  ) => {
    const targetStreets = normalizeStops(targetStopName);
    
    // Special handling for specific bus lines
    const isSBS = busLineId.includes('B44+');
    const isB48 = busLineId.includes('B48');

    let matchingStop = null;
    let matchFound = false;

    for (const stop of stops) {
      // Skip stops that don't match the route type
      if (isSBS) {
        const isSBSStop = stop.direction.includes('SBS');
        if (!isSBSStop) continue;
      }

      // For B48, check if it's in the right direction
      if (isB48) {
        const isCorrectDirection = stop.direction.includes('LEFFERTS GARDENS') ||
          stop.direction.includes('GREENPOINT');
        if (!isCorrectDirection) continue;
      }

      const currentStreets = normalizeStops(stop.name);

      // Check if both streets match in either order
      const streetsMatch =
        (targetStreets[0] === currentStreets[0] && targetStreets[1] === currentStreets[1]) ||
        (targetStreets[0] === currentStreets[1] && targetStreets[1] === currentStreets[0]);

      if (streetsMatch) {
        matchingStop = stop;
        matchFound = true;
        break;
      }
    }

    if (!matchFound && stops.length > 0) {
      // If no exact match found, find closest stop by distance
      let closestStop = stops[0];
      let minDistance = calculateDistance(
        userLat,
        userLon,
        closestStop.lat,
        closestStop.lon
      );

      for (const stop of stops) {
        const distance = calculateDistance(
          userLat,
          userLon,
          stop.lat,
          stop.lon
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestStop = stop;
        }
      }
      matchingStop = closestStop;
    }

    return matchingStop;
  }, [normalizeStops, calculateDistance]);
};