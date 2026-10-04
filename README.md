# RemPro Control

Aplicación estática de obras, cobros acumulados, costos, avance, precios y APU. `index.html` es la entrada; puede alojarse en GitHub Pages. Los cambios de esta rama deben integrarse a la rama publicada para aparecer en el sitio público.

## Uso

- **Control Maestro:** agregar, editar, buscar y filtrar obras; actualizar contratado, cobrado y costo. El avance físico queda de solo lectura en la interfaz y se registra mediante ChatGPT/voz. Incluye balance de obra con corte al momento y control de documentos con estado financiero independiente del estado de envío.
- **Precios:** alta, edición y eliminación con proveedor, IVA y fecha.
- **APU:** captura continua sin perder el foco; conserva el último análisis en este navegador. El APU se incluye en el respaldo exportado y no se sincroniza con la nube.
- **Obra civil:** concretos y morteros hechos en obra; muros de tabique/block con piezas, juntas, vanos, desperdicios y repellado; mampostería de piedra con consumos editables; y columnas, trabes, zapatas y dados de concreto armado con geometría, acero, cimbra y desperdicios editables. Los cálculos guardados se incluyen en el respaldo y se sincronizan con RLS cuando hay sesión.
- **Reglas:** factores positivos para las estimaciones de materiales.
- **Respaldos:** exportar/importar JSON y descargar el respaldo automático anterior a la primera sincronización o a la última importación. Una importación inválida se rechaza antes de cambiar datos. Importar reemplaza el contenido local; los registros que siguen en la nube pueden reaparecer al sincronizar. Para eliminarlos, utiliza Eliminar en la aplicación.
- **Sin conexión:** después de una primera visita con conexión, el service worker permite abrir el control y registrar cambios sin red. Si el SDK no se cargó al abrir sin conexión, recarga al recuperar internet para activar la nube.

## Sincronización y límites

Las tablas activas de la interfaz V2 son `rempro_projects`, `rempro_prices`, `rempro_rules`, `rempro_price_history`, `rempro_project_updates`, `rempro_documents`, `rempro_civil_calculations` y la lista de acceso `rempro_members`. No se aplica ni modifica el borrador de arquitectura contable contenido en las migraciones antiguas. Los importes son acumulados: esta interfaz no representa un libro de movimientos individuales de cobros y gastos.

La sincronización lee antes de escribir, pagina los resultados, conserva eliminaciones como marcas, evita ejecuciones paralelas en la pestaña y vuelve a consultar las filas confirmadas por el servidor. Los registros antiguos sin fecha reciben una fecha base, nunca la hora actual. Las actualizaciones comprueban que la versión remota no cambió durante la petición. Los cambios locales hechos mientras hay peticiones pendientes se conservan y se envían en el siguiente ciclo. Un fallo parcial actualiza la pantalla con los datos ya confirmados y muestra el error sin declarar sincronización completa.

El criterio de resolución entre versiones existentes sigue siendo `updated_at`; conviene mantener los relojes de los equipos correctos. Si otro dispositivo cambia la misma fila durante la escritura, se muestra un error y se conserva la versión local. Exporta un respaldo antes de resolver diferencias. La lista de miembros comparte el mismo conjunto de datos RemPro. Cerrar sesión conserva los datos locales, por lo que conviene usar un perfil de navegador propio.

Los documentos usan estados independientes: pendiente, pago parcial, pagado/aceptado y vencido/rechazado; el envío se marca aparte como enviado o sin enviar. La aplicación no cambia automáticamente un documento pendiente a vencido: la fecha límite debe existir y el estado debe confirmarse explícitamente.

Para evitar que respaldos V1 abiertos en distintos dispositivos creen copias lógicas de una misma obra con UUID distintos, la sincronización reconcilia proyectos por nombre + cliente cuando no existe coincidencia exacta por ID. Las copias históricas ya detectadas en producción se conservaron como registros eliminados, no como obras activas.

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


## Histórico de obras eliminadas

Las obras eliminadas desde cualquier dispositivo se conservan automáticamente en Supabase en `rempro_project_archive`. El archivado ocurre en el servidor al recibir un tombstone sincronizado, un cambio de `deleted=false` a `deleted=true` o una eliminación física. El histórico guarda una fotografía de la obra y, al momento del archivo, sus documentos y avances asociados. Es de solo lectura para usuarios autorizados y no concede escritura desde la app.


## APU rápido sincronizado

