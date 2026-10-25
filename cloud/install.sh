#!/bin/bash
set -euo pipefail
mkdir -p /workspace/.local/onboarding
cat > /workspace/.local/onboarding/activate.sh <<'POKEMON_SETUP_EOF'
export PATH=/workspace/.local/toolchain/node_modules/.bin:/workspace/.local/rea/node_modules/.bin:/workspace/.local/python/bin:$PATH
export npm_config_cache=/workspace/.cache/npm

POKEMON_SETUP_EOF
cat > /workspace/.local/onboarding/validate.py <<'POKEMON_SETUP_EOF'
import csv
import importlib.metadata
import io
import json
import tempfile
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

with tempfile.TemporaryDirectory(prefix='pokemon-environment-') as tmp:
    root = Path(tmp)
    image = root / 'sample.png'
    Image.new('RGBA', (16, 16), (12, 34, 56, 255)).save(image)
    with Image.open(image) as loaded:
        assert loaded.size == (16, 16)
        assert loaded.getpixel((0, 0)) == (12, 34, 56, 255)
    assert json.loads('{"ok":true}')['ok']
    assert list(csv.DictReader(io.StringIO('name,value\nsample,42\n')))[0]['value'] == '42'
    assert ET.fromstring('<sample value="42"/>').attrib['value'] == '42'
    page_file = root / 'index.html'
    page_file.write_text('<!doctype html><meta charset="utf-8"><title>环境检查</title><button onclick="this.textContent=\'通过\'">检查</button>', encoding='utf-8')
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=tmp))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        page = browser.new_page()
        page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
        assert page.title() == '环境检查'
        page.get_by_role('button', name='检查').click()
        assert page.get_by_role('button').inner_text() == '通过'
        page.screenshot(path=str(root / 'screenshot.png'))
        print(json.dumps({'image_roundtrip': 'passed', 'json_csv_xml': 'passed', 'browser_local_page_and_click': 'passed', 'chromium': browser.version, 'Pillow': importlib.metadata.version('Pillow'), 'playwright': importlib.metadata.version('playwright')}, ensure_ascii=False))
        browser.close()

    server.shutdown()
    server.server_close()

POKEMON_SETUP_EOF
cat > /workspace/.local/onboarding/install.sh <<'POKEMON_SETUP_EOF'
#!/bin/bash
set -euo pipefail
export npm_config_cache=/workspace/.cache/npm
mkdir -p /workspace/.local/toolchain /workspace/.local/rea /workspace/.artifacts/onboarding
npm install --prefix /workspace/.local/toolchain --no-audit --no-fund node@24.22.1 npm@11.16.0
export PATH=/workspace/.local/toolchain/node_modules/.bin:$PATH
npm install --prefix /workspace/.local/rea --ignore-scripts --no-audit --no-fund rea-agents@6.7.0
python3 -m venv --system-site-packages /workspace/.local/python
/workspace/.local/python/bin/python -m pip install --disable-pip-version-check --no-input --cache-dir /workspace/.cache/pip Pillow==12.3.0 playwright==1.62.0
test -x /usr/bin/chromium
source /workspace/.local/onboarding/activate.sh
node --version
npm --version
python --version
git --version
chromium --version
python /workspace/.local/onboarding/validate.py
rea mcp doctor --json > /workspace/.artifacts/onboarding/rea-doctor.json
python -c 'import json; d=json.load(open("/workspace/.artifacts/onboarding/rea-doctor.json")); assert d["healthy"]; print("REA MCP healthy")'

POKEMON_SETUP_EOF
bash /workspace/.local/onboarding/install.sh
