SHELL := /bin/bash
export PATH := $(HOME)/.local/share/fnm:$(PATH)

# Node n'est pas sur le PATH en shell non interactif : on passe par fnm.
FNM = eval "$$(fnm env)" && fnm use --silent-if-unchanged &&

.DEFAULT_GOAL := help
.PHONY: help install dev build verify-pwa preview lint typecheck test clean

help: ## Liste les cibles
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

install: ## Installe Node (.node-version) et les dépendances
	@eval "$$(fnm env)" && fnm install && fnm use --silent-if-unchanged && \
	if [ -f package-lock.json ]; then npm ci; else npm install; fi

dev: ## Serveur de dev sur http://127.0.0.1:8888
	@echo "Note : si la PWA a été installée via make preview, désinscris le service worker (DevTools > Application > Service workers) sinon l'ancien build est servi."
	@$(FNM) npm run dev

build: ## Build de production (tsc + vite)
	@$(FNM) npm run build

verify-pwa: ## Vérifie manifest, sw.js et icônes dans dist/ (après make build)
	@bash scripts/verify-pwa.sh

preview: ## Sert le build sur http://127.0.0.1:8888
	@$(FNM) npm run preview

lint: ## Lint (oxlint)
	@$(FNM) npm run lint

typecheck: ## Vérification des types
	@$(FNM) npx tsc -b

test: ## Tests (vitest, un seul passage)
	@$(FNM) npx vitest run

clean: ## Supprime dist/, node_modules/.vite et coverage/
	rm -rf dist node_modules/.vite coverage
