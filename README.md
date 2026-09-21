# RemPro Control

Aplicación estática de obras, cobros acumulados, costos, avance, precios y APU. `index.html` es la entrada; puede alojarse en GitHub Pages. Los cambios de esta rama deben integrarse a la rama publicada para aparecer en el sitio público.

## Uso

- **Control Maestro:** agregar, editar, buscar y filtrar obras; actualizar contratado, cobrado, costo y avance. Muestra saldo por obra y margen (contratado menos costo registrado), sin compensar saldos con anticipos de otras obras.
- **Precios:** alta, edición y eliminación con proveedor, IVA y fecha.
- **APU:** captura continua sin perder el foco; conserva el último análisis en este navegador. El APU se incluye en el respaldo exportado y no se sincroniza con la nube.
- **Reglas:** factores positivos para las estimaciones de materiales.
- **Respaldos:** exportar/importar JSON y descargar el respaldo automático anterior a la primera sincronización o a la última importación. Una importación inválida se rechaza antes de cambiar datos. Importar reemplaza el contenido local; los registros que siguen en la nube pueden reaparecer al sincronizar. Para eliminarlos, utiliza Eliminar en la aplicación.
- **Sin conexión:** después de una primera visita con conexión, el service worker permite abrir el control y registrar cambios sin red. Si el SDK no se cargó al abrir sin conexión, recarga al recuperar internet para activar la nube.

## Sincronización y límites

Las tablas utilizadas son `rempro_projects`, `rempro_prices`, `rempro_rules` y la lista de acceso `rempro_members`. No se aplica ni modifica el borrador de arquitectura contable contenido en las migraciones antiguas. Los importes son acumulados: esta interfaz no representa un libro de movimientos individuales de cobros y gastos.

La sincronización lee antes de escribir, pagina los resultados, conserva eliminaciones como marcas, evita ejecuciones paralelas en la pestaña y vuelve a consultar las filas confirmadas por el servidor. Los registros antiguos sin fecha reciben una fecha base, nunca la hora actual. Las actualizaciones comprueban que la versión remota no cambió durante la petición. Los cambios locales hechos mientras hay peticiones pendientes se conservan y se envían en el siguiente ciclo. Un fallo parcial actualiza la pantalla con los datos ya confirmados y muestra el error sin declarar sincronización completa.

El criterio de resolución entre versiones existentes sigue siendo `updated_at`; conviene mantener los relojes de los equipos correctos. Si otro dispositivo cambia la misma fila durante la escritura, se muestra un error y se conserva la versión local. Exporta un respaldo antes de resolver diferencias. La lista de miembros comparte el mismo conjunto de datos RemPro. Cerrar sesión conserva los datos locales, por lo que conviene usar un perfil de navegador propio.

## Verificación

Pruebas sin dependencias:

```sh
node --test tests/sync.test.cjs
```

Prueba de navegador con Playwright 1.62.1 y Chrome instalados:

```sh
node tests/browser.cjs
```

El script admite `PLAYWRIGHT_PATH` para indicar una instalación existente de Playwright y `BROWSER_CHANNEL` para seleccionar un canal instalado. Levanta un servidor local efímero y usa perfiles de prueba aislados; no inicia sesión ni modifica las obras reales.

Comprobado el 21 de septiembre de 2026:

- Nueve pruebas de sincronización: primera fusión, registros antiguos, edición durante descarga, fallo de red, cuenta no autorizada, más de 1000 registros, eliminación, cambio de sesión y escritura remota concurrente.
- Chrome: alta/edición/recarga/búsqueda de obras, validación de avance, cancelación, precios con IVA, persistencia del APU, reglas inválidas, rechazo de respaldo inválido, descarga, eliminación y vista de 390 px.
- Service worker: recarga sin red, alta mediante Enter y persistencia después de recargar.
- Supabase: RLS activo en las cuatro tablas; cuenta no autorizada ve cero obras. Inserción, actualización y lectura con rol autorizado verificadas en una transacción revertida; cero filas de prueba remanentes.
- No se verificó un inicio de sesión real con contraseña del usuario ni Safari/iOS en dispositivos físicos. El diseño móvil se probó por tamaño de pantalla en Chrome.

## Configuración pendiente de revisión en Supabase

El asesor reporta advertencias preexistentes ajenas a las tablas mínimas: once funciones RPC del esquema contable usan `SECURITY DEFINER` y son ejecutables por usuarios autenticados. Debe revisarse su autorización interna antes de habilitar esa arquitectura; cambiar sus permisos indiscriminadamente puede romper sus operaciones. [Guía de revisión](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

También está desactivada la protección frente a contraseñas filtradas. [Configuración de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambiaron estos permisos ni ajustes de cuenta en esta actualización.
