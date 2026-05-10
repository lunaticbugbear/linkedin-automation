import pytest
from unittest.mock import patch, MagicMock
from scripts.notify import send_telegram_notification, send_email_notification


def test_send_telegram_notification_calls_api():
    with patch('requests.post') as mock_post:
        mock_post.return_value.status_code = 200

        result = send_telegram_notification(
            message="Test message",
            bot_token="fake-token",
            chat_id="123456"
        )

        assert result is True
        mock_post.assert_called_once()


def test_send_email_notification_returns_true():
    with patch('smtplib.SMTP') as mock_smtp:
        mock_instance = MagicMock()
        mock_smtp.return_value = mock_instance

        result = send_email_notification(
            subject="Test",
            body="Test body",
            to_email="test@example.com",
            smtp_password="fake"
        )

        assert result is True
