import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/common/Layout';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Search from './pages/Search';
import Metrics from './pages/Metrics';
import Settings from './pages/Settings';
import PolymarketWatcher from './pages/PolymarketWatcher';
import PolymarketWallets from './pages/PolymarketWallets';
import { Toaster } from './components/ui/sonner';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="accounts" element={<Accounts />} />
                    <Route path="accounts/:accountId" element={<AccountDetail />} />
                    <Route path="search" element={<Search />} />
                    <Route path="metrics" element={<Metrics />} />
                    <Route path="polymarket" element={<PolymarketWatcher />} />
                    <Route path="polymarket/wallets" element={<PolymarketWallets />} />
                    <Route path="settings" element={<Settings />} />
                </Route>
            </Routes>
            <Toaster />
        </BrowserRouter>
    );
}

export default App;
