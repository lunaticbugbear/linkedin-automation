from pathlib import Path
from unittest.mock import patch, MagicMock
from scripts.generate_visual import build_banner_html, generate_project_banner


def test_build_banner_html_includes_project_details():
    project = {
        "title": "SLA Radar",
        "description": "Detect SLA risk early.",
        "key_features": ["Tracks SLA risk", "Flags urgent tickets"],
        "tech_stack": "Python, GitHub Actions, Telegram",
    }

    html = build_banner_html(project)

    assert "SLA Radar" in html
    assert "Detect SLA risk early." in html
    assert "Tracks SLA risk" in html
    assert "Python, GitHub Actions, Telegram" in html
    assert "Built by Daffa" in html


def test_generate_project_banner_writes_png_path(tmp_path):
    project = {
        "title": "SLA Radar",
        "description": "Detect SLA risk early.",
        "key_features": ["Tracks SLA risk", "Flags urgent tickets"],
        "tech_stack": "Python, GitHub Actions, Telegram",
    }

    fake_browser = MagicMock()
    fake_page = MagicMock()
    fake_context = MagicMock()
    fake_browser.new_context.return_value = fake_context
    fake_context.new_page.return_value = fake_page

    with patch("scripts.generate_visual.sync_playwright") as mock_playwright:
        mock_playwright.return_value.__enter__.return_value.chromium.launch.return_value = fake_browser

        output_path = generate_project_banner(project, str(tmp_path))

        assert output_path.endswith("sla-radar-banner.png")
        assert Path(output_path).parent == tmp_path
        fake_page.set_content.assert_called_once()
        fake_page.screenshot.assert_called_once_with(path=output_path, full_page=True)
        fake_browser.close.assert_called_once()
