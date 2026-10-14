import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64UrlEncode(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function createGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri?: string;
}) {
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Google Play service account is missing required credentials.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const privateKeyPem = serviceAccount.private_key
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const privateKeyDer = Uint8Array.from(atob(privateKeyPem), (character) => character.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );
  const assertion = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
  const response = await fetch(serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    console.error('Google OAuth token request failed:', response.status);
    throw new Error('Google Play purchase verification is unavailable.');
  }

  const tokenResponse: { access_token?: string } = await response.json();
  if (!tokenResponse.access_token) {
    throw new Error('Google OAuth did not return an access token.');
  }
  return tokenResponse.access_token;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const packageName = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
    const configuredProductId = Deno.env.get('GOOGLE_PLAY_PRODUCT_ID') ?? 'congeszen_pro_lifetime';
    const serviceAccountJson = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !packageName || !serviceAccountJson) {
      console.error('Google Play purchase verification is missing server configuration.');
      return jsonResponse({ error: 'Google Play purchase verification is not configured.' }, 500);
    }
    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authentication required.' }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser(authorization.slice(7));
    if (userError || !user) return jsonResponse({ error: 'Authentication required.' }, 401);

    let body: { purchaseToken?: unknown; productId?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid purchase request.' }, 400);
    }
    if (
      typeof body.purchaseToken !== 'string' ||
      body.purchaseToken.length === 0 ||
      body.purchaseToken.length > 4096 ||
      body.productId !== configuredProductId
    ) {
      return jsonResponse({ error: 'Invalid purchase details.' }, 400);
    }

    let serviceAccount: { client_email: string; private_key: string; token_uri?: string };
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch {
      console.error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON.');
      return jsonResponse({ error: 'Google Play purchase verification is not configured.' }, 500);
    }

    const googleAccessToken = await createGoogleAccessToken(serviceAccount);
    const purchasePath = [
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications',
      encodeURIComponent(packageName),
      'purchases/products',
      encodeURIComponent(configuredProductId),
      'tokens',
      encodeURIComponent(body.purchaseToken),
    ].join('/');
    const googleResponse = await fetch(purchasePath, {
      headers: { Authorization: 'Bearer ' + googleAccessToken },
    });
    if (!googleResponse.ok) {
      console.error('Google Play purchase lookup failed:', googleResponse.status);
      return jsonResponse({ error: 'Google Play could not verify this purchase.' }, 400);
    }

    const purchase: {
      purchaseState?: number;
      productId?: string;
      acknowledgementState?: number;
      orderId?: string;
    } = await googleResponse.json();
    if (purchase.purchaseState !== 0 || purchase.productId !== configuredProductId) {
      return jsonResponse({ error: 'Google Play has not confirmed this purchase.' }, 400);
    }

    const tokenDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(body.purchaseToken),
    );
    const purchaseTokenHash = Array.from(new Uint8Array(tokenDigest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: insertError } = await adminClient.from('google_play_purchases').insert({
      purchase_token_hash: purchaseTokenHash,
      user_id: user.id,
      product_id: configuredProductId,
      order_id: purchase.orderId ?? null,
    });

    if (insertError) {
      if (insertError.code !== '23505') {
        console.error('Could not record the verified Google Play purchase:', insertError.message);
        return jsonResponse({ error: 'Could not record the verified purchase.' }, 500);
      }
      const { data: existingPurchase, error: lookupError } = await adminClient
        .from('google_play_purchases')
        .select('user_id')
        .eq('purchase_token_hash', purchaseTokenHash)
        .maybeSingle();
      if (lookupError) {
        console.error('Could not check the Google Play purchase owner:', lookupError.message);
        return jsonResponse({ error: 'Could not confirm the purchase owner.' }, 500);
      }
      if (existingPurchase?.user_id !== user.id) {
        return jsonResponse({ error: 'This purchase is already linked to another account.' }, 409);
      }
    }

    if (purchase.acknowledgementState !== 1) {
      const acknowledgementResponse = await fetch(`${purchasePath}:acknowledge`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + googleAccessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (!acknowledgementResponse.ok) {
        console.error('Google Play purchase acknowledgement failed:', acknowledgementResponse.status);
        return jsonResponse({ error: 'Google Play could not complete purchase processing.' }, 502);
      }
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({ id: user.id, is_pro: true }, { onConflict: 'id' });
    if (profileError) {
      console.error('Could not activate Pro for the verified purchase:', profileError.message);
      return jsonResponse({ error: 'Could not activate CongésZen Pro.' }, 500);
    }

    return jsonResponse({ isPro: true });
  } catch (error) {
    console.error('Google Play purchase verification failed:', error);
    return jsonResponse({ error: 'Google Play purchase verification failed.' }, 500);
  }
});
