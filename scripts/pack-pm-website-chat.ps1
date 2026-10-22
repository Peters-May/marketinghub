# Pack PM Website Chat like the working 1.0.10 layout:
#   exports/pm-website-chat-VERSION/pm-website-chat-VERSION.zip
# Zip entries: pm-website-chat/... (one folder, forward slashes)
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

$outDir = Join-Path $root "exports\pm-website-chat-$ver"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$zipPath = Join-Path $outDir "pm-website-chat-$ver.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
# Remove any accidental plain duplicate in this folder
$plainDup = Join-Path $outDir "pm-website-chat.zip"
if (Test-Path $plainDup) { Remove-Item $plainDup -Force }
# Remove loose top-level copy if present
$loose = Join-Path $root "exports\pm-website-chat-$ver.zip"
if (Test-Path $loose) { Remove-Item $loose -Force }

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $pluginRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($pluginRoot.Length).TrimStart("\").Replace("\", "/")
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
