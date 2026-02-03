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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      menu_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          recipe_id: string | null
          station: Database["public"]["Enums"]["kitchen_station"]
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          recipe_id?: string | null
          station: Database["public"]["Enums"]["kitchen_station"]
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          recipe_id?: string | null
          station?: Database["public"]["Enums"]["kitchen_station"]
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_menu_items_recipe"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      par_levels: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          menu_item_id: string
          par_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          menu_item_id: string
          par_quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          menu_item_id?: string
          par_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "par_levels_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_list_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          prep_list_id: string
          quantity_needed: number
          status: Database["public"]["Enums"]["prep_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          prep_list_id: string
          quantity_needed?: number
          status?: Database["public"]["Enums"]["prep_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          prep_list_id?: string
          quantity_needed?: number
          status?: Database["public"]["Enums"]["prep_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_list_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_list_items_prep_list_id_fkey"
            columns: ["prep_list_id"]
            isOneToOne: false
            referencedRelation: "prep_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_lists: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          prep_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          prep_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          prep_date?: string
        }
        Relationships: []
      }
      recipes: {
        Row: {
          created_at: string
          file_url: string | null
          food_cost_percent: number | null
          id: string
          ingredients: Json | null
          menu_price: number | null
          method: string | null
          name: string
          plating_notes: string | null
          portion_cost: number | null
          recipe_cost: number | null
          shelf_life: string | null
          tools: Json | null
          updated_at: string
          vehicle: string | null
          yield_amount: string | null
          yield_measure: string | null
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          food_cost_percent?: number | null
          id?: string
          ingredients?: Json | null
          menu_price?: number | null
          method?: string | null
          name: string
          plating_notes?: string | null
          portion_cost?: number | null
          recipe_cost?: number | null
          shelf_life?: string | null
          tools?: Json | null
          updated_at?: string
          vehicle?: string | null
          yield_amount?: string | null
          yield_measure?: string | null
        }
        Update: {
          created_at?: string
          file_url?: string | null
          food_cost_percent?: number | null
          id?: string
          ingredients?: Json | null
          menu_price?: number | null
          method?: string | null
          name?: string
          plating_notes?: string | null
          portion_cost?: number | null
          recipe_cost?: number | null
          shelf_life?: string | null
          tools?: Json | null
          updated_at?: string
          vehicle?: string | null
          yield_amount?: string | null
          yield_measure?: string | null
        }
        Relationships: []
      }
      sales_data: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          quantity_sold: number
          sales_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          quantity_sold?: number
          sales_date: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          quantity_sold?: number
          sales_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_data_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
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
      app_role: "admin" | "staff"
      kitchen_station: "grill" | "saute" | "fry" | "salad" | "line"
      prep_status: "open" | "in_progress" | "completed"
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
      app_role: ["admin", "staff"],
      kitchen_station: ["grill", "saute", "fry", "salad", "line"],
      prep_status: ["open", "in_progress", "completed"],
    },
  },
} as const
