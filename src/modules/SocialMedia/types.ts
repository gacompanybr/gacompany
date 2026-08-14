export type Plataforma = "instagram" | "facebook" | "tiktok" | "linkedin";
export type PostTipo = "post" | "reels" | "story" | "carrossel";
export type PostStatus = "rascunho" | "agendado" | "publicado" | "falhou";
export type AspectRatio = "1:1" | "4:5" | "1.91:1";

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
  imagens_urls?: string[] | null;
  aspect_ratio?: AspectRatio | null;
  erro_msg: string | null;
  created_at: string;
  updated_at: string;
}

export const PLATAFORMAS: { key: Plataforma; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "linkedin", label: "LinkedIn" },
];

export const ASPECT_RATIOS: { key: AspectRatio; label: string; css: string }[] = [
  { key: "1:1", label: "Quadrada (1:1)", css: "1 / 1" },
  { key: "4:5", label: "Retrato (4:5)", css: "4 / 5" },
  { key: "1.91:1", label: "Paisagem (1.91:1)", css: "1.91 / 1" },
];

export const MAX_CARROSSEL = 10;

export const STATUS_COLOR: Record<PostStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  agendado: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  publicado: "bg-green-500/15 text-green-600 dark:text-green-400",
  falhou: "bg-red-500/15 text-red-600 dark:text-red-400",
};
