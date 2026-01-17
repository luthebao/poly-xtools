import { create } from 'zustand';
import { PolymarketEvent, PolymarketEventFilter, PolymarketWatcherStatus } from '../types';

// Helper to safely get timestamp as number (milliseconds) for sorting
function getTimestampMs(ts: any): number {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'string') {
        // Try parsing as ISO date string
        const parsed = Date.parse(ts);
        if (!isNaN(parsed)) return parsed;
        // Try parsing as numeric string
        const num = Number(ts);
        if (!isNaN(num)) return num > 1e12 ? num : num * 1000; // Convert seconds to ms if needed
        return 0;
    }
    if (ts instanceof Date) return ts.getTime();
    // Handle Go time object
    if (typeof ts === 'object' && ts.time) return new Date(ts.time).getTime();
    return 0;
}

// Sort events by timestamp descending (newest first), with ID as tiebreaker
function sortEvents(events: PolymarketEvent[]): PolymarketEvent[] {
    return [...events].sort((a, b) => {
        const timeA = getTimestampMs(a.timestamp);
        const timeB = getTimestampMs(b.timestamp);
        // Sort descending (newest first)
        if (timeB !== timeA) return timeB - timeA;
        // Use database ID as tiebreaker (higher ID = newer)
        return (b.id || 0) - (a.id || 0);
    });
}

interface PolymarketState {
    events: PolymarketEvent[];
    status: PolymarketWatcherStatus;
    filter: PolymarketEventFilter;
    isLoading: boolean;
    error: string | null;

    setEvents: (events: PolymarketEvent[]) => void;
    addEvent: (event: PolymarketEvent) => void;
    updateEvent: (event: PolymarketEvent) => void;
    setStatus: (status: PolymarketWatcherStatus) => void;
    setFilter: (filter: Partial<PolymarketEventFilter>) => void;
    resetFilter: () => void;
    setIsLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    clearEvents: () => void;
}

const defaultFilter: PolymarketEventFilter = {
    eventTypes: [],
    marketName: '',
    minPrice: 0,
    maxPrice: 0,
    side: '',
    minSize: 100, // Default $100 minimum notional value
    limit: 100,
    offset: 0,
};

export const usePolymarketStore = create<PolymarketState>((set) => ({
    events: [],
    status: {
        isRunning: false,
        eventsReceived: 0,
    },
    filter: defaultFilter,
    isLoading: false,
    error: null,

    setEvents: (events) => set({
        events: sortEvents(events),
    }),

    addEvent: (event) => set((state) => ({
        events: sortEvents([event, ...state.events]).slice(0, 500), // Keep last 500 events in memory
    })),

    updateEvent: (event) => set((state) => ({
        // Update the event and re-sort to maintain order
        events: sortEvents(state.events.map((e) =>
            e.walletAddress === event.walletAddress &&
            e.tradeId === event.tradeId
                ? { ...e, ...event }
                : e
        )),
    })),

    setStatus: (status) => set({ status }),

    setFilter: (filter) => set((state) => ({
        filter: { ...state.filter, ...filter },
    })),

    resetFilter: () => set({ filter: defaultFilter }),

    setIsLoading: (isLoading) => set({ isLoading }),

    setError: (error) => set({ error }),

    clearEvents: () => set({ events: [] }),
}));
