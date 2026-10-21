#!/usr/bin/env python3
"""Read-only Clerk mobile SDK review. Never accepts or uses a Clerk secret key.

This checks public source/artifact provenance and provider connectivity, not sign-in.
Exit 2 means the migration's mobile acceptance gate is NOT cleared.
"""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
FLUTTER_VERSION = "0.0.18-beta"
ANDROID_VERSION = "1.2.1"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Grozo-Clerk-feasibility/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def frontend_origin(key: str) -> str:
    """Validate the supplied PUBLIC key before contacting the Clerk-owned dev domain."""
    if not key.startswith("pk_test_"):
        raise ValueError("Use a development publishable key for this probe.")
    encoded = key.removeprefix("pk_test_")
    host = base64.b64decode(encoded + "=" * (-len(encoded) % 4), validate=True).decode("ascii")
    if not host.endswith(".clerk.accounts.dev$"):
        raise ValueError("Expected a Clerk development domain.")
    host = host[:-1]
    if any(c not in "abcdefghijklmnopqrstuvwxyz0123456789.-" for c in host):
        raise ValueError("Invalid Clerk development hostname.")
    return f"https://{host}"


def archive_sources(package: str) -> tuple[dict, dict[str, str]]:
    metadata_url = f"https://pub.dev/api/packages/{package}/versions/{FLUTTER_VERSION}"
    metadata = json.loads(fetch(metadata_url))
    archive_url = f"https://pub.dev/api/archives/{package}-{FLUTTER_VERSION}.tar.gz"
    data = fetch(archive_url)
    digest = hashlib.sha256(data).hexdigest()
    if digest != metadata["archive_sha256"]:
        raise ValueError("Pub archive checksum mismatch.")
    # Read named members in memory: never extract untrusted archive paths to disk.
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        sources = {member.name: archive.extractfile(member).read().decode("utf-8")
                   for member in archive.getmembers()
                   if member.isfile() and member.name.endswith(".dart")}
    return {"package": package, "version": FLUTTER_VERSION, "url": archive_url,
            "sha256": digest, "environment": metadata["pubspec"]["environment"]}, sources


def source_reference(sources: dict[str, str], path: str, needle: str) -> dict:
    source = sources[path]
    position = source.find(needle)
    if position < 0:
        raise ValueError(f"Source changed: expected {needle!r} in {path}")
    return {"path": path, "line": source[:position].count("\n") + 1, "symbol": needle}


def run(key: str | None) -> dict:
    report = {"scope": "Public SDK source/artifact review and unauthenticated connectivity only",
              "secretKeyUsed": False, "authenticationPerformed": False,
              "mobileGateCleared": False, "status": "BLOCKED_PENDING_MOBILE_VALIDATION",
              "checks": {}, "errors": []}
    try:
        flutter, flutter_sources = archive_sources("clerk_flutter")
        auth, auth_sources = archive_sources("clerk_auth")
        report["checks"]["flutterBeta"] = {
            "artifacts": [flutter, auth],
            "defaultPersistence": "Plain JSON file; default is unsuitable for session credentials.",
            "persistenceEvidence": source_reference(auth_sources, "lib/src/clerk_auth/persistor.dart", "_cacheFile.writeAsString(data)"),
            "credentialPersistenceEvidence": source_reference(auth_sources, "lib/src/clerk_api/token_cache.dart", "persistor.write(_clientTokenKey, token)"),
            "googleFlow": "Embedded WebView with custom user agent; not selected for Grozo.",
            "googleEvidence": source_reference(flutter_sources, "lib/src/clerk_auth_state.dart", "controller.setUserAgent(clerk.ClerkConstants.userAgent)"),
            "decision": "Reject defaults. Evaluate official Android SDK through MethodChannel instead.",
            "caveat": "The beta exposes custom persistence and authentication extension points; these findings concern its defaults, not every possible integration.",
        }
    except Exception as error:
        report["errors"].append({"check": "flutterBeta", "type": type(error).__name__})
    try:
        base = f"https://repo.maven.apache.org/maven2/com/clerk/clerk-android-api/{ANDROID_VERSION}/clerk-android-api-{ANDROID_VERSION}"
        module = json.loads(fetch(base + ".module"))
        sources_data = fetch(base + "-sources.jar")
        expected = next(f["sha256"] for variant in module["variants"] for f in variant.get("files", [])
                        if f["name"].endswith("-sources.jar"))
        if hashlib.sha256(sources_data).hexdigest() != expected:
            raise ValueError("Maven sources checksum mismatch.")
        with zipfile.ZipFile(io.BytesIO(sources_data)) as archive:
            sources = {name: archive.read(name).decode("utf-8") for name in archive.namelist() if name.endswith(".kt")}
        report["checks"]["officialAndroid"] = {
            "artifact": f"com.clerk:clerk-android-api:{ANDROID_VERSION}",
            "sourceUrl": base + "-sources.jar", "sourceSha256": expected,
            "storageEvidence": source_reference(sources, "com/clerk/api/storage/StorageCipher.kt", 'KeyStore.getInstance(ANDROID_KEYSTORE)'),
            "encryptionEvidence": source_reference(sources, "com/clerk/api/storage/StorageCipher.kt", '"AES/GCM/NoPadding"'),
            "storageFailureEvidence": source_reference(sources, "com/clerk/api/storage/StorageHelper.kt", "Encrypted storage is unavailable, ignoring save"),
            "refreshEvidence": source_reference(sources, "com/clerk/api/auth/Auth.kt", "public suspend fun getToken("),
            "signOutEvidence": source_reference(sources, "com/clerk/api/auth/Auth.kt", "public suspend fun signOut("),
            "decision": "Candidate for Android-first bridge; compilation and real lifecycle checks required.",
        }
    except Exception as error:
        report["errors"].append({"check": "officialAndroid", "type": type(error).__name__})
    if key:
        try:
            origin = frontend_origin(key)
            # No secret, password, session, email, cookies or test account is sent.
            fetch(origin + "/v1/environment?__clerk_api_version=2025-11-10")
            report["checks"]["providerConnectivity"] = {"reachable": True, "origin": origin,
                "authenticated": False, "note": "Public environment response is not proof of sign-in."}
        except Exception as error:
            # Do not print full HTTP bodies/headers or key material.
            reason = "NETWORK_PROXY_DENIED" if "Tunnel connection failed: 403 Forbidden" in str(error) else type(error).__name__
            report["checks"]["providerConnectivity"] = {"reachable": False, "reason": reason,
                                                       "authenticated": False}
    else:
        report["checks"]["providerConnectivity"] = {"reachable": None, "reason": "PUBLISHABLE_KEY_NOT_PROVIDED"}
    report["unverified"] = ["Real Android sign-up/sign-in/email verification/Google/password recovery",
                            "Cold-start secure persistence, refresh after token expiry, revocation and account switch",
                            "OAuth callbacks for all three package IDs and owned signing certificates",
                            "Real-device SDK lifecycle and logout, including offline/error behavior"]
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "backend/var/clerk-feasibility")
    args = parser.parse_args()
    report = run(os.environ.get("CLERK_PUBLISHABLE_KEY"))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "mobile-feasibility.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    # Static source review is deliberately insufficient to authorize auth removal.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
