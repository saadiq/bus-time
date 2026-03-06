import { BusStop } from '@/types';
import { calculateDistance } from '@/lib/geo';

export const extractRouteName = (longName: string): string => {
  const cleanName = longName
    .replace(/\s+(to|TO)\s+.*$/i, '')
    .replace(/\s+(via|VIA)\s+.*$/i, '')
    .trim();
  return cleanName || longName;
};

export const findClosestStopInList = (lat: number, lon: number, stopList: BusStop[]): BusStop | null => {
  if (!stopList || stopList.length === 0) return null;

  let closestStop = stopList[0];
  let minDistance = calculateDistance(lat, lon, closestStop.lat, closestStop.lon);

  for (const stop of stopList) {
    const distance = calculateDistance(lat, lon, stop.lat, stop.lon);
    if (distance < minDistance) {
      minDistance = distance;
      closestStop = stop;
    }
  }
  return closestStop;
};
