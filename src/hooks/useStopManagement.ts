import { useCallback, useRef } from 'react';
import { BusStop, Direction } from '@/types';
import { calculateDistance, SAME_LOCATION_THRESHOLD } from '@/lib/geo';
import { findClosestStopInList } from '@/lib/busLineUtils';
import { BusTrackerState } from '@/hooks/useBusTracker';

interface UseStopManagementParams {
  stops: BusStop[];
  directions: Direction[];
  selectedDirection: string;
  originId: string;
  destinationId: string;
  busLineSearch: string;
  forceUpdate: number;
  setStops: (v: BusStop[]) => void;
  setDirections: (v: Direction[]) => void;
  setSelectedDirection: (v: string) => void;
  setStopsLoading: (v: boolean) => void;
  setOriginId: (v: string) => void;
  setDestinationId: (v: string) => void;
  setBusStopError: (v: string | null) => void;
  setBusLineSearch: (v: string) => void;
  triggerForceUpdate: () => void;
  batchUpdate: (updates: Partial<BusTrackerState>) => void;
  syncUrl: (overrides?: Record<string, unknown>) => void;
}

export function useStopManagement(params: UseStopManagementParams) {
  const {
    stops, directions, selectedDirection, originId, destinationId,
    busLineSearch, forceUpdate,
    setStops, setDirections, setSelectedDirection, setStopsLoading,
    setOriginId, setDestinationId, setBusStopError, setBusLineSearch,
    triggerForceUpdate, batchUpdate, syncUrl,
  } = params;

  const stopsAbortControllerRef = useRef<AbortController | null>(null);
  const busLineSearchRef = useRef(busLineSearch);
  busLineSearchRef.current = busLineSearch;

  const fetchStopsForLine = useCallback(async (lineId: string, preserveOriginId?: string, preserveDestinationId?: string): Promise<void> => {
    const currentBusLineSearch = busLineSearchRef.current;

    if (!lineId) {
      setStopsLoading(false);
      return;
    }

    setStopsLoading(true);
    try {
      if (stopsAbortControllerRef.current) {
        stopsAbortControllerRef.current.abort();
      }

      stopsAbortControllerRef.current = new AbortController();
      const timeoutId = setTimeout(() => {
        if (stopsAbortControllerRef.current) {
          stopsAbortControllerRef.current.abort();
        }
      }, 10000);

      const response = await fetch(`/api/bus-stops?lineId=${encodeURIComponent(lineId)}`, {
        signal: stopsAbortControllerRef.current.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });

      clearTimeout(timeoutId);
      stopsAbortControllerRef.current = null;

      if (response.status === 404) {
        console.warn(`No stops found for bus line: ${lineId}`);
        setBusStopError('No stops found for this bus line. Please try another line.');
        setStops([]);
        setDirections([]);
        setSelectedDirection('');
        setOriginId('');
        setDestinationId('');
        syncUrl({ busLineId: lineId, originId: null, destinationId: null });
        setBusLineSearch(currentBusLineSearch);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch bus stops: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      const data = responseData.success ? responseData.data : responseData;

      if (!data || !data.stops) {
        throw new Error('Invalid response format from bus stops API');
      }

      if (data.stops.length > 0) {
        setBusStopError(null);
        setStops(data.stops);

        if (data.directions && data.directions.length > 0) {
          setDirections(data.directions);

          let selectedDirectionId = data.directions[0].id;

          if (preserveOriginId && preserveDestinationId) {
            const originStop = data.stops.find((s: BusStop) => s.id === preserveOriginId);
            const destinationStop = data.stops.find((s: BusStop) => s.id === preserveDestinationId);

            if (originStop && destinationStop) {
              const matchingDirection = data.directions.find((d: { id: string; name: string }) =>
                d.name === originStop.direction || d.name === destinationStop.direction
              );
              if (matchingDirection) {
                selectedDirectionId = matchingDirection.id;
              }
            }
          }

          setSelectedDirection(selectedDirectionId);
        } else {
          console.warn('No directions found in the API response');
          setDirections([]);
          setSelectedDirection('');
        }

        if (preserveOriginId && preserveDestinationId) {
          const allStopIds = data.stops.map((s: BusStop) => s.id);
          const shouldPreserveOrigin = allStopIds.includes(preserveOriginId);
          const shouldPreserveDestination = allStopIds.includes(preserveDestinationId);

          if (shouldPreserveOrigin && shouldPreserveDestination) {
            batchUpdate({
              originId: preserveOriginId,
              destinationId: preserveDestinationId
            });
            syncUrl({
              busLineId: lineId,
              originId: preserveOriginId,
              destinationId: preserveDestinationId,
            });
          } else {
            batchUpdate({
              originId: '',
              destinationId: ''
            });
            syncUrl({ originId: null, destinationId: null });
          }
        } else {
          setOriginId('');
          setDestinationId('');
          syncUrl({ originId: null, destinationId: null });
        }
      } else {
        console.warn('No stops found in the API response');
        setBusStopError('No stops available for this bus line. Please try another line.');
        setStops([]);
        setDirections([]);
        setSelectedDirection('');
        setOriginId('');
        setDestinationId('');
        setBusLineSearch(currentBusLineSearch);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Error fetching bus stops:', err);
      setBusStopError('Error loading bus stops. Please try again.');
      setStops([]);
      setDirections([]);
      setSelectedDirection('');
      setOriginId('');
      setDestinationId('');
      syncUrl({ busLineId: lineId, originId: null, destinationId: null });
      setBusLineSearch(currentBusLineSearch);
    } finally {
      if (stopsAbortControllerRef.current) {
        stopsAbortControllerRef.current = null;
      }
      setStopsLoading(false);
    }
  }, [syncUrl, batchUpdate, setBusStopError, setStops, setDirections, setSelectedDirection, setOriginId, setDestinationId, setStopsLoading, setBusLineSearch]);

  const handleSwapDirections = () => {
    if (directions.length > 1) {
      const currentDirIndex = directions.findIndex(d => d.id === selectedDirection);
      if (currentDirIndex !== -1) {
        const newDirIndex = (currentDirIndex + 1) % directions.length;
        const newDirection = directions[newDirIndex];

        const currentOriginStop = originId ? stops.find(s => s.id === originId) : null;
        const currentDestStop = destinationId ? stops.find(s => s.id === destinationId) : null;

        const newDirectionStops = stops.filter(s => s.direction === newDirection.name);

        let newOriginId = '';
        let newDestinationId = '';

        if (currentOriginStop && currentDestStop && newDirectionStops.length > 0) {
          const newOrigin = findClosestStopInList(
            currentDestStop.lat,
            currentDestStop.lon,
            newDirectionStops
          );
          const newDest = findClosestStopInList(
            currentOriginStop.lat,
            currentOriginStop.lon,
            newDirectionStops
          );

          if (newOrigin) newOriginId = newOrigin.id;
          if (newDest) newDestinationId = newDest.id;
        } else if (currentOriginStop && newDirectionStops.length > 0) {
          const newDest = findClosestStopInList(
            currentOriginStop.lat,
            currentOriginStop.lon,
            newDirectionStops
          );
          if (newDest) newDestinationId = newDest.id;
        } else if (currentDestStop && newDirectionStops.length > 0) {
          const newOrigin = findClosestStopInList(
            currentDestStop.lat,
            currentDestStop.lon,
            newDirectionStops
          );
          if (newOrigin) newOriginId = newOrigin.id;
        }

        batchUpdate({
          selectedDirection: newDirection.id,
          originId: newOriginId,
          destinationId: newDestinationId,
          forceUpdate: forceUpdate + 1
        });

        syncUrl({
          originId: newOriginId || null,
          destinationId: newDestinationId || null,
        });
      }
    } else {
      const tempOrigin = originId;
      const tempDestination = destinationId;

      batchUpdate({
        originId: tempDestination,
        destinationId: tempOrigin,
        forceUpdate: forceUpdate + 1
      });

      syncUrl({
        originId: tempDestination || null,
        destinationId: tempOrigin || null,
      });
    }
  };

  const handleStopChange = (
    changedId: string,
    otherId: string,
    isOrigin: boolean
  ) => {
    const setChanged = isOrigin ? setOriginId : setDestinationId;
    const urlUpdate = isOrigin
      ? { originId: changedId, destinationId: otherId }
      : { originId: otherId, destinationId: changedId };

    if (!otherId) {
      setChanged(changedId);
      syncUrl(urlUpdate);
      return;
    }

    const direction = directions.find(d => d.id === selectedDirection);
    if (!direction) return;

    const changedStop = stops.find(s => s.id === changedId && s.direction === direction.name);
    const otherStop = stops.find(s => s.id === otherId && s.direction === direction.name);
    if (!changedStop || !otherStop) return;

    const needsSwap = isOrigin
      ? changedStop.sequence > otherStop.sequence
      : changedStop.sequence < otherStop.sequence;

    if (needsSwap && directions.length > 1) {
      const currentDirIndex = directions.findIndex(d => d.id === selectedDirection);
      const newDir = directions[(currentDirIndex + 1) % directions.length];
      const newDirStops = stops.filter(s => s.direction === newDir.name);

      const changedInNewDir = newDirStops.find(s =>
        calculateDistance(s.lat, s.lon, changedStop.lat, changedStop.lon) < SAME_LOCATION_THRESHOLD
      );
      const otherInNewDir = newDirStops.find(s =>
        calculateDistance(s.lat, s.lon, otherStop.lat, otherStop.lon) < SAME_LOCATION_THRESHOLD
      );

      if (changedInNewDir && otherInNewDir) {
        setSelectedDirection(newDir.id);
        setOriginId(isOrigin ? changedInNewDir.id : otherInNewDir.id);
        setDestinationId(isOrigin ? otherInNewDir.id : changedInNewDir.id);
        triggerForceUpdate();
        syncUrl({
          originId: isOrigin ? changedInNewDir.id : otherInNewDir.id,
          destinationId: isOrigin ? otherInNewDir.id : changedInNewDir.id,
        });
        return;
      }
    }

    setChanged(changedId);
    syncUrl(urlUpdate);
  };

  const handleOriginChange = (newOriginId: string) =>
    handleStopChange(newOriginId, destinationId, true);

  const handleDestinationChange = (newDestinationId: string) =>
    handleStopChange(newDestinationId, originId, false);

  const cleanup = () => {
    if (stopsAbortControllerRef.current) {
      stopsAbortControllerRef.current.abort();
    }
  };

  return {
    fetchStopsForLine,
    handleSwapDirections,
    handleOriginChange,
    handleDestinationChange,
    cleanup,
  };
}
