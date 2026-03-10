$lines = Get-Content -Path _db_pull_out.txt
$repairs = @()

for ($i = 0; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if ($line -match "supabase migration repair") {
        $statusLine = $lines[$i+1]
        $idLine = $lines[$i+2]
        
        if ($statusLine -match "--status\s+(reverted|applied)" -and $idLine -match "(\d{14})") {
            $status = $matches[1]
            $id = $matches[1] # wait, no, $statusLine matches. We need separate matches.
        }
    }
}
