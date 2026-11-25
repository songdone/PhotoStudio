#!/usr/bin/env python3
"""Package already-staged Photo Studio builds using an official local fnpack."""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import struct
import subprocess
import sys
import tarfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
MAX_FILE = 128 * 1024 * 1024
GATEWAY_PREFIX = '/app/photostudio'
FILE_TYPES = ('psd', 'psb', 'photo', 'png', 'jpg', 'jpeg', 'webp', 'avif',
              'gif', 'bmp', 'dib', 'tif', 'tiff', 'svg', 'ico', 'cur', 'tga',
              'pnm', 'ppm', 'pgm', 'pbm', 'pam')
API_SCOPES = ('trim.file.userAccess', 'trim.file.userAcl')
LIFECYCLE_HOOKS = ('main', 'install_init', 'install_callback', 'upgrade_init',
                   'upgrade_callback', 'uninstall_init', 'uninstall_callback',
                   'config_init', 'config_callback')


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def find_tool(explicit):
    # Order: --fnpack, FNPACK, this project's tools, then system PATH.
    candidate = None
    if explicit:
        candidate = shutil.which(explicit) or explicit
    else:
        import platform
        system = platform.system().lower()
        machine = {'aarch64': 'arm64', 'x86_64': 'amd64'}.get(platform.machine(), platform.machine())
        names = ('fnpack', f'fnpack-{system}-{machine}', f'fnpack-1.3.3-{system}-{machine}',
                 f'fnpack-1.3.3-{system}-{machine}-download/fnpack')
        for name in names:
            local = ROOT / 'tools' / name
            if local.is_file() and os.access(local, os.X_OK):
                candidate = str(local)
                break
        if not candidate:
            candidate = shutil.which('fnpack')
    if not candidate or not Path(candidate).is_file() or not os.access(candidate, os.X_OK):
        raise ValueError('Official fnpack not found. Set --fnpack or FNPACK, place it in this project/tools, '
                         'or add it to PATH; stages are preserved. '
                         'Tool documentation: https://developer.fnnas.com/docs/cli/fnpack/')
    return Path(candidate).resolve()


def manifest_values(text):
    result = {}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, sep, value = line.partition('=')
        key, value = key.strip(), value.strip()
        if not sep or not key or key in result:
            raise ValueError('Invalid or duplicate manifest field')
        result[key] = value
    return result


def check_manifest(text, arch):
    values = manifest_values(text)
    expected = {'appname': 'photostudio', 'version': '1.0.0', 'display_name': 'Photo Studio',
                'maintainer': 'HeyPuter', 'distributor': '6uos',
                'maintainer_url': 'https://github.com/HeyPuter',
                'distributor_url': 'https://github.com/songdone/PhotoStudio',
                'platform': {'amd64': 'x86', 'arm64': 'arm'}[arch],
                'source': 'thirdparty', 'desktop_uidir': 'ui',
                'desktop_applaunchname': 'photostudio.Application',
                'ctl_stop': 'true', 'micro_app': 'true',
                'disable_authorization_path': 'false'}
    for key, value in expected.items():
        if values.get(key) != value:
            raise ValueError(f'Manifest {key} must be {value!r}')
    for key in ('desc', 'os_min_version', 'changelog'):
        if not values.get(key):
            raise ValueError(f'Missing manifest field: {key}')
    if 'service_port' in values or values.get('checkport', 'false') != 'false':
        raise ValueError('Unix gateway manifest must not declare a service port or enable checkport')
    if '@PLATFORM@' in text:
        raise ValueError('Unresolved manifest placeholder')
    return values


def check_elf(data, arch):
    if data[:6] != b'\x7fELF\x02\x01':
        raise ValueError('Expected a little-endian ELF64 executable')
    machine = struct.unpack_from('<H', data, 18)[0]
    if machine != {'amd64': 62, 'arm64': 183}[arch]:
        raise ValueError('ELF architecture does not match manifest')
    phoff = struct.unpack_from('<Q', data, 32)[0]
    phsize, phnum = struct.unpack_from('<HH', data, 54)
    if phsize < 56 or phoff + phsize * phnum > len(data):
        raise ValueError('Invalid ELF program header table')
    for i in range(phnum):
        kind = struct.unpack_from('<I', data, phoff + phsize * i)[0]
        if kind in (2, 3):  # PT_DYNAMIC, PT_INTERP
            raise ValueError('Executable must be static and CGO-free')
    return {'architecture': arch, 'static': True, 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}


def archive_files(archive):
    files = {}
    for member in archive.getmembers():
        name = member.name
        while name.startswith('./'):
            name = name[2:]
        if not name:
            continue
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name:
            raise ValueError(f'Unsafe archive path: {name}')
        normalized = path.as_posix()
        if member.isdir():
            continue
        if not member.isfile() or normalized in files or member.size > MAX_FILE:
            raise ValueError(f'Unsafe or duplicate archive member: {name}')
        files[normalized] = member
    return files


