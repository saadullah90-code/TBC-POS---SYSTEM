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
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 flex flex-col no-print relative glossy border-r border-white/5">
        <div className="h-20 flex items-center justify-center px-6 border-b border-white/5">
          <div className="rounded-2xl bg-black px-4 py-2.5 shadow-[0_6px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10">
            <span className="text-xl font-black tracking-tight text-white drop-shadow-[0_1px_2px_rgba(255,255,255,0.15)]">
              BranX<span style={{ color: "#f63d25" }}>*</span>{" "}
              <span className="text-white/95">POS</span>
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-1.5">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 relative ${
                    isActive
                      ? "glossy-brand font-semibold text-white"
                      : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" : ""}`} />
                  <span className="text-sm">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 mt-auto space-y-2">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06]">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold uppercase shrink-0 glossy-brand"
              style={{ fontSize: 14 }}
            >
              {user?.name.charAt(0) || "U"}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-semibold text-white leading-none truncate">{user?.name}</span>
              <span className="text-xs text-white/50 capitalize mt-0.5">{user?.role}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 shrink-0 rounded-lg"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              title="Sign Out"
              data-testid="button-logout-icon"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <Button
            className="w-full justify-center glossy-brand border-0 hover:opacity-95"
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
