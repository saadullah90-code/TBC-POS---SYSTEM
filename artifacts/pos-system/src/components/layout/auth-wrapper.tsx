import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface AuthWrapperProps {
  children: React.ReactNode;
  allowedRoles?: ("admin" | "cashier" | "inventory")[];
}

export function AuthWrapper({ children, allowedRoles }: AuthWrapperProps) {
  const { data: user, isLoading, isFetched } = useGetCurrentUser();
  const [, setLocation] = useLocation();

  // Only treat as unauthenticated when the fetch *completed* and returned no user.
  // We deliberately do NOT include `isError` here: a transient 401 right after
  // login (cookie race against the immediate background refetch) would otherwise
  // bounce the user back to /login while the cached user is still truthy → which
  // creates an infinite redirect loop with the Login page's own useEffect.
  // A real logout/expiry will clear the cached user via the logout mutation,
  // so `!user` will be true.
  const unauthenticated = !isLoading && isFetched && !user;

  useEffect(() => {
    if (isLoading) return;
    if (unauthenticated) {
      setLocation("/login");
      return;
    }
    if (user && allowedRoles && !allowedRoles.includes(user.role)) {
      if (user.role === "admin") setLocation("/dashboard");
      else if (user.role === "cashier") setLocation("/pos");
      else if (user.role === "inventory") setLocation("/inventory");
      else setLocation("/");
    }
  }, [user, isLoading, unauthenticated, allowedRoles, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (unauthenticated || !user) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
