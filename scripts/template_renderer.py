from pathlib import Path


def render_template_tree(template_dir: Path, output_dir: Path, replacements: dict[str, str]) -> None:
    for path in template_dir.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(template_dir)
        target = output_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        content = path.read_text()
        for key, value in replacements.items():
            content = content.replace(f"{{{{{key}}}}}", value)
        target.write_text(content)
