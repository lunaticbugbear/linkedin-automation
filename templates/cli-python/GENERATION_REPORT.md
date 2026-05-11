# Generation Report

Source idea: {{PROJECT_NAME}}
Project type: cli-python
Generated features:
- {{PROJECT_FUNCTION}}

Validation commands:
- python -m pytest
- python -m ruff check .
- python -m mypy src
- python -m build

Known limitations:
- This is a working MVP designed for portfolio demonstration.

How to extend:
- Add more data collectors in `src/project_package/core.py`.
- Add more CLI options in `src/project_package/cli.py`.
