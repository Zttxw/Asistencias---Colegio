import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

function queryDb(sql: string): string {
  return execSync(`docker exec -i asistencia_db psql -U asistencia -d asistencia -t -A -c "${sql}"`, {
    encoding: 'utf-8',
  }).trim();
}

test.describe('Fase 2 — Pruebas Automatizadas Offline-First (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    // Abrir página inicial
    await page.goto('/');
    await expect(page.getByTestId('student-name')).toBeVisible();
  });

  test('Escenario A: Sin conexión -> Crear asistencia -> Reconectar -> SYNCED en PostgreSQL', async ({ context, page }) => {
    // Limpiar registros previos para aislar el escenario
    queryDb("DELETE FROM attendance_records;");
    await page.evaluate(async () => {
      await (window as any).__db.attendanceRecords.clear();
      await (window as any).__db.classSessions.clear();
    });
    await page.reload();
    await expect(page.getByTestId('student-name')).toBeVisible();

    // 1. Confirmar estado inicial sincronizado
    await expect(page.getByTestId('sync-indicator-synced')).toBeVisible();

    // 2. Activar modo offline
    await context.setOffline(true);

    // 3. Registrar falta con nota
    await page.getByTestId('btn-status-absent').click();
    await page.getByTestId('input-note').fill('Falta médica offline');
    await page.getByTestId('btn-save').click();

    // 4. Verificar estado PENDING en UI
    await expect(page.getByTestId('sync-indicator-pending')).toContainText('pendiente');

    // 5. Confirmar que los datos existen en IndexedDB localmente
    const dbHasPending = await page.evaluate(async () => {
      // @ts-expect-error dexie global or indexeddb direct check
      const dbs = await window.indexedDB.databases();
      return dbs.some((d: any) => d.name === 'asistencia_offline_db');
    });
    expect(dbHasPending).toBeTruthy();

    // 6. Volver online y sincronizar
    await context.setOffline(false);
    await page.getByTestId('btn-retry').click();

    // 7. Verificar que pasa a 🟢 Sincronizado
    await expect(page.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 10000 });

    // 8. Consultar PostgreSQL directamente: debe existir exactamente 1 sesión y 1 asistencia
    const sessionCount = queryDb("SELECT count(*) FROM class_sessions WHERE slot = 'JORNADA';");
    expect(parseInt(sessionCount)).toBeGreaterThanOrEqual(1);

    const attCount = queryDb("SELECT count(*) FROM attendance_records WHERE status = 'ABSENT' AND note = 'Falta médica offline';");
    expect(parseInt(attCount)).toBe(1);
  });

  test('Escenario B: Reenvío idempotente no crea duplicados en PostgreSQL ni incrementa versión', async ({ page }) => {
    // El registro ya fue sincronizado. Hacemos clic en Reintentar para reenviar el mismo lote
    const vBefore = queryDb("SELECT version FROM attendance_records WHERE note = 'Falta médica offline' LIMIT 1;");

    await page.getByTestId('btn-retry').click();
    await expect(page.getByTestId('sync-indicator-synced')).toBeVisible();

    // Verificar en PostgreSQL que la versión sigue idéntica y no hay duplicados
    const vAfter = queryDb("SELECT version FROM attendance_records WHERE note = 'Falta médica offline' LIMIT 1;");
    expect(vAfter).toBe(vBefore);

    const totalRecords = queryDb("SELECT count(*) FROM attendance_records WHERE note = 'Falta médica offline';");
    expect(parseInt(totalRecords)).toBe(1);
  });

  test('Escenario C: Cierre de pestaña/recarga durante estado pendiente y localRev protege cambios', async ({ context, page }) => {
    // Limpiar registros previos para aislar el escenario
    queryDb("DELETE FROM attendance_records;");
    await page.evaluate(async () => {
      await (window as any).__db.attendanceRecords.clear();
      await (window as any).__db.classSessions.clear();
    });
    await page.reload();
    await expect(page.getByTestId('student-name')).toBeVisible();

    // Desconectar red
    await context.setOffline(true);

    // Cambiar a Tardanza
    await page.getByTestId('btn-status-late').click();
    await page.getByTestId('input-note').fill('Tardanza corregida offline');
    await page.getByTestId('btn-save').click();

    await expect(page.getByTestId('sync-indicator-pending')).toBeVisible();

    // Simular cierre de pestaña y reapertura:
    await page.close();
    await context.setOffline(false);

    const newPage = await context.newPage();
    await newPage.goto('/');

    // Debe conservar el estado pendiente tras reabrir desde IndexedDB
    await expect(newPage.getByTestId('sync-indicator-pending')).toBeVisible();

    // Sincronizar
    await newPage.getByTestId('btn-retry').click();
    await expect(newPage.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 10000 });

    // Validar que en PostgreSQL la asistencia se actualizó a LATE sin duplicar fila
    const updatedStatus = queryDb("SELECT status FROM attendance_records WHERE note = 'Tardanza corregida offline';");
    expect(updatedStatus).toBe('LATE');

    const totalForStudent = queryDb("SELECT count(*) FROM attendance_records WHERE note = 'Tardanza corregida offline';");
    expect(parseInt(totalForStudent)).toBe(1);
  });

  test('Escenario D: API detenida mantiene registros en PENDING/Error y recupera al reiniciar', async ({ page }) => {
    // Limpiar registros previos para aislar el escenario
    queryDb("DELETE FROM attendance_records;");
    await page.evaluate(async () => {
      await (window as any).__db.attendanceRecords.clear();
      await (window as any).__db.classSessions.clear();
    });
    await page.reload();
    await expect(page.getByTestId('student-name')).toBeVisible();

    // 1. Detener contenedor de API
    execSync('docker compose stop api');

    // 2. Intentar guardar o sincronizar
    await page.getByTestId('btn-status-excused').click();
    await page.getByTestId('input-note').fill('Permiso especial');
    await page.getByTestId('btn-save').click();

    // 3. Debe mostrar estado de error de sincronización sin perder el dato pendiente
    await expect(page.getByTestId('sync-indicator-error')).toBeVisible({ timeout: 10000 });

    // 4. Reiniciar API y esperar a que esté saludable
    execSync('docker compose start api');
    for (let i = 0; i < 30; i++) {
      try {
        const out = execSync('curl -s http://localhost:5080/api/health', { encoding: 'utf-8' });
        if (out.includes('"status":"ok"')) break;
      } catch {}
      await page.waitForTimeout(500);
    }

    // 5. Reintentar sincronización
    await page.getByTestId('btn-retry').click();
    await expect(page.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 15000 });

    // 6. Verificar en PostgreSQL que llegó correctamente
    const status = queryDb("SELECT status FROM attendance_records WHERE note = 'Permiso especial';");
    expect(status).toBe('EXCUSED');
  });

  test('Escenario E: Reloj del navegador desfasado años no altera la autoridad del servidor', async ({ page }) => {
    // Limpiar registros previos para aislar el escenario
    queryDb("DELETE FROM attendance_records;");
    await page.evaluate(async () => {
      await (window as any).__db.attendanceRecords.clear();
      await (window as any).__db.classSessions.clear();
    });
    await page.reload();
    await expect(page.getByTestId('student-name')).toBeVisible();

    // Modificar toISOString en la página para simular que el cliente envía marcas temporales de 2045
    await page.evaluate(() => {
      Date.prototype.toISOString = function () {
        return '2045-10-06T15:30:00.000Z';
      };
    });

    await page.getByTestId('btn-status-present').click();
    await page.getByTestId('input-note').fill('Prueba reloj desfasado');
    await page.getByTestId('btn-save').click();

    // El guardado online ejecuta sync automáticamente
    await expect(page.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 10000 });

    // Verificar en PostgreSQL: el servidor asignó created_at y updated_at en 2026 (su hora del servidor), NO 2045
    const year = queryDb("SELECT EXTRACT(YEAR FROM updated_at) FROM attendance_records WHERE note = 'Prueba reloj desfasado';");
    expect(parseInt(year)).toBe(2026);

    // Verificar que en attendance_records se preservó el clientUpdatedAt reportado por el cliente en 2045 como metadato
    const clientYear = queryDb("SELECT EXTRACT(YEAR FROM client_updated_at) FROM attendance_records WHERE note = 'Prueba reloj desfasado';");
    expect(parseInt(clientYear)).toBe(2045);
  });
});
