"""Gera server/functions/<nome>.ts a partir de base44/functions/<nome>/entry.ts.

A lógica da função não muda: só troca o SDK da Base44 pelo equivalente do
servidor novo (server/b44.ts) e o formato de entrada (Deno.serve -> export default).

Uso: python3 -I tools/port_function.py nome1 nome2 ...
(também copia base44/shared para server/shared, trocando "base44:runtime" por server/runtime.ts)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNTIME_RE = re.compile(r"""from\s*['"]base44:runtime['"]""")


def copy_shared() -> None:
    src_dir = ROOT / "base44" / "shared"
    out_dir = ROOT / "server" / "shared"
    out_dir.mkdir(exist_ok=True)
    for f in sorted(src_dir.iterdir()):
        if f.suffix not in (".ts", ".js"):
            continue
        code = RUNTIME_RE.sub('from "../runtime.ts"', f.read_text(encoding="utf-8"))
        if "@base44/sdk" in code:
            raise SystemExit(f"shared/{f.name}: usa o SDK da Base44; revisar à mão")
        (out_dir / f.name).write_text(
            f"// Cópia de base44/shared/{f.name} gerada por tools/port_function.py.\n" + code, encoding="utf-8")


def port(name: str) -> Path:
    src = ROOT / "base44" / "functions" / name / "entry.ts"
    code = src.read_text(encoding="utf-8")
    code = re.sub(r"""import\s*\{\s*createClientFromRequest\s*\}\s*from\s*['"]npm:@base44/sdk@[^'"]+['"];?""",
                  'import { createClientFromRequest } from "../b44.ts";', code)
    if "@base44/sdk" in code:
        raise SystemExit(f"{name}: ainda usa o SDK da Base44 de outro jeito; revisar à mão")
    code = code.replace("../../shared/", "../shared/")
    code = RUNTIME_RE.sub('from "../runtime.ts"', code)
    if "Deno.serve(" in code:
        # Deno.serve(async (req) => {...}) vira export default (async (req) => {...});
        code, n = re.subn(r"Deno\.serve\(\s*(?=async\s*\()", "export default (", code, count=1)
        if n != 1:
            raise SystemExit(f"{name}: formato de Deno.serve não reconhecido")
    elif not re.search(r"export\s+default\s+async\s+function", code):
        raise SystemExit(f"{name}: não achei o ponto de entrada")
    header = (f"// Gerado de base44/functions/{name}/entry.ts por tools/port_function.py.\n"
              "// Para mudar regra de negócio, altere o original e gere de novo.\n")
    out = ROOT / "server" / "functions" / f"{name}.ts"
    out.write_text(header + code, encoding="utf-8")
    return out


if __name__ == "__main__":
    copy_shared()
    for n in sys.argv[1:]:
        print("gerado:", port(n).relative_to(ROOT))
