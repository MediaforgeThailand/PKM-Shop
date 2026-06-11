import { HttpError } from './http.ts';

type RuntimeDeno = {
  env: {
    get: (key: string) => string | undefined;
  };
};

function readEnv(key: string) {
  const runtime = globalThis as typeof globalThis & { Deno?: RuntimeDeno };

  return runtime.Deno?.env.get(key);
}

function serviceConfig() {
  const supabaseUrl = readEnv('SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError('UPSTREAM', 'Missing Supabase service configuration.', 500);
  }

  return {
    serviceRoleKey,
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
  };
}

async function fetchStorageObject(bucket: string, path: string) {
  const { serviceRoleKey, supabaseUrl } = serviceConfig();
  const normalizedPath = path.replace(/^\/+/, '');
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${normalizedPath}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  });

  if (!response.ok) {
    throw new HttpError('UPSTREAM', `Unable to download ${bucket}/${normalizedPath}.`, response.status);
  }

  return response;
}

export async function downloadStorageObject(bucket: string, path: string) {
  const response = await fetchStorageObject(bucket, path);

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

export async function streamStorageObject(bucket: string, path: string) {
  const response = await fetchStorageObject(bucket, path);

  if (!response.body) {
    throw new HttpError('UPSTREAM', `Unable to stream ${bucket}/${path.replace(/^\/+/, '')}.`, 502);
  }

  return {
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    stream: response.body,
  };
}

export async function uploadStorageObject(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
  const { serviceRoleKey, supabaseUrl } = serviceConfig();
  const normalizedPath = path.replace(/^\/+/, '');
  const payload = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(payload).set(bytes);

  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${normalizedPath}`, {
    body: payload,
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': contentType,
      apikey: serviceRoleKey,
      'x-upsert': 'true',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new HttpError('UPSTREAM', `Unable to upload ${bucket}/${normalizedPath}.`, response.status);
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}
