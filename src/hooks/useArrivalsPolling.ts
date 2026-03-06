import { useEffect, useRef } from 'react';
import { BusArrival, BusData, BusResponse } from '@/types';

const POLLING_INTERVAL = 30000;

interface UseArrivalsPollingParams {
  busLineId: string;
  originId: string;
  destinationId: string;
  lastRefresh: Date | null;
  setArrivals: (v: BusArrival[]) => void;
  setData: (v: BusData | null) => void;
  setError: (v: string | null) => void;
  setLoading: (v: boolean) => void;
  setLastRefresh: (v: Date | null) => void;
  setNextRefreshIn: (v: number) => void;
}

export function useArrivalsPolling(params: UseArrivalsPollingParams) {
  const {
    busLineId, originId, destinationId, lastRefresh,
    setArrivals, setData, setError, setLoading, setLastRefresh, setNextRefreshIn,
  } = params;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const arrivalsAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!busLineId || !originId || !destinationId) {
        setArrivals([]);
        if (!busLineId && !originId && !destinationId) {
          setData(null);
        }
        return;
      }

      try {
        setLoading(true);
        const url = `/api/bus-times?busLine=${encodeURIComponent(busLineId)}&originId=${encodeURIComponent(originId)}&destinationId=${encodeURIComponent(destinationId)}`;

        if (arrivalsAbortControllerRef.current) {
          arrivalsAbortControllerRef.current.abort();
        }

        arrivalsAbortControllerRef.current = new AbortController();
        const response = await fetch(url, {
          signal: arrivalsAbortControllerRef.current.signal
        });

        if (!response.ok) throw new Error('Failed to fetch bus data');

        const responseData = await response.json();
        const data = responseData.success ? responseData.data : responseData;
        setData(data);

        if (data.hasError) {
          setError(data.errorMessage || 'Unable to get real-time bus arrival data for these stops');
          setArrivals([]);
        } else {
          const processedArrivals = data.buses.map((bus: BusResponse) => {
            let originArrival: Date | null = null;
            let destinationArrival: Date | null = null;

            try {
              if (bus.originArrival) {
                originArrival = new Date(bus.originArrival);
                if (isNaN(originArrival.getTime())) {
                  console.warn(`Invalid origin arrival time format: ${bus.originArrival}`);
                  originArrival = null;
                }
              }

              if (bus.destinationArrival) {
                destinationArrival = new Date(bus.destinationArrival);
                if (isNaN(destinationArrival.getTime())) {
                  console.warn(`Invalid destination arrival time format: ${bus.destinationArrival}`);
                  destinationArrival = null;
                }
              }
            } catch (e) {
              console.error('Error parsing bus arrival times:', e);
            }

            const result = {
              vehicleId: bus.vehicleRef,
              originArrival: originArrival || new Date(),
              stopsAway: bus.originStopsAway,
              destinationArrival: destinationArrival,
              destination: bus.destination,
              isEstimated: bus.isEstimated || false,
            };

            return result;
          });

          setArrivals(processedArrivals);
          setError(null);
        }

        setLastRefresh(new Date());
        arrivalsAbortControllerRef.current = null;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError('Unable to load bus arrival times. Please try again later.');
        console.error('Error fetching bus data:', err);
      } finally {
        if (arrivalsAbortControllerRef.current) {
          arrivalsAbortControllerRef.current = null;
        }
        setLoading(false);
      }
    };

    fetchData();
    intervalRef.current = setInterval(fetchData, POLLING_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (arrivalsAbortControllerRef.current) {
        arrivalsAbortControllerRef.current.abort();
        arrivalsAbortControllerRef.current = null;
      }
    };
  }, [busLineId, originId, destinationId, setArrivals, setData, setError, setLastRefresh, setLoading]);

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      if (!lastRefresh) return;
      const timeSinceLastRefresh = Date.now() - lastRefresh.getTime();
      const remainingSeconds = Math.max(0, Math.ceil((POLLING_INTERVAL - timeSinceLastRefresh) / 1000));
      setNextRefreshIn(remainingSeconds);
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [lastRefresh, setNextRefreshIn]);
}
