from pathlib import Path
import sys

root = Path(r'C:\Users\hawpe\CascadeProjects\soulmate\inc_llm_v1')
skip_dirs = {'tests', 'benchmarks', 'training', 'publish'}
allowed_ext = {'.py', '.toml', '.yaml', '.md'}
subs = [
    ("inc-llm-v1", "incllmv2"),
    ("inc-llm-server", "incllmv2-server"),
    ("INC-LLM-v1", "incllmv2"),
    ("INC-LLM-v2", "incllmv2"),
    ("incentives-inc-llm-v1-dolphin", "incentives-incllmv2-dolphin"),
    ("incentives-inc-llm-v1", "incentives-incllmv2"),
]

changed = []

for f in root.rglob('*'):
    if not f.is_file():
        continue
    rel = f.relative_to(root)
    if any(part in skip_dirs for part in rel.parts):
        continue
    name = f.name
    if f.suffix.lower() in allowed_ext or name == 'Modelfile' or name.startswith('Modelfile.'):
        if name == '.env' or 'secret' in name.lower():
            continue
        try:
            with open(f, 'r', encoding='utf-8', newline='') as fh:
                text = fh.read()
        except Exception as e:
            print(f'SKIP {f}: {e}', file=sys.stderr)
            continue
        new_text = text
        for old, new in subs:
            new_text = new_text.replace(old, new)
        if new_text != text:
            with open(f, 'w', encoding='utf-8', newline='') as fh:
                fh.write(new_text)
            changed.append(str(f))

copies = [
    (root / 'Modelfile.incentives-inc-llm-v1', root / 'Modelfile.incllmv2'),
    (root / 'modelfiles' / 'Modelfile.incentives-inc-llm-v1', root / 'modelfiles' / 'Modelfile.incllmv2'),
    (root / 'modelfiles' / 'Modelfile.incentives-inc-llm-v1-dolphin', root / 'modelfiles' / 'Modelfile.incllmv2-dolphin'),
]
for src, dst in copies:
    if src.exists():
        with open(src, 'rb') as fh:
            data = fh.read()
        with open(dst, 'wb') as fh:
            fh.write(data)
        changed.append(f'COPY {dst}')
    else:
        print(f'MISSING {src}', file=sys.stderr)

for c in changed:
    print(c)
