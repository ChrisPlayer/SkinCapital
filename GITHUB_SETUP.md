# Setup GitHub Repository

Since the GitHub CLI (`gh`) is not installed on your system, you need to create the repository manually on GitHub.

## Steps

1. Go to [https://github.com/new](https://github.com/new)
2. Repository name: `cs2-inventory-tracker`
3. Visibility: **Private**
4. Click **Create repository**

## Push existing code

Once created, run these commands in your terminal (already open in the correct folder):

```bash
git remote add origin https://github.com/YOUR_USERNAME/cs2-inventory-tracker.git
git branch -M main
git push -u origin main
```

> **Note**: You will be asked for your GitHub username and a Personal Access Token (password).

## Alternative: Install GitHub CLI

If you prefer using the CLI, install it first:

```powershell
winget install GitHub.cli
# Then restart terminal and run:
gh auth login
gh repo create cs2-inventory-tracker --private --source=. --remote=origin --push
```
