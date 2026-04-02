---
name: python-dev
description: Python development conventions, environment setup, private libraries, testing, and code quality standards.
---

# Python Developer Skill

## Environment & Package Management

### Preferred toolchain priority
1. **Poetry** — for new projects with `pyproject.toml`
2. **venv + pip** — for existing or lightweight projects
3. **conda** — only for data-science/ML projects with native deps

### Setting up a new project

```bash
# Poetry (preferred)
poetry new my-project
cd my-project
poetry env use python3.11
poetry add requests pydantic

# venv fallback
python3.11 -m venv .venv
source .venv/bin/activate        # macOS/Linux
.venv\Scripts\activate           # Windows
pip install -r requirements.txt
```

### Private package registry

Internal packages are hosted on a private PyPI server.
Always check for these env vars before installing:

```bash
# ~/.config/pip/pip.conf  (global)  or  .pip.conf  (project root)
[global]
index-url = https://pypi.org/simple/
extra-index-url = https://${PRIVATE_PYPI_USER}:${PRIVATE_PYPI_TOKEN}@pypi.internal.company.com/simple/
trusted-host = pypi.internal.company.com
```

**Environment variables required:**

| Variable | Purpose |
|----------|---------|
| `PRIVATE_PYPI_URL` | Base URL of the private PyPI index |
| `PRIVATE_PYPI_USER` | Auth username |
| `PRIVATE_PYPI_TOKEN` | Auth token (never commit this) |

**Poetry equivalent:**

```toml
# pyproject.toml
[[tool.poetry.source]]
name = "private"
url = "https://pypi.internal.company.com/simple/"
priority = "supplemental"
```

```bash
poetry config http-basic.private $PRIVATE_PYPI_USER $PRIVATE_PYPI_TOKEN
```

**Installing a private package:**

```bash
pip install my-internal-lib --extra-index-url https://$PRIVATE_PYPI_USER:$PRIVATE_PYPI_TOKEN@pypi.internal.company.com/simple/
```

---

## Project Structure

```
my-project/
├── pyproject.toml          # deps, build config, tool config
├── README.md
├── .env                    # local secrets (never commit)
├── .env.example            # committed template
├── .python-version         # pinned Python version (pyenv)
│
├── src/
│   └── my_project/
│       ├── __init__.py
│       ├── main.py
│       ├── config.py       # settings via pydantic-settings
│       ├── models/
│       ├── services/
│       ├── utils/
│       └── api/
│
├── tests/
│   ├── conftest.py
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── scripts/                # one-off scripts, not part of the package
└── docs/
```

---

## Code Style & Linting

### Tools (in order of priority)

| Tool | Purpose | Config |
|------|---------|--------|
| **Ruff** | Linting + import sorting (replaces flake8/isort) | `pyproject.toml` |
| **Black** | Formatting | `pyproject.toml` |
| **mypy** | Static type checking | `pyproject.toml` |

### `pyproject.toml` config block

```toml
[tool.ruff]
line-length = 100
target-version = "py311"
select = ["E", "F", "I", "N", "UP", "ANN", "S", "B", "A", "C4", "RUF"]
ignore = ["ANN101", "ANN102"]

[tool.ruff.per-file-ignores]
"tests/*" = ["S101", "ANN"]

[tool.black]
line-length = 100
target-version = ["py311"]

[tool.mypy]
python_version = "3.11"
strict = true
ignore_missing_imports = true
```

### Pre-commit hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.4
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/psf/black
    rev: 24.4.2
    hooks:
      - id: black

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.10.0
    hooks:
      - id: mypy
        additional_dependencies: [types-requests]
```

---

## Type Hints

Always use type hints. Use `from __future__ import annotations` at the top of every file for forward-reference support.

```python
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from my_project.models import User

# Prefer built-in generics (Python 3.10+)
def process(items: list[str]) -> dict[str, int]:
    ...

# Use TypeAlias for complex types
type UserId = int                         # Python 3.12+
UserId = int                              # Python 3.11 fallback

# Pydantic for runtime validation
from pydantic import BaseModel, Field

class CreateUserRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str
    role: str = "viewer"
