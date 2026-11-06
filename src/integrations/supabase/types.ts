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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      access_code_attempts: {
        Row: {
          attempted_at: string
          code_id: string | null
          id: string
          shop_id: string | null
          succeeded: boolean
          user_id: string
        }
        Insert: {
          attempted_at?: string
          code_id?: string | null
          id?: string
          shop_id?: string | null
          succeeded?: boolean
          user_id: string
        }
        Update: {
          attempted_at?: string
          code_id?: string | null
          id?: string
          shop_id?: string | null
          succeeded?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_code_attempts_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "employee_access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_attempts_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          shop_id: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          shop_id: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          shop_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          consent_type: string
          created_at: string
          granted: boolean
          id: string
          policy_version: string
          source: string
          subject_hash: string
          user_id: string | null
        }
        Insert: {
          consent_type: string
          created_at?: string
          granted: boolean
          id?: string
          policy_version: string
          source?: string
          subject_hash: string
          user_id?: string | null
        }
        Update: {
          consent_type?: string
          created_at?: string
          granted?: boolean
          id?: string
          policy_version?: string
          source?: string
          subject_hash?: string
          user_id?: string | null
        }
        Relationships: []
      }
      data_requests: {
        Row: {
          created_at: string
          details: string | null
          id: string
          request_type: string
          response: string | null
          shop_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          request_type: string
          response?: string | null
          shop_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          request_type?: string
          response?: string | null
          shop_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      debtor_payments: {
        Row: {
          amount: number
          created_at: string
          debtor_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          paid_at: string
          reference: string | null
          sale_id: string | null
          shop_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          debtor_id: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          paid_at?: string
          reference?: string | null
          sale_id?: string | null
          shop_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          debtor_id?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          paid_at?: string
          reference?: string | null
          sale_id?: string | null
          shop_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debtor_payments_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debtor_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debtor_payments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      debtors: {
        Row: {
          created_at: string
          credit_limit: number | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          shop_id: string
          total_owed: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          shop_id: string
          total_owed?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          shop_id?: string
          total_owed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debtors_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_access_codes: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          label: string
          last_used_at: string | null
          member_id: string | null
          shop_id: string
          updated_at: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          last_used_at?: string | null
          member_id?: string | null
          shop_id: string
          updated_at?: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_used_at?: string | null
          member_id?: string | null
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_access_codes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "shop_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_codes_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          receipt_url: string | null
          shop_id: string
          spent_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          receipt_url?: string | null
          shop_id: string
          spent_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          receipt_url?: string | null
          shop_id?: string
          spent_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          balance_after: number | null
          created_at: string
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          shop_id: string
          unit_cost: number | null
          user_id: string | null
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          id?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          shop_id: string
          unit_cost?: number | null
          user_id?: string | null
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          shop_id?: string
          unit_cost?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          paid_at: string
          reference: string | null
          sale_id: string | null
          shop_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          paid_at?: string
          reference?: string | null
          sale_id?: string | null
          shop_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          paid_at?: string
          reference?: string | null
          sale_id?: string | null
          shop_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          buying_price: number
          category_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          is_low_stock: boolean | null
          low_stock_threshold: number
          name: string
          quantity: number
          selling_price: number
          shop_id: string
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          buying_price?: number
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_low_stock?: boolean | null
          low_stock_threshold?: number
          name: string
          quantity?: number
          selling_price?: number
          shop_id: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          buying_price?: number
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_low_stock?: boolean | null
          low_stock_threshold?: number
          name?: string
          quantity?: number
          selling_price?: number
          shop_id?: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      receipt_counters: {
        Row: {
          created_at: string
          next_number: number
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          next_number?: number
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          next_number?: number
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_counters_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_settings: {
        Row: {
          created_at: string
          footer_text: string | null
          header_text: string | null
          id: string
          logo_url: string | null
          paper_width_mm: number
          receipt_prefix: string
          shop_id: string
          show_logo: boolean
          show_tax: boolean
          tax_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          logo_url?: string | null
          paper_width_mm?: number
          receipt_prefix?: string
          shop_id: string
          show_logo?: boolean
          show_tax?: boolean
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          logo_url?: string | null
          paper_width_mm?: number
          receipt_prefix?: string
          shop_id?: string
          show_logo?: boolean
          show_tax?: boolean
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          product_id: string | null
          quantity: number
          refund_id: string
          restock: boolean
          sale_item_id: string | null
          shop_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          product_id?: string | null
          quantity: number
          refund_id: string
          restock?: boolean
          sale_item_id?: string | null
          shop_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          product_id?: string | null
          quantity?: number
          refund_id?: string
          restock?: boolean
          sale_item_id?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          reason: string | null
          sale_id: string
          shop_id: string
          status: Database["public"]["Enums"]["refund_status"]
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          sale_id: string
          shop_id: string
          status?: Database["public"]["Enums"]["refund_status"]
          total_amount: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          sale_id?: string
          shop_id?: string
          status?: Database["public"]["Enums"]["refund_status"]
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          buying_price: number
          created_at: string
          discount_amount: number
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          shop_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          buying_price?: number
          created_at?: string
          discount_amount?: number
          id?: string
          product_id?: string | null
          product_name: string
          quantity: number
          sale_id: string
          shop_id: string
          subtotal: number
          unit_price: number
        }
        Update: {
          buying_price?: number
          created_at?: string
          discount_amount?: number
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          shop_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          balance_due: number
          client_tx_id: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          debtor_id: string | null
          discount_amount: number
          id: string
          note: string | null
          receipt_number: string
          shop_id: string
          sold_at: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          client_tx_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          debtor_id?: string | null
          discount_amount?: number
          id?: string
          note?: string | null
          receipt_number: string
          shop_id: string
          sold_at?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          client_tx_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          debtor_id?: string | null
          discount_amount?: number
          id?: string
          note?: string | null
          receipt_number?: string
          shop_id?: string
          sold_at?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "debtors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_access_secrets: {
        Row: {
          salt: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          salt: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          salt?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_access_secrets_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_deletions: {
        Row: {
          counts: Json
          created_at: string
          deleted_by: string | null
          id: string
          member_count: number
          owner_id: string | null
          shop_id: string
          shop_name: string
          shop_slug: string | null
        }
        Insert: {
          counts?: Json
          created_at?: string
          deleted_by?: string | null
          id?: string
          member_count?: number
          owner_id?: string | null
          shop_id: string
          shop_name: string
          shop_slug?: string | null
        }
        Update: {
          counts?: Json
          created_at?: string
          deleted_by?: string | null
          id?: string
          member_count?: number
          owner_id?: string | null
          shop_id?: string
          shop_name?: string
          shop_slug?: string | null
        }
        Relationships: []
      }
      shop_members: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["shop_role"]
          shop_id: string
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["shop_role"]
          shop_id: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["shop_role"]
          shop_id?: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          accepts_refunds: boolean
          address: string | null
          business_type: string | null
          city: string | null
          created_at: string
          currency: string
          email: string | null
          employee_joining_enabled: boolean
          id: string
          is_active: boolean
          kra_pin: string | null
          location: string | null
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          accepts_refunds?: boolean
          address?: string | null
          business_type?: string | null
          city?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          employee_joining_enabled?: boolean
          id?: string
          is_active?: boolean
          kra_pin?: string | null
          location?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          accepts_refunds?: boolean
          address?: string | null
          business_type?: string | null
          city?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          employee_joining_enabled?: boolean
          id?: string
          is_active?: boolean
          kra_pin?: string | null
          location?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      access_code_is_ambiguous: { Args: { p_code: string }; Returns: boolean }
      admin_activity_feed: {
        Args: {
          p_event_names?: string[]
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_ai_usage: { Args: { p_days?: number }; Returns: Json }
      admin_analytics_overview: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_error_feed: {
        Args: {
          p_category?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_severity?: string
          p_to?: string
        }
        Returns: Json
      }
      admin_export_activity_csv: {
        Args: { p_event_names?: string[]; p_from: string; p_to: string }
        Returns: string
      }
      admin_list_knowledge: { Args: never; Returns: Json }
      admin_set_knowledge: {
        Args: { p_body: string; p_slug: string; p_title: string }
        Returns: undefined
      }
      ai_consume_quota: {
        Args: {
          p_input_tokens?: number
          p_output_tokens?: number
          p_request_limit?: number
          p_requests?: number
          p_token_limit?: number
          p_user_id: string
        }
        Returns: Json
      }
      ai_knowledge_overrides: { Args: never; Returns: Json }
      analytics_end_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      analytics_record_error: {
        Args: {
          p_app_version?: string
          p_category: string
          p_correlation_id?: string
          p_message: string
          p_route?: string
          p_session_id: string
          p_severity: string
        }
        Returns: boolean
      }
      analytics_start_session: {
        Args: {
          p_app_version?: string
          p_device?: string
          p_platform?: string
          p_visitor_id: string
        }
        Returns: string
      }
      analytics_track_event: {
        Args: {
          p_event_name: string
          p_props?: Json
          p_session_id: string
          p_shop_id?: string
        }
        Returns: boolean
      }
      audit_write: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type?: string
          p_metadata?: Json
          p_shop_id: string
          p_summary?: string
        }
        Returns: undefined
      }
      consent_subject_hash: { Args: { p_user_id: string }; Returns: string }
      create_employee_access_code: {
        Args: { p_code: string; p_label: string; p_shop_id: string }
        Returns: Json
      }
      create_refund: {
        Args: { p_items: Json; p_reason?: string; p_sale_id: string }
        Returns: Json
      }
      create_sale: {
        Args: {
          p_amount_tendered?: number
          p_client_tx_id?: string
          p_debtor_name?: string
          p_debtor_phone?: string
          p_discount_amount?: number
          p_items: Json
          p_note?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_shop_id: string
        }
        Returns: Json
      }
      delete_my_account: { Args: never; Returns: Json }
      delete_shop: {
        Args: { p_confirm_shop_name: string; p_shop_id: string }
        Returns: Json
      }
      ensure_shop_access_salt: { Args: { p_shop_id: string }; Returns: string }
      has_shop_role: {
        Args: {
          _roles: Database["public"]["Enums"]["shop_role"][]
          _shop_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_shop_member: { Args: { _shop_id: string }; Returns: boolean }
      is_shop_owner: { Args: { _shop_id: string }; Returns: boolean }
      lodge_data_request: {
        Args: { p_details?: string; p_request_type: string; p_shop_id?: string }
        Returns: string
      }
      next_receipt_number: { Args: { p_shop_id: string }; Returns: string }
      purge_access_code_attempts: {
        Args: { p_older_than_days?: number }
        Returns: number
      }
      purge_audit_log: { Args: { p_older_than_days?: number }; Returns: number }
      record_consent: {
        Args: {
          p_consent_type: string
          p_granted: boolean
          p_policy_version: string
          p_source?: string
        }
        Returns: string
      }
      record_debtor_payment: {
        Args: {
          p_amount: number
          p_debtor_id: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_reference?: string
        }
        Returns: Json
      }
      record_stock_movement: {
        Args: {
          p_movement_type: Database["public"]["Enums"]["movement_type"]
          p_new_quantity?: number
          p_notes?: string
          p_product_id: string
          p_quantity?: number
          p_unit_cost?: number
        }
        Returns: {
          barcode: string | null
          buying_price: number
          category_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          is_low_stock: boolean | null
          low_stock_threshold: number
          name: string
          quantity: number
          selling_price: number
          shop_id: string
          sku: string | null
          unit: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_employee_access_code: { Args: { p_code: string }; Returns: Json }
      regenerate_employee_access_code: {
        Args: { p_code: string; p_shop_id: string }
        Returns: Json
      }
      set_employee_joining: {
        Args: { p_enabled: boolean; p_shop_id: string }
        Returns: {
          accepts_refunds: boolean
          address: string | null
          business_type: string | null
          city: string | null
          created_at: string
          currency: string
          email: string | null
          employee_joining_enabled: boolean
          id: string
          is_active: boolean
          kra_pin: string | null
          location: string | null
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "shops"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shop_access_salt: { Args: { p_shop_id: string }; Returns: string }
      shop_deletion_counts: { Args: { p_shop_id: string }; Returns: Json }
      shop_deletion_preview: { Args: { p_shop_id: string }; Returns: Json }
      shop_member_directory: {
        Args: { p_shop_id: string }
        Returns: {
          display_name: string
          role: Database["public"]["Enums"]["shop_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }[]
      }
      shop_report: {
        Args: { p_from: string; p_shop_id: string; p_to: string }
        Returns: Json
      }
      storage_shop_id: { Args: { _name: string }; Returns: string }
      withdraw_data_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
    }
    Enums: {
      member_status: "active" | "suspended" | "removed"
      movement_type:
        | "stock_in"
        | "sale"
        | "adjustment"
        | "refund"
        | "damage"
        | "transfer"
        | "opening"
      payment_method: "cash" | "mpesa" | "card" | "bank" | "credit"
      refund_status: "pending" | "approved" | "rejected"
      sale_status: "completed" | "partial" | "pending" | "cancelled"
      shop_role: "owner" | "employee"
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
      member_status: ["active", "suspended", "removed"],
      movement_type: [
        "stock_in",
        "sale",
        "adjustment",
        "refund",
        "damage",
        "transfer",
        "opening",
      ],
      payment_method: ["cash", "mpesa", "card", "bank", "credit"],
      refund_status: ["pending", "approved", "rejected"],
      sale_status: ["completed", "partial", "pending", "cancelled"],
      shop_role: ["owner", "employee"],
    },
  },
} as const
