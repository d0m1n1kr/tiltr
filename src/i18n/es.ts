import type { Dict } from './de';

export const es: Dict = {
  /* --- App / pantalla de inicio --- */
  'app.tagline': 'Una bola. Un laberinto invisible.<br>El sonido, la vibración y la luz te muestran el camino.',
  'app.headphones': '🎧 Mejor con auriculares',
  'app.sensorNote': 'Al empezar se activan los sensores de movimiento y el audio.<br>En escritorio: flechas/WASD, espacio = ping.',

  'menu.quick': 'Partida rápida',
  'menu.quick.best': 'Récord ({preset}): {time}',
  'menu.daily': 'Reto diario',
  'menu.daily.open': 'Hoy aún pendiente',
  'menu.daily.done': 'Hoy: {time}',
  'menu.daily.streak': ' · 🔥 {n} días',
  'menu.campaign': 'Campaña',
  'menu.campaign.sub': '2 mundos llenos de guardianes, llaves y pisos',
  'menu.mp': 'Multijugador',
  'menu.mp.sub': 'Coop y carrera – para dos, por código QR',
  'menu.tutorial': 'Tutorial',
  'menu.tutorial.sub': 'Aprende los sonidos de la oscuridad',
  'menu.tutorial.new': '¡Empieza aquí!',
  'menu.gallery': 'Galería de elementos',
  'menu.gallery.sub': 'Ver y escuchar cada elemento',
  'preset.easy': 'Fácil',
  'preset.normal': 'Medio',
  'preset.hard': 'Difícil',

  /* --- Común --- */
  'common.close': 'Cerrar',
  'common.menu': 'Menú',
  'common.go': '¡Vamos!',
  'common.next': 'Siguiente',
  'common.again': '⟳ Otra vez',
  'common.toMenu': 'Al menú',
  'common.cancel': 'Cancelar',
  'common.ok': 'OK',
  'common.listen': '🔊 Escuchar',
  'common.level': 'Nivel',

  /* --- HUD --- */
  'hud.calibrate': 'Recalibrar la inclinación',
  'hud.debug': 'Vista debug (mostrar el laberinto)',
  'hud.home': 'Volver al menú',
  'hud.keys': 'Teclas (WASD/flechas)',
  'hud.tilt': 'Inclinación',

  'calib.title': 'Calibración',
  'calib.text': 'Sujeta ahora el móvil <b>plano como una bandeja</b> –<br>tal y como quieras jugar.',

  /* --- Estado / avisos --- */
  'st.fell': '¡Caíste en un agujero! 🕳',
  'st.caught': '¡Atrapado! 👁',
  'st.win': 'Meta en {time} 🎉',
  'st.door': '¡Puerta abierta! 🔑',
  'st.gem': '💎 ¡Gema!',
  'st.checkpoint': '¡Checkpoint! ✓ +1 ping',
  'st.floorDown': '⬇ Piso {n}',
  'st.floorUp': '⬆ Piso {n}',
  'st.portal': '✦ Portal',
  'st.wallDown': '¡Muro derrumbado! 🧱',

  /* --- Tarjetas de resultado --- */
  'res.time': 'Tiempo: {time}',
  'res.newBest': ' – ¡nuevo récord!',
  'res.newBestLine': '¡Nuevo récord!',
  'res.par': ' (par {n} s)',
  'res.falls': 'Caídas: {n}',
  'res.tutTitle': '{name} – ¡conseguido! 🎉',
  'res.tutProgress': 'Tutorial: {done}/{total}',
  'res.tutDone': 'Tutorial completado: ¡estás listo para la oscuridad!',
  'res.winTitle': 'Meta en {time} 🎉',

  /* --- Reto diario --- */
  'daily.name': 'Reto diario',
  'daily.intro': '{label}. Un nivel para todos, cada día uno nuevo: tu primera llegada cuenta como marca del día.',
  'daily.day0': 'Domingo – el programa completo',
  'daily.day1': 'Lunes – comienzo suave',
  'daily.day2': 'Martes – primer viento en contra',
  'daily.day3': 'Miércoles – el guardián despierta',
  'daily.day4': 'Jueves – tres pisos de profundidad',
  'daily.day5': 'Viernes – la cosa se estrecha',
  'daily.day6': 'Sábado – profundo y vigilante',
  'daily.introTitle': '📅 Reto {date}',
  'daily.targetLine': '🎯 Desafío: ¡bate {time}!',
  'daily.targetFlash': '🎯 ¡Bate {time}!',
  'daily.resultTitle': 'Reto {date} – {time}',
  'daily.first': '¡Tu marca del día! 🏁',
  'daily.training': 'Entrenamiento: tu marca del día sigue siendo {time}.',
  'daily.beat': '🎯 ¡Desafío superado ({time})!',
  'daily.notBeat': '🎯 No superado: el objetivo era {time}.',
  'daily.streakOne': '🔥 Racha: 1 día',
  'daily.streakMany': '🔥 Racha: {n} días',
  'daily.share': '📤 Desafiar',
  'daily.copied': '¡Enlace copiado! 📋',
  'daily.shareText': 'Reto diario de tiltr {date}: {time} – ¿puedes hacerlo más rápido?',
  'daily.challengeTitle': '🎯 ¡Desafío!',
  'daily.challengeText': 'Alguien te desafía en el reto diario del {date}.',
  'daily.challengeTextTarget': 'Alguien te desafía en el reto diario del {date}:\n¡Bate {time}!',
  'daily.accept': 'Aceptar',
  'daily.later': 'Más tarde',

  /* --- Multijugador --- */
  'mp.title': '👥 Multijugador',
  'mp.mode': 'Modo',
  'mp.coop': '🤝 Coop',
  'mp.race': '🏁 Carrera',
  'mp.hint.coop': 'Juntos: las placas de presión abren la puerta del compañero. Solo ganáis cuando AMBOS estáis en la meta.',
  'mp.hint.race': 'Uno contra otro: nivel idéntico, gana quien llegue primero. El halo muestra a tu rival.',
  'mp.pickLevel': 'Elegir nivel = abrir sala',
  'mp.orJoin': 'O únete a una sala',
  'mp.code': 'CÓDIGO',
  'mp.join': 'Unirse',
  'mp.scan': '📷 Escanear',
  'mp.scanHint': 'Apunta la cámara al código QR de la sala',
  'mp.waiting': 'Esperando a un jugador: escanea el QR o introduce el código …',
  'mp.connecting': 'Conectando …',
  'mp.connected': '¡Compañero conectado!',
  'mp.waitLevel': 'Conectado – esperando el nivel …',
  'mp.leftLobby': 'Tu compañero salió de la sala.',
  'mp.leftWait': 'Tu compañero salió de la sala – seguimos esperando …',
  'mp.rejoined': '¡El compañero ha vuelto! 🎉',
  'mp.ready': '¡Listo!',
  'mp.readyTitle': 'Listo ✓',
  'mp.waitPartner': 'Esperando a tu compañero …',
  'mp.leave': 'Salir',
  'mp.partnerFinished': '¡Tu compañero llegó a la meta!',
  'mp.coopWin': '🤝 ¡Conseguido juntos!',
  'mp.teamTime': 'Tiempo del equipo: {team}\nTú: {you} · Compañero: {partner}',
  'mp.raceTimes': 'Tú: {you}\nRival: {rival}',
  'mp.raceWin': '🏆 ¡Ganaste!',
  'mp.raceLose': 'Perdiste …',
  'mp.draw': '🤝 ¡Empate!',
  'mp.frozenCoop': '¡En la meta! Esperando a tu compañero …',
  'mp.frozenRace': '¡En la meta! Tu rival sigue rodando …',
  'mp.lostCountdown': 'Conexión perdida … {n}s',
  'mp.lostTitle': 'Conexión perdida',
  'mp.lostCoop': 'Tu compañero se fue: la coop os necesita a los dos.',
  'mp.lostRace': 'Tu rival se fue.',
  'mp.floors': '{n} pisos',

  /* --- Instalación / actualización / splash / galería --- */
  'inst.android': 'Instala tiltr como app: sin conexión y a pantalla completa.',
  'inst.button': 'Instalar',
  'inst.ios': 'Instalar como app: toca el icono de compartir {icon} y luego «Añadir a pantalla de inicio».',
  'upd.available': 'Nueva versión disponible',
  'upd.availableV': 'Nueva versión v{v} disponible',
  'upd.button': 'Actualizar',
  'splash.credit': 'Un juego de Dominik Rössler & Claude',
  'gallery.title': '🧩 Galería de elementos',

  /* --- Galería de elementos --- */
  'el.hole.title': 'Agujero',
  'el.hole.desc':
    'Se traga la bola y la atrae en cuanto rueda sobre el borde. Los agujeros que respiran se abren y cierran en ciclos: cerrados son inofensivos. Firma: retumbo oscuro, latido, vibración de aviso.',
  'el.windZone.title': 'Zona de viento',
  'el.windZone.desc':
    'Celda invisible con fuerza de viento constante: hay que inclinar en contra. Firma: soplo racheado que crece desde la dirección de la zona.',
  'el.checkpoint.title': 'Checkpoint',
  'el.checkpoint.desc':
    'Anillo invisible en el camino. Al tocarlo: punto de reaparición tras una caída y +1 ping de eco. Firma: doble tono amable, doble vibración.',
  'el.guard.title': 'Guardián',
  'el.guard.desc':
    'Patrulla los pasillos y te devuelve al último checkpoint al tocarte. Firma: zumbido amenazante y pulsante desde su dirección, y tu corazón se acelera.',
  'el.key.title': 'Llave y puerta',
  'el.key.desc':
    'La llave tintinea metálica a lo lejos; la puerta cerrada responde al ping de eco con un sonido sordo. Recoge la llave y la puerta se abre deslizándose.',
  'el.door.title': 'Puerta',
  'el.door.desc':
    'Un muro cerrado con firma de ping propia: más sordo y lleno que un muro normal. Solo la llave correcta lo abre, y entonces se aparta retumbando.',
  'el.gem.title': 'Gema',
  'el.gem.desc':
    'Cristal brillante fuera del camino. Responde al ping de eco con un doble tono claro: quien las reúne todas gana la tercera estrella.',
  'el.transporter.title': 'Transportador',
  'el.transporter.desc':
    'Te lleva a otro piso, o a través del mapa como un portal. Firma: doble tono flotante cerca; al saltar, un brillo que cae o asciende. Responde al ping con un doble eco ascendente.',
  'el.plate.title': 'Placa de presión y puerta del compañero',
  'el.plate.desc':
    'Coop: mientras tu compañero mantiene la placa, tu puerta se abre; si la suelta, se cierra de nuevo. Misma firma dorada que la puerta que abre. Solo en multijugador.',
  'el.wallEcho.title': 'Muro y eco',
  'el.wallEcho.desc':
    'Los muros son invisibles; al tocarlos brillan un instante y suenan como un golpe sordo desde su dirección. Los muros frágiles (ámbar) crujen y se derrumban tras 3 golpes fuertes.',
  'el.goal.title': 'Baliza de meta',
  'el.goal.desc': 'El ping sonar de la meta: cuanto más cerca, más rápido, fuerte y agudo. Dirección por audio espacial.',
  'el.ping.title': 'Ping de eco',
  'el.ping.desc':
    'Impulso sonar activo (toque/espacio, reserva limitada): un frente de onda revela el entorno y las reflexiones vuelven retrasadas por la distancia; muros claros, agujeros graves.',
  'el.heart.title': 'Latido',
  'el.heart.desc': 'Se acelera y sube cuanto más cerca está un agujero abierto. Si el pulso baja, el camino está libre.',

  /* --- Mundos y niveles --- */
  'world.w1': 'Mundo 1 – Las profundidades despiertan',
  'world.w2': 'Mundo 2 – Entre los pisos',

  'lv.tut-1.name': 'Rodar y escuchar',
  'lv.tut-1.intro':
    'Inclina el móvil con suavidad: la bola rueda. Escucha el ping sonar: viene de la dirección de la meta y se acelera cuanto más cerca estás. ¡Rueda a la derecha!',
  'lv.tut-2.name': 'Muros y eco',
  'lv.tut-2.intro':
    'Los muros son invisibles. Si tocas uno, oyes un golpe sordo desde su dirección, y brilla un instante. Ve palpando el camino.',
  'lv.tut-3.name': 'El ping de eco',
  'lv.tut-3.intro':
    'Toca la pantalla: un ping de eco revela el entorno un instante; los muros cercanos responden primero. Tu reserva es escasa, úsala con cabeza.',
  'lv.tut-4.name': 'El retumbo',
  'lv.tut-4.intro':
    '¿Oyes ese retumbo oscuro? Ahí espera un agujero. Cuanto más te acercas, más fuerte suena, y tu corazón se acelera. Pasa con sigilo o toma el desvío de abajo.',
  'lv.tut-5.name': 'Agujeros que respiran',
  'lv.tut-5.intro':
    'Este agujero respira: se abre y se cierra. Cerrado es inofensivo y silencioso. Espera a que el retumbo calle y entonces rueda por encima.',
  'lv.tut-6.name': 'Viento en contra',
  'lv.tut-6.intro': 'Ese soplido delante de ti es viento: te empuja hacia atrás. Inclina más fuerte en contra y ábrete paso.',
  'lv.tut-7.name': 'Muros frágiles',
  'lv.tut-7.intro':
    'Algunos muros crujen cuando los embistes: son frágiles. Dos golpes fuertes y se derrumban. El único camino a la meta pasa por este muro.',
  'lv.tut-8.name': 'El ancla',
  'lv.tut-8.intro':
    'El doble tono amable es un checkpoint: tras una caída sigues desde ahí, y recarga un ping de eco. Detrás respira un agujero. No temas caer.',

  'lv.w1-01.name': 'La partida',
  'lv.w1-01.intro':
    'Bienvenido a la oscuridad. Sigue el ping de la meta: el muro izquierdo te lleva hacia abajo y luego se sigue a la derecha.',
  'lv.w1-02.name': 'Camino hondo',
  'lv.w1-02.intro': 'La bajada respira: dos agujeros se abren y se cierran. Escucha el retumbo y espera al silencio.',
  'lv.w1-03.name': 'Primera guardia',
  'lv.w1-03.intro':
    'Algo zumba. Un guardián patrulla el pasillo superior: si te toca, te lanza hacia atrás. Escucha bien dónde está.',
  'lv.w1-04.name': 'Cerrajero',
  'lv.w1-04.intro':
    'Justo antes de la meta una puerta corta el camino: responde a tu ping con un sonido sordo. En alguna parte tintinea su llave.',
  'lv.w1-05.name': 'Destellos',
  'lv.w1-05.intro':
    '¿Oyes ese doble eco claro a tu ping? ¡Gemas! Están fuera del camino. Quien reúne las tres gana la tercera estrella.',
  'lv.w1-06.name': 'Corriente',
  'lv.w1-06.intro': 'En el pasillo superior el viento te hace frente. Aguanta, y no dejes que te arrastre al agujero de detrás.',
  'lv.w1-07.name': 'Rompedor',
  'lv.w1-07.intro':
    'Aquí el camino está tapiado, pero algo cruje sospechosamente. Embiste los muros frágiles, esquiva al guardián de abajo y recoge lo que brilla.',
  'lv.w1-08.name': 'Guardia doble',
  'lv.w1-08.intro':
    'Dos guardianes, una puerta. La llave está en medio del pasillo vigilado de la derecha: cógela cuando la guardia haya pasado.',
  'lv.w1-09.name': 'Sin aliento',
  'lv.w1-09.intro':
    'El largo descenso: cinco agujeros respiran a contratiempo y abajo el viento te empuja justo adonde no quieres ir. La paciencia gana.',
  'lv.w1-10.name': 'Piedra angular',
  'lv.w1-10.intro':
    'Todo lo que has aprendido: dos guardias, una puerta, atajos frágiles, agujeros que respiran y viento. Dos caminos llevan a la meta: elige bien.',

  'lv.w2-01.name': 'Paso subterráneo',
  'lv.w2-01.intro':
    'Un muro sella el camino, pero ¿oyes ese flotar? Un transportador lleva hacia abajo. Cruza la oscuridad por debajo y sube en otro punto.',
  'lv.w2-02.name': 'Doble fondo',
  'lv.w2-02.intro':
    'La puerta de arriba calla: su llave tintinea bajo tus pies. Baja, esquiva a la guardia, coge la llave y vuelve a la luz por otro lado.',
  'lv.w2-03.name': 'El ascensor',
  'lv.w2-03.intro':
    'Cada vez más hondo: dos pozos hacia abajo, al fondo espera el destello, y un ascensor que te sube directo a la cámara de meta sellada.',
  'lv.w2-04.name': 'Portales gemelos',
  'lv.w2-04.intro':
    'Dos portales en un piso, una meta sellada. Salta y aprende dónde aterrizas. El doble tono ascendente de tu ping delata los portales.',
  'lv.w2-05.name': 'Catedral',
  'lv.w2-05.intro':
    'Tres pisos abajo yace la llave de la cripta. Rompe lo que cruje, desafía al viento y a la guardia, y sube de vuelta a la luz con la llave.',

  'lv.coop-01.name': 'La esclusa',
  'lv.coop-01.intro':
    'La cámara de meta solo se abre mientras uno de vosotros mantiene la placa de delante. Y quien descansa en la meta mantiene la placa interior, para el rezagado. ¡Uno sujeta, otro rueda!',
  'lv.coop-02.name': 'Juego de relevos',
  'lv.coop-02.intro':
    'La placa de la puerta de meta está en su propia cámara cerrada. Liberaos mutuamente: cada cámara tiene dentro una placa para autoliberarse.',
  'lv.coop-03.name': 'Acción a distancia',
  'lv.coop-03.intro':
    'La placa de la cámara de meta está arriba del todo, en la salida. Uno se queda y sujeta; el otro recorre el largo camino, contra el viento y junto a un agujero que respira. Luego el primero sujeta la puerta desde la meta.',
  'lv.coop-04.name': 'Esclusa doble',
  'lv.coop-04.intro':
    'Como Juego de relevos, pero con maldad: el suelo respira entre las cámaras y una guardia patrulla el cruce. Todo es cuestión de timing.',
  'lv.coop-05.name': 'Cuatro manos, dos pisos',
  'lv.coop-05.intro':
    'El final: la placa de la puerta de meta está un piso MÁS ABAJO. Uno baja y sujeta; el otro rueda a la meta, y desde allí sujeta la puerta para el que vuelve. ¡Quien descansa en la meta sigue sujetando!',

  'lv.race-01.name': 'Sprint',
  'lv.race-01.intro': 'Mismo recorrido, mismas oportunidades: gana quien llegue primero. El halo te dice dónde está tu rival.',
  'lv.race-02.name': 'Viento en contra',
  'lv.race-02.intro': 'Dos zonas de viento se interponen entre tú y la meta. Gana la carrera quien mejor aguante.',
  'lv.race-03.name': 'Baqueta',
  'lv.race-03.intro':
    'Una guardia patrulla la recta final. Quien es atrapado vuela de vuelta al checkpoint y pierde valiosos segundos.',
  'lv.race-04.name': 'Pista rompedora',
  'lv.race-04.intro':
    'Muchos muros aquí son frágiles: quien embiste con valor encuentra atajos. Quien se pasa de valiente pierde velocidad en el muro equivocado.',
  'lv.race-05.name': 'Prueba reina',
  'lv.race-05.intro': 'La gran carrera: larga, honda, vigilada y frágil. Todo lo que has aprendido, más rápido que tu rival.',
};