```

---

## Configuration / Settings

Use **pydantic-settings** for all configuration. Never `os.environ.get()` scattered across files.

```python
# src/my_project/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "my-project"
    debug: bool = False
    database_url: str
    private_pypi_url: str = ""
    private_pypi_token: str = ""
    api_key: str

# Singleton — import this everywhere
settings = Settings()
```

---

## Testing

### Framework: pytest

```bash
pytest                          # run all tests
pytest tests/unit               # unit tests only
pytest -k "test_auth"           # filter by name
pytest --cov=src --cov-report=term-missing   # coverage
pytest -x                       # stop on first failure
pytest -v --tb=short            # verbose, short traceback
```

### `conftest.py` patterns

```python
# tests/conftest.py
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture(scope="session")
def settings():
    """Override settings for tests."""
    from my_project.config import Settings
    return Settings(database_url="sqlite:///:memory:", debug=True)

@pytest.fixture
def mock_http_client():
    client = MagicMock()
    client.get = AsyncMock(return_value={"status": "ok"})
    return client
```

### Test structure

```python
# tests/unit/test_user_service.py
import pytest
from my_project.services.user import UserService

class TestCreateUser:
    def test_valid_input_creates_user(self, mock_db):
        svc = UserService(db=mock_db)
        user = svc.create(name="Alice", email="alice@example.com")
        assert user.name == "Alice"

    def test_duplicate_email_raises(self, mock_db):
        with pytest.raises(ValueError, match="already exists"):
            ...

    @pytest.mark.asyncio
    async def test_async_operation(self):
        ...
```

---

## Async Patterns

```python
import asyncio
from contextlib import asynccontextmanager

import httpx

# Prefer httpx over requests for async
async def fetch_data(url: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()

# asynccontextmanager for resource management
@asynccontextmanager
async def managed_session():
    session = await create_session()
    try:
        yield session
    finally:
        await session.close()
```

---

## Logging

```python
import logging
import structlog  # preferred over standard logging

log = structlog.get_logger(__name__)

# Usage
log.info("user_created", user_id=user.id, email=user.email)
log.error("payment_failed", order_id=order.id, error=str(e))
```

Standard logging fallback:

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
```

---

## Error Handling

```python
# Define domain errors in a central place
class AppError(Exception):
    """Base error for this application."""

class NotFoundError(AppError):
    def __init__(self, resource: str, id: int | str) -> None:
        super().__init__(f"{resource} with id={id!r} not found")

class ValidationError(AppError):
    ...

# Use specific catches — never bare except
try:
    user = get_user(user_id)
except NotFoundError:
    return Response(status=404)
except AppError as e:
    log.error("app_error", error=str(e))
    return Response(status=500)
```

---

## Common Libraries

| Need | Library |
|------|---------|
| HTTP client (sync) | `requests` |
| HTTP client (async) | `httpx` |
| Data validation | `pydantic` v2 |
| Settings management | `pydantic-settings` |
| CLI | `typer` |
| Web API | `FastAPI` + `uvicorn` |
| ORM | `SQLAlchemy` 2.0 (async) |
| Migrations | `alembic` |
| Task queue | `celery` + `redis` |
| Structured logging | `structlog` |
| Date/time | `pendulum` or `arrow` |
| Testing | `pytest` + `pytest-asyncio` + `pytest-cov` |
| Mocking | `pytest-mock` + `respx` (for httpx) |
| Env management | `python-dotenv` |

---

## Agent Instructions

When working on Python tasks:

1. **Always check** for an existing `.venv`, `poetry.lock`, or `requirements.txt` before suggesting installs.
2. **Never hardcode** secrets — use `.env` + `pydantic-settings`.
3. **Run linting** after edits: `ruff check --fix . && black .`
4. **Run type-check** after edits: `mypy src/`
5. **Check for private packages** — if `PRIVATE_PYPI_URL` is set, add it to install commands.
6. **Prefer** `src/` layout over flat layout.
7. **Always add** type hints to new functions and classes.
8. **Tests** go in `tests/` mirroring `src/` structure. New code = new tests.
9. **Pin Python version** in `.python-version` and `pyproject.toml`.
10. When fixing a bug, add a regression test that would have caught it.
