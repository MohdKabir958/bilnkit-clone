#!/usr/bin/env python3
"""Build development-signed ARM64 Clerk previews, or explicitly connected staging test APKs.

No Secret Key is read or needed. This does not enable the production Clerk-only cutover.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app',required=True,choices=['customer','vendor','driver'])
    parser.add_argument('--backend-origin',default='')
    parser.add_argument('--public-config',type=Path,default=ROOT/'Docs/clerk/android-preview-public.json')
    args=parser.parse_args()
    config=json.loads(args.public_config.read_text())
    key=config['publishableKey']
    if not key.startswith('pk_test_'):raise ValueError('Only a Clerk development publishable key is allowed.')
    encoded=key.removeprefix('pk_test_');host=base64.b64decode(encoded+'='*(-len(encoded)%4),validate=True).decode('ascii')
    if not host.endswith('.clerk.accounts.dev$'):raise ValueError('Use the intended Clerk development instance.')
    preview=not bool(args.backend_origin)
    origin=args.backend_origin.rstrip('/') if not preview else 'https://unconfigured.grozo.invalid'
    url=urlsplit(origin)
    if url.scheme!='https' or not url.hostname or url.username or url.password or url.path not in ('','/') or url.query or url.fragment:raise ValueError('Use an exact HTTPS backend origin.')
    if not preview and (url.hostname in ['localhost','127.0.0.1','10.0.2.2'] or url.hostname.endswith(('.invalid','.test','.example'))):raise ValueError('Connected test builds require a real staging backend.')
    env={**os.environ,'GROZO_AUTH_MODE':'clerk-test','CLERK_PUBLISHABLE_KEY':key,
         'ORG_GRADLE_PROJECT_disableFirebase':'true','CLERK_TELEMETRY_DISABLED':'1'}
    # Backend credentials are not inputs to a client build.
    for name in ['CLERK_SECRET_KEY','CLERK_WEBHOOK_SIGNING_SECRET','DATABASE_URL','MIGRATION_DATABASE_URL','JWT_SECRET','ADMIN_PASSCODE','PAYOUT_ENC_KEY']:
        env.pop(name,None)
    output=ROOT/'build/clerk-test-apks';output.mkdir(parents=True,exist_ok=True)
    command=['flutter','build','apk','--profile','--split-per-abi','--target-platform','android-arm64','--no-pub',
             '--build-name=1.10.0','--build-number=16','--dart-define=AUTH_MODE=clerk-test',
             f'--dart-define=AUTH_PREVIEW={str(preview).lower()}',f'--dart-define=API_BASE_URL={origin}/api',f'--dart-define=SOCKET_URL={origin}']
    app=ROOT/f'apps/{args.app}_app'
    with (output/f'{args.app}-build.log').open('w') as log:
        result=subprocess.run(command,cwd=app,env=env,stdout=log,stderr=subprocess.STDOUT)
    if result.returncode:return result.returncode
    label={'customer':'Customer','vendor':'Vendor','driver':'Delivery'}[args.app]
    target=output/f'Grozo-{label}-Clerk-Test.apk'
    shutil.copy2(app/'build/app/outputs/flutter-apk/app-arm64-v8a-profile.apk',target)
    build_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    source_dirty=bool(subprocess.check_output(['git','status','--porcelain','--','apps','packages'],cwd=ROOT,text=True).strip())
    (output/f'{args.app}-build.json').write_text(json.dumps({'filename':target.name,'command':command,'workingDirectory':str(app.relative_to(ROOT)),
        'exitCode':0,'buildCommit':build_commit,'appSourceDirty':source_dirty,'authMode':'clerk-test','authenticationPreview':preview,
        'apiOrigin':origin,'socketOrigin':origin,'clerkFrontendOrigin':'https://'+host[:-1],'publishableKey':key,
        'firebaseConfigured':False,'signing':'Android development signing; not a Play Store release','abi':'arm64-v8a'},indent=2)+'\n')
    print(json.dumps({'app':args.app,'filename':target.name,'bytes':target.stat().st_size,'preview':preview,'exitCode':0}))
    return 0


if __name__=='__main__':raise SystemExit(main())
