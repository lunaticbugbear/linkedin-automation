# GitHub Secrets Setup

Configure these repository secrets before running the LinkedIn Automation workflow.

## Required Repository Secrets

| Secret | Purpose |
|---|---|
| `AI_BASE_URL` | 9Router OpenAI-compatible endpoint, for example `https://cb9vgmx.9router.com/v1` |
| `AI_API_KEY` | API key from the 9Router dashboard |
| `AI_MODEL` | 9Router model or combo name, set to `1` |
| `GH_TOKEN` | GitHub token with repo creation permission |
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

1. Start 9Router on your laptop.
2. Confirm the 9Router tunnel is active.
3. Go to the repository **Actions** tab.
4. Select the **LinkedIn Automation** workflow.
5. Click **Run workflow**.
6. Wait for the workflow to complete.
7. Verify 3 new GitHub repositories are created.
8. Verify Telegram notification arrives.
9. Verify email notification arrives.
10. Open the generated repositories and copy the approved LinkedIn post manually.

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| AI generation failure | 9Router is not running, tunnel is inactive, or `AI_API_KEY`/`AI_MODEL` is wrong | Start 9Router, confirm the tunnel URL works, and verify the AI secrets |
| GitHub repo creation failure | `GH_TOKEN` lacks repo creation permission | Use a token with repository creation permissions |
| Telegram notification failure | Wrong bot token or chat ID | Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` |
| Email notification failure | SMTP password is invalid or blocked | Use an app password and confirm SMTP access is enabled |
| Cron not running | GitHub Actions schedule delay or disabled workflow | Check the Actions tab and run the workflow manually first |
