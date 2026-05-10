import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from scripts.utils import load_config, setup_logging

logger = setup_logging()


def send_telegram_notification(message: str, bot_token: str, chat_id: str) -> bool:
    """Send notification via Telegram."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    data = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }

    try:
        response = requests.post(url, json=data)
        if response.status_code == 200:
            logger.info("Telegram notification sent")
            return True
        else:
            logger.error(f"Telegram error: {response.text}")
            return False
    except Exception as e:
        logger.error(f"Telegram exception: {e}")
        return False


def send_email_notification(subject: str, body: str, to_email: str, smtp_password: str) -> bool:
    """Send notification via email."""
    try:
        msg = MIMEMultipart()
        msg['From'] = "linkedin-automation@example.com"
        msg['To'] = to_email
        msg['Subject'] = subject

        msg.attach(MIMEText(body, 'html'))

        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login("linkedin-automation@example.com", smtp_password)
        server.send_message(msg)
        server.quit()

        logger.info("Email notification sent")
        return True
    except Exception as e:
        logger.error(f"Email exception: {e}")
        return False


def send_notifications(projects: list, config: dict) -> None:
    """Send notifications for generated projects."""
    if not projects:
        logger.warning("No projects to notify about")
        return

    # Format message
    message_lines = ["<b>3 New LinkedIn Projects Ready!</b>\n"]
    for i, project in enumerate(projects, 1):
        message_lines.append(f"{i}. <b>{project['title']}</b>")
        message_lines.append(f"   Repo: {project.get('repo_url', 'N/A')}")

    message = "\n".join(message_lines)

    # Send Telegram
    if config["notifications"]["telegram"]["enabled"]:
        send_telegram_notification(
            message=message,
            bot_token=config["notifications"]["telegram"]["bot_token"],
            chat_id=config["notifications"]["telegram"]["chat_id"]
        )

    # Send Email
    if config["notifications"]["email"]["enabled"]:
        send_email_notification(
            subject="3 New LinkedIn Projects Ready for Review",
            body=message,
            to_email=config["notifications"]["email"]["to"],
            smtp_password=config["notifications"]["email"].get("password", "")
        )


if __name__ == "__main__":
    config = load_config("config/settings.yaml")
    projects = [
        {"title": "Test Project 1", "repo_url": "https://github.com/user/repo1"},
        {"title": "Test Project 2", "repo_url": "https://github.com/user/repo2"},
    ]
    send_notifications(projects, config)
