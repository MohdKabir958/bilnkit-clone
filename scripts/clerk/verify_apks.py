#!/usr/bin/env python3
"""Verify actual handover APKs and emit public integrity/build metadata."""
import argparse,hashlib,json,os,re,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'build/clerk-test-apks'
SDK=Path(os.environ['ANDROID_HOME'])/'build-tools/36.0.0'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app',choices=['customer','vendor','driver'])
parser.add_argument('--previous-manifest',type=Path,default=ROOT/'Docs/clerk/evidence/android/manifest.json')
parser.add_argument('--allow-development-key-rotation',action='store_true',
    help='Explicitly allow a fresh development certificate; the preview cannot update an older installation in place.')
args=parser.parse_args()
records=[]
previous={r['applicationId']:r for r in json.loads(args.previous_manifest.read_text())} if args.previous_manifest.exists() else {}
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
    minimum_sdk=int(re.search(r"minSdkVersion:'(\d+)'",badging).group(1))
    target_sdk=int(re.search(r"targetSdkVersion:'(\d+)'",badging).group(1))
    assert minimum_sdk==24 and target_sdk>=35, 'Review supported Android versions before publication.'
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
            if re.search(rb'postgres(?:ql)?://[^\s/]{1,120}:[^\s/]{1,120}@',z.read(name)):
                raise RuntimeError(f'Potential database credentials in APK entry {name}; investigate without printing it.')
    record={**build,'applicationId':expected,'versionName':version_name,'versionCode':version_code,'flutterBuildNumber':build_number,
       'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
       'permissions':re.findall(r"uses-permission(?:-sdk-\d+)?: name='([^']+)'",badging),
       'certificateSha256':re.search(r'Signer #1 certificate SHA-256 digest: (\S+)',signature).group(1),
       'verification':{'zipIntegrity':True,'androidSignature':True,'callbackManifest':True,'arm64Only':True,'clerkSecretPatternAbsent':True}}
    signing_matches = expected in previous and record['certificateSha256']==previous[expected]['certificateSha256']
    if expected in previous and not signing_matches:
        assert args.allow_development_key_rotation and build['authMode']=='clerk-test' and build['signing']=='Android development signing; not a Play Store release', 'Signing certificate changed: do not claim update compatibility.'
        record['installationNotice'] = 'New development signing certificate. Uninstall the old preview before installing; local app data is removed. Server records are preserved. Never uninstall before preserving needed local data.'
    sensitive={'android.permission.ACCESS_FINE_LOCATION','android.permission.ACCESS_COARSE_LOCATION','android.permission.POST_NOTIFICATIONS','android.permission.CAMERA','android.permission.RECORD_AUDIO','android.permission.READ_CONTACTS','android.permission.READ_SMS','android.permission.READ_PHONE_STATE','android.permission.READ_MEDIA_IMAGES','android.permission.READ_EXTERNAL_STORAGE','android.permission.USE_FULL_SCREEN_INTENT','android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'}
    assert not ({'android.permission.CAMERA','android.permission.RECORD_AUDIO','android.permission.READ_CONTACTS','android.permission.READ_SMS'} & set(record['permissions'])), 'Unexpected sensitive permission requires investigation.'
    record.update({'minimumSdk':minimum_sdk,'targetSdk':target_sdk,'sensitivePermissionsForDeviceReview':sorted(sensitive & set(record['permissions'])),'historicalSigningCertificateMatches':signing_matches,'inPlaceUpdateCompatible':signing_matches})
    records.append(record)
    (OUT/f'{app}-apk-verification.txt').write_text(badging+'\n'+signature+'\n'+manifest)
(OUT/'manifest.json').write_text(json.dumps(records,indent=2)+'\n')
(OUT/'SHA256SUMS').write_text(''.join(f"{r['sha256']}  {r['filename']}\n" for r in records))
print(json.dumps([{k:r[k] for k in ['filename','bytes','sha256','applicationId']} for r in records],indent=2))
