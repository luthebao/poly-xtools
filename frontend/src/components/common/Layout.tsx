import { Outlet } from 'react-router-dom';
import AppSidebar from './Sidebar';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';

export default function Layout() {
    return (
        <SidebarProvider defaultOpen={true}>
            <AppSidebar />
            <SidebarInset className="bg-background">
                <div className="p-6 h-full overflow-auto">
                    <Outlet />
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
