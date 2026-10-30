#!/usr/bin/env python3
"""Private file backup/isolated restore. Never extract links or overwrite a running upload tree."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tarfile


def digest(file):
    with open(file, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def backup(source, archive):
    source, archive = Path(source).absolute(), Path(archive).absolute()
    if source.is_symlink() or not source.is_dir():
        raise ValueError("Upload source must be an owned directory, not a symlink.")
    if archive == source or source in archive.parents:
        raise ValueError("Backup archive must be outside upload storage.")
    archive.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    inventory = []
    # Exclusive creation prevents accidentally replacing an existing backup.
    with open(archive, "xb") as output, tarfile.open(fileobj=output, mode="w:gz") as tar:
        for entry in sorted(source.rglob("*")):
            if entry.is_symlink() or not (entry.is_file() or entry.is_dir()):
                raise ValueError("Upload storage contains a link or non-regular file; review it before backup.")
            if entry.is_file():
                rel = entry.relative_to(source).as_posix()
                inventory.append({"path": rel, "bytes": entry.stat().st_size, "sha256": digest(entry)})
                tar.add(entry, arcname=rel, recursive=False)
    manifest = {"schema": 1, "archiveSha256": digest(archive), "files": inventory}
    with open(str(archive) + ".json", "x", encoding="utf8") as output:
        json.dump(manifest, output, indent=2)
    return {"action": "backup", "files": len(inventory), "bytes": sum(item["bytes"] for item in inventory), "archiveSha256": manifest["archiveSha256"]}


def restore(archive, destination):
    archive, destination = Path(archive).absolute(), Path(destination).absolute()
    if not destination.name.endswith("_restore_test") or destination.is_symlink():
        raise ValueError("Restore destination must be a NEW isolated directory ending in _restore_test.")
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise ValueError("Restore destination must be empty. No files were removed.")
    if any(parent.is_symlink() for parent in destination.parents):
        raise ValueError("Restore destination cannot contain symlink parents.")
    manifest = json.loads(Path(str(archive) + ".json").read_text())
    if manifest.get("schema") != 1 or manifest.get("archiveSha256") != digest(archive):
        raise ValueError("Upload archive checksum validation failed.")
    expected = {entry["path"]: entry for entry in manifest["files"]}
    if len(expected) != len(manifest["files"]):
        raise ValueError("Duplicate file paths in backup manifest.")
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        seen = set()
        for item in members:
            name = PurePosixPath(item.name)
            if not item.isfile() or name.is_absolute() or ".." in name.parts or "\\" in item.name or item.name not in expected or item.name in seen:
                raise ValueError("Unsafe or unexpected file in upload archive.")
            if item.size != expected[item.name]["bytes"] or item.size < 0:
                raise ValueError("Upload archive size does not match its manifest.")
            seen.add(item.name)
        if seen != expected.keys():
            raise ValueError("Upload archive does not match its manifest.")
        destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        for item in members:
            target = destination / item.name
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with tar.extractfile(item) as source, open(target, "xb") as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
            if digest(target) != expected[item.name]["sha256"]:
                raise ValueError("Restored file checksum does not match; isolated restore must be investigated.")
    return {"action": "restore", "files": len(expected), "checksumVerified": True}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["backup", "restore"])
    parser.add_argument("source", help="Upload directory for backup; archive.tar.gz for restore")
    parser.add_argument("destination", help="Archive.tar.gz for backup; NEW empty *_restore_test directory for restore")
    args = parser.parse_args()
    try:
        print(json.dumps(backup(args.source, args.destination) if args.action == "backup" else restore(args.source, args.destination)))
    except (ValueError, OSError, tarfile.TarError, KeyError, json.JSONDecodeError) as error:
        parser.exit(1, f"Recovery stopped: {error}\n")


if __name__ == "__main__":
    main()
