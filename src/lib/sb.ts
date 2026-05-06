// Wrapper temporário até os tipos Supabase regerarem para as novas tabelas financeiras.
import { supabase as _supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb: any = _supabase as any;
