#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script reproducible de backup para PILOT (Punto 11)
# Realiza pg_dump en el contenedor PostgreSQL, genera archivo con timestamp,
# y valida existencia y tamaño > 0 bytes.
# ==============================================================================

BACKUP_DIR="${BACKUP_DIR:-backups}"
CONTAINER="${PILOT_CONTAINER:-asistencia_pilot_db}"
DB_NAME="${PILOT_DB_NAME:-asistencia_pilot}"
DB_USER="${PILOT_DB_USER:-asistencia_pilot}"

# Si el contenedor de piloto no está activo pero se está ejecutando en dev/test:
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  if [ "${1:-}" = "--dev" ] || [ "${ALLOW_DEV_CONTAINER:-false}" = "true" ]; then
    CONTAINER="asistencia_db"
    DB_NAME="${POSTGRES_DB:-asistencia}"
    DB_USER="${POSTGRES_USER:-asistencia}"
    echo "ℹ️  Usando contenedor de desarrollo para prueba de backup: ${CONTAINER}"
  else
    echo "❌ Error: Contenedor ${CONTAINER} no encontrado en ejecución."
    echo "   Para realizar backup de desarrollo de prueba, ejecute: $0 --dev"
    exit 1
  fi
fi

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="${BACKUP_DIR}/${DB_NAME}_backup_${TIMESTAMP}.dump"

echo "⏳ Iniciando backup de la base de datos '${DB_NAME}' desde '${CONTAINER}'..."

# Usar formato custom (-Fc) con compresión de PostgreSQL
docker exec -i "${CONTAINER}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc > "${OUTPUT_FILE}"

# Verificación estricta de existencia y tamaño
if [ ! -f "${OUTPUT_FILE}" ]; then
  echo "❌ Error: El archivo de backup ${OUTPUT_FILE} no fue creado."
  exit 1
fi

FILE_SIZE=$(stat -c%s "${OUTPUT_FILE}" 2>/dev/null || stat -f%z "${OUTPUT_FILE}" 2>/dev/null || echo 0)

if [ "${FILE_SIZE}" -le 0 ]; then
  echo "❌ Error: El archivo de backup ${OUTPUT_FILE} está vacío (0 bytes)."
  rm -f "${OUTPUT_FILE}"
  exit 1
fi

echo "✅ Backup completado exitosamente:"
echo "   Archivo: ${OUTPUT_FILE}"
echo "   Tamaño:  ${FILE_SIZE} bytes"
echo "   Fecha:   $(date)"
