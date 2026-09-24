# CLAUDE.md — Instrucciones para Claude Code

## Deploy

Siempre que se terminen cambios, hacer commit, push y deploy a fly.io:

```bash
git add <archivos> && git commit -m "mensaje" && git push origin main
flyctl deploy
```

No dejar cambios sin subir. El usuario espera que todo quede disponible en produccion.

## Stack

- Backend: Python/FastAPI + SQLAlchemy (SQLite en prod con volumen)
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Deploy: fly.io (app: mixboard-dj)
- URL: https://mixboard-dj.fly.dev/

## Build check

Antes de deploy, verificar que compila:

```bash
cd frontend && npx tsc -b && npx vite build
```

Nota: `tsc -b` es mas estricto que `tsc --noEmit` (detecta imports no usados). Usar siempre `tsc -b`.
