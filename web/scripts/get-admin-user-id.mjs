import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const email = 'brandon@communitycorewholesale.com';

const { data, error } = await supabase.auth.admin.listUsers();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

const user = data.users.find(u => u.email === email);

if (user) {
  console.log(`SERVICE_USER_ID=${user.id}`);
} else {
  console.error('User not found');
  process.exit(1);
}
