import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Search,
  BarChart3,
  Settings,
  Activity,
  Wallet,
  Download,
  RefreshCw,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '../ui/sidebar';
import { CheckForUpdates, GetAppVersion } from '../../../wailsjs/go/main/App';
import { UpdateInfo } from '../../types';
import { useUIStore } from '../../store/uiStore';

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

export default function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const { showToast } = useUIStore();
  const [version, setVersion] = useState<string>('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const isCollapsed = state === 'collapsed';

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

  const isActive = (path: string, end?: boolean) => {
    if (end) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const NavItem = ({ to, icon: Icon, label, end }: { to: string; icon: any; label: string; end?: boolean }) => (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive(to, end)}
        tooltip={label}
      >
        <NavLink to={to} end={end}>
          <Icon className="size-4" />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="XTools">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-base">XTools</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Polymarket</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {polymarketItems.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItem to="/settings" icon={Settings} label="Settings" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {updateInfo?.isUpdateAvailable ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={openReleasePage}
                tooltip={`Update to ${updateInfo.latestVersion}`}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
              >
                <ExternalLink className="size-4" />
                <span className="truncate">Update {updateInfo.latestVersion}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleCheckForUpdates}
                disabled={isChecking}
                tooltip={isChecking ? 'Checking...' : 'Check for Updates'}
              >
                {isChecking ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                <span className="truncate">{isChecking ? 'Checking...' : 'Check Updates'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        {!isCollapsed && version && (
          <p className="text-[10px] text-sidebar-foreground/50 text-center font-mono px-2">
            v{version}
          </p>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
