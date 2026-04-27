import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Eye, EyeOff, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ownerPath } from "@/config/owner-portal";

// Secret passphrase that, when typed into the hidden bottom-left "?" prompt,
// reveals the route to the super-admin Owner Console. Kept here (not on the
// server) intentionally: the Owner Console URL is already secured by the
// unguessable `OWNER_PORTAL_SLUG`, by per-IP rate limiting on the login,
// and by the owner-credentials check itself. This passphrase is just a
// last layer of UI obscurity so a curious staff member can't stumble on
// the link.
const OWNER_GATE_PASSPHRASE = "saadthorodin";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const { data: user, isLoading: isCheckingAuth, isFetched } = useGetCurrentUser();

  // Only auto-redirect when the /me fetch has *completed successfully* and
  // returned a user. Without `isFetched`, a stale cached user (e.g. after a
  // failed background refetch) would re-trigger this effect and fight the
  // AuthWrapper, producing an infinite redirect loop.
  // Also skip auto-redirect while a login mutation is in flight — that path
  // handles its own navigation in `onSuccess`.
  useEffect(() => {
    if (loginMutation.isPending) return;
    if (!isFetched || !user) return;
    if (user.role === "admin") setLocation("/dashboard");
    else if (user.role === "cashier") setLocation("/pos");
    else if (user.role === "inventory") setLocation("/inventory");
    else setLocation("/");
  }, [user, isFetched, loginMutation.isPending, setLocation]);

  const [showPassword, setShowPassword] = useState(false);

  // Hidden owner-gate state: a near-invisible "?" icon at the bottom-left
  // opens a tiny "Who are you?" dialog. Typing the secret passphrase and
  // pressing Enter navigates to the Owner Console login. Wrong inputs
  // close the dialog silently — we never tell the user they were wrong,
  // so the feature looks like a stray help button to anyone who pokes it.
  const [gateOpen, setGateOpen] = useState(false);
  const [gateValue, setGateValue] = useState("");

  function submitOwnerGate() {
    const ok = gateValue.trim().toLowerCase() === OWNER_GATE_PASSPHRASE;
    setGateOpen(false);
    setGateValue("");
    if (ok) setLocation(ownerPath("/login"));
  }

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

      {/* Hidden owner-gate trigger — bottom-left. Subtle on purpose, but
          visible enough that someone who knows about it can find it. Looks
          like a stray help icon so a curious staff member dismisses it. */}
      <button
        type="button"
        onClick={() => setGateOpen(true)}
        aria-label="Help"
        title="Help"
        data-testid="owner-gate-trigger"
        className="absolute bottom-4 left-4 h-8 w-8 inline-flex items-center justify-center rounded-full bg-white/[0.025] ring-1 ring-white/[0.08] text-white/30 hover:text-white/70 hover:bg-white/10 hover:ring-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 z-20"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      <Dialog
        open={gateOpen}
        onOpenChange={(open) => {
          setGateOpen(open);
          if (!open) setGateValue("");
        }}
      >
        <DialogContent className="sm:max-w-sm" data-testid="owner-gate-dialog">
          <DialogHeader>
            <DialogTitle>Who are you?</DialogTitle>
            <DialogDescription>
              Enter the access phrase to continue.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitOwnerGate();
            }}
            className="space-y-3"
          >
            <Input
              autoFocus
              type="password"
              value={gateValue}
              onChange={(e) => setGateValue(e.target.value)}
              placeholder=""
              autoComplete="off"
              data-testid="owner-gate-input"
              className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-[#f63d25]/60 h-11"
            />
            {/* Hidden submit so pressing Enter in the input triggers it. */}
            <button type="submit" className="sr-only" aria-hidden="true">
              Continue
            </button>
          </form>
        </DialogContent>
      </Dialog>

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
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          {...field}
                          className="bg-black/50 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-[#f63d25]/60 h-11 pr-11"
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
