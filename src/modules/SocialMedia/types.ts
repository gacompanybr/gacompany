export type Plataforma = "instagram" | "facebook" | "tiktok" | "linkedin";
export type PostTipo = "post" | "reels" | "story" | "carrossel";
export type PostStatus = "rascunho" | "agendado" | "publicado" | "falhou";

export interface SocialPost {
  id: string;
  portfolio_id: string;
  titulo: string;
  conteudo: string;
  legenda: string | null;
  hashtags: string | null;
  plataformas: Plataforma[];
  tipo: PostTipo;
  status: PostStatus;
  data_agendada: string | null;
  imagem_url: string | null;
  created_at: string;
  updated_at: string;
}

export const PLATAFORMAS: { key: Plataforma; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "linkedin", label: "LinkedIn" },
];

export const STATUS_COLOR: Record<PostStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  agendado: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  publicado: "bg-green-500/15 text-green-600 dark:text-green-400",
  falhou: "bg-red-500/15 text-red-600 dark:text-red-400",
};
