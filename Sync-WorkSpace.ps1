Param(
  [string]$Branch = "main",
  [string]$Message,
  [switch]$Backup,
  [switch]$SkipPull,
  [switch]$VerboseLog
)

# Stop on errors
$ErrorActionPreference = "Stop"

function Log {
  param([string]$Text)
  if ($VerboseLog) {
    Write-Host "[LOG] $Text" -ForegroundColor Cyan
  }
}

Write-Host "=== Sync script started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

# 1. Ensure git repo
if (-not (Test-Path ".git")) {
  Write-Host "Git repository not found. Initializing..."
  git init | Out-Null
  git branch -M $Branch
}

# 2. Ensure remote 'origin'
if (-not (git remote 2>$null | Select-String -SimpleMatch "origin")) {
  throw "Remote 'origin' is not set. Run: git remote add origin <repo-url>"
}

# 3. Checkout or create branch
try {
  git checkout $Branch 2>$null | Out-Null
} catch {
  Write-Host "Branch '$Branch' not found locally. Creating..."
  git checkout -b $Branch | Out-Null
}

# 4. Optional backup (only if remote branch already exists)
if ($Backup) {
  try {
    git ls-remote --exit-code origin "refs/heads/$Branch" 2>$null | Out-Null
    $today = Get-Date -Format 'yyyyMMdd'
    $stampFile = ".last-backup-stamp"
    $needBackup = $true
    if (Test-Path $stampFile) {
      $prev = (Get-Content $stampFile -Raw).Trim()
      if ($prev -eq $today) { $needBackup = $false }
    }
    if ($needBackup) {
      $backupBranch = "backup/auto-$Branch-$today"
      Write-Host "Creating backup branch on remote: $backupBranch"
      git push origin "$Branch`:$backupBranch" | Out-Null
      Set-Content -Path $stampFile -Value $today -Encoding utf8
      git add $stampFile
      git commit -m "chore: record backup stamp $today" 2>$null | Out-Null
    } else {
      Log "Backup already made today."
    }
  } catch {
    Log "Remote branch '$Branch' not found yet. Skipping backup."
  }
}

# 5. Ensure .gitignore exists (optional)
if (-not (Test-Path ".gitignore")) {
@"
node_modules/
dist/
build/
.env
.DS_Store
*.log
"@ | Out-File .gitignore -Encoding utf8
  git add .gitignore
  git commit -m "chore: add .gitignore" 2>$null | Out-Null
}

# 6. Stage changes
git add -A

# 7. Commit if there are staged changes
$hasChanges = $true
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { $hasChanges = $false }

if ($hasChanges) {
  if (-not $Message) {
    $Message = "chore: sync $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  }
  git commit -m $Message | Out-Null
  Write-Host "Created commit: $Message"
} else {
  Write-Host "No changes to commit."
}

# 8. Pull --rebase (unless skipped) only if remote branch exists
if (-not $SkipPull) {
  try {
    git fetch origin 2>$null | Out-Null
    git ls-remote --exit-code origin "refs/heads/$Branch" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Rebasing on origin/$Branch..."
      git pull --rebase origin $Branch
    } else {
      Log "origin/$Branch does not exist yet. Skipping pull."
    }
  } catch {
    Write-Warning "Pull --rebase failed: $($_.Exception.Message)"
    Write-Host "Resolve manually if needed, then push."
  }
} else {
  Log "SkipPull requested. Skipping pull."
}

# 9. Push
Write-Host "Pushing to origin/$Branch..."
try {
  git push origin $Branch
  Write-Host "Push completed."
} catch {
  Write-Warning "Normal push failed. If you really want to overwrite history run:"
  Write-Host "git push --force origin $Branch"
  exit 1
}

Write-Host "=== Sync script finished successfully ==="
exit 0