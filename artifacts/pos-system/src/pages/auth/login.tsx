import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const { data: user, isLoading: isCheckingAuth } = useGetCurrentUser();

  useEffect(() => {
    if (user) {
      if (user.role === "admin") setLocation("/dashboard");
      else if (user.role === "cashier") setLocation("/pos");
      else if (user.role === "inventory") setLocation("/inventory");
      else setLocation("/");
    }
  }, [user, setLocation]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user);
          if (data.user.role === "admin") setLocation("/dashboard");
          else if (data.user.role === "cashier") setLocation("/pos");
          else if (data.user.role === "inventory") setLocation("/inventory");
          else setLocation("/");
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Login Failed",
            description: error?.error || "Invalid credentials. Please try again.",
          });
        },
      }
    );
  }

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
      {/* Premium ambient lighting */}
      <div className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] rounded-full pointer-events-none" style={{ background: "radial-gradient(closest-side, rgba(246,61,37,0.22), transparent 70%)", filter: "blur(40px)" }} />
      <div className="absolute bottom-[-15%] right-[-10%] w-[55%] h-[55%] rounded-full pointer-events-none" style={{ background: "radial-gradient(closest-side, rgba(246,61,37,0.14), transparent 70%)", filter: "blur(60px)" }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />

      <Card className="w-full max-w-md glass-card border-0 relative z-10">
        <CardHeader className="space-y-4 pb-6 text-center">
          <div className="mx-auto inline-block rounded-2xl bg-black px-6 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10">
            <span className="text-3xl font-black tracking-tight text-white drop-shadow-[0_1px_3px_rgba(255,255,255,0.18)]">
              BranX<span style={{ color: "#f63d25" }}>*</span>{" "}
              <span className="text-white/95">POS</span>
            </span>
          </div>
          <CardDescription className="text-white/60 tracking-wide">
            Sign in to access your dashboard
          </CardDescription>
          <div className="hairline h-px w-full" />
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-xs uppercase tracking-wider">Email</FormLabel>
                    <FormControl>
                      <Input placeholder="admin@example.com" {...field} className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-[#f63d25]/60 h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-xs uppercase tracking-wider">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-[#f63d25]/60 h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full mt-2 glossy-brand border-0 h-12 text-base font-semibold tracking-wide"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
