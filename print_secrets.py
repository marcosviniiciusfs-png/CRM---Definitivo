import os
import subprocess

result = subprocess.run(['npx', 'supabase', 'secrets', 'list'], capture_output=True, text=True)
print(result.stdout)
