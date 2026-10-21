# Miércoles FC App ⚽🥩

Aplicación Web Progresiva (PWA) desarrollada en **Angular** orientada principalmente a **mobile** (con soporte responsive para desktop), diseñada para simplificar y automatizar la organización de los partidos de fútbol 5 de los miércoles y la cena posterior con amigos.

---

## 🚀 Arquitectura y Tecnologías
- **Framework**: Angular 20 (Standalone Components, Signals para estado reactivo, Router moderno).
- **Enfoque de Diseño**: Mobile-First fiel a los mockups, con paleta de colores HSL refinada, césped táctico realista y micro-interacciones suaves.
- **Soporte PWA**: `manifest.json` y metatags configurados para permitir la instalación en dispositivos iOS y Android como app nativa.
- **Servicios Preparados para Supabase**: Estructura de modelos y servicio reactivo [event-state.service.ts](file:///Users/gonzalo/proyectos/antigravity%20apps/miercoles-fc-app/src/app/services/event-state.service.ts) con tipado exhaustivo, facilitando la conexión futura a base de datos.

---

## 📱 Pantallas Desarrolladas (14 Vistas del Flujo)

| Nº | Vista | Ruta | Descripción |
|---|---|---|---|
| **1** | **Inicio** | `/` | Hero card con iluminación nocturna, tarjetas de partido y cena con cálculo estimado y botones de confirmación rápida. |
| **2** | **Asistencia** | `/asistencia` | Permite confirmar de forma separada e independiente el fútbol ("Voy a jugar" / "No voy a jugar") y la cena ("Voy a comer" / "No voy a comer"). |
| **3** | **Jugadores confirmados** | `/partido/confirmados` | Listado con pestañas de filtro (`Todos`, `Juegan`, `Cenan`) y badges visuales (`Juega + Cena`, `Solo juega`, `Solo cena`). |
| **4** | **Armar equipos** | `/partido/armar-equipos` | Toggle entre modo `Aleatorio` y `Manual`, listado de disponibles y botón de generación de equipos. |
| **5-6** | **Equipos (Vistas 1 y 2)** | `/partido/equipos` | Cancha táctica de fútbol verde realista con posiciones (DEL, MED, DEF, ARQ) y alternancia instantánea entre `Equipo A` y `Equipo B`. |
| **7** | **Marcar presentes** | `/partido/presentes` | Checkboxes para marcar quiénes jugaron realmente el partido y recalcular la división del costo. |
| **8** | **Resumen partido** | `/partido/resumen` | Métricas finales: jugadores presentes, total de la cancha y costo exacto por jugador ($50.000 / presentes). |
| **9** | **Pagos cancha** | `/pagos/cancha` | Barra de progreso de recaudación, lista de jugadores con checkbox de cobro y saldo pendiente visible. |
| **10** | **Cena - Menú** | `/cena/menu` | Listado de compras (carne, verduras, bebidas, pan), botón de "+ Agregar ítem" y monto total acumulado. |
| **11** | **Cena - Asistentes** | `/cena/asistentes` | Selección de los comensales presentes para la división precisa del asado. |
| **12** | **Resumen cena** | `/cena/resumen` | Círculo de confirmación verde, total de comensales, gasto total y costo individual por persona. |
| **13** | **Pagos cena** | `/pagos/cena` | Control de cobro de la cena con barra de progreso y estado por persona. |
| **14** | **Resumen total** | `/pagos/resumen-total` | Balance global del evento (cancha + cena), saldo total pendiente y botón para compartir el reporte en WhatsApp. |
| **+** | **Admin - Nuevo Miércoles** | `/admin/nuevo-evento` | Formulario administrativo para crear y publicar una nueva fecha semanal. |

---

## 🛠️ Comandos para Ejecutar Localmente

Para correr la aplicación en tu entorno:

```bash
cd "miercoles-fc-app"
npm start
```

Luego abre tu navegador en **`http://localhost:4200`** (o en el puerto asignado que indique la terminal).


## Eventos compartidos

Los eventos y las confirmaciones se guardan en Supabase (`event_records` y
`event_rsvps`). El esquema aplicado se conserva en `database/events-schema.sql`.
La app comienza vacía: solo el administrador puede publicar una fecha con título,
fecha, hora, lugar y precio de cancha. Los eventos nuevos no incluyen asistentes,
equipos ni gastos de ejemplo. Cada confirmación pertenece al usuario autenticado.
Las pantallas del evento requieren que exista una fecha publicada.

El estado se consulta al navegar, al volver a la ventana y cada 15 segundos.
Las políticas RLS permiten leer a los usuarios autenticados, reservan la creación
y edición del evento al administrador y limitan las confirmaciones a su titular.

Para verificar el flujo de creación y confirmación con un cliente simulado:

```bash
node scripts/check-event-flow.cjs
```


## Guardados, cobros y cierre de etapas

Las escrituras esperan confirmación de Supabase y tienen un límite de 15 segundos.
La interfaz muestra el estado de guardado y conserva los formularios si falla.
Los reintentos reutilizan el identificador de la operación; un conflicto de versión
exige actualizar y revisar los datos antes de repetir el cambio.

El admin inicia el partido para pasar de `open` a `playing` y cerrar inscripciones
y equipos. La selección de presentes es un borrador local hasta confirmar: esa
acción guarda la lista y pasa a `dinner` en una sola escritura. El precio y los
presentes de cancha quedan bloqueados. Confirmar los asistentes de cena pasa a
`completed` y bloquea también los gastos y el reparto de cena. El estado completado
indica el cierre del reparto; todavía puede haber cobros pendientes.

Los cobros se guardan en `event_payments` con importe, fecha y administrador.
Se habilitan tras cerrar el reparto correspondiente. Cada jugador tiene como
máximo un cobro vigente por concepto. Anular un cobro conserva su registro,
importe original, fecha de anulación y responsable. Los totales se obtienen de
los cobros vigentes, nunca de multiplicar cuotas actuales por cantidad de pagos.
El reparto distribuye los centavos restantes en orden de ID de jugador para que
la suma coincida con el gasto exacto. No se admiten pagos parciales en este MVP.

El upgrade aplicado está en `database/reliable-saves-payments.sql` y el refuerzo
de validaciones en `database/harden-stage-validation.sql`. Las pruebas de
integración en `database/tests/reliable-event-flow.sql` ejecutan las funciones,
políticas y triggers reales con identidades de admin/jugador; todas las escrituras
de prueba se revierten con `ROLLBACK`.

```bash
npm run test:flow
npm run build
```

`test:flow` usa clientes aislados sobre un servidor simulado para probar fallas
antes de guardar, respuestas perdidas después de guardar, reintentos sin duplicados,
conflictos entre dos sesiones, cierres, importes exactos, anulación y recarga.
Las comprobaciones del navegador se hicieron sobre el servidor local. Esto no
sustituye una prueba manual en dos teléfonos físicos con las cuentas del grupo.

## Estadísticas deportivas

Desde Inicio → Resultados o desde Estadísticas → Resultados por fecha se puede
consultar cada fecha histórica. Después de confirmar los presentes, el admin
puede cargar uno o varios cruces entre los equipos guardados, sus marcadores,
goles y asistencias por jugador y una figura opcional elegida por el admin.
Los demás usuarios tienen acceso de lectura. Las correcciones siguen disponibles
después de cerrar la cena, sin modificar asistencias, gastos ni pagos.

Las victorias, empates y derrotas se asignan a los presentes de ambos equipos
por cada cruce. La asistencia general sigue contando fechas, no cruces. Los
resultados no cargados no se consideran empates. El total de goles puede superar
los goles con autor (por ejemplo por goles en contra); esos goles no se asignan
a jugadores. Los goles y asistencias de cada equipo no pueden superar su marcador.
No se permite que un jugador asista sus propios goles.

La tabla `event_sports`, sus políticas de lectura/admin, validaciones y RPC están
en `database/sports-results.sql` (aplicado al proyecto Supabase actual). Para otro
entorno, ejecutar este esquema después de los esquemas de eventos y cierres.
El RPC usa versiones y operaciones idempotentes para evitar sobrescrituras y
duplicados al reintentar. `updated_by` y `updated_at` registran la última edición.

```bash
npm run test:statistics
npm run test:sports
npm run test:flow
npm run build
```

`database/tests/sports-results.sql` verifica RPC, triggers, conflictos y permisos
con roles reales. Todos sus cambios de prueba se revierten con `ROLLBACK`.
