import React from 'react';
import { BusLine, NearbyBusLine } from '@/types';

interface BusLineSearchProps {
  busLineSearch: string;
  geoLoading: boolean;
  geoError: string | null;
  showBusLineResults: boolean;
  busLineResults: (BusLine | NearbyBusLine)[];
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInputFocus: () => void;
  onGeolocation: () => void;
  onSelectBusLine: (line: BusLine) => void;
  onReset: () => void;
}

const BusLineSearch = ({
  busLineSearch,
  geoLoading,
  geoError,
  showBusLineResults,
  busLineResults,
  onSearchChange,
  onInputFocus,
  onGeolocation,
  onSelectBusLine,
  onReset,
}: BusLineSearchProps) => {
  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-2">
        <label className="font-display text-sm tracking-wide">BUS LINE</label>
        <button
          onClick={onReset}
          className="text-xs font-medium text-[var(--muted)] hover:text-[var(--black)] transition-colors"
        >
          RESET
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={busLineSearch}
          onChange={onSearchChange}
          onFocus={onInputFocus}
          placeholder="Type route (e.g. B52, M15)"
          className="brutal-input flex-1"
        />
        <button
          onClick={onGeolocation}
          disabled={geoLoading}
          className="brutal-button brutal-button--accent px-3"
          title="Find nearby bus lines"
        >
          {geoLoading ? (
            <div className="animate-spin h-4 w-4 border-2 border-[var(--black)] border-t-transparent"></div>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V2c0-.55-.45-1-1-1s-1 .45-1 1v1.06C6.83 3.52 3.52 6.83 3.06 11H2c-.55 0-1 .45-1 1s.45 1 1 1h1.06c.46 4.17 3.77 7.48 7.94 7.94V22c0 .55.45 1 1 1s1-.45 1-1v-1.06c4.17-.46 7.48-3.77 7.94-7.94H22c.55 0 1-.45 1-1s-.45-1-1-1h-1.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
            </svg>
          )}
        </button>
      </div>

      {geoError && (
        <div className="mt-2 p-3 bg-[var(--danger)] text-white text-sm font-medium">
          {geoError}
        </div>
      )}

      {showBusLineResults && busLineResults.length > 0 && (
        <div className="absolute z-20 mt-1 left-0 right-0 bg-[var(--concrete)] border-[3px] border-[var(--black)] max-h-60 overflow-auto">
          {busLineResults.map(line => (
            <div
              key={line.id}
              className="px-4 py-3 hover:bg-[var(--mta-yellow)] cursor-pointer border-b-2 border-[var(--black)] last:border-b-0 transition-colors"
              onClick={() => onSelectBusLine(line as BusLine)}
            >
              <div className="font-display text-lg">{line.shortName}</div>
              <div className="text-xs text-[var(--muted)]">{line.longName}</div>
              {'distance' in line && (
                <div className="text-xs font-medium mt-1">
                  {((line as NearbyBusLine).distance < 0.1
                    ? 'NEARBY'
                    : `${(line as NearbyBusLine).distance.toFixed(1)} MI`)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BusLineSearch;
