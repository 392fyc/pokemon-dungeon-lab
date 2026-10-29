"""Generate one image from a prompt card with gpt-image, under a hard spending ledger.

Usage: python tools/art/gen_image.py cards/<card>.json --batch <tag> --stage <stage6|stage7> [--quality low] [--model gpt-image-2.5-flare]

The project's OpenAI credit is 50 USD in total (user, 2026-10-30). Stage 6 may spend at most 15 USD, stage 7 at most
20 USD and one batch at most 2 USD. --stage is required and must be a registered stage. Each call is estimated before it is sent and refused if a cap would be exceeded; the
actual usage returned by the API is then appended to usage-ledger.json. Raw output goes to the ignored
.artifacts/art-gen/<card>/ directory; it becomes a game asset only through pixelize.py.
"""
import argparse, base64, json, time, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
from common import RAW, openai_key

HERE = Path(__file__).resolve().parent
LEDGER = HERE / 'usage-ledger.json'
PRICE = {'image_out': 30e-6, 'image_in': 8e-6, 'text_in': 5e-6}  # USD per token, official model pages 2026-10-30
CAPS = {'project': 50.0, 'batch': 2.0, 'stages': {'stage6': 15.0, 'stage7': 20.0}}
# Conservative output-token guesses per call, used only for the pre-call check.
GUESS = {'low': 400, 'medium': 2000, 'high': 7000, 'xhigh': 12000, 'max': 20000, 'auto': 7000}


def cost(usage: dict) -> float:
    det = usage.get('input_tokens_details', {})
    return (usage.get('output_tokens', 0) * PRICE['image_out'] + det.get('image_tokens', 0) * PRICE['image_in']
            + det.get('text_tokens', 0) * PRICE['text_in'])


def check_caps(entries: list, stage: str, batch: str, guess: float) -> str | None:
    """Pure pre-call check. Returns a refusal message, or None when the call fits every cap."""
    if stage not in CAPS['stages']:
        return f'refused: unknown stage {stage!r}; registered stages: {", ".join(CAPS["stages"])}'
    checks = (('project', sum(e['usd'] for e in entries), CAPS['project']),
              (stage, sum(e['usd'] for e in entries if e.get('stage') == stage), CAPS['stages'][stage]),
              ('batch', sum(e['usd'] for e in entries if e.get('batch') == batch), CAPS['batch']))
    for name, used, cap in checks:
        if used + guess > cap:
            return f'refused: {name} spend {used:.3f} + estimate {guess:.3f} USD exceeds cap {cap}'
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('card')
    ap.add_argument('--quality')
    ap.add_argument('--model')
    ap.add_argument('--batch', required=True, help='name of this batch; one batch may spend at most 2 USD')
    ap.add_argument('--stage', required=True, choices=sorted(CAPS['stages']), help='registered stage; each has its own cap')
    a = ap.parse_args()
    card = json.loads(Path(a.card).read_text(encoding='utf-8'))
    model = a.model or card.get('model', 'gpt-image-2.5-flare')
    quality = a.quality or card.get('quality', 'low')
    size = card.get('size', '1024x1024')
    ledger = json.loads(LEDGER.read_text(encoding='utf-8')) if LEDGER.exists() else {'caps': CAPS, 'entries': []}
    spent = sum(e['usd'] for e in ledger['entries'])
    w, h = (int(v) for v in size.split('x')) if 'x' in size else (1536, 1536)
    area = max(1.0, w * h / (1024 * 1024))
    guess = GUESS[quality] * area * PRICE['image_out'] + len(card['prompt']) * PRICE['text_in']
    refusal = check_caps(ledger['entries'], a.stage, a.batch, guess)
    if refusal:
        raise SystemExit(refusal)
    body = {'model': model, 'prompt': card['prompt'], 'size': size, 'quality': quality, 'n': 1}
    if card.get('background'):
        body['background'] = card['background']
    key = openai_key()  # read first: a missing key must not leave a pending ledger entry
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    # Record the call before sending it, at the estimated cost, so a timeout or crash after the server has
    # charged still leaves a ledger entry. Success replaces the estimate with the reported usage.
    entry = {'at': stamp, 'card': card['id'], 'model': model, 'quality': quality, 'size': size, 'stage': a.stage,
             'batch': a.batch, 'status': 'pending', 'usage': None, 'usd': round(guess, 5)}
    ledger['entries'].append(entry)
    save = lambda: LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=1) + chr(10), encoding='utf-8', newline=chr(10))
    save()
    req = urllib.request.Request('https://api.openai.com/v1/images/generations', data=json.dumps(body).encode(),
                                 headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    t = time.time()
    try:
        d = json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        # The API rejected the request; no image was produced, so no charge is expected.
        entry.update(status=f'http-{e.code}', usd=0.0)
        save()
        raise SystemExit(f'HTTP {e.code}: {e.read()[:300].decode("utf-8", "replace")}')
    except Exception as e:
        entry.update(status=f'unknown-{type(e).__name__}')  # keeps the estimate: the server may have charged
        save()
        raise
    usage = d.get('usage')
    entry.update(status='ok' if usage else 'ok-no-usage', usage=usage, usd=round(cost(usage), 5) if usage else entry['usd'],
                 seconds=round(time.time() - t, 1))
    save()
    out = RAW / card['id']
    out.mkdir(parents=True, exist_ok=True)
    png = out / f'{stamp}-{model}-{quality}.png'
    png.write_bytes(base64.b64decode(d['data'][0]['b64_json']))
    entry['raw'] = png.name
    save()
    print(f'{png.relative_to(RAW.parent.parent).as_posix()}  {entry["usd"]:.4f} USD  (project total {spent + entry["usd"]:.3f})')


if __name__ == '__main__':
    main()
