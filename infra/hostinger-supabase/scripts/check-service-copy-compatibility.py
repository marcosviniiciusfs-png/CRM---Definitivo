#!/usr/bin/env python3
"""Fail closed when a managed Supabase data dump is newer than the target.

Only COPY headers and row counts are inspected. COPY payloads are never emitted.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from dataclasses import dataclass
from pathlib import Path


CONTROLLED_SCHEMAS = frozenset({"auth", "storage"})
IDENTIFIER = r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)'
COPY_HEADER = re.compile(
    rf"^COPY\s+(?P<schema>{IDENTIFIER})\.(?P<table>{IDENTIFIER})\s+"
    rf"\((?P<columns>.*)\)\s+FROM\s+stdin;$"
)
SAFE_IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z0-9_$]*")


@dataclass(frozen=True)
class CopyBlock:
    schema: str
    table: str
    columns: tuple[str, ...]
    rows: int


class CompatibilityError(RuntimeError):
    pass


def decode_identifier(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith('"'):
        if not raw.endswith('"'):
            raise CompatibilityError("quoted SQL identifier is incomplete")
        decoded = raw[1:-1].replace('""', '"')
    else:
        decoded = raw
    if SAFE_IDENTIFIER.fullmatch(decoded) is None:
        raise CompatibilityError("unexpected SQL identifier in COPY header")
    return decoded


def split_identifiers(raw: str) -> tuple[str, ...]:
    fields: list[str] = []
    current: list[str] = []
    quoted = False
    index = 0
    while index < len(raw):
        char = raw[index]
        if char == '"':
            current.append(char)
            if quoted and index + 1 < len(raw) and raw[index + 1] == '"':
                current.append('"')
                index += 2
                continue
            quoted = not quoted
        elif char == "," and not quoted:
            fields.append("".join(current))
            current = []
        else:
            current.append(char)
        index += 1
    if quoted:
        raise CompatibilityError("COPY column list contains incomplete quotes")
    fields.append("".join(current))
    decoded = tuple(decode_identifier(field) for field in fields)
    if not decoded or any(not field for field in decoded):
        raise CompatibilityError("COPY column list is empty or invalid")
    if len(decoded) != len(set(decoded)):
        raise CompatibilityError("COPY column list contains duplicates")
    return decoded


def parse_dump(path: Path) -> list[CopyBlock]:
    blocks: list[CopyBlock] = []
    active: tuple[str, str, tuple[str, ...]] | None = None
    active_rows = 0

    with path.open("r", encoding="utf-8", errors="strict", newline="") as stream:
        for raw_line in stream:
            line = raw_line.rstrip("\r\n")
            if active is not None:
                if line == r"\.":
                    schema, table, columns = active
                    if schema in CONTROLLED_SCHEMAS:
                        blocks.append(CopyBlock(schema, table, columns, active_rows))
                    active = None
                    active_rows = 0
                else:
                    active_rows += 1
                continue

            if not line.startswith("COPY "):
                continue
            match = COPY_HEADER.fullmatch(line)
            if match is None:
                raise CompatibilityError("unrecognized COPY header; analysis refused")
            schema = decode_identifier(match.group("schema"))
            table = decode_identifier(match.group("table"))
            columns = split_identifiers(match.group("columns"))
            active = (schema, table, columns)

    if active is not None:
        raise CompatibilityError("COPY block has no terminator")
    if not blocks:
        raise CompatibilityError("no auth/storage COPY blocks were found")
    return blocks


def parse_catalog(path: Path) -> dict[tuple[str, str], tuple[str, ...]]:
    catalog: dict[tuple[str, str], list[tuple[int, str]]] = {}
    with path.open("r", encoding="utf-8", errors="strict", newline="") as stream:
        for raw_line in stream:
            line = raw_line.rstrip("\r\n")
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) != 4:
                raise CompatibilityError("target catalog contains an invalid row")
            schema, table, ordinal_raw, column = parts
            if schema not in CONTROLLED_SCHEMAS:
                raise CompatibilityError("target catalog contains an out-of-scope schema")
            if SAFE_IDENTIFIER.fullmatch(table) is None or SAFE_IDENTIFIER.fullmatch(column) is None:
                raise CompatibilityError("target catalog contains an unsafe identifier")
            try:
                ordinal = int(ordinal_raw)
            except ValueError as exc:
                raise CompatibilityError("invalid ordinal in target catalog") from exc
            if ordinal <= 0 or not table or not column:
                raise CompatibilityError("invalid target catalog entry")
            catalog.setdefault((schema, table), []).append((ordinal, column))

    if not catalog:
        raise CompatibilityError("target auth/storage catalog is empty")
    return {
        key: tuple(column for _, column in sorted(entries))
        for key, entries in catalog.items()
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def render_report(
    blocks: list[CopyBlock],
    catalog: dict[tuple[str, str], tuple[str, ...]],
    dump_sha256: str,
) -> tuple[str, bool]:
    missing_tables: list[CopyBlock] = []
    missing_columns: list[tuple[CopyBlock, tuple[str, ...]]] = []

    for block in blocks:
        target_columns = catalog.get((block.schema, block.table))
        if target_columns is None:
            missing_tables.append(block)
            continue
        target_set = set(target_columns)
        absent = tuple(column for column in block.columns if column not in target_set)
        if absent:
            missing_columns.append((block, absent))

    passed = not missing_tables and not missing_columns
    lines = [
        "format=crm-service-schema-compatibility-v1",
        f"status={'pass' if passed else 'blocked'}",
        f"data_sql_sha256={dump_sha256}",
        "controlled_schemas=auth,storage",
        f"copy_blocks={len(blocks)}",
        f"copy_rows={sum(block.rows for block in blocks)}",
        f"missing_tables={len(missing_tables)}",
        f"missing_column_sets={len(missing_columns)}",
    ]
    for block in sorted(missing_tables, key=lambda item: (item.schema, item.table)):
        lines.append(
            f"blocked_table={block.schema}.{block.table};copy_rows={block.rows}"
        )
    for block, columns in sorted(
        missing_columns, key=lambda item: (item[0].schema, item[0].table)
    ):
        lines.append(
            f"blocked_columns={block.schema}.{block.table};"
            f"columns={','.join(columns)};copy_rows={block.rows}"
        )
    return "\n".join(lines) + "\n", passed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--target-catalog", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    try:
        digest = sha256_file(args.data)
        blocks = parse_dump(args.data)
        catalog = parse_catalog(args.target_catalog)
        report, passed = render_report(blocks, catalog, digest)
        args.report.write_text(report, encoding="utf-8", newline="\n")
    except (CompatibilityError, OSError, UnicodeError) as exc:
        try:
            args.report.write_text(
                "format=crm-service-schema-compatibility-v1\n"
                "status=error\n"
                f"reason={type(exc).__name__}\n",
                encoding="utf-8",
                newline="\n",
            )
        except OSError:
            pass
        print(f"compatibility gate error: {type(exc).__name__}", file=sys.stderr)
        return 2

    if not passed:
        print("compatibility gate blocked: auth/storage schema mismatch", file=sys.stderr)
        return 3
    print("compatibility gate passed: auth/storage COPY targets exist")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
