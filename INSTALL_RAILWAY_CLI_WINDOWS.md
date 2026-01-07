# Install Railway CLI on Windows - Fix Execution Policy

## Problem
PowerShell is blocking script execution. Error: "running scripts is disabled on this system"

## Solution: Enable PowerShell Scripts

### Step 1: Enable Script Execution

Run PowerShell **as Administrator** (Right-click → Run as Administrator), then:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Type `Y` when prompted.

### Step 2: Verify It Works

```powershell
Get-ExecutionPolicy
```

Should show: `RemoteSigned`

### Step 3: Install Railway CLI

```powershell
npm install -g @railway/cli
```

### Step 4: Verify Installation

```powershell
railway --version
```

Should show version number like `v3.x.x`

---

## Alternative: Use Command Prompt (CMD)

If PowerShell still doesn't work, use Command Prompt instead:

1. Open **Command Prompt** (CMD) - not PowerShell
2. Run:
   ```cmd
   npm install -g @railway/cli
   ```
3. Verify:
   ```cmd
   railway --version
   ```

---

## After Installation: Configure Railway

Once Railway CLI is installed, run these commands:

```powershell
# Navigate to project
cd D:\bpa-breed-recognition

# Login
railway login

# Link to service
railway link

# Set Root Directory (CRITICAL!)
railway variables set RAILWAY_ROOT_DIRECTORY=backend/models

# Set Start Command
railway variables set RAILWAY_START_COMMAND="python pytorch_service.py"

# Verify
railway variables

# Deploy
railway up
```

---

## Troubleshooting

### Still getting execution policy error?

1. Run PowerShell as Administrator
2. Run: `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process`
3. Then install Railway CLI in the same session

### Railway command not found after installation?

1. Close and reopen PowerShell/CMD
2. Or add npm global bin to PATH manually
3. Or use full path: `C:\Users\YourName\AppData\Roaming\npm\railway.cmd`

### Permission denied?

- Make sure you're running as Administrator
- Or use `--prefix` flag: `npm install -g @railway/cli --prefix C:\Users\YourName\AppData\Roaming\npm`

