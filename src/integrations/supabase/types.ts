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
      beacons_promocoes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          image_url: string | null
          link: string | null
          portfolio_id: string
          texto: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          link?: string | null
          portfolio_id: string
          texto?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          image_url?: string | null
          link?: string | null
          portfolio_id?: string
          texto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beacons_promocoes_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: true
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_keywords: {
        Row: {
          ad_group_id: string | null
          avg_cpc: number | null
          campaign_id: string
          clicks: number
          conversions: number
          cost: number
          created_at: string
          criterion_id: string
          ctr: number | null
          date: string
          id: string
          impressions: number
          keyword_text: string
          match_type: string | null
        }
        Insert: {
          ad_group_id?: string | null
          avg_cpc?: number | null
          campaign_id: string
          clicks?: number
          conversions?: number
          cost?: number
          created_at?: string
          criterion_id: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number
          keyword_text: string
          match_type?: string | null
        }
        Update: {
          ad_group_id?: string | null
          avg_cpc?: number | null
          campaign_id?: string
          clicks?: number
          conversions?: number
          cost?: number
          created_at?: string
          criterion_id?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number
          keyword_text?: string
          match_type?: string | null
        }
        Relationships: []
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
      campaign_search_terms: {
        Row: {
          campaign_id: string
          clicks: number
          conversions: number
          cost: number
          created_at: string
          date: string
          id: string
          impressions: number
          search_term: string
        }
        Insert: {
          campaign_id: string
          clicks?: number
          conversions?: number
          cost?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number
          search_term: string
        }
        Update: {
          campaign_id?: string
          clicks?: number
          conversions?: number
          cost?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          search_term?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          ad_account_id: string
          advertising_channel_type: string | null
          budget_amount: number | null
          channel_type: string | null
          created_at: string
          end_date: string | null
          external_id: string
          id: string
          name: string
          start_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          advertising_channel_type?: string | null
          budget_amount?: number | null
          channel_type?: string | null
          created_at?: string
          end_date?: string | null
          external_id: string
          id?: string
          name: string
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          advertising_channel_type?: string | null
          budget_amount?: number | null
          channel_type?: string | null
          created_at?: string
          end_date?: string | null
          external_id?: string
          id?: string
          name?: string
          start_date?: string | null
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
      cobranca_config: {
        Row: {
          ativo: boolean
          contato_jid: string
          contato_nome: string | null
          contato_telefone: string
          created_at: string
          dia_vencimento: number
          id: string
          last_sent_on: string | null
          mensagem_template: string
          portfolio_id: string
          sender_instance: string
          sender_portfolio_id: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          contato_jid: string
          contato_nome?: string | null
          contato_telefone: string
          created_at?: string
          dia_vencimento: number
          id?: string
          last_sent_on?: string | null
          mensagem_template: string
          portfolio_id: string
          sender_instance: string
          sender_portfolio_id?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          ativo?: boolean
          contato_jid?: string
          contato_nome?: string | null
          contato_telefone?: string
          created_at?: string
          dia_vencimento?: number
          id?: string
          last_sent_on?: string | null
          mensagem_template?: string
          portfolio_id?: string
          sender_instance?: string
          sender_portfolio_id?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_config_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: true
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_config_sender_portfolio_id_fkey"
            columns: ["sender_portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_envios: {
        Row: {
          config_id: string | null
          contato_telefone: string | null
          created_at: string
          erro: string | null
          id: string
          mensagem: string | null
          origem: string | null
          portfolio_id: string | null
          status: string | null
          valor: number | null
        }
        Insert: {
          config_id?: string | null
          contato_telefone?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          origem?: string | null
          portfolio_id?: string | null
          status?: string | null
          valor?: number | null
        }
        Update: {
          config_id?: string | null
          contato_telefone?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          origem?: string | null
          portfolio_id?: string | null
          status?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_envios_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "cobranca_config"
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
      disparo_campanhas: {
        Row: {
          created_at: string
          delay_max_seg: number
          delay_min_seg: number
          enviados: number
          id: string
          instancia_id: string | null
          lote_tamanho: number
          mensagens: Json
          nome: string
          pausa_ate: string | null
          pausa_lote_min: number
          planilha_url: string | null
          portfolio_id: string
          status: string
          total_contatos: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_max_seg?: number
          delay_min_seg?: number
          enviados?: number
          id?: string
          instancia_id?: string | null
          lote_tamanho?: number
          mensagens?: Json
          nome: string
          pausa_ate?: string | null
          pausa_lote_min?: number
          planilha_url?: string | null
          portfolio_id: string
          status?: string
          total_contatos?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_max_seg?: number
          delay_min_seg?: number
          enviados?: number
          id?: string
          instancia_id?: string | null
          lote_tamanho?: number
          mensagens?: Json
          nome?: string
          pausa_ate?: string | null
          pausa_lote_min?: number
          planilha_url?: string | null
          portfolio_id?: string
          status?: string
          total_contatos?: number
          updated_at?: string
        }
        Relationships: []
      }
      disparo_contatos: {
        Row: {
          campanha_id: string
          created_at: string
          enviado_em: string | null
          erro: string | null
          id: string
          nome: string | null
          status: string
          telefone: string
          variaveis: Json
        }
        Insert: {
          campanha_id: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          nome?: string | null
          status?: string
          telefone: string
          variaveis?: Json
        }
        Update: {
          campanha_id?: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          nome?: string | null
          status?: string
          telefone?: string
          variaveis?: Json
        }
        Relationships: [
          {
            foreignKeyName: "disparo_contatos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "disparo_campanhas"
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
      leads_incompletos: {
        Row: {
          contexto: Json
          created_at: string
          id: string
          motivo_capturado: string | null
          motivo_falha: string
          nome_capturado: string | null
          phone: string
          portfolio_id: string
          trigger_type: string
          unidade_capturada: string | null
        }
        Insert: {
          contexto?: Json
          created_at?: string
          id?: string
          motivo_capturado?: string | null
          motivo_falha: string
          nome_capturado?: string | null
          phone: string
          portfolio_id: string
          trigger_type: string
          unidade_capturada?: string | null
        }
        Update: {
          contexto?: Json
          created_at?: string
          id?: string
          motivo_capturado?: string | null
          motivo_falha?: string
          nome_capturado?: string | null
          phone?: string
          portfolio_id?: string
          trigger_type?: string
          unidade_capturada?: string | null
        }
        Relationships: []
      }
      mercadolivre_integracoes: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          last_error: string | null
          ml_user_id: string
          nickname: string | null
          portfolio_id: string
          refresh_token: string | null
          robo_campanha_id: string | null
          scope: string | null
          scrapper_job_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          last_error?: string | null
          ml_user_id: string
          nickname?: string | null
          portfolio_id: string
          refresh_token?: string | null
          robo_campanha_id?: string | null
          scope?: string | null
          scrapper_job_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_error?: string | null
          ml_user_id?: string
          nickname?: string | null
          portfolio_id?: string
          refresh_token?: string | null
          robo_campanha_id?: string | null
          scope?: string | null
          scrapper_job_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      portfolio_responsaveis: {
        Row: {
          created_at: string
          id: string
          papel: string
          portfolio_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          papel?: string
          portfolio_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          papel?: string
          portfolio_id?: string
          user_id?: string
        }
        Relationships: []
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
      robo_campanhas: {
        Row: {
          campaign_type: string
          conteudo_url: string | null
          created_at: string
          destinos: Json
          dias_semana: Json
          horario_fim: string
          horario_inicio: string
          horarios_por_dia: Json
          id: string
          instancia_id: string | null
          intervalo_max_min: number
          intervalo_min_min: number
          marketplace: string | null
          mensagens: Json
          message_template: string | null
          n8n_datatable_id: string | null
          n8n_datatable_name: string | null
          n8n_workflow_id: string | null
          nome: string
          planilha_url: string | null
          portfolio_id: string
          prompt: string | null
          proxima_execucao: string | null
          scrapper_job_id: string | null
          status: string
          tipo: string
          total_enviados: number
          ultima_execucao: string | null
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          campaign_type?: string
          conteudo_url?: string | null
          created_at?: string
          destinos?: Json
          dias_semana?: Json
          horario_fim?: string
          horario_inicio?: string
          horarios_por_dia?: Json
          id?: string
          instancia_id?: string | null
          intervalo_max_min?: number
          intervalo_min_min?: number
          marketplace?: string | null
          mensagens?: Json
          message_template?: string | null
          n8n_datatable_id?: string | null
          n8n_datatable_name?: string | null
          n8n_workflow_id?: string | null
          nome: string
          planilha_url?: string | null
          portfolio_id: string
          prompt?: string | null
          proxima_execucao?: string | null
          scrapper_job_id?: string | null
          status?: string
          tipo?: string
          total_enviados?: number
          ultima_execucao?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          campaign_type?: string
          conteudo_url?: string | null
          created_at?: string
          destinos?: Json
          dias_semana?: Json
          horario_fim?: string
          horario_inicio?: string
          horarios_por_dia?: Json
          id?: string
          instancia_id?: string | null
          intervalo_max_min?: number
          intervalo_min_min?: number
          marketplace?: string | null
          mensagens?: Json
          message_template?: string | null
          n8n_datatable_id?: string | null
          n8n_datatable_name?: string | null
          n8n_workflow_id?: string | null
          nome?: string
          planilha_url?: string | null
          portfolio_id?: string
          prompt?: string | null
          proxima_execucao?: string | null
          scrapper_job_id?: string | null
          status?: string
          tipo?: string
          total_enviados?: number
          ultima_execucao?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      robo_produtos_enviados: {
        Row: {
          created_at: string
          destino: string | null
          id: string
          image_url: string | null
          link_compra: string | null
          name_key: string | null
          offerlink: string | null
          portfolio_id: string
          product_key: string
          productname: string | null
          robo_id: string
          row_id: string | null
          sent_at: string
          table_id: string | null
        }
        Insert: {
          created_at?: string
          destino?: string | null
          id?: string
          image_url?: string | null
          link_compra?: string | null
          name_key?: string | null
          offerlink?: string | null
          portfolio_id: string
          product_key: string
          productname?: string | null
          robo_id: string
          row_id?: string | null
          sent_at?: string
          table_id?: string | null
        }
        Update: {
          created_at?: string
          destino?: string | null
          id?: string
          image_url?: string | null
          link_compra?: string | null
          name_key?: string | null
          offerlink?: string | null
          portfolio_id?: string
          product_key?: string
          productname?: string | null
          robo_id?: string
          row_id?: string | null
          sent_at?: string
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "robo_produtos_enviados_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "robo_produtos_enviados_robo_id_fkey"
            columns: ["robo_id"]
            isOneToOne: false
            referencedRelation: "robo_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      scrapper_jobs: {
        Row: {
          agendamento_cron: string | null
          categoria: string
          config: Json
          created_at: string
          data_table_name: string | null
          grupo_origem_jid: string | null
          id: string
          intervalo_horas: number
          n8n_datatable_id: string | null
          n8n_workflow_id: string | null
          nome: string
          output_url: string | null
          plataforma: string
          portfolio_id: string
          status: string
          ultima_affiliate_errors: number
          ultima_execucao: string | null
          ultima_qtd: number
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          agendamento_cron?: string | null
          categoria?: string
          config?: Json
          created_at?: string
          data_table_name?: string | null
          grupo_origem_jid?: string | null
          id?: string
          intervalo_horas?: number
          n8n_datatable_id?: string | null
          n8n_workflow_id?: string | null
          nome: string
          output_url?: string | null
          plataforma: string
          portfolio_id: string
          status?: string
          ultima_affiliate_errors?: number
          ultima_execucao?: string | null
          ultima_qtd?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_cron?: string | null
          categoria?: string
          config?: Json
          created_at?: string
          data_table_name?: string | null
          grupo_origem_jid?: string | null
          id?: string
          intervalo_horas?: number
          n8n_datatable_id?: string | null
          n8n_workflow_id?: string | null
          nome?: string
          output_url?: string | null
          plataforma?: string
          portfolio_id?: string
          status?: string
          ultima_affiliate_errors?: number
          ultima_execucao?: string | null
          ultima_qtd?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scrapper_product_history: {
        Row: {
          first_seen_at: string
          id: string
          last_seen_at: string
          link_compra: string | null
          offerlink: string | null
          price: number | null
          product_key: string
          productname: string | null
          scrapper_job_id: string
          table_id: string | null
          updated_at: string
        }
        Insert: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          link_compra?: string | null
          offerlink?: string | null
          price?: number | null
          product_key: string
          productname?: string | null
          scrapper_job_id: string
          table_id?: string | null
          updated_at?: string
        }
        Update: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          link_compra?: string | null
          offerlink?: string | null
          price?: number | null
          product_key?: string
          productname?: string | null
          scrapper_job_id?: string
          table_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrapper_product_history_scrapper_job_id_fkey"
            columns: ["scrapper_job_id"]
            isOneToOne: false
            referencedRelation: "scrapper_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_campaigns: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          nome: string
          portfolio_id: string
          rate_per_hour: number
          status: string
          total_leads: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          nome: string
          portfolio_id: string
          rate_per_hour?: number
          status?: string
          total_leads?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          nome?: string
          portfolio_id?: string
          rate_per_hour?: number
          status?: string
          total_leads?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdr_campaigns_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      sdr_leads: {
        Row: {
          campaign_id: string
          cidade: string | null
          cooldown_ate: string | null
          created_at: string
          enviado: boolean
          follow_up_count: number
          id: string
          instagram: string | null
          mensagens_trocadas: number
          motivo_contato: string
          nicho: string
          nome: string | null
          nome_resolvido: string | null
          portfolio_id: string
          primeira_mensagem_em: string | null
          status: string
          telefone: string
          ultima_mensagem_em: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          cidade?: string | null
          cooldown_ate?: string | null
          created_at?: string
          enviado?: boolean
          follow_up_count?: number
          id?: string
          instagram?: string | null
          mensagens_trocadas?: number
          motivo_contato: string
          nicho: string
          nome?: string | null
          nome_resolvido?: string | null
          portfolio_id: string
          primeira_mensagem_em?: string | null
          status?: string
          telefone: string
          ultima_mensagem_em?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          cidade?: string | null
          cooldown_ate?: string | null
          created_at?: string
          enviado?: boolean
          follow_up_count?: number
          id?: string
          instagram?: string | null
          mensagens_trocadas?: number
          motivo_contato?: string
          nicho?: string
          nome?: string | null
          nome_resolvido?: string | null
          portfolio_id?: string
          primeira_mensagem_em?: string | null
          status?: string
          telefone?: string
          ultima_mensagem_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sdr_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sdr_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdr_leads_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media_integrations: {
        Row: {
          access_token: string
          created_at: string
          fb_page_id: string | null
          fb_page_name: string | null
          fb_user_id: string | null
          id: string
          ig_business_id: string | null
          ig_username: string | null
          last_error: string | null
          portfolio_id: string
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          fb_page_id?: string | null
          fb_page_name?: string | null
          fb_user_id?: string | null
          id?: string
          ig_business_id?: string | null
          ig_username?: string | null
          last_error?: string | null
          portfolio_id: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          fb_page_id?: string | null
          fb_page_name?: string | null
          fb_user_id?: string | null
          id?: string
          ig_business_id?: string | null
          ig_username?: string | null
          last_error?: string | null
          portfolio_id?: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          aspect_ratio: string
          conteudo: string
          created_at: string
          data_agendada: string | null
          erro_msg: string | null
          hashtags: string | null
          id: string
          imagem_url: string | null
          imagens_urls: Json
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
          aspect_ratio?: string
          conteudo?: string
          created_at?: string
          data_agendada?: string | null
          erro_msg?: string | null
          hashtags?: string | null
          id?: string
          imagem_url?: string | null
          imagens_urls?: Json
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
          aspect_ratio?: string
          conteudo?: string
          created_at?: string
          data_agendada?: string | null
          erro_msg?: string | null
          hashtags?: string | null
          id?: string
          imagem_url?: string | null
          imagens_urls?: Json
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
      task_assignees: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          descricao: string | null
          id: string
          portfolio_id: string | null
          prazo: string | null
          prioridade: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          titulo: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          descricao?: string | null
          id?: string
          portfolio_id?: string | null
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          titulo: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          descricao?: string | null
          id?: string
          portfolio_id?: string | null
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          titulo?: string
          updated_at?: string
        }
        Relationships: []
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
      whatsapp_agent_followups: {
        Row: {
          created_at: string
          followups_sent: number
          id: string
          last_agent_message_at: string | null
          last_followup_at: string | null
          phone: string
          portfolio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          followups_sent?: number
          id?: string
          last_agent_message_at?: string | null
          last_followup_at?: string | null
          phone: string
          portfolio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          followups_sent?: number
          id?: string
          last_agent_message_at?: string | null
          last_followup_at?: string | null
          phone?: string
          portfolio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_agent_followups_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_agents: {
        Row: {
          created_at: string
          dias_semana: Json
          faqs: Json
          followup_enabled: boolean
          fora_horario_msg: string | null
          horario_fim: string | null
          horario_inicio: string | null
          horarios_por_dia: Json
          id: string
          instancia_id: string | null
          instrucoes_base: string | null
          max_tokens: number
          mensagem_boas_vindas: string | null
          modelo_ia: string
          n8n_webhook_path: string | null
          n8n_workflow_id: string | null
          nome: string
          nome_atendente: string
          portfolio_id: string
          report_group_id: string | null
          report_group_name: string | null
          report_number: string | null
          sdr_followup_enabled: boolean
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
          followup_enabled?: boolean
          fora_horario_msg?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          horarios_por_dia?: Json
          id?: string
          instancia_id?: string | null
          instrucoes_base?: string | null
          max_tokens?: number
          mensagem_boas_vindas?: string | null
          modelo_ia?: string
          n8n_webhook_path?: string | null
          n8n_workflow_id?: string | null
          nome: string
          nome_atendente?: string
          portfolio_id: string
          report_group_id?: string | null
          report_group_name?: string | null
          report_number?: string | null
          sdr_followup_enabled?: boolean
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
          followup_enabled?: boolean
          fora_horario_msg?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          horarios_por_dia?: Json
          id?: string
          instancia_id?: string | null
          instrucoes_base?: string | null
          max_tokens?: number
          mensagem_boas_vindas?: string | null
          modelo_ia?: string
          n8n_webhook_path?: string | null
          n8n_workflow_id?: string | null
          nome?: string
          nome_atendente?: string
          portfolio_id?: string
          report_group_id?: string | null
          report_group_name?: string | null
          report_number?: string | null
          sdr_followup_enabled?: boolean
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
      whatsapp_connections: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          phone: string | null
          portfolio_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          phone?: string | null
          portfolio_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          phone?: string | null
          portfolio_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_contact_names: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          portfolio_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone: string
          portfolio_id: string
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          portfolio_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_conversas: {
        Row: {
          contato_nome: string | null
          contato_telefone: string
          created_at: string
          id: string
          instance_name: string
          mensagem: string
          portfolio_id: string
          role: string
          sdr_lead_id: string | null
        }
        Insert: {
          contato_nome?: string | null
          contato_telefone: string
          created_at?: string
          id?: string
          instance_name: string
          mensagem: string
          portfolio_id: string
          role: string
          sdr_lead_id?: string | null
        }
        Update: {
          contato_nome?: string | null
          contato_telefone?: string
          created_at?: string
          id?: string
          instance_name?: string
          mensagem?: string
          portfolio_id?: string
          role?: string
          sdr_lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversas_sdr_lead_id_fkey"
            columns: ["sdr_lead_id"]
            isOneToOne: false
            referencedRelation: "sdr_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_paused_contacts: {
        Row: {
          created_at: string
          id: string
          paused_until: string
          phone: string
          portfolio_id: string
          reason: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          paused_until: string
          phone: string
          portfolio_id: string
          reason?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          paused_until?: string
          phone?: string
          portfolio_id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_report_dedupe: {
        Row: {
          created_at: string
          id: string
          last_sent_at: string
          phone: string
          portfolio_id: string
          trigger_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_sent_at?: string
          phone: string
          portfolio_id: string
          trigger_type: string
        }
        Update: {
          created_at?: string
          id?: string
          last_sent_at?: string
          phone?: string
          portfolio_id?: string
          trigger_type?: string
        }
        Relationships: []
      }
      whatsapp_sent_messages_log: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          message_id: string
          phone: string
          portfolio_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          message_id: string
          phone: string
          portfolio_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          message_id?: string
          phone?: string
          portfolio_id?: string
        }
        Relationships: []
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
      is_task_assignee: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      purge_pgnet_history: { Args: never; Returns: undefined }
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
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status: "a_fazer" | "em_andamento" | "feita"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: ["a_fazer", "em_andamento", "feita"],
    },
  },
} as const
