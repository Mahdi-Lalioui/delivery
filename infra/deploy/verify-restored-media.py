from hashlib import sha256
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import tarfile


def relative_path(name):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ValueError("Unsafe media archive member.")
    return path


def restore_archive(source, root):
    root.mkdir()
    with tarfile.open(fileobj=source, mode="r|") as archive:
        for member in archive:
            path = root / relative_path(member.name)
            if member.isdir():
                path.mkdir(parents=True, exist_ok=True)
            elif member.islnk() and path != root:
                target = root / relative_path(member.linkname)
                if not target.is_file():
                    raise ValueError("Unsafe media archive member.")
                path.parent.mkdir(parents=True, exist_ok=True)
                os.link(target, path)
            elif member.isreg() and path != root:
                path.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as content, path.open("xb") as output:
                    shutil.copyfileobj(content, output)
            else:
                raise ValueError("Unsafe media archive member.")
    # Drain any tar padding so age can authenticate the complete ciphertext.
    while source.read(1024 * 1024):
        pass


def verify_references(root, manifest):
    files = set()
    invalid = set()
    with manifest.open(encoding="utf-8") as references:
        for row in references:
            record = json.loads(row)
            key, length = record["key"], record["bytes"]
            if not isinstance(key, str) or not key:
                raise ValueError("Invalid media reference in the recovered database.")
            # The local media store maps logical keys to flat SHA-256 filenames.
            path = root / sha256(key.encode("utf-8")).hexdigest()
            files.add(key)
            size = path.stat().st_size if path.is_file() else 0
            if size == 0 or (length is not None and size != length):
                invalid.add(key)
    if invalid:
        raise ValueError(f"{len(invalid)} missing or invalid media files.")
    return len(files)


if __name__ == "__main__":
    media, manifest = (Path(argument) for argument in sys.argv[1:])
    try:
        restore_archive(sys.stdin.buffer, media)
        print(verify_references(media, manifest))
    except ValueError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    except (OSError, tarfile.TarError):
        print("Could not restore the media archive into temporary storage.", file=sys.stderr)
        sys.exit(1)
