import { useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, FileText, Download, ExternalLink, Check, Trash2, AlertTriangle, Database, ScrollText, Bell, Send, Eye, EyeOff } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import ConfirmModal from '../components/common/ConfirmModal';
import LogsViewerModal from '../components/common/LogsViewerModal';
import { useUIStore } from '../store/uiStore';
import { UpdateInfo, DatabaseInfo, NotificationConfig } from '../types';
import { CheckForUpdates, GetAppVersion, GetDataDir, GetDatabaseInfo, ClearPolymarketEvents, OpenFolder, GetNotificationConfig, SetNotificationConfig, SendTestNotification } from '../../wailsjs/go/main/App';

export default function Settings() {
    const { showToast } = useUIStore();
    const [version, setVersion] = useState<string>('');
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [dataDir, setDataDir] = useState<string>('');
    const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
    const [isClearing, setIsClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showLogsModal, setShowLogsModal] = useState(false);

    // Notification settings
    const [notificationConfig, setNotificationConfig] = useState<NotificationConfig | null>(null);
    const [telegramBotToken, setTelegramBotToken] = useState('');
    const [telegramChatIDs, setTelegramChatIDs] = useState(''); // Comma-separated string
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [isSavingNotification, setIsSavingNotification] = useState(false);
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [showBotToken, setShowBotToken] = useState(false);

    const DB_SIZE_WARNING_THRESHOLD = 20 * 1024 * 1024; // 20MB

    useEffect(() => {
        loadVersion();
        loadDataDir();
        loadDbInfo();
        loadNotificationConfig();
    }, []);

    const loadNotificationConfig = async () => {
        try {
            const config = await GetNotificationConfig();
            setNotificationConfig(config);
            setTelegramBotToken(config.telegramBotToken || '');
            // Join array into comma-separated string for display
            setTelegramChatIDs((config.telegramChatIDs || []).join(', '));
            setNotificationsEnabled(config.enabled || false);
        } catch (err) {
            console.error('Failed to load notification config:', err);
        }
    };

    // Parse comma-separated chat IDs into array
    const parseChatIDs = (input: string): string[] => {
        return input.split(',').map(id => id.trim()).filter(id => id.length > 0);
    };

    const handleSaveNotificationConfig = async () => {
        setIsSavingNotification(true);
        try {
            const chatIDsArray = parseChatIDs(telegramChatIDs);
            const newConfig: NotificationConfig = {
                enabled: notificationsEnabled,
                channel: 'telegram',
                telegramBotToken,
                telegramChatIDs: chatIDsArray,
                notifyBigTrades: notificationConfig?.notifyBigTrades ?? false,
                notifyFreshWallets: notificationConfig?.notifyFreshWallets ?? false,
            };
            await SetNotificationConfig(newConfig);
            setNotificationConfig(newConfig);
            showToast('Notification settings saved', 'success');
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to save notification settings');
            showToast(errorMsg, 'error');
        } finally {
            setIsSavingNotification(false);
        }
    };

    const handleSendTestNotification = async () => {
        // Save first if config changed
        const currentChatIDsStr = (notificationConfig?.telegramChatIDs || []).join(', ');
        if (telegramBotToken !== notificationConfig?.telegramBotToken ||
            telegramChatIDs !== currentChatIDsStr ||
            notificationsEnabled !== notificationConfig?.enabled) {
            await handleSaveNotificationConfig();
        }

        setIsSendingTest(true);
        try {
            await SendTestNotification();
            showToast('Test notification sent! Check your Telegram.', 'success');
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to send test notification');
            showToast(errorMsg, 'error');
        } finally {
            setIsSendingTest(false);
        }
    };

    const loadVersion = async () => {
        try {
            const v = await GetAppVersion();
            setVersion(v);
        } catch (err) {
            console.error('Failed to get version:', err);
        }
    };

    const loadDataDir = async () => {
        try {
            const dir = await GetDataDir();
            setDataDir(dir);
        } catch (err) {
            console.error('Failed to get data dir:', err);
        }
    };

    const loadDbInfo = async () => {
        try {
            const info = await GetDatabaseInfo();
            setDbInfo(info);
        } catch (err) {
            console.error('Failed to get db info:', err);
        }
    };

    const handleClearData = async () => {
        setIsClearing(true);
        try {
            await ClearPolymarketEvents();
            showToast('Polymarket data cleared successfully', 'success');
            loadDbInfo();
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to clear data');
            showToast(errorMsg, 'error');
        } finally {
            setIsClearing(false);
            setShowClearConfirm(false);
        }
    };

    const handleCheckForUpdates = async () => {
        setIsChecking(true);
        try {
            const info = await CheckForUpdates();
            setUpdateInfo(info);
            if (info.isUpdateAvailable) {
                showToast(`New version ${info.latestVersion} available!`, 'info');
            } else {
                showToast('You are using the latest version', 'success');
            }
        } catch (err: any) {
            const errorMsg = typeof err === 'string' ? err : (err?.message || 'Failed to check for updates');
            showToast(errorMsg, 'error');
        } finally {
            setIsChecking(false);
        }
    };

    const openReleasePage = () => {
        if (updateInfo?.releaseUrl) {
            window.open(updateInfo.releaseUrl, '_blank');
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Settings</h1>

            {/* Telegram Notifications Card */}
            <Card title="Telegram Notifications">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bell size={18} className={notificationsEnabled ? 'text-primary' : 'text-muted-foreground'} />
                            <span className="font-medium">Enable Notifications</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={notificationsEnabled}
                                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                        </label>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        Receive Telegram notifications for big trades and fresh wallet detections.
                        Create a bot via <a href="https://t.me/botfather" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@BotFather</a> and get your Chat ID from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@userinfobot</a>.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Bot Token</label>
                            <div className="relative">
                                <Input
                                    type={showBotToken ? 'text' : 'password'}
                                    placeholder="1234567890:ABCdef..."
                                    value={telegramBotToken}
                                    onChange={(e) => setTelegramBotToken(e.target.value)}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowBotToken(!showBotToken)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showBotToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Chat / Group IDs</label>
                            <Input
                                type="text"
                                placeholder="-100123456789, -100987654321"
                                value={telegramChatIDs}
                                onChange={(e) => setTelegramChatIDs(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Separate multiple IDs with commas</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSaveNotificationConfig}
                            loading={isSavingNotification}
                            disabled={!telegramBotToken || !telegramChatIDs.trim()}
                        >
                            <Check size={16} />
                            Save
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSendTestNotification}
                            loading={isSendingTest}
                            disabled={!notificationsEnabled || !telegramBotToken || !telegramChatIDs.trim()}
                        >
                            <Send size={16} />
                            Send Test
                        </Button>
                        {notificationConfig?.enabled && notificationConfig?.telegramBotToken && (notificationConfig?.telegramChatIDs?.length ?? 0) > 0 && (
                            <Badge variant="outline" className="text-green-500 border-green-500/50">
                                <Check size={12} className="mr-1" />
                                Configured ({notificationConfig.telegramChatIDs.length} chat{notificationConfig.telegramChatIDs.length !== 1 ? 's' : ''})
                            </Badge>
                        )}
                    </div>
                </div>
            </Card>

            <Card title="Data Directory">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            All application data is stored in the following directory:
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 bg-secondary px-3 py-2 rounded text-sm font-mono break-all">
                                {dataDir || 'Loading...'}
                            </code>
                            <Button variant="secondary" size="sm" onClick={() => dataDir && OpenFolder(dataDir)}>
                                <FolderOpen size={16} />
                                Open
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>

            <Card title="Database">
                <div className="space-y-4">
                    {dbInfo && (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Size</p>
                                    <div className="flex items-center gap-2">
                                        <Database size={16} className="text-muted-foreground" />
                                        <span className="font-medium">{dbInfo.sizeFormatted}</span>
                                        {dbInfo.sizeBytes > DB_SIZE_WARNING_THRESHOLD && (
                                            <Badge variant="destructive" className="ml-1">
                                                <AlertTriangle size={12} className="mr-1" />
                                                Large
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Polymarket Events</p>
                                    <p className="font-medium">{dbInfo.eventCount.toLocaleString()}</p>
                                </div>
                            </div>

                            {dbInfo.sizeBytes > DB_SIZE_WARNING_THRESHOLD && (
                                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                                    <AlertTriangle size={18} className="text-destructive mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-destructive">Database Size Warning</p>
                                        <p className="text-sm text-muted-foreground">
                                            The database is over 20MB. Consider clearing old Polymarket events to free up space.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-2 border-t border-border">
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setShowClearConfirm(true)}
                                    disabled={isClearing || dbInfo.eventCount === 0}
                                >
                                    <Trash2 size={16} />
                                    Clear Polymarket Data
                                </Button>
                                <Button variant="ghost" size="sm" onClick={loadDbInfo}>
                                    <RefreshCw size={16} />
                                    Refresh
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Card>

            <Card title="Debug Logs">
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        View application logs to debug issues. Logs include authentication errors, search operations,
                        worker status, and other activity across all accounts.
                    </p>
                    <Button variant="secondary" onClick={() => setShowLogsModal(true)}>
                        <ScrollText size={16} />
                        Open Logs Viewer
                    </Button>
                </div>
            </Card>

            <Card title="Configuration Files">
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        Account configurations are stored as YAML files in the <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">data/accounts/</code> directory.
                        You can edit these files manually and reload them.
                    </p>

                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => dataDir && OpenFolder(`${dataDir}/accounts`)}>
                            <FolderOpen size={16} />
                            Open Config Folder
                        </Button>
                        <Button variant="secondary">
                            <RefreshCw size={16} />
                            Reload All Configs
                        </Button>
                    </div>
                </div>
            </Card>

            <Card title="Data Export">
                <div className="space-y-4">
                    <p className="text-muted-foreground">
                        Found tweets are automatically saved to Excel files in the <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">data/exports/</code> directory.
                        Each account has its own export file.
                    </p>

                    <Button variant="secondary" onClick={() => dataDir && OpenFolder(`${dataDir}/exports`)}>
                        <FileText size={16} />
                        Open Exports Folder
                    </Button>
                </div>
            </Card>

            <Card title="About">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <p><strong className="text-foreground">XTools</strong> - Twitter Automation Tool</p>
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Version</span>
                            <Badge variant="outline">{version || '...'}</Badge>
                            {updateInfo && !updateInfo.isUpdateAvailable && (
                                <span className="flex items-center gap-1 text-sm text-green-500">
                                    <Check size={14} />
                                    Up to date
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Built with Wails, Go, React, and TailwindCSS.
                        </p>
                    </div>

                    {/* Update Checker */}
                    <div className="pt-2 border-t border-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium">Check for Updates</p>
                                <p className="text-xs text-muted-foreground">
                                    Check GitHub releases for new versions
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCheckForUpdates}
                                disabled={isChecking}
                            >
                                {isChecking ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <Download size={14} />
                                        Check for Updates
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Update Available Notification */}
                        {updateInfo?.isUpdateAvailable && (
                            <div className="mt-4 p-4 bg-primary/10 border border-primary/20 rounded-lg">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <p className="font-medium text-primary">
                                            New Version Available!
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Version <strong className="text-foreground">{updateInfo.latestVersion}</strong> is available.
                                            You are currently using version {updateInfo.currentVersion}.
                                        </p>
                                        {updateInfo.publishedAt && (
                                            <p className="text-xs text-muted-foreground">
                                                Released: {new Date(updateInfo.publishedAt).toLocaleDateString()}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={openReleasePage}
                                    >
                                        <ExternalLink size={14} />
                                        Download
                                    </Button>
                                </div>

                                {/* Release Notes */}
                                {updateInfo.releaseNotes && (
                                    <div className="mt-3 pt-3 border-t border-primary/20">
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Release Notes:</p>
                                        <div className="text-sm text-muted-foreground max-h-32 overflow-y-auto">
                                            <pre className="whitespace-pre-wrap font-sans text-xs">
                                                {updateInfo.releaseNotes}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <ConfirmModal
                isOpen={showClearConfirm}
                onCancel={() => setShowClearConfirm(false)}
                onConfirm={handleClearData}
                title="Clear Polymarket Data"
                message="Are you sure you want to delete all Polymarket events from the database? This action cannot be undone."
                confirmText="Clear Data"
                variant="danger"
            />

            <LogsViewerModal
                isOpen={showLogsModal}
                onClose={() => setShowLogsModal(false)}
            />
        </div>
    );
}
