from scripts.validate_generated_repo import build_validation_plan


def test_build_validation_plan_cli():
    plan = build_validation_plan("cli-python")
    assert plan == ["python -m pytest", "python -m ruff check .", "python -m mypy src", "python -m build"]
