#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("upload_recovery", Path(__file__).resolve().parents[1] / "upload_recovery.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class UploadRecoveryTest(unittest.TestCase):
    def test_round_trip_preserves_public_and_private_bytes(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source = root / "uploads"
            (source / "private" / "evidence").mkdir(parents=True)
            (source / "product.webp").write_bytes(b"synthetic product fixture")
            (source / "private" / "evidence" / "owned.png").write_bytes(b"synthetic private evidence fixture")
            archive = root / "backup.tar.gz"
            self.assertEqual(tool.backup(source, archive)["files"], 2)
            destination = root / "uploads_restore_test"
            self.assertEqual(tool.restore(archive, destination), {"action": "restore", "files": 2, "checksumVerified": True})
            self.assertEqual((source / "private/evidence/owned.png").read_bytes(), (destination / "private/evidence/owned.png").read_bytes())
            with self.assertRaisesRegex(ValueError, "empty"):
                tool.restore(archive, destination)
            with self.assertRaisesRegex(ValueError, "isolated"):
                tool.restore(archive, root / "live_uploads")

    def test_links_and_corrupt_archives_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source = root / "uploads"
            source.mkdir()
            (source / "linked").symlink_to(root)
            with self.assertRaisesRegex(ValueError, "link"):
                tool.backup(source, root / "rejected.tar.gz")
            (source / "linked").unlink()
            (source / "image.webp").write_bytes(b"fixture")
            archive = root / "backup.tar.gz"
            tool.backup(source, archive)
            archive.write_bytes(b"corrupted archive")
            with self.assertRaisesRegex(ValueError, "checksum"):
                tool.restore(archive, root / "uploads_restore_test")


if __name__ == "__main__":
    unittest.main()
