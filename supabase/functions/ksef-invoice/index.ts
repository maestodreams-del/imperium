// Server-only KSeF connector. Configure KSEF_TOKEN_<seller NIP> as a Supabase secret.
import { createHash, createCipheriv, publicEncrypt, X509Certificate, constants, randomBytes } from 'node:crypto';
import '../../../invoice-format.js';

type Json = Record<string, any>;
const env = (name: string) => Deno.env.get(name) || '';
const supabase = env('SUPABASE_URL').replace(/\/$/, '');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
const api = (env('KSEF_ENVIRONMENT') === 'demo' ? 'https://api-demo.ksef.mf.gov.pl/v2' : 'https://api.ksef.mf.gov.pl/v2');
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const fail = (message: string, code = 400) => new Response(JSON.stringify({ error: message }), { status: code, headers: { 'Content-Type': 'application/json' } });
async function request(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.text(); let data: any;
  try { data = JSON.parse(body); } catch { data = body; }
  if (!res.ok) throw Error(`${res.status}: ${typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500)}`);
  return data;
}
function rest(path: string, init: RequestInit = {}) { return request(`${supabase}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } }); }
function ksef(path: string, init: RequestInit = {}, token?: string) { return request(`${api}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } }); }
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
function rsa(der: string, value: Uint8Array) {
  const pem = `-----BEGIN CERTIFICATE-----\n${der.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
  return b64(publicEncrypt({ key: new X509Certificate(pem).publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(value)));
}
async function certificate(usage: string) {
  const all = await ksef('/security/public-key-certificates', { method: 'GET' });
  const cert = all.find((x: Json) => x.usage?.includes(usage) && new Date(x.validFrom) <= new Date() && new Date(x.validTo) > new Date());
  if (!cert) throw Error(`Brak ważnego certyfikatu KSeF: ${usage}`);
  return cert;
}
async function accessToken(nip: string, secret: string) {
  const challenge = await ksef('/auth/challenge', { method: 'POST' });
  const cert = await certificate('KsefTokenEncryption');
  const encryptedToken = rsa(cert.certificate, new TextEncoder().encode(`${secret}|${challenge.timestampMs}`));
  const auth = await ksef('/auth/ksef-token', { method: 'POST', body: JSON.stringify({ challenge: challenge.challenge, contextIdentifier: { type: 'nip', value: nip }, encryptedToken, publicKeyId: cert.publicKeyId }) });
  for (let i = 0; i < 8; i++) {
    const status = await ksef(`/auth/${encodeURIComponent(auth.referenceNumber)}`, { method: 'GET' }, auth.authenticationToken.token);
    if (status.status?.code === 200) break;
    if (status.status?.code >= 400) throw Error(`Uwierzytelnienie KSeF: ${status.status?.description || status.status.code}`);
    if (i === 7) throw Error('Uwierzytelnienie KSeF trwa; spróbuj ponownie później.');
    await new Promise(r => setTimeout(r, 1000));
  }
  const redeemed = await ksef('/auth/token/redeem', { method: 'POST' }, auth.authenticationToken.token);
  return redeemed.accessToken.token as string;
}
async function save(id: string, data: Json, status?: string) {
  const rows = await rest(`invoice_drafts?id=eq.${encodeURIComponent(id)}${status ? `&status=eq.${status}` : ''}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data) });
  return rows?.[0];
}
async function lookup(id: string) {
  const rows = await rest(`invoice_drafts?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0];
}
async function reconcile(invoice: Json, token: string) {
  const result = await ksef(`/sessions/${encodeURIComponent(invoice.ksef_session)}/invoices/${encodeURIComponent(invoice.ksef_reference)}`, { method: 'GET' }, token);
  if (result.status?.code === 200 && result.ksefNumber) {
    let upo: string | null = null;
    try { const r = await fetch(`${api}/sessions/${encodeURIComponent(invoice.ksef_session)}/invoices/${encodeURIComponent(invoice.ksef_reference)}/upo`, { headers: { Authorization: `Bearer ${token}` } }); if (r.ok) upo = await r.text(); } catch { /* retry with next status check */ }
    return save(invoice.id, { status: 'accepted', ksef_number: result.ksefNumber, upo_xml: upo });
  }
  if (result.status?.code >= 400) return save(invoice.id, { status: 'rejected', ksef_error: result.status.description || String(result.status.code) });
  return invoice;
}
Deno.serve(async req => {
  if (req.method !== 'POST') return fail('POST required', 405);
  if (!supabase || !serviceKey) return fail('Konfiguracja usługi jest niekompletna.', 503);
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /i, '') || '';
  if (!jwt) return fail('Brak sesji.', 401);
  let body: Json; try { body = await req.json(); } catch { return fail('Nieprawidłowe żądanie.'); }
  if (!/^[0-9a-f-]{36}$/i.test(body.id || '') || !['send', 'status'].includes(body.action)) return fail('Nieprawidłowe żądanie.');
  try {
    const user = await request(`${supabase}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${jwt}` } });
    const profiles = await rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role,active`);
    if (profiles[0]?.role !== 'admin' || !profiles[0]?.active) return fail('Tylko administrator może wysłać fakturę.', 403);
    let invoice = await lookup(body.id); if (!invoice) return fail('Brak faktury.', 404);
    const sellers = await rest(`invoice_sellers?id=eq.${encodeURIComponent(invoice.seller_id)}&select=*`); const seller = sellers[0];
    if (!seller) return fail('Brak sprzedawcy.');
    const secret = env(`KSEF_TOKEN_${seller.nip}`);
    if (!secret) return fail('Token KSeF tej firmy nie został ustawiony na serwerze.', 503);
    if (body.action === 'status') {
      if (!invoice.ksef_session || !invoice.ksef_reference) return fail('Faktura nie ma numeru referencyjnego KSeF.');
      return Response.json(await reconcile(invoice, await accessToken(seller.nip, secret)));
    }
    if (invoice.status !== 'draft') return fail('Faktura została już wysłana lub jest przetwarzana.', 409);
    // Claim the draft atomically before any network submission. An uncertain outcome is never retried automatically.
    invoice = await save(invoice.id, { status: 'sending' }, 'draft');
    if (!invoice) return fail('Faktura jest już wysyłana.', 409);
    try {
      const format = (globalThis as any).ImperiumInvoice;
      const xml = format.generate({ number: invoice.invoice_number, issueDate: invoice.issue_date, saleDate: invoice.sale_date, dueDate: invoice.due_date, buyerName: invoice.buyer_name, buyerNip: invoice.buyer_nip, buyerStreet: invoice.buyer_street, buyerPostalCity: invoice.buyer_postal_city, lines: invoice.lines }, { name: seller.name, nip: seller.nip, streetAddress: seller.street_address, postalCity: seller.postal_city });
      await save(invoice.id, { issued_xml: xml });
      const token = await accessToken(seller.nip, secret);
      const key = randomBytes(32), iv = randomBytes(16), plaintext = Buffer.from(xml, 'utf8');
      const cipher = createCipheriv('aes-256-cbc', key, iv), encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const cert = await certificate('SymmetricKeyEncryption');
      const session = await ksef('/sessions/online', { method: 'POST', body: JSON.stringify({ formCode: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' }, encryption: { encryptedSymmetricKey: rsa(cert.certificate, key), initializationVector: b64(iv) } }) }, token);
      await save(invoice.id, { ksef_session: session.referenceNumber });
      const hash = (value: Uint8Array) => b64(createHash('sha256').update(value).digest());
      const sent = await ksef(`/sessions/online/${encodeURIComponent(session.referenceNumber)}/invoices`, { method: 'POST', body: JSON.stringify({ invoiceHash: hash(plaintext), invoiceSize: plaintext.length, encryptedInvoiceHash: hash(encrypted), encryptedInvoiceSize: encrypted.length, encryptedInvoiceContent: b64(encrypted) }) }, token);
      invoice = await save(invoice.id, { status: 'processing', ksef_reference: sent.referenceNumber, sent_at: new Date().toISOString() });
      try { await ksef(`/sessions/online/${encodeURIComponent(session.referenceNumber)}/close`, { method: 'POST' }, token); } catch { /* preserve reference for reconciliation */ }
      return Response.json(invoice);
    } catch (error) {
      await save(invoice.id, { ksef_error: String(error).slice(0, 1000) });
      throw error;
    }
  } catch (error) { return fail(String(error).slice(0, 1000), 502); }
});
