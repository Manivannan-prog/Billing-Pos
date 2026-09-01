import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";

import Sidebar from "./components/Sidebar";
import Home from "./components/Home";
import Dashboard from "./components/Dashboard";
import Billing from "./components/Billing";
import Configuration from "./components/Configuration";
import Header from "./components/Header";
import Receipt from "./components/Receipt";
import { syncPendingSales } from "./utils/storage";

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    syncPendingSales();

    const handleOnline = () => {
      syncPendingSales();
    };

    window.addEventListener("online", handleOnline);

    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <div
          className={`print-hidden fixed inset-y-0 left-0 z-40 transition-transform ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onNavigate={() => setIsSidebarOpen(false)} />
        </div>

        {isSidebarOpen && (
          <button
            aria-label="Close navigation"
            onClick={() => setIsSidebarOpen(false)}
            className="print-hidden fixed inset-0 z-30 bg-slate-900/30"
          />
        )}

        <div className="min-h-screen bg-slate-100">
  <div className="print-hidden">
  <Header onMenuClick={() => setIsSidebarOpen((isOpen) => !isOpen)} />
</div>

  <main className="p-4 md:p-8">
   <Routes>
  <Route path="/" element={<Home />} />
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/billing" element={<Billing />} />
  <Route path="/configuration" element={<Configuration />} />
  <Route path="/receipt" element={<Receipt />} />
</Routes>
  </main>
</div>
      </div>
    </BrowserRouter>
  );
}

export default App;
