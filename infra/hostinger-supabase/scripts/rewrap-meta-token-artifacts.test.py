from __future__ import annotations

import base64
import importlib.util
import io
import json
import stat
import tempfile
import unittest
from contextlib import redirect_stdout
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


MODULE_PATH = Path(__file__).with_name("rewrap-meta-token-artifacts.py")
SPEC = importlib.util.spec_from_file_location("rewrap_meta_token_artifacts", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def encrypt(plaintext: str, key: str) -> str:
    iv = bytes(range(12))
    normalized = (key.encode("utf-8") + (b"0" * 32))[:32]
    encrypted = AESGCM(normalized).encrypt(iv, plaintext.encode("utf-8"), None)
    return base64.b64encode(iv + encrypted).decode("ascii")


def write_ndjson(path: Path, records: list[dict[str, object]]) -> None:
    path.write_text(
        "".join(json.dumps(record, separators=(",", ":")) + "\n" for record in records),
        encoding="utf-8",
    )


class ArtifactBuilderTests(unittest.TestCase):
    meta_key = "a" * 64
    fallback_key = "historical-target-fallback"
    row_id = "11111111-1111-4111-8111-111111111111"
    access_plaintext = "EAAB-access-token-12345678901234567890"
    page_plaintext = "EAAB-page-token-1234567890123456789012"

    def test_build_rewraps_managed_and_fallback_tokens_to_meta_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot_path = root / "snapshot.ndjson"
            responses_path = root / "responses.ndjson"
            stage_path = root / "stage.tsv"
            post_path = root / "post.ndjson"

            legacy_access = encrypt(self.access_plaintext, "managed-current-key")
            fallback_page = encrypt(self.page_plaintext, self.fallback_key)
            rewrapped_access = encrypt(self.access_plaintext, self.meta_key)
            write_ndjson(snapshot_path, [
                {
                    "row_id": self.row_id,
                    "field": "encrypted_access_token",
                    "ciphertext": legacy_access,
                },
                {
                    "row_id": self.row_id,
                    "field": "encrypted_page_access_token",
                    "ciphertext": fallback_page,
                },
            ])
            write_ndjson(responses_path, [
                {
                    "row_id": self.row_id,
                    "field": "encrypted_access_token",
                    "status": "rewrapped",
                    "ciphertext": rewrapped_access,
                },
                {
                    "row_id": self.row_id,
                    "field": "encrypted_page_access_token",
                    "status": "unreadable",
                },
            ])

            build_output = io.StringIO()
            with patch("sys.stdin", io.StringIO(f"{self.meta_key}\n{self.fallback_key}\n")):
                with redirect_stdout(build_output):
                    MODULE.build(Namespace(
                        snapshot=snapshot_path,
                        responses=responses_path,
                        output=stage_path,
                        expected_nonempty=2,
                    ))

            self.assertEqual(stat.S_IMODE(stage_path.stat().st_mode), 0o600)
            staged = MODULE.load_stage(stage_path)
            self.assertIn("fallback_rewrapped=1", build_output.getvalue())
            self.assertIn("changed=2", build_output.getvalue())
            self.assertIn("meta_valid=2", build_output.getvalue())
            self.assertIn("fallback_valid=0", build_output.getvalue())
            for _original, desired in staged.values():
                self.assertTrue(MODULE.plausible_meta_token(MODULE.decrypt(desired, self.meta_key)))
                self.assertIsNone(MODULE.decrypt(desired, self.fallback_key))
            write_ndjson(post_path, [
                {
                    "row_id": identity[0],
                    "field": identity[1],
                    "ciphertext": values[1],
                }
                for identity, values in staged.items()
            ])
            with patch("sys.stdin", io.StringIO(f"{self.meta_key}\n{self.fallback_key}\n")):
                MODULE.verify(Namespace(
                    snapshot=post_path,
                    stage=stage_path,
                    expected_nonempty=2,
                ))

    def test_build_is_idempotent_when_token_is_already_meta_encrypted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot_path = root / "snapshot.ndjson"
            responses_path = root / "responses.ndjson"
            stage_path = root / "stage.tsv"
            current_ciphertext = encrypt(self.access_plaintext, self.meta_key)
            write_ndjson(snapshot_path, [{
                "row_id": self.row_id,
                "field": "encrypted_access_token",
                "ciphertext": current_ciphertext,
            }])
            write_ndjson(responses_path, [{
                "row_id": self.row_id,
                "field": "encrypted_access_token",
                "status": "already_current",
            }])

            captured = io.StringIO()
            with patch("sys.stdin", io.StringIO(f"{self.meta_key}\n{self.fallback_key}\n")):
                with redirect_stdout(captured):
                    MODULE.build(Namespace(
                        snapshot=snapshot_path,
                        responses=responses_path,
                        output=stage_path,
                        expected_nonempty=1,
                    ))

            staged = MODULE.load_stage(stage_path)
            self.assertEqual(staged[(self.row_id, "encrypted_access_token")], (
                current_ciphertext,
                current_ciphertext,
            ))
            self.assertIn("fallback_rewrapped=0", captured.getvalue())
            self.assertIn("changed=0", captured.getvalue())

    def test_plaintext_fails_closed_before_stage_is_written(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot_path = root / "snapshot.ndjson"
            responses_path = root / "responses.ndjson"
            stage_path = root / "stage.tsv"
            write_ndjson(snapshot_path, [{
                "row_id": self.row_id,
                "field": "encrypted_access_token",
                "ciphertext": self.access_plaintext,
            }])
            write_ndjson(responses_path, [{
                "row_id": self.row_id,
                "field": "encrypted_access_token",
                "status": "unreadable",
            }])

            with patch("sys.stdin", io.StringIO(f"{self.meta_key}\n{self.fallback_key}\n")):
                with self.assertRaises(MODULE.SafeFailure):
                    MODULE.build(Namespace(
                        snapshot=snapshot_path,
                        responses=responses_path,
                        output=stage_path,
                        expected_nonempty=1,
                    ))
            self.assertFalse(stage_path.exists())

    def test_inventory_reports_only_sanitized_counts_including_invalid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot_path = root / "snapshot.ndjson"
            responses_path = root / "responses.ndjson"
            managed_ciphertext = encrypt(self.access_plaintext, "managed-current-key")
            fallback_ciphertext = encrypt(self.page_plaintext, self.fallback_key)
            plaintext_accident = "this-plaintext-must-never-appear-in-metrics"
            write_ndjson(snapshot_path, [
                {
                    "row_id": self.row_id,
                    "field": "encrypted_access_token",
                    "ciphertext": managed_ciphertext,
                },
                {
                    "row_id": self.row_id,
                    "field": "encrypted_page_access_token",
                    "ciphertext": fallback_ciphertext,
                },
                {
                    "row_id": "22222222-2222-4222-8222-222222222222",
                    "field": "encrypted_access_token",
                    "ciphertext": plaintext_accident,
                },
            ])
            write_ndjson(responses_path, [
                {
                    "row_id": self.row_id,
                    "field": "encrypted_access_token",
                    "status": "rewrapped",
                    "ciphertext": encrypt(self.access_plaintext, self.meta_key),
                },
                {
                    "row_id": self.row_id,
                    "field": "encrypted_page_access_token",
                    "status": "unreadable",
                },
                {
                    "row_id": "22222222-2222-4222-8222-222222222222",
                    "field": "encrypted_access_token",
                    "status": "unreadable",
                },
            ])

            captured = io.StringIO()
            with patch("sys.stdin", io.StringIO(f"{self.meta_key}\n{self.fallback_key}\n")):
                with redirect_stdout(captured):
                    MODULE.inventory(Namespace(
                        snapshot=snapshot_path,
                        responses=responses_path,
                    ))

            metrics = captured.getvalue().strip()
            self.assertEqual(
                metrics,
                "nonempty=3 meta_readable=1 fallback_readable=1 invalid=1",
            )
            self.assertNotIn(plaintext_accident, metrics)


if __name__ == "__main__":
    unittest.main()
