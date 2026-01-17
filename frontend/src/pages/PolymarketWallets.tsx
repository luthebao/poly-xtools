import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    RefreshCw,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    X,
    Search,
    Wallet,
    ArrowUp,
    ArrowDown,
    ArrowUpDown,
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
import { useUIStore } from '../store/uiStore';
import { WalletProfile } from '../types';
import { GetPolymarketWallets } from '../../wailsjs/go/main/App';
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime';

function shortenAddress(addr: string): string {
    if (!addr || addr.length <= 10) return addr || '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

type SortField = 'address' | 'betCount' | 'joinDate' | 'freshnessLevel' | 'status';
type SortDirection = 'asc' | 'desc';

export default function PolymarketWallets() {
    const { showToast } = useUIStore();
    const [wallets, setWallets] = useState<WalletProfile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('betCount');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Filters
    const [addressFilter, setAddressFilter] = useState('');
    const [minTrades, setMinTrades] = useState<number | ''>('');
    const [maxTrades, setMaxTrades] = useState<number | ''>('');
    const [freshnessFilter, setFreshnessFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // Ref for auto-refresh
    const autoRefreshRef = useRef(autoRefresh);
    useEffect(() => {
        autoRefreshRef.current = autoRefresh;
    }, [autoRefresh]);

    // Handle sort click
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Get sort icon
    const getSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ArrowUpDown size={14} className="text-muted-foreground/50" />;
        }
        return sortDirection === 'asc'
            ? <ArrowUp size={14} className="text-primary" />
            : <ArrowDown size={14} className="text-primary" />;
    };

    // Filter and sort wallets
    const filteredAndSortedWallets = useMemo(() => {
        // First filter
        let result = wallets.filter(wallet => {
            // Address filter
            if (addressFilter) {
                const search = addressFilter.toLowerCase();
                if (!wallet.address.toLowerCase().includes(search)) return false;
            }
            // Min trades filter
            if (minTrades !== '' && wallet.betCount >= 0 && wallet.betCount < minTrades) return false;
            // Max trades filter
            if (maxTrades !== '' && wallet.betCount >= 0 && wallet.betCount > maxTrades) return false;
            // Freshness filter
            if (freshnessFilter !== 'all') {
                if (freshnessFilter === 'insider' && wallet.freshnessLevel !== 'insider') return false;
                if (freshnessFilter === 'fresh' && wallet.freshnessLevel !== 'fresh') return false;
                if (freshnessFilter === 'newbie' && wallet.freshnessLevel !== 'newbie') return false;
                if (freshnessFilter === 'none' && wallet.freshnessLevel) return false;
            }
            // Status filter
            if (statusFilter !== 'all') {
                if (statusFilter === 'fresh' && !wallet.isFresh) return false;
                if (statusFilter === 'analyzing' && wallet.betCount !== -1) return false;
                if (statusFilter === 'normal' && (wallet.isFresh || wallet.betCount === -1)) return false;
            }
            return true;
        });

        // Then sort
        result.sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'address':
                    comparison = a.address.localeCompare(b.address);
                    break;
                case 'betCount':
                    // Put pending (-1) at the end when sorting ascending
                    if (a.betCount === -1 && b.betCount === -1) comparison = 0;
                    else if (a.betCount === -1) comparison = 1;
                    else if (b.betCount === -1) comparison = -1;
                    else comparison = a.betCount - b.betCount;
                    break;
                case 'joinDate':
                    const dateA = a.joinDate || '';
                    const dateB = b.joinDate || '';
                    comparison = dateA.localeCompare(dateB);
                    break;
                case 'freshnessLevel':
                    const levelOrder: Record<string, number> = { 'insider': 0, 'fresh': 1, 'newbie': 2, '': 3 };
                    const levelA = levelOrder[a.freshnessLevel || ''] ?? 3;
                    const levelB = levelOrder[b.freshnessLevel || ''] ?? 3;
                    comparison = levelA - levelB;
                    break;
                case 'status':
                    // Fresh first, then analyzing, then normal
                    const statusOrder = (w: WalletProfile) => {
                        if (w.isFresh) return 0;
                        if (w.betCount === -1) return 1;
                        return 2;
                    };
                    comparison = statusOrder(a) - statusOrder(b);
                    break;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [wallets, addressFilter, minTrades, maxTrades, freshnessFilter, statusFilter, sortField, sortDirection]);

    // Paginated wallets
    const paginatedWallets = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return filteredAndSortedWallets.slice(start, end);
    }, [filteredAndSortedWallets, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredAndSortedWallets.length / pageSize);

    const loadWallets = useCallback(async (silent = false) => {
        try {
            if (!silent) setIsLoading(true);
            const w = await GetPolymarketWallets(10000);
            setWallets(w || []);
        } catch (err: any) {
            if (!silent) {
                const errorMsg = typeof err === 'string' ? err : err?.message || 'Failed to load wallets';
                showToast(errorMsg, 'error');
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, [showToast]);

    // Initial load
    useEffect(() => {
        loadWallets();
    }, [loadWallets]);

    // Auto-refresh every 10 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (autoRefreshRef.current) {
                loadWallets(true);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [loadWallets]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [addressFilter, minTrades, maxTrades, freshnessFilter, statusFilter, sortField, sortDirection]);

    const clearFilters = () => {
        setAddressFilter('');
        setMinTrades('');
        setMaxTrades('');
        setFreshnessFilter('all');
        setStatusFilter('all');
    };

    const hasActiveFilters = addressFilter !== '' || minTrades !== '' || maxTrades !== '' || freshnessFilter !== 'all' || statusFilter !== 'all';

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">Wallets</h1>
                    <Badge variant="outline" className="text-xs">
                        <Wallet size={12} className="mr-1" />
                        {wallets.length.toLocaleString()} total
                    </Badge>
                    <Badge variant="outline" className="text-xs text-orange-500 border-orange-500/50">
                        <AlertTriangle size={12} className="mr-1" />
                        {wallets.filter(w => w.isFresh).length.toLocaleString()} fresh
                    </Badge>
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                        {wallets.filter(w => w.betCount === -1).length.toLocaleString()} pending
                    </Badge>
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded border-border"
                        />
                        Auto-refresh
                    </label>
                    <Button variant="secondary" onClick={() => loadWallets()} loading={isLoading}>
                        <RefreshCw size={16} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="p-3 rounded-lg border border-border bg-card/50 mb-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Search size={14} className="text-muted-foreground" />
                        <Input
                            placeholder="Filter address..."
                            className="w-48 h-8"
                            value={addressFilter}
                            onChange={(e) => setAddressFilter(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Trades:</span>
                        <Input
                            type="number"
                            placeholder="Min"
                            className="w-20 h-8"
                            value={minTrades}
                            onChange={(e) => setMinTrades(e.target.value ? parseInt(e.target.value) : '')}
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input
                            type="number"
                            placeholder="Max"
                            className="w-20 h-8"
                            value={maxTrades}
                            onChange={(e) => setMaxTrades(e.target.value ? parseInt(e.target.value) : '')}
                        />
                    </div>

                    <Select value={freshnessFilter} onValueChange={setFreshnessFilter}>
                        <SelectTrigger className="w-32 h-8">
                            <SelectValue placeholder="Freshness" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Freshness</SelectItem>
                            <SelectItem value="insider">Insider</SelectItem>
                            <SelectItem value="fresh">Fresh</SelectItem>
                            <SelectItem value="newbie">Newbie</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-32 h-8">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="fresh">Fresh</SelectItem>
                            <SelectItem value="analyzing">Analyzing</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                        </SelectContent>
                    </Select>

                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters}>
                            <X size={14} />
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            {/* Wallets Table */}
            <div className="flex-1 min-h-0 rounded-lg border border-border bg-card/50 overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <span className="font-medium">
                        Wallets ({filteredAndSortedWallets.length}{filteredAndSortedWallets.length !== wallets.length ? ` / ${wallets.length}` : ''})
                    </span>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Per page:</span>
                            <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
                                <SelectTrigger className="w-20 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                    <SelectItem value="200">200</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
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
                </div>

                <div className="flex-1 overflow-y-auto">
                    {isLoading && wallets.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Loading wallets...
                        </div>
                    ) : filteredAndSortedWallets.length === 0 && !hasActiveFilters ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No wallets recorded yet
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-card border-b border-border z-10">
                                <tr>
                                    <th
                                        className="text-left px-4 py-2 font-medium cursor-pointer hover:bg-accent/50 select-none"
                                        onClick={() => handleSort('address')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Address
                                            {getSortIcon('address')}
                                        </div>
                                    </th>
                                    <th
                                        className="text-left px-4 py-2 font-medium cursor-pointer hover:bg-accent/50 select-none"
                                        onClick={() => handleSort('betCount')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Total Trades
                                            {getSortIcon('betCount')}
                                        </div>
                                    </th>
                                    <th
                                        className="text-left px-4 py-2 font-medium cursor-pointer hover:bg-accent/50 select-none"
                                        onClick={() => handleSort('joinDate')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Join Date
                                            {getSortIcon('joinDate')}
                                        </div>
                                    </th>
                                    <th
                                        className="text-left px-4 py-2 font-medium cursor-pointer hover:bg-accent/50 select-none"
                                        onClick={() => handleSort('freshnessLevel')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Freshness
                                            {getSortIcon('freshnessLevel')}
                                        </div>
                                    </th>
                                    <th
                                        className="text-left px-4 py-2 font-medium cursor-pointer hover:bg-accent/50 select-none"
                                        onClick={() => handleSort('status')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Status
                                            {getSortIcon('status')}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAndSortedWallets.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-muted-foreground">
                                            No wallets match the current filters
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedWallets.map((wallet) => (
                                        <tr key={wallet.address} className={`border-b border-border/50 hover:bg-accent/50 ${wallet.isFresh ? 'bg-orange-500/5' : ''}`}>
                                            <td className="px-4 py-2">
                                                <button
                                                    onClick={() => BrowserOpenURL(`https://polymarket.com/profile/${wallet.address}`)}
                                                    className="text-primary hover:underline font-mono text-xs"
                                                    title={wallet.address}
                                                >
                                                    {shortenAddress(wallet.address)}
                                                </button>
                                            </td>
                                            <td className="px-4 py-2">
                                                {wallet.betCount === -1 ? (
                                                    <span className="text-muted-foreground italic">Pending...</span>
                                                ) : (
                                                    <span className={wallet.isFresh ? 'text-orange-500 font-medium' : ''}>
                                                        {wallet.betCount}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-muted-foreground">
                                                {wallet.joinDate || '-'}
                                            </td>
                                            <td className="px-4 py-2">
                                                {wallet.freshnessLevel ? (
                                                    <Badge variant="outline" className={
                                                        wallet.freshnessLevel === 'insider' ? 'border-red-500 text-red-500' :
                                                        wallet.freshnessLevel === 'fresh' ? 'border-orange-500 text-orange-500' :
                                                        wallet.freshnessLevel === 'newbie' ? 'border-yellow-500 text-yellow-500' :
                                                        'border-muted-foreground text-muted-foreground'
                                                    }>
                                                        {wallet.freshnessLevel}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                {wallet.isFresh ? (
                                                    <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                                                        <AlertTriangle size={10} className="mr-1" />
                                                        Fresh
                                                    </Badge>
                                                ) : wallet.betCount === -1 ? (
                                                    <Badge variant="outline" className="text-muted-foreground">
                                                        Analyzing
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">Normal</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Bottom Pagination */}
                {totalPages > 1 && (
                    <div className="px-4 py-2 border-t border-border flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredAndSortedWallets.length)} of {filteredAndSortedWallets.length}
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
        </div>
    );
}
