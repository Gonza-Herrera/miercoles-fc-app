import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webPush from 'npm:web-push@3.6.7';
import { createPushHandler } from './handler.ts';

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});
// Authentication is checked with auth.getUser(token) on every request, including new signing-key JWTs.
Deno.serve(createPushHandler(client, webPush));
