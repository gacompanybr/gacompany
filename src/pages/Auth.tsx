import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import gaLogo from "@/assets/logo.png.asset.json";

const schema = z.object({
  email: z.string().email("Email inválido").max(255),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export default function Auth() {
  const { user, loading, isAdmin, getUserPortfolios } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (loading || !user) return;
    (async () => {
      if (isAdmin) {
        if (active) setRedirectTo("/admin");
        return;
      }
      const ps = await getUserPortfolios();
      if (active) setRedirectTo(ps[0] ? `/workspace/${ps[0].id}` : "/dashboard");
    })();
    return () => { active = false; };
  }, [loading, user, isAdmin, getUserPortfolios]);

  if (loading) return null;
  if (user && redirectTo) return <Navigate to={redirectTo} replace />;
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={20} />
      </div>
    );
  }

  async function handleSignIn() {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
  }

  async function handleSignUp() {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Você já pode fazer login.");
  }

  async function handleGoogle() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) { toast.error(error.message); setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-5">
        <div className="flex flex-col items-center gap-2">
          <img src={gaLogo.url} alt="GA Company" className="h-10 w-auto" />
          <p className="text-sm text-muted-foreground">Acesso ao painel gerencial</p>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-3 mt-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSignIn} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : "Entrar"}
            </Button>
          </TabsContent>

          <TabsContent value="signup" className="space-y-3 mt-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Senha (mín. 8)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSignUp} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : "Criar conta"}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou</span></div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
          Continuar com Google
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← Voltar ao site</Link>
        </p>
      </Card>
    </div>
  );
}
