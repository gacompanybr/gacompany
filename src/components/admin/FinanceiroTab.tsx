import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ServicosTab } from "./financeiro/ServicosTab";
import { RecebimentosTab } from "./financeiro/RecebimentosTab";
import { CategoriasTab } from "./financeiro/CategoriasTab";
import { CustosTab } from "./financeiro/CustosTab";
import { useAuth } from "@/hooks/useAuth";


export function FinanceiroTab() {
  const [tab, setTab] = useState("servicos");
  const { hasPermission } = useAuth();
  const canManage = hasPermission("finance.manage");
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1">
        <TabsTrigger value="servicos">Serviços</TabsTrigger>
        <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
        <TabsTrigger value="custos">Custos</TabsTrigger>
        <TabsTrigger value="categorias">Categorias</TabsTrigger>
      </TabsList>
      <TabsContent value="servicos"><div className={canManage ? "" : "pointer-events-none"}><ServicosTab /></div></TabsContent>
      <TabsContent value="recebimentos"><div className={canManage ? "" : "pointer-events-none"}><RecebimentosTab /></div></TabsContent>
      <TabsContent value="custos"><div className={canManage ? "" : "pointer-events-none"}><CustosTab /></div></TabsContent>
      <TabsContent value="categorias"><div className={canManage ? "" : "pointer-events-none"}><CategoriasTab /></div></TabsContent>
    </Tabs>
  );
}
