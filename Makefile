PYTHON ?= python3
VENV_DIR ?= .venv
VENV_PY := $(VENV_DIR)/bin/python
VENV_PIP := $(VENV_DIR)/bin/pip
VENV_UVICORN := $(VENV_DIR)/bin/uvicorn

.PHONY: setup backend frontend frontend-build frontend-preview check

setup:
	python3 -m venv $(VENV_DIR)
	$(VENV_PY) -m pip install --upgrade pip
	$(VENV_PIP) install -r requirements.txt
	cd frontend && npm install

backend:
	$(VENV_UVICORN) main:app --host 0.0.0.0 --port 9200

frontend:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

frontend-preview:
	cd frontend && npm run preview

check:
	$(VENV_PY) -m py_compile main.py
	cd frontend && npm run build
