import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { FilterProvider } from '../context/FilterContext'
import GlobalFilterBar from './GlobalFilterBar'

export default function DashboardLayout() {
  return (
    <FilterProvider>
      <div className="min-h-screen flex bg-slate-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <GlobalFilterBar />
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </FilterProvider>
  )
}
