from scripts.template_renderer import render_template_tree


def test_render_template_tree_replaces_placeholders(tmp_path):
    template_dir = tmp_path / "template"
    template_dir.mkdir()
    (template_dir / "README.md").write_text("# {{PROJECT_NAME}}\n{{PROJECT_DESCRIPTION}}")

    output_dir = tmp_path / "output"
    render_template_tree(template_dir, output_dir, {"PROJECT_NAME": "Demo", "PROJECT_DESCRIPTION": "Hello"})

    assert (output_dir / "README.md").read_text() == "# Demo\nHello"
