"""Gera server/functions/<nome>.ts a partir de base44/functions/<nome>/entry.ts.

A lógica da função não muda: só troca o SDK da Base44 pelo equivalente do
servidor novo (server/b44.ts) e o formato de entrada (Deno.serve -> export default).

Uso: python3 -I tools/port_function.py nome1 nome2 ...
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def port(name: str) -> Path:
    src = ROOT / "base44" / "functions" / name / "entry.ts"
    code = src.read_text(encoding="utf-8")
    code = re.sub(r"""import\s*\{\s*createClientFromRequest\s*\}\s*from\s*['"]npm:@base44/sdk@[^'"]+['"];?""",
                  'import { createClientFromRequest } from "../b44.ts";', code)
    if "@base44/sdk" in code:
        raise SystemExit(f"{name}: ainda usa o SDK da Base44 de outro jeito; revisar à mão")
    code = code.replace("../../shared/", "../../base44/shared/")
    if "Deno.serve(" in code:
        code, n = re.subn(r"Deno\.serve\(\s*async\s*\((\w+)\)\s*=>\s*\{", r"export default async function handler(\1) {", code, count=1)
        if n != 1:
            raise SystemExit(f"{name}: formato de Deno.serve não reconhecido")
        idx = code.rstrip().rfind("});")
        code = code[:idx] + "}\n"
    elif not re.search(r"export\s+default\s+async\s+function", code):
        raise SystemExit(f"{name}: não achei o ponto de entrada")
    header = (f"// Gerado de base44/functions/{name}/entry.ts por tools/port_function.py.\n"
              "// Para mudar regra de negócio, altere o original e gere de novo.\n")
    out = ROOT / "server" / "functions" / f"{name}.ts"
    out.write_text(header + code, encoding="utf-8")
    return out


if __name__ == "__main__":
    for n in sys.argv[1:]:
        print("gerado:", port(n).relative_to(ROOT))
