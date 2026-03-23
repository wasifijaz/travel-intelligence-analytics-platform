import { Routes, Route } from 'react-router-dom'
import DashboardLayout from './components/DashboardLayout'
import Dashboard from './pages/Dashboard'
import GlobalCrisis from './pages/GlobalCrisis'
import HotelChains from './pages/HotelChains'
import OTAIntelligence from './pages/OTAIntelligence'
import TravelTech from './pages/TravelTech'
import TMCDMC from './pages/TMCDMC'
import OTADashboard from './pages/OTADashboard'
import StockAnalysis from './pages/StockAnalysis'
import Metrics from './pages/Metrics'
import TravelDemandIntelligence from './pages/TravelDemandIntelligence'

function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="global-crisis" element={<GlobalCrisis />} />
        <Route path="hotel-chains" element={<HotelChains />} />
        <Route path="tmc-dmc" element={<TMCDMC />} />
        <Route path="travel-tech" element={<TravelTech />} />
        <Route path="ota" element={<OTADashboard />} />
        <Route path="market-intel" element={<OTAIntelligence />} />
        <Route path="travel-demand-intelligence" element={<TravelDemandIntelligence />} />
        <Route path="stock-analysis" element={<StockAnalysis />} />
        <Route path="metrics" element={<Metrics />} />
      </Route>
    </Routes>
  )
}

export default App
