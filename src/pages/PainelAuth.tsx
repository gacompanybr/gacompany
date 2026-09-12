import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import gaLogo from "@/assets/logo.png.asset.json";

const schema = z.object({
  email: z.string().email("Email inválido").max(255),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

export default function PainelAuth() {
  const { user, loading, isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (loading) return null;
  if (user) {
    return <Navigate to={isAdmin ? "/paineladmin/app" : "/painel/app"} replace />;
  }

  async function handleSignIn() {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-5 md:p-6 space-y-5">
        <div className="flex flex-col items-center gap-2">
          <img src={gaLogo.url} alt="GA Company" className="h-10 w-auto" />
          <p className="text-sm text-muted-foreground">Área do Cliente</p>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
              autoComplete="current-password"
            />
          </div>
          <Button className="w-full" onClick={handleSignIn} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : "Entrar"}
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground leading-relaxed">
          Não tem conta? As credenciais são criadas pela equipe GA Company.
          <br />Entre em contato com seu gestor.
        </p>

        <p className="text-xs text-center">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            ← Voltar ao site
          </Link>
        </p>
      </Card>
    </div>
  );
}
