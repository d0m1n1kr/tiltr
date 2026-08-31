// Deutsches Referenz-Wörterbuch: definiert die Schlüsselmenge für alle
// Sprachen (en/fr/es sind als Record<keyof typeof de, string> typisiert).
// {platzhalter} werden von t() ersetzt; Schlüssel mit HTML (<b>, <br>)
// werden nur über data-i18n-html bzw. innerHTML-Stellen eingesetzt.

export const de = {
  /* --- App / Startscreen --- */
  'app.tagline': 'Ein Ball. Ein unsichtbares Labyrinth.<br>Klang, Vibration und Licht zeigen dir den Weg.',
  'app.headphones': '🎧 Am besten mit Kopfhörern',
  'app.sensorNote': 'Beim Start werden Bewegungssensoren &amp; Audio aktiviert.<br>Desktop: Pfeiltasten/WASD, Leertaste = Ping.',

  'menu.quick': 'Schnelles Spiel',
  'menu.quick.best': 'Bestzeit ({preset}): {time}',
  'menu.daily': 'Tages-Challenge',
  'menu.daily.open': 'Heute noch offen',
  'menu.daily.done': 'Heute: {time}',
  'menu.daily.streak': ' · 🔥 {n} Tage',
  'menu.campaign': 'Kampagne',
  'menu.campaign.sub': '4 Welten, 28 Level',
  'menu.mp': 'Multiplayer',
  'menu.mp.sub': 'Coop & Race – zu zweit, per QR-Code',
  'menu.tutorial': 'Tutorial',
  'menu.tutorial.sub': 'Lerne die Klänge der Dunkelheit',
  'menu.tutorial.new': 'Start hier!',
  'menu.gallery': 'Element-Galerie',
  'menu.gallery.sub': 'Alle Elemente sehen & hören',
  'menu.workshop': 'Werkstatt',
  'menu.workshop.sub': 'Eigene Level bauen & testen',
  'preset.easy': 'Leicht',
  'preset.normal': 'Mittel',
  'preset.hard': 'Schwer',

  /* --- Gemeinsames --- */
  'common.close': 'Schließen',
  'common.menu': 'Menü',
  'common.go': 'Los!',
  'common.next': 'Weiter',
  'common.again': '⟳ Nochmal',
  'common.toMenu': 'Zum Menü',
  'common.cancel': 'Abbrechen',
  'common.ok': 'OK',
  'common.listen': '🔊 Anhören',
  'common.level': 'Level',

  /* --- HUD --- */
  'hud.calibrate': 'Neigung neu kalibrieren',
  'hud.debug': 'Debug-Ansicht (Labyrinth zeigen)',
  'hud.home': 'Zurück zum Menü',
  'hud.keys': 'Tasten (WASD/Pfeile)',
  'hud.tilt': 'Neigung',
  'hud.edit': 'Zurück zum Editor',

  /* --- Werkstatt / Editor --- */
  'ed.new': '＋ Neues Level',
  'ws.resume': 'Weiter an „{name}"',
  'ws.discardConfirm': 'Sicher? Aktuelle Bearbeitung geht verloren',
  'ed.newRandom': '🎲 Aus Zufallslevel',
  'ed.empty': 'Noch keine eigenen Level – bau dein erstes!',
  'ed.untitled': 'Mein Level',
  'ed.copySuffix': '(Kopie)',
  'ed.play': 'Spielen',
  'ed.edit': 'Bearbeiten',
  'ed.duplicate': 'Duplizieren',
  'ed.delete': 'Löschen',
  'ed.deleteConfirm': 'Wirklich?',
  'ed.back': 'Zurück zur Werkstatt',
  'ed.namePh': 'Levelname',
  'ed.test': '▶ Testen',
  'ed.save': 'Speichern',
  'ed.saved': 'Gespeichert ✓',
  'ed.saveFailed': 'Speichern fehlgeschlagen (Speicher voll oder blockiert)',
  'ed.backToEditor': '✏️ Zurück zum Editor',
  'ed.tools': 'Werkzeuge',
  'ed.elements': 'Elemente',
  'ed.props': 'Eigenschaften',
  'ed.level': 'Level',
  'ed.selected': 'Auswahl',
  'ed.tool.select': 'Auswählen',
  'ed.tool.wall': 'Wand',
  'ed.tool.erase': 'Radieren',
  'ed.tool.start': 'Start',
  'ed.tool.goal': 'Ziel',
  'ed.edgeHint': 'Auf eine Wandkante tippen (Linie zwischen zwei Zellen).',
  'ed.guardSecond': 'Wächter: zweiten Wegpunkt in derselben Zeile/Spalte antippen.',
  'ed.guardBad': 'Patrouille muss gerade verlaufen – nochmal ansetzen.',
  'ed.intro': 'Intro-Text',
  'ed.par': 'Par-Zeit (s)',
  'ed.pings': 'Ping-Budget',
  'ed.cols': 'Spalten',
  'ed.rows': 'Zeilen',
  'ed.reroll': 'Maze neu würfeln',
  'ed.deleteEl': 'Element löschen',
  'ed.check.load': 'Lädt',
  'ed.check.links': 'Verknüpfungen',
  'ed.check.goal': 'Ziel erreichbar',
  'ed.check.openers': 'Öffner vor Tür',
  'ed.check.timer': 'Timer reicht',
  'ed.check.softlock': 'Kein Softlock',
  'ed.check.hazards': 'Gefahren abseits',
  'ed.check.items': 'Sammelziele frei',
  'ed.f.dir': 'Richtung',
  'ed.f.force': 'Kraft',
  'ed.f.speed': 'Tempo (px/s)',
  'ed.f.opens': 'Öffnet Tür',
  'ed.f.id': 'Tür-ID',
  'ed.f.openers': 'Öffner',
  'ed.f.target': 'Ziel',
  'ed.linkPick': 'Tür wählen',
  'ed.linkHint': 'Tippe die Tür an, die geöffnet werden soll.',
  'ed.linkMiss': 'Keine Tür getroffen – tippe eine Türkante.',
  'ed.linkSameFloor': 'Zeitschloss und Tür müssen auf derselben Ebene liegen.',
  'ed.retargetPick': 'Ziel neu wählen',
  'ed.retargetHint': 'Tippe die neue Ziel-Zelle an (Ebenenwechsel erlaubt).',
  'ed.idTaken': 'Diese Tür-ID gibt es schon.',
  'ed.relinked': 'Öffner umgehängt auf',
  'ed.orphaned': 'Öffner ohne Tür – siehe Badge „Verknüpfungen".',
  'ed.f.duration': 'Timer (s)',
  'ed.f.offset': 'Versatz (s)',
  'ed.f.openS': 'Offen (s)',
  'ed.f.closedS': 'Zu (s)',
  'ed.f.radius': 'Radius',
  'ed.f.mode': 'Verhalten',
  'ed.f.breathing': 'atmend',
  'ed.f.static': 'dauerhaft offen',
  'ed.share': 'Share-Link teilen',
  'ed.export': 'Als Datei exportieren',
  'ed.import': '⇪ Importieren',
  'ed.importFile': '📄 Datei wählen',
  'ed.importGo': 'Übernehmen',
  'ed.importPh': 'Level-JSON hier einfügen …',
  'ed.importOk': '„{name}" importiert ✓',
  'ed.importBad': 'Kein gültiges tiltr-Level.',
  'ed.shareCopied': 'Link kopiert! 📋',
  'ed.shareBlocked': 'Erst alle Pflicht-Badges grün machen.',
  'ed.shareBig': 'Achtung: sehr großer Link – lieber als Datei exportieren.',
  'ed.fit': 'Ansicht einpassen',
  'ed.addFloor': 'Ebene hinzufügen',
  'ed.removeFloor': 'Aktive Ebene entfernen',
  'ed.transporterTarget': 'Transporter: Ziel antippen – Ebenenwechsel über die Tabs erlaubt.',
  'ed.transporterSame': 'Ziel muss eine andere Zelle sein.',
  'ed.cellTaken': 'Feld ist belegt – Elemente brauchen ein freies Feld.',
  'share.title': '🛠 Geteiltes Level',
  'share.text': 'Jemand teilt „{name}" mit dir. Ausprobieren – oder gleich in deine Werkstatt übernehmen?',
  'share.try': 'Ausprobieren',
  'share.keep': 'In die Werkstatt',
  'share.bad': 'Dieser Level-Link ist beschädigt oder unvollständig.',

  'calib.title': 'Kalibrierung',
  'calib.text': 'Halte das Handy jetzt <b>flach wie ein Tablett</b> –<br>so, wie du spielen willst.',

  /* --- Status / Flash --- */
  'st.fell': 'In ein Loch gestürzt! 🕳',
  'st.caught': 'Erwischt! 👁',
  'st.win': 'Ziel in {time} 🎉',
  'st.door': 'Tür geöffnet! 🔑',
  'st.gem': '💎 Gem!',
  'st.checkpoint': 'Checkpoint! ✓ +1 Ping',
  'st.floorDown': '⬇ Ebene {n}',
  'st.floorUp': '⬆ Ebene {n}',
  'st.portal': '✦ Portal',
  'st.wallDown': 'Wand eingestürzt! 🧱',
  'st.switch': '⏱ Zeitschloss: Tür {n} s offen!',
  'st.crystal': '✦ Echo-Kristall: +1 Ping!',
  'st.glass': 'Es knackt unter dir … 🩹',

  /* --- Ergebnis-Karten --- */
  'res.time': 'Zeit: {time}',
  'res.newBest': ' – neue Bestzeit!',
  'res.newBestLine': 'Neue Bestzeit!',
  'res.par': ' (Par {n} s)',
  'res.falls': 'Stürze: {n}',
  'res.blind': '🌑 Blind-Stern – ohne einen einzigen Ping!',
  'res.tutTitle': '{name} – geschafft! 🎉',
  'res.tutProgress': 'Tutorial: {done}/{total}',
  'res.tutDone': 'Tutorial abgeschlossen – du bist bereit für die Dunkelheit!',
  'res.winTitle': 'Ziel in {time} 🎉',

  /* --- Tages-Challenge --- */
  'daily.name': 'Tages-Challenge',
  'daily.intro': '{label}. Ein Level für alle, jeden Tag ein neues – dein erster Zieleinlauf zählt als Tageswert.',
  'daily.day0': 'Sonntag – das volle Programm',
  'daily.day1': 'Montag – sanfter Einstieg',
  'daily.day2': 'Dienstag – erster Gegenwind',
  'daily.day3': 'Mittwoch – die Wache erwacht',
  'daily.day4': 'Donnerstag – drei Ebenen tief',
  'daily.day5': 'Freitag – es wird eng',
  'daily.day6': 'Samstag – tief und wachsam',
  'daily.introTitle': '📅 Challenge {date}',
  'daily.targetLine': '🎯 Herausforderung: schlag {time}!',
  'daily.targetFlash': '🎯 Schlag {time}!',
  'daily.resultTitle': 'Challenge {date} – {time}',
  'daily.first': 'Dein Tageswert! 🏁',
  'daily.training': 'Training – dein Tageswert bleibt {time}.',
  'daily.beat': '🎯 Herausforderung geschlagen ({time})!',
  'daily.notBeat': '🎯 Nicht geschlagen – Vorgabe war {time}.',
  'daily.streakOne': '🔥 Serie: 1 Tag',
  'daily.streakMany': '🔥 Serie: {n} Tage',
  'daily.share': '📤 Herausfordern',
  'daily.copied': 'Link kopiert! 📋',
  'daily.shareText': 'tiltr Tages-Challenge {date}: {time} – schaffst du das schneller?',
  'daily.challengeTitle': '🎯 Herausforderung!',
  'daily.challengeText': 'Jemand fordert dich in der Tages-Challenge vom {date} heraus.',
  'daily.challengeTextTarget': 'Jemand fordert dich in der Tages-Challenge vom {date} heraus:\nSchlag {time}!',
  'daily.accept': 'Annehmen',
  'daily.later': 'Später',

  /* --- Multiplayer --- */
  'mp.title': '👥 Multiplayer',
  'mp.mode': 'Modus',
  'mp.coop': '🤝 Coop',
  'mp.race': '🏁 Race',
  'mp.hint.coop': 'Gemeinsam: Druckplatten öffnen die Tür des Partners. Gewonnen ist erst, wenn BEIDE im Ziel sind.',
  'mp.hint.race': 'Gegeneinander: identisches Level, wer zuerst im Ziel ist, gewinnt. Der Halo zeigt den Gegner.',
  'mp.pickLevel': 'Level wählen = Raum eröffnen',
  'mp.orJoin': 'Oder einem Raum beitreten',
  'mp.code': 'RAUMCODE',
  'mp.join': 'Beitreten',
  'mp.scan': '📷 Scannen',
  'mp.scanHint': 'QR-Code des Raums vor die Kamera halten',
  'mp.waiting': 'Warte auf Mitspieler – QR scannen oder Code eingeben …',
  'mp.connecting': 'Verbinde …',
  'mp.connected': 'Partner verbunden!',
  'mp.waitLevel': 'Verbunden – warte auf Level …',
  'mp.leftLobby': 'Partner hat den Raum verlassen.',
  'mp.leftWait': 'Partner hat den Raum verlassen – warte weiter …',
  'mp.rejoined': 'Partner wieder da! 🎉',
  'mp.ready': 'Bereit!',
  'mp.readyTitle': 'Bereit ✓',
  'mp.waitPartner': 'Warte auf deinen Partner …',
  'mp.leave': 'Verlassen',
  'mp.partnerFinished': 'Partner ist im Ziel!',
  'mp.coopWin': '🤝 Gemeinsam geschafft!',
  'mp.teamTime': 'Team-Zeit: {team}\nDu: {you} · Partner: {partner}',
  'mp.raceTimes': 'Du: {you}\nGegner: {rival}',
  'mp.raceWin': '🏆 Gewonnen!',
  'mp.raceLose': 'Verloren …',
  'mp.draw': '🤝 Unentschieden!',
  'mp.frozenCoop': 'Im Ziel! Warte auf deinen Partner …',
  'mp.frozenRace': 'Im Ziel! Der Gegner rollt noch …',
  'mp.lostCountdown': 'Verbindung verloren … {n}s',
  'mp.lostTitle': 'Verbindung verloren',
  'mp.lostCoop': 'Dein Partner ist weg – Coop braucht euch beide.',
  'mp.lostRace': 'Dein Gegner ist weg.',
  'mp.floors': '{n} Ebenen',
  'mp.random': 'Zufallslevel',
  'mp.error': 'Verbindung fehlgeschlagen – bitte nochmal versuchen.',

  /* --- Install / Update / Splash / Galerie --- */
  'inst.android': 'tiltr als App installieren – offline & im Vollbild.',
  'inst.button': 'Installieren',
  'inst.ios': 'Als App installieren: Teilen-Symbol {icon} tippen, dann „Zum Home-Bildschirm".',
  'upd.available': 'Neue Version verfügbar',
  'upd.availableV': 'Neue Version v{v} verfügbar',
  'upd.button': 'Aktualisieren',
  'splash.credit': 'Ein Spiel von Dominik Rössler & Claude',
  'gallery.title': '🧩 Element-Galerie',

  /* --- Element-Galerie --- */
  'el.hole.title': 'Loch',
  'el.hole.desc':
    'Verschluckt den Ball und zieht ihn an, sobald er über den Rand rollt. Atmende Löcher öffnen und schließen sich zyklisch – geschlossen sind sie harmlos. Signatur: dunkles Grollen, Herzschlag, Warnvibration.',
  'el.windZone.title': 'Windzone',
  'el.windZone.desc':
    'Unsichtbare Zelle mit konstanter Windkraft – man muss dagegen neigen. Signatur: böiges Rauschen, das aus Richtung der Zone anschwillt.',
  'el.checkpoint.title': 'Checkpoint',
  'el.checkpoint.desc':
    'Unsichtbarer Ring auf dem Weg. Einmal berührt: Respawn-Punkt nach einem Sturz und +1 Echo-Ping. Signatur: freundlicher Doppelklang, doppelte Vibration.',
  'el.guard.title': 'Wächter',
  'el.guard.desc':
    'Patrouilliert durch die Gänge und wirft dich beim Berühren zum letzten Checkpoint zurück. Signatur: bedrohliches, pulsierendes Brummen aus seiner Richtung – und dein Herz schlägt schneller.',
  'el.key.title': 'Schlüssel & Tür',
  'el.key.desc':
    'Der Schlüssel klimpert metallisch in der Ferne, die verschlossene Tür antwortet dumpf auf den Echo-Ping. Schlüssel einsammeln – und die Tür gleitet hörbar auf.',
  'el.door.title': 'Tür',
  'el.door.desc':
    'Eine verschlossene Wand mit eigener Ping-Signatur: dumpfer, satter als normale Wände. Öffnet sich nur mit dem passenden Schlüssel – dann gleitet sie polternd auf.',
  'el.gem.title': 'Gem',
  'el.gem.desc':
    'Funkelnder Kristall abseits des Weges. Antwortet auf den Echo-Ping mit einem hellen Doppelklang – wer alle sammelt, verdient sich den dritten Stern.',
  'el.transporter.title': 'Transporter',
  'el.transporter.desc':
    'Trägt dich auf eine andere Ebene – oder als Portal quer über die Map. Signatur: schwebender Doppelton in der Nähe; beim Sprung ein Schimmern, das abwärts fällt oder aufwärts steigt. Antwortet auf den Ping mit aufsteigendem Doppel-Echo.',
  'el.plate.title': 'Druckplatte & Partnertür',
  'el.plate.desc':
    'Coop: Solange dein Partner die Platte hält, gleitet deine Tür auf – lässt er los, schließt sie wieder. Gleiche goldene Ping-Signatur wie die Tür, die sie öffnet. Nur im Multiplayer.',
  'el.wallEcho.title': 'Wand & Echo',
  'el.wallEcho.desc':
    'Wände sind unsichtbar; Berührung macht sie kurz sichtbar und klingt als dumpfer Thump aus ihrer Richtung. Brüchige Wände (bernstein) knirschen und stürzen nach 3 harten Treffern ein.',
  'el.goal.title': 'Ziel-Beacon',
  'el.goal.desc': 'Sonar-Ping des Ziels: je näher, desto schneller, lauter und höher. Richtung über Spatial Audio.',
  'el.ping.title': 'Echo-Ping',
  'el.ping.desc':
    'Aktiver Sonar-Impuls (Tap/Leertaste, begrenzter Vorrat): Wellenfront deckt die Umgebung auf, Reflexionen kommen entfernungs-verzögert zurück – Wände hell, Löcher tief.',
  'el.heart.title': 'Herzschlag',
  'el.heart.desc': 'Wird schneller und lauter, je näher ein offenes Loch ist. Fällt der Puls, ist der Weg frei.',
  'el.slidingWall.title': 'Schiebewand',
  'el.slidingWall.desc':
    'Eine Wand, die sich im Takt auf- und zuschiebt – nur voll geöffnet ist der Weg frei. Signatur: rhythmisches Steinschleifen beim Öffnen und Schließen, dazu ein beschleunigender Takt als Warnung, kurz bevor sie zufährt.',
  'el.timedSwitch.title': 'Zeitschloss-Schalter',
  'el.timedSwitch.desc':
    'Betreten öffnet die verknüpfte Tür – aber nur für ein paar Sekunden. Ein Ticken zählt die Zeit herunter und wird hektischer, je knapper sie wird; dann fällt die Tür hörbar wieder zu. Erneutes Betreten spannt das Uhrwerk neu.',
  'el.current.title': 'Strömung',
  'el.current.desc':
    'Ein Sog, der stärker schiebt, als du neigen kannst – eine Einbahnstraße. Was hinter der Strömung liegt, bleibt hinter dir. Signatur: pulsierendes, gerichtetes Rauschen, tiefer und drängender als Wind.',
  'el.listener.title': 'Horcher',
  'el.listener.desc':
    'Jagt dich, solange du rollst – er hört dich sogar durch Wände. Stehst du still, verliert er die Spur und zieht sich zurück. Signatur: Schnüffeln und Knistern, das mit deiner eigenen Rollgeschwindigkeit anschwillt. Stille ist deine Tarnung.',
  'el.fogZone.title': 'Nebelzone',
  'el.fogZone.desc':
    'Im Nebel klingt ALLES wie durch Watte – Wände, Gefahren, sogar der Sonar des Ziels. Er schiebt nicht und verschluckt nicht, aber er nimmt dir die Ohren. Präg dir den Kurs ein, bevor du eintauchst.',
  'el.ice.title': 'Eisfläche',
  'el.ice.desc':
    'Spiegelglatt: Einmal angerollt, gleitest du weiter – Bremsen wird zäh, Lenken schwammig. Signatur: kristallines Sirren unter dem Ball, das mit dem Tempo anschwillt. Plane den Schwung, bevor du ihn nimmst.',
  'el.echoCrystal.title': 'Echo-Kristall',
  'el.echoCrystal.desc':
    'Abgefüllter Ping: Einsammeln gibt +1 Echo-Ping – auch über den Rundenvorrat hinaus. Signatur: heller, einzelner Glockenton als Ping-Antwort, ein glasklarer Anschlag beim Einsammeln. Wer blind spielen will, lässt ihn liegen.',
  'el.anchor.title': 'Sog-Anker',
  'el.anchor.desc':
    'Zieht dich in seinem Radius an – je näher, desto zäher. Er verschluckt dich nicht, aber er kostet Kraft und Zeit; wer hindurchhält, kommt immer wieder frei. Signatur: elektrisches Brummen, das mit der Nähe anschwillt.',
  'el.glass.title': 'Glasboden',
  'el.glass.desc':
    'Eine Bodenzelle aus Glas: Beim ersten Überrollen knackt sie warnend, beim zweiten zerbricht sie – und wird zum offenen Loch, in das du stürzt. Einmal ist frei, zweimal ist gefallen. Signatur: helles Knacken, dann Splittern.',

  /* --- Welten & Level --- */
  'world.w1': 'Welt 1 – Die Tiefe erwacht',
  'world.w2': 'Welt 2 – Zwischen den Ebenen',
  'world.w3': 'Welt 3 – Das Räderwerk',
  'world.w4': 'Welt 4 – Die Stille',

  'lv.tut-1.name': 'Rollen & Lauschen',
  'lv.tut-1.intro':
    'Neige das Handy sanft – der Ball rollt. Höre auf den Sonar-Ping: Er kommt aus Richtung des Ziels und wird schneller, je näher du bist. Roll nach rechts!',
  'lv.tut-2.name': 'Wände & Echo',
  'lv.tut-2.intro':
    'Die Wände sind unsichtbar. Berührst du eine, hörst du einen dumpfen Schlag aus ihrer Richtung – und sie leuchtet kurz auf. Ertaste dir den Weg.',
  'lv.tut-3.name': 'Der Echo-Ping',
  'lv.tut-3.intro':
    'Tippe aufs Display: Ein Echo-Ping deckt die Umgebung kurz auf – nahe Wände antworten zuerst. Dein Vorrat ist knapp, setze ihn klug ein.',
  'lv.tut-4.name': 'Das Grollen',
  'lv.tut-4.intro':
    'Hörst du das dunkle Grollen? Dort wartet ein Loch. Je näher du kommst, desto lauter – und dein Herz schlägt schneller. Schleich dich vorbei oder nimm den Umweg unten.',
  'lv.tut-5.name': 'Atmende Löcher',
  'lv.tut-5.intro':
    'Dieses Loch atmet: Es öffnet und schließt sich. Geschlossen ist es harmlos und still. Warte, bis das Grollen verstummt – dann roll drüber.',
  'lv.tut-6.name': 'Gegenwind',
  'lv.tut-6.intro': 'Das Rauschen vor dir ist Wind – er drückt dich zurück. Neige stärker dagegen und kämpf dich durch.',
  'lv.tut-7.name': 'Brüchige Wände',
  'lv.tut-7.intro':
    'Manche Wände knirschen, wenn du sie rammst – sie sind brüchig. Zwei harte Treffer, und sie stürzen ein. Der einzige Weg zum Ziel führt durch diese Wand.',
  'lv.tut-8.name': 'Der Anker',
  'lv.tut-8.intro':
    'Der freundliche Doppelklang ist ein Checkpoint: Nach einem Sturz geht es dort weiter – und er füllt einen Echo-Ping auf. Hinter ihm atmet ein Loch. Keine Angst vorm Fallen.',

  'lv.w1-01.name': 'Aufbruch',
  'lv.w1-01.intro':
    'Willkommen in der Dunkelheit. Folge dem Ping des Ziels – die linke Wand führt dich hinab, unten geht es nach rechts.',
  'lv.w1-02.name': 'Hohlweg',
  'lv.w1-02.intro': 'Der Weg hinab atmet: Zwei Löcher öffnen und schließen sich. Lausche dem Grollen – und warte auf die Stille.',
  'lv.w1-03.name': 'Erste Wache',
  'lv.w1-03.intro':
    'Da brummt etwas. Ein Wächter patrouilliert den oberen Gang – berührt er dich, wirst du zurückgeworfen. Hör genau hin, wo er ist.',
  'lv.w1-04.name': 'Schlüsseldienst',
  'lv.w1-04.intro':
    'Kurz vor dem Ziel versperrt eine Tür den Weg – sie antwortet dumpf auf deinen Ping. Irgendwo klimpert ihr Schlüssel.',
  'lv.w1-05.name': 'Funkeln',
  'lv.w1-05.intro':
    'Hörst du das helle Doppel-Echo auf deinen Ping? Gems! Sie liegen abseits des Weges. Wer alle drei sammelt, verdient sich den dritten Stern.',
  'lv.w1-06.name': 'Zugluft',
  'lv.w1-06.intro': 'Im oberen Gang steht dir der Wind entgegen. Halte dagegen – und lass dich nicht in das Loch dahinter treiben.',
  'lv.w1-07.name': 'Brecher',
  'lv.w1-07.intro':
    'Hier ist der Weg vermauert – aber es knirscht verdächtig. Ramm die brüchigen Wände, weich dem Wächter unten aus und sammle, was funkelt.',
  'lv.w1-08.name': 'Doppelwache',
  'lv.w1-08.intro':
    'Zwei Wächter, eine Tür. Der Schlüssel liegt mitten im bewachten Gang rechts – schnapp ihn dir, wenn die Wache vorbeigezogen ist.',
  'lv.w1-09.name': 'Atemnot',
  'lv.w1-09.intro':
    'Der lange Abstieg: Fünf Löcher atmen im Takt gegeneinander, und unten schiebt dich der Wind genau dorthin, wo du nicht hinwillst. Geduld gewinnt.',
  'lv.w1-10.name': 'Schlussstein',
  'lv.w1-10.intro':
    'Alles, was du gelernt hast: Zwei Wachen, eine Tür, brüchige Abkürzungen, atmende Löcher und Wind. Zwei Wege führen ans Ziel – wähle weise.',

  'lv.w2-01.name': 'Unterführung',
  'lv.w2-01.intro':
    'Eine Mauer versiegelt den Weg – aber hörst du das Schweben? Ein Transporter führt hinab. Unten quer durch die Dunkelheit, an anderer Stelle wieder hinauf.',
  'lv.w2-02.name': 'Doppelter Boden',
  'lv.w2-02.intro':
    'Die Tür oben schweigt – ihr Schlüssel klimpert unter deinen Füßen. Hinab, an der Wache vorbei, den Schlüssel holen und woanders wieder ans Licht.',
  'lv.w2-03.name': 'Fahrstuhl',
  'lv.w2-03.intro':
    'Immer tiefer: zwei Schächte hinab, unten wartet das Funkeln – und ein Aufzug, der dich direkt in die versiegelte Zielkammer hebt.',
  'lv.w2-04.name': 'Zwillingstore',
  'lv.w2-04.intro':
    'Zwei Portale auf einer Ebene, ein versiegeltes Ziel. Spring – und lerne, wo du landest. Der aufsteigende Doppelklang deines Pings verrät die Tore.',
  'lv.w2-05.name': 'Kathedrale',
  'lv.w2-05.intro':
    'Drei Ebenen tief liegt der Schlüssel zur Krypta. Brich durch, was knirscht, trotze Wind und Wache – und steig mit dem Schlüssel zurück ans Licht.',
  'lv.w2-06.name': 'Die Weite',
  'lv.w2-06.intro':
    'Die Weite: größer als dein Bildschirm. Folge dem Rand durch die Dunkelheit – Checkpoints sichern die lange Reise, und abseits des Weges funkelt es.',

  'lv.w3-01.name': 'Taktgefühl',
  'lv.w3-01.intro':
    'Hörst du das Steinschleifen? Hier schieben sich Wände im Takt auf und zu – nur voll geöffnet kommst du durch. Wenn der Takt schneller klackt, schließt sie gleich. Warte. Lausche. Roll.',
  'lv.w3-02.name': 'Zeitschloss',
  'lv.w3-02.intro':
    'Der Schalter auf dem Weg spannt ein Uhrwerk: Die Tür vor dem Ziel springt auf – aber nur für neun Takte. Das Ticken zählt mit und wird hektisch, wenn die Zeit knapp wird. Dann roll, was das Zeug hält!',
  'lv.w3-03.name': 'Stromschnellen',
  'lv.w3-03.intro':
    'Ein Rauschen, das pulst: Strömungen. Sie schieben stärker, als du neigen kannst – Einbahnstraßen. Was hinter einer Strömung liegt, bleibt hinter dir. Sammle zuerst, spring dann.',
  'lv.w3-04.name': 'Schleusenwerk',
  'lv.w3-04.intro':
    'Erst der Takt, dann die Uhr: Zwei Schiebewände wollen im Rhythmus passiert werden, danach öffnet ein Zeitschloss die Schleuse vor dem Ziel – für acht Takte. Schaffst du beides in einem Zug?',
  'lv.w3-05.name': 'Uhrwerk',
  'lv.w3-05.intro':
    'Das ganze Räderwerk greift ineinander: Schiebewände takten den Abstieg, eine Strömung reißt dich zum Schalter, und das Zeitschloss hält die Zielkammer nur sechs Takte offen. Eine Wache dreht ihre Runden.',
  'lv.w3-06.name': 'Taktstraße',
  'lv.w3-06.intro':
    'Das Finale des Räderwerks, weiter als dein Bildschirm: Strömungen reißen dich von Schleuse zu Schleuse, Schiebewände geben den Takt vor, und ganz am Ende tickt das Zeitschloss vor der Zielkammer. Hör den Rhythmus – und tanz mit.',

  'lv.w4-01.name': 'Horchposten',
  'lv.w4-01.intro':
    'Da schnüffelt etwas. Der Horcher hört dein Rollen – sogar durch Wände – und jagt dich, solange du dich bewegst. Stehst du still, verliert er die Spur und zieht sich zurück. Roll in Etappen.',
  'lv.w4-02.name': 'Nebelbank',
  'lv.w4-02.intro':
    'Im Nebel klingt alles wie durch Watte – sogar der Sonar des Ziels. Präg dir den Kurs ein, bevor du eintauchst, und trau deinem Gefühl, bis die Ohren wieder aufklaren.',
  'lv.w4-03.name': 'Spiegeleis',
  'lv.w4-03.intro':
    'Spiegelglattes Eis: Einmal angerollt, gleitest du weiter – Bremsen wird zäh, Lenken schwammig. Hör auf das Sirren unter dir und plane den Schwung, bevor du ihn nimmst.',
  'lv.w4-04.name': 'Schleichfahrt',
  'lv.w4-04.intro':
    'Schleichfahrt: Ein Horcher streift durchs Revier, und Nebelbänke schlucken deine Orientierung. Beweg dich in kurzen Stößen – und lausche in den Pausen, wo das Schnüffeln steht.',
  'lv.w4-05.name': 'Glatteisjagd',
  'lv.w4-05.intro':
    'Die Jagd auf Glatteis: Auf dem Eis gleitest du – und der Horcher hört jedes Gleiten. Wer schlittert, kann nicht stillstehen. Nimm Schwung mit Bedacht und bremse, bevor er zubeißt.',
  'lv.w4-06.name': 'Das Ohr',
  'lv.w4-06.intro':
    'Das Ohr: drei Ebenen hinab in den Nebelkern, wo alles wie durch Watte klingt und zwei Horcher lauschen. Ganz unten, mitten im Nebel, pulst das Ziel. Beweg dich wie ein Flüstern.',

  'lv.coop-01.name': 'Schleuse',
  'lv.coop-01.intro':
    'Die Zielkammer öffnet sich nur, solange einer von euch die Druckplatte davor hält. Und wer im Ziel liegt, hält die Platte darin – für den Nachzügler. Einer hält, einer rollt!',
  'lv.coop-02.name': 'Wechselspiel',
  'lv.coop-02.intro':
    'Die Platte für die Zieltür liegt in einer eigenen verschlossenen Kammer. Sperrt euch gegenseitig auf: Jede Kammer hat innen eine Platte zur Selbstbefreiung.',
  'lv.coop-03.name': 'Fernwirkung',
  'lv.coop-03.intro':
    'Die Platte für die Zielkammer liegt ganz oben am Start. Einer bleibt zurück und hält, der andere rollt den langen Weg – gegen Wind und an einem atmenden Loch vorbei. Dann hält der Erste im Ziel die Tür.',
  'lv.coop-04.name': 'Doppelschleuse',
  'lv.coop-04.intro':
    'Wie Wechselspiel, nur gemein: Zwischen den Kammern atmet der Boden, und eine Wache patrouilliert den Quergang. Timing ist alles.',
  'lv.coop-05.name': 'Vier Hände, zwei Ebenen',
  'lv.coop-05.intro':
    'Das Finale: Die Platte für die Zieltür liegt eine Ebene TIEFER. Einer steigt hinab und hält, der andere rollt ins Ziel – und hält von dort die Tür für den Rückkehrer auf. Wer im Ziel liegt, hält weiter!',
  'lv.coop-06.name': 'Expedition',
  'lv.coop-06.intro':
    'Die große Expedition: ein Marsch über mehr als einen Bildschirm. Einer hält am Start die Platte der fernen Zieltür – der andere wagt die weite Reise. Und wer im Ziel liegt, hält die Tür für den Zweiten.',

  'lv.race-01.name': 'Sprint',
  'lv.race-01.intro':
    'Gleiche Strecke, gleiche Chancen: Wer zuerst im Ziel ist, gewinnt. Der Halo verrät, wo dein Gegner steckt.',
  'lv.race-02.name': 'Gegenwind',
  'lv.race-02.intro': 'Zwei Windzonen stehen zwischen dir und dem Ziel. Wer besser dagegenhält, gewinnt das Rennen.',
  'lv.race-03.name': 'Spießrutenlauf',
  'lv.race-03.intro':
    'Eine Wache patrouilliert die Zielgerade. Wer erwischt wird, fliegt zurück zum Checkpoint – und verliert wertvolle Sekunden.',
  'lv.race-04.name': 'Brecherbahn',
  'lv.race-04.intro':
    'Viele Wände hier sind brüchig – wer mutig rammt, findet Abkürzungen. Wer zu mutig ist, verliert Tempo an der falschen Wand.',
  'lv.race-05.name': 'Königsdisziplin',
  'lv.race-05.intro':
    'Das große Rennen: lang, tief, bewacht und brüchig. Alles, was du gelernt hast – schneller als dein Gegner.',
  'lv.race-06.name': 'Marathon',
  'lv.race-06.intro':
    'Der Marathon: die längste Strecke im Spiel – mehrere Bildschirme weit. Teile dir die Pings ein und lass dich von den Wachen nicht zurückwerfen.',
};

/** Alle Sprachen müssen exakt diese Schlüsselmenge abdecken. */
export type Dict = Record<keyof typeof de, string>;
