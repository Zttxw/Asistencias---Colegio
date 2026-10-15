import { test, expect } from '@playwright/test';

test('Flujo completo en Modo Docente con los 91 datos reales de Excel', async ({ page }) => {
  // 1. Ir a la aplicación
  await page.goto('/');

  // 2. Si aparece login, ingresar con credenciales docentes
  const isLoginVisible = await page.getByRole('button', { name: 'Ingresar' }).isVisible();
  if (isLoginVisible) {
    await page.getByPlaceholder('docente, auxiliar o admin').fill('docente');
    await page.locator('input[type="password"]').fill('clave-docente-segura-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
  }

  // 3. Verificar saludo y las 5 aulas reales
  await expect(page.getByRole('heading', { name: /Buenos días, Docente de Prueba/i })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('1° "A"')).toBeVisible();
  await expect(page.getByText('4° "A"')).toBeVisible();
  await expect(page.getByText('5° "A"')).toBeVisible();
  await expect(page.getByText('5° "B"')).toBeVisible();
  await expect(page.getByText('5° "C"')).toBeVisible();

  // 4. Pasar lista a 1° "A" (23 alumnos reales)
  await page.getByRole('button', { name: 'Pasar lista →' }).first().click();

  // 5. Verificar lista de 23 estudiantes y marcar todos presentes
  await expect(page.getByText('AGUILAR QUISPE, LIAR ANTHONY')).toBeVisible();
  await page.getByRole('button', { name: /Marcar todos presentes/i }).click();

  // 6. Guardar asistencia
  await page.getByRole('button', { name: /Guardar Asistencia \(Offline-First\)/i }).click();

  // 7. Verificar pantalla de confirmación y sincronización exitosa
  await expect(page.getByText('Asistencia Registrada')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Presentes')).toBeVisible();
  await expect(page.getByTestId('sync-indicator-synced')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Sincronizado')).toBeVisible();

  // 8. Volver a secciones y comprobar que se refleja inmediatamente (con ratio y [✓] Registrada en el primer intento)
  await page.getByRole('button', { name: /Volver a Mis secciones/i }).click();
  await expect(page.getByText(/\d+\/\d+/)).toBeVisible();
  await expect(page.getByText('[✓] Registrada')).toBeVisible();
  await page.getByRole('button', { name: /\[ Subir Padrón Excel \]/i }).first().click();

  // 9. Verificar contenido del modal y enlace de descarga
  await expect(page.getByText('Cargar Padrón Escolar (Excel)')).toBeVisible();
  await expect(page.getByRole('link', { name: /Descargar padron_real_2026/i })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByText('Cargar Padrón Escolar (Excel)')).not.toBeVisible();

  // 10. Probar añadir un alumno manualmente con el nuevo botón [+ Añadir Alumno]
  await page.getByRole('button', { name: /\+ Añadir Alumno/i }).first().click();
  await expect(page.getByText('Añadir Alumno al Padrón')).toBeVisible();
  await page.locator('#student-fullname-input').fill('ZAMBRANO CONDORI, PEDRO');
  await page.getByRole('button', { name: 'Registrar Alumno' }).click();
  await expect(page.getByText('Añadir Alumno al Padrón')).not.toBeVisible();
  // Verificar que la matrícula de alumnos es visible en la sección
  await expect(page.getByRole('cell', { name: /alumnos/ }).first()).toBeVisible();
});

test('En PC de escritorio (ancho >= 1024px): La barra lateral es fija y visible directamente', async ({ page }) => {
  await page.goto('/');

  const isLoginVisible = await page.getByRole('button', { name: 'Ingresar' }).isVisible();
  if (isLoginVisible) {
    await page.getByPlaceholder('docente, auxiliar o admin').fill('docente');
    await page.locator('input[type="password"]').fill('clave-docente-segura-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
  }

  // 1. En PC y Tablet el menú de 3 rayas no es necesario ni visible
  const toggleBtn = page.getByTestId('btn-toggle-sidebar');
  await expect(toggleBtn).not.toBeVisible();

  // 2. La barra lateral está directamente presente y visible en el lateral izquierdo
  const sidebar = page.locator('aside');
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mis secciones' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pasar lista', exact: true })).toBeVisible();
});

test('En Celular (ancho < 768px): La barra lateral inicia oculta y se despliega con el menú de 3 rayas', async ({ page }) => {
  // Simular dispositivo móvil (celular: 390 x 844 px)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const isLoginVisible = await page.getByRole('button', { name: 'Ingresar' }).isVisible();
  if (isLoginVisible) {
    await page.getByPlaceholder('docente, auxiliar o admin').fill('docente');
    await page.locator('input[type="password"]').fill('clave-docente-segura-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
  }

  // 1. Botón de 3 rayas (hamburguesa) visible en la cabecera del celular
  const toggleBtn = page.getByTestId('btn-toggle-sidebar');
  await expect(toggleBtn).toBeVisible({ timeout: 5000 });

  // 2. El aside inicia oculto fuera de pantalla para celular
  const sidebar = page.locator('aside');
  await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -270, 0)');

  // 3. Abrir la barra lateral mediante el botón de 3 rayas
  await toggleBtn.click();
  await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

  // 4. Botón de cerrar (✕) visible dentro del menú
  const closeBtn = page.getByTitle('Cerrar barra lateral');
  await expect(closeBtn).toBeVisible();

  // 5. Cerrar haciendo clic en el botón de cerrar
  await closeBtn.click();
  await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -270, 0)');

  // 6. Abrir nuevamente y seleccionar una opción para verificar auto-cierre
  await toggleBtn.click();
  await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.getByRole('button', { name: 'Historial' }).click();
  await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -270, 0)');
});

