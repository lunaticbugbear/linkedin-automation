# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

## What it does

{{PROJECT_FUNCTION}}

## Install

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]
```

## Run

```powershell
{{CLI_COMMAND}} --help
{{CLI_COMMAND}}
```

## Test

```powershell
python -m pytest
python -m ruff check .
python -m mypy src
python -m build
```
