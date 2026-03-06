import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface UrlSyncParams {
  busLineId: string;
  originId: string;
  destinationId: string;
  enableCutoff: boolean;
  cutoffTime: string;
}

export function useUrlSync({ busLineId, originId, destinationId, enableCutoff, cutoffTime }: UrlSyncParams) {
  const router = useRouter();

  const syncUrl = useCallback((overrides: Partial<{
    busLineId: string | null;
    originId: string | null;
    destinationId: string | null;
    enableCutoff: boolean;
    cutoffTime: string | null;
  }> = {}) => {
    const effectiveBusLineId = overrides.busLineId !== undefined ? overrides.busLineId : busLineId;
    const effectiveOriginId = overrides.originId !== undefined ? overrides.originId : originId;
    const effectiveDestinationId = overrides.destinationId !== undefined ? overrides.destinationId : destinationId;
    const effectiveEnableCutoff = overrides.enableCutoff !== undefined ? overrides.enableCutoff : enableCutoff;
    const effectiveCutoffTime = overrides.cutoffTime !== undefined ? overrides.cutoffTime : cutoffTime;

    const params = new URLSearchParams();

    if (effectiveBusLineId) params.set('busLine', effectiveBusLineId);
    if (effectiveOriginId) params.set('originId', effectiveOriginId);
    if (effectiveDestinationId) params.set('destinationId', effectiveDestinationId);

    if (effectiveEnableCutoff) {
      params.set('cutoff', 'true');
      if (effectiveCutoffTime) {
        params.set('time', effectiveCutoffTime);
      }
    }

    const newParamsString = params.toString();
    const pathname = window.location.pathname;
    const destination = newParamsString ? `${pathname}?${newParamsString}` : pathname;
    const currentFullPath = `${window.location.pathname}${window.location.search}`;

    if (destination !== currentFullPath) {
      router.replace(destination);
    }
  }, [busLineId, originId, destinationId, enableCutoff, cutoffTime, router]);

  return syncUrl;
}