test('En Tablet (768px - 1023px): La barra lateral es opcional / desplegable para maximizar el área de trabajo', async ({ page }) => {
  // Simular tablet (iPad 820 x 1180 px)
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');

  const isLoginVisible = await page.getByRole('button', { name: 'Ingresar' }).isVisible();
  if (isLoginVisible) {
    await page.getByPlaceholder('docente, auxiliar o admin').fill('docente');
    await page.locator('input[type="password"]').fill('clave-docente-segura-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
  }

  // 1. En tablet, el botón de 3 rayas está disponible en la cabecera para abrir el menú cuando se necesite
  const toggleBtn = page.getByTestId('btn-toggle-sidebar');
  await expect(toggleBtn).toBeVisible({ timeout: 5000 });

  // 2. La barra inicia minimizada/oculta dejando el 100% del ancho para la vista de secciones y lista
  const sidebar = page.locator('aside');
  await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -270, 0)');

  // 3. Abrir el menú lateral con las 3 rayas
  await toggleBtn.click();
  await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

  // 4. Botón de cerrar / minimizar (✕) disponible para ocultar la barra y recuperar espacio
  const closeBtn = page.getByTitle('Cerrar barra lateral');
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();
  await expect(sidebar).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -270, 0)');
});

test('Rol Auxiliar: Acceso exclusivo al reporte de faltas y tardanzas sin modificar ni acceder a listas de docentes', async ({ page }) => {
  await page.goto('/');

  // 1. Cerrar sesión previa si la hubiera para ingresar como auxiliar
  const logoutBtn = page.getByRole('button', { name: 'Cerrar sesión' });
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
  }

  // 2. Iniciar sesión como auxiliar con su clave oficial
  await page.getByPlaceholder('docente, auxiliar o admin').fill('auxiliar');
  await page.locator('input[type="password"]').fill('clave-auxiliar-segura-123');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // 3. Verificar que entra directamente a "Reporte de Faltas y Tardanzas"
  await expect(page.getByRole('heading', { name: /Reporte de Faltas y Tardanzas/i }).first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Modo Auxiliar · Solo Lectura')).toBeVisible();

  // 4. Verificar que en la barra lateral ÚNICAMENTE tiene la opción "Faltas y Tardanzas"
  await expect(page.getByRole('button', { name: 'Faltas y Tardanzas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inicio' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Mis secciones' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Pasar lista', exact: true })).not.toBeVisible();

  // 5. Verificar que NO puede registrar alumnos manualmente ni subir padrón Excel
  await expect(page.getByRole('button', { name: /\+ Añadir Alumno/i })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Subir Padrón/i })).not.toBeVisible();

  // 6. Verificar que las tarjetas de KPIs están presentes para supervisión
  await expect(page.getByText('Faltas Injustificadas', { exact: true })).toBeVisible();
  await expect(page.getByText('Tardanzas Registradas', { exact: true })).toBeVisible();
  await expect(page.getByText('Justificadas', { exact: true })).toBeVisible();

  // 7. Verificar columna Docente Responsable (en vez del código de sistema)
  await expect(page.getByRole('columnheader', { name: /Docente Responsable/i })).toBeVisible();

  // 8. Verificar acción limpia de supervisión (Imprimir Reporte)
  await expect(page.getByRole('button', { name: 'Imprimir Reporte' })).toBeVisible();
});

