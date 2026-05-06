export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_accounts: {
        Row: {
          created_at: string
          currency: string | null
          customer_id: string
          id: string
          login_customer_id: string | null
          name: string
          platform: string
          portfolio_id: string
          result_description: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          customer_id: string
          id?: string
          login_customer_id?: string | null
          name: string
          platform?: string
          portfolio_id: string
          result_description?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          customer_id?: string
          id?: string
          login_customer_id?: string | null
          name?: string
          platform?: string
          portfolio_id?: string
          result_description?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_metrics: {
        Row: {
          avg_cpc: number | null
          campaign_id: string
          clicks: number
          conversions: number
          conversions_value: number
          cost: number
          cost_per_conversion: number | null
          created_at: string
          ctr: number | null
          date: string
          id: string
          impressions: number
          reach: number | null
        }
        Insert: {
          avg_cpc?: number | null
          campaign_id: string
          clicks?: number
          conversions?: number
          conversions_value?: number
          cost?: number
          cost_per_conversion?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number
          reach?: number | null
        }
        Update: {
          avg_cpc?: number | null
          campaign_id?: string
          clicks?: number
          conversions?: number
          conversions_value?: number
          cost?: number
          cost_per_conversion?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number
          reach?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ad_account_id: string
          budget_amount: number | null
          channel_type: string | null
          created_at: string
          external_id: string
          id: string
          name: string
          status: string | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          budget_amount?: number | null
          channel_type?: string | null
          created_at?: string
          external_id: string
          id?: string
          name: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          budget_amount?: number | null
          channel_type?: string | null
          created_at?: string
          external_id?: string
          id?: string
          name?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_interacoes: {
        Row: {
          created_at: string
          descricao: string
          id: string
          lead_id: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          lead_id: string
          tipo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          lead_id?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          origem: string
          portfolio_id: string
          responsavel_id: string | null
          status: string
          telefone: string | null
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          origem?: string
          portfolio_id: string
          responsavel_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string
          portfolio_id?: string
          responsavel_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          cor: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_receivables: {
        Row: {
          created_at: string
          data_prevista: string
          data_recebimento: string | null
          forma_pagamento:
            | Database["public"]["Enums"]["financial_payment_method"]
            | null
          id: string
          observacoes: string | null
          participant_user_id: string
          portfolio_id: string
          service_id: string
          status: Database["public"]["Enums"]["financial_receivable_status"]
          updated_at: string
          valor_previsto: number
          valor_recebido: number | null
        }
        Insert: {
          created_at?: string
          data_prevista: string
          data_recebimento?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["financial_payment_method"]
            | null
          id?: string
          observacoes?: string | null
          participant_user_id: string
          portfolio_id: string
          service_id: string
          status?: Database["public"]["Enums"]["financial_receivable_status"]
          updated_at?: string
          valor_previsto?: number
          valor_recebido?: number | null
        }
        Update: {
          created_at?: string
          data_prevista?: string
          data_recebimento?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["financial_payment_method"]
            | null
          id?: string
          observacoes?: string | null
          participant_user_id?: string
          portfolio_id?: string
          service_id?: string
          status?: Database["public"]["Enums"]["financial_receivable_status"]
          updated_at?: string
          valor_previsto?: number
          valor_recebido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_receivables_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_receivables_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "financial_services"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_service_participants: {
        Row: {
          created_at: string
          id: string
          percentual: number
          service_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          percentual: number
          service_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          percentual?: number
          service_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_service_participants_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "financial_services"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_services: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          data_inicio: string
          descricao: string | null
          dia_vencimento: number | null
          id: string
          nome: string
          observacoes: string | null
          portfolio_id: string
          status: Database["public"]["Enums"]["financial_service_status"]
          tipo_cobranca: Database["public"]["Enums"]["financial_billing_type"]
          updated_at: string
          valor_total: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          data_inicio?: string
          descricao?: string | null
          dia_vencimento?: number | null
          id?: string
          nome: string
          observacoes?: string | null
          portfolio_id: string
          status?: Database["public"]["Enums"]["financial_service_status"]
          tipo_cobranca?: Database["public"]["Enums"]["financial_billing_type"]
          updated_at?: string
          valor_total?: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          data_inicio?: string
          descricao?: string | null
          dia_vencimento?: number | null
          id?: string
          nome?: string
          observacoes?: string | null
          portfolio_id?: string
          status?: Database["public"]["Enums"]["financial_service_status"]
          tipo_cobranca?: Database["public"]["Enums"]["financial_billing_type"]
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_services_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campanhas: {
        Row: {
          budget: number | null
          campaign_id: string
          campaign_name: string
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          id: string
          integration_id: string
          objective: string | null
          observacoes: string | null
          orcamento_diario: number | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          campaign_id: string
          campaign_name: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          integration_id: string
          objective?: string | null
          observacoes?: string | null
          orcamento_diario?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          campaign_id?: string
          campaign_name?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          integration_id?: string
          objective?: string | null
          observacoes?: string | null
          orcamento_diario?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_campanhas_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_campanhas_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integracoes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_integracoes: {
        Row: {
          access_token: string
          ad_account_id: string
          business_manager_id: string | null
          created_at: string
          id: string
          nome_conta_anuncio: string
          nome_portfolio: string
          portfolio_id: string
          status: string
          ultima_atualizacao: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          ad_account_id: string
          business_manager_id?: string | null
          created_at?: string
          id?: string
          nome_conta_anuncio: string
          nome_portfolio: string
          portfolio_id: string
          status?: string
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          ad_account_id?: string
          business_manager_id?: string | null
          created_at?: string
          id?: string
          nome_conta_anuncio?: string
          nome_portfolio?: string
          portfolio_id?: string
          status?: string
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_integracoes_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_logs_integracao: {
        Row: {
          created_at: string
          date_from: string | null
          date_to: string | null
          detalhe_erro: string | null
          id: string
          integration_id: string | null
          mensagem: string | null
          rows_synced: number | null
          status: string
        }
        Insert: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          detalhe_erro?: string | null
          id?: string
          integration_id?: string | null
          mensagem?: string | null
          rows_synced?: number | null
          status: string
        }
        Update: {
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          detalhe_erro?: string | null
          id?: string
          integration_id?: string | null
          mensagem?: string | null
          rows_synced?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_logs_integracao_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_logs_integracao_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integracoes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_metricas_campanhas: {
        Row: {
          campaign_id: string
          clicks: number
          cost_per_result: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          date: string
          id: string
          impressions: number
          integration_id: string
          raw_actions_json: Json | null
          reach: number
          result_type: string | null
          results: number
          spend: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          clicks?: number
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number
          integration_id: string
          raw_actions_json?: Json | null
          reach?: number
          result_type?: string | null
          results?: number
          spend?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          clicks?: number
          cost_per_result?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number
          integration_id?: string
          raw_actions_json?: Json | null
          reach?: number
          result_type?: string | null
          results?: number
          spend?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_metricas_campanhas_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integracoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_metricas_campanhas_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "meta_integracoes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          responsavel_id: string | null
          servicos: Json
          slug: string
          status: string
          theme: Json | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          responsavel_id?: string | null
          servicos?: Json
          slug: string
          status?: string
          theme?: Json | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          responsavel_id?: string | null
          servicos?: Json
          slug?: string
          status?: string
          theme?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          conteudo: string
          created_at: string
          data_agendada: string | null
          hashtags: string | null
          id: string
          imagem_url: string | null
          legenda: string | null
          plataformas: Json
          portfolio_id: string
          responsavel_id: string | null
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          data_agendada?: string | null
          hashtags?: string | null
          id?: string
          imagem_url?: string | null
          legenda?: string | null
          plataformas?: Json
          portfolio_id: string
          responsavel_id?: string | null
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          data_agendada?: string | null
          hashtags?: string | null
          id?: string
          imagem_url?: string | null
          legenda?: string | null
          plataformas?: Json
          portfolio_id?: string
          responsavel_id?: string | null
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          ad_account_id: string | null
          date_from: string | null
          date_to: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          rows_synced: number | null
          started_at: string
          status: string
        }
        Insert: {
          ad_account_id?: string | null
          date_from?: string | null
          date_to?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rows_synced?: number | null
          started_at?: string
          status: string
        }
        Update: {
          ad_account_id?: string | null
          date_from?: string | null
          date_to?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rows_synced?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_portfolio_access: {
        Row: {
          created_at: string
          id: string
          portfolio_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          portfolio_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          portfolio_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_portfolio_access_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_agents: {
        Row: {
          created_at: string
          dias_semana: Json
          faqs: Json
          fora_horario_msg: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          instancia_id: string | null
          instrucoes_base: string | null
          max_tokens: number
          mensagem_boas_vindas: string | null
          modelo_ia: string
          nome: string
          nome_atendente: string
          portfolio_id: string
          status: string
          telefone: string | null
          temperatura: number
          tom_de_voz: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dias_semana?: Json
          faqs?: Json
          fora_horario_msg?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          instancia_id?: string | null
          instrucoes_base?: string | null
          max_tokens?: number
          mensagem_boas_vindas?: string | null
          modelo_ia?: string
          nome: string
          nome_atendente?: string
          portfolio_id: string
          status?: string
          telefone?: string | null
          temperatura?: number
          tom_de_voz?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dias_semana?: Json
          faqs?: Json
          fora_horario_msg?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          instancia_id?: string | null
          instrucoes_base?: string | null
          max_tokens?: number
          mensagem_boas_vindas?: string | null
          modelo_ia?: string
          nome?: string
          nome_atendente?: string
          portfolio_id?: string
          status?: string
          telefone?: string | null
          temperatura?: number
          tom_de_voz?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_agents_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: true
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      meta_integracoes_public: {
        Row: {
          ad_account_id: string | null
          created_at: string | null
          id: string | null
          nome_conta_anuncio: string | null
          nome_portfolio: string | null
          portfolio_id: string | null
          status: string | null
          ultima_atualizacao: string | null
          updated_at: string | null
        }
        Insert: {
          ad_account_id?: string | null
          created_at?: string | null
          id?: string | null
          nome_conta_anuncio?: string | null
          nome_portfolio?: string | null
          portfolio_id?: string | null
          status?: string | null
          ultima_atualizacao?: string | null
          updated_at?: string | null
        }
        Update: {
          ad_account_id?: string | null
          created_at?: string | null
          id?: string | null
          nome_conta_anuncio?: string | null
          nome_portfolio?: string | null
          portfolio_id?: string | null
          status?: string | null
          ultima_atualizacao?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_integracoes_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_portfolio_access: {
        Args: { _portfolio_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "viewer"
      financial_billing_type: "mensal" | "unico" | "trimestral"
      financial_payment_method:
        | "pix"
        | "boleto"
        | "transferencia"
        | "dinheiro"
        | "cartao"
      financial_receivable_status:
        | "pendente"
        | "recebido"
        | "parcial"
        | "atrasado"
        | "cancelado"
      financial_service_status: "ativo" | "pausado" | "finalizado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "viewer"],
      financial_billing_type: ["mensal", "unico", "trimestral"],
      financial_payment_method: [
        "pix",
        "boleto",
        "transferencia",
        "dinheiro",
        "cartao",
      ],
      financial_receivable_status: [
        "pendente",
        "recebido",
        "parcial",
        "atrasado",
        "cancelado",
      ],
      financial_service_status: ["ativo", "pausado", "finalizado"],
    },
  },
} as const
