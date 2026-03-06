'use client';

import React, { createContext, useContext } from 'react';
import { BusLine, BusStop, Direction, NearbyBusLine } from '@/types';

export interface SettingsContextValue {
  // Bus line search
  busLineSearch: string;
  busLineId: string;
  geoLoading: boolean;
  geoError: string | null;
  showBusLineResults: boolean;
  busLineResults: (BusLine | NearbyBusLine)[];
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInputFocus: () => void;
  onGeolocation: () => void;
  onSelectBusLine: (line: BusLine) => void;
  onReset: () => void;

  // Route config
  busStopError: string | null;
  directions: Direction[];
  selectedDirection: string;
  currentStops: BusStop[];
  originId: string;
  destinationId: string;
  stopsLoading: boolean;
  onDirectionChange: (direction: string) => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwapDirections: () => void;

  // Cutoff
  enableCutoff: boolean;
  cutoffTime: string;
  onCutoffChange: (value: boolean) => void;
  onCutoffTimeChange: (time: string) => void;

  // Panel control
  isOpen: boolean;
  onClose: () => void;
  onToggleSettings: () => void;

  // Derived (for RouteHeader)
  originName: string | null;
  destinationName: string | null;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}

export function SettingsProvider({
  value,
  children,
}: {
  value: SettingsContextValue;
  children: React.ReactNode;
}) {
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
