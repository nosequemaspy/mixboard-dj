#!/bin/bash
set -e

export FLYCTL_INSTALL="/home/vicente/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

echo ""
echo "========================================="
echo "  MixBoard DJ - Deploy a Fly.io"
echo "========================================="
echo ""

# Step 1: Check auth
echo "[1/4] Verificando autenticacion..."
if ! flyctl auth whoami 2>/dev/null; then
    echo ""
    echo "  Necesitas iniciar sesion. Se abrira el navegador."
    echo "  Usa 'Sign up with GitHub' si no tienes cuenta."
    echo ""
    flyctl auth login
fi
echo ""
echo "  Autenticado como: $(flyctl auth whoami)"
echo ""

# Step 2: Launch app
echo "[2/4] Creando app en Fly.io..."
cd /home/vicente/claude-proyectos/api_musica_jovenes

if flyctl apps list 2>/dev/null | grep -q "mixboard"; then
    echo "  App ya existe, continuando..."
    APP_NAME=$(flyctl apps list 2>/dev/null | grep mixboard | awk '{print $1}')
else
    flyctl launch --no-deploy --copy-config --yes
    APP_NAME=$(grep '^app' fly.toml | cut -d'"' -f2)
fi
echo "  App: $APP_NAME"
echo ""

# Step 3: Create volume
echo "[3/4] Creando volumen para almacenamiento..."
if flyctl volumes list 2>/dev/null | grep -q "mixboard_data"; then
    echo "  Volumen ya existe, continuando..."
else
    flyctl volumes create mixboard_data --region mia --size 10 --yes
fi
echo ""

# Step 4: Deploy
echo "[4/4] Desplegando (esto tarda unos minutos)..."
echo ""
flyctl deploy

echo ""
echo "========================================="
echo "  DEPLOY COMPLETADO"
echo "========================================="
echo ""
APP_URL=$(flyctl info 2>/dev/null | grep "Hostname" | awk '{print $2}' || echo "$APP_NAME.fly.dev")
echo "  Tu app esta en: https://$APP_NAME.fly.dev"
echo ""
echo "  Comparte esa URL para que otros vean"
echo "  las sesiones y dejen sugerencias."
echo ""
echo "  Comandos utiles:"
echo "    fly logs        - ver logs"
echo "    fly status      - estado de la app"
echo "    fly deploy      - re-deploy con cambios"
echo "    fly open        - abrir en el navegador"
echo "========================================="
echo ""
flyctl open
