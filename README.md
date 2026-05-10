# LinkedIn Automation

Automated LinkedIn project generation every 2 days.

## Setup

1. Clone repo
2. Create `.env` file with secrets (see `.env.example`)
3. Install dependencies: `pip install -r requirements.txt`
4. Configure `config/settings.yaml`
5. Set up GitHub secrets for Actions

## Secrets Required

- `GITHUB_TOKEN` (for creating repos)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SMTP_PASSWORD` (optional, for email)
- `ANTHROPIC_API_KEY` (for Claude)