def member_bytes(archive, files, name):
    if name not in files:
        raise ValueError(f'Package is missing {name}')
    stream = archive.extractfile(files[name])
    if stream is None:
        raise ValueError(f'Cannot read package member: {name}')
    return stream.read(MAX_FILE + 1)


def check_stage(stage, arch):
    check_manifest((stage / 'manifest').read_text(), arch)
    privilege = json.loads((stage / 'config/privilege').read_text())
    if privilege != {'defaults': {'run-as': 'package'}, 'username': 'photostudio', 'groupname': 'photostudio'}:
        raise ValueError('Privilege declaration must use only the Photo Studio package user')
    resource = json.loads((stage / 'config/resource').read_text())
    if resource != {'api-scope': list(API_SCOPES)}:
        raise ValueError('Resources must declare only trim.file.userAccess and trim.file.userAcl')
    ui = json.loads((stage / 'app/ui/config').read_text())
    entries = ui.get('.url') if isinstance(ui, dict) else None
    if not isinstance(entries, dict) or set(entries) != {'photostudio.Application'}:
        raise ValueError('UI must declare the Photo Studio application entry')
    entry = entries['photostudio.Application']
    if not isinstance(entry, dict):
        raise ValueError('Photo Studio UI entry must be an object')
    expected_entry = {'title': 'Photo Studio', 'type': 'iframe', 'gatewayPrefix': GATEWAY_PREFIX,
                      'gatewaySocket': 'photostudio.sock', 'url': GATEWAY_PREFIX + '/',
                      'fileTypes': list(FILE_TYPES), 'icon': 'images/icon_{0}.png'}
    for key, value in expected_entry.items():
        if entry.get(key) != value:
            raise ValueError(f'Desktop entry {key} must be {value!r}')
    if entry.get('allUsers') is not True or 'port' in entry or 'protocol' in entry:
        raise ValueError('Desktop entry must use the all-users Unix gateway without a direct port')
    wizard = json.loads((stage / 'wizard/install').read_text())
    items = [item for step in wizard for item in step.get('items', [])] if isinstance(wizard, list) else []
    if not any(item.get('type') == 'tips' for item in items) or not any(
            item.get('field') == 'wizard_psd_notice' and any(r.get('required') for r in item.get('rules', []))
            for item in items):
        raise ValueError('Install wizard must show the PSD notice and require its confirmation')
    binary = stage / 'app/server/photostudio'
    if not os.access(binary, os.X_OK):
        raise ValueError('Server must be executable')
    for name in LIFECYCLE_HOOKS:
        hook = stage / 'cmd' / name
        if not hook.is_file() or not os.access(hook, os.X_OK):
            raise ValueError(f'Lifecycle hook must exist and be executable: cmd/{name}')
        if hook.read_bytes() != (ROOT / 'packaging/fnos/cmd' / name).read_bytes():
            raise ValueError(f'Staged lifecycle hook differs from the current template: cmd/{name}')
    # Keep the approved PNG content/dimensions gate available to read-only callers
    # of check_stage, not only to the packaging CLI.
    import runpy
    assets = runpy.run_path(str(ROOT / 'scripts/check-assets.py'))
    assets['check'](stage)
    return check_elf(binary.read_bytes(), arch)


