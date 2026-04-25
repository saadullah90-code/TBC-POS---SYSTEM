import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tag,
  Users,
  LogOut,
  Receipt,
  MonitorPlay,
  Sparkles,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: string[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: user } = useGetCurrentUser();
  const logoutMutation = useLogout();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const displayName =
    (user && typeof user.name === "string" && user.name.trim()) || "User";
  const displayInitial = displayName.charAt(0).toUpperCase();
  const displayRole =
    (user && typeof user.role === "string" && user.role) || "";

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  const sections: NavSection[] = [
    {
      label: "Overview",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
      ],
    },
    {
      label: "Operations",
      items: [
        { href: "/pos", label: "Point of Sale", icon: ShoppingCart, roles: ["admin", "cashier"] },
        { href: "/customer-display", label: "Customer Display", icon: MonitorPlay, roles: ["admin", "cashier"] },
      ],
    },
    {
      label: "Management",
      items: [
        { href: "/inventory", label: "Inventory", icon: Package, roles: ["admin", "inventory"] },
        { href: "/inventory/discounts", label: "Discounts", icon: Tag, roles: ["admin", "inventory"] },
        { href: "/sales", label: "Sales History", icon: Receipt, roles: ["admin"] },
        { href: "/users", label: "Staff", icon: Users, roles: ["admin"] },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/settings/printers", label: "Printers", icon: Printer, roles: ["admin", "cashier", "inventory"] },
      ],
    },
  ];

  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((i) => user && i.roles.includes(user.role)) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-72 flex flex-col no-print relative sidebar-surface">
        {/* Brand */}
        <div className="px-6 pt-6 pb-5">
          <div className="brand-card flex items-center gap-3 px-4 py-3 rounded-2xl">
            <div className="w-10 h-10 rounded-xl glossy-brand flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-black tracking-tight text-white">
                BranX<span style={{ color: "#f63d25" }}>*</span> POS
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 mt-0.5">
                Retail Suite
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
          {visibleSections.map((section) => (
            <div key={section.label}>
              <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                {section.label}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                          isActive
                            ? "nav-active text-white font-semibold"
                            : "text-white/65 hover:text-white hover:bg-white/[0.05]"
                        }`}
                      >
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute -left-4 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full bg-[#f63d25] shadow-[0_0_12px_rgba(246,61,37,0.7)]"
                          />
                        )}
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                            isActive
                              ? "bg-white/15 ring-1 ring-white/20"
                              : "bg-white/[0.04] ring-1 ring-white/[0.06] group-hover:bg-white/[0.08]"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm tracking-tight">{item.label}</span>
                        {isActive && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Profile */}
        <div className="p-4 border-t border-white/5">
          <div className="profile-card flex items-center gap-3 p-3 rounded-2xl">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold uppercase shrink-0 glossy-brand text-sm"
            >
              {displayInitial}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-semibold text-white leading-tight truncate">
                {displayName}
              </span>
              <span className="text-[11px] text-white/45 capitalize mt-0.5 leading-none">
                {displayRole}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-white/55 hover:text-white hover:bg-white/[0.08] shrink-0 rounded-xl"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              title="Sign Out"
              data-testid="button-logout-icon"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
