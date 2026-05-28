.PHONY: help up down build dev logs reset-db shell-backend shell-db

help:
	@echo "Mis Finanzas V2 — Comandos disponibles"
	@echo
	@echo "  make up          Levantar servicios"
	@echo "  make down        Detener servicios"
	@echo "  make build       Reconstruir y levantar"
	@echo "  make dev         Modo desarrollo con hot-reload"
	@echo "  make logs        Logs en vivo"
	@echo "  make reset-db    Destruir y recrear desde cero"
	@echo "  make shell-backend   Shell bash en backend"
	@echo "  make shell-db    Shell psql en postgres"

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose up --build -d

dev:
	docker compose up --build

logs:
	docker compose logs -f

reset-db:
	docker compose down -v
	docker compose up -d --build

shell-backend:
	docker compose exec backend bash

shell-db:
	docker compose exec postgres psql -U finanzas -d finanzas
