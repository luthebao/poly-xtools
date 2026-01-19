import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    Play,
    Square,
    RefreshCw,
    Filter,
    X,
    Activity,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Wallet,
    Loader2,
    Zap,
    Settings,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Bell,
    BellOff,
} from 'lucide-react';
import Button from '../components/common/Button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../components/ui/dialog';
import { useUIStore } from '../store/uiStore';
import { usePolymarketStore } from '../store/polymarketStore';
import { PolymarketEvent, PolymarketConfig, WalletProfile, NotificationConfig } from '../types';
import {
    StartPolymarketWatcher,
    StopPolymarketWatcher,
    GetPolymarketWatcherStatus,
    GetPolymarketEvents,
    SetPolymarketSaveFilter,
    GetPolymarketSaveFilter,
    GetPolymarketConfig,
    SetPolymarketConfig,
    GetPolymarketWallets,
    GetNotificationConfig,
    SetNotificationConfig,
} from '../../wailsjs/go/main/App';
import { EventsOn, EventsOff, BrowserOpenURL } from '../../wailsjs/runtime/runtime';
import { cn } from '@/lib/utils';

const EVENT_TYPE_LABELS: Record<string, string> = {
    trade: 'Trade',
    book: 'Order Book',
    price_change: 'Price Change',
    last_trade_price: 'Last Trade',
    tick_size_change: 'Tick Size Change',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
    trade: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    book: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    price_change: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    last_trade_price: 'bg-green-500/10 text-green-500 border-green-500/20',
    tick_size_change: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

export default function PolymarketWatcher() {
    const { showToast } = useUIStore();
    const {
        events,
        status,
        filter,
        isLoading,
        setEvents,
        addEvent,
        updateEvent,
        setStatus,
        setFilter,
        resetFilter,
        setIsLoading,
    } = usePolymarketStore();

    const [showFilters, setShowFilters] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [config, setConfig] = useState<PolymarketConfig | null>(null);
    // Fresh wallets from DB for highlighting (stores full profiles)
    const [freshWalletProfiles, setFreshWalletProfiles] = useState<Map<string, WalletProfile>>(new Map());
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);
    // Local table filters (not affecting DB save)
    const [tableShowFreshOnly, setTableShowFreshOnly] = useState(false);
    const [tableMinValue, setTableMinValue] = useState<number | ''>('');
    const [tableMaxValue, setTableMaxValue] = useState<number | ''>('');
    // Bet count thresholds
    const [freshInsiderMaxBets, setFreshInsiderMaxBets] = useState(3);
    const [freshWalletMaxBets, setFreshWalletMaxBets] = useState(10);
    const [freshNewbieMaxBets, setFreshNewbieMaxBets] = useState(20);
    const [customFreshMaxBets, setCustomFreshMaxBets] = useState(0);

    // Notification settings
    const [notificationConfig, setNotificationConfig] = useState<NotificationConfig | null>(null);
    const [notifyBigTrades, setNotifyBigTrades] = useState(false);

    // Helper to get notional value
    const getEventNotional = (event: PolymarketEvent): number => {
        if (!event.price || !event.size) return 0;
        const price = parseFloat(event.price);
        const size = parseFloat(event.size);
        if (isNaN(price) || isNaN(size)) return 0;
        return price * size;
    };

    // Helper to check if wallet is fresh (from DB)
    const isWalletFresh = useCallback((walletAddress: string | undefined): boolean => {
        if (!walletAddress) return false;
        return freshWalletProfiles.has(walletAddress.toLowerCase());
    }, [freshWalletProfiles]);

    // Helper to get wallet profile from DB
    const getWalletProfileFromDB = useCallback((walletAddress: string | undefined): WalletProfile | undefined => {
        if (!walletAddress) return undefined;
        return freshWalletProfiles.get(walletAddress.toLowerCase());
    }, [freshWalletProfiles]);

    // Filtered events based on local table filters
    const filteredEvents = useMemo(() => {
        return events.filter(event => {
            // Fresh wallet filter - check both event flag and DB
            if (tableShowFreshOnly) {
                const isFresh = event.isFreshWallet === true || isWalletFresh(event.walletAddress);
                if (!isFresh) return false;
            }
            // Min value filter
            const notional = getEventNotional(event);
            if (tableMinValue !== '' && notional < tableMinValue) return false;
            // Max value filter
            if (tableMaxValue !== '' && notional > tableMaxValue) return false;
            return true;
        });
    }, [events, tableShowFreshOnly, tableMinValue, tableMaxValue, isWalletFresh]);

    // Paginated events
    const paginatedEvents = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return filteredEvents.slice(start, end);
    }, [filteredEvents, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredEvents.length / pageSize);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [tableShowFreshOnly, tableMinValue, tableMaxValue]);

    const loadConfig = useCallback(async () => {
        try {
            const cfg = await GetPolymarketConfig();
            setConfig(cfg);
            setFreshInsiderMaxBets(cfg.freshInsiderMaxBets || 3);
            setFreshWalletMaxBets(cfg.freshWalletMaxBets || 10);
            setFreshNewbieMaxBets(cfg.freshNewbieMaxBets || 20);
            setCustomFreshMaxBets(cfg.customFreshMaxBets || 0);
        } catch (err) {
            console.error('Failed to load config:', err);
        }
    }, []);

    const loadNotificationConfig = useCallback(async () => {
        try {
            const cfg = await GetNotificationConfig();
            setNotificationConfig(cfg);
            setNotifyBigTrades(cfg.notifyBigTrades || false);
        } catch (err) {
            console.error('Failed to load notification config:', err);
        }
    }, []);

    // Load fresh wallets from DB for highlighting
    const loadFreshWallets = useCallback(async () => {
        try {
            const wallets = await GetPolymarketWallets(10000);
            const profileMap = new Map<string, WalletProfile>();
            (wallets || []).forEach((w: WalletProfile) => {
                if (w.isFresh) {
                    profileMap.set(w.address.toLowerCase(), w);
                }
            });
            setFreshWalletProfiles(profileMap);
        } catch (err) {
            console.error('Failed to load fresh wallets:', err);
        }
    }, []);

    const loadSavedFilter = useCallback(async () => {
        try {
            const savedFilter = await GetPolymarketSaveFilter();
            if (savedFilter) {
                setFilter(savedFilter);
            }
        } catch (err) {
            console.error('Failed to load saved filter:', err);
        }
    }, [setFilter]);

    const loadStatus = useCallback(async () => {
        try {
            const s = await GetPolymarketWatcherStatus();
            setStatus(s);
        } catch (err) {
            console.error('Failed to get status:', err);
        }
        // setStatus is stable from zustand
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadEvents = useCallback(async () => {
        try {
            setIsLoading(true);
            const evts = await GetPolymarketEvents({ ...filter, limit: 1000 }); // Load more events for pagination
            setEvents(evts || []);
            setCurrentPage(1); // Reset to first page on load
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : err?.message || 'Failed to load events';
            showToast(errorMsg, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [filter, setEvents, setIsLoading, showToast]);

    // Refs for event handlers to avoid recreating subscriptions
    const autoRefreshRef = useRef(autoRefresh);
    const filterMinSizeRef = useRef(filter.minSize);
    const addEventRef = useRef(addEvent);
    const updateEventRef = useRef(updateEvent);
    const showToastRef = useRef(showToast);

    // Keep refs in sync
    useEffect(() => {
        autoRefreshRef.current = autoRefresh;
        filterMinSizeRef.current = filter.minSize;
        addEventRef.current = addEvent;
        updateEventRef.current = updateEvent;
        showToastRef.current = showToast;
    }, [autoRefresh, filter.minSize, addEvent, updateEvent, showToast]);

    // Initial load - runs once on mount
    useEffect(() => {
        loadStatus();
        loadEvents();
        loadConfig();
        loadSavedFilter();
        loadFreshWallets();
        loadNotificationConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Event subscriptions - set up once and use refs for changing values
    useEffect(() => {
        const handleEvent = (event: PolymarketEvent) => {
            if (!autoRefreshRef.current) return;
            const notional = getNotionalValue(event);
            const minValue = filterMinSizeRef.current || 100;
            if (notional < minValue) return;
            addEventRef.current(event);
        };

        const handleFreshWallet = (event: PolymarketEvent) => {
            // Update the event in the list with fresh wallet data
            updateEventRef.current(event);

            // Show toast notification for high confidence fresh wallets
            if (event.riskScore && event.riskScore >= 0.7) {
                const freshnessLabel = event.walletProfile?.freshnessLevel || 'fresh';
                const betCount = event.walletProfile?.betCount ?? 0;
                showToastRef.current(
                    `🚨 Fresh Wallet (${freshnessLabel}, ${betCount} bets): ${shortenAddress(event.walletAddress || '')} - $${formatNotionalValue(event)}`,
                    'warning'
                );
            }
        };

        EventsOn('polymarket:event', handleEvent);
        EventsOn('polymarket:fresh_wallet', handleFreshWallet);

        return () => {
            EventsOff('polymarket:event');
            EventsOff('polymarket:fresh_wallet');
        };
    }, []);

    // Status polling - separate interval
    useEffect(() => {
        const statusInterval = setInterval(loadStatus, 3000);
        return () => clearInterval(statusInterval);
    }, [loadStatus]);

    // Fresh wallets polling - refresh every 10 seconds
    useEffect(() => {
        const walletsInterval = setInterval(loadFreshWallets, 10000);
        return () => clearInterval(walletsInterval);
    }, [loadFreshWallets]);

    const handleStart = async () => {
        try {
            await StartPolymarketWatcher();
            showToast('Polymarket watcher started', 'success');
            loadStatus();
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : err?.message || 'Failed to start watcher';
            showToast(errorMsg, 'error');
        }
    };

    const handleStop = async () => {
        try {
            await StopPolymarketWatcher();
            showToast('Polymarket watcher stopped', 'info');
            loadStatus();
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : err?.message || 'Failed to stop watcher';
            showToast(errorMsg, 'error');
        }
    };

    const handleApplyFilters = async () => {
        try {
            await SetPolymarketSaveFilter(filter);
            showToast('Filter applied - only matching events will be saved', 'success');
        } catch (err) {
            console.error('Failed to set save filter:', err);
        }
        loadEvents();
        setShowFilters(false);
    };

    const handleResetFilters = async () => {
        resetFilter();
        try {
            await SetPolymarketSaveFilter({ minSize: 100 });
        } catch (err) {
            console.error('Failed to reset save filter:', err);
        }
        loadEvents();
    };

    const handleSaveSettings = async () => {
        if (!config) return;
        try {
            const updatedConfig: PolymarketConfig = {
                ...config,
                freshInsiderMaxBets,
                freshWalletMaxBets,
                freshNewbieMaxBets,
                customFreshMaxBets,
            };
            await SetPolymarketConfig(updatedConfig);
            setConfig(updatedConfig);

            // Also save notification settings if changed
            if (notificationConfig && notifyBigTrades !== notificationConfig.notifyBigTrades) {
                const updatedNotificationConfig: NotificationConfig = {
                    ...notificationConfig,
                    notifyBigTrades,
                };
                await SetNotificationConfig(updatedNotificationConfig);
                setNotificationConfig(updatedNotificationConfig);
            }

            showToast('Settings saved. Restart watcher to apply changes.', 'success');
            setShowSettings(false);
        } catch (err) {
            console.error('Failed to save settings:', err);
            showToast('Failed to save settings', 'error');
        }
    };

    const formatTimestamp = (ts: string) => {
        if (!ts) return '-';
        const date = new Date(ts);
        return date.toLocaleString();
    };

    const getStatusBadge = () => {
        if (status.isConnecting) {
            return (
                <Badge variant="secondary" className="flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" />
                    Connecting...
                </Badge>
            );
        }
        if (status.isRunning) {
            return <Badge variant="default" className="bg-green-500">Connected</Badge>;
        }
        return <Badge variant="secondary">Disconnected</Badge>;
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">Polymarket Watcher</h1>
                    <Badge variant="outline" className="text-xs">
                        Live Data Feed
                    </Badge>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowFilters(true)}>
                        <Filter size={16} />
                        Filters
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
                        <Settings size={16} />
                        Settings
                    </Button>
                    {status.isRunning || status.isConnecting ? (
                        <Button variant="danger" onClick={handleStop}>
                            <Square size={16} />
                            Stop
                        </Button>
                    ) : (
                        <Button variant="primary" onClick={handleStart}>
                            <Play size={16} />
                            Start
                        </Button>
                    )}
                    <Button variant="secondary" onClick={loadEvents} loading={isLoading}>
                        <RefreshCw size={16} />
                    </Button>
                </div>
            </div>

            {/* Status Bar */}
            <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg border border-border bg-card/50 mb-4">
                <div className="flex items-center gap-2">
                    <Activity size={18} className={status.isRunning ? 'text-green-500' : 'text-muted-foreground'} />
                    <span className="text-sm font-medium">Status:</span>
                    {getStatusBadge()}
                </div>

                <div className="flex items-center gap-2">
                    <Zap size={16} className="text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Trades:</span>
                    <span className="font-mono font-medium">{(status.tradesReceived || status.eventsReceived).toLocaleString()}</span>
                </div>

                <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-orange-500" />
                    <span className="text-sm text-muted-foreground">Fresh Wallets:</span>
                    <span className="font-mono font-medium text-orange-500">{(status.freshWalletsFound || 0).toLocaleString()}</span>
                </div>

                {status.lastEventAt && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Last:</span>
                        <span className="text-sm">{formatTimestamp(status.lastEventAt)}</span>
                    </div>
                )}

                {status.errorMessage && (
                    <div className="flex items-center gap-2 text-destructive">
                        <span className="text-sm">Error: {status.errorMessage}</span>
                    </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded border-border"
                        />
                        Auto-refresh
                    </label>
                </div>
            </div>

            {/* Events List - Flex 1 to fill remaining height */}
            <div className="flex-1 min-h-0 rounded-lg border border-border bg-card/50 overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <span className="font-medium">Events ({filteredEvents.length}{filteredEvents.length !== events.length ? ` / ${events.length}` : ''})</span>
                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={16} />
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight size={16} />
                            </Button>
                        </div>
                    )}
                </div>
                {/* Table Filter Bar */}
                <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={tableShowFreshOnly}
                            onChange={(e) => setTableShowFreshOnly(e.target.checked)}
                            className="rounded border-border"
                        />
                        <AlertTriangle size={14} className="text-orange-500" />
                        Fresh Wallets Only
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Value:</span>
                        <Input
                            type="number"
                            placeholder="Min"
                            className="w-24 h-8"
                            value={tableMinValue}
                            onChange={(e) => setTableMinValue(e.target.value ? parseFloat(e.target.value) : '')}
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input
                            type="number"
                            placeholder="Max"
                            className="w-24 h-8"
                            value={tableMaxValue}
                            onChange={(e) => setTableMaxValue(e.target.value ? parseFloat(e.target.value) : '')}
                        />
                    </div>
                    {(tableShowFreshOnly || tableMinValue !== '' || tableMaxValue !== '') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setTableShowFreshOnly(false);
                                setTableMinValue('');
                                setTableMaxValue('');
                            }}
                        >
                            <X size={14} />
                            Clear
                        </Button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {events.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {status.isRunning
                                ? 'Waiting for events...'
                                : 'Start the watcher to receive events'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {paginatedEvents.map((event) => (
                                <EventCard
                                    key={event.id || `${event.timestamp}-${event.tradeId}`}
                                    event={event}
                                    isWalletFreshFromDB={isWalletFresh(event.walletAddress)}
                                    walletProfileFromDB={getWalletProfileFromDB(event.walletAddress)}
                                />
                            ))}
                        </div>
                    )}
                </div>
                {/* Bottom Pagination */}
                {totalPages > 1 && (
                    <div className="px-4 py-2 border-t border-border flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredEvents.length)} of {filteredEvents.length}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                            >
                                First
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={16} />
                                Prev
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Next
                                <ChevronRight size={16} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                            >
                                Last
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Filter Modal */}
            <Dialog open={showFilters} onOpenChange={setShowFilters}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Filter size={20} />
                            Event Filters
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Event Type</label>
                                <Select
                                    value={filter.eventTypes?.[0] || 'all'}
                                    onValueChange={(value) =>
                                        setFilter({ eventTypes: value === 'all' ? [] : [value] })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        <SelectItem value="trade">Trades</SelectItem>
                                        <SelectItem value="book">Order Book</SelectItem>
                                        <SelectItem value="price_change">Price Change</SelectItem>
                                        <SelectItem value="last_trade_price">Last Trade</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Side</label>
                                <Select
                                    value={filter.side || 'all'}
                                    onValueChange={(value) => setFilter({ side: value === 'all' ? '' : value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Sides" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Sides</SelectItem>
                                        <SelectItem value="BUY">Buy</SelectItem>
                                        <SelectItem value="SELL">Sell</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Market Name</label>
                                <Input
                                    placeholder="Search by name..."
                                    value={filter.marketName || ''}
                                    onChange={(e) => setFilter({ marketName: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Min Price</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={filter.minPrice || ''}
                                    onChange={(e) => setFilter({ minPrice: parseFloat(e.target.value) || 0 })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Max Price</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="1.00"
                                    value={filter.maxPrice || ''}
                                    onChange={(e) => setFilter({ maxPrice: parseFloat(e.target.value) || 0 })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Min Value ($)</label>
                                <Input
                                    type="number"
                                    step="10"
                                    placeholder="100"
                                    value={filter.minSize || 100}
                                    onChange={(e) => setFilter({ minSize: parseFloat(e.target.value) || 100 })}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={handleResetFilters}>
                            <X size={14} />
                            Reset
                        </Button>
                        <Button variant="primary" onClick={handleApplyFilters}>
                            Apply Filters
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Settings Modal */}
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Settings size={20} />
                            Fresh Wallet Detection Settings
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Telegram Notifications Toggle */}
                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {notifyBigTrades ? (
                                        <Bell size={16} className="text-primary" />
                                    ) : (
                                        <BellOff size={16} className="text-muted-foreground" />
                                    )}
                                    <span className="font-medium">Telegram Notifications</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={notifyBigTrades}
                                        onChange={(e) => setNotifyBigTrades(e.target.checked)}
                                        className="sr-only peer"
                                        disabled={!notificationConfig?.enabled || !notificationConfig?.telegramBotToken}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary peer-disabled:opacity-50"></div>
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                {notificationConfig?.enabled && notificationConfig?.telegramBotToken
                                    ? 'Receive notifications for big trades matching your filter settings.'
                                    : 'Configure Telegram in Settings page first to enable notifications.'}
                            </p>
                        </div>

                        {/* Fresh Wallet Detection Info */}
                        <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                            <div className="flex items-center gap-2 text-orange-500 font-medium mb-2">
                                <Wallet size={16} />
                                Bet Count Based Detection
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Fresh wallet detection uses the Polymarket Data API to count total bets made by a wallet.
                                Wallets with fewer bets are more likely to be fresh insiders or new accounts.
                            </p>
                        </div>

                        {/* Threshold Settings */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        🚨 Fresh Insider (0-N bets)
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Highest confidence - likely insider trading
                                    </p>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={freshInsiderMaxBets}
                                        onChange={(e) => setFreshInsiderMaxBets(parseInt(e.target.value) || 0)}
                                        className="w-24"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        🔥 Fresh Wallet (0-N bets)
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        High confidence - very new wallet
                                    </p>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={freshWalletMaxBets}
                                        onChange={(e) => setFreshWalletMaxBets(parseInt(e.target.value) || 0)}
                                        className="w-24"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        ⚡ Fresh Newbie (0-N bets)
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Medium confidence - new user
                                    </p>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={freshNewbieMaxBets}
                                        onChange={(e) => setFreshNewbieMaxBets(parseInt(e.target.value) || 0)}
                                        className="w-24"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        ✨ Custom Threshold (0 = disabled)
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Override: any wallet up to N bets
                                    </p>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1000}
                                        value={customFreshMaxBets}
                                        onChange={(e) => setCustomFreshMaxBets(parseInt(e.target.value) || 0)}
                                        className="w-24"
                                    />
                                </div>
                            </div>

                            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                                <strong>How it works:</strong> When a trade is detected, the system queries the Polymarket API
                                to count the wallet's total bets. If the count is within a threshold, it's flagged as fresh.
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setFreshInsiderMaxBets(config?.freshInsiderMaxBets || 3);
                                setFreshWalletMaxBets(config?.freshWalletMaxBets || 10);
                                setFreshNewbieMaxBets(config?.freshNewbieMaxBets || 20);
                                setCustomFreshMaxBets(config?.customFreshMaxBets || 0);
                                setShowSettings(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleSaveSettings}>
                            Save Settings
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

interface EventCardProps {
    event: PolymarketEvent;
    isWalletFreshFromDB: boolean;
    walletProfileFromDB?: WalletProfile;
}

function shortenAddress(addr: string): string {
    if (!addr || addr.length <= 10) return addr || '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getNotionalValue(event: PolymarketEvent): number {
    if (!event.price || !event.size) return 0;
    const price = parseFloat(event.price);
    const size = parseFloat(event.size);
    if (isNaN(price) || isNaN(size)) return 0;
    return price * size;
}

function formatNotionalValue(event: PolymarketEvent): string {
    return getNotionalValue(event).toFixed(2);
}

function EventCard({ event, isWalletFreshFromDB, walletProfileFromDB }: EventCardProps) {
    const openUrl = (url: string) => {
        BrowserOpenURL(url);
    };

    const getTraderProfileUrl = () => {
        if (event.walletAddress) {
            return `https://polymarket.com/profile/${event.walletAddress}`;
        }
        return null;
    };

    const getEventUrl = () => {
        if (event.marketLink) {
            return event.marketLink;
        }
        if (event.eventSlug) {
            return `https://polymarket.com/event/${event.eventSlug}`;
        }
        return null;
    };

    // Highlight if either the event is marked fresh OR the wallet is fresh in DB
    const isFresh = event.isFreshWallet === true || isWalletFreshFromDB;
    const eventUrl = getEventUrl();
    // Use wallet profile from DB if available, otherwise use event's wallet profile
    const walletProfile = walletProfileFromDB || event.walletProfile;

    return (
        <div
            className={`p-2 rounded-lg border text-xs ${isFresh
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-border bg-card/50'
                }`}
        >
            {/* Header: Side + Value + Time */}
            <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1">
                    {event.side === 'BUY' ? (
                        <TrendingUp size={12} className="text-green-500" />
                    ) : (
                        <TrendingDown size={12} className="text-red-500" />
                    )}
                    <span className={`font-medium ${event.side === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>
                        ${formatNotionalValue(event)}
                    </span>
                </div>
                <span className="text-muted-foreground">
                    {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            {/* Price & Shares */}
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
                <span>
                    <span className="text-foreground font-medium">{parseFloat(event.price || '0').toFixed(2)}¢</span> × <span className="text-foreground font-medium">{parseFloat(event.size || '0').toFixed(0)}</span> shares
                </span>
            </div>

            {/* Fresh Wallet Badge */}
            {isFresh && (
                <div className="flex items-center gap-1 mb-1">
                    <AlertTriangle size={10} className="text-orange-500" />
                    <span className="text-orange-500 font-medium">
                        {walletProfile?.totalTxCount ?? '?'} trades
                        {walletProfile?.joinDate && ` · ${walletProfile.joinDate}`}
                    </span>
                </div>
            )}

            {/* Market Name with Link */}
            <div className="flex items-center gap-1 mb-1">
                <div className="text-muted-foreground text-wrap flex-1" title={event.eventTitle || event.marketName}>
                    {event.outcome && <span className={cn(
                        "font-bold",
                        event.outcome && event.outcome === "Yes" ? "text-green-800" : "text-red-800"
                    )}>{event.outcome}: </span>}
                    {event.eventTitle || event.marketName || event.marketSlug || '-'}
                </div>
                {eventUrl && (
                    <button
                        onClick={() => openUrl(eventUrl)}
                        className="text-muted-foreground hover:text-primary shrink-0"
                        title="Open event on Polymarket"
                    >
                        <ExternalLink size={12} />
                    </button>
                )}
            </div>

            {/* Wallet Link */}
            {event.walletAddress && (
                <button
                    onClick={() => openUrl(getTraderProfileUrl()!)}
                    className="text-primary hover:underline font-mono truncate block"
                    title={event.walletAddress}
                >
                    {shortenAddress(event.walletAddress)}
                </button>
            )}
        </div>
    );
}
