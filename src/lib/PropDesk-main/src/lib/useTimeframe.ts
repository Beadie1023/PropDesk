import { useSyncExternalStore } from 'react';
import { getTimeframe, subscribeTimeframe, type Timeframe } from './timeframe';

/** Re-renders the component whenever the shared timeframe changes. */
export function useTimeframe(): Timeframe {
  return useSyncExternalStore(subscribeTimeframe, getTimeframe, getTimeframe);
}
