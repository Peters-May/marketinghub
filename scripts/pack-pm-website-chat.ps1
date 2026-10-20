# Pack PM Website Chat for WordPress upload.
# One zip at exports/pm-website-chat.zip — entries start with pm-website-chat/
# Usage: powershell -File scripts/pack-pm-website-chat.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $root "wordpress-plugins\pm-website-chat"
$mainPhp = Join-Path $pluginRoot "pm-website-chat.php"
if (-not (Test-Path $mainPhp)) { throw "Missing $mainPhp" }

$verLine = Select-String -Path $mainPhp -Pattern '^\s*\*\s*Version:\s*(.+)$' | Select-Object -First 1
$ver = ($verLine.Matches.Groups[1].Value).Trim()
if (-not $ver) { throw "Could not read Version from plugin header" }

$exportsDir = Join-Path $root "exports"
New-Item -ItemType Directory -Force -Path $exportsDir | Out-Null

# Single top-level zip only (not a folder of zips, not two copies).
$zipPath = Join-Path $exportsDir "pm-website-chat.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $pluginRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($pluginRoot.Length).TrimStart("\").Replace("\", "/")
    # Folder must be exactly pm-website-chat/ so WP updates the same plugin.
    $entryName = "pm-website-chat/$rel"
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip,
      $_.FullName,
      $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    )
  }
} finally {
  $zip.Dispose()
}

$check = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entries = @($check.Entries | ForEach-Object { $_.FullName })
$check.Dispose()

$hasMain = $entries -contains "pm-website-chat/pm-website-chat.php"
$hasBackslash = @($entries | Where-Object { $_ -match '\\' }).Count -gt 0
$hasFlatRoot = @($entries | Where-Object { $_ -notlike 'pm-website-chat/*' }).Count -gt 0

Write-Host "Version: $ver"
Write-Host "Zip:     $zipPath"
Write-Host "Entries: $($entries.Count)"
Write-Host "MAIN_OK=$hasMain BACKSLASH=$hasBackslash FLAT_ROOT=$hasFlatRoot"
if (-not $hasMain -or $hasBackslash -or $hasFlatRoot) {
  throw "Zip layout invalid - aborting"
}
Get-Item $zipPath | Format-Table FullName, Length, LastWriteTime
