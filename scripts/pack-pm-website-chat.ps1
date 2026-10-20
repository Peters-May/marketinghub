# Pack PM Website Chat for WordPress upload (consistent with working 1.0.10 layout).
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

function New-WpPluginZip([string]$zipPath) {
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    Get-ChildItem -Path $pluginRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
      $rel = $_.FullName.Substring($pluginRoot.Length).TrimStart("\").Replace("\", "/")
      # Always wrap in folder pm-website-chat/ so WP updates the same plugin.
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
}

$zipVersioned = Join-Path $outDir "pm-website-chat-$ver.zip"
$zipPlain = Join-Path $outDir "pm-website-chat.zip"
New-WpPluginZip $zipVersioned
Copy-Item $zipVersioned $zipPlain -Force

$check = [System.IO.Compression.ZipFile]::OpenRead($zipVersioned)
$entries = @($check.Entries | ForEach-Object { $_.FullName })
$check.Dispose()

$hasMain = $entries -contains "pm-website-chat/pm-website-chat.php"
$hasBackslash = @($entries | Where-Object { $_ -match '\\' }).Count -gt 0
$hasFlatRoot = @($entries | Where-Object { $_ -notlike 'pm-website-chat/*' }).Count -gt 0

Write-Host "Version: $ver"
Write-Host "Zip:     $zipVersioned"
Write-Host "Also:    $zipPlain"
Write-Host "Entries: $($entries.Count)"
Write-Host "MAIN_OK=$hasMain BACKSLASH=$hasBackslash FLAT_ROOT=$hasFlatRoot"
if (-not $hasMain -or $hasBackslash -or $hasFlatRoot) {
  throw "Zip layout invalid — aborting"
}
Get-Item $zipVersioned, $zipPlain | Format-Table Name, Length, LastWriteTime
