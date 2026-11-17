#!/usr/bin/env python3
"""Gera src/api/entityColumns.js: colunas e tipos de cada entidade, usados pela
camada de compatibilidade para descartar campos desconhecidos e converter tipos.
Uso: python3 -I gen_entity_columns.py <pasta_entities> <saida.js>"""
import json, re, sys
from pathlib import Path
T = {"string": "t", "number": "n", "integer": "n", "boolean": "b", "array": "j", "object": "j"}
out = {}
for p in sorted(Path(sys.argv[1]).glob("*.jsonc")):
    d = json.loads(re.sub(r"^\s*//.*$", "", p.read_text(encoding="utf-8"), flags=re.M))
    cols = {k: T.get(v.get("type"), "j") for k, v in d["properties"].items()}
    if d["name"] == "User":
        cols.update({"email": "t", "full_name": "t", "disabled": "b"})
    out[d["name"]] = cols
Path(sys.argv[2]).write_text(
    "// Gerado por tools/gen_entity_columns.py a partir de base44/entities. Não editar à mão.\n"
    "// t = texto, n = número, b = sim/não, j = lista ou objeto\n"
    "export const ENTITY_COLUMNS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8")
print(len(out), "entidades")
