import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Search, Send } from "lucide-react";
import { ScrapperEmailsTab } from "./ScrapperEmailsTab";
import { DisparosTab } from "./DisparosTab";

export default function EmailMarketingModule({ portfolioId }: { portfolioId: string }) {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="text-primary" size={18} />
        <h1 className="text-xl font-semibold">E-mail Marketing</h1>
      </div>

      <Tabs defaultValue="scrapper">
        <TabsList>
          <TabsTrigger value="scrapper" className="gap-2">
            <Search size={14} /> Scrapper de e-mails
          </TabsTrigger>
          <TabsTrigger value="disparos" className="gap-2">
            <Send size={14} /> Disparos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scrapper" className="mt-4">
          <ScrapperEmailsTab portfolioId={portfolioId} />
        </TabsContent>
        <TabsContent value="disparos" className="mt-4">
          <DisparosTab portfolioId={portfolioId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