test('Rol Administrador: Acceso con clave-admin-segura-123 y módulo de recuperación de contraseñas activo', async ({ page }) => {
  await page.goto('/');

  // 1. Cerrar sesión previa si la hubiera
  const logoutBtn = page.getByRole('button', { name: 'Cerrar sesión' });
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
  }

  // 2. Iniciar sesión como admin con clave-admin-segura-123
  await page.getByPlaceholder('docente, auxiliar o admin').fill('admin');
  await page.locator('input[type="password"]').fill('clave-admin-segura-123');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // 3. Verificar ingreso al Dashboard Director
  await expect(page.getByRole('heading', { name: /Panel de Control Administrativo/i }).first()).toBeVisible({ timeout: 5000 });

  // 4. Verificar presencia del módulo de Gestión de Usuarios y Recuperación de Claves
  await expect(page.getByRole('heading', { name: /Gestión de Usuarios y Recuperación de Claves/i })).toBeVisible();
  await expect(page.getByText('Exclusivo Director')).toBeVisible();

  // 5. Verificar que se listan las cuentas institucionales
  await expect(page.getByText('@docente')).toBeVisible();
  await expect(page.getByText('@auxiliar')).toBeVisible();
  await expect(page.getByText('@admin')).toBeVisible();

  // 6. Probar botón de recuperación rápida en un clic
  const restoreBtn = page.getByRole('button', { name: '✓ Restaurar Oficial' }).first();
  await expect(restoreBtn).toBeVisible();
  await restoreBtn.click();
  await expect(page.getByText(/Contraseña de @.+ restablecida con éxito/i)).toBeVisible({ timeout: 5000 });
});

test('Sincronización multi-pestaña en tiempo real: Guardar asistencia en pestaña 1 actualiza pestaña 2 de inmediato', async ({ context }) => {
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  // 1. Abrir ambas pestañas logeados como docente
  await page1.goto('/');
  if (await page1.getByRole('button', { name: 'Ingresar' }).isVisible()) {
    await page1.getByPlaceholder('docente, auxiliar o admin').fill('docente');
    await page1.locator('input[type="password"]').fill('clave-docente-segura-123');
    await page1.getByRole('button', { name: 'Ingresar' }).click();
  }
  await expect(page1.getByText('1° "A"')).toBeVisible({ timeout: 8000 });

  await page2.goto('/');
  await expect(page2.getByText('1° "A"')).toBeVisible({ timeout: 8000 });

  // 2. En page1, pasar lista y guardar
  await page1.getByRole('button', { name: 'Pasar lista →' }).first().click();
  await page1.getByRole('button', { name: /Marcar todos presentes/i }).click();
  await page1.getByRole('button', { name: /Guardar Asistencia \(Offline-First\)/i }).click();
  await expect(page1.getByText('Asistencia Registrada')).toBeVisible({ timeout: 5000 });

  // 3. En page2 (la otra pestaña), debe actualizarse de inmediato reflejando que la lista fue tomada
  await expect(page2.getByText('[✓] Registrada').first()).toBeVisible({ timeout: 8000 });
});

test('Navegación inteligente de días escolares: Botón Clase anterior (Viernes) y aviso de fin de semana no lectivo', async ({ page }) => {
  await page.goto('/');
  if (await page.getByRole('button', { name: 'Ingresar' }).isVisible()) {
    await page.getByPlaceholder('docente, auxiliar o admin').fill('docente');
    await page.locator('input[type="password"]').fill('clave-docente-segura-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
  }
  await expect(page.getByText('1° "A"')).toBeVisible({ timeout: 8000 });

  // 1. Ir a pasar lista de 1° "A"
  await page.getByRole('button', { name: 'Pasar lista →' }).first().click();

  // 2. Verificar cabecera compacta con fecha de Hoy (Lunes 12 de octubre de 2026)
  await expect(page.getByText('Lunes 12 de octubre de 2026')).toBeVisible();
  const btnPrevClass = page.getByRole('button', { name: /Clase anterior \(Viernes\)/i });
  await expect(btnPrevClass).toBeVisible();

  // 3. Pulsar botón "Clase anterior (Viernes)"
  await btnPrevClass.click();
  await expect(page.getByText('Viernes 9 de octubre de 2026')).toBeVisible();

  // 4. Volver a Hoy
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.getByText('Lunes 12 de octubre de 2026')).toBeVisible();
});




