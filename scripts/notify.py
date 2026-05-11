import html
import time
from typing import Optional
import requests
from scripts.utils import setup_logging

logger = setup_logging()


def _telegram_url(bot_token: str, method: str) -> str:
    return f"https://api.telegram.org/bot{bot_token}/{method}"


def send_telegram_notification(message: str, bot_token: str, chat_id: str) -> bool:
    response = requests.post(
        _telegram_url(bot_token, "sendMessage"),
        json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
        timeout=30,
    )
    if response.status_code == 200:
        logger.info("Telegram notification sent")
        return True
    logger.error(f"Telegram error: {response.text}")
    return False


def send_project_options(ideas: list, bot_token: str, chat_id: str) -> int:
    lines = ["<b>Pilih project LinkedIn hari ini:</b>\n"]
    for index, idea in enumerate(ideas, 1):
        lines.append(f"{index}. <b>{html.escape(idea['title'])}</b>")
        lines.append(f"   Fungsi: {html.escape(idea['function'])}")
        lines.append(f"   Kegunaan: {html.escape(idea['use_case'])}\n")

    response = requests.post(
        _telegram_url(bot_token, "sendMessage"),
        json={
            "chat_id": chat_id,
            "text": "\n".join(lines),
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [
                    [
                        {"text": "Pilih 1", "callback_data": "project:0"},
                        {"text": "Pilih 2", "callback_data": "project:1"},
                        {"text": "Pilih 3", "callback_data": "project:2"},
                    ],
                    [
                        {"text": "Ganti Semua", "callback_data": "regenerate_all"},
                    ]
                ]
            },
        },
        timeout=30,
    )
    if response.status_code != 200:
        logger.error(f"Telegram options error: {response.text}")
        raise RuntimeError(f"Telegram options error: {response.status_code}")
    return response.json()["result"]["message_id"]


def wait_for_project_selection(bot_token: str, chat_id: str, message_id: int, timeout_seconds: int) -> Optional[dict]:
    deadline = time.monotonic() + timeout_seconds
    offset = None

    while time.monotonic() < deadline:
        params = {"timeout": 10}
        if offset is not None:
            params["offset"] = offset

        try:
            response = requests.get(_telegram_url(bot_token, "getUpdates"), params=params, timeout=15)
        except requests.exceptions.ConnectionError as e:
            logger.warning(f"Telegram connection reset, retrying: {e}")
            time.sleep(3)
            continue
        if response.status_code != 200:
            logger.error(f"Telegram polling error: {response.text}")
            time.sleep(3)
            continue

        for update in response.json().get("result", []):
            offset = update["update_id"] + 1
            callback = update.get("callback_query")
            if not callback:
                continue

            message = callback.get("message", {})
            selected_chat_id = str(message.get("chat", {}).get("id"))
            selected_message_id = message.get("message_id")
            data = callback.get("data", "")

            if selected_chat_id == str(chat_id) and selected_message_id == message_id and data.startswith("project:"):
                return {
                    "index": int(data.split(":", 1)[1]),
                    "callback_query_id": callback["id"],
                }

    return None


def answer_callback_query(bot_token: str, callback_query_id: str, text: str) -> bool:
    response = requests.post(
        _telegram_url(bot_token, "answerCallbackQuery"),
        json={"callback_query_id": callback_query_id, "text": text},
        timeout=30,
    )
    if response.status_code == 200:
        return True
    logger.error(f"Telegram callback answer error: {response.text}")
    return False


def send_final_project(project: dict, image_path: str, bot_token: str, chat_id: str) -> bool:
    message = (
        "<b>Project dibuat!</b>\n\n"
        f"Repo: {html.escape(project['repo_url'])}\n\n"
        "<b>--- LinkedIn Post ---</b>\n"
        f"{html.escape(project['linkedin_post'])}"
    )
    text_ok = send_telegram_notification(message, bot_token, chat_id)

    with open(image_path, "rb") as image_file:
        response = requests.post(
            _telegram_url(bot_token, "sendPhoto"),
            data={"chat_id": chat_id},
            files={"photo": image_file},
            timeout=60,
        )

    if response.status_code != 200:
        logger.error(f"Telegram photo error: {response.text}")
        return False
    return text_ok
