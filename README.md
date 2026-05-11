# LinkedIn Automation

Automated LinkedIn project generation every 2 days.

## Setup

1. Clone repo.
2. Create `.env` file with secrets (see `.env.example`).
3. Install dependencies: `pip install -r requirements.txt`.
4. Configure `config/settings.yaml`.
5. Set up GitHub secrets for Actions.

## Secrets Required

- `AI_BASE_URL` (9Router endpoint, for example `https://cb9vgmx.9router.com/v1`)
- `AI_API_KEY` (from 9Router dashboard)
- `AI_MODEL` (set to `1`)
- `GH_TOKEN` (for creating repos)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

The automation is Telegram-only. Email notifications are no longer used.

## Scheduled Run

- Main automation: every 2 days at 09:00 WIB / 02:00 UTC.
- Telegram reminder: every 2 days at 08:50 WIB / 01:50 UTC.

Before the scheduled run, keep your laptop on, start 9Router, and confirm the tunnel is active.
