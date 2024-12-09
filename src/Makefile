MAKEFLAGS += -s

# Variables
REQUIREMENTS = requirements.txt
RELEASE_URL = https://index.commoncrawl.org/graphinfo.json
PREF = => |
BLUE = \033[34m
RESET = \033[0m

# Default target
.PHONY: all
all: install build update

# Install dependencies and prepare data
.PHONY: install
install:
	printf "$(PREF)Preparing data and directory structure...\n" && \
	perl prep_data.pl && \
	printf "$(PREF)Preparing TSV data...\n" && \
	perl prep_data.pl host > ../docs/host.tsv && \
	perl prep_data.pl domain > ../docs/domain.tsv
	printf "$(PREF)Installing Python dependencies...\n" && \
	pip install -q -r $(REQUIREMENTS)

# Build the webpage
.PHONY: build
build:
	printf "$(PREF)Building the web page...\n" && \
	python build_webpage.py

# Build the webpage
.PHONY: noplot
noplot:
	printf "$(PREF)Building the web page without plots...\n" && \
	python build_webpage.py --no-plots

# Update with the latest release if not already present
.PHONY: update
update:
	printf "$(PREF)Ensuring we have the latest data...\n" && \
	release=$$(curl -s $(RELEASE_URL) | jq -r '.[0].id'); \
	if ! grep -q $$release ../docs/host.tsv ../docs/domain.tsv; then \
		printf "$(PREF)New release found, updating...\n"; \
		perl fetch_new_release.pl $$release; \
	else \
		printf "$(PREF)Release $(BLUE)$$release$(RESET) is the latest, already up to date.\n"; \
	fi
