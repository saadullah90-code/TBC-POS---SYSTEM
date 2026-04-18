import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import Pos from "./pages/pos";
import Inventory from "./pages/inventory";
import Users from "./pages/users";
import Sales from "./pages/sales";
import Invoice from "./pages/invoice";
import Receipt from "./pages/receipt";
import BarcodePrint from "./pages/barcode-print";
import CustomerDisplay from "./pages/customer-display";

import { AuthWrapper } from "./components/auth-wrapper";
import { Layout } from "./components/layout";

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
      <Route path="/login" component={Login} />
      <Route path="/customer-display" component={CustomerDisplay} />
      <Route path="/invoice/:id" component={Invoice} />
      <Route path="/receipt/:id" component={Receipt} />
      <Route path="/inventory/barcode-print/:barcode" component={BarcodePrint} />
      
      <Route path="/">
        <AuthWrapper>
          <Layout>
            <div className="p-8">Select an option from the sidebar.</div>
          </Layout>
        </AuthWrapper>
      </Route>

      <Route path="/dashboard">
        <AuthWrapper allowedRoles={["admin"]}>
          <Layout>
            <Dashboard />
          </Layout>
        </AuthWrapper>
      </Route>

      <Route path="/pos">
        <AuthWrapper allowedRoles={["admin", "cashier"]}>
          <Layout>
            <Pos />
          </Layout>
        </AuthWrapper>
      </Route>

      <Route path="/inventory">
        <AuthWrapper allowedRoles={["admin", "inventory"]}>
          <Layout>
            <Inventory />
          </Layout>
        </AuthWrapper>
      </Route>

      <Route path="/sales">
        <AuthWrapper allowedRoles={["admin"]}>
          <Layout>
            <Sales />
          </Layout>
        </AuthWrapper>
      </Route>

      <Route path="/users">
        <AuthWrapper allowedRoles={["admin"]}>
          <Layout>
            <Users />
          </Layout>
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
