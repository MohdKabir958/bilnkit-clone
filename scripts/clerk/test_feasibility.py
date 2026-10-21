"""Tests for probe safety/reporting. These do not mock or verify Clerk authentication."""
import base64
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mobile = load("mobile_feasibility")
android = load("run_android_probe")


def public_key(host):
    return "pk_test_" + base64.b64encode(host.encode()).decode().rstrip("=")


class ProbeSafetyTest(unittest.TestCase):
    def test_only_clerk_owned_development_hosts_are_contacted(self):
        key = public_key("grozo-example.clerk.accounts.dev$")
        self.assertEqual(mobile.frontend_origin(key), "https://grozo-example.clerk.accounts.dev")
        for host in ["127.0.0.1$", "evil.example$", "example.clerk.accounts.dev@evil.example$",
                     "x.clerk.accounts.dev:443$", "x.clerk.accounts.dev/path$", "x.clerk.accounts.dev?query$",
                     "x.clerk.accounts.dev\n$", "x.clerk.accounts.dev"]:
            with self.subTest(host=host), self.assertRaises(ValueError):
                mobile.frontend_origin(public_key(host))

    def test_non_public_and_live_keys_are_rejected(self):
        for key in ["", "not-a-key", "pk_live_example", "pk_test_%%%"]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                mobile.frontend_origin(key)

    def test_archive_checksum_mismatch_fails_before_extraction(self):
        with patch.object(mobile, "fetch", side_effect=[json.dumps({"archive_sha256": "wrong"}).encode(), b"untrusted"]):
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                mobile.archive_sources("clerk_flutter")

    def test_successful_public_connectivity_never_claims_login_or_clears_gate(self):
        with patch.object(mobile, "archive_sources", side_effect=ValueError("unavailable")), \
             patch.object(mobile, "fetch", return_value=b"{}"):
            report = mobile.run(public_key("grozo-example.clerk.accounts.dev$"))
        self.assertTrue(report["checks"]["providerConnectivity"]["reachable"])
        self.assertFalse(report["authenticationPerformed"])
        self.assertFalse(report["mobileGateCleared"])
        self.assertFalse(report["secretKeyUsed"])
        self.assertTrue(report["unverified"])

    def test_probe_errors_do_not_disclose_arbitrary_sdk_or_http_details(self):
        private_detail = "private-provider-diagnostic-that-must-not-be-logged"
        with patch.object(mobile, "archive_sources", side_effect=ValueError(private_detail)), \
             patch.object(mobile, "fetch", side_effect=RuntimeError(private_detail)):
            report = mobile.run(public_key("grozo-example.clerk.accounts.dev$"))
        self.assertNotIn(private_detail, json.dumps(report))
        self.assertFalse(report["checks"]["providerConnectivity"]["reachable"])

    def test_network_proxy_failure_is_distinguished_from_provider_auth_rejection(self):
        with patch.object(mobile, "archive_sources", side_effect=ValueError("unavailable")), \
             patch.object(mobile, "fetch", side_effect=OSError("Tunnel connection failed: 403 Forbidden")):
            report = mobile.run(public_key("grozo-example.clerk.accounts.dev$"))
        self.assertEqual(report["checks"]["providerConnectivity"]["reason"], "NETWORK_PROXY_DENIED")
        self.assertFalse(report["authenticationPerformed"])

    def test_native_probe_path_does_not_allow_groovy_interpolation(self):
        script = android.init_script(Path("/tmp/a'$danger\\b\nsource"))
        self.assertIn("srcDir('/tmp/a\\'$danger\\\\b\\nsource')", script)
        self.assertNotIn('srcDir("', script)
        self.assertIn("minSdk = 24", script)
        self.assertNotIn("writeText", script)


if __name__ == "__main__":
    unittest.main()
