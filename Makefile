QUARTZ := npx quartz
CONTENT := wiki
OUTPUT := public

.PHONY: help setup serve build clean

help:
	@echo "make setup  - install Node dependencies"
	@echo "make serve  - preview at http://localhost:8080"
	@echo "make build  - build static site into $(OUTPUT)/"
	@echo "make clean  - remove build output"

setup:
	npm ci

serve:
	$(QUARTZ) build --serve -d $(CONTENT)

build:
	$(QUARTZ) build -d $(CONTENT) -o $(OUTPUT)

clean:
	rm -rf $(OUTPUT)
