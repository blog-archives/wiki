QUARTZ := npx quartz
CONTENT := wiki
OUTPUT := public

.PHONY: help setup serve build clean lint

help:
	@echo "make setup  - install Node dependencies"
	@echo "make serve  - preview at http://localhost:8080"
	@echo "make build  - build static site into $(OUTPUT)/"
	@echo "make lint   - run the evidence check"
	@echo "make clean  - remove build output"

setup:
	npm ci

serve:
	$(QUARTZ) build --serve -d $(CONTENT)

build:
	$(QUARTZ) build -d $(CONTENT) -o $(OUTPUT)

lint:
	python3 scripts/check_evidence.py .

clean:
	rm -rf $(OUTPUT)
