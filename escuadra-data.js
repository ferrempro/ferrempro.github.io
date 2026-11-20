// RemPro Control V2 — datos de la vista «Escuadra» (Bloque B).
// Contenido curado y versionado en el repo: los entregables de la escuadra
// viven en el trabajo diario con Muse, no en Supabase. Para actualizar
// recientes y pendientes se edita este archivo y se publica con un commit.
// Las fechas usan formato ISO (AAAA-MM-DD) porque la franja «Lo más
// reciente» de la vista ordena por fecha mezclando obras y escuadra.
window.RemProEscuadra = {
  updated: '2026-11-19',
  roles: [
    {
      id: 'coordinacion',
      icon: '♟',
      name: 'Coordinación',
      what: 'Reparte el trabajo, resume y da seguimiento diario',
      recientes: [
        { date: '2026-11-19', text: 'Fase 1 de la fusión RemPro Control + Escuadra completada: PR #40 y #41 en producción' },
        { date: '2026-11-19', text: 'Resumen diario RemPro con bloque «Control de obras» (7:30)' },
        { date: '2026-11-16', text: 'Revisión semanal de estadísticas (9–15 nov)' }
      ],
      pendientes: [
        'Fase 2: vista «Escuadra» dentro de la app',
        'Fase 3: rutina diaria de captura y seguimiento'
      ],
      ask: '«Muse, ¿cómo van las obras hoy?»'
    },
    {
      id: 'cotizaciones',
      icon: '∑',
      name: 'Cotizaciones y costos',
      what: 'Propuestas con la plantilla RemPro (folio RP, 60/40, APU interno)',
      recientes: [
        { date: '2026-11-19', text: 'Costeo por cajas completas activo en la app (PR #40)' },
        { date: '2026-11-12', text: 'APU plafón suspendido cerrado: $457.52/m² sin IVA' },
        { date: '2026-11-10', text: 'APU muro de tablaroca cerrado: $485.49/m² sin IVA' }
      ],
      pendientes: [
        'Revalidar precios ACYMA (abril 2026) de muro y plafón',
        'Confirmar el rendimiento real de plafón de Fernando'
      ],
      ask: '«Arma el precio unitario de este concepto…»'
    },
    {
      id: 'imagen',
      icon: '▣',
      name: 'Imagen y contenido',
      what: 'Reels, carruseles, láminas e historias para Instagram y Facebook',
      recientes: [
        { date: '2026-11-18', text: 'Reels de cocinas y pérgola publicados en Instagram y Facebook' },
        { date: '2026-11-18', text: 'Diciembre en Facebook: 11 de 20 piezas programadas' },
        { date: '2026-11-14', text: 'Publicación Drywall vs. Block en Instagram y Facebook' }
      ],
      pendientes: [
        'Instagram diciembre: 17 piezas (sesión en vivo con Fernando)',
        'Carrusel «Cocinas hechas por RemPro» por aprobar',
        'Historias 18–23, del 25 al 30 de noviembre'
      ],
      ask: '«Prepara el siguiente lote de publicaciones…»'
    },
    {
      id: 'obra',
      icon: '▤',
      name: 'Obra y documentación',
      what: 'Bitácora, control de pagos y estimaciones, reportes de avance',
      recientes: [
        { date: '2026-11-18', text: 'Propuesta final Pez Pirata × Adri Gyotaku entregada ($100,000)' },
        { date: '2026-11-18', text: 'Auditoría técnica de RemPro Control V2' },
        { date: '2026-11-12', text: 'Revisión Celliner: saldo bruto proyectado $99,169.73' }
      ],
      pendientes: [
        'Puerta de acceso: verificar en sitio la diferencia de 0.12 m',
        'Pez Pirata: tubería PVC, autorización del arrendador e IVA por escrito'
      ],
      ask: '«Actualiza la bitácora de esta obra…»'
    },
    {
      id: 'clientes',
      icon: '◉',
      name: 'Clientes',
      what: 'Reseñas, respuestas a comentarios y seguimientos (solo texto aprobado por Fernando)',
      recientes: [
        { date: '2026-11-15', text: 'Vínculo de reseñas de Google listo para enviar' },
        { date: '2026-11-15', text: 'Horario oficial confirmado: lun–vie 9:00–18:00, sáb 9:00–13:00' }
      ],
      pendientes: [
        'Enviar el vínculo de reseñas a clientes recientes por WhatsApp',
        'Corregir el horario de la web (sábado hasta las 13:00)',
        'Verificar el horario en la página de Facebook'
      ],
      ask: '«Prepara el mensaje para pedir reseñas…»'
    },
    {
      id: 'investigacion',
      icon: '⌕',
      name: 'Investigación técnica',
      what: 'Datos verificados con fuentes para láminas, precios y decisiones',
      recientes: [
        { date: '2026-11-18', text: 'Verificación GitHub/Supabase de la fusión (auditoría y paso 0)' },
        { date: '2026-11-09', text: 'Datos solares verificados para las láminas 18–23 (24.1° N)' }
      ],
      pendientes: [
        'Fuentes verificadas para la próxima lámina técnica'
      ],
      ask: '«Verifica este dato con fuentes…»'
    },
    {
      id: 'aprendizaje',
      icon: '✎',
      name: 'Aprendizaje',
      what: 'Cursos y certificaciones de Fernando en sesiones cortas',
      recientes: [
        { date: '2026-11-18', text: 'Clase 3 de cálculo estructural entregada' },
        { date: '2026-11-16', text: 'Mapa de cursos: 115 en 5 plataformas, plan de 7 fases' }
      ],
      pendientes: [
        'Coursera «Cómo autoconstruir tu vivienda»: fecha límite 22-nov',
        'Clase 4 de estructuras (M1V03)',
        'CENACER EC0217.01: 9 de 23 lecciones'
      ],
      ask: '«Dame la clase de hoy en 15 minutos…»'
    }
  ]
};
