import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { ownerApi } from "@/lib/owner-api";
import { ownerPath } from "@/config/owner-portal";
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
import { Loader2, Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export default function OwnerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // If already logged in as owner, jump straight to the dashboard.
  useEffect(() => {
    let cancelled = false;
    ownerApi
      .me()
      .then(() => { if (!cancelled) setLocation(ownerPath()); })
      .catch(() => { /* not logged in — stay */ })
      .finally(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
  }, [setLocation]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setSubmitting(true);
    try {
      await ownerApi.login(values.email, values.password);
      setLocation(ownerPath());
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: err?.message || "Invalid credentials. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] rounded-full pointer-events-none" style={{ background: "radial-gradient(closest-side, rgba(246,61,37,0.22), transparent 70%)", filter: "blur(40px)" }} />
      <div className="absolute bottom-[-15%] right-[-10%] w-[55%] h-[55%] rounded-full pointer-events-none" style={{ background: "radial-gradient(closest-side, rgba(246,61,37,0.14), transparent 70%)", filter: "blur(60px)" }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />

      {/* Back to staff/admin login — visible escape hatch from the owner
          console, since this page has no other navigation. */}
      <button
        type="button"
        onClick={() => setLocation("/login")}
        aria-label="Back to staff login"
        title="Back to staff login"
        data-testid="button-back-to-staff-login"
        className="absolute top-5 left-5 z-30 inline-flex items-center gap-2 rounded-full bg-white/[0.06] ring-1 ring-white/15 px-3 h-9 text-sm text-white/75 hover:text-white hover:bg-white/12 hover:ring-white/30 shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back</span>
      </button>

      <Card className="w-full max-w-md glass-card border-0 relative z-10">
        <CardHeader className="space-y-4 pb-6 text-center">
          <div className="mx-auto inline-flex items-center gap-3 rounded-2xl bg-black px-6 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10">
            <ShieldCheck className="h-7 w-7 text-[#f63d25]" />
            <span className="text-2xl font-black tracking-tight text-white">
              Owner <span className="text-white/95">Console</span>
            </span>
          </div>
          <CardTitle className="text-white text-base font-semibold tracking-wide">
            Super-admin sign in
          </CardTitle>
          <CardDescription className="text-white/60 tracking-wide">
            Manage licensed POS deployments
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
                      <Input
                        placeholder="owner@example.com"
                        autoComplete="email"
                        {...field}
                        className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-[#f63d25]/60 h-11"
                        data-testid="input-owner-email"
                      />
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
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          {...field}
                          className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-[#f63d25]/60 h-11 pr-11"
                          data-testid="input-owner-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          tabIndex={-1}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#f63d25]/60"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full mt-2 glossy-brand border-0 h-12 text-base font-semibold tracking-wide"
                disabled={submitting}
                data-testid="button-owner-signin"
              >
                {submitting ? (
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
