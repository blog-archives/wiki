QUARTZ := npx quartz
CONTENT := wiki
OUTPUT := public

.PHONY: help setup serve build format format-check clean

help:
	@echo "make setup        - install Node dependencies"
	@echo "make serve        - preview at http://localhost:8080"
	@echo "make build        - build static site into $(OUTPUT)/"
	@echo "make format       - format wiki Markdown (pangu + layout)"
	@echo "make format-check - report Markdown formatting drift"
	@echo "make clean        - remove build output"

setup:
	npm ci

serve:
	$(QUARTZ) build --serve -d $(CONTENT)

build:
	$(QUARTZ) build -d $(CONTENT) -o $(OUTPUT)

format:
	node scripts/format-markdown.mjs $(CONTENT)

format-check:
	node scripts/format-markdown.mjs $(CONTENT) --check

clean:
	rm -rf $(OUTPUT)
