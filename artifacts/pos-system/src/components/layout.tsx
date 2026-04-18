import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  LogOut,
  Receipt,
  MonitorPlay
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: user } = useGetCurrentUser();
  const logoutMutation = useLogout();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
    { href: "/pos", label: "Point of Sale", icon: ShoppingCart, roles: ["admin", "cashier"] },
    { href: "/inventory", label: "Inventory", icon: Package, roles: ["admin", "inventory"] },
    { href: "/sales", label: "Sales History", icon: Receipt, roles: ["admin"] },
    { href: "/users", label: "Staff", icon: Users, roles: ["admin"] },
    { href: "/customer-display", label: "Customer Display", icon: MonitorPlay, roles: ["admin", "cashier"] },
  ];

  const allowedItems = navItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="w-64 border-r border-border bg-card flex flex-col no-print">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="font-bold text-xl text-primary flex items-center gap-2">
            <Package className="h-6 w-6" />
            <span>NEXUS POS</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div 
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                    isActive 
                      ? "bg-primary/10 text-primary font-medium" 
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 px-3 py-2 mb-2 rounded-md bg-secondary/50">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold uppercase shrink-0">
              {user?.name.charAt(0) || "U"}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground leading-none truncate">{user?.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{user?.role}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              title="Sign Out"
              data-testid="button-logout-icon"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {logoutMutation.isPending ? "Signing Out..." : "Sign Out"}
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
