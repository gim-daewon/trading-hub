export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      trades: {
        Row: {
          id: string
          ticker: string
          side: 'buy' | 'sell'
          price: number
          qty: number
          date: string
          type: 'earnings' | 'technical' | 'momentum' | 'news' | 'hedge' | 'other'
          reason: string | null
          note: string | null
          linked_trade_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['trades']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['trades']['Insert']>
      }
      positions: {
        Row: {
          id: string
          ticker: string
          side: 'long' | 'short'
          qty: number
          avg_price: number
          opened_at: string
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['positions']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['positions']['Insert']>
      }
      observations: {
        Row: {
          id: string
          metric_id: string
          value: number
          ts: string
          source: 'manual' | 'auto'
          citation: string | null
          note: string | null
          supersedes: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['observations']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['observations']['Insert']>
      }
      risk_events: {
        Row: {
          id: string
          ts: string
          title: string
          body: string | null
          url: string | null
          severity: 'info' | 'warn' | 'critical'
          affects: string[]
          tickers: string[]
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['risk_events']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['risk_events']['Insert']>
      }
    }
  }
}
