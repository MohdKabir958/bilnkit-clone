#!/usr/bin/env node
// Inventory source references, Express registrations and DB linkage without reading any .env.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'backend/package.json'));
const ts = require('typescript');
const git = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
if (git.status !== 0) throw new Error('Cannot enumerate tracked source files.');
const tracked = git.stdout.split('\0').filter(Boolean).sort();
const scope = /^(backend\/(src|test|scripts|prisma)|apps\/(customer|vendor|driver)_app\/(lib|test|android)|web\/super_admin|packages\/(kraveo_ui\/lib|grozo_clerk\/android)|scripts|deploy|render\.yaml|\.github\/workflows)/;
const suffix = /\.(ts|tsx|dart|kt|kts|prisma|mjs|cjs|yaml|json|example)$/;
const ignore = /(package-lock\.json|pubspec\.lock|\/prisma\/(migrations|baseline)\/|\/assets\/|^scripts\/clerk\/)/;
const patterns = {
  identity: /\b(clerkUserId|Clerk|clerkMiddleware|getAuth|resolveClerkSession|verifiedClerkClaims|linkClerkIdentity|provisionClerkAdmin|googleSub|passwordHash|GoogleAuthService|PartnerAuthService|generateToken|verifyTokenForAccount|verifyGoogleIdToken)\b/g,
  session: /\b(ClerkSessions|ClerkIdentity|GetTokenOptions|freshAuthToken|installClerkTokenGetter|tokenVersion|invalidateAuthCache|bumpTokenVersion|accountMatchesToken|clearToken|getSavedToken|saveToken|getAuthToken|setAuthToken|clearAuthToken|SessionController|SessionProvider|SessionScope|SecureSessionTokens|FlutterSecureStorage|kraveo_admin_token|kraveo_admin_profile)\b/g,
  clientFlows: /\b(AuthGate|AuthScreen|LoginScreen|SignupScreen|ProfileSetupScreen|PartnerSession|PartnerSignupForm|GoogleSignIn|SignInOutcome|google_sign_in)\b/g,
  authentication: /\b(requireAuth|authenticateJwt|jwt|jsonwebtoken|GOOGLE_WEB_CLIENT_ID|JWT_SECRET|ADMIN_PASSCODE)\b|\/auth\/[a-z-]+/g,
  authorization: /\b(requireRole|requireApprovedPartner|approvalStatus|AuthenticatedRequest)\b/g,
  transports: /\b(Authorization|Bearer|socket\.handshake|socket\.auth|setAuth|join_room|update_driver_location)\b/g,
};
const files = [];
const endpoints = [];
const mounts = [];
for (const file of tracked.filter(f => scope.test(f) && suffix.test(f) && !ignore.test(f))) {
  const source = readFileSync(path.join(root, file), 'utf8');
  const references = [];
  for (const [kind, regex] of Object.entries(patterns)) {
    for (const match of source.matchAll(regex)) references.push({
      kind, symbol: match[0], line: source.slice(0, match.index).split('\n').length,
    });
  }
  if (references.length) files.push({ path: file, sha256: createHash('sha256').update(source).digest('hex'), references });
  if (!file.startsWith('backend/src/') || !file.endsWith('.ts')) continue;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const owner = node.expression.expression.getText(ast);
      const method = node.expression.name.text;
      if (/^(app|\w*Router)$/.test(owner) && /^(get|post|put|patch|delete|use)$/.test(method)) {
        const args = [...node.arguments];
        const hasPath = args[0] && (ts.isStringLiteralLike(args[0]) || ts.isArrayLiteralExpression(args[0]));
        const pathArg = hasPath ? args.shift() : undefined;
        const registeredPaths = !pathArg ? [''] : ts.isStringLiteralLike(pathArg) ? [pathArg.text] :
          pathArg.elements.map(n => ts.isStringLiteralLike(n) ? n.text : '<dynamic-path>');
        const middleware = args.filter(n => !ts.isArrowFunction(n) && !ts.isFunctionExpression(n))
          .map(n => n.getText(ast));
        const inlineHandlerLines = args.filter(n => ts.isArrowFunction(n) || ts.isFunctionExpression(n))
          .map(n => ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1);
        for (const registeredPath of registeredPaths) {
          const record = { file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
            router: owner, method: method.toUpperCase(), path: registeredPath, middleware, inlineHandlerLines };
          (method === 'use' ? mounts : endpoints).push(record);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const schema = readFileSync(path.join(root, 'backend/prisma/schema.prisma'), 'utf8');
const models = [...schema.matchAll(/model\s+(User|Vendor|DriverPartner|DeviceToken|ClerkIdentityState|ClerkWebhookDelivery)\s*\{([\s\S]*?)\n\}/g)]
  .map(match => ({ model: match[1], fields: match[2].split('\n').map(line => line.trim())
    .filter(line => line && !line.startsWith('//') && !line.startsWith('@@')) }));
const inventory = {
  baselineCommit: '0d2b149887bad33e8db1a7e91898d72f6904b9e6',
  status: 'Clerk backend/admin/Android integration implemented in isolated mode. Legacy default retained pending connected manual verification and explicit cutover approval.',
  scope: 'Tracked source/config/test files only; no .env, provider secrets, uploads or account records read.',
  limitations: 'Source reference inventory is navigation aid, not proof of authorization. Middleware inside handlers and ownership queries require manual review. Historical migrations are preserved, not renamed.',
  counts: { referencedFiles: files.length, endpoints: endpoints.length, mounts: mounts.length },
  databaseModels: models, routerMounts: mounts, endpoints, files,
};
const output = path.join(root, 'Docs/clerk/migration-inventory.json');
const json = JSON.stringify(inventory, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== json) throw new Error('Inventory is stale. Run node scripts/clerk/inventory.mjs.');
} else {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, json);
}
console.log(JSON.stringify(inventory.counts));
