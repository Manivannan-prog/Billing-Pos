import { BrowserRouter, Routes, Route } from "react-router-dom";

import Sidebar from "./components/Sidebar";
import Home from "./components/Home";
import Dashboard from "./components/Dashboard";
import Billing from "./components/Billing";
import Configuration from "./components/Configuration";
import Header from "./components/Header";
import Receipt from "./components/Receipt";

function App() {
  return (
    <BrowserRouter>
      <div className="flex">
        <div className="print-hidden">
  <Sidebar />
</div>

        <div className="flex-1 min-h-screen bg-slate-100">
  <div className="print-hidden">
  <Header />
</div>

  <main className="p-8">
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