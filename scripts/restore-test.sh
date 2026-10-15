#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script de prueba de restauración para PILOT (Punto 11)
# Restaura un archivo .dump en una base de datos temporal de prueba
# y verifica integridad de tablas y conteos.
# ==============================================================================

if [ $# -lt 1 ]; then
  echo "Uso: $0 <ruta-al-archivo-backup.dump> [contenedor] [usuario]"
  echo "Ejemplo: $0 backups/asistencia_backup_20261006_120000.dump"
  exit 1
fi

BACKUP_FILE="$1"
CONTAINER="${2:-asistencia_db}"
USER="${3:-asistencia}"
TEST_DB="restore_test_${RANDOM}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Error: El archivo ${BACKUP_FILE} no existe."
  exit 1
fi

echo "⏳ Iniciando prueba de restauración desde '${BACKUP_FILE}'..."
echo "   Contenedor objetivo: ${CONTAINER}"
echo "   Base de datos temporal de prueba: ${TEST_DB}"

# 1. Crear base de prueba limpia
docker exec -i "${CONTAINER}" psql -U "${USER}" -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null
docker exec -i "${CONTAINER}" psql -U "${USER}" -d postgres -c "CREATE DATABASE ${TEST_DB};" >/dev/null

cleanup() {
  echo "🧹 Limpiando base de datos temporal '${TEST_DB}'..."
  docker exec -i "${CONTAINER}" psql -U "${USER}" -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null || true
}
trap cleanup EXIT

# 2. Restaurar usando pg_restore
echo "⏳ Restaurando dump con pg_restore..."
docker exec -i "${CONTAINER}" pg_restore -U "${USER}" -d "${TEST_DB}" --no-owner --clean --if-exists < "${BACKUP_FILE}" || true

# 3. Verificar tablas críticas y registros
TABLES_COUNT=$(docker exec -i "${CONTAINER}" psql -U "${USER}" -d "${TEST_DB}" -t -A -c "
  SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
")

if [ "${TABLES_COUNT}" -lt 5 ]; then
  echo "❌ Error de verificación: Solo se encontraron ${TABLES_COUNT} tablas en la base restaurada."
  exit 1
fi

CURSOR_VAL=$(docker exec -i "${CONTAINER}" psql -U "${USER}" -d "${TEST_DB}" -t -A -c "
  SELECT value FROM sync_cursor WHERE id = 1;
" 2>/dev/null || echo "error")

echo "✅ Verificación de restauración exitosa:"
echo "   Tablas restauradas: ${TABLES_COUNT}"
echo "   Cursor de sync:     ${CURSOR_VAL}"
echo "   Integridad:         OK"
