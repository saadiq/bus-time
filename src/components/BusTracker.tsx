"use client";

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBusTracker } from '@/hooks/useBusTracker';
import {
  useDirectionStops,
  useBusStatus,
  useTimeFormatting,
} from '@/hooks/useMemoizedComputations';
import { useUrlSync } from '@/hooks/useUrlSync';
import { useBusLineSearch } from '@/hooks/useBusLineSearch';
import { useStopManagement } from '@/hooks/useStopManagement';
import { useArrivalsPolling } from '@/hooks/useArrivalsPolling';
import { useBootstrap } from '@/hooks/useBootstrap';
import safeLocalStorage from '@/lib/safeLocalStorage';
import { SettingsProvider, SettingsContextValue } from '@/contexts/SettingsContext';
import RouteHeader from './RouteHeader';
import SettingsPanel from './SettingsPanel';
import ArrivalsDisplay from './ArrivalsDisplay';
import Footer from './Footer';

const BusTrackerContent = () => {
  const query = useSearchParams();
  const { state, actions } = useBusTracker();

  const {
    arrivals, error, busStopError, loading, data, cutoffTime, enableCutoff,
    lastRefresh, nextRefreshIn, busLineSearch, busLineResults,
    showBusLineResults, stops, directions, selectedDirection, stopsLoading,
    busLineId, originId, destinationId, isConfigOpen, forceUpdate,
    geoLoading, geoError
  } = state;

  const {
    setArrivals, setError, setBusStopError, setLoading, setData, setCutoffTime,
    setEnableCutoff, setLastRefresh, setNextRefreshIn, setBusLineSearch,
    setBusLineResults, setBusLineLoading, setShowBusLineResults, setStops,
    setDirections, setSelectedDirection, setStopsLoading, setBusLineId,
    setOriginId, setDestinationId, setIsConfigOpen, forceUpdate: triggerForceUpdate,
    setGeoLoading, setGeoError, batchUpdate, resetAll
  } = actions;

  const currentStops = useDirectionStops(stops, directions, selectedDirection);
  const getBusStatus = useBusStatus(enableCutoff, cutoffTime);
  const { formatTime, getMinutesUntil } = useTimeFormatting();

  const getStopName = (stopId: string) => {
    const stop = stops.find(s => s.id === stopId);
    return stop ? stop.name : null;
  };

  const syncUrl = useUrlSync({ busLineId, originId, destinationId, enableCutoff, cutoffTime });

  const {
    fetchStopsForLine,
    handleSwapDirections,
    handleOriginChange,
    handleDestinationChange,
    cleanup: stopManagementCleanup,
  } = useStopManagement({
    stops, directions, selectedDirection, originId, destinationId,
    busLineSearch, forceUpdate,
    setStops, setDirections, setSelectedDirection, setStopsLoading,
    setOriginId, setDestinationId, setBusStopError, setBusLineSearch,
    triggerForceUpdate, batchUpdate, syncUrl,
  });

  const {
    handleBusLineSearchChange,
    fetchBusLineDetails,
    selectBusLine,
    handleGeolocation,
    cleanup: busLineSearchCleanup,
  } = useBusLineSearch({
    busLineSearch, busLineId,
    setBusLineSearch, setBusLineId, setBusLineResults,
    setBusLineLoading, setShowBusLineResults, setStops,
    setDirections, setSelectedDirection, setOriginId,
    setGeoLoading, setGeoError,
    syncUrl, fetchStopsForLine, query,
  });

  useArrivalsPolling({
    busLineId, originId, destinationId, lastRefresh,
    setArrivals, setData, setError, setLoading, setLastRefresh, setNextRefreshIn,
  });

  useBootstrap({
    busLineId, busLineSearch, originId, destinationId, enableCutoff, cutoffTime, stops,
    setBusLineId, setBusLineSearch, setOriginId, setDestinationId,
    setStops, setIsConfigOpen, setLastRefresh, setEnableCutoff, setCutoffTime,
    syncUrl, fetchBusLineDetails, fetchStopsForLine,
    busLineSearchCleanup, stopManagementCleanup,
  });

  const handleReset = () => {
    safeLocalStorage.removeItem('busLine');
    safeLocalStorage.removeItem('busLineSearch');
    safeLocalStorage.removeItem('originId');
    safeLocalStorage.removeItem('destinationId');
    safeLocalStorage.removeItem('enableCutoff');
    safeLocalStorage.removeItem('cutoffTime');

    syncUrl({
      busLineId: null,
      originId: null,
      destinationId: null,
      enableCutoff: false,
      cutoffTime: null,
    });

    resetAll();
  };

  const handleCutoffChange = (value: boolean) => {
    setEnableCutoff(value);
    syncUrl(
      value
        ? { enableCutoff: true, cutoffTime }
        : { enableCutoff: false, cutoffTime: null }
    );
  };

  const handleCutoffTimeChange = (time: string) => {
    setCutoffTime(time);
    if (enableCutoff) {
      syncUrl({ cutoffTime: time });
    }
  };

  const handleInputFocus = () => {
    if (busLineSearch && !busLineId) {
      setBusLineSearch('');
    }
    setShowBusLineResults(false);
  };

  const handleDirectionChange = (newDirection: string) => {
    setSelectedDirection(newDirection);
    setOriginId('');
    setDestinationId('');
    triggerForceUpdate();
  };

  const originName = data?.originName || getStopName(originId);
  const destinationName = data?.destinationName || getStopName(destinationId);

  const settingsValue: SettingsContextValue = {
    busLineSearch, busLineId, geoLoading, geoError,
    showBusLineResults, busLineResults,
    onSearchChange: handleBusLineSearchChange,
    onInputFocus: handleInputFocus,
    onGeolocation: handleGeolocation,
    onSelectBusLine: selectBusLine,
    onReset: handleReset,
    busStopError, directions, selectedDirection, currentStops,
    originId, destinationId, stopsLoading,
    onDirectionChange: handleDirectionChange,
    onOriginChange: handleOriginChange,
    onDestinationChange: handleDestinationChange,
    onSwapDirections: handleSwapDirections,
    enableCutoff, cutoffTime,
    onCutoffChange: handleCutoffChange,
    onCutoffTimeChange: handleCutoffTimeChange,
    isOpen: isConfigOpen,
    onClose: () => setIsConfigOpen(false),
    onToggleSettings: () => setIsConfigOpen(!isConfigOpen),
    originName, destinationName,
  };

  return (
    <SettingsProvider value={settingsValue}>
      <div className="max-w-xl mx-auto flex flex-col min-h-[calc(100vh-2rem)]">
        <RouteHeader />

        <ArrivalsDisplay
          loading={loading}
          error={error}
          arrivals={arrivals}
          lastRefresh={lastRefresh}
          nextRefreshIn={nextRefreshIn}
          getBusStatus={getBusStatus}
          formatTime={formatTime}
          getMinutesUntil={getMinutesUntil}
        />

        <Footer />

        <SettingsPanel />
      </div>
    </SettingsProvider>
  );
};

const BusTracker = () => {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-[var(--text-muted)]">Loading...</div>}>
      <BusTrackerContent />
    </Suspense>
  );
};

export default BusTracker;
