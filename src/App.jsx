import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, RequireAuth } from "./lib/auth";
import { ShopProvider } from "./lib/shop";
import { SyncProvider } from "./lib/sync";
import AppShell from "./components/layout/AppShell";
import Billing from "./pages/Billing";
import Configuration from "./pages/Configuration";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Reports from "./pages/Reports";
import ShopDetail from "./pages/ShopDetail";
import Users from "./pages/Users";

/** Wraps a page in the shell plus the auth guard and any role restriction. */
function Protected({ children, adminOnly = false, shopOnly = false }) {
  return (
    <RequireAuth adminOnly={adminOnly} shopOnly={shopOnly}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SyncProvider>
          <ShopProvider>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route
                path="/"
                element={
                  <Protected shopOnly>
                    <Overview />
                  </Protected>
                }
              />
              <Route
                path="/billing"
                element={
                  <Protected shopOnly>
                    <Billing />
                  </Protected>
                }
              />
              <Route
                path="/reports"
                element={
                  <Protected shopOnly>
                    <Reports />
                  </Protected>
                }
              />
              <Route
                path="/configuration"
                element={
                  <Protected shopOnly>
                    <Configuration />
                  </Protected>
                }
              />
              <Route
                path="/users"
                element={
                  <Protected adminOnly>
                    <Users />
                  </Protected>
                }
              />
              {/* The admin's read-only view of one shop's data. */}
              <Route
                path="/shops/:shopId"
                element={
                  <Protected adminOnly>
                    <ShopDetail />
                  </Protected>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ShopProvider>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
