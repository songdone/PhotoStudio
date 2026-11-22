#!/usr/bin/env python3
"""Build isolated Photo Studio linux/amd64 + linux/arm64 fnOS candidates locally."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.0.0'


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else hashlib.sha256(stream.read()).hexdigest()


def run(command, cwd, log, env=None):
    log.write('$ ' + ' '.join(str(x) for x in command) + '\n')
    log.flush()
    subprocess.run([str(x) for x in command], cwd=str(cwd), env=env,
                   stdout=log, stderr=subprocess.STDOUT, check=True)


def web_files(dist):
    if not (dist / 'index.html').is_file():
        raise ValueError('web/dist/index.html is missing; run the frontend build first')
    result = []
    for entry in sorted(dist.rglob('*')):
        relative = entry.relative_to(dist)
        if entry.is_symlink():
            raise ValueError(f'Frontend symlink is not allowed: {relative}')
        if any(part.startswith('.') for part in relative.parts):
            continue
        if entry.is_file():
            result.append({'path': relative.as_posix(), 'bytes': entry.stat().st_size,
                           'sha256': sha256(entry)})
        elif not entry.is_dir():
            raise ValueError(f'Frontend special file is not allowed: {relative}')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-id', default=os.environ.get('BUILD_ID'), help='new unique build directory name')
    parser.add_argument('--arch', choices=['all', 'amd64', 'arm64'], default='all')
    parser.add_argument('--skip-web', action='store_true', default=os.environ.get('SKIP_WEB') == '1',
                        help='reuse existing web/dist and record its complete hashes (SKIP_WEB=1)')
    parser.add_argument('--stage-only', action='store_true', help='compile and stage without invoking fnpack')
    parser.add_argument('--fnpack', default=os.environ.get('FNPACK'), help='explicit official local fnpack executable')
    parser.add_argument('--nosign', action='store_true', help='explicit unsigned local-debug FPK (not a signed release)')
    args = parser.parse_args()
    build_id = args.build_id or datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,95}', build_id) or '..' in build_id:
        parser.error('build ID must be a simple unique name without slashes or ..')
    build_root = ROOT / '开发存档' / build_id
    build_root.mkdir(parents=True, exist_ok=False)
    for name in ('stage', 'packages', 'bin', 'cache/go-build', 'cache/go-mod', 'tmp'):
        (build_root / name).mkdir(parents=True)
    record = {
        'app': 'photostudio', 'version': VERSION, 'buildId': build_id,
        'maintainer': 'HeyPuter', 'distributor': '6uos',
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'skipWeb': args.skip_web, 'webBuild': 'reused existing web/dist' if args.skip_web else 'npm run build',
        'architectures': ['amd64', 'arm64'] if args.arch == 'all' else [args.arch],
        'status': 'building', 'stages': {},
        'deviceValidation': 'not performed; no NAS, SSH or deployment operations',
    }
    record_path = build_root / 'build-record.json'
    def save():
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    save()
    print(f'Build directory: {build_root}', flush=True)
    try:
        env = os.environ.copy()
        env.update({'CGO_ENABLED': '0', 'GOTOOLCHAIN': 'local', 'GOPROXY': 'off',
                    'GOSUMDB': 'off', 'GOWORK': 'off',
                    'GOCACHE': str(build_root / 'cache/go-build'),
                    'GOMODCACHE': str(build_root / 'cache/go-mod'),
                    'GOTMPDIR': str(build_root / 'tmp')})
        with (build_root / 'package-build.log').open('x', buffering=1) as log:
            record['goVersion'] = subprocess.check_output(['go', 'version'], text=True, env=env).strip()
            save()
            run([sys.executable, '-I', '-B', ROOT / 'scripts/check-assets.py'], ROOT, log)
            if not args.skip_web:
                # Never installs packages; the caller supplies locally installed frontend dependencies.
                run(['npm', 'run', 'build'], ROOT / 'web', log)
            dist = ROOT / 'web/dist'
            frontend = web_files(dist)
            record['frontend'] = {'files': len(frontend), 'bytes': sum(x['bytes'] for x in frontend),
                                  'treeSHA256': hashlib.sha256(json.dumps(frontend, sort_keys=True).encode()).hexdigest()}
            (build_root / 'frontend-files.json').write_text(json.dumps(frontend, indent=2) + '\n')
            run(['go', 'test', './...'], ROOT / 'server', log, env)
            run(['go', 'vet', './...'], ROOT / 'server', log, env)
            for arch in record['architectures']:
                platform = {'amd64': 'x86', 'arm64': 'arm'}[arch]
                stage = build_root / 'stage' / f'linux-{arch}'
                shutil.copytree(ROOT / 'packaging/fnos', stage)
                (stage / 'wizard').mkdir(exist_ok=True)
                (stage / 'app/server').mkdir(parents=True, exist_ok=True)
                (stage / 'app/web/dist').mkdir(parents=True, exist_ok=True)
                (stage / 'app/ui/images').mkdir(parents=True, exist_ok=True)
                manifest = (stage / 'manifest').read_text()
                if manifest.count('@PLATFORM@') != 1:
                    raise ValueError('manifest must contain one @PLATFORM@ placeholder')
                (stage / 'manifest').write_text(manifest.replace('@PLATFORM@', platform))
                for item in frontend:
                    target = stage / 'app/web/dist' / item['path']
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(dist / item['path'], target)
                    if sha256(target) != item['sha256']:
                        raise ValueError(f'Frontend changed during build: {item["path"]}; use a new build ID')
                for filename, size in [('ICON.PNG', 256), ('ICON_256.PNG', 256), ('ICON_512.PNG', 512),
                                       ('app/ui/images/icon_256.png', 256), ('app/ui/images/icon_512.png', 512)]:
                    shutil.copy2(ROOT / f'assets/brand/icon-{size}.png', stage / filename)
                licenses = stage / 'app/licenses'
                licenses.mkdir(exist_ok=True)
                for filename in ('LICENSE', 'UPSTREAM-ROOT-LICENSE'):
                    shutil.copy2(ROOT / filename, licenses / filename)
                binary = stage / 'app/server/photostudio'
                target_env = env.copy()
                target_env.update({'GOOS': 'linux', 'GOARCH': arch})
                if arch == 'amd64':
                    target_env['GOAMD64'] = 'v1'
                else:
                    target_env['GOARM64'] = 'v8.0'
                run(['go', 'build', '-trimpath', '-buildvcs=false',
                     '-ldflags', f'-s -w -buildid= -X main.buildID={build_id}',
                     '-o', binary, '.'], ROOT / 'server', log, target_env)
                binary.chmod(0o755)
                for script in (stage / 'cmd').iterdir():
                    if script.is_file():
                        script.chmod(0o755)
                for directory in [stage] + [p for p in stage.rglob('*') if p.is_dir()]:
                    directory.chmod(0o755)
                run([sys.executable, '-I', '-B', ROOT / 'scripts/check-assets.py', '--stage', stage], ROOT, log)
                shutil.copy2(binary, build_root / 'bin' / f'photostudio-linux-{arch}')
                record['stages'][arch] = {'path': str(stage), 'platform': platform,
                                          'binarySHA256': sha256(binary)}
                save()
                print(f'Staged linux/{arch}: {stage}', flush=True)
            record['status'] = 'staged'
            save()
        if not args.stage_only:
            command = [sys.executable, '-I', '-B', str(ROOT / 'scripts/package.py'), '--build-dir', str(build_root)]
            if args.fnpack:
                command += ['--fnpack', args.fnpack]
            if args.nosign:
                command.append('--nosign')
            subprocess.run(command, cwd=str(ROOT), check=True)
            record['status'] = 'packaged'
            save()
        print(f'Completed: {build_root}', flush=True)
        return 0
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        record['status'] = 'failed'
        record['error'] = str(exc)
        save()
        print(f'Build failed: {exc}\nEvidence: {build_root}/package-build.log', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
