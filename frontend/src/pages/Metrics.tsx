import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, MessageSquare, Clock, RefreshCw, ChevronRight } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { Badge } from '../components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../components/ui/table';
import { useAccountStore } from '../store/accountStore';
import { useUIStore } from '../store/uiStore';
import { DailyStats, ReplyPerformanceReport } from '../types';
import {
    GetAccounts,
    GetDailyStats,
    GetReplyPerformance,
} from '../../wailsjs/go/main/App';

export default function Metrics() {
    const navigate = useNavigate();
    const { accounts, setAccounts } = useAccountStore();
    const { showToast } = useUIStore();
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
    const [replyPerformance, setReplyPerformance] = useState<ReplyPerformanceReport | null>(null);
    const [days, setDays] = useState(7);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        loadAccounts();
    }, []);

    useEffect(() => {
        if (selectedAccountId) {
            loadMetrics(selectedAccountId);
        } else {
            setDailyStats([]);
            setReplyPerformance(null);
        }
    }, [selectedAccountId, days]);

    // Auto-refresh effect
    useEffect(() => {
        if (!autoRefresh || !selectedAccountId) return;

        const interval = setInterval(() => {
            loadMetrics(selectedAccountId, true);
        }, 5000);

        return () => clearInterval(interval);
    }, [autoRefresh, selectedAccountId, days]);

    const loadAccounts = async () => {
        try {
            const accs = await GetAccounts();
            setAccounts(accs || []);
            if (accs?.length > 0 && !selectedAccountId) {
                setSelectedAccountId(accs[0].id);
            }
        } catch (err) {
            showToast('Failed to load accounts', 'error');
        }
    };

    const loadMetrics = async (accountId: string, silent = false) => {
        if (!silent) setIsRefreshing(true);
        try {
            const [stats, performance] = await Promise.all([
                GetDailyStats(accountId, days),
                GetReplyPerformance(accountId, days),
            ]);
            setDailyStats(stats || []);
            setReplyPerformance(performance || null);
        } catch (err) {
            if (!silent) showToast('Failed to load metrics', 'error');
        } finally {
            if (!silent) setIsRefreshing(false);
        }
    };

    const handleManualRefresh = () => {
        if (selectedAccountId) {
            loadMetrics(selectedAccountId);
        }
    };

    const totalReplies = dailyStats.reduce((sum, s) => sum + s.repliesSent, 0);
    const totalSearched = dailyStats.reduce((sum, s) => sum + s.tweetsSearched, 0);
    const totalTokens = dailyStats.reduce((sum, s) => sum + s.tokensUsed, 0);

    const selectedAccount = accounts.find(a => a.id === selectedAccountId);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Metrics</h1>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManualRefresh}
                    disabled={isRefreshing || !selectedAccountId}
                >
                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Account</label>
                            <Select
                                value={selectedAccountId}
                                onValueChange={setSelectedAccountId}
                            >
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((acc) => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            @{acc.username}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Period</label>
                            <Select
                                value={days.toString()}
                                onValueChange={(v) => setDays(Number(v))}
                            >
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7">Last 7 days</SelectItem>
                                    <SelectItem value="14">Last 14 days</SelectItem>
                                    <SelectItem value="30">Last 30 days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded bg-secondary border-border"
                            />
                            <span className="text-sm text-muted-foreground">Auto-refresh</span>
                            {autoRefresh && (
                                <span className="flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                            )}
                        </label>

                        {selectedAccount && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/accounts/${selectedAccountId}`)}
                            >
                                View Account
                                <ChevronRight size={14} />
                            </Button>
                        )}
                    </div>
                </div>
            </Card>

            {!selectedAccountId ? (
                <Card>
                    <p className="text-muted-foreground text-center py-12">
                        Select an account to view metrics.
                    </p>
                </Card>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="p-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-500/10 rounded-lg">
                                    <BarChart3 className="text-blue-400" size={24} />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Tweets Searched</p>
                                    <p className="text-2xl font-bold">{totalSearched.toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-green-500/10 rounded-lg">
                                    <MessageSquare className="text-green-400" size={24} />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Replies Sent</p>
                                    <p className="text-2xl font-bold text-green-500">{totalReplies}</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-yellow-500/10 rounded-lg">
                                    <TrendingUp className="text-yellow-400" size={24} />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Avg Likes/Reply</p>
                                    <p className="text-2xl font-bold">
                                        {replyPerformance?.avgLikesPerReply?.toFixed(1) || '0'}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-purple-500/10 rounded-lg">
                                    <Clock className="text-purple-400" size={24} />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Tokens Used</p>
                                    <p className="text-2xl font-bold">{totalTokens.toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Performance Summary */}
                    {replyPerformance && (
                        <Card title="Reply Performance">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="p-3 bg-secondary/50 rounded-lg text-center">
                                    <p className="text-2xl font-bold">{replyPerformance.totalReplies}</p>
                                    <p className="text-xs text-muted-foreground">Total Replies</p>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-green-500">{replyPerformance.successfulReplies}</p>
                                    <p className="text-xs text-muted-foreground">Successful</p>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-red-500">{replyPerformance.failedReplies}</p>
                                    <p className="text-xs text-muted-foreground">Failed</p>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-yellow-500">{replyPerformance.pendingReplies}</p>
                                    <p className="text-xs text-muted-foreground">Pending</p>
                                </div>
                                <div className="p-3 bg-secondary/50 rounded-lg text-center">
                                    <p className="text-2xl font-bold">{replyPerformance.avgImpressionsPerReply?.toFixed(0) || '0'}</p>
                                    <p className="text-xs text-muted-foreground">Avg Impressions</p>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Daily Stats Table */}
                    <Card title="Daily Activity">
                        {dailyStats.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">
                                No data available for the selected period.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead className="text-right">Searched</TableHead>
                                            <TableHead className="text-right">Generated</TableHead>
                                            <TableHead className="text-right">Sent</TableHead>
                                            <TableHead className="text-right">Failed</TableHead>
                                            <TableHead className="text-right">Tokens</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dailyStats.map((stat) => (
                                            <TableRow key={stat.date}>
                                                <TableCell className="font-medium">
                                                    {new Date(stat.date).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">{stat.tweetsSearched}</TableCell>
                                                <TableCell className="text-right">{stat.repliesGenerated}</TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                                        {stat.repliesSent}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {stat.repliesFailed > 0 ? (
                                                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                                                            {stat.repliesFailed}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground">0</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">{stat.tokensUsed.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}
