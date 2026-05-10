# LinkedIn Project Automation - Design Spec

**Date:** 2026-05-10  
**Status:** Approved  
**Cycle:** Every 2 days (starting today)

---

## 1. Overview

Build an automated system that generates LinkedIn-ready project content every 2 days to help with job searching. The system:

1. Generates 3 project ideas based on your background (IT Support, PostgreSQL, Linux, DevOps)
2. Creates draft LinkedIn posts for each project
3. Notifies you via email + Telegram
4. You review, pick one, and manually post to LinkedIn

**Why this approach?** No LinkedIn API access needed, full human oversight for personal branding.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│              linkedin-automation (Main Repo)                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ .github/workflows/linkedin-cron.yml                          │   │
│  │ scripts/ (generate-ideas.py, generate-post.py, notify.py)   │   │
│  │ config/ (settings.yaml, ai-prompt.txt)                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GitHub Actions (Cron)                            │
│  Schedule: Every 2 days at 02:30 UTC (09:30 WIB/GMT+7)            │
│  Steps:                                                             │
│  1. Generate 3 project ideas using AI                               │
│  2. Create draft LinkedIn posts for each                            │
│  3. For each project: Create NEW GitHub repo                        │
│  4. Send notifications                                              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌─────────────────────┐     ┌─────────────────────┐
        │   Email Notification│     │ Telegram Notification│
        │ (SendGrid/SMTP)     │     │ (Telegram Bot API)   │
        └─────────────────────┘     └─────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                    ┌─────────────────────┐
                    │   You Review & Pick │
                    │   (3 New Repos)     │
                    └─────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────┐
                    │  Manual LinkedIn    │
                    │  Post (Copy-Paste)  │
                    └─────────────────────┘
```

**Each cycle creates 3 new GitHub repositories:**
- `project-incident-management-YYYYMMDD`
- `project-automation-YYYYMMDD`
- `project-cloud-migration-YYYYMMDD`

Each repo contains:
- Project code/scripts
- README with LinkedIn post draft
- Documentation

---

## 3. File Structure

### Main Automation Repo

```
linkedin-automation/
├── .github/
│   └── workflows/
│       └── linkedin-cron.yml          # GitHub Actions workflow
├── scripts/
│   ├── generate-ideas.py              # AI project idea generator
│   ├── generate-project-repo.py       # Creates new GitHub repos
│   ├── generate-post.py               # LinkedIn post draft generator
│   └── notify.py                      # Email + Telegram notification
├── config/
│   ├── settings.yaml                  # Cycle settings, notification prefs
│   └── ai-prompt.txt                  # AI prompt template
└── README.md
```

### Generated Project Repo Template

```
project-name-YYYYMMDD/
├── README.md                          # Project overview + LinkedIn post draft
├── src/                               # Project code/scripts
├── docs/                              # Short technical explanation
├── linkedin-post.md                   # Ready-to-copy LinkedIn post
└── .gitignore
```

---

## 4. Configuration (`config/settings.yaml`)

```yaml
cycle:
  interval: "every-2-days"
  start_date: "2026-05-10"
  time: "02:30"  # UTC time (09:30 WIB/GMT+7)

notifications:
  email:
    enabled: true
    provider: "smtp"  # or sendgrid
    from: "linkedin-automation@yourdomain.com"
    to: "your-email@gmail.com"
  telegram:
    enabled: true
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    chat_id: "${TELEGRAM_CHAT_ID}"

linkedin:
  manual_post: true  # No API - manual copy-paste
  hashtags: ["#ITSupport", "#Linux", "#Automation", "#DevOps", "#Cloud", "#JobSearch"]

github:
  create_new_repo_per_project: true
  repo_visibility: "public"
  repo_prefix: "project"

ai:
  model: "claude-sonnet-4-6"  # or gpt-4o-mini
  max_projects: 3
  tone: "professional-mix"  # technical + storytelling
```

---

## 5. AI Prompt Template (`config/ai-prompt.txt`)

```
You are a career coach for an IT Support Engineer with 3+ years of experience.

