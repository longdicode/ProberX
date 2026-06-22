"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuthStore } from "@/stores/auth-store";
import { useLocale } from "@/stores/locale-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import { loginSchema, type LoginInput } from "@/lib/validators";

const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "";

export default function LoginPage() {
  const { t } = useLocale();
  const { login, oauthLogin } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/overview";

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;
    const redirectUri = `${window.location.origin}/login`;
    oauthLogin("github", code, redirectUri)
      .then(() => {
        toast.success(t("auth.welcomeBackToast"));
        router.push(redirectTo);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : t("auth.loginFailed"));
      });
  }, [searchParams]);

  async function onSubmit(data: LoginInput) {
    try {
      await login(data.email, data.password);
      toast.success(t("auth.welcomeBackToast"));
      router.push(redirectTo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.loginFailed"));
    }
  }

  function handleGithubLogin() {
    if (!GITHUB_CLIENT_ID) {
      toast.error("GitHub OAuth is not configured");
      return;
    }
    const redirectUri = `${window.location.origin}/login`;
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="text-center">
        <Radio className="w-8 h-8 text-primary mx-auto mb-2" />
        <CardTitle className="text-2xl">{t("auth.welcomeBackTitle")}</CardTitle>
        <CardDescription>{t("auth.welcomeBackDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" placeholder={t("auth.emailPlaceholder")} {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
        <div className="mt-4 flex items-center gap-3"><Separator className="flex-1" /><span className="text-xs text-muted-foreground">{t("common.or")}</span><Separator className="flex-1" /></div>
        <Button variant="outline" className="w-full mt-4" onClick={handleGithubLogin} disabled={isSubmitting}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          {t("auth.continueWithGithub")}
        </Button>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">{t("auth.noAccount")} <Link href="/register" className="text-primary hover:underline">{t("auth.signUp")}</Link></p>
      </CardFooter>
    </Card>
  );
}
