import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Search,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  Wallet,
  Download,
  RefreshCw,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { CheckForUpdates, GetAppVersion } from '../../../wailsjs/go/main/App';
import { UpdateInfo } from '../../types';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/accounts', icon: Users, label: 'Accounts' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/metrics', icon: BarChart3, label: 'Metrics' },
];

const polymarketItems = [
  { to: '/polymarket', icon: Activity, label: 'Live Feed', end: true },
  { to: '/polymarket/wallets', icon: Wallet, label: 'Wallets' },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, showToast } = useUIStore();
  const [version, setVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    GetAppVersion().then(setVersion).catch(console.error);
  }, []);

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

  const NavItem = ({ to, icon: Icon, label, end }: { to: string; icon: any; label: string; end?: boolean }) => {
    const linkContent = (
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            "flex items-center rounded-lg transition-all duration-200",
            sidebarCollapsed
              ? "justify-center h-10 w-full"
              : "gap-3 px-3 py-2.5",
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )
        }
      >
        <Icon size={20} className="shrink-0" />
        {!sidebarCollapsed && <span className="font-medium">{label}</span>}
      </NavLink>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {linkContent}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="font-medium">
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  const SectionLabel = ({ label }: { label: string }) => {
    if (sidebarCollapsed) return null;
    return (
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 pt-4 pb-1">
        {label}
      </p>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 h-full bg-gradient-to-b from-card to-card/95 border-r border-border/50 transition-all duration-300 z-10 flex flex-col backdrop-blur-sm",
          sidebarCollapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Header / Logo */}
        <div className={cn(
          "flex items-center h-14 border-b border-border/50",
          sidebarCollapsed ? "justify-center" : "justify-between px-3"
        )}>
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSidebar}
                  className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  <Sparkles size={18} className="text-primary-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            </Tooltip>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                  <Sparkles size={16} className="text-primary-foreground" />
                </div>
                <span className="text-base font-bold">XTools</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-8 w-8 rounded-lg hover:bg-accent"
              >
                <ChevronLeft size={16} />
              </Button>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          <SectionLabel label="Main" />
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          <SectionLabel label="Polymarket" />
          {polymarketItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          <SectionLabel label="System" />
          <NavItem to="/settings" icon={Settings} label="Settings" />
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border/50 p-2">
          {/* Update Button */}
          {updateInfo?.isUpdateAvailable ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={openReleasePage}
                  className={cn(
                    "w-full h-10 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700",
                    sidebarCollapsed ? "justify-center" : "justify-start gap-2 px-3"
                  )}
                >
                  <ExternalLink size={18} className="shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="truncate text-sm">Update {updateInfo.latestVersion}</span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="font-medium">
                Update to {updateInfo.latestVersion}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCheckForUpdates}
                  disabled={isChecking}
                  className={cn(
                    "w-full h-10 rounded-lg text-muted-foreground hover:text-foreground",
                    sidebarCollapsed ? "justify-center" : "justify-start gap-2 px-3"
                  )}
                >
                  {isChecking ? (
                    <RefreshCw size={18} className="shrink-0 animate-spin" />
                  ) : (
                    <Download size={18} className="shrink-0" />
                  )}
                  {!sidebarCollapsed && (
                    <span className="truncate text-sm">{isChecking ? 'Checking...' : 'Check Updates'}</span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="font-medium">
                {isChecking ? 'Checking...' : 'Check for Updates'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Version */}
          {!sidebarCollapsed && version && (
            <p className="text-[10px] text-muted-foreground/50 text-center font-mono mt-2">
              v{version}
            </p>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
