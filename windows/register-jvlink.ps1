# JV-Link COM registration check / registration script
# ASCII only. Windows PowerShell 5.1 compatible.
#
# Usage (run in elevated PowerShell):
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\register-jvlink.ps1
#   .\register-jvlink.ps1 -Register
#   .\register-jvlink.ps1 -Register -DllPath "C:\Program Files (x86)\JRA-VAN\Data Lab\JV-Link\JVLink.dll"

param(
    [switch]$Register,
    [string]$DllPath = ""
)

$ErrorActionPreference = "Stop"
$CLSID  = "{2AB1774D-0C41-11D7-916F-0003479BEB3F}"
$ProgId = "JVDTLab.JVLink"

function Section($title) {
    Write-Host ""
    Write-Host "--- $title ---"
}

# 1. admin check
Section "1. admin check"
$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[NG] not administrator. Run PowerShell as admin and retry."
    exit 1
}
Write-Host "[OK] admin"

# 2. CLSID check (32bit under WOW6432Node)
Section "2. CLSID check"
$reg32 = "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\$CLSID"
$reg64 = "HKLM:\SOFTWARE\Classes\CLSID\$CLSID"
$found32 = Test-Path $reg32
$found64 = Test-Path $reg64

if ($found32) { Write-Host "[OK] clsid found (32bit WOW6432Node)" }
else          { Write-Host "[NG] clsid missing (32bit WOW6432Node)" }

if ($found64) { Write-Host "[WARN] clsid also in 64bit hive (not expected for JV-Link)" }

# 3. InprocServer32 / DLL existence
Section "3. InprocServer32 DLL"
$inprocPath = $null
if ($found32) {
    $inprocKey = Join-Path $reg32 "InprocServer32"
    if (Test-Path $inprocKey) {
        try {
            $item = Get-ItemProperty -Path $inprocKey -ErrorAction Stop
            $inprocPath = $item."(default)"
            if (-not $inprocPath) { $inprocPath = $item.'(Default)' }
        } catch {
            Write-Host "[NG] cannot read InprocServer32"
        }
    }
}

if ($inprocPath) {
    Write-Host ("[INFO] InprocServer32 = " + $inprocPath)
    if (Test-Path $inprocPath) {
        Write-Host "[OK] dll exists: $inprocPath"
    } else {
        Write-Host "[NG] dll file not found on disk (orphan registration)"
    }
} else {
    Write-Host "[--] InprocServer32 not resolvable"
}

# 4. ProgID reverse lookup
Section "4. ProgID lookup"
$progPath = "HKLM:\SOFTWARE\WOW6432Node\Classes\$ProgId"
if (Test-Path $progPath) { Write-Host "[OK] progid found: $ProgId (32bit)" }
else                     { Write-Host "[NG] progid missing: $ProgId (32bit)" }

if (-not $Register) {
    Section "diagnosis"
    if ($found32 -and $inprocPath -and (Test-Path $inprocPath)) {
        Write-Host "[OK] JV-Link COM appears registered."
        Write-Host "     Run: .\bin\Release\net8.0-windows\win-x86\JvLinkExporter.exe --dummy --date=2026-04-15"
    } else {
        Write-Host "[NG] registration missing or broken."
        Write-Host "     Re-run with: .\register-jvlink.ps1 -Register"
    }
    exit 0
}

# 5. DLL discovery
Section "5. locate JVLink.dll"
$candidates = @(
    "C:\Program Files (x86)\JRA-VAN\Data Lab\JV-Link\JVLink.dll",
    "C:\Program Files (x86)\JRA-VAN\Data Lab\JVLink.dll",
    "C:\Program Files (x86)\JRA-VAN\JV-Link\JVLink.dll",
    "C:\Program Files\JRA-VAN\Data Lab\JV-Link\JVLink.dll"
)
if ($DllPath -ne "") { $candidates = @($DllPath) + $candidates }

$dll = $null
foreach ($c in $candidates) {
    if (Test-Path $c) { $dll = $c; break }
}
if (-not $dll) {
    Write-Host "[NG] JVLink.dll not found. Tried:"
    foreach ($c in $candidates) { Write-Host "     - $c" }
    Write-Host "     Specify path: .\register-jvlink.ps1 -Register -DllPath 'C:\full\path\JVLink.dll'"
    exit 1
}
Write-Host "[OK] found: $dll"

# 6. regsvr32 (SysWOW64 = 32bit regsvr32)
Section "6. regsvr32 (32bit)"
$regsvr = "C:\Windows\SysWOW64\regsvr32.exe"
if (-not (Test-Path $regsvr)) {
    Write-Host "[NG] $regsvr not found. Is this a 64bit Windows?"
    exit 1
}
Write-Host "[RUN] $regsvr /s `"$dll`""
$p = Start-Process -FilePath $regsvr -ArgumentList @('/s', "`"$dll`"") -Wait -PassThru -NoNewWindow
if ($p.ExitCode -ne 0) {
    Write-Host "[NG] regsvr32 failed (exit=$($p.ExitCode))"
    Write-Host "     Check: DLL bitness must be 32bit. Antivirus may block COM registration."
    exit 1
}
Write-Host "[OK] regsvr32 returned 0"

# 7. recheck
Section "7. recheck"
if (Test-Path $reg32) {
    Write-Host "[DONE] registration complete"
    Write-Host ""
    Write-Host "Next:"
    Write-Host "  cd windows\JvLinkExporter"
    Write-Host "  dotnet clean"
    Write-Host "  dotnet build -c Release -r win-x86"
    Write-Host "  .\bin\Release\net8.0-windows\win-x86\JvLinkExporter.exe --dummy --date=2026-04-15"
} else {
    Write-Host "[NG] CLSID still not visible after regsvr32. Check regsvr32 logs / AV / UAC."
    exit 1
}
