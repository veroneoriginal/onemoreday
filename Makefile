# Образы собираются из docker/Dockerfile. Контекст — корень репозитория.
# В файле три цели: backend, frontend, nginx. Каждая цель — отдельный образ.
# make up только запускает контейнеры и сам ничего не собирает.

COMPOSE := docker compose -f docker/docker_compose.yaml

.DEFAULT_GOAL := steps

.PHONY: steps start backend frontend nginx up down

steps:
	@echo "make start       собрать три образа и поднять контейнеры"
	@echo "make backend     образ onemoreday-backend из цели backend"
	@echo "make frontend    образ onemoreday-frontend из цели frontend"
	@echo "make nginx       образ onemoreday-nginx из цели nginx"
	@echo "make up          поднять три контейнера из уже собранных образов"
	@echo "make down        остановить контейнеры"

start: backend frontend nginx up

backend:
	docker build -f docker/Dockerfile --target backend -t onemoreday-backend .

frontend:
	docker build -f docker/Dockerfile --target frontend -t onemoreday-frontend .

nginx:
	docker build -f docker/Dockerfile --target nginx -t onemoreday-nginx .

up:
	$(COMPOSE) up -d --no-build

down:
	$(COMPOSE) down
