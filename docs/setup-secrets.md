# GitHub Secrets Setup

Configure these repository secrets before running the LinkedIn Automation workflow.

## Required Repository Secrets

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for project generation |
| `GITHUB_TOKEN` | GitHub token with repo creation permission |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Telegram chat ID to receive notifications |
| `EMAIL_TO` | Email address to receive notifications |
| `SMTP_PASSWORD` | SMTP password or app password for email notifications |

## Add Secrets in GitHub

1. Open the `linkedin-automation` repository on GitHub.
2. Go to **Settings**.
3. Go to **Secrets and variables**.
4. Select **Actions**.
5. Click **New repository secret**.
6. Add each secret from the table above.
7. Save each secret.

## Manual Workflow Test

1. Go to the repository **Actions** tab.
2. Select the **LinkedIn Automation** workflow.
3. Click **Run workflow**.
4. Wait for the workflow to complete.
5. Verify 3 new GitHub repositories are created.
6. Verify Telegram notification arrives.
7. Verify email notification arrives.
8. Open the generated repositories and copy the approved LinkedIn post manually.

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Claude API failure | Missing or invalid `ANTHROPIC_API_KEY` | Recreate the secret and confirm the API key is active |
| GitHub repo creation failure | `GITHUB_TOKEN` lacks repo creation permission | Use a token with repository creation permissions |
| Telegram notification failure | Wrong bot token or chat ID | Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` |
| Email notification failure | SMTP password is invalid or blocked | Use an app password and confirm SMTP access is enabled |
| Cron not running | GitHub Actions schedule delay or disabled workflow | Check the Actions tab and run the workflow manually first |
