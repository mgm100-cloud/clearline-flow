import { createClient } from '@supabase/supabase-js'
import { createAzureBackend } from './azureBackend'

// Backend selector: 'azure' -> Entra + self-hosted PostgREST; anything else -> Supabase.
// Flag-gated so the live Supabase build is untouched until the atomic cutover.
const BACKEND = (process.env.REACT_APP_BACKEND || 'supabase').toLowerCase()

let client

if (BACKEND === 'azure') {
  client = createAzureBackend()
} else {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
  const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

  console.log('🔧 Supabase configuration:');
  console.log('📍 URL:', supabaseUrl ? 'Set' : 'Missing');
  console.log('🔑 Anon Key:', supabaseAnonKey ? 'Set' : 'Missing');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase environment variables!');
    console.error('Please check your .env file contains:');
    console.error('REACT_APP_SUPABASE_URL=your_supabase_url');
    console.error('REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key');
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    // Add connection optimization settings
    db: {
      schema: 'public'
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
    // Add timeout settings
    global: {
      headers: {
        'x-client-info': 'clearline-flow-app'
      }
    }
  })
}

export const supabase = client