El borrador activo de APU rápido se guarda localmente y, cuando existe una sesión RemPro autorizada, se sincroniza con Supabase mediante `rempro_apu_drafts`. La comparación usa `updated_at`: prevalece la versión guardada más reciente y las actualizaciones se propagan entre iPhone, iPad y navegadores de escritorio. El botón **Guardar insumos** fuerza el guardado explícito y solicita sincronización inmediata; las ediciones siguen conservándose localmente durante el trabajo.


## Calculador de Obra Civil

La Fase 4 incorpora columnas y trabes de concreto armado sin convertir el cuantificador en una herramienta de diseño estructural. El usuario captura la sección y el armado definido en planos: número y diámetro de varillas longitudinales, longitud adicional de anclaje/traslape, diámetro, separación y multiplicidad de estribos, recubrimiento, ganchos, cimbra y desperdicios. En trabes se distinguen las varillas superiores e inferiores y la cimbra se cuantifica en fondo y dos laterales. El peso nominal del acero se calcula con `d²/162` kg/m. Los estribos incluyen ambos extremos y su geometría se obtiene de la sección menos recubrimientos.

Los presets de block y tabique siguen siendo referencias editables; el cálculo usa área neta descontando vanos, módulo pieza+junta, mortero de asentado, cero/una/dos caras de repellado y desperdicios separados. La regla RemPro vigente prevalece sobre el Excel legado cuando existe una corrección documentada. Costo directo, flujo, precio comercial, IVA, indirectos y utilidad permanecen fuera de este cuantificador de materiales.


### Fase 5 · zapatas y dados

El motor único del Calculador Civil incorpora zapatas aisladas y zapatas con dado. Cuantifica concreto, parrilla en ambos sentidos, acero vertical y estribos del dado, y cimbra lateral. La geometría, el armado, recubrimientos y desperdicios se capturan desde el plano o la instrucción estructural vigente; RemPro Control no dimensiona ni diseña elementos estructurales. Los resultados usan la misma separación de historial, sincronización privada, respaldo/importación y dosificaciones RemPro que los demás módulos.


### Fase 6 · mampostería de piedra

El módulo cuantifica el volumen ejecutado a partir de un volumen directo o de largo × alto × espesor, descontando vanos. La piedra y el mortero se obtienen mediante coeficientes de consumo por m³ ejecutado, editables para ajustarse a la piedra, junta y aparejo reales; los valores iniciales 1.20 m³ de piedra y 0.30 m³ de mortero por m³ ejecutado son referencias de captura, no una regla estructural rígida. El mortero reutiliza las dosificaciones auditadas del motor único. El resultado conserva historial, sincronización privada con RLS, respaldo/importación y funcionamiento PWA. El módulo cuantifica materiales y mantiene fuera costo directo, flujo, precio comercial, IVA, indirectos y utilidad.


### Fase 7 · muros y losas de concreto reforzado

El motor único incorpora muros y losas macizas de concreto reforzado a partir de la geometría y del armado definido en planos. Para muros cuantifica volumen neto descontando vanos, retícula vertical y horizontal en una o dos caras, longitud adicional, acero por peso nominal y cimbra en cero, una o dos caras. Para losas cuantifica concreto, acero en ambos sentidos para una o dos parrillas y cimbra inferior opcional para distinguir losas elevadas de losas sobre terreno. Los vanos no descuentan acero automáticamente: los refuerzos perimetrales deben provenir del detalle estructural. El módulo no diseña espesores, diámetros, separaciones, apoyos ni traslapes. Historial, sincronización privada con RLS, respaldo/importación y PWA permanecen integrados; costos directos, flujo, precio comercial, IVA, indirectos y utilidad siguen separados.


### Fase 8 · destajos y cuadrillas

El módulo compara la mano de obra directa de una cuadrilla contra un destajo a partir de cantidad, unidad y rendimiento diario. La integración semanal se captura por puesto y por persona; RemPro Control no publica salarios ni tarifas operativas como valores predeterminados. El resultado presenta duración estimada, costo directo de ambos métodos y un flujo periódico del método seleccionado. La contingencia modifica el tiempo y el costo de cuadrilla, mientras el destajo conserva cantidad × precio unitario. Materiales, precio comercial, IVA, indirectos y utilidad permanecen fuera de este cálculo y siguen separados en el APU. El historial se sincroniza entre dispositivos mediante la tabla privada existente, protegida por RLS, y forma parte del respaldo/importación y de la PWA.
