QUARTZ := npx quartz
CONTENT := wiki
OUTPUT := public

.PHONY: help setup serve serve-fast build format format-check clean

help:
	@echo "make setup        - install Node dependencies"
	@echo "make serve        - preview at http://localhost:8080"
	@echo "make serve-fast   - preview without the raw/ archive (faster cold start)"
	@echo "make build        - build static site into $(OUTPUT)/"
	@echo "make format       - format wiki Markdown (pangu + layout)"
	@echo "make format-check - report Markdown formatting drift"
	@echo "make clean        - remove build output"

setup:
	npm ci

serve:
	$(QUARTZ) build --serve -d $(CONTENT)

dev:
	node scripts/serve-fast.mjs $(ARGS)

build:
	$(QUARTZ) build -d $(CONTENT) -o $(OUTPUT)

format:
	node scripts/format-markdown.mjs $(CONTENT)

format-check:
	node scripts/format-markdown.mjs $(CONTENT) --check

clean:
	rm -rf $(OUTPUT)
