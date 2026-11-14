param(
    [switch]$SkipPublish
)
$ErrorActionPreference = 'Stop'
. "C:\BuildToolset\setenv.ps1"

$RepoDir = "C:\ai\KIDS_Photo"
$GhWrapper = "C:\ai\JUMPGATE\scripts\with-github.ps1"
$VcFile = "C:\BuildToolset\signing\version-codes.json"

# 1. Auto-increment versionCode (>= 215)
$vcObj = if (Test-Path $VcFile) { Get-Content $VcFile -Raw | ConvertFrom-Json } else { [pscustomobject]@{ SplitTesla = 135; KIDS_Photo = 214; ObsidianSync = 100 } }
$nextVc = [Math]::Max([int]$vcObj.KIDS_Photo + 1, 215)
$vcObj.KIDS_Photo = $nextVc
[IO.File]::WriteAllText($VcFile, ($vcObj | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$env:KIDSPHOTO_VERSION_CODE = "$nextVc"
$versionName = "1.1.$nextVc"

Write-Host "[KIDS_Photo] Building release APK on local PC (versionName=$versionName, versionCode=$nextVc)..." -ForegroundColor Cyan
Push-Location $RepoDir
try {
    & npm.cmd run lint
    if ($LASTEXITCODE -ne 0) { throw "KIDS_Photo npm run lint failed" }

    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "KIDS_Photo npm run build failed" }

    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw "KIDS_Photo npx cap sync android failed" }

    Push-Location "$RepoDir\android"
    try {
        & "$RepoDir\android\gradlew.bat" assembleRelease --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "KIDS_Photo assembleRelease failed" }
    } finally {
        Pop-Location
    }

    $apkPath = "$RepoDir\android\app\build\outputs\apk\release\app-release.apk"
    if (-not (Test-Path $apkPath)) { throw "Release APK not found: $apkPath" }

    $apksigner = "C:\BuildToolset\sdk\build-tools\35.0.0\apksigner.bat"
    & $apksigner verify --print-certs $apkPath
    if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed" }

    $sha256 = (Get-FileHash -Path $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $commit = (& git rev-parse HEAD).Trim()
    $subject = (& git log -1 --format=%s).Trim()

    $stageDir = "C:\BuildToolset\tmp\kidsphoto-release"
    New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
    $latestApk = Join-Path $stageDir "KIDS_Photo.apk"
    Copy-Item $apkPath $latestApk -Force
    $apkSize = (Get-Item $latestApk).Length
    $publishedIso = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
    $latestMetaObj = [ordered]@{
        versionCode = $nextVc
        versionName = $versionName
        tag         = "v$versionName"
        apkName     = "KIDS_Photo.apk"
        downloadUrl = "https://github.com/bluewind201/KIDS_Photo/releases/download/latest-apk/KIDS_Photo.apk"
        sha256      = $sha256
        size        = $apkSize
        publishedAt = $publishedIso
        notes       = $subject
    }
    $latestJsonFile = Join-Path $stageDir "latest.json"
    [IO.File]::WriteAllText($latestJsonFile, ($latestMetaObj | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))

    if (-not $SkipPublish) {
        Write-Host "[KIDS_Photo] Publishing KIDS_Photo.apk + latest.json to GitHub Releases..." -ForegroundColor Green
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        & $GhWrapper release view latest-apk --repo bluewind201/KIDS_Photo *> $null
        $latestExists = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = $prevEap
        if ($latestExists) {
            & $GhWrapper release upload latest-apk $latestApk $latestJsonFile --clobber --repo bluewind201/KIDS_Photo
            & $GhWrapper release edit latest-apk --prerelease --title "KIDS_Photo 최신 APK (v$versionName)" --notes "로컬 PC 고정 서명 빌드`n버전 v$versionName (versionCode $nextVc), 커밋 $($commit.Substring(0,7))`nSHA-256: $sha256`n앱 내부 자동 업데이트 또는 덮어쓰기 설치를 지원합니다." --repo bluewind201/KIDS_Photo
        } else {
            & $GhWrapper release create latest-apk $latestApk $latestJsonFile --prerelease --title "KIDS_Photo 최신 APK (v$versionName)" --notes "로컬 PC 고정 서명 빌드`n버전 v$versionName (versionCode $nextVc), 커밋 $($commit.Substring(0,7))`nSHA-256: $sha256" --repo bluewind201/KIDS_Photo
        }

        $vTag = "v$versionName"
        $ErrorActionPreference = "Continue"
        & $GhWrapper release view $vTag --repo bluewind201/KIDS_Photo *> $null
        $vTagExists = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = $prevEap
        if ($vTagExists) {
            & $GhWrapper release upload $vTag $latestApk $latestJsonFile --clobber --repo bluewind201/KIDS_Photo
        } else {
            & $GhWrapper release create $vTag $latestApk $latestJsonFile --latest --title "KIDS_Photo $vTag" --notes "$subject`n`n- 버전: $vTag (versionCode $nextVc, 로컬 PC 고정 서명)`n- 커밋: $($commit.Substring(0,7))`n- SHA-256: ``$sha256``" --repo bluewind201/KIDS_Photo
        }
        Write-Host "[KIDS_Photo] Release publish complete: v$versionName (versionCode $nextVc, sha256=$sha256)" -ForegroundColor Green
    }
} finally {
    Pop-Location
}
