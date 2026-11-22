#!/usr/bin/env python3
"""Bundle the corresponding application source without build caches or credentials."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'web/public/source/photo-studio-1.0.0-source.zip'
TOP = 'photo-studio-1.0.0-source'
PUBLIC_DOCS = ('architecture.md', 'collaboration.md', 'color-management.md',
               'image-assets.md', 'psd-compatibility.md', 'scripting.md', 'third-party.md')
PUBLIC_SCRIPTS = ('build.py', 'build.sh', 'bundle-source.py', 'check-assets.py',
                  'check-assets.sh', 'package.py', 'package.sh')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='new source archive path; an existing file is not replaced')
    args = parser.parse_args()
    target = args.output or TARGET
    if target.is_symlink():
        parser.error('source archive must not be a symlink')
    files = set()
    for directory in ('server', 'packaging', 'assets/brand', 'web/src', 'web/wasm', 'web/scripts', 'web/tests', 'web/public'):
        for source in (ROOT / directory).rglob('*'):
            relative = source.relative_to(ROOT)
            if source.is_symlink() or not source.is_file():
                continue
            if any(part.startswith('.') or part in ('__pycache__', 'target', 'node_modules', 'test-results', 'playwright-report') for part in relative.parts):
                continue
            if relative.as_posix() == 'server/server':
                continue
            if relative.parts[:3] == ('web', 'public', 'source'):
                continue
            files.add(source)
    for filename in PUBLIC_SCRIPTS:
        files.add(ROOT / 'scripts' / filename)
    for filename in PUBLIC_DOCS:
        files.add(ROOT / 'web/docs' / filename)
    for filename in ('.gitignore', 'README.md', 'LICENSE', 'UPSTREAM-ROOT-LICENSE', 'web/package.json', 'web/package-lock.json', 'web/index.html', 'web/callback.html', 'web/README.md', 'web/LICENSE', 'web/tsconfig.json', 'web/vite.config.ts', 'web/vite.worker.config.ts', 'web/vitest.config.ts', 'web/playwright.config.ts', 'web/playwright.production.config.ts', 'web/playwright.fnos.config.ts', 'web/rust-toolchain.toml'):
        source = ROOT / filename
        if source.is_file():
            files.add(source)
    # The added hash fallback's MIT license and sources travel with the candidate.
    noble = ROOT / 'web/node_modules/@noble/hashes'
    extras = [p for p in noble.rglob('*') if p.is_file() and not p.is_symlink()]
    # Preserve the SDK's original notice without guessing a copyright holder.
    trim_notice = ROOT / 'web/node_modules/@trimjs/web-app/README.md'
    trim_readme = trim_notice.read_bytes()
    if b'## License\n\nMIT' not in trim_readme:
        raise ValueError('The pinned fnOS SDK license statement is missing; check its published README')
    target.parent.mkdir(parents=True, exist_ok=True)
    manifest = []
    mode = 'x' if args.output else 'w'
    with zipfile.ZipFile(target, mode, compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for source in sorted(files):
            relative = source.relative_to(ROOT).as_posix()
            data = source.read_bytes()
            output.writestr(f'{TOP}/{relative}', data)
            manifest.append({'path': relative, 'sha256': hashlib.sha256(data).hexdigest()})
        for source in sorted(extras):
            relative = 'third-party/noble-hashes/' + source.relative_to(noble).as_posix()
            data = source.read_bytes()
            output.writestr(f'{TOP}/{relative}', data)
            manifest.append({'path': relative, 'sha256': hashlib.sha256(data).hexdigest()})
        trim_notice_path = 'third-party/trimjs-web-app/README.md'
        output.writestr(f'{TOP}/{trim_notice_path}', trim_readme)
        manifest.append({'path': trim_notice_path, 'sha256': hashlib.sha256(trim_readme).hexdigest()})
        output.writestr(f'{TOP}/SOURCE-MANIFEST.json', json.dumps({'upstream': 'https://github.com/HeyPuter/everything', 'commit': '175354f3ec5054ed05b7572cf46a51dac2693d40', 'files': manifest}, ensure_ascii=False, indent=2))
    print(f'Corresponding source: {target.name} ({len(files)} project files)')


if __name__ == '__main__':
    main()
