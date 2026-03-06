import React from 'react';
import { useSettings } from '@/contexts/SettingsContext';

const RouteHeader = () => {
  const {
    busLineSearch, busLineId, originName, destinationName,
    enableCutoff, cutoffTime, onSwapDirections, onToggleSettings,
  } = useSettings();

  const lineName = busLineId ? busLineSearch.split(' - ')[0] : null;

  const formatCutoffTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  return (
    <header className="card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {lineName && (
            <span className="shrink-0 px-3 py-1 bg-accent text-white text-sm font-bold rounded-full">
              {lineName}
            </span>
          )}

          {originName && destinationName ? (
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span className="truncate text-[var(--text-primary)] font-medium">{originName}</span>
              <button
                onClick={onSwapDirections}
                className="shrink-0 p-1 rounded-md hover:bg-[var(--bg-card)] transition-colors"
                aria-label="Swap direction"
              >
                <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
              <span className="truncate text-[var(--text-primary)] font-medium">{destinationName}</span>
            </div>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">
              {busLineId ? 'Select stops' : 'Set up your route'}
            </span>
          )}
        </div>

        <button
          onClick={onToggleSettings}
          className="shrink-0 p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors"
          aria-label="Settings"
        >
          <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {enableCutoff && cutoffTime && (
        <div className="mt-1.5 text-xs text-[var(--text-secondary)] font-medium pl-1">
          Arrive by {formatCutoffTime(cutoffTime)}
        </div>
      )}
    </header>
  );
};

export default RouteHeader;
