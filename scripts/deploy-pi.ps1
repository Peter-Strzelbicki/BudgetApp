param(
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PiTarget = 'pstrzelbicki@192.168.2.107'
$PiAddress = '192.168.2.107'
$SourceArchive = Join-Path $env:TEMP 'homebudget-source.tar.gz'
$WebArchive = Join-Path $env:TEMP 'homebudget-web.tar.gz'

function Assert-NativeSuccess {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE."
    }
}

Push-Location $RepoRoot
try {
    Write-Host 'Validating TypeScript...'
    & npx.cmd tsc --noEmit
    Assert-NativeSuccess 'TypeScript validation'

    Write-Host 'Running server tests...'
    & npm.cmd --prefix .\src\server test
    Assert-NativeSuccess 'Server tests'

    Write-Host 'Checking backend syntax...'
    & node.exe --check .\src\server\server.js
    Assert-NativeSuccess 'Backend syntax validation'

    Write-Host 'Building static Expo web routes...'
    & npx.cmd expo export --platform web --clear
    Assert-NativeSuccess 'Expo web export'

    if ($ValidateOnly) {
        Write-Host 'Validation completed; deployment was skipped.' -ForegroundColor Green
        exit 0
    }

    Write-Host 'Checking passwordless Pi access...'
    & ssh.exe -o BatchMode=yes -o ConnectTimeout=8 $PiTarget 'echo connected'
    Assert-NativeSuccess 'Pi SSH check'

    Remove-Item $SourceArchive, $WebArchive -Force -ErrorAction SilentlyContinue

    Write-Host 'Packaging current workspace source without secrets...'
    $SourceItems = @(
        'app.json',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'expo-app.service',
        'assets',
        'src',
        'scripts/serve-web.py',
        'scripts/deploy-pi-remote.sh'
    )
    & tar.exe -czf $SourceArchive `
        --exclude='node_modules' `
        --exclude='dist' `
        --exclude='src/server/.env' `
        --exclude='*.log' `
        @SourceItems
    Assert-NativeSuccess 'Source packaging'

    Write-Host 'Packaging static web build...'
    & tar.exe -czf $WebArchive -C .\dist .
    Assert-NativeSuccess 'Web packaging'

    Write-Host 'Uploading deployment artifacts...'
    & scp.exe -o BatchMode=yes `
        $SourceArchive `
        $WebArchive `
        .\scripts\deploy-pi-remote.sh `
        "${PiTarget}:/tmp/"
    Assert-NativeSuccess 'Pi upload'

    Write-Host 'Activating deployment on the Pi...'
    & ssh.exe -o BatchMode=yes $PiTarget `
        'bash /tmp/deploy-pi-remote.sh /tmp/homebudget-source.tar.gz /tmp/homebudget-web.tar.gz'
    Assert-NativeSuccess 'Pi activation'

    Write-Host 'Verifying live LAN endpoints...'
    & curl.exe -fsS --max-time 15 "http://${PiAddress}:8081/" | Out-Null
    Assert-NativeSuccess 'Homepage health check'
    & curl.exe -fsS --max-time 15 "http://${PiAddress}:8081/budget" | Out-Null
    Assert-NativeSuccess 'Direct route health check'
    & curl.exe -fsS --max-time 15 "http://${PiAddress}:3000/test-db" | Out-Null
    Assert-NativeSuccess 'API/database health check'

    Write-Host 'HomeBudget deployed successfully.' -ForegroundColor Green
    Write-Host "LAN: http://${PiAddress}:8081"
    Write-Host 'VPN: http://homebudget'
}
finally {
    Remove-Item $SourceArchive, $WebArchive -Force -ErrorAction SilentlyContinue
    Pop-Location
}