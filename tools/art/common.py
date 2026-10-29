"""Shared helpers for the art pipeline: paths, hashing and the asset manifest."""
import hashlib, json, os, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public' / 'assets'
MANIFEST = ASSETS / 'manifest.json'
RAW = ROOT / '.artifacts' / 'art-gen'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding='utf-8'))
    return {'note': 'Private build only. Every file lists its source and licence; see docs/制作流程/素材管线.md.', 'files': {}}


def save_manifest(m: dict) -> None:
    m['files'] = dict(sorted(m['files'].items()))
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def record(m: dict, path: Path, **source) -> None:
    data = path.read_bytes()
    m['files'][path.relative_to(ASSETS).as_posix()] = {'bytes': len(data), 'sha256': sha256(data), **source}


def openai_key() -> str:
    """OPENAI_API_KEY from the main checkout's ignored .env only. Never printed.

    The user designated this .env for the project (2026-10-30). A system-wide OPENAI_API_KEY is deliberately
    ignored: one exists on the development machine and belongs to something else.
    """
    common = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], cwd=ROOT,
                            capture_output=True, text=True, check=True).stdout.strip()
    env = Path(common).parent / '.env'
    for line in env.read_text(encoding='utf-8').splitlines():
        if line.startswith('OPENAI_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise SystemExit('OPENAI_API_KEY not found in the main checkout .env')
