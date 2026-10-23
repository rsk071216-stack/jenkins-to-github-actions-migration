"""Print a deterministic manifest of a filesystem tarball read from stdin.

One line per entry: <type> <path> <mode> <uid>:<gid> <size> <sha256-or-link-target>
Timestamps are deliberately excluded: they are not part of "what the image contains".
Used by compare-images.sh with `docker export <container> | python3 fs-manifest.py`.
"""

import hashlib
import sys
import tarfile

# Created by `docker create` itself, not by the image build.
RUNTIME_ENTRIES = {".dockerenv", "etc/hostname", "etc/hosts", "etc/resolv.conf", "proc", "sys", "dev"}


def main() -> int:
    rows = []
    with tarfile.open(fileobj=sys.stdin.buffer, mode="r|*") as archive:
        for member in archive:
            name = member.name
            path = name[2:] if name.startswith("./") else name.lstrip("/")
            top = path.split("/", 1)[0]
            if path in RUNTIME_ENTRIES or top in {"proc", "sys", "dev"}:
                continue
            if member.isfile():
                digest = hashlib.sha256()
                handle = archive.extractfile(member)
                for chunk in iter(lambda: handle.read(1 << 16), b""):
                    digest.update(chunk)
                kind, detail = "f", digest.hexdigest()
            elif member.issym():
                kind, detail = "l", member.linkname
            elif member.islnk():
                kind, detail = "h", member.linkname
            elif member.isdir():
                kind, detail = "d", "-"
            else:
                kind, detail = "o", "-"
            rows.append(f"{kind} {path} {member.mode:o} {member.uid}:{member.gid} {member.size} {detail}")
    sys.stdout.write("\n".join(sorted(rows)) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
