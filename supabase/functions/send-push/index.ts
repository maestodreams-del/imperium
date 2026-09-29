// Authenticated event fan-out. Service account JSON stays in Edge secrets, base64 encoded.
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const credentials = JSON.parse(atob(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64') || 'e30='));
const allowed = new Set(['task','task_edit','claim','report','accept','reopen','extend','reset','task_failed','attendance_start','attendance_stop']);
let cachedAccess: { token: string; expires: number } | null = null;
const jsonHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...jsonHeaders, ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Database ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  const body = await response.text(); return body ? JSON.parse(body) : null;
}
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function fcmAccessToken() {
  if (cachedAccess && cachedAccess.expires > Date.now() + 60000) return cachedAccess.token;
  if (!credentials.private_key || !credentials.client_email || !credentials.project_id) throw new Error('Firebase service account missing');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const binary = atob(credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ''));
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(binary, c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`)));
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${base64url(sig)}` }) });
  if (!tokenResponse.ok) throw new Error(`OAuth ${tokenResponse.status}`);
  const value = await tokenResponse.json();
  cachedAccess = { token: value.access_token, expires: Date.now() + Number(value.expires_in || 3600) * 1000 };
  return cachedAccess.token;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const jwt = (request.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    if (!jwt) return reply(401, { error: 'Authentication required' });
    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${jwt}` } });
    if (!auth.ok) return reply(401, { error: 'Invalid session' });
    const user = await auth.json();
    const { event_id } = await request.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(event_id || ''))) return reply(400, { error: 'Invalid event' });
    const [event] = await rest(`events?select=id,event_type,actor_id,task_id,message,created_at&id=eq.${event_id}`);
    if (!event || event.actor_id !== user.id || !allowed.has(event.event_type) || Date.now() - Date.parse(event.created_at) > 180000)
      return reply(403, { error: 'Event is not dispatchable' });
    let locationId: string | null = null;
    if (event.task_id) {
      const [task] = await rest(`tasks?select=location_id&id=eq.${event.task_id}`);
      locationId = task?.location_id || null;
    }
    const profiles = await rest('profiles?select=id,role,active&active=eq.true');
    const recipients = new Set<string>(profiles.filter((p: { id: string; role: string }) => p.role === 'admin').map((p: { id: string }) => p.id));
    if (locationId) {
      const assignments = await rest(`profile_locations?select=profile_id&location_id=eq.${locationId}`);
      for (const a of assignments) if (profiles.some((p: { id: string }) => p.id === a.profile_id)) recipients.add(a.profile_id);
    }
    recipients.delete(user.id);
    if (!recipients.size) return reply(200, { sent: 0 });
    const tokenRows = await rest(`device_push_tokens?select=token,profile_id&profile_id=in.(${[...recipients].join(',')})`);
    if (!tokenRows.length) return reply(200, { sent: 0 });
    const accessToken = await fcmAccessToken();
    const claimed = await rest('push_dispatches?on_conflict=event_id', { method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ event_id }) });
    if (!claimed?.length) return reply(200, { sent: 0, duplicate: true });
    let sent = 0;
    for (const row of tokenRows) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.project_id)}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: row.token,
          data: { title: 'IMPERIUM', body: String(event.message).slice(0, 500), event_id: event.id },
          android: { priority: 'HIGH' } } }) });
      if (response.ok) sent++;
      else {
        const error = await response.text();
        if (response.status === 404 || error.includes('UNREGISTERED'))
          await rest(`device_push_tokens?token=eq.${encodeURIComponent(row.token)}`, { method: 'DELETE' });
        else console.error('FCM delivery failed', response.status, error.slice(0, 200));
      }
    }
    return reply(200, { sent });
  } catch (error) {
    console.error('Push dispatch:', error);
    return reply(500, { error: 'Push dispatch failed' });
  }
});
