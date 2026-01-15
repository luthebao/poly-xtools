import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, Play, Pause, FolderOpen } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import ConfirmModal from '../components/common/ConfirmModal';
import AccountEditor from '../components/AccountEditor';
import { useAccountStore } from '../store/accountStore';
import { useUIStore } from '../store/uiStore';
import { AccountConfig } from '../types';
import {
    GetAccounts,
    CreateAccount,
    DeleteAccount,
    UpdateAccount,
    GetWorkerStatus,
    StartAccount,
    StopAccount,
    GetConfigPath,
} from '../../wailsjs/go/main/App';

const createDefaultAccount = (): AccountConfig => ({
    id: '',
    username: '',
    enabled: false,
    authType: 'browser',
    debugMode: false,
    llmConfig: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 500,
        persona: 'You are a helpful assistant that replies to tweets in a professional and engaging manner.',
    },
    searchConfig: {
        keywords: [],
        excludeKeywords: [],
        blocklist: [],
        englishOnly: true,
        minFaves: 2,
        minReplies: 12,
        minRetweets: 10,
        maxAgeMins: 60,
        intervalSecs: 300,
    },
    replyConfig: {
        approvalMode: 'queue',
        maxReplyLength: 280,
        tone: 'professional',
        includeHashtags: false,
    },
    rateLimits: {
        searchesPerHour: 10,
        repliesPerHour: 5,
        repliesPerDay: 50,
        minDelayBetween: 60,
    },
});

export default function Accounts() {
    const { accounts, workerStatuses, setAccounts, setWorkerStatuses, removeAccount } = useAccountStore();
    const { showToast } = useUIStore();
    const [editingAccount, setEditingAccount] = useState<AccountConfig | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        try {
            const [accs, statuses] = await Promise.all([
                GetAccounts(),
                GetWorkerStatus(),
            ]);
            setAccounts(accs || []);
            setWorkerStatuses(statuses || {});
        } catch (err) {
            showToast('Failed to load accounts', 'error');
        }
    };

    const handleDelete = (id: string) => {
        setDeleteAccountId(id);
    };

    const confirmDelete = async () => {
        if (!deleteAccountId) return;
        try {
            await DeleteAccount(deleteAccountId);
            removeAccount(deleteAccountId);
            showToast('Account deleted', 'success');
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to delete account');
            console.error('DeleteAccount error:', err);
            showToast(errorMsg, 'error');
        } finally {
            setDeleteAccountId(null);
        }
    };

    const toggleAccount = async (id: string) => {
        try {
            if (workerStatuses[id]) {
                await StopAccount(id);
                showToast('Account stopped', 'info');
            } else {
                await StartAccount(id);
                showToast('Account started', 'success');
            }
            const statuses = await GetWorkerStatus();
            setWorkerStatuses(statuses || {});
        } catch (err: any) {
            showToast(err?.message || 'Failed to toggle account', 'error');
        }
    };

    const openConfigFile = async (id: string) => {
        const path = await GetConfigPath(id);
        showToast(`Config file: ${path}`, 'info');
    };

    const handleSaveAccount = async (updatedAccount: AccountConfig) => {
        try {
            if (isCreating) {
                await CreateAccount(updatedAccount as any);
                showToast('Account created successfully', 'success');
            } else {
                await UpdateAccount(updatedAccount as any);
                showToast('Account updated successfully', 'success');
            }
            setEditingAccount(null);
            setIsCreating(false);
            loadAccounts();
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to save account');
            console.error('SaveAccount error:', err);
            showToast(errorMsg, 'error');
        }
    };

    const handleAddAccount = () => {
        setIsCreating(true);
        setEditingAccount(createDefaultAccount());
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Accounts</h1>
                <Button onClick={handleAddAccount}>
                    <Plus size={16} />
                    Add Account
                </Button>
            </div>

            {accounts.length === 0 ? (
                <Card>
                    <div className="text-center py-12">
                        <p className="text-gray-400 mb-4">No accounts configured yet.</p>
                        <Button onClick={handleAddAccount}>
                            <Plus size={16} />
                            Add Your First Account
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {accounts.map((account) => (
                        <Card key={account.id}>
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-semibold">@{account.username}</h3>
                                        <span
                                            className={`px-2 py-0.5 text-xs rounded ${workerStatuses[account.id]
                                                    ? 'bg-green-600/20 text-green-400'
                                                    : 'bg-gray-600/20 text-gray-400'
                                                }`}
                                        >
                                            {workerStatuses[account.id] ? 'Running' : 'Stopped'}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs rounded bg-blue-600/20 text-blue-400">
                                            {account.authType.toUpperCase()}
                                        </span>
                                        {account.debugMode && (
                                            <span className="px-2 py-0.5 text-xs rounded bg-yellow-600/20 text-yellow-400">
                                                DEBUG
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <p className="text-gray-400">Keywords</p>
                                            <p className="font-medium">{account.searchConfig.keywords.length}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400">Approval Mode</p>
                                            <p className="font-medium capitalize">{account.replyConfig.approvalMode}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400">Search Interval</p>
                                            <p className="font-medium">{account.searchConfig.intervalSecs}s</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400">LLM Model</p>
                                            <p className="font-medium">{account.llmConfig.model}</p>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <p className="text-gray-400 text-sm">Keywords:</p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {account.searchConfig.keywords.slice(0, 5).map((kw, i) => (
                                                <span
                                                    key={i}
                                                    className="px-2 py-0.5 text-xs bg-gray-700 rounded"
                                                >
                                                    {kw}
                                                </span>
                                            ))}
                                            {account.searchConfig.keywords.length > 5 && (
                                                <span className="px-2 py-0.5 text-xs bg-gray-700 rounded">
                                                    +{account.searchConfig.keywords.length - 5} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 ml-4">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleAccount(account.id)}
                                        title={workerStatuses[account.id] ? 'Stop' : 'Start'}
                                    >
                                        {workerStatuses[account.id] ? (
                                            <Pause size={16} />
                                        ) : (
                                            <Play size={16} />
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openConfigFile(account.id)}
                                        title="Open Config"
                                    >
                                        <FolderOpen size={16} />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingAccount(account)}
                                        title="Edit"
                                    >
                                        <Edit2 size={16} />
                                    </Button>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        onClick={() => handleDelete(account.id)}
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Account Editor Modal */}
            {editingAccount && (
                <AccountEditor
                    account={editingAccount}
                    isCreating={isCreating}
                    onSave={handleSaveAccount}
                    onClose={() => {
                        setEditingAccount(null);
                        setIsCreating(false);
                    }}
                    showToast={showToast}
                />
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={deleteAccountId !== null}
                title="Delete Account"
                message="Are you sure you want to delete this account? This action cannot be undone."
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteAccountId(null)}
            />
        </div>
    );
}
