# 建置並發布到 GitHub Pages（gh-pages 分支）
# 用法：在 omr 資料夾執行  powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
$ErrorActionPreference = 'Stop'
$env:Path = "C:\Program Files\nodejs;" + $env:Path
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

npm test
if ($LASTEXITCODE -ne 0) { throw '測試未通過，停止發布' }
npm run build
if ($LASTEXITCODE -ne 0) { throw '建置失敗' }

$remote = git remote get-url origin
$rev = git rev-parse --short HEAD
$tmp = Join-Path $env:TEMP "omr-ghpages-$(Get-Random)"
Copy-Item -Recurse dist $tmp
New-Item -ItemType File (Join-Path $tmp '.nojekyll') | Out-Null
Push-Location $tmp
git init -q -b gh-pages
git config user.name 'Maxwelivin'
git config user.email '170487022+Maxwelivin@users.noreply.github.com'
git add -A
git commit -q -m "deploy $rev"
git push -f $remote gh-pages
Pop-Location
Remove-Item -Recurse -Force $tmp
Write-Host "已發布：https://maxwelivin.github.io/examfactory-omr/"
