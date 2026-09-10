import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ServicosTab } from "./financeiro/ServicosTab";
import { RecebimentosTab } from "./financeiro/RecebimentosTab";
import { CategoriasTab } from "./financeiro/CategoriasTab";
import { CustosTab } from "./financeiro/CustosTab";


export function FinanceiroTab() {
  const [tab, setTab] = useState("servicos");
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="servicos">Serviços</TabsTrigger>
        <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
        <TabsTrigger value="custos">Custos</TabsTrigger>
        <TabsTrigger value="categorias">Categorias</TabsTrigger>
      </TabsList>
      <TabsContent value="servicos"><ServicosTab /></TabsContent>
      <TabsContent value="recebimentos"><RecebimentosTab /></TabsContent>
      <TabsContent value="custos"><CustosTab /></TabsContent>
      <TabsContent value="categorias"><CategoriasTab /></TabsContent>
    </Tabs>
  );
}
