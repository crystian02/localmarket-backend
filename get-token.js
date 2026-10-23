// get-token.js

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Falta SUPABASE_URL o SUPABASE_ANON_KEY en .env');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const email = 'superadmin@gmail.com';
const password = 'superadmin';

const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
  email,
  password
});

if (signUpError) {
  console.log('signUp error:', signUpError.message);
} else {
  console.log('Usuario creado:', signUpData.user?.email);
}

const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
});

if (error) {
  console.error('login error:', error.message);
  process.exit(1);
}

console.log('TOKEN:');
console.log(data.session.access_token);