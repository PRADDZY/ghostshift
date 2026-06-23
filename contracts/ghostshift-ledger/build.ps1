$winLibsPackageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
$winLibsDir = Get-ChildItem $winLibsPackageRoot -Directory -Filter 'BrechtSanders.WinLibs.POSIX.UCRT*' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($winLibsDir) {
  $winLibsBin = Join-Path $winLibsDir.FullName 'mingw64\bin'
  if (Test-Path $winLibsBin) {
    $env:PATH = "$winLibsBin;$env:PATH"
  }
}

$env:RUSTUP_TOOLCHAIN = 'nightly-2024-07-31-x86_64-pc-windows-gnu'

Push-Location $PSScriptRoot
try {
  cargo build --release --target wasm32-unknown-unknown
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
