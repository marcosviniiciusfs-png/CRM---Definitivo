from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "check-service-copy-compatibility.py"
)


class CompatibilityGateTests(unittest.TestCase):
    def run_gate(self, data: str, catalog: str) -> tuple[subprocess.CompletedProcess[str], str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_path = root / "data.sql"
            catalog_path = root / "catalog.tsv"
            report_path = root / "report"
            data_path.write_text(data, encoding="utf-8", newline="\n")
            catalog_path.write_text(catalog, encoding="utf-8", newline="\n")
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--data",
                    str(data_path),
                    "--target-catalog",
                    str(catalog_path),
                    "--report",
                    str(report_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            return result, report_path.read_text(encoding="utf-8")

    def test_passes_when_target_contains_all_copy_columns(self) -> None:
        result, report = self.run_gate(
            "COPY auth.users (id, email) FROM stdin;\n"
            "1\tuser@example.invalid\n"
            "\\.\n"
            "COPY storage.objects (id, name) FROM stdin;\n"
            "\\.\n",
            "auth\tusers\t1\tid\n"
            "auth\tusers\t2\temail\n"
            "auth\tusers\t3\tcreated_at\n"
            "storage\tobjects\t1\tid\n"
            "storage\tobjects\t2\tname\n",
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("status=pass\n", report)
        self.assertIn("copy_rows=1\n", report)
        self.assertNotIn("user@example.invalid", result.stdout + result.stderr + report)

    def test_blocks_missing_table_even_when_copy_is_empty(self) -> None:
        result, report = self.run_gate(
            "COPY auth.users (id) FROM stdin;\n\\.\n"
            "COPY storage.buckets_vectors (id) FROM stdin;\n\\.\n",
            "auth\tusers\t1\tid\n"
            "storage\tobjects\t1\tid\n",
        )
        self.assertEqual(result.returncode, 3)
        self.assertIn("status=blocked\n", report)
        self.assertIn("blocked_table=storage.buckets_vectors;copy_rows=0\n", report)

    def test_blocks_missing_column_and_accepts_quoted_identifiers(self) -> None:
        result, report = self.run_gate(
            'COPY "auth"."flow_state" ("id", "linking_target_id") FROM stdin;\n'
            "1\t2\n"
            "\\.\n",
            "auth\tflow_state\t1\tid\n"
            "storage\tobjects\t1\tid\n",
        )
        self.assertEqual(result.returncode, 3)
        self.assertIn(
            "blocked_columns=auth.flow_state;columns=linking_target_id;copy_rows=1\n",
            report,
        )


if __name__ == "__main__":
    unittest.main()
