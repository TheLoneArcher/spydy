const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:whatthehellisthispassword123@db.ynemxzwkaogfwglopary.supabase.co:5432/postgres' });
client.connect().then(() => {
  client.query("SELECT data_type, udt_name FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'status';").then(res => {
    console.log('Column type:', res.rows);
    return client.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE typname = 'report_status';");
  }).then(res => {
    console.log('Enum labels:', res.rows);
    return client.end();
  }).catch(e => console.error(e));
});
