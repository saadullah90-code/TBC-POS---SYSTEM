import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface AuthWrapperProps {
  children: React.ReactNode;
  allowedRoles?: ("admin" | "cashier" | "inventory")[];
}

export function AuthWrapper({ children, allowedRoles }: AuthWrapperProps) {
  const { data: user, isLoading } = useGetCurrentUser();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      if (user.role === "admin") setLocation("/dashboard");
      else if (user.role === "cashier") setLocation("/pos");
      else if (user.role === "inventory") setLocation("/inventory");
      else setLocation("/");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