def check_package(package, stage, arch):
    # Inspect only: never extract/execute package code or rewrite a signed archive.
    with tarfile.open(package, 'r:*') as outer:
        files = archive_files(outer)
        packaged_manifest = check_manifest(member_bytes(outer, files, 'manifest').decode(), arch)
        staged_manifest = manifest_values((stage / 'manifest').read_text())
        if {key: value for key, value in packaged_manifest.items() if key != 'checksum'} != staged_manifest:
            raise ValueError('Packaged manifest changed a staged field')
        staged_hooks = {source.relative_to(stage).as_posix()
                        for source in (stage / 'cmd').rglob('*') if source.is_file()}
        if {name for name in files if name.startswith('cmd/')} != staged_hooks:
            raise ValueError('Packaged lifecycle hooks differ from the staged hook set')
        staged_wizard = {source.relative_to(stage).as_posix()
                         for source in (stage / 'wizard').rglob('*') if source.is_file()}
        if 'wizard/install' not in staged_wizard:
            raise ValueError('Install wizard (PSD compatibility notice) is missing from the stage')
        if {name for name in files if name.startswith('wizard/')} != staged_wizard:
            raise ValueError('Packaged wizard files differ from the staged wizard set')
        for name in ('ICON.PNG', 'ICON_256.PNG', 'ICON_512.PNG',
                     'config/privilege', 'config/resource', *sorted(staged_hooks), *sorted(staged_wizard)):
            if member_bytes(outer, files, name) != (stage / name).read_bytes():
                raise ValueError(f'Packaged {name} differs from its staged source')
            if name in staged_hooks and files[name].mode & 0o111 == 0:
                raise ValueError(f'Packaged lifecycle hook is not executable: {name}')
        payload_name = next((name for name in ('app.tgz', 'app.tar.gz', 'app.tar') if name in files), None)
        if payload_name is None:
            raise ValueError('Official FPK app archive not found; inspect tool output before changing checker')
        payload = member_bytes(outer, files, payload_name)
        with tarfile.open(fileobj=io.BytesIO(payload), mode='r:*') as inner:
            inner_files = archive_files(inner)
            prefix = 'app/' if 'app/server/photostudio' in inner_files else ''
            binary_name = prefix + 'server/photostudio'
            binary = member_bytes(inner, inner_files, binary_name)
            elf = check_elf(binary, arch)
            if binary != (stage / 'app/server/photostudio').read_bytes():
                raise ValueError('Packaged server does not match staged server')
            for source in (stage / 'app').rglob('*'):
                if source.is_file():
                    relative = source.relative_to(stage / 'app').as_posix()
                    actual = member_bytes(inner, inner_files, prefix + relative)
                    if hashlib.sha256(actual).hexdigest() != sha256(source):
                        raise ValueError(f'Packaged payload differs: {relative}')
            if inner_files[binary_name].mode & 0o111 == 0:
                raise ValueError('Packaged executable mode was lost')
    return {'file': str(package), 'sha256': sha256(package), 'elf': elf,
            'icons': 'approved 256/512 copies and real UI references verified',
            'manifest': 'verified', 'payload': 'byte-for-byte verified against stage',
            'lifecycle': 'all staged hooks byte-for-byte verified and executable'}


def ensure_unsigned_detail_icon(package, stage, allowed):
    """Keep raw fnpack output; only supplement an explicitly unsigned QA copy."""
    raw_hash = sha256(package)
    with tarfile.open(package, 'r:*') as archive:
        files = archive_files(archive)
        if 'ICON_512.PNG' in files:
            return package, {'rawSHA256': raw_hash, 'detailIconSupplemented': False}
        if not allowed:
            raise ValueError('fnpack omitted ICON_512.PNG; signed packages cannot be rewritten. '
                             'For a local unsigned candidate use --nosign; release signing remains a separate gate.')
        # Fail closed if this tool emits anything except the known unsigned shape.
        known = {'manifest', 'ICON.PNG', 'ICON_256.PNG', 'app.tgz'}
        known.update(p.relative_to(stage).as_posix() for p in (stage / 'cmd').rglob('*') if p.is_file())
        known.update(p.relative_to(stage).as_posix() for p in (stage / 'config').iterdir() if p.is_file())
        known.update(p.relative_to(stage).as_posix() for p in (stage / 'wizard').rglob('*') if p.is_file())
        if set(files) != known:
            raise ValueError('Unknown or signed FPK shape; refusing to supplement unsigned detail icon')
        candidate = package.with_name(package.stem + '-unsigned-local.fpk')
        with candidate.open('xb') as stream:
            with tarfile.open(fileobj=stream, mode='w:gz', format=tarfile.PAX_FORMAT) as output:
                for member in archive.getmembers():
                    source = archive.extractfile(member) if member.isfile() else None
                    output.addfile(member, source)
                icon = (stage / 'ICON_512.PNG').read_bytes()
                member = tarfile.TarInfo('ICON_512.PNG')
                member.size = len(icon)
                member.mode = 0o644
                output.addfile(member, io.BytesIO(icon))
    return candidate, {'rawFnpackFile': str(package), 'rawSHA256': raw_hash,
                       'detailIconSupplemented': True, 'signing': 'unsigned local debug only'}


