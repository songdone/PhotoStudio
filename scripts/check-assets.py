#!/usr/bin/env python3
"""Validate approved PNGs and their exact staged fnOS copies; never rewrite art."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[1]


def png(path, size):
    data = path.read_bytes()
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError(f'{path}: not a PNG')
    offset = 8
    dimensions = None
    ended = False
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError(f'{path}: truncated PNG')
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        end = offset + 12 + length
        if end > len(data):
            raise ValueError(f'{path}: truncated PNG chunk')
        checksum = struct.unpack('>I', data[end - 4:end])[0]
        if zlib.crc32(kind + payload) & 0xffffffff != checksum:
            raise ValueError(f'{path}: invalid PNG checksum')
        if kind == b'IHDR':
            if offset != 8 or length != 13:
                raise ValueError(f'{path}: invalid PNG header')
            dimensions = struct.unpack('>II', payload[:8])
        if kind == b'IEND':
            ended = True
            if end != len(data):
                raise ValueError(f'{path}: unexpected data after PNG')
            break
        offset = end
    if dimensions != (size, size) or not ended:
        raise ValueError(f'{path}: expected complete {size}x{size} PNG; got {dimensions}')
    if len(data) > 1024 * 1024:
        raise ValueError(f'{path}: icon exceeds 1024 KiB')
    return {'path': str(path), 'width': size, 'height': size,
            'sha256': hashlib.sha256(data).hexdigest()}


def check(stage=None):
    sources = {size: ROOT / f'assets/brand/icon-{size}.png' for size in (256, 512)}
    results = [png(sources[size], size) for size in sources]
    if stage:
        stage = Path(stage)
        config = json.loads((stage / 'app/ui/config').read_text())
        entry = config['.url']['photostudio.Application']
        if entry['icon'] != 'images/icon_{0}.png':
            raise ValueError('UI icon reference must be images/icon_{0}.png')
        copies = [('ICON.PNG', 256), ('ICON_256.PNG', 256), ('ICON_512.PNG', 512),
                  ('app/ui/images/icon_256.png', 256), ('app/ui/images/icon_512.png', 512)]
        for name, size in copies:
            result = png(stage / name, size)
            if result['sha256'] != next(x['sha256'] for x in results if x['width'] == size):
                raise ValueError(f'{name}: differs from approved source icon')
            results.append(result)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', type=Path, help='also check staged icons and UI references')
    args = parser.parse_args()
    try:
        print(json.dumps({'ok': True, 'icons': check(args.stage)}, ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, struct.error) as exc:
        print(f'Asset check failed: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
