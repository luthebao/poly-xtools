import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useUIStore } from '../../store/uiStore';

export default function Layout() {
    const { sidebarCollapsed } = useUIStore();

    return (
        <div className="flex h-screen bg-background text-foreground">
            <Sidebar />
            <main
                className={`flex-1 overflow-auto transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'
                    }`}
            >
                <div className="p-6">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
