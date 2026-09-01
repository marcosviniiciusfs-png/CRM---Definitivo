#!/usr/bin/env python3
"""Validate and stage Meta token ciphertext without ever emitting plaintext."""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("meta_rewrap_error=crypto_backend_unavailable", file=sys.stderr)
    raise SystemExit(70)


ALLOWED_FIELDS = {"encrypted_access_token", "encrypted_page_access_token"}
ALLOWED_STATUSES = {"rewrapped", "already_current", "unreadable"}
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
HEX_64_PATTERN = re.compile(r"^[0-9a-f]{64}$", re.IGNORECASE)
BASE64_PATTERN = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
MAX_CIPHERTEXT_LENGTH = 8192
MAX_SLOTS = 10000


class SafeFailure(Exception):
    """An intentionally sanitized validation failure."""


def fail(code: str) -> None:
    raise SafeFailure(code)


def normalize_key(value: str) -> bytes:
    return (value.encode("utf-8") + (b"0" * 32))[:32]


def decrypt(ciphertext: str, key: str) -> str | None:
    if (
        not ciphertext
        or len(ciphertext) > MAX_CIPHERTEXT_LENGTH
        or len(ciphertext) % 4 != 0
        or not BASE64_PATTERN.fullmatch(ciphertext)
    ):
        return None
    try:
        combined = base64.b64decode(ciphertext, validate=True)
        if len(combined) <= 28:
            return None
        return AESGCM(normalize_key(key)).decrypt(
            combined[:12], combined[12:], None
        ).decode("utf-8")
    except Exception:
        return None


def encrypt(plaintext: str, key: str) -> str:
    iv = os.urandom(12)
    encrypted = AESGCM(normalize_key(key)).encrypt(
        iv, plaintext.encode("utf-8"), None
    )
    return base64.b64encode(iv + encrypted).decode("ascii")


def plausible_meta_token(value: str | None) -> bool:
    return (
        value is not None
        and 20 <= len(value) <= 4096
        and all(ord(character) > 32 and ord(character) != 127 for character in value)
    )


def read_keys() -> tuple[str, str]:
    lines = sys.stdin.read().splitlines()
    if len(lines) != 2:
        fail("invalid_key_channel")
    meta_key, fallback_key = lines
    if not HEX_64_PATTERN.fullmatch(meta_key):
        fail("invalid_meta_key")
    if not 16 <= len(fallback_key) <= 256 or any(character.isspace() for character in fallback_key):
        fail("invalid_fallback_key")
    if normalize_key(meta_key) == normalize_key(fallback_key):
        fail("keys_not_distinct")
    return meta_key, fallback_key


