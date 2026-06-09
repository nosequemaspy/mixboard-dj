#!/usr/bin/env python3
"""
MixBoard - App DJ para Bailes de Iglesia
Ejecutar: python3 mixboard.py
"""
import subprocess
import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
VENV = ROOT / "venv"
FRONTEND_DIST = ROOT / "frontend" / "dist"


def check_venv():
    """Crea venv e instala dependencias si no existen."""
    if not VENV.exists():
        print("Primera vez: creando entorno virtual...")
        subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)

    pip = str(VENV / "bin" / "pip")
    if not (VENV / "lib").exists() or not list((VENV / "lib").rglob("fastapi")):
        print("Instalando dependencias del backend...")
        subprocess.run([pip, "install", "-r", str(BACKEND / "requirements.txt")],
                       check=True, stdout=subprocess.DEVNULL)
        print("Dependencias instaladas.")


def check_frontend():
    """Compila el frontend si no existe dist/."""
    if not FRONTEND_DIST.exists():
        frontend = ROOT / "frontend"
        if not (frontend / "node_modules").exists():
            print("Instalando dependencias del frontend...")
            subprocess.run(["npm", "install"], cwd=str(frontend), check=True,
                           stdout=subprocess.DEVNULL)
        print("Compilando frontend...")
        subprocess.run(["npm", "run", "build"], cwd=str(frontend), check=True,
                       stdout=subprocess.DEVNULL)
        print("Frontend listo.")


def main():
    os.chdir(str(BACKEND))
    check_venv()
    check_frontend()

    python = str(VENV / "bin" / "python")
    port = 8000

    print(f"""
╔══════════════════════════════════════╗
║          MixBoard DJ v1.0           ║
║     App DJ para Bailes de Iglesia    ║
╠══════════════════════════════════════╣
║                                      ║
║  Abrir en el navegador:              ║
║  http://localhost:{port}               ║
║                                      ║
║  API Docs:                           ║
║  http://localhost:{port}/docs            ║
║                                      ║
║  Presiona Ctrl+C para cerrar         ║
╚══════════════════════════════════════╝
""")

    try:
        subprocess.run(
            [python, "-m", "uvicorn", "main:app",
             "--host", "0.0.0.0", "--port", str(port)],
            cwd=str(BACKEND),
        )
    except KeyboardInterrupt:
        print("\nMixBoard cerrado.")


if __name__ == "__main__":
    main()
