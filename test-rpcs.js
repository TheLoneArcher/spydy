const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: qData, error: qErr } = await supabase.rpc('execute_sql', { query: `
    SELECT pg_typeof(severity) FROM reports LIMIT 1;
  `});
  // actually there's no execute_sql RPC unless we make it. 
  // let's just make a new migration to replace submit_report.
}
check();