def load_ndjson(path: Path, kind: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as source:
            for raw_line in source:
                if not raw_line.strip():
                    continue
                value = json.loads(raw_line)
                if not isinstance(value, dict):
                    fail(f"invalid_{kind}")
                records.append(value)
                if len(records) > MAX_SLOTS:
                    fail(f"oversized_{kind}")
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        fail(f"invalid_{kind}")
    return records


def validate_slot_identity(record: dict[str, Any]) -> tuple[str, str]:
    row_id = record.get("row_id")
    field = record.get("field")
    if (
        not isinstance(row_id, str)
        or not UUID_PATTERN.fullmatch(row_id)
        or field not in ALLOWED_FIELDS
    ):
        fail("invalid_slot_identity")
    return row_id, field


def load_snapshot(path: Path) -> dict[tuple[str, str], str | None]:
    snapshot: dict[tuple[str, str], str | None] = {}
    for record in load_ndjson(path, "snapshot"):
        if set(record) != {"row_id", "field", "ciphertext"}:
            fail("invalid_snapshot_schema")
        identity = validate_slot_identity(record)
        ciphertext = record["ciphertext"]
        if ciphertext is not None and (
            not isinstance(ciphertext, str) or len(ciphertext) > MAX_CIPHERTEXT_LENGTH
        ):
            fail("invalid_snapshot_ciphertext")
        if identity in snapshot:
            fail("duplicate_snapshot_slot")
        snapshot[identity] = ciphertext
    if not snapshot:
        fail("empty_snapshot")
    return snapshot


def load_results(
    path: Path,
    expected_identities: set[tuple[str, str]],
) -> dict[tuple[str, str], dict[str, Any]]:
    results: dict[tuple[str, str], dict[str, Any]] = {}
    for record in load_ndjson(path, "response"):
        if not set(record).issubset({"row_id", "field", "status", "ciphertext"}):
            fail("invalid_response_schema")
        identity = validate_slot_identity(record)
        if identity not in expected_identities or identity in results:
            fail("unexpected_response_slot")
        status = record.get("status")
        if status not in ALLOWED_STATUSES:
            fail("invalid_response_status")
        has_ciphertext = "ciphertext" in record
        if status == "rewrapped":
            if (
                not has_ciphertext
                or not isinstance(record["ciphertext"], str)
                or not 0 < len(record["ciphertext"]) <= MAX_CIPHERTEXT_LENGTH
            ):
                fail("missing_rewrapped_ciphertext")
        elif has_ciphertext:
            fail("unexpected_response_ciphertext")
        results[identity] = record
    if set(results) != expected_identities:
        fail("incomplete_response")
    return results


def encode_state(value: str | None) -> tuple[str, str]:
    if value is None:
        return "null", "-"
    if value == "":
        return "empty", "-"
    return "cipher", base64.b64encode(value.encode("utf-8")).decode("ascii")


def decode_state(state: str, encoded: str) -> str | None:
    if state == "null" and encoded == "-":
        return None
    if state == "empty" and encoded == "-":
        return ""
    if state != "cipher" or not BASE64_PATTERN.fullmatch(encoded):
        fail("invalid_staged_value")
    try:
        return base64.b64decode(encoded, validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError, binascii.Error):
        fail("invalid_staged_value")


def write_stage(
    path: Path,
    snapshot: dict[tuple[str, str], str | None],
    desired: dict[tuple[str, str], str | None],
) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            for identity in sorted(snapshot):
                expected_state, expected_encoded = encode_state(snapshot[identity])
                desired_state, desired_encoded = encode_state(desired[identity])
                output.write(
                    "\t".join(
                        (
                            identity[0],
                            identity[1],
                            expected_state,
                            expected_encoded,
                            desired_state,
                            desired_encoded,
                        )
                    )
                    + "\n"
                )
    except Exception:
        try:
            path.unlink(missing_ok=True)
        finally:
            raise


def load_stage(path: Path) -> dict[tuple[str, str], tuple[str | None, str | None]]:
    staged: dict[tuple[str, str], tuple[str | None, str | None]] = {}
    try:
        with path.open("r", encoding="utf-8") as source:
            for line in source:
                parts = line.rstrip("\n").split("\t")
                if len(parts) != 6:
                    fail("invalid_stage")
                row_id, field, old_state, old_encoded, new_state, new_encoded = parts
                identity = validate_slot_identity({"row_id": row_id, "field": field})
                if identity in staged:
                    fail("duplicate_stage_slot")
                staged[identity] = (
                    decode_state(old_state, old_encoded),
                    decode_state(new_state, new_encoded),
                )
    except (OSError, UnicodeDecodeError):
        fail("invalid_stage")
    return staged


def validate_ciphertext_set(
    values: dict[tuple[str, str], str | None],
    meta_key: str,
    fallback_key: str,
) -> tuple[int, int, int, int, int]:
    meta_count = 0
    fallback_count = 0
    null_count = 0
    empty_count = 0
    invalid_count = 0

    for ciphertext in values.values():
        if ciphertext is None:
            null_count += 1
            continue
        if ciphertext == "":
            empty_count += 1
            continue
        plaintext = decrypt(ciphertext, meta_key)
        if plausible_meta_token(plaintext):
            meta_count += 1
            plaintext = None
            continue
        plaintext = None
        plaintext = decrypt(ciphertext, fallback_key)
        if plausible_meta_token(plaintext):
            fallback_count += 1
        else:
            invalid_count += 1
        plaintext = None

    return meta_count, fallback_count, null_count, empty_count, invalid_count


def build_proposed_state(
    snapshot: dict[tuple[str, str], str | None],
    responses_path: Path,
) -> tuple[
    dict[tuple[str, str], str | None],
    dict[str, int],
    set[tuple[str, str]],
    dict[tuple[str, str], dict[str, Any]],
]:
    nonempty_identities = {
        identity for identity, value in snapshot.items() if value not in (None, "")
    }
    results = load_results(responses_path, nonempty_identities)
    desired = dict(snapshot)
    status_counts = {status: 0 for status in ALLOWED_STATUSES}

    for identity in nonempty_identities:
        result = results[identity]
        status = result["status"]
        status_counts[status] += 1
        if status == "rewrapped":
            desired[identity] = result["ciphertext"]

    return desired, status_counts, nonempty_identities, results


def inventory(args: argparse.Namespace) -> None:
    meta_key, fallback_key = read_keys()
    snapshot = load_snapshot(args.snapshot)
    desired, status_counts, nonempty_identities, _results = build_proposed_state(
        snapshot, args.responses
    )

    meta_count, fallback_count, _null_count, _empty_count, invalid_count = (
        validate_ciphertext_set(desired, meta_key, fallback_key)
    )
    nonempty_count = len(nonempty_identities)
    if meta_count != status_counts["rewrapped"] + status_counts["already_current"]:
        fail("response_status_crypto_mismatch")
    if fallback_count + invalid_count != status_counts["unreadable"]:
        fail("fallback_status_crypto_mismatch")
    if meta_count + fallback_count + invalid_count != nonempty_count:
        fail("inventory_count_mismatch")

    print(
        " ".join(
            (
                f"nonempty={nonempty_count}",
                f"meta_readable={meta_count}",
                f"fallback_readable={fallback_count}",
                f"invalid={invalid_count}",
            )
        )
    )


def build(args: argparse.Namespace) -> None:
    meta_key, fallback_key = read_keys()
    snapshot = load_snapshot(args.snapshot)
    desired, status_counts, nonempty_identities, results = build_proposed_state(
        snapshot, args.responses
    )

    source_meta_count, source_fallback_count, _null_count, _empty_count, source_invalid_count = (
        validate_ciphertext_set(desired, meta_key, fallback_key)
    )
    nonempty_count = len(nonempty_identities)
    if source_invalid_count:
        fail("source_crypto_validation_failed")
    if source_meta_count != status_counts["rewrapped"] + status_counts["already_current"]:
        fail("response_status_crypto_mismatch")
    if source_fallback_count != status_counts["unreadable"]:
        fail("fallback_status_crypto_mismatch")

    fallback_rewrapped = 0
    for identity in nonempty_identities:
        if results[identity]["status"] != "unreadable":
            continue
        plaintext = decrypt(snapshot[identity] or "", fallback_key)
        if not plausible_meta_token(plaintext):
            fail("fallback_rewrap_failed")
        desired[identity] = encrypt(plaintext, meta_key)
        fallback_rewrapped += 1
        plaintext = None

    meta_count, fallback_count, null_count, empty_count, invalid_count = (
        validate_ciphertext_set(desired, meta_key, fallback_key)
    )
    if invalid_count or meta_count != nonempty_count or fallback_count != 0:
        fail("desired_crypto_validation_failed")
    if args.expected_nonempty is not None and nonempty_count != args.expected_nonempty:
        fail("unexpected_nonempty_count")

    write_stage(args.output, snapshot, desired)
    changed_count = status_counts["rewrapped"] + fallback_rewrapped
    print(
        " ".join(
            (
                f"slots_total={len(snapshot)}",
                f"nonempty={nonempty_count}",
                f"rewrapped={status_counts['rewrapped']}",
                f"already_current={status_counts['already_current']}",
                f"fallback_rewrapped={fallback_rewrapped}",
                f"changed={changed_count}",
                f"meta_valid={meta_count}",
                f"fallback_valid={fallback_count}",
                f"null={null_count}",
                f"empty={empty_count}",
                "invalid=0",
            )
        )
    )


def verify(args: argparse.Namespace) -> None:
    meta_key, fallback_key = read_keys()
    snapshot = load_snapshot(args.snapshot)
    staged = load_stage(args.stage)
    if set(snapshot) != set(staged):
        fail("post_commit_slot_mismatch")
    for identity, (_, desired) in staged.items():
        if snapshot[identity] != desired:
            fail("post_commit_value_mismatch")

    meta_count, fallback_count, null_count, empty_count, invalid_count = (
        validate_ciphertext_set(snapshot, meta_key, fallback_key)
    )
    nonempty_count = len(snapshot) - null_count - empty_count
    if invalid_count or meta_count != nonempty_count or fallback_count != 0:
        fail("post_commit_crypto_validation_failed")
    if args.expected_nonempty is not None and nonempty_count != args.expected_nonempty:
        fail("unexpected_nonempty_count")

    print(
        " ".join(
            (
                f"post_slots_total={len(snapshot)}",
                f"post_nonempty={nonempty_count}",
                f"post_meta_valid={meta_count}",
                f"post_fallback_valid={fallback_count}",
                f"post_null={null_count}",
                f"post_empty={empty_count}",
                "post_invalid=0",
            )
        )
    )


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(add_help=True)
    subparsers = root.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build")
    build_parser.add_argument("--snapshot", type=Path, required=True)
    build_parser.add_argument("--responses", type=Path, required=True)
    build_parser.add_argument("--output", type=Path, required=True)
    build_parser.add_argument("--expected-nonempty", type=int)
    build_parser.set_defaults(handler=build)

    inventory_parser = subparsers.add_parser("inventory")
    inventory_parser.add_argument("--snapshot", type=Path, required=True)
    inventory_parser.add_argument("--responses", type=Path, required=True)
    inventory_parser.set_defaults(handler=inventory)

    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("--snapshot", type=Path, required=True)
    verify_parser.add_argument("--stage", type=Path, required=True)
    verify_parser.add_argument("--expected-nonempty", type=int)
    verify_parser.set_defaults(handler=verify)
    return root


def main() -> int:
    try:
        arguments = parser().parse_args()
        arguments.handler(arguments)
        return 0
    except SafeFailure as error:
        print(f"meta_rewrap_error={error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
