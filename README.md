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
goles y asistencias por jugador. Los nuevos cruces abren una votación para elegir
la figura. Los demás usuarios tienen acceso de lectura a los resultados y pueden
votar en los cruces que jugaron. Las correcciones siguen disponibles
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

## Votación del jugador del partido

En Resultados, cada participante real del cruce puede votar a otro participante
de cualquiera de los dos equipos. Un usuario tiene un voto por cruce y puede
cambiarlo mientras la votación siga abierta. La base de datos valida la identidad,
el padrón de presentes y la prohibición de votarse a sí mismo. Ni el admin puede
leer votos ajenos: `fixture_votes` solo permite consultar el voto propio.

El admin confirma el cierre definitivo. Hasta entonces no se publican recuentos
ni figuras. El cierre guarda el total y todos los ganadores empatados en
`fixture_polls`; cada uno suma una figura al ranking. Si no hay votos, nadie suma.
Las figuras anteriores elegidas por el admin se conservan como elecciones históricas.
Los equipos de un cruce nuevo quedan fijos al abrir su votación. No se puede quitar
un cruce con votos o con una votación cerrada. Corregir marcadores conserva los votos.

El esquema adicional está en `database/fixture-voting.sql`, aplicado después de
`database/sports-results.sql`. Las tablas no admiten escrituras directas del cliente;
los RPC públicos llaman implementaciones con validación de identidad en el esquema
no expuesto `app_private`. Mantener ese esquema fuera de los esquemas de Data API.
Los envíos usan versiones y operaciones idempotentes. El componente actualiza la
votación cada 15 segundos, al volver a la ventana o mediante Actualizar votación.

```bash
npm run test:voting
```

`database/tests/fixture-voting.sql` prueba permisos, privacidad, cambios, conflictos,
empates, cierre y ausencia de votos con roles reales, y termina con `ROLLBACK`.

## Notificaciones push manuales

Desde el avatar → **Notificaciones**, cada usuario puede activar las notificaciones
en ese dispositivo. En iPhone debe abrir la app instalada en la pantalla de inicio
(iOS 16.4 o posterior) y tocar Activar notificaciones para conceder el permiso.
Instalar la app no concede ese permiso automáticamente. En Android se requiere
un navegador compatible y permiso de notificaciones. Cada dispositivo se registra
por separado; desactivar uno no desactiva los demás.

El administrador ve además el formulario de título, mensaje y destino (Inicio,
Menú de la cena, Equipos o Confirmados). Primero previsualiza y luego confirma
el envío a todos los dispositivos activados. El historial diferencia aceptación
por el servicio push, fallas, dispositivos vencidos/desactivados, entregas sin
confirmación y pendientes. Aceptación no equivale a visualización o lectura.

Las claves VAPID se generan al abrir Notificaciones con la cuenta admin por primera
vez. La clave privada queda cifrada en Supabase Vault y solo el backend puede
consultarla. No se debe generar ni rotar esa clave en cada despliegue: invalidaría
las suscripciones existentes. El frontend recibe únicamente la clave pública.
Los usuarios no pueden leer endpoints ajenos ni el historial administrativo.

El service worker `public/push-sw.js` solo maneja notificaciones y sus clics; no
cachea archivos de la aplicación. Usa el logo de la app y permite únicamente
destinos locales conocidos. Al cerrar sesión se intenta quitar el dispositivo
del backend y cancelar su suscripción local; también se limpia el estado de la
cuenta anterior.

La función `push-notifications` valida la sesión con `auth.getUser()` y el email
admin en el servidor. El gateway tiene `verify_jwt=false` porque la función hace
esa verificación explícita, compatible con las claves JWT actuales. No es un
endpoint de envío anónimo. Las suscripciones solo aceptan HTTPS de proveedores
push conocidos, y el sender no sigue redirecciones.

Los envíos tienen un ID persistente y un snapshot de dispositivos. Cada lote
reclama hasta 15 entregas y procesa cinco en paralelo. Los reintentos continúan
pendientes sin repetir las ya procesadas. Ante pérdida de respuesta, se debe usar
**Reintentar el mismo envío**; los dispositivos con resultado incierto no se
reenvían automáticamente. Si se cierra la pantalla antes de terminar, un envío
registrado puede continuarse desde el historial. Las reclamaciones interrumpidas
se marcan sin confirmación tras 90 segundos al continuar el envío.

`database/push-notifications.sql` y la Edge Function ya están aplicados al proyecto
actual. Para otro proyecto, aplicar ese esquema (requiere Vault) y desplegar:

```bash
supabase functions deploy push-notifications --project-ref TU_PROJECT_REF
```

Los archivos de la función están en `supabase/functions/push-notifications/`.
Un push a GitHub despliega el frontend en Netlify, pero no actualiza por sí solo
las Edge Functions de Supabase. Al agregar otro dominio, actualizar la lista de
orígenes permitidos de la función y volver a desplegarla.

```bash
npm run test:push
```

Estas pruebas verifican autenticación, cifrado Web Push real, endpoints, reintentos,
fallas, service worker y activación del dispositivo con APIs simuladas.
`database/tests/push-notifications.sql` verifica permisos, Vault y entregas con
roles reales sin enviar nada y revierte todos sus datos con `ROLLBACK`.
La recepción y los permisos nativos requieren una prueba manual en teléfonos.
Esta versión incluye envíos manuales; todavía no programa recordatorios semanales.

## Equipos por DT / Capitanes

Desde **Inicio → DT / Capitanes** o **Partido → Confirmados**, el administrador
puede asignar dos capitanes manualmente o sortearlos cuando haya al menos ocho
confirmados para jugar. El sorteo prioriza a quienes dirigieron menos fechas con
partido cerrado y evita los capitanes del partido anterior si hay alternativas.
Cada capitán integra su propio equipo y el primer turno se sortea.

Los capitanes eligen por turnos entre los disponibles y asignan posiciones dentro
de su equipo. Los demás usuarios consultan la selección. Los jugadores nuevos
quedan disponibles para continuar eligiendo; si hay bajas, la elección se pausa
hasta que el administrador quite o reemplace al jugador. Para reemplazar a un
capitán también puede promover a un compañero. El administrador puede cambiar de
equipo a un jugador que no sea capitán para reequilibrar los equipos.

El administrador confirma los equipos antes de iniciar: mínimo cuatro por equipo,
sin bajas ni confirmados pendientes y con diferencia máxima de un jugador. Nuevas
elecciones o cambios de posición requieren volver a confirmar. El inicio vuelve a
validar los RSVP actuales y cierra la edición. El modo clásico sigue disponible;
volver a él reinicia los capitanes y la selección de esa fecha, previa confirmación.

`database/captain-draft.sql` ya está aplicado al proyecto actual. Los permisos,
turnos, balance, control de versiones y reintentos se validan en una RPC atómica;
no se agregan permisos de edición general de eventos a los capitanes.

```bash
npm run test:captains
```

`database/tests/captain-draft.sql` verifica el flujo con roles reales y un evento
sintético que se revierte por completo con `ROLLBACK`. Requiere un administrador
y al menos nueve jugadores existentes. Para comprobar la interacción entre
dispositivos: abrir la selección con cada capitán, elegir un jugador, actualizar
el otro dispositivo y verificar el turno; luego sumar un jugador y probar una baja.
