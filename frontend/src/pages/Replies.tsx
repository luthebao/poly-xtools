import { useEffect } from 'react';
import { Check, X, Edit2 } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { useAccountStore } from '../store/accountStore';
import { useReplyStore } from '../store/replyStore';
import { useUIStore } from '../store/uiStore';
import { ApprovalQueueItem } from '../types';
import {
    GetAccounts,
    GetPendingReplies,
    ApproveReply,
    RejectReply,
} from '../../wailsjs/go/main/App';

export default function Replies() {
    const { accounts, activeAccountId, setAccounts, setActiveAccount } = useAccountStore();
    const { pendingReplies, setPendingReplies, removePendingReply } = useReplyStore();
    const { showToast } = useUIStore();

    useEffect(() => {
        loadAccounts();
    }, []);

    useEffect(() => {
        if (activeAccountId) {
            loadPendingReplies(activeAccountId);
        }
    }, [activeAccountId]);

    const loadAccounts = async () => {
        try {
            const accs = await GetAccounts();
            setAccounts(accs || []);
            if (accs?.length > 0 && !activeAccountId) {
                setActiveAccount(accs[0].id);
            }
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to load accounts');
            console.error('GetAccounts error:', err);
            showToast(errorMsg, 'error');
        }
    };

    const loadPendingReplies = async (accountId: string) => {
        try {
            const pending = await GetPendingReplies(accountId);
            setPendingReplies(accountId, pending || []);
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to load pending replies');
            console.error('GetPendingReplies error:', err);
            showToast(errorMsg, 'error');
        }
    };

    const handleApprove = async (replyId: string) => {
        try {
            await ApproveReply(replyId);
            if (activeAccountId) {
                removePendingReply(activeAccountId, replyId);
            }
            showToast('Reply approved and posted', 'success');
        } catch (err: any) {
            // Wails returns Go errors as strings, not objects with .message
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to approve reply');
            console.error('ApproveReply error:', err);
            showToast(errorMsg, 'error');
        }
    };

    const handleReject = async (replyId: string) => {
        try {
            await RejectReply(replyId);
            if (activeAccountId) {
                removePendingReply(activeAccountId, replyId);
            }
            showToast('Reply rejected', 'info');
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to reject reply');
            console.error('RejectReply error:', err);
            showToast(errorMsg, 'error');
        }
    };

    const currentPending = activeAccountId ? pendingReplies[activeAccountId] || [] : [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Reply Queue</h1>
            </div>

            {/* Account Selector */}
            <Card>
                <div className="flex items-center gap-4">
                    <select
                        value={activeAccountId || ''}
                        onChange={(e) => setActiveAccount(e.target.value)}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Select Account</option>
                        {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                                @{acc.username}
                            </option>
                        ))}
                    </select>
                    <Button
                        variant="secondary"
                        onClick={() => activeAccountId && loadPendingReplies(activeAccountId)}
                    >
                        Refresh
                    </Button>
                </div>
            </Card>

            {/* Pending Replies */}
            <Card title={`Pending Approvals (${currentPending.length})`}>
                {currentPending.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">
                        No pending replies. Replies awaiting approval will appear here.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {currentPending.map((item) => (
                            <ApprovalCard
                                key={item.reply.id}
                                item={item}
                                onApprove={() => handleApprove(item.reply.id)}
                                onReject={() => handleReject(item.reply.id)}
                            />
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}

interface ApprovalCardProps {
    item: ApprovalQueueItem;
    onApprove: () => void;
    onReject: () => void;
}

function ApprovalCard({ item, onApprove, onReject }: ApprovalCardProps) {
    return (
        <div className="p-4 bg-gray-700/50 rounded-lg">
            {/* Original Tweet */}
            <div className="mb-4">
                <p className="text-xs text-gray-400 mb-1">Original Tweet</p>
                <div className="p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">
                            {item.originalTweet.authorName || item.originalTweet.authorUsername}
                        </span>
                        <span className="text-gray-400 text-sm">@{item.originalTweet.authorUsername}</span>
                    </div>
                    <p className="text-gray-200">{item.originalTweet.text}</p>
                </div>
            </div>

            {/* Generated Reply */}
            <div className="mb-4">
                <p className="text-xs text-gray-400 mb-1">Generated Reply</p>
                <div className="p-3 bg-blue-900/30 border border-blue-800 rounded-lg">
                    <p className="text-gray-100">{item.reply.text}</p>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                    Queued {new Date(item.queuedAt).toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm">
                        <Edit2 size={14} />
                        Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={onReject}>
                        <X size={14} />
                        Reject
                    </Button>
                    <Button size="sm" onClick={onApprove}>
                        <Check size={14} />
                        Approve
                    </Button>
                </div>
            </div>
        </div>
    );
}
