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
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/accounts', icon: Users, label: 'Accounts' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/metrics', icon: BarChart3, label: 'Metrics' },
  { to: '/polymarket', icon: Activity, label: 'Polymarket Live', end: true },
  { to: '/polymarket/wallets', icon: Wallet, label: 'Wallets' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 h-full bg-card border-r border-border transition-all duration-300 z-10 flex flex-col",
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex items-center justify-between p-4 h-16">
          {!sidebarCollapsed && (
            <h1 className="text-xl font-bold text-primary">XTools</h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn("h-8 w-8", sidebarCollapsed && "mx-auto")}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </Button>
        </div>

        <Separator />

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label, end }) => {
            const linkContent = (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <Icon size={20} />
                {!sidebarCollapsed && <span className="font-medium">{label}</span>}
              </NavLink>
            );

            if (sidebarCollapsed) {
              return (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>
                    {linkContent}
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
