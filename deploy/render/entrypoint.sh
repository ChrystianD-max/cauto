#!/bin/sh
# C-AUTO - point d'entre du conteneur Render unique (nginx + node).
# Structure : /app = backend (src/scripts/seed/node_modules), /app/www = frontend statique, /db = migrations.
set -e
LISTEN_PORT="${PORT:-10000}"

# Supprime le vhost 404 par defaut d'Alpine (ecoute sur :80) pour n'appliquer
# que notre config generee ci-dessous.
rm -f /etc/nginx/http.d/default.conf

# Genere la config nginx pour le port d'ecoute web courant ($PORT de Render).
cat > /etc/nginx/http.d/default.conf <<EOF
server {
    listen ${LISTEN_PORT};
    server_name _;
    root /app/www;
    index index.html;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_types text/plain text/css application/javascript application/json text/xml image/svg+xml font/woff2;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location /health {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host \$host;
    }

    location /app/ {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files \$uri \$uri/ /app/index.html;
    }
    location ~* ^/app/(sw\.js|pwa\.js|manifest\.json)\$ {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files \$uri =404;
    }
    location ~* ^/app/.*\.(js|css|woff2?|ttf|otf|svg|png|jpe?g|gif|webp|ico|webmanifest)\$ {
        add_header Cache-Control "public, max-age=604800, immutable";
        try_files \$uri =404;
    }

    location / {
        add_header Cache-Control "no-cache, must-revalidate";
        try_files \$uri \$uri/ /index.html;
    }
    location ~* \.(js|css|woff2?|ttf|otf|svg|png|jpe?g|gif|webp|ico)\$ {
        add_header Cache-Control "public, max-age=604800";
        try_files \$uri =404;
    }
}
EOF

echo "[entrypoint] Demarrage du backend node sur :4000 (PORT web = ${LISTEN_PORT})"
PORT=4000 node /app/src/server.js &
NODE_PID=$!
# NOTE : $PORT (Render) reste reserve a nginx. Le backend est force sur 4000
# interne, nginx proxye /api vers 127.0.0.1:4000.

echo "[entrypoint] Demarrage de nginx sur :${LISTEN_PORT}"
exec nginx -g 'daemon off;'