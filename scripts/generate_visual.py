import html
import os
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None


def _slugify(value: str) -> str:
    slug = value.lower().replace(" ", "-")
    return "".join(char for char in slug if char.isalnum() or char == "-").strip("-")


def build_banner_html(project: dict) -> str:
    features = "".join(f"<li>{html.escape(feature)}</li>" for feature in project.get("key_features", []))
    return f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      width: 1200px;
      height: 627px;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0ea5e9 100%);
      color: #f8fafc;
    }}
    .card {{
      width: 1200px;
      height: 627px;
      padding: 64px 72px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }}
    .eyebrow {{
      color: #7dd3fc;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
    }}
    h1 {{
      margin: 18px 0 18px;
      font-size: 76px;
      line-height: 0.95;
      max-width: 960px;
    }}
    .description {{
      font-size: 30px;
      line-height: 1.35;
      color: #dbeafe;
      max-width: 900px;
    }}
    ul {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      padding: 0;
      margin: 36px 0 0;
      list-style: none;
    }}
    li {{
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 22px;
      padding: 22px;
      background: rgba(15,23,42,0.45);
      font-size: 24px;
      line-height: 1.25;
      min-height: 112px;
    }}
    .footer {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 24px;
      color: #bae6fd;
      border-top: 1px solid rgba(255,255,255,0.18);
      padding-top: 26px;
    }}
  </style>
</head>
<body>
  <main class="card">
    <section>
      <div class="eyebrow">IT Support Automation Project</div>
      <h1>{html.escape(project['title'])}</h1>
      <div class="description">{html.escape(project['description'])}</div>
      <ul>{features}</ul>
    </section>
    <section class="footer">
      <div>{html.escape(project.get('tech_stack', 'Python • Automation • Operations'))}</div>
      <div>Built by Daffa</div>
    </section>
  </main>
</body>
</html>
"""


def generate_project_banner(project: dict, output_dir: str) -> str:
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    output_path = os.path.join(output_dir, f"{_slugify(project['title'])}-banner.png")
    banner_html = build_banner_html(project)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 1200, "height": 627}, device_scale_factor=1)
        page = context.new_page()
        page.set_content(banner_html)
        page.screenshot(path=output_path, full_page=True)
        browser.close()

    return output_path
