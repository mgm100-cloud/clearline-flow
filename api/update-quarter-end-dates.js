import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    console.log('🚀 Starting quarter end date update...');
    
    // Call the update_quarter_end_dates RPC function
    const { data, error } = await supabase.rpc('update_quarter_end_dates');
    
    if (error) throw error;
    
    console.log(`✅ Updated quarter end dates for ${data} records`);
    
    return res.status(200).json({ 
      success: true, 
      message: `Successfully updated quarter end dates for ${data} records`,
      updatedRecords: data 
    });
    
  } catch (error) {
    console.error('❌ Error updating quarter end dates:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
