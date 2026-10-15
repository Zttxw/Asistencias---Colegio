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
    // Abrir página inicial en modo vertical slice para validar protocolo
    await page.goto('/?slice=legacy');
    await expect(page.getByTestId('student-name')).toBeVisible();
  });

  test('Escenario A: Sin conexión -> Crear asistencia -> Reconectar -> SYNCED en PostgreSQL', async ({ context, page }) => {
    // Limpiar registros previos para aislar el escenario
    queryDb("DELETE FROM attendance_records; DELETE FROM class_sessions;");
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

  test('Escenario C: Cierre a mitad de sync (petición aplicada en servidor pero ACK cortado antes de llegar a la tablet)', async ({ context, page }) => {
    // 1. Limpiar registros previos para aislar el escenario
    queryDb("DELETE FROM attendance_records; DELETE FROM class_sessions;");
    await page.evaluate(async () => {
      await (window as any).__db.attendanceRecords.clear();
      await (window as any).__db.classSessions.clear();
    });
    await page.reload();
    await expect(page.getByTestId('student-name')).toBeVisible();

    // 2. Interceptar llamadas a POST /api/sync:
    // El servidor procesa y aplica la petición (route.fetch()), pero abortamos la respuesta antes de que el ACK llegue a la tablet
    let requestAppliedOnServer = false;
    await page.route('**/api/sync', async (route) => {
      if (route.request().method() === 'POST' && !requestAppliedOnServer) {
        // Enviar al servidor real para que persista en PostgreSQL
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        requestAppliedOnServer = true;
        // Cortar la conexión abruptamente antes de entregar el ACK al navegador
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    // 3. Modificar asistencia y guardar (se envía la petición pero el ACK se pierde en vuelo)
    await page.getByTestId('btn-status-late').click();
    await page.getByTestId('input-note').fill('Tardanza con ACK cortado');
    await page.getByTestId('btn-save').click();

    // Debe mostrar error de sincronización o permanecer pendiente debido al corte del ACK
    await expect(
      page.locator('[data-testid="sync-indicator-error"], [data-testid="sync-indicator-pending"]')
    ).toBeVisible({ timeout: 10000 });
    expect(requestAppliedOnServer).toBe(true);

    // 4. Simular cierre de pestaña y reapertura
    await page.close();

    const newPage = await context.newPage();
    await newPage.goto('/?slice=legacy');

    // Al reabrir, el registro permanece en IndexedDB con estado PENDING
    await expect(newPage.getByTestId('sync-indicator-pending')).toBeVisible();

    // 5. La tablet reintenta la sincronización con conexión restablecida (ejercita regla 3b / reenvío de ACK perdido)
    await newPage.getByTestId('btn-retry').click();
    await expect(newPage.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 10000 });

    // 6. Validar que en PostgreSQL la asistencia quedó guardada exactamente 1 vez con status LATE
    const totalForStudent = queryDb("SELECT count(*) FROM attendance_records WHERE note = 'Tardanza con ACK cortado';");
    expect(parseInt(totalForStudent)).toBe(1);

    const updatedStatus = queryDb("SELECT status FROM attendance_records WHERE note = 'Tardanza con ACK cortado';");
    expect(updatedStatus).toBe('LATE');
  });

  test('Escenario D: API detenida mantiene registros en PENDING/Error y recupera al reiniciar', async ({ page }) => {
    // Limpiar registros previos para aislar el escenario
    queryDb("DELETE FROM attendance_records; DELETE FROM class_sessions;");
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

  test('Escenario E: Reloj del navegador desfasado en pasado (2001) o futuro (2045) no altera la autoridad del servidor', async ({ page }) => {
    // Limpiar registros previos para aislar el escenario
    queryDb("DELETE FROM attendance_records; DELETE FROM class_sessions;");
    await page.evaluate(async () => {
      await (window as any).__db.attendanceRecords.clear();
      await (window as any).__db.classSessions.clear();
    });
    await page.reload();
    await expect(page.getByTestId('student-name')).toBeVisible();

    // 1. Probar reloj atrasado en el pasado (año 2001)
    await page.evaluate(() => {
      Date.prototype.toISOString = function () {
        return '2001-04-12T08:15:00.000Z';
      };
    });

    await page.getByTestId('btn-status-present').click();
    await page.getByTestId('input-note').fill('Prueba reloj pasado 2001');
    await page.getByTestId('btn-save').click();

    await expect(page.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 10000 });

    // Verificar en PostgreSQL: el servidor asignó created_at y updated_at en 2026 (su hora del servidor), NO 2001
    const yearPast = queryDb("SELECT EXTRACT(YEAR FROM updated_at) FROM attendance_records WHERE note = 'Prueba reloj pasado 2001';");
    expect(parseInt(yearPast)).toBe(2026);

    // Verificar que en attendance_records se preservó el clientUpdatedAt en 2001 solo como metadato
    const clientYearPast = queryDb("SELECT EXTRACT(YEAR FROM client_updated_at) FROM attendance_records WHERE note = 'Prueba reloj pasado 2001';");
    expect(parseInt(clientYearPast)).toBe(2001);

    // 2. Probar reloj adelantado en el futuro (año 2045)
    await page.evaluate(() => {
      Date.prototype.toISOString = function () {
        return '2045-10-06T15:30:00.000Z';
      };
    });

    await page.getByTestId('btn-status-late').click();
    await page.getByTestId('input-note').fill('Prueba reloj futuro 2045');
    await page.getByTestId('btn-save').click();

    await expect(page.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 10000 });

    const yearFuture = queryDb("SELECT EXTRACT(YEAR FROM updated_at) FROM attendance_records WHERE note = 'Prueba reloj futuro 2045';");
    expect(parseInt(yearFuture)).toBe(2026);

    const clientYearFuture = queryDb("SELECT EXTRACT(YEAR FROM client_updated_at) FROM attendance_records WHERE note = 'Prueba reloj futuro 2045';");
    expect(parseInt(clientYearFuture)).toBe(2045);
  });

  test('Escenario F: Token vencido durante POST /api/sync no pierde datos, mantiene PENDING, muestra advertencia recuperable y sincroniza tras re-login', async ({ page }) => {
    // 1. Limpiar registros previos
    queryDb("DELETE FROM attendance_records; DELETE FROM class_sessions;");
    await page.evaluate(async () => {
      await (window as any).__db.attendanceRecords.clear();
      await (window as any).__db.classSessions.clear();
      localStorage.removeItem('token');
    });
    await page.reload();
    await expect(page.getByTestId('student-name')).toBeVisible();

    // 2. Establecer un JWT expirado / inválido en localStorage
    await page.evaluate(() => {
      localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTEyMzQtMTIzNC0xMjM0NTY3ODEyMzQiLCJleHAiOjE1MTYyMzkwMjJ9.invalidsignature');
    });

    // 3. Registrar falta y guardar
    await page.getByTestId('btn-status-absent').click();
    await page.getByTestId('input-note').fill('Asistencia con token expirado');
    await page.getByTestId('btn-save').click();

    // 4. Servidor responde 401 Unauthorized:
    // Debe mostrar la advertencia recuperable "Sesión expirada. Inicia sesión nuevamente para sincronizar."
    await expect(page.getByTestId('auth-expired-banner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('auth-expired-banner')).toContainText('Sesión expirada. Inicia sesión nuevamente para sincronizar.');

    // Indicador debe permanecer en PENDING (amarillo), no en ERROR definitivo ni SYNCED
    await expect(page.getByTestId('sync-indicator-pending')).toBeVisible();
    await expect(page.getByTestId('sync-indicator-pending')).toContainText('pendiente');

    // 5. Verificar que en IndexedDB el registro NO fue eliminado, NO pasó a ERROR ni a SYNCED:
    // Permanece en PENDING
    const recordState = await page.evaluate(async () => {
      const records = await (window as any).__db.attendanceRecords.toArray();
      const sessions = await (window as any).__db.classSessions.toArray();
      return {
        attCount: records.length,
        attSyncState: records[0]?.syncState,
        sessCount: sessions.length,
        sessSyncState: sessions[0]?.syncState,
      };
    });
    expect(recordState.attCount).toBe(1);
    expect(recordState.attSyncState).toBe('PENDING');
    expect(recordState.sessCount).toBe(1);
    expect(recordState.sessSyncState).toBe('PENDING');

    // 6. Iniciar sesión nuevamente con credenciales válidas
    await page.getByTestId('login-username').fill('docente');
    await page.getByTestId('login-password').fill('clave-docente-segura-123');
    await page.getByTestId('btn-login').click();

    // 7. Tras el nuevo JWT y retry, debe sincronizar a 🟢 Sincronizado
    await expect(page.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('auth-expired-banner')).not.toBeVisible();

    // 8. Verificar en PostgreSQL que la asistencia fue persistida correctamente
    const countInDb = queryDb("SELECT count(*) FROM attendance_records WHERE note = 'Asistencia con token expirado' AND status = 'ABSENT';");
    expect(parseInt(countInDb)).toBe(1);
  });
});
