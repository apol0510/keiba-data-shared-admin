# JV-Link COM 登録確認 / 登録スクリプト
#
# 管理者 PowerShell で実行すること (右クリック > "管理者として実行")
#
# 手順:
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\register-jvlink.ps1
#   .\register-jvlink.ps1 -Register          # 自動登録まで行う
#   .\register-jvlink.ps1 -Register -DllPath "C:\Program Files (x86)\JRA-VAN\Data Lab\JV-Link\JVLink.dll"

param(
    [switch]$Register,
    [string]$DllPath = ""
)

$ErrorActionPreference = "Stop"
$CLSID = "{2AB1774D-0C41-11D7-916F-0003479BEB3F}"  # JVDTLab.JVLink
$ProgId = "JVDTLab.JVLink"

function Write-Section($title) {
    Write-Host ""
    Write-Host "━━━ $title ━━━" -ForegroundColor Cyan
}

Write-Section "1. 管理者権限チェック"
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ 管理者権限で実行してください (右クリック > 管理者として実行)" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Administrator"

Write-Section "2. 32bit CLSID 登録確認"
# 32bit COM は WOW6432Node 配下に登録される
$reg32 = "HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID\$CLSID"
$reg64 = "HKLM:\SOFTWARE\Classes\CLSID\$CLSID"

$found32 = Test-Path $reg32
$found64 = Test-Path $reg64

Write-Host "  32bit (WOW6432Node): $(if ($found32) {'✅ 登録あり'} else {'❌ 未登録'})"
Write-Host "  64bit              : $(if ($found64) {'⚠️  登録あり (非推奨)'} else {'- (なし=正常)'})"

$inprocPath = ""
if ($found32) {
    $inprocKey = Join-Path $reg32 "InprocServer32"
    if (Test-Path $inprocKey) {
        $inprocPath = (Get-ItemProperty -Path $inprocKey -Name "(Default)" -ErrorAction SilentlyContinue)."(default)"
        if (-not $inprocPath) {
            $inprocPath = (Get-ItemProperty -Path $inprocKey -ErrorAction SilentlyContinue)."(default)"
        }
        Write-Host "  InprocServer32 → $inprocPath"
        if ($inprocPath -and (Test-Path $inprocPath)) {
            Write-Host "  ✅ DLL 実体 OK"
        } else {
            Write-Host "  ❌ DLL 実体が見つからない (登録だけ残っている)" -ForegroundColor Red
        }
    }
}

Write-Section "3. ProgID 逆引き"
$progPath = "HKLM:\SOFTWARE\WOW6432Node\Classes\$ProgId"
if (Test-Path $progPath) {
    Write-Host "✅ $ProgId 登録あり (32bit)"
} else {
    Write-Host "❌ $ProgId 未登録 (32bit)" -ForegroundColor Yellow
}

if (-not $Register) {
    Write-Section "診断結果"
    if ($found32 -and $inprocPath -and (Test-Path $inprocPath)) {
        Write-Host "✅ JV-Link COM は正常に登録されています。" -ForegroundColor Green
        Write-Host "   C# から x86 ビルドで Activator.CreateInstance できるはずです。"
    } else {
        Write-Host "⚠️  COM 未登録または壊れています。" -ForegroundColor Yellow
        Write-Host "   再実行: .\register-jvlink.ps1 -Register"
    }
    exit 0
}

Write-Section "4. JVLink.dll の探索"
# 既知のインストールパス候補
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
    Write-Host "❌ JVLink.dll が見つかりません" -ForegroundColor Red
    Write-Host "   候補パス:"
    $candidates | ForEach-Object { Write-Host "     - $_" }
    Write-Host ""
    Write-Host "   DLL位置を指定して再実行:"
    Write-Host "     .\register-jvlink.ps1 -Register -DllPath 'C:\パス\JVLink.dll'"
    exit 1
}
Write-Host "✅ 発見: $dll"

Write-Section "5. regsvr32 で登録 (32bit SysWOW64)"
$regsvr = "C:\Windows\SysWOW64\regsvr32.exe"
Write-Host "  > $regsvr `"$dll`""
& $regsvr /s "$dll"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ regsvr32 失敗 (exit=$LASTEXITCODE)" -ForegroundColor Red
    Write-Host "   対処: DLLのビット幅を確認 (32bit必須)。アンチウイルス一時停止も試す。"
    exit 1
}
Write-Host "✅ 登録完了"

Write-Section "6. 再確認"
$found32b = Test-Path $reg32
if ($found32b) {
    Write-Host "✅ CLSID $CLSID が WOW6432Node に登録されました" -ForegroundColor Green
    Write-Host ""
    Write-Host "次: JvLinkExporter を x86 ビルドして実行してください。"
    Write-Host "  cd windows\JvLinkExporter"
    Write-Host "  dotnet clean"
    Write-Host "  dotnet build -c Release -r win-x86"
    Write-Host "  .\bin\Release\net8.0-windows\win-x86\JvLinkExporter.exe --dummy --date=2026-04-15"
} else {
    Write-Host "⚠️  登録後も CLSID が見えない。regsvr32 のログを確認してください。" -ForegroundColor Yellow
}
