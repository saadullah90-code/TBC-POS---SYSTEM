import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import Dashboard from "@/pages/dashboard/dashboard";
import Pos from "@/pages/pos/pos";
import Inventory from "@/pages/inventory/inventory";
import BulkAdd from "@/pages/inventory/bulk-add";
import Users from "@/pages/staff/users";
import Sales from "@/pages/sales/sales";
import CustomerDisplay from "@/pages/customer-display/customer-display";
import Invoice from "@/pages/print/invoice";
import Receipt from "@/pages/print/receipt";
import BarcodePrint from "@/pages/print/barcode-print";
import BarcodePrintBulk from "@/pages/print/barcode-print-bulk";

import { AuthWrapper } from "@/components/layout/auth-wrapper";
import { Layout } from "@/components/layout/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Public / standalone routes */}
      <Route path="/login" component={Login} />
      <Route path="/customer-display" component={CustomerDisplay} />

      {/* Print routes (no chrome) */}
      <Route path="/invoice/:id" component={Invoice} />
      <Route path="/receipt/:id" component={Receipt} />
      <Route path="/inventory/barcode-print/:barcode" component={BarcodePrint} />
      <Route path="/inventory/barcode-print-bulk" component={BarcodePrintBulk} />

      {/* App shell */}
      <Route path="/">
        <AuthWrapper>
          <Layout>
            <div className="p-8">Select an option from the sidebar.</div>
          </Layout>
        </AuthWrapper>
      </Route>

      <Route path="/dashboard">
        <AuthWrapper allowedRoles={["admin"]}>
          <Layout><Dashboard /></Layout>
        </AuthWrapper>
      </Route>

      <Route path="/pos">
        <AuthWrapper allowedRoles={["admin", "cashier"]}>
          <Layout><Pos /></Layout>
        </AuthWrapper>
      </Route>

      <Route path="/inventory">
        <AuthWrapper allowedRoles={["admin", "inventory"]}>
          <Layout><Inventory /></Layout>
        </AuthWrapper>
      </Route>

      <Route path="/inventory/bulk-add">
        <AuthWrapper allowedRoles={["admin", "inventory"]}>
          <Layout><BulkAdd /></Layout>
        </AuthWrapper>
      </Route>

      <Route path="/sales">
        <AuthWrapper allowedRoles={["admin"]}>
          <Layout><Sales /></Layout>
        </AuthWrapper>
      </Route>

      <Route path="/users">
        <AuthWrapper allowedRoles={["admin"]}>
          <Layout><Users /></Layout>
        </AuthWrapper>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
