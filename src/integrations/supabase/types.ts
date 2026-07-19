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
      courier_profiles: {
        Row: {
          cnh: string | null
          created_at: string
          doc_frente_url: string | null
          doc_verso_url: string | null
          last_seen: string | null
          lat: number | null
          lng: number | null
          pix_key: string | null
          placa: string | null
          selfie_url: string | null
          status: Database["public"]["Enums"]["courier_status"]
          updated_at: string
          user_id: string
          veiculo: string | null
        }
        Insert: {
          cnh?: string | null
          created_at?: string
          doc_frente_url?: string | null
          doc_verso_url?: string | null
          last_seen?: string | null
          lat?: number | null
          lng?: number | null
          pix_key?: string | null
          placa?: string | null
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["courier_status"]
          updated_at?: string
          user_id: string
          veiculo?: string | null
        }
        Update: {
          cnh?: string | null
          created_at?: string
          doc_frente_url?: string | null
          doc_verso_url?: string | null
          last_seen?: string | null
          lat?: number | null
          lng?: number | null
          pix_key?: string | null
          placa?: string | null
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["courier_status"]
          updated_at?: string
          user_id?: string
          veiculo?: string | null
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
      establishments: {
        Row: {
          avaliacao: number | null
          capa_url: string | null
          categoria_id: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          descricao: string | null
          endereco: string | null
          estado: string | null
          id: string
          is_open: boolean
          lat: number | null
          lng: number | null
          logo_url: string | null
          nome: string
          owner_id: string
          pedido_minimo_cents: number
          pix_key: string | null
          raio_entrega_km: number
          status: Database["public"]["Enums"]["establishment_status"]
          taxa_entrega_cents: number
          telefone: string | null
          tempo_medio_min: number
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avaliacao?: number | null
          capa_url?: string | null
          categoria_id?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          is_open?: boolean
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          nome: string
          owner_id: string
          pedido_minimo_cents?: number
          pix_key?: string | null
          raio_entrega_km?: number
          status?: Database["public"]["Enums"]["establishment_status"]
          taxa_entrega_cents?: number
          telefone?: string | null
          tempo_medio_min?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avaliacao?: number | null
          capa_url?: string | null
          categoria_id?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          descricao?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          is_open?: boolean
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          nome?: string
          owner_id?: string
          pedido_minimo_cents?: number
          pix_key?: string | null
          raio_entrega_km?: number
          status?: Database["public"]["Enums"]["establishment_status"]
          taxa_entrega_cents?: number
          telefone?: string | null
          tempo_medio_min?: number
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
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
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
      orders: {
        Row: {
          cliente_id: string
          created_at: string
          desconto_cents: number
          endereco_entrega: Json | null
          establishment_id: string
          forma_pagamento: Database["public"]["Enums"]["payment_method"]
          frete_cents: number
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tempo_estimado_min: number | null
          total_cents: number
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          desconto_cents?: number
          endereco_entrega?: Json | null
          establishment_id: string
          forma_pagamento?: Database["public"]["Enums"]["payment_method"]
          frete_cents?: number
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tempo_estimado_min?: number | null
          total_cents?: number
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          desconto_cents?: number
          endereco_entrega?: Json | null
          establishment_id?: string
          forma_pagamento?: Database["public"]["Enums"]["payment_method"]
          frete_cents?: number
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tempo_estimado_min?: number | null
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
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
            referencedRelation: "establishments"
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "cliente" | "estabelecimento" | "entregador" | "admin"
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
    },
  },
} as const
