export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      reports: {
        Row: {
          id: string
          user_id: string | null
          report_data: Json
          pay_period_label: string | null
          matched_count: number | null
          unmatched_count: number | null
          total_claims: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          report_data: Json
          pay_period_label?: string | null
          matched_count?: number | null
          unmatched_count?: number | null
          total_claims?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          report_data?: Json
          pay_period_label?: string | null
          matched_count?: number | null
          unmatched_count?: number | null
          total_claims?: number | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