def prepare_delivery(report, attempt):
    delivery = ROOT / 'dist'
    if delivery.is_symlink():
        previous = delivery.resolve()
        archives = ((ROOT / '开发存档').resolve(), (ROOT / 'build').resolve())
        if not any(previous.is_relative_to(archive) for archive in archives) or previous.name != 'delivery':
            raise ValueError('dist does not point to a previous package delivery')
    elif delivery.exists():
        raise ValueError('dist already exists; refusing to replace unrelated files')

    output = attempt / 'delivery'
    output.mkdir(exist_ok=False)
    packages = []
    for package in report['packages']:
        source = Path(package['file'])
        arch = package['elf']['architecture']
        if arch not in ('amd64', 'arm64'):
            raise ValueError('Unknown delivery architecture')
        with tarfile.open(source, 'r:*') as archive:
            files = archive_files(archive)
            manifest = check_manifest(member_bytes(archive, files, 'manifest').decode(), arch)
        filename = f'photostudio-{manifest["version"]}-{arch}.fpk'
        target = output / filename
        with source.open('rb') as reader, target.open('xb') as writer:
            shutil.copyfileobj(reader, writer)
        if sha256(target) != package['sha256']:
            raise ValueError(f'Delivery checksum mismatch: {filename}')
        packages.append({'file': str(delivery / filename), 'sha256': package['sha256'],
                         'architecture': arch})
    if not packages:
        raise ValueError('No verified packages to deliver')
    (output / 'SHA256SUMS').write_text(''.join(
        f'{p["sha256"]}  {Path(p["file"]).name}\n' for p in packages))
    pointer = ROOT / ('.dist-' + uuid.uuid4().hex[:8])
    try:
        pointer.symlink_to(output.relative_to(ROOT), target_is_directory=True)
        os.replace(pointer, delivery)
    finally:
        pointer.unlink(missing_ok=True)
    report['delivery'] = {'directory': str(delivery), 'packages': packages}
    for package in packages:
        print(f'Installer: {package["file"]}\nSHA-256: {package["sha256"]}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-dir', required=True, type=Path, help='isolated build directory created by build.sh')
    parser.add_argument('--fnpack', default=os.environ.get('FNPACK'), help='official local fnpack executable')
    parser.add_argument('--nosign', action='store_true', help='explicit unsigned local candidate (fnpack 1.3.3+)')
    args = parser.parse_args()
    build = args.build_dir.resolve()
    archive_roots = ((ROOT / '开发存档').resolve(), (ROOT / 'build').resolve())
    if build.parent not in archive_roots and build.parent.parent not in archive_roots:
        parser.error('build directory must be isolated inside this project archive')
    record = json.loads((build / 'build-record.json').read_text())
    attempt = build / 'packages' / ('attempt-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6])
    attempt.mkdir(parents=True, exist_ok=False)
    report = {'ok': False, 'buildId': record['buildId'], 'packages': [],
              'deviceValidation': 'not performed', 'attempt': str(attempt)}
    try:
        tool = find_tool(args.fnpack)
        report['fnpack'] = {'path': str(tool), 'sha256': sha256(tool)}
        provenance = tool.parent / 'provenance.json'
        if provenance.is_file():
            saved = json.loads(provenance.read_text())
            if saved.get('sha256') != report['fnpack']['sha256']:
                raise ValueError('fnpack does not match its recorded download provenance')
            report['fnpack']['downloadProvenance'] = saved
        report['signing'] = 'unsigned-local-debug' if args.nosign else 'official-default-signing'
        with (attempt / 'package-build.log').open('x', buffering=1) as log:
            help_result = subprocess.run([str(tool), '--help'], cwd=str(attempt), text=True,
                                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True)
            log.write(help_result.stdout)
            report['fnpack']['identity'] = help_result.stdout.strip()
            for arch in record['architectures']:
                stage = build / 'stage' / ('linux-' + arch)
                check_stage(stage, arch)
                log.write(f'Stage {arch}: gateway, fileTypes, scopes, hooks, approved icons and ELF verified\n')
                output = attempt / ('linux-' + arch)
                output.mkdir(exist_ok=False)
                command = [str(tool), 'build', '--directory', str(stage)]
                if args.nosign:
                    command.append('--nosign')
                result = subprocess.run(command, cwd=str(output), text=True,
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                log.write(result.stdout)
                log.flush()
                if result.returncode != 0 or 'packing failed' in result.stdout.lower():
                    raise ValueError(f'fnpack build failed ({result.returncode}): {result.stdout.strip()}')
                packages = list(output.glob('*.fpk'))
                if len(packages) != 1:
                    raise ValueError('fnpack did not create exactly one FPK: ' + result.stdout.strip())
                package = packages[0]
                destination = output / f'photostudio-1.0.0-{arch}-{record["buildId"]}.fpk'
                package.rename(destination)
                final, supplement = ensure_unsigned_detail_icon(destination, stage, args.nosign)
                verified = check_package(final, stage, arch)
                verified['fnpackOutput'] = supplement
                report['packages'].append(verified)
                print(f'Package verified: {final}', flush=True)
        (attempt / 'SHA256SUMS').write_text(''.join(f'{p["sha256"]}  {Path(p["file"]).relative_to(attempt)}\n' for p in report['packages']))
        prepare_delivery(report, attempt)
        report['ok'] = True
        print(f'Package evidence: {attempt}', flush=True)
        return 0
    except (OSError, ValueError, KeyError, tarfile.TarError, subprocess.CalledProcessError) as exc:
        report['error'] = str(exc)
        print(f'Packaging blocked: {exc}\nEvidence: {attempt}', file=sys.stderr)
        return 1
    finally:
        (attempt / 'static-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    sys.exit(main())
