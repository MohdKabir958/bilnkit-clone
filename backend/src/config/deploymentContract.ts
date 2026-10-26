import { authMode } from './authMode';

export const CLIENT_PROTOCOL_VERSION = 1;
export type DeploymentEnv = Record<string, string | undefined>;
const safeLabel = (value: string | undefined, fallback: string) => value && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : fallback;

/** A Clerk publishable key contains its public frontend domain, never a backend secret. */
export function clerkFrontendOrigin(key?: string): string | null {
  if (!key || !/^pk_(test|live)_/.test(key)) return null;
  try {
    const encoded = key.replace(/^pk_(test|live)_/, '');
    if (!/^[A-Za-z0-9+/=_-]+$/.test(encoded)) return null;
    const host = Buffer.from(encoded, 'base64').toString('ascii');
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\$$/.test(host)) return null;
    return `https://${host.slice(0, -1)}`;
  } catch { return null; }
}

export function exactOrigin(value: string, name: string, allowLocal = false): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an exact origin.`); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:')) || !url.hostname || url.hostname.includes('*') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an exact HTTPS origin without credentials, paths, queries or wildcards.`);
  }
  return url.origin;
}

export function publicDeploymentContract(env: DeploymentEnv = process.env) {
  const mode = authMode(env);
  return {
    service: 'grozo-api',
    protocolVersion: CLIENT_PROTOCOL_VERSION,
    minimumClientProtocol: CLIENT_PROTOCOL_VERSION,
    auth: {
      mode,
      provider: mode === 'legacy' ? 'legacy' : 'clerk',
      instance: mode === 'legacy' ? null : clerkFrontendOrigin(env.CLERK_PUBLISHABLE_KEY),
      keyEnvironment: mode === 'legacy' ? null : env.CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_') ? 'production' : 'development',
    },
    environment: safeLabel(env.GROZO_ENV, env.NODE_ENV === 'production' ? 'production' : 'development'),
    release: safeLabel(env.RENDER_GIT_COMMIT || env.GROZO_RELEASE_SHA, 'unversioned'),
    clientContractRequired: env.REQUIRE_CLIENT_CONTRACT === 'true',
  };
}

/** Configuration mismatch is a deployment failure, not an expired user session. */
export function clientCompatibility(input: { mode?: string; protocol?: string; clerkInstance?: string }, env: DeploymentEnv = process.env): { compatible: boolean; message?: string } {
  const contract = publicDeploymentContract(env);
  if (!input.mode && !input.protocol && !input.clerkInstance) {
    return contract.clientContractRequired ? { compatible: false, message: 'This application needs an update before it can connect to Grozo.' } : { compatible: true };
  }
  if (!input.mode || !['legacy', 'clerk-test', 'clerk'].includes(input.mode)) return { compatible: false, message: 'This application has an unsupported authentication configuration. Contact Grozo support.' };
  if ((input.mode === 'legacy' ? 'legacy' : 'clerk') !== contract.auth.provider) return { compatible: false, message: 'This app and the Grozo server use different sign-in configurations. Ask the operator to deploy matching app and backend versions.' };
  if (!input.protocol || input.protocol !== String(CLIENT_PROTOCOL_VERSION)) return { compatible: false, message: 'This application version is incompatible with the Grozo server. Update the app and try again.' };
  if (input.mode === 'clerk-test' && contract.auth.keyEnvironment === 'production') return { compatible: false, message: 'This test app cannot connect to the production sign-in instance. Install the matching Grozo app.' };
  if (contract.clientContractRequired && contract.auth.provider === 'clerk' && !input.clerkInstance) return { compatible: false, message: 'This app must identify its configured Clerk instance. Install the matching Grozo app.' };
  if (input.clerkInstance) {
    let origin: string;
    try { origin = exactOrigin(input.clerkInstance, 'Clerk instance'); } catch { return { compatible: false, message: 'The application sign-in instance is not configured correctly.' }; }
    if (origin !== contract.auth.instance) return { compatible: false, message: 'The app and server use different Clerk applications. Ask the operator to configure the same environment.' };
  }
  return { compatible: true };
}
