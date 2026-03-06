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
import ConfigPanel from './ConfigPanel';
import ArrivalsDisplay from './ArrivalsDisplay';
import Footer from './Footer';

const BusTrackerContent = () => {
  const query = useSearchParams();
  const { state, actions } = useBusTracker();

  const {
    arrivals, error, busStopError, loading, data, cutoffTime, enableCutoff,
    lastRefresh, nextRefreshIn, busLineSearch, busLineResults, busLineLoading: _busLineLoading,
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
    busLineId, busLineSearch, originId, destinationId, stops,
    enableCutoff, cutoffTime,
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

  return (
    <div className="max-w-xl mx-auto">
      <header className="brutal-card border-b-0">
        <div className="p-6 pb-4">
          <div className="flex items-baseline justify-between">
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">
              {busLineId ? busLineSearch.split(' - ')[0] : 'BUS'}
            </h1>
            <button
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className="brutal-button brutal-button--ghost text-sm border-2"
            >
              {isConfigOpen ? 'CLOSE' : 'CONFIG'}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 text-sm font-medium">
            <span className="w-3 h-3 bg-[var(--mta-yellow)]"></span>
            <span className="truncate">
              {data?.originName || getStopName(originId) || (stopsLoading && originId ? '...' : 'SELECT ORIGIN')}
            </span>
            <span className="text-[var(--muted)]">&rarr;</span>
            <span className="truncate">
              {data?.destinationName || getStopName(destinationId) || (stopsLoading && destinationId ? '...' : 'SELECT DESTINATION')}
            </span>
          </div>
        </div>

        {isConfigOpen && (
          <ConfigPanel
            busLineSearch={busLineSearch}
            busLineId={busLineId}
            geoLoading={geoLoading}
            geoError={geoError}
            showBusLineResults={showBusLineResults}
            busLineResults={busLineResults}
            busStopError={busStopError}
            directions={directions}
            selectedDirection={selectedDirection}
            currentStops={currentStops}
            originId={originId}
            destinationId={destinationId}
            stopsLoading={stopsLoading}
            enableCutoff={enableCutoff}
            cutoffTime={cutoffTime}
            onSearchChange={handleBusLineSearchChange}
            onInputFocus={handleInputFocus}
            onGeolocation={handleGeolocation}
            onSelectBusLine={selectBusLine}
            onReset={handleReset}
            onDirectionChange={handleDirectionChange}
            onOriginChange={handleOriginChange}
            onDestinationChange={handleDestinationChange}
            onSwapDirections={handleSwapDirections}
            onCutoffChange={handleCutoffChange}
            onCutoffTimeChange={handleCutoffTimeChange}
          />
        )}
      </header>

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
    </div>
  );
};

const BusTracker = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BusTrackerContent />
    </Suspense>
  );
};

export default BusTracker;