Your task: Generate project ideas and LinkedIn post drafts.

Background:
- IT Support Engineer (3+ years)
- Experience: Linux, incident management, UAT, deployment support,
  access management, log analysis, service health monitoring,
  escalation handling, infrastructure coordination
- Current goal: Job search — impress recruiters and hiring managers

Generate 3 project ideas from DIFFERENT domains each cycle. Rotate across:
- Incident management & SLA automation
- Linux server monitoring & alerting
- IT support workflow automation (ticketing, escalation)
- Cloud migration & infrastructure tooling
- Log analysis & observability
- Deployment & release management tools
- Access management & security automation
- Service health dashboards

Rules:
- Do NOT repeat the same domain two cycles in a row
- Each project must be buildable in 1-4 hours
- Mix quick wins (1 hour) and deep dives (3-4 hours)

For each project, output:
- Title (catchy but professional)
- Description (1-2 sentences)
- Tech stack (specific tools, languages, commands)
- GitHub repo name (kebab-case, descriptive)
- LinkedIn post draft (mix of technical + storytelling style):
  - Hook (relatable problem or surprising insight)
  - Technical details (what you built and how)
  - Result/impact (what it solves)
  - Call to action
  - Hashtags

Output format: JSON
```

---

## 6. Workflow Steps

### Step 1: Generate Project Ideas (`scripts/generate-ideas.py`)

**Input:** AI prompt + background info + last cycle's domains  
**Output:** 3 project idea files in `projects/`

### Step 2: Create GitHub Repositories (`scripts/generate-project-repo.py`)

For each project:
1. Create new GitHub repo: `project-{domain}-{YYYYMMDD}`
2. Initialize with README, LICENSE, .gitignore
3. Add project code/scripts
4. Add LinkedIn post draft to repo

### Step 3: Generate LinkedIn Drafts (`scripts/generate-post.py`)

**Input:** Project idea files  
**Output:** 3 draft post files in `drafts/`

### Step 4: Send Notifications

**Email:**
- Subject: "3 New LinkedIn Projects Ready for Review"
- Body: Summary of 3 projects + links to their repos

**Telegram:**
- Message: "3 new project repos ready! Review: [Repo Links]"
- Include buttons: "View Project 1", "View Project 2", "View Project 3"

### Step 5: You Review & Pick

- Review repos on GitHub
- Comment on your favorite
- Or request changes

### Step 6: Manual Posting

- Copy approved draft from repo
- Paste into LinkedIn
- Add any personal touches
- Post!

---

## 7. Setup Requirements

### GitHub Setup
1. Create a new GitHub repo: `linkedin-automation`
2. Add secrets:
   - `TELEGRAM_BOT_TOKEN` (from @BotFather)
   - `TELEGRAM_CHAT_ID` (your chat ID)
   - `SMTP_PASSWORD` (for email, if using SMTP)
   - `GITHUB_TOKEN` (for creating new repos via API)

### Telegram Setup
1. Create bot via @BotFather
2. Get your chat ID: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Add bot to your chat

### Email Setup (Optional)
1. Use SendGrid (free tier) or SMTP
2. Configure `config/settings.yaml`

---

## 8. First Run (Starting Today)

```
Today: 2026-05-10
Time: 02:30 UTC (09:30 WIB)
Action: First project generation cycle
```

You can adjust the start time in `config/settings.yaml`.

---

## 9. Future Enhancements (Phase 2)

Once you have LinkedIn API access:
- Auto-post approved drafts
- Track post performance
- Schedule posts at optimal times
- A/B test different post styles

---

## 10. Maintenance

| Task | Frequency | Time |
|------|-----------|------|
| Review PRs | Every 2 days | 5-10 min |
| Manual LinkedIn post | Every 2 days | 2-3 min |
| Check GitHub Actions logs | Weekly | 2 min |
| Update AI prompt | Monthly | 5 min |

**Total weekly overhead: ~20-30 minutes**
