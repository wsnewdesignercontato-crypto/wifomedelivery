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
      ad_plans: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          descricao: string | null
          destaque_busca: boolean
          destaque_categoria: boolean
          destaque_home: boolean
          duracao_dias: number
          id: string
          impressoes_estimadas: number | null
          max_anuncios: number
          nome: string
          preco_cents: number
          prioridade: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          destaque_busca?: boolean
          destaque_categoria?: boolean
          destaque_home?: boolean
          duracao_dias?: number
          id?: string
          impressoes_estimadas?: number | null
          max_anuncios?: number
          nome: string
          preco_cents?: number
          prioridade?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          destaque_busca?: boolean
          destaque_categoria?: boolean
          destaque_home?: boolean
          duracao_dias?: number
          id?: string
          impressoes_estimadas?: number | null
          max_anuncios?: number
          nome?: string
          preco_cents?: number
          prioridade?: number
          updated_at?: string
        }
        Relationships: []
      }
      addon_groups: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          establishment_id: string
          id: string
          maximo: number
          minimo: number
          nome: string
          obrigatorio: boolean
          ordem: number
          selecao_multipla: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          establishment_id: string
          id?: string
          maximo?: number
          minimo?: number
          nome: string
          obrigatorio?: boolean
          ordem?: number
          selecao_multipla?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          establishment_id?: string
          id?: string
          maximo?: number
          minimo?: number
          nome?: string
          obrigatorio?: boolean
          ordem?: number
          selecao_multipla?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_groups_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "addon_groups_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_groups_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      addons: {
        Row: {
          addon_group_id: string
          ativo: boolean
          created_at: string
          descricao: string | null
          estoque: number | null
          foto_url: string | null
          id: string
          nome: string
          ordem: number
          preco_extra_cents: number
          qtd_maxima: number | null
          updated_at: string
        }
        Insert: {
          addon_group_id: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          estoque?: number | null
          foto_url?: string | null
          id?: string
          nome: string
          ordem?: number
          preco_extra_cents?: number
          qtd_maxima?: number | null
          updated_at?: string
        }
        Update: {
          addon_group_id?: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          estoque?: number | null
          foto_url?: string | null
          id?: string
          nome?: string
          ordem?: number
          preco_extra_cents?: number
          qtd_maxima?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addons_addon_group_id_fkey"
            columns: ["addon_group_id"]
            isOneToOne: false
            referencedRelation: "addon_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string
          complemento: string | null
          created_at: string
          estado: string | null
          id: string
          is_default: boolean
          label: string
          lat: number | null
          lng: number | null
          numero: string | null
          rua: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade: string
          complemento?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          numero?: string | null
          rua: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string
          complemento?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          is_default?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          numero?: string | null
          rua?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          ativo: boolean
          created_at: string
          ends_at: string | null
          id: string
          image_url: string
          link_url: string | null
          posicao: number
          starts_at: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url: string
          link_url?: string | null
          posicao?: number
          starts_at?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url?: string
          link_url?: string | null
          posicao?: number
          starts_at?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          audience: string
          banner_url: string | null
          coupon_id: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          descricao: string | null
          ends_at: string | null
          id: string
          metrics: Json
          nome: string
          regras_json: Json | null
          starts_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          audience?: string
          banner_url?: string | null
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          descricao?: string | null
          ends_at?: string | null
          id?: string
          metrics?: Json
          nome: string
          regras_json?: Json | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          audience?: string
          banner_url?: string | null
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          descricao?: string | null
          ends_at?: string | null
          id?: string
          metrics?: Json
          nome?: string
          regras_json?: Json | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          addons: Json
          created_at: string
          establishment_id: string
          id: string
          nome_snapshot: string
          observacoes: string | null
          preco_unit_cents: number
          product_id: string
          quantidade: number
          updated_at: string
          user_id: string
        }
        Insert: {
          addons?: Json
          created_at?: string
          establishment_id: string
          id?: string
          nome_snapshot: string
          observacoes?: string | null
          preco_unit_cents: number
          product_id: string
          quantidade: number
          updated_at?: string
          user_id: string
        }
        Update: {
          addons?: Json
          created_at?: string
          establishment_id?: string
          id?: string
          nome_snapshot?: string
          observacoes?: string | null
          preco_unit_cents?: number
          product_id?: string
          quantidade?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "cart_items_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          ativo: boolean
          code: string
          created_at: string
          created_by: string | null
          descricao: string | null
          establishment_id: string | null
          expires_at: string | null
          id: string
          max_discount_cents: number | null
          min_order_cents: number
          percent: number
          starts_at: string | null
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          usage_limit: number | null
          used_count: number
          value_cents: number
        }
        Insert: {
          ativo?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          establishment_id?: string | null
          expires_at?: string | null
          id?: string
          max_discount_cents?: number | null
          min_order_cents?: number
          percent?: number
          starts_at?: string | null
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value_cents?: number
        }
        Update: {
          ativo?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          establishment_id?: string | null
          expires_at?: string | null
          id?: string
          max_discount_cents?: number | null
          min_order_cents?: number
          percent?: number
          starts_at?: string | null
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "coupons_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_documents: {
        Row: {
          courier_id: string
          created_at: string | null
          enviado_em: string | null
          id: string
          motivo_recusa: string | null
          revisado_em: string | null
          status: string | null
          tipo: string
          updated_at: string | null
          url: string | null
          validade: string | null
        }
        Insert: {
          courier_id: string
          created_at?: string | null
          enviado_em?: string | null
          id?: string
          motivo_recusa?: string | null
          revisado_em?: string | null
          status?: string | null
          tipo: string
          updated_at?: string | null
          url?: string | null
          validade?: string | null
        }
        Update: {
          courier_id?: string
          created_at?: string | null
          enviado_em?: string | null
          id?: string
          motivo_recusa?: string | null
          revisado_em?: string | null
          status?: string | null
          tipo?: string
          updated_at?: string | null
          url?: string | null
          validade?: string | null
        }
        Relationships: []
      }
      courier_missions: {
        Row: {
          bonus_cents: number | null
          courier_id: string
          created_at: string | null
          descricao: string | null
          id: string
          meta_entregas: number | null
          periodo_fim: string | null
          periodo_inicio: string | null
          progresso: number | null
          status: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          bonus_cents?: number | null
          courier_id: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          meta_entregas?: number | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          progresso?: number | null
          status?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          bonus_cents?: number | null
          courier_id?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          meta_entregas?: number | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          progresso?: number | null
          status?: string | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      courier_profiles: {
        Row: {
          aceitacao_pct: number | null
          aprovacao: string | null
          avaliacao: number | null
          bairros_atuacao: string[] | null
          banco_agencia: string | null
          banco_conta: string | null
          banco_nome: string | null
          banco_tipo: string | null
          banco_titular: string | null
          cancelamento_pct: number | null
          cidade_atuacao: string | null
          cidades_atuacao: string[] | null
          cnh: string | null
          cnh_categoria: string | null
          cnh_validade: string | null
          contato_emergencia_nome: string | null
          contato_emergencia_tel: string | null
          contato_emergencia_telefone: string | null
          cpf: string | null
          created_at: string
          doc_frente_url: string | null
          doc_verso_url: string | null
          endereco: Json | null
          entregas_total: number | null
          foto_url: string | null
          kyc_motivo: string | null
          kyc_status: string
          last_seen: string | null
          lat: number | null
          lng: number | null
          nascimento: string | null
          pin_atualizado_em: string | null
          pin_saque_hash: string | null
          pix_key: string | null
          pix_tipo: string | null
          placa: string | null
          rg: string | null
          selfie_url: string | null
          status: Database["public"]["Enums"]["courier_status"]
          telefone: string | null
          updated_at: string
          user_id: string
          veiculo: string | null
          whatsapp: string | null
        }
        Insert: {
          aceitacao_pct?: number | null
          aprovacao?: string | null
          avaliacao?: number | null
          bairros_atuacao?: string[] | null
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          banco_tipo?: string | null
          banco_titular?: string | null
          cancelamento_pct?: number | null
          cidade_atuacao?: string | null
          cidades_atuacao?: string[] | null
          cnh?: string | null
          cnh_categoria?: string | null
          cnh_validade?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_tel?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string | null
          created_at?: string
          doc_frente_url?: string | null
          doc_verso_url?: string | null
          endereco?: Json | null
          entregas_total?: number | null
          foto_url?: string | null
          kyc_motivo?: string | null
          kyc_status?: string
          last_seen?: string | null
          lat?: number | null
          lng?: number | null
          nascimento?: string | null
          pin_atualizado_em?: string | null
          pin_saque_hash?: string | null
          pix_key?: string | null
          pix_tipo?: string | null
          placa?: string | null
          rg?: string | null
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["courier_status"]
          telefone?: string | null
          updated_at?: string
          user_id: string
          veiculo?: string | null
          whatsapp?: string | null
        }
        Update: {
          aceitacao_pct?: number | null
          aprovacao?: string | null
          avaliacao?: number | null
          bairros_atuacao?: string[] | null
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_nome?: string | null
          banco_tipo?: string | null
          banco_titular?: string | null
          cancelamento_pct?: number | null
          cidade_atuacao?: string | null
          cidades_atuacao?: string[] | null
          cnh?: string | null
          cnh_categoria?: string | null
          cnh_validade?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_tel?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string | null
          created_at?: string
          doc_frente_url?: string | null
          doc_verso_url?: string | null
          endereco?: Json | null
          entregas_total?: number | null
          foto_url?: string | null
          kyc_motivo?: string | null
          kyc_status?: string
          last_seen?: string | null
          lat?: number | null
          lng?: number | null
          nascimento?: string | null
          pin_atualizado_em?: string | null
          pin_saque_hash?: string | null
          pix_key?: string | null
          pix_tipo?: string | null
          placa?: string | null
          rg?: string | null
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["courier_status"]
          telefone?: string | null
          updated_at?: string
          user_id?: string
          veiculo?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      courier_vehicles: {
        Row: {
          ano: number | null
          ativo: boolean | null
          cor: string | null
          courier_id: string
          created_at: string | null
          documento_url: string | null
          foto_url: string | null
          id: string
          marca: string | null
          modelo: string | null
          placa: string | null
          renavam: string | null
          status: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ano?: number | null
          ativo?: boolean | null
          cor?: string | null
          courier_id: string
          created_at?: string | null
          documento_url?: string | null
          foto_url?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          placa?: string | null
          renavam?: string | null
          status?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ano?: number | null
          ativo?: boolean | null
          cor?: string | null
          courier_id?: string
          created_at?: string | null
          documento_url?: string | null
          foto_url?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          placa?: string | null
          renavam?: string | null
          status?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      courier_withdrawals: {
        Row: {
          banco_info: Json | null
          comprovante_url: string | null
          courier_id: string
          created_at: string | null
          id: string
          liquido_cents: number | null
          metodo: string
          motivo_recusa: string | null
          pix_key: string | null
          processado_em: string | null
          status: string | null
          taxa_cents: number | null
          updated_at: string | null
          valor_cents: number
        }
        Insert: {
          banco_info?: Json | null
          comprovante_url?: string | null
          courier_id: string
          created_at?: string | null
          id?: string
          liquido_cents?: number | null
          metodo?: string
          motivo_recusa?: string | null
          pix_key?: string | null
          processado_em?: string | null
          status?: string | null
          taxa_cents?: number | null
          updated_at?: string | null
          valor_cents: number
        }
        Update: {
          banco_info?: Json | null
          comprovante_url?: string | null
          courier_id?: string
          created_at?: string | null
          id?: string
          liquido_cents?: number | null
          metodo?: string
          motivo_recusa?: string | null
          pix_key?: string | null
          processado_em?: string | null
          status?: string | null
          taxa_cents?: number | null
          updated_at?: string | null
          valor_cents?: number
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          aceito_em: string | null
          coletado_em: string | null
          created_at: string
          entregador_id: string | null
          entregue_em: string | null
          id: string
          lat: number | null
          lng: number | null
          order_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
          valor_entrega_cents: number
        }
        Insert: {
          aceito_em?: string | null
          coletado_em?: string | null
          created_at?: string
          entregador_id?: string | null
          entregue_em?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          order_id: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          valor_entrega_cents?: number
        }
        Update: {
          aceito_em?: string | null
          coletado_em?: string | null
          created_at?: string
          entregador_id?: string | null
          entregue_em?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          order_id?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          valor_entrega_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      estab_ad_subscriptions: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string
          establishment_id: string
          fim_em: string | null
          id: string
          inicio_em: string | null
          metodo_pagamento: string | null
          observacao: string | null
          plan_id: string
          preco_pago_cents: number
          status: string
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          establishment_id: string
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          metodo_pagamento?: string | null
          observacao?: string | null
          plan_id: string
          preco_pago_cents?: number
          status?: string
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          establishment_id?: string
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          metodo_pagamento?: string | null
          observacao?: string | null
          plan_id?: string
          preco_pago_cents?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estab_ad_subscriptions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "estab_ad_subscriptions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estab_ad_subscriptions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estab_ad_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "ad_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      estab_banners: {
        Row: {
          ativo: boolean
          created_at: string
          cta_link: string | null
          cta_texto: string | null
          data_final: string | null
          data_inicial: string | null
          establishment_id: string
          id: string
          imagem_url: string | null
          link_categoria: string | null
          link_produto: string | null
          ordem: number
          subtitulo: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          cta_link?: string | null
          cta_texto?: string | null
          data_final?: string | null
          data_inicial?: string | null
          establishment_id: string
          id?: string
          imagem_url?: string | null
          link_categoria?: string | null
          link_produto?: string | null
          ordem?: number
          subtitulo?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          cta_link?: string | null
          cta_texto?: string | null
          data_final?: string | null
          data_inicial?: string | null
          establishment_id?: string
          id?: string
          imagem_url?: string | null
          link_categoria?: string | null
          link_produto?: string | null
          ordem?: number
          subtitulo?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estab_banners_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "estab_banners_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estab_banners_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estab_banners_link_categoria_fkey"
            columns: ["link_categoria"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estab_banners_link_produto_fkey"
            columns: ["link_produto"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_delivery_zones: {
        Row: {
          ativo: boolean
          bairro: string | null
          created_at: string
          establishment_id: string
          id: string
          nome: string
          raio_km: number | null
          taxa_cents: number
          tempo_min: number | null
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          created_at?: string
          establishment_id: string
          id?: string
          nome: string
          raio_km?: number | null
          taxa_cents?: number
          tempo_min?: number | null
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          created_at?: string
          establishment_id?: string
          id?: string
          nome?: string
          raio_km?: number | null
          taxa_cents?: number
          tempo_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "establishment_delivery_zones_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "establishment_delivery_zones_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_delivery_zones_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_documents: {
        Row: {
          arquivo_url: string
          created_at: string
          establishment_id: string
          id: string
          motivo_recusa: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          arquivo_url: string
          created_at?: string
          establishment_id: string
          id?: string
          motivo_recusa?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          arquivo_url?: string
          created_at?: string
          establishment_id?: string
          id?: string
          motivo_recusa?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_documents_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "establishment_documents_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_documents_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_hours: {
        Row: {
          abre: string
          ativo: boolean
          created_at: string
          dia_semana: number
          establishment_id: string
          fecha: string
          id: string
        }
        Insert: {
          abre: string
          ativo?: boolean
          created_at?: string
          dia_semana: number
          establishment_id: string
          fecha: string
          id?: string
        }
        Update: {
          abre?: string
          ativo?: boolean
          created_at?: string
          dia_semana?: number
          establishment_id?: string
          fecha?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_hours_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "establishment_hours_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_hours_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_withdrawals: {
        Row: {
          banco_info: Json | null
          comprovante_url: string | null
          created_at: string
          establishment_id: string
          id: string
          liquido_cents: number | null
          metodo: string
          motivo_recusa: string | null
          pix_key: string | null
          pix_tipo: string | null
          processado_em: string | null
          requested_by: string
          status: string
          taxa_cents: number | null
          titular_documento: string | null
          titular_nome: string | null
          updated_at: string
          valor_cents: number
        }
        Insert: {
          banco_info?: Json | null
          comprovante_url?: string | null
          created_at?: string
          establishment_id: string
          id?: string
          liquido_cents?: number | null
          metodo?: string
          motivo_recusa?: string | null
          pix_key?: string | null
          pix_tipo?: string | null
          processado_em?: string | null
          requested_by: string
          status?: string
          taxa_cents?: number | null
          titular_documento?: string | null
          titular_nome?: string | null
          updated_at?: string
          valor_cents: number
        }
        Update: {
          banco_info?: Json | null
          comprovante_url?: string | null
          created_at?: string
          establishment_id?: string
          id?: string
          liquido_cents?: number | null
          metodo?: string
          motivo_recusa?: string | null
          pix_key?: string | null
          pix_tipo?: string | null
          processado_em?: string | null
          requested_by?: string
          status?: string
          taxa_cents?: number | null
          titular_documento?: string | null
          titular_nome?: string | null
          updated_at?: string
          valor_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "establishment_withdrawals_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "establishment_withdrawals_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_withdrawals_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          avaliacao: number | null
          banco_agencia: string | null
          banco_conta: string | null
          banco_documento: string | null
          banco_nome: string | null
          banco_tipo: string | null
          banco_titular: string | null
          capa_url: string | null
          categoria_id: string | null
          cidade: string | null
          cnpj: string | null
          cor_destaque: string | null
          created_at: string
          descricao: string | null
          endereco: string | null
          estado: string | null
          id: string
          instagram: string | null
          is_open: boolean
          kyc_motivo: string | null
          kyc_status: string
          lat: number | null
          lng: number | null
          logo_url: string | null
          nome: string
          owner_id: string
          pedido_minimo_cents: number
          pix_key: string | null
          raio_entrega_km: number
          razao_social: string | null
          site: string | null
          slogan: string | null
          status: Database["public"]["Enums"]["establishment_status"]
          taxa_entrega_cents: number
          telefone: string | null
          tempo_medio_min: number
          tipos: string[]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avaliacao?: number | null
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_documento?: string | null
          banco_nome?: string | null
          banco_tipo?: string | null
          banco_titular?: string | null
          capa_url?: string | null
          categoria_id?: string | null
          cidade?: string | null
          cnpj?: string | null
          cor_destaque?: string | null
          created_at?: string
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          instagram?: string | null
          is_open?: boolean
          kyc_motivo?: string | null
          kyc_status?: string
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          nome: string
          owner_id: string
          pedido_minimo_cents?: number
          pix_key?: string | null
          raio_entrega_km?: number
          razao_social?: string | null
          site?: string | null
          slogan?: string | null
          status?: Database["public"]["Enums"]["establishment_status"]
          taxa_entrega_cents?: number
          telefone?: string | null
          tempo_medio_min?: number
          tipos?: string[]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avaliacao?: number | null
          banco_agencia?: string | null
          banco_conta?: string | null
          banco_documento?: string | null
          banco_nome?: string | null
          banco_tipo?: string | null
          banco_titular?: string | null
          capa_url?: string | null
          categoria_id?: string | null
          cidade?: string | null
          cnpj?: string | null
          cor_destaque?: string | null
          created_at?: string
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          instagram?: string | null
          is_open?: boolean
          kyc_motivo?: string | null
          kyc_status?: string
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          nome?: string
          owner_id?: string
          pedido_minimo_cents?: number
          pix_key?: string | null
          raio_entrega_km?: number
          razao_social?: string | null
          site?: string | null
          slogan?: string | null
          status?: Database["public"]["Enums"]["establishment_status"]
          taxa_entrega_cents?: number
          telefone?: string | null
          tempo_medio_min?: number
          tipos?: string[]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishments_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "global_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "favorites_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      global_categories: {
        Row: {
          ativo: boolean
          created_at: string
          icone: string | null
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      login_sessions: {
        Row: {
          created_at: string
          dispositivo: string | null
          id: string
          ip: string | null
          revogada: boolean
          ultimo_acesso: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dispositivo?: string | null
          id?: string
          ip?: string | null
          revogada?: boolean
          ultimo_acesso?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dispositivo?: string | null
          id?: string
          ip?: string | null
          revogada?: boolean
          ultimo_acesso?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          ativo: boolean
          created_at: string
          establishment_id: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          establishment_id: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          establishment_id?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "menu_categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: string | null
          created_at: string
          id: string
          lida: boolean
          link_url: string | null
          mensagem: string
          titulo: string
          user_id: string | null
        }
        Insert: {
          audience?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          link_url?: string | null
          mensagem: string
          titulo: string
          user_id?: string | null
        }
        Update: {
          audience?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          link_url?: string | null
          mensagem?: string
          titulo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      order_chats: {
        Row: {
          created_at: string
          escopo: string
          id: string
          order_id: string
        }
        Insert: {
          created_at?: string
          escopo: string
          id?: string
          order_id: string
        }
        Update: {
          created_at?: string
          escopo?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_chats_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_incidents: {
        Row: {
          created_at: string
          descricao: string | null
          entregador_id: string | null
          foto_url: string | null
          id: string
          order_id: string
          protocolo: string
          status: string
          tipo: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          entregador_id?: string | null
          foto_url?: string | null
          id?: string
          order_id: string
          protocolo?: string
          status?: string
          tipo: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          entregador_id?: string | null
          foto_url?: string | null
          id?: string
          order_id?: string
          protocolo?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_incidents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          addons: Json
          created_at: string
          id: string
          nome_snapshot: string
          observacoes: string | null
          order_id: string
          preco_unit_cents: number
          product_id: string | null
          quantidade: number
        }
        Insert: {
          addons?: Json
          created_at?: string
          id?: string
          nome_snapshot: string
          observacoes?: string | null
          order_id: string
          preco_unit_cents: number
          product_id?: string | null
          quantidade: number
        }
        Update: {
          addons?: Json
          created_at?: string
          id?: string
          nome_snapshot?: string
          observacoes?: string | null
          order_id?: string
          preco_unit_cents?: number
          product_id?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          anexo_url: string | null
          chat_id: string
          conteudo: string | null
          created_at: string
          id: string
          lat: number | null
          lida_em: string | null
          lng: number | null
          sender_id: string
          sender_role: string
          tipo: string
        }
        Insert: {
          anexo_url?: string | null
          chat_id: string
          conteudo?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lida_em?: string | null
          lng?: number | null
          sender_id: string
          sender_role: string
          tipo?: string
        }
        Update: {
          anexo_url?: string | null
          chat_id?: string
          conteudo?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lida_em?: string | null
          lng?: number | null
          sender_id?: string
          sender_role?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "order_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          order_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_role: string | null
          cliente_id: string
          codigo_entrega: string | null
          created_at: string
          desconto_cents: number
          dinheiro_recebido: boolean
          endereco_entrega: Json | null
          entrega_metodo_prova: string | null
          entrega_observacao: string | null
          establishment_id: string
          forma_pagamento: Database["public"]["Enums"]["payment_method"]
          frete_cents: number
          id: string
          observacoes: string | null
          prova_assinatura: string | null
          prova_url: string | null
          refund_amount_cents: number
          refund_status: Database["public"]["Enums"]["refund_status"]
          refunded_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tempo_estimado_min: number | null
          tipo_entrega: string
          total_cents: number
          troco_para_cents: number | null
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_role?: string | null
          cliente_id: string
          codigo_entrega?: string | null
          created_at?: string
          desconto_cents?: number
          dinheiro_recebido?: boolean
          endereco_entrega?: Json | null
          entrega_metodo_prova?: string | null
          entrega_observacao?: string | null
          establishment_id: string
          forma_pagamento?: Database["public"]["Enums"]["payment_method"]
          frete_cents?: number
          id?: string
          observacoes?: string | null
          prova_assinatura?: string | null
          prova_url?: string | null
          refund_amount_cents?: number
          refund_status?: Database["public"]["Enums"]["refund_status"]
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tempo_estimado_min?: number | null
          tipo_entrega?: string
          total_cents?: number
          troco_para_cents?: number | null
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_role?: string | null
          cliente_id?: string
          codigo_entrega?: string | null
          created_at?: string
          desconto_cents?: number
          dinheiro_recebido?: boolean
          endereco_entrega?: Json | null
          entrega_metodo_prova?: string | null
          entrega_observacao?: string | null
          establishment_id?: string
          forma_pagamento?: Database["public"]["Enums"]["payment_method"]
          frete_cents?: number
          id?: string
          observacoes?: string | null
          prova_assinatura?: string | null
          prova_url?: string | null
          refund_amount_cents?: number
          refund_status?: Database["public"]["Enums"]["refund_status"]
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tempo_estimado_min?: number | null
          tipo_entrega?: string
          total_cents?: number
          troco_para_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_ledger: {
        Row: {
          commission_cents: number
          courier_id: string | null
          courier_payout_cents: number
          created_at: string
          delivery_fee_cents: number
          establishment_id: string | null
          gross_cents: number
          id: string
          merchant_payout_cents: number
          order_id: string | null
          platform_revenue_cents: number
          status: string
        }
        Insert: {
          commission_cents?: number
          courier_id?: string | null
          courier_payout_cents?: number
          created_at?: string
          delivery_fee_cents?: number
          establishment_id?: string | null
          gross_cents?: number
          id?: string
          merchant_payout_cents?: number
          order_id?: string | null
          platform_revenue_cents?: number
          status?: string
        }
        Update: {
          commission_cents?: number
          courier_id?: string | null
          courier_payout_cents?: number
          created_at?: string
          delivery_fee_cents?: number
          establishment_id?: string | null
          gross_cents?: number
          id?: string
          merchant_payout_cents?: number
          order_id?: string | null
          platform_revenue_cents?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_ledger_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "platform_ledger_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_ledger_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          ad_default_seconds: number
          bestseller_threshold: number
          commission_pct: number
          default_delivery_fee_cents: number
          default_radius_km: number
          id: number
          maintenance_mode: boolean
          platform_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ad_default_seconds?: number
          bestseller_threshold?: number
          commission_pct?: number
          default_delivery_fee_cents?: number
          default_radius_km?: number
          id?: number
          maintenance_mode?: boolean
          platform_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ad_default_seconds?: number
          bestseller_threshold?: number
          commission_pct?: number
          default_delivery_fee_cents?: number
          default_radius_km?: number
          id?: number
          maintenance_mode?: boolean
          platform_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      product_addon_groups: {
        Row: {
          addon_group_id: string
          ordem: number
          product_id: string
        }
        Insert: {
          addon_group_id: string
          ordem?: number
          product_id: string
        }
        Update: {
          addon_group_id?: string
          ordem?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_addon_groups_addon_group_id_fkey"
            columns: ["addon_group_id"]
            isOneToOne: false
            referencedRelation: "addon_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_addon_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          ativo: boolean
          created_at: string
          estoque: number | null
          id: string
          nome: string
          ordem: number
          preco_cents: number
          preco_promo_cents: number | null
          product_id: string
          tempo_extra_min: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          estoque?: number | null
          id?: string
          nome: string
          ordem?: number
          preco_cents: number
          preco_promo_cents?: number | null
          product_id: string
          tempo_extra_min?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          estoque?: number | null
          id?: string
          nome?: string
          ordem?: number
          preco_cents?: number
          preco_promo_cents?: number | null
          product_id?: string
          tempo_extra_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          descricao: string | null
          destaque: boolean
          disponivel: boolean
          establishment_id: string
          estoque: number | null
          foto_url: string | null
          id: string
          menu_category_id: string | null
          nome: string
          ordem: number
          preco_cents: number
          preco_promo_cents: number | null
          tempo_preparo_min: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          disponivel?: boolean
          establishment_id: string
          estoque?: number | null
          foto_url?: string | null
          id?: string
          menu_category_id?: string | null
          nome: string
          ordem?: number
          preco_cents: number
          preco_promo_cents?: number | null
          tempo_preparo_min?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          disponivel?: boolean
          establishment_id?: string
          estoque?: number | null
          foto_url?: string | null
          id?: string
          menu_category_id?: string | null
          nome?: string
          ordem?: number
          preco_cents?: number
          preco_promo_cents?: number | null
          tempo_preparo_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "products_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_menu_category_id_fkey"
            columns: ["menu_category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          foto_url: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          foto_url?: string | null
          id: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          foto_url?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          cliente_id: string
          comentario: string | null
          created_at: string
          entregador_id: string | null
          establishment_id: string
          id: string
          order_id: string
          problema_descricao: string | null
          problema_reportado: boolean
          rating_entregador: number | null
          rating_loja: number
          respondido_em: string | null
          resposta: string | null
        }
        Insert: {
          cliente_id: string
          comentario?: string | null
          created_at?: string
          entregador_id?: string | null
          establishment_id: string
          id?: string
          order_id: string
          problema_descricao?: string | null
          problema_reportado?: boolean
          rating_entregador?: number | null
          rating_loja: number
          respondido_em?: string | null
          resposta?: string | null
        }
        Update: {
          cliente_id?: string
          comentario?: string | null
          created_at?: string
          entregador_id?: string | null
          establishment_id?: string
          id?: string
          order_id?: string
          problema_descricao?: string | null
          problema_reportado?: boolean
          rating_entregador?: number | null
          rating_loja?: number
          respondido_em?: string | null
          resposta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_events: {
        Row: {
          courier_id: string
          created_at: string
          descricao: string | null
          id: string
          lat: number | null
          lng: number | null
          order_id: string | null
          resolvido: boolean
          tipo: string
        }
        Insert: {
          courier_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          order_id?: string | null
          resolvido?: boolean
          tipo: string
        }
        Update: {
          courier_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          order_id?: string | null
          resolvido?: boolean
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsored_ads: {
        Row: {
          ativo: boolean
          banner_path: string | null
          created_at: string
          cta_texto: string
          destino_url: string | null
          duracao_segundos: number
          establishment_id: string | null
          fim_em: string | null
          id: string
          imagem_url: string | null
          inicio_em: string | null
          motivo_recusa: string | null
          patrocinado: boolean
          prioridade: number
          status: string
          subscription_id: string | null
          subtitulo: string | null
          titulo: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          ativo?: boolean
          banner_path?: string | null
          created_at?: string
          cta_texto?: string
          destino_url?: string | null
          duracao_segundos?: number
          establishment_id?: string | null
          fim_em?: string | null
          id?: string
          imagem_url?: string | null
          inicio_em?: string | null
          motivo_recusa?: string | null
          patrocinado?: boolean
          prioridade?: number
          status?: string
          subscription_id?: string | null
          subtitulo?: string | null
          titulo: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          ativo?: boolean
          banner_path?: string | null
          created_at?: string
          cta_texto?: string
          destino_url?: string | null
          duracao_segundos?: number
          establishment_id?: string | null
          fim_em?: string | null
          id?: string
          imagem_url?: string | null
          inicio_em?: string | null
          motivo_recusa?: string | null
          patrocinado?: boolean
          prioridade?: number
          status?: string
          subscription_id?: string | null
          subtitulo?: string | null
          titulo?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_ads_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "sponsored_ads_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_ads_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_ads_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "estab_ad_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          motivo: string | null
          product_id: string
          quantidade: number
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          motivo?: string | null
          product_id: string
          quantidade: number
          tipo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          motivo?: string | null
          product_id?: string
          quantidade?: number
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "stock_movements_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          mensagem: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mensagem: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mensagem?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          assunto: string
          created_at: string
          id: string
          order_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          assunto: string
          created_at?: string
          id?: string
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          assunto?: string
          created_at?: string
          id?: string
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          aceito_em: string | null
          ativo: boolean
          convidado_em: string
          created_at: string
          email: string
          establishment_id: string
          id: string
          nome: string | null
          papel: Database["public"]["Enums"]["team_role"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          aceito_em?: string | null
          ativo?: boolean
          convidado_em?: string
          created_at?: string
          email: string
          establishment_id: string
          id?: string
          nome?: string | null
          papel?: Database["public"]["Enums"]["team_role"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          aceito_em?: string | null
          ativo?: boolean
          convidado_em?: string
          created_at?: string
          email?: string
          establishment_id?: string
          id?: string
          nome?: string | null
          papel?: Database["public"]["Enums"]["team_role"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "demand_zones_view"
            referencedColumns: ["establishment_id"]
          },
          {
            foreignKeyName: "team_members_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_points: {
        Row: {
          accuracy: number | null
          courier_id: string
          created_at: string
          heading: number | null
          id: string
          lat: number
          lng: number
          order_id: string | null
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          courier_id: string
          created_at?: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          order_id?: string | null
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          courier_id?: string
          created_at?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          order_id?: string | null
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_points_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
    }
    Views: {
      demand_zones_view: {
        Row: {
          cidade: string | null
          estabelecimento: string | null
          establishment_id: string | null
          lat: number | null
          lng: number | null
          pedidos_2h: number | null
          ticket_medio_cents: number | null
          ultimo_pedido: string | null
        }
        Relationships: []
      }
      establishments_public: {
        Row: {
          avaliacao: number | null
          capa_url: string | null
          categoria_id: string | null
          cidade: string | null
          created_at: string | null
          descricao: string | null
          endereco: string | null
          estado: string | null
          id: string | null
          is_open: boolean | null
          lat: number | null
          lng: number | null
          logo_url: string | null
          nome: string | null
          owner_id: string | null
          pedido_minimo_cents: number | null
          raio_entrega_km: number | null
          status: Database["public"]["Enums"]["establishment_status"] | null
          taxa_entrega_cents: number | null
          tempo_medio_min: number | null
          updated_at: string | null
        }
        Insert: {
          avaliacao?: number | null
          capa_url?: string | null
          categoria_id?: string | null
          cidade?: string | null
          created_at?: string | null
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string | null
          is_open?: boolean | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          nome?: string | null
          owner_id?: string | null
          pedido_minimo_cents?: number | null
          raio_entrega_km?: number | null
          status?: Database["public"]["Enums"]["establishment_status"] | null
          taxa_entrega_cents?: number | null
          tempo_medio_min?: number | null
          updated_at?: string | null
        }
        Update: {
          avaliacao?: number | null
          capa_url?: string | null
          categoria_id?: string | null
          cidade?: string | null
          created_at?: string | null
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string | null
          is_open?: boolean | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          nome?: string | null
          owner_id?: string | null
          pedido_minimo_cents?: number | null
          raio_entrega_km?: number | null
          status?: Database["public"]["Enums"]["establishment_status"] | null
          taxa_entrega_cents?: number | null
          tempo_medio_min?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishments_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "global_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "cliente" | "estabelecimento" | "entregador" | "admin"
      campaign_status: "draft" | "scheduled" | "active" | "paused" | "ended"
      coupon_type: "percent" | "fixed" | "free_delivery"
      courier_status:
        | "pendente"
        | "aprovado"
        | "online"
        | "offline"
        | "ocupado"
        | "bloqueado"
      delivery_status:
        | "created"
        | "broadcasting"
        | "accepted"
        | "to_store"
        | "at_store"
        | "picked_up"
        | "to_customer"
        | "at_customer"
        | "delivered"
        | "cancelled"
      establishment_status: "pendente" | "aprovado" | "bloqueado" | "rejeitado"
      order_status:
        | "pending_payment"
        | "placed"
        | "accepted"
        | "preparing"
        | "ready"
        | "waiting_courier"
        | "courier_assigned"
        | "picked_up"
        | "on_the_way"
        | "arriving"
        | "delivered"
        | "cancelled"
        | "refunded"
      payment_method: "pix" | "cartao" | "dinheiro" | "carteira"
      refund_status: "none" | "pending" | "completed" | "failed"
      team_role:
        | "proprietario"
        | "gerente"
        | "atendente"
        | "cozinha"
        | "financeiro"
        | "estoque"
        | "marketing"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status: "open" | "pending" | "resolved" | "closed"
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
      app_role: ["cliente", "estabelecimento", "entregador", "admin"],
      campaign_status: ["draft", "scheduled", "active", "paused", "ended"],
      coupon_type: ["percent", "fixed", "free_delivery"],
      courier_status: [
        "pendente",
        "aprovado",
        "online",
        "offline",
        "ocupado",
        "bloqueado",
      ],
      delivery_status: [
        "created",
        "broadcasting",
        "accepted",
        "to_store",
        "at_store",
        "picked_up",
        "to_customer",
        "at_customer",
        "delivered",
        "cancelled",
      ],
      establishment_status: ["pendente", "aprovado", "bloqueado", "rejeitado"],
      order_status: [
        "pending_payment",
        "placed",
        "accepted",
        "preparing",
        "ready",
        "waiting_courier",
        "courier_assigned",
        "picked_up",
        "on_the_way",
        "arriving",
        "delivered",
        "cancelled",
        "refunded",
      ],
      payment_method: ["pix", "cartao", "dinheiro", "carteira"],
      refund_status: ["none", "pending", "completed", "failed"],
      team_role: [
        "proprietario",
        "gerente",
        "atendente",
        "cozinha",
        "financeiro",
        "estoque",
        "marketing",
      ],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: ["open", "pending", "resolved", "closed"],
    },
  },
} as const
