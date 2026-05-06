import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ServicosTab } from "./financeiro/ServicosTab";
import { RecebimentosTab } from "./financeiro/RecebimentosTab";
import { CategoriasTab } from "./financeiro/CategoriasTab";

export function FinanceiroTab() {
  const [tab, setTab] = useState("servicos");
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="servicos">Serviços</TabsTrigger>
        <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
        <TabsTrigger value="categorias">Categorias</TabsTrigger>
      </TabsList>
      <TabsContent value="servicos"><ServicosTab /></TabsContent>
      <TabsContent value="recebimentos"><RecebimentosTab /></TabsContent>
      <TabsContent value="categorias"><CategoriasTab /></TabsContent>
    </Tabs>
  );
}
