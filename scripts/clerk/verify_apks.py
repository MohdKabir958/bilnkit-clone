#!/usr/bin/env python3
"""Verify actual handover APKs and emit public integrity/build metadata."""
import argparse,hashlib,json,os,re,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'build/clerk-test-apks'
SDK=Path(os.environ['ANDROID_HOME'])/'build-tools/36.0.0'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app',choices=['customer','vendor','driver'])
args=parser.parse_args()
records=[]
for app,label in [('customer','Customer'),('vendor','Vendor'),('driver','Delivery')]:
    if args.app and args.app!=app:continue
    apk=OUT/f'Grozo-{label}-Clerk-Test.apk'
    build=json.loads((OUT/f'{app}-build.json').read_text())
    if build['appSourceDirty']:raise RuntimeError('Do not publish APKs built from uncommitted app source.')
    badging=subprocess.check_output([str(SDK/'aapt2'),'dump','badging',str(apk)],text=True)
    manifest=subprocess.check_output([str(SDK/'aapt2'),'dump','xmltree',str(apk),'--file','AndroidManifest.xml'],text=True)
    signature=subprocess.check_output([str(SDK/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True)
    expected=f'in.grozo.{app}'
    assert f"package: name='{expected}'" in badging
    version_name=build.get('versionName','1.10.0')
    build_number=build.get('flutterBuildNumber',16)
    # Flutter adds 2000 to the base build number for an ARM64 split APK.
    version_code=2000+build_number
    assert f"versionCode='{version_code}'" in badging and f"versionName='{version_name}'" in badging
    assert f'{expected}.callback' in manifest and f'{expected}.oauth' in manifest
    assert 'clerk-test' in manifest and build['publishableKey'] in manifest
    assert 'GrozoClerkApplication' in manifest and 'GrozoClerkAuthActivity' in manifest
    with zipfile.ZipFile(apk) as z:
        assert z.testzip() is None
        abis=sorted({name.split('/')[1] for name in z.namelist() if name.startswith('lib/')})
        assert abis==['arm64-v8a'],abis
        if not build['authenticationPreview']:
            assert (build['apiOrigin']+'/api').encode() in z.read('lib/arm64-v8a/libapp.so'), 'Configured API endpoint missing from compiled app.'
        for name in z.namelist():
            if name.endswith('/'):continue
            if re.search(rb'sk_(?:test|live)_[A-Za-z0-9]{12,}',z.read(name)):
                raise RuntimeError(f'Potential Clerk Secret Key in APK entry {name}; investigate without printing it.')
    record={**build,'applicationId':expected,'versionName':version_name,'versionCode':version_code,'flutterBuildNumber':build_number,
       'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
       'permissions':re.findall(r"uses-permission(?:-sdk-\d+)?: name='([^']+)'",badging),
       'certificateSha256':re.search(r'Signer #1 certificate SHA-256 digest: (\S+)',signature).group(1),
       'verification':{'zipIntegrity':True,'androidSignature':True,'callbackManifest':True,'arm64Only':True,'clerkSecretPatternAbsent':True}}
    records.append(record)
    (OUT/f'{app}-apk-verification.txt').write_text(badging+'\n'+signature+'\n'+manifest)
(OUT/'manifest.json').write_text(json.dumps(records,indent=2)+'\n')
(OUT/'SHA256SUMS').write_text(''.join(f"{r['sha256']}  {r['filename']}\n" for r in records))
print(json.dumps([{k:r[k] for k in ['filename','bytes','sha256','applicationId']} for r in records],indent=2))
