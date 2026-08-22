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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          device_id: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_hint: string
          key_prefix: string
          last_used_at: string | null
          name: string
          requests_per_minute: number
          revoked_at: string | null
          scopes: string[]
          sms_per_day: number
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_hint: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          requests_per_minute?: number
          revoked_at?: string | null
          scopes?: string[]
          sms_per_day?: number
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_hint?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          requests_per_minute?: number
          revoked_at?: string | null
          scopes?: string[]
          sms_per_day?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          error_code: string | null
          id: string
          method: string
          path: string
          status_code: number
          user_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          method: string
          path: string
          status_code: number
          user_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          method?: string
          path?: string
          status_code?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      device_credentials: {
        Row: {
          created_at: string
          device_id: string
          id: string
          install_id: string | null
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          install_id?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          install_id?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_credentials_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_heartbeats: {
        Row: {
          android_version: string | null
          app_version: string | null
          battery_level: number | null
          created_at: string
          device_id: string
          id: string
          pending_jobs: number | null
          sms_permission: string | null
          user_id: string
        }
        Insert: {
          android_version?: string | null
          app_version?: string | null
          battery_level?: number | null
          created_at?: string
          device_id: string
          id?: string
          pending_jobs?: number | null
          sms_permission?: string | null
          user_id: string
        }
        Update: {
          android_version?: string | null
          app_version?: string | null
          battery_level?: number | null
          created_at?: string
          device_id?: string
          id?: string
          pending_jobs?: number | null
          sms_permission?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_heartbeats_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_pairing_codes: {
        Row: {
          code_hash: string
          created_at: string
          device_id: string | null
          device_name: string
          expires_at: string
          id: string
          sender_number: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          device_id?: string | null
          device_name: string
          expires_at: string
          id?: string
          sender_number?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          device_id?: string | null
          device_name?: string
          expires_at?: string
          id?: string
          sender_number?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_pairing_codes_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_devices: {
        Row: {
          android_version: string | null
          app_version: string | null
          created_at: string
          daily_sms_limit: number
          enabled: boolean
          gateway_device_id: string
          id: string
          install_id: string | null
          is_backup: boolean
          is_default: boolean
          last_heartbeat_at: string | null
          name: string
          paired_at: string | null
          sender_number: string | null
          sim_info: Json | null
          sms_permission: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          android_version?: string | null
          app_version?: string | null
          created_at?: string
          daily_sms_limit?: number
          enabled?: boolean
          gateway_device_id: string
          id?: string
          install_id?: string | null
          is_backup?: boolean
          is_default?: boolean
          last_heartbeat_at?: string | null
          name: string
          paired_at?: string | null
          sender_number?: string | null
          sim_info?: Json | null
          sms_permission?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          android_version?: string | null
          app_version?: string | null
          created_at?: string
          daily_sms_limit?: number
          enabled?: boolean
          gateway_device_id?: string
          id?: string
          install_id?: string | null
          is_backup?: boolean
          is_default?: boolean
          last_heartbeat_at?: string | null
          name?: string
          paired_at?: string | null
          sender_number?: string | null
          sim_info?: Json | null
          sms_permission?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allow_backup_routing: boolean
          created_at: string
          display_name: string | null
          id: string
          requests_per_minute: number
          sms_paused: boolean
          sms_per_day: number
          sms_per_hour: number
          updated_at: string
        }
        Insert: {
          allow_backup_routing?: boolean
          created_at?: string
          display_name?: string | null
          id: string
          requests_per_minute?: number
          sms_paused?: boolean
          sms_per_day?: number
          sms_per_hour?: number
          updated_at?: string
        }
        Update: {
          allow_backup_routing?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          requests_per_minute?: number
          sms_paused?: boolean
          sms_per_day?: number
          sms_per_hour?: number
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          count: number
          created_at: string
          id: string
          scope_id: string
          scope_type: string
          window_key: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          scope_id: string
          scope_type: string
          window_key: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          scope_id?: string
          scope_type?: string
          window_key?: string
        }
        Relationships: []
      }
      sms_delivery_events: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          job_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          job_id: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          job_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_delivery_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "sms_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_jobs: {
        Row: {
          api_key_id: string | null
          attempts: number
          body: string
          claimed_at: string | null
          created_at: string
          device_id: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          message_id: string
          recipient: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_id?: string | null
          attempts?: number
          body: string
          claimed_at?: string | null
          created_at?: string
          device_id?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          message_id: string
          recipient: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_id?: string | null
          attempts?: number
          body?: string
          claimed_at?: string | null
          created_at?: string
          device_id?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          message_id?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_jobs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_jobs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_rate_limit: {
        Args: { _scope_id: string; _scope_type: string; _window_key: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
