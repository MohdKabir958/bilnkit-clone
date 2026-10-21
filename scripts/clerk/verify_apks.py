#!/usr/bin/env python3
"""Verify actual handover APKs and emit public integrity/build metadata."""
import hashlib,json,os,re,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'build/clerk-test-apks'
SDK=Path(os.environ['ANDROID_HOME'])/'build-tools/36.0.0'
records=[]
for app,label in [('customer','Customer'),('vendor','Vendor'),('driver','Delivery')]:
    apk=OUT/f'Grozo-{label}-Clerk-Test.apk'
    build=json.loads((OUT/f'{app}-build.json').read_text())
    if build['appSourceDirty']:raise RuntimeError('Do not publish APKs built from uncommitted app source.')
    badging=subprocess.check_output([str(SDK/'aapt2'),'dump','badging',str(apk)],text=True)
    manifest=subprocess.check_output([str(SDK/'aapt2'),'dump','xmltree',str(apk),'--file','AndroidManifest.xml'],text=True)
    signature=subprocess.check_output([str(SDK/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True)
    expected=f'in.grozo.{app}'
    assert f"package: name='{expected}'" in badging
    assert "versionCode='2016'" in badging and "versionName='1.10.0'" in badging
    assert f'{expected}.callback' in manifest and f'{expected}.oauth' in manifest
    assert 'clerk-test' in manifest and build['publishableKey'] in manifest
    assert 'GrozoClerkApplication' in manifest and 'GrozoClerkAuthActivity' in manifest
    with zipfile.ZipFile(apk) as z:
        assert z.testzip() is None
        abis=sorted({name.split('/')[1] for name in z.namelist() if name.startswith('lib/')})
        assert abis==['arm64-v8a'],abis
        for name in z.namelist():
            if name.endswith('/'):continue
            if re.search(rb'sk_(?:test|live)_[A-Za-z0-9]{12,}',z.read(name)):
                raise RuntimeError(f'Potential Clerk Secret Key in APK entry {name}; investigate without printing it.')
    record={**build,'applicationId':expected,'versionName':'1.10.0','versionCode':2016,'flutterBuildNumber':16,
       'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
       'permissions':re.findall(r"uses-permission(?:-sdk-\d+)?: name='([^']+)'",badging),
       'certificateSha256':re.search(r'Signer #1 certificate SHA-256 digest: (\S+)',signature).group(1),
       'verification':{'zipIntegrity':True,'androidSignature':True,'callbackManifest':True,'arm64Only':True,'clerkSecretPatternAbsent':True}}
    records.append(record)
    (OUT/f'{app}-apk-verification.txt').write_text(badging+'\n'+signature+'\n'+manifest)
(OUT/'manifest.json').write_text(json.dumps(records,indent=2)+'\n')
(OUT/'SHA256SUMS').write_text(''.join(f"{r['sha256']}  {r['filename']}\n" for r in records))
print(json.dumps([{k:r[k] for k in ['filename','bytes','sha256','applicationId']} for r in records],indent=2))
