import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks = null;

export async function verifyClerkToken(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1];

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(env.CLERK_JWKS_URL));
  }

  try {
    const { payload } = await jwtVerify(token, jwks);
    return {
      userId: payload.sub,
      email: payload.email || payload.primary_email || null,
    };
  } catch {
    return null;
  }
}
