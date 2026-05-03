import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ModulePlaceholder({
  title, description, icon: Icon = Construction,
}: { title: string; description: string; icon?: any }) {
  return (
    <Card className="p-12 flex flex-col items-center justify-center text-center bg-muted/30 border-dashed">
      <Icon className="text-muted-foreground mb-4" size={48} />
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-3">{description}</p>
      <span className="text-xs uppercase tracking-wide text-primary font-medium">
        Em breve
      </span>
    </Card>
  );
}
