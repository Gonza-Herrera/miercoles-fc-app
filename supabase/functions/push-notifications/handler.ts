const ADMIN_EMAIL = 'gon.herrera.dev@gmail.com';
const PRODUCTION_ORIGIN = 'https://miercoles-fc.netlify.app';
const PATHS = new Set(['/', '/cena/menu', '/partido/equipos', '/partido/confirmados']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && url.pathname !== '/' &&
      (host === 'fcm.googleapis.com' || host.endsWith('.push.apple.com') || host === 'updates.push.services.mozilla.com' || host.endsWith('.notify.windows.com'));
  } catch { return false; }
}

export function validSubscription(value: any) {
  return validPushEndpoint(value?.endpoint) && /^[A-Za-z0-9_-]{87}$/.test(value?.keys?.p256dh ?? '') && /^[A-Za-z0-9_-]{22}$/.test(value?.keys?.auth ?? '');
}

// Dependencies are explicit so authentication, fan-out and failure handling can be tested locally.
export function createPushHandler(client: any, webPush: any, sendFetch: typeof fetch = fetch) {
  async function keys(initialize: boolean) {
    let result = await client.rpc('push_vapid_read');
    if (result.error) throw result.error;
    if (!result.data && initialize) {
      const pair = webPush.generateVAPIDKeys();
      const saved = await client.rpc('push_vapid_initialize', { p_public: pair.publicKey, p_private: pair.privateKey });
      if (saved.error) throw saved.error;
      result = await client.rpc('push_vapid_read');
      if (result.error) throw result.error;
    }
    return result.data;
  }

  async function processJob(job: any, signingKeys: any) {
    const claimed = await client.rpc('claim_push_deliveries', { p_job: job.id });
    if (claimed.error) throw claimed.error;
    const deliveries = claimed.data ?? [];
    async function deliver(delivery: any) {
      let status = 'failed';
      const sub = await client.from('push_subscriptions').select('*').eq('id', delivery.subscription_id).eq('user_id', delivery.user_id).maybeSingle();
      if (sub.error) throw sub.error;
      const membership = await client.rpc('group_member_for_user', { p_user: delivery.user_id });
      if (membership.error) throw membership.error;
      if (!membership.data || !sub.data || !validSubscription(sub.data)) status = 'expired';
      else {
        let request;
        try {
          request = webPush.generateRequestDetails({ endpoint: sub.data.endpoint, keys: sub.data.keys },
            JSON.stringify({ id: job.id, title: job.title, body: job.body, path: job.path }),
            { vapidDetails: { subject: PRODUCTION_ORIGIN, publicKey: signingKeys.publicKey, privateKey: signingKeys.privateKey }, TTL: 3600, urgency: 'normal' });
        } catch { request = null; }
        if (request) {
          try {
            const response = await sendFetch(sub.data.endpoint, {
              method: 'POST', headers: request.headers, body: new Uint8Array(request.body).buffer,
              redirect: 'error', signal: AbortSignal.timeout(8000)
            });
            status = response.ok ? 'accepted' : [404, 410].includes(response.status) ? 'expired' : 'failed';
            await response.body?.cancel();
          } catch { status = 'uncertain'; }
        }
      }
      const updated = await client.from('push_deliveries').update({ status, updated_at: new Date().toISOString() })
        .eq('job_id', job.id).eq('subscription_id', delivery.subscription_id).eq('status', 'sending');
      if (updated.error) throw updated.error;
      if (status === 'expired' && sub.data) {
        const removed = await client.from('push_subscriptions').delete().eq('id', delivery.subscription_id).eq('user_id', delivery.user_id);
        if (removed.error) throw removed.error;
      }
    }
    // At most 15 deliveries per request, five concurrently: bounded execution and resumable jobs.
    for (let offset = 0; offset < deliveries.length; offset += 5) {
      await Promise.allSettled(deliveries.slice(offset, offset + 5).map(deliver));
    }
    const summary = await client.rpc('summarize_push_job', { p_job: job.id });
    if (summary.error || !summary.data?.[0]) throw summary.error || new Error('No se pudo confirmar el envío.');
    return summary.data[0];
  }

  return async function handler(req: Request): Promise<Response> {
    const origin = req.headers.get('origin');
    const allowed = !origin || origin === PRODUCTION_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Origin': allowed && origin ? origin : PRODUCTION_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
    if (!allowed) return reply({ error: 'Origen no permitido.' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405);
    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply({ error: 'Iniciá sesión para continuar.' }, 401);
    const verified = await client.auth.getUser(token);
    if (verified.error || !verified.data.user) return reply({ error: 'Sesión inválida.' }, 401);
    const user = verified.data.user;
    const admin = user.email === ADMIN_EMAIL;
    let input;
    try {
      const raw = await req.text();
      if (raw.length > 8192) return reply({ error: 'Solicitud demasiado grande.' }, 413);
      input = JSON.parse(raw);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    } catch { return reply({ error: 'Solicitud inválida.' }, 400); }
    try {
      if (input.action !== 'unsubscribe') {
        const membership = await client.rpc('group_member_for_user', { p_user: user.id });
        if (membership.error) throw membership.error;
        if (!membership.data) return reply({ error: 'Esta cuenta no tiene acceso. Contactá al administrador.' }, 403);
      }
      if (input.action === 'config') {
        const pair = await keys(admin);
        let devices: number | null = null;
        if (admin) {
          const count = await client.from('push_subscriptions').select('id', { count: 'exact', head: true });
          if (count.error) throw count.error;
          devices = count.count;
        }
        return reply({ publicKey: pair?.publicKey ?? null, devices });
      }
      if (input.action === 'subscribe') {
        if (!validSubscription(input.subscription)) return reply({ error: 'Suscripción inválida o dispositivo no compatible.' }, 400);
        if (!await keys(false)) return reply({ error: 'El admin debe habilitar primero el servicio de notificaciones.' }, 409);
        const saved = await client.from('push_subscriptions').upsert({ user_id: user.id,
          endpoint: input.subscription.endpoint, keys: input.subscription.keys, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
        if (saved.error) throw saved.error;
        return reply({ subscribed: true });
      }
      if (input.action === 'unsubscribe') {
        if (!validPushEndpoint(input.endpoint)) return reply({ error: 'Dispositivo inválido.' }, 400);
        const removed = await client.from('push_subscriptions').delete().eq('endpoint', input.endpoint).eq('user_id', user.id);
        if (removed.error) throw removed.error;
        return reply({ subscribed: false });
      }
      if (input.action === 'send') {
        if (!admin) return reply({ error: 'Solo el admin puede enviar notificaciones.' }, 403);
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        const body = typeof input.body === 'string' ? input.body.trim() : '';
        if (!UUID.test(input.id ?? '') || !title || title.length > 100 || !body || body.length > 500 || !PATHS.has(input.path)) {
          return reply({ error: 'Revisá el título, el mensaje y el destino.' }, 400);
        }
        const pair = await keys(true);
        const created = await client.rpc('create_push_job', { p_id: input.id, p_actor: user.id, p_title: title, p_body: body, p_path: input.path });
        if (created.error) throw created.error;
        const job = created.data?.[0];
        if (!job) throw new Error();
        return reply({ job: job.status === 'finished' ? job : await processJob(job, pair) });
      }
      return reply({ error: 'Acción no válida.' }, 400);
    } catch {
      // Never return signing keys, endpoints, database details or tokens in error bodies/logs.
      return reply({ error: 'No pudimos completar la operación. Si estabas enviando, reintentá el mismo envío desde el historial.' }, 503);
    }
  };
}
