import { useEffect, useState, useCallback } from 'react';
import { X, RefreshCw, Trash2, CheckCircle, AlertCircle, AlertTriangle, Info, Search, Filter } from 'lucide-react';
import Button from './Button';
import { ActivityLog } from '../../types';
import { GetAllActivityLogs, ClearActivityLogs } from '../../../wailsjs/go/main/App';

interface LogsViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LogsViewerModal({ isOpen, onClose }: LogsViewerModalProps) {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [filterType, setFilterType] = useState<string>('all');
    const [filterLevel, setFilterLevel] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const loadLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const allLogs = await GetAllActivityLogs(500);
            setLogs(allLogs || []);
        } catch (err) {
            console.error('Failed to load logs:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadLogs();
        }
    }, [isOpen, loadLogs]);

    useEffect(() => {
        if (!autoRefresh || !isOpen) return;
        const interval = setInterval(loadLogs, 2000);
        return () => clearInterval(interval);
    }, [autoRefresh, isOpen, loadLogs]);

    const handleClearAll = async () => {
        // Clear logs for all accounts by getting unique account IDs and clearing each
        const accountIds = [...new Set(logs.map(log => log.accountId))];
        for (const accountId of accountIds) {
            if (accountId) {
                await ClearActivityLogs(accountId);
            }
        }
        loadLogs();
    };

    const filteredLogs = logs.filter(log => {
        if (filterType !== 'all' && log.type !== filterType) return false;
        if (filterLevel !== 'all' && log.level !== filterLevel) return false;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                log.message.toLowerCase().includes(query) ||
                (log.details?.toLowerCase().includes(query)) ||
                log.accountId.toLowerCase().includes(query)
            );
        }
        return true;
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-card border border-border rounded-lg w-[90vw] max-w-5xl h-[80vh] flex flex-col shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold">Application Logs</h2>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded"
                            />
                            Auto-refresh
                        </label>
                        <Button variant="ghost" size="sm" onClick={loadLogs} disabled={isLoading}>
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleClearAll} disabled={logs.length === 0}>
                            <Trash2 size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <X size={16} />
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="p-3 border-b border-border flex flex-wrap items-center gap-3 bg-secondary/30">
                    <div className="flex items-center gap-2">
                        <Search size={16} className="text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search logs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-background border border-border rounded px-2 py-1 text-sm w-48"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-muted-foreground" />
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="bg-background border border-border rounded px-2 py-1 text-sm"
                        >
                            <option value="all">All Types</option>
                            <option value="search">Search</option>
                            <option value="reply">Reply</option>
                            <option value="auth">Auth</option>
                            <option value="error">Error</option>
                            <option value="worker">Worker</option>
                            <option value="config">Config</option>
                        </select>
                        <select
                            value={filterLevel}
                            onChange={(e) => setFilterLevel(e.target.value)}
                            className="bg-background border border-border rounded px-2 py-1 text-sm"
                        >
                            <option value="all">All Levels</option>
                            <option value="info">Info</option>
                            <option value="success">Success</option>
                            <option value="warning">Warning</option>
                            <option value="error">Error</option>
                        </select>
                    </div>
                    <span className="text-sm text-muted-foreground ml-auto">
                        {filteredLogs.length} / {logs.length} logs
                    </span>
                </div>

                {/* Logs Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredLogs.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                            {logs.length === 0 ? 'No logs yet' : 'No logs match the filters'}
                        </div>
                    ) : (
                        filteredLogs.map((log) => (
                            <LogItem key={log.id} log={log} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function LogItem({ log }: { log: ActivityLog }) {
    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'success':
                return <CheckCircle size={14} className="text-green-400" />;
            case 'error':
                return <AlertCircle size={14} className="text-red-400" />;
            case 'warning':
                return <AlertTriangle size={14} className="text-yellow-400" />;
            default:
                return <Info size={14} className="text-blue-400" />;
        }
    };

    const getLevelBorder = (level: string) => {
        switch (level) {
            case 'success': return 'border-l-green-500';
            case 'error': return 'border-l-red-500';
            case 'warning': return 'border-l-yellow-500';
            default: return 'border-l-blue-500';
        }
    };

    const getTypeBadge = (type: string) => {
        const colors: Record<string, string> = {
            search: 'bg-blue-600/20 text-blue-400',
            reply: 'bg-green-600/20 text-green-400',
            auth: 'bg-purple-600/20 text-purple-400',
            error: 'bg-red-600/20 text-red-400',
            worker: 'bg-yellow-600/20 text-yellow-400',
            config: 'bg-muted text-muted-foreground',
        };
        return colors[type] || 'bg-muted text-muted-foreground';
    };

    return (
        <div className={`p-2 bg-secondary/50 rounded border-l-4 ${getLevelBorder(log.level)}`}>
            <div className="flex items-start gap-2">
                <div className="mt-0.5">{getLevelIcon(log.level)}</div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 text-xs rounded ${getTypeBadge(log.type)}`}>
                            {log.type}
                        </span>
                        {log.accountId && (
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                {log.accountId}
                            </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(log.timestamp).toLocaleString()}
                        </span>
                    </div>
                    <p className="text-sm">{log.message}</p>
                    {log.details && (
                        <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-all font-mono bg-background/50 p-1 rounded">
                            {log.details}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
}
