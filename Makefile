VENV := .venv
MKDOCS := $(VENV)/bin/mkdocs

.PHONY: help setup serve serve-lan build clean lint

help:
	@echo "make setup     - create .venv and install docs deps"
	@echo "make serve     - preview at http://127.0.0.1:8000"
	@echo "make serve-lan - preview on the LAN (test on your phone)"
	@echo "make build     - build static site into site/"
	@echo "make lint      - run the evidence check"
	@echo "make clean     - remove build output"

setup:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -q --upgrade pip
	$(VENV)/bin/pip install -q -r requirements-docs.txt

serve:
	$(MKDOCS) serve

serve-lan:
	$(MKDOCS) serve --dev-addr 0.0.0.0:8000

build:
	$(MKDOCS) build

lint:
	python3 ~/.agents/skills/karpathy-llm-wiki/scripts/check_evidence.py .

clean:
	rm -rf site
