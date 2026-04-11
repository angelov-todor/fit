# Firebase Hosting Deploy Setup

The app is deployed to **https://fit-file-viewer.web.app** via Firebase Hosting.

## Manual Deploy

```bash
npm run build
npx firebase deploy --only hosting
```

## GitHub Actions (Auto Deploy)

A workflow at `.github/workflows/deploy.yml` auto-deploys on every push to `main`.

### One-time setup: create a service account secret

Run in PowerShell:

```powershell
# 1. Create service account
gcloud iam service-accounts create github-actions `
  --display-name "GitHub Actions Deploy" `
  --project fit-file-viewer

# 2. Grant Firebase Hosting deploy permission
gcloud projects add-iam-policy-binding fit-file-viewer `
  --member "serviceAccount:github-actions@fit-file-viewer.iam.gserviceaccount.com" `
  --role "roles/firebasehosting.admin"

# 3. Generate JSON key
gcloud iam service-accounts keys create firebase-sa-key.json `
  --iam-account github-actions@fit-file-viewer.iam.gserviceaccount.com

# 4. Add to GitHub as a secret
gh secret set FIREBASE_SERVICE_ACCOUNT < firebase-sa-key.json

# 5. Delete the local key file
rm firebase-sa-key.json
```

Alternatively for step 4, go to **GitHub repo > Settings > Secrets and variables > Actions > New repository secret**, name it `FIREBASE_SERVICE_ACCOUNT`, and paste the JSON key contents.
