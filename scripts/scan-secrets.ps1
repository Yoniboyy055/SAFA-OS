$ErrorActionPreference = "Stop"

$pattern = "sk-|api[_-]?key|bearer|authorization|cookie|password|token|secret"
$excludePaths = @("docs/", ".env.example")

$results = git grep -nE $pattern -- .
if ($LASTEXITCODE -ne 0) {
  Write-Host "No matches found."
  exit 0
}

$filtered = @()
foreach ($line in $results) {
  $skip = $false
  foreach ($exclude in $excludePaths) {
    if ($line -match [regex]::Escape($exclude)) {
      $skip = $true
      break
    }
  }
  if (-not $skip) {
    $filtered += $line
  }
}

if ($filtered.Count -gt 0) {
  Write-Host "Potential secret matches (non-doc/example):"
  $filtered | ForEach-Object { Write-Host $_ }
  exit 1
}

Write-Host "Matches found only in docs/examples."
exit 0
