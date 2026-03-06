import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { BusStop } from '@/types';
import safeLocalStorage from '@/lib/safeLocalStorage';

interface UseBootstrapParams {
  busLineId: string;
  busLineSearch: string;
  originId: string;
  destinationId: string;
  stops: BusStop[];
  enableCutoff: boolean;
  cutoffTime: string;
  setBusLineId: (v: string) => void;
  setBusLineSearch: (v: string) => void;
  setOriginId: (v: string) => void;
  setDestinationId: (v: string) => void;
  setStops: (v: BusStop[]) => void;
  setIsConfigOpen: (v: boolean) => void;
  setLastRefresh: (v: Date) => void;
  setEnableCutoff: (v: boolean) => void;
  setCutoffTime: (v: string) => void;
  syncUrl: (overrides?: Record<string, unknown>) => void;
  fetchBusLineDetails: (lineId: string) => Promise<void>;
  fetchStopsForLine: (lineId: string, preserveOriginId?: string, preserveDestinationId?: string) => Promise<void>;
  busLineSearchCleanup: () => void;
  stopManagementCleanup: () => void;
}

export function useBootstrap(params: UseBootstrapParams) {
  const {
    busLineId, busLineSearch, originId, destinationId, stops,
    setBusLineId, setBusLineSearch, setOriginId, setDestinationId,
    setStops, setIsConfigOpen, setLastRefresh, setEnableCutoff, setCutoffTime,
    syncUrl, fetchBusLineDetails, fetchStopsForLine,
    busLineSearchCleanup, stopManagementCleanup,
  } = params;

  const query = useSearchParams();
  const currentBusLineRef = useRef({ id: '', search: '' });

  useEffect(() => {
    return () => {
      busLineSearchCleanup();
      stopManagementCleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLastRefresh(new Date());

    const bootstrap = async () => {
      try {
        const urlBusLine = query.get('busLine');
        const urlOriginId = query.get('originId');
        const urlDestinationId = query.get('destinationId');

        if (urlBusLine) {
          setBusLineId(urlBusLine);
          await fetchBusLineDetails(urlBusLine);
          await fetchStopsForLine(urlBusLine, urlOriginId || undefined, urlDestinationId || undefined);
          setIsConfigOpen(true);
          return;
        }

        const storedBusLine = safeLocalStorage.getItem('busLine');
        const storedOriginId = safeLocalStorage.getItem('originId');
        const storedDestinationId = safeLocalStorage.getItem('destinationId');
        const storedBusLineSearch = safeLocalStorage.getItem('busLineSearch');

        if (storedBusLine && storedOriginId && storedDestinationId) {
          setBusLineId(storedBusLine);
          setBusLineSearch(storedBusLineSearch || storedBusLine);
          await fetchStopsForLine(storedBusLine, storedOriginId, storedDestinationId);
          syncUrl({
            busLineId: storedBusLine,
            originId: storedOriginId,
            destinationId: storedDestinationId,
          });
          return;
        }

        setIsConfigOpen(true);
        setBusLineId('');
        setBusLineSearch('');
        setOriginId('');
        setDestinationId('');
        setStops([]);
      } catch (err) {
        console.error('Failed to bootstrap tracker state:', err);
        setIsConfigOpen(true);
      }
    };

    bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const hasOrigin = originId && stops.some(stop => stop.id === originId);
    const hasDestination = destinationId && stops.some(stop => stop.id === destinationId);

    if (busLineId && hasOrigin && hasDestination) {
      safeLocalStorage.setItem('busLine', busLineId);
      safeLocalStorage.setItem('busLineSearch', busLineSearch);
      safeLocalStorage.setItem('originId', originId);
      safeLocalStorage.setItem('destinationId', destinationId);
      return;
    }

    safeLocalStorage.removeItem('originId');
    safeLocalStorage.removeItem('destinationId');

    if (!busLineId) {
      safeLocalStorage.removeItem('busLine');
      safeLocalStorage.removeItem('busLineSearch');
    }
  }, [busLineId, busLineSearch, originId, destinationId, stops]);

  useEffect(() => {
    const urlCutoff = query.get('cutoff');
    const urlTime = query.get('time');
    if (urlCutoff === 'true') {
      setEnableCutoff(true);
      if (urlTime) setCutoffTime(urlTime);
    }
  }, [query, setEnableCutoff, setCutoffTime]);

  useEffect(() => {
    if (busLineId && busLineSearch) {
      currentBusLineRef.current = { id: busLineId, search: busLineSearch };
    } else {
      currentBusLineRef.current = { id: '', search: '' };
    }
  }, [busLineId, busLineSearch]);

  useEffect(() => {
    if (busLineId && busLineSearch) {
      document.title = `${busLineSearch.split(' - ')[0]} Bus Tracker`;
    } else {
      document.title = 'Bus Tracker';
    }
  }, [busLineId, busLineSearch]);

  return { currentBusLineRef };
}
