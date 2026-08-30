import type { Dict } from './de';

export const fr: Dict = {
  /* --- App / écran d'accueil --- */
  'app.tagline': 'Une bille. Un labyrinthe invisible.<br>Le son, les vibrations et la lumière te montrent le chemin.',
  'app.headphones': '🎧 À jouer de préférence au casque',
  'app.sensorNote': 'Lancer une partie active les capteurs de mouvement &amp; l’audio.<br>Sur ordinateur : flèches/WASD, Espace = ping.',

  'menu.quick': 'Partie rapide',
  'menu.quick.best': 'Record ({preset}) : {time}',
  'menu.daily': 'Défi du jour',
  'menu.daily.open': 'Encore ouvert aujourd’hui',
  'menu.daily.done': 'Aujourd’hui : {time}',
  'menu.daily.streak': ' · 🔥 {n} jours',
  'menu.campaign': 'Campagne',
  'menu.campaign.sub': '4 mondes, 28 niveaux',
  'menu.mp': 'Multijoueur',
  'menu.mp.sub': 'Coop & course – à deux, par QR code',
  'menu.tutorial': 'Tutoriel',
  'menu.tutorial.sub': 'Apprends les sons de l’obscurité',
  'menu.tutorial.new': 'Commence ici !',
  'menu.workshop': 'Atelier',
  'menu.workshop.sub': 'Construire et tester tes propres niveaux',
  'menu.gallery': 'Galerie des éléments',
  'menu.gallery.sub': 'Voir et écouter chaque élément',
  'preset.easy': 'Facile',
  'preset.normal': 'Moyen',
  'preset.hard': 'Difficile',

  /* --- Commun --- */
  'common.close': 'Fermer',
  'common.menu': 'Menu',
  'common.go': 'C’est parti !',
  'common.next': 'Suivant',
  'common.again': '⟳ Encore',
  'common.toMenu': 'Vers le menu',
  'common.cancel': 'Annuler',
  'common.ok': 'OK',
  'common.listen': '🔊 Écouter',
  'common.level': 'Niveau',

  /* --- HUD --- */
  'hud.calibrate': 'Recalibrer l’inclinaison',
  'hud.debug': 'Vue debug (montrer le labyrinthe)',
  'hud.home': 'Retour au menu',
  'hud.keys': 'Touches (WASD/flèches)',
  'hud.tilt': 'Inclinaison',
  'hud.edit': 'Retour à l’éditeur',

  'ed.new': '＋ Nouveau niveau',
  'ed.newRandom': '🎲 Depuis un niveau aléatoire',
  'ed.empty': 'Pas encore de niveau à toi – construis le premier !',
  'ed.untitled': 'Mon niveau',
  'ed.copySuffix': '(copie)',
  'ed.play': 'Jouer',
  'ed.edit': 'Modifier',
  'ed.duplicate': 'Dupliquer',
  'ed.delete': 'Supprimer',
  'ed.deleteConfirm': 'Sûr ?',
  'ed.back': 'Retour à l’atelier',
  'ed.namePh': 'Nom du niveau',
  'ed.test': '▶ Tester',
  'ed.save': 'Enregistrer',
  'ed.saved': 'Enregistré ✓',
  'ed.saveFailed': 'Échec de l’enregistrement (stockage plein ou bloqué)',
  'ed.backToEditor': '✏️ Retour à l’éditeur',
  'ed.tools': 'Outils',
  'ed.elements': 'Éléments',
  'ed.level': 'Niveau',
  'ed.selected': 'Sélection',
  'ed.tool.select': 'Sélectionner',
  'ed.tool.wall': 'Mur',
  'ed.tool.erase': 'Gommer',
  'ed.tool.start': 'Départ',
  'ed.tool.goal': 'Arrivée',
  'ed.edgeHint': 'Touche une arête de mur (la ligne entre deux cases).',
  'ed.guardSecond': 'Sentinelle : touche le second point sur la même ligne/colonne.',
  'ed.guardBad': 'La patrouille doit être rectiligne – recommence.',
  'ed.intro': 'Texte d’intro',
  'ed.par': 'Temps par (s)',
  'ed.pings': 'Réserve de pings',
  'ed.cols': 'Colonnes',
  'ed.rows': 'Lignes',
  'ed.reroll': 'Relancer le labyrinthe',
  'ed.deleteEl': 'Supprimer l’élément',
  'ed.check.load': 'Charge',
  'ed.check.goal': 'Arrivée accessible',
  'ed.check.openers': 'Ouvreurs avant porte',
  'ed.check.timer': 'Minuterie suffisante',
  'ed.check.softlock': 'Pas de blocage',
  'ed.check.hazards': 'Dangers à l’écart',
  'ed.check.items': 'Collectibles libres',
  'ed.f.dir': 'Direction',
  'ed.f.force': 'Force',
  'ed.f.speed': 'Vitesse (px/s)',
  'ed.f.opens': 'Ouvre la porte',
  'ed.f.duration': 'Minuterie (s)',
  'ed.f.offset': 'Décalage (s)',
  'ed.f.openS': 'Ouvert (s)',
  'ed.f.closedS': 'Fermé (s)',
  'ed.f.radius': 'Rayon',
  'ed.f.mode': 'Comportement',
  'ed.f.breathing': 'respirant',
  'ed.f.static': 'toujours ouvert',

  'calib.title': 'Calibrage',
  'calib.text': 'Tiens maintenant ton téléphone <b>à plat comme un plateau</b> –<br>comme tu veux jouer.',

  /* --- Statut / flash --- */
  'st.fell': 'Tombé dans un trou ! 🕳',
  'st.caught': 'Attrapé ! 👁',
  'st.win': 'Arrivée en {time} 🎉',
  'st.door': 'Porte ouverte ! 🔑',
  'st.gem': '💎 Gemme !',
  'st.checkpoint': 'Checkpoint ! ✓ +1 ping',
  'st.floorDown': '⬇ Étage {n}',
  'st.floorUp': '⬆ Étage {n}',
  'st.portal': '✦ Portail',
  'st.wallDown': 'Mur effondré ! 🧱',
  'st.switch': '⏱ Serrure horlogère : porte ouverte {n} s !',
  'st.crystal': '✦ Cristal d’écho : +1 ping !',
  'st.glass': 'Ça craque sous toi… 🩹',

  /* --- Cartes de résultat --- */
  'res.time': 'Temps : {time}',
  'res.newBest': ' – nouveau record !',
  'res.newBestLine': 'Nouveau record !',
  'res.par': ' (par {n} s)',
  'res.falls': 'Chutes : {n}',
  'res.blind': '🌑 Étoile aveugle – sans le moindre ping !',
  'res.tutTitle': '{name} – réussi ! 🎉',
  'res.tutProgress': 'Tutoriel : {done}/{total}',
  'res.tutDone': 'Tutoriel terminé – tu es prêt pour l’obscurité !',
  'res.winTitle': 'Arrivée en {time} 🎉',

  /* --- Défi du jour --- */
  'daily.name': 'Défi du jour',
  'daily.intro': '{label}. Un niveau pour tous, un nouveau chaque jour – ta première arrivée compte comme score du jour.',
  'daily.day0': 'Dimanche – le grand jeu',
  'daily.day1': 'Lundi – départ en douceur',
  'daily.day2': 'Mardi – premier vent contraire',
  'daily.day3': 'Mercredi – le gardien s’éveille',
  'daily.day4': 'Jeudi – trois étages de profondeur',
  'daily.day5': 'Vendredi – ça se resserre',
  'daily.day6': 'Samedi – profond et vigilant',
  'daily.introTitle': '📅 Défi {date}',
  'daily.targetLine': '🎯 Défi : bats {time} !',
  'daily.targetFlash': '🎯 Bats {time} !',
  'daily.resultTitle': 'Défi {date} – {time}',
  'daily.first': 'Ton score du jour ! 🏁',
  'daily.training': 'Entraînement – ton score du jour reste {time}.',
  'daily.beat': '🎯 Défi battu ({time}) !',
  'daily.notBeat': '🎯 Pas battu – l’objectif était {time}.',
  'daily.streakOne': '🔥 Série : 1 jour',
  'daily.streakMany': '🔥 Série : {n} jours',
  'daily.share': '📤 Défier',
  'daily.copied': 'Lien copié ! 📋',
  'daily.shareText': 'Défi du jour tiltr {date} : {time} – tu fais mieux ?',
  'daily.challengeTitle': '🎯 Défi !',
  'daily.challengeText': 'Quelqu’un te défie sur le défi du jour du {date}.',
  'daily.challengeTextTarget': 'Quelqu’un te défie sur le défi du jour du {date} :\nBats {time} !',
  'daily.accept': 'Accepter',
  'daily.later': 'Plus tard',

  /* --- Multijoueur --- */
  'mp.title': '👥 Multijoueur',
  'mp.mode': 'Mode',
  'mp.coop': '🤝 Coop',
  'mp.race': '🏁 Course',
  'mp.hint.coop': 'Ensemble : les plaques de pression ouvrent la porte du partenaire. Vous ne gagnez que quand vous êtes TOUS LES DEUX à l’arrivée.',
  'mp.hint.race': 'L’un contre l’autre : niveau identique, le premier arrivé gagne. Le halo montre ton adversaire.',
  'mp.pickLevel': 'Choisir un niveau = ouvrir un salon',
  'mp.orJoin': 'Ou rejoindre un salon',
  'mp.code': 'CODE',
  'mp.join': 'Rejoindre',
  'mp.scan': '📷 Scanner',
  'mp.scanHint': 'Vise le QR code du salon avec la caméra',
  'mp.waiting': 'En attente d’un joueur – scanne le QR code ou saisis le code …',
  'mp.connecting': 'Connexion …',
  'mp.connected': 'Partenaire connecté !',
  'mp.waitLevel': 'Connecté – en attente du niveau …',
  'mp.leftLobby': 'Ton partenaire a quitté le salon.',
  'mp.leftWait': 'Ton partenaire a quitté le salon – on attend …',
  'mp.rejoined': 'Le partenaire est de retour ! 🎉',
  'mp.ready': 'Prêt !',
  'mp.readyTitle': 'Prêt ✓',
  'mp.waitPartner': 'En attente de ton partenaire …',
  'mp.leave': 'Quitter',
  'mp.partnerFinished': 'Ton partenaire est arrivé !',
  'mp.coopWin': '🤝 Réussi ensemble !',
  'mp.teamTime': 'Temps d’équipe : {team}\nToi : {you} · Partenaire : {partner}',
  'mp.raceTimes': 'Toi : {you}\nAdversaire : {rival}',
  'mp.raceWin': '🏆 Gagné !',
  'mp.raceLose': 'Perdu …',
  'mp.draw': '🤝 Égalité !',
  'mp.frozenCoop': 'À l’arrivée ! En attente de ton partenaire …',
  'mp.frozenRace': 'À l’arrivée ! Ton adversaire roule encore …',
  'mp.lostCountdown': 'Connexion perdue … {n}s',
  'mp.lostTitle': 'Connexion perdue',
  'mp.lostCoop': 'Ton partenaire est parti – la coop a besoin de vous deux.',
  'mp.lostRace': 'Ton adversaire est parti.',
  'mp.floors': '{n} étages',
  'mp.random': 'Niveau aléatoire',
  'mp.error': 'Échec de la connexion – réessaie.',

  /* --- Installation / mise à jour / splash / galerie --- */
  'inst.android': 'Installer tiltr comme appli – hors ligne & plein écran.',
  'inst.button': 'Installer',
  'inst.ios': 'Installer comme appli : touche l’icône de partage {icon}, puis « Sur l’écran d’accueil ».',
  'upd.available': 'Nouvelle version disponible',
  'upd.availableV': 'Nouvelle version v{v} disponible',
  'upd.button': 'Mettre à jour',
  'splash.credit': 'Un jeu de Dominik Rössler & Claude',
  'gallery.title': '🧩 Galerie des éléments',

  /* --- Galerie des éléments --- */
  'el.hole.title': 'Trou',
  'el.hole.desc':
    'Avale la bille et l’attire dès qu’elle roule sur le bord. Les trous qui respirent s’ouvrent et se ferment en cycles – fermés, ils sont inoffensifs. Signature : grondement sombre, battement de cœur, vibration d’alerte.',
  'el.windZone.title': 'Zone de vent',
  'el.windZone.desc':
    'Cellule invisible avec une force de vent constante – il faut incliner contre. Signature : souffle en rafales qui monte depuis la zone.',
  'el.checkpoint.title': 'Checkpoint',
  'el.checkpoint.desc':
    'Anneau invisible sur le chemin. Une fois touché : point de réapparition après une chute et +1 ping d’écho. Signature : double note amicale, double vibration.',
  'el.guard.title': 'Gardien',
  'el.guard.desc':
    'Patrouille dans les couloirs et te renvoie au dernier checkpoint au contact. Signature : bourdonnement menaçant et pulsé venant de sa direction – et ton cœur s’accélère.',
  'el.key.title': 'Clé & porte',
  'el.key.desc':
    'La clé tinte au loin, la porte verrouillée répond au ping d’écho par un son mat. Ramasse la clé – et la porte s’ouvre en glissant.',
  'el.door.title': 'Porte',
  'el.door.desc':
    'Un mur verrouillé avec sa propre signature de ping : plus mat, plus plein qu’un mur normal. Seule la bonne clé l’ouvre – alors il s’écarte en grondant.',
  'el.gem.title': 'Gemme',
  'el.gem.desc':
    'Cristal étincelant à l’écart du chemin. Répond au ping d’écho par une double note claire – qui les ramasse toutes gagne la troisième étoile.',
  'el.transporter.title': 'Transporteur',
  'el.transporter.desc':
    'Te porte à un autre étage – ou à travers la carte comme un portail. Signature : double ton flottant à proximité ; au saut, un scintillement qui descend ou qui monte. Répond au ping par un double écho montant.',
  'el.plate.title': 'Plaque de pression & porte du partenaire',
  'el.plate.desc':
    'Coop : tant que ton partenaire tient la plaque, ta porte reste ouverte – s’il la lâche, elle se referme. Même signature dorée que la porte qu’elle ouvre. Uniquement en multijoueur.',
  'el.wallEcho.title': 'Mur & écho',
  'el.wallEcho.desc':
    'Les murs sont invisibles ; les toucher les fait briller un instant et sonne comme un coup sourd venant de leur direction. Les murs friables (ambre) craquent et s’effondrent après 3 chocs violents.',
  'el.goal.title': 'Balise d’arrivée',
  'el.goal.desc': 'Le ping sonar de l’arrivée : plus tu approches, plus il est rapide, fort et aigu. Direction en audio spatial.',
  'el.ping.title': 'Ping d’écho',
  'el.ping.desc':
    'Impulsion sonar active (tap/Espace, réserve limitée) : un front d’onde révèle les environs, les réflexions reviennent retardées par la distance – murs clairs, trous graves.',
  'el.heart.title': 'Battement de cœur',
  'el.heart.desc': 'S’accélère et se renforce à l’approche d’un trou ouvert. Quand le pouls retombe, la voie est libre.',
  'el.slidingWall.title': 'Mur coulissant',
  'el.slidingWall.desc':
    'Un mur qui s’ouvre et se referme en cadence – la voie n’est libre que lorsqu’il est grand ouvert. Signature : un raclement de pierre rythmé à l’ouverture et à la fermeture, plus un tic-tac qui s’accélère juste avant qu’il ne se referme.',
  'el.timedSwitch.title': 'Interrupteur à minuterie',
  'el.timedSwitch.desc':
    'Le franchir ouvre la porte liée – mais pour quelques secondes seulement. Un tic-tac égrène le temps et s’affole quand il se fait rare ; puis la porte se referme bruyamment. Repassez dessus pour remonter le mécanisme.',
  'el.current.title': 'Courant',
  'el.current.desc':
    'Un flux qui pousse plus fort que votre inclinaison – un sens unique. Ce qui reste derrière le courant reste derrière vous. Signature : un souffle pulsé et directionnel, plus grave et plus pressant que le vent.',
  'el.listener.title': 'Le Guetteur',
  'el.listener.desc':
    'Il te traque tant que tu roules – il t’entend même à travers les murs. Immobile, tu lui fais perdre ta trace et il se retire. Signature : un reniflement crépitant qui enfle avec ta propre vitesse. Le silence est ton camouflage.',
  'el.fogZone.title': 'Zone de brume',
  'el.fogZone.desc':
    'Dans la brume, TOUT sonne comme à travers de la ouate – les murs, les dangers, même le sonar de l’arrivée. Elle ne pousse pas et n’avale pas, mais elle te prend les oreilles. Mémorise ton cap avant d’y plonger.',
  'el.ice.title': 'Plaque de glace',
  'el.ice.desc':
    'Lisse comme un miroir : une fois lancé, tu continues de glisser – freiner devient laborieux, diriger devient flou. Signature : un sifflement cristallin sous la bille, qui enfle avec la vitesse. Prépare ton élan avant de le prendre.',
  'el.echoCrystal.title': 'Cristal d’écho',
  'el.echoCrystal.desc':
    'Du ping en bouteille : le ramasser donne +1 ping d’écho – même au-delà de la réserve de la manche. Signature : un timbre de cloche clair et unique en réponse au ping, une frappe limpide au ramassage. Tu vises l’étoile aveugle ? Laisse-le.',
  'el.anchor.title': 'Ancre d’attraction',
  'el.anchor.desc':
    'Elle t’attire dans son rayon – plus tu es proche, plus c’est pesant. Elle ne t’avale jamais, mais elle coûte force et temps ; en insistant, on s’en libère toujours. Signature : un bourdonnement électrique qui enfle avec la proximité.',
  'el.glass.title': 'Sol de verre',
  'el.glass.desc':
    'Une case de sol en verre : au premier passage elle craque en guise d’avertissement, au second elle vole en éclats – laissant un trou ouvert où tu tombes. Une fois ça passe, deux fois tu tombes. Signature : un craquement clair, puis un fracas.',

  /* --- Mondes & niveaux --- */
  'world.w1': 'Monde 1 – Les profondeurs s’éveillent',
  'world.w2': 'Monde 2 – Entre les étages',
  'world.w3': 'Monde 3 – Les Rouages',
  'world.w4': 'Monde 4 – Le Silence',

  'lv.tut-1.name': 'Rouler & écouter',
  'lv.tut-1.intro':
    'Incline doucement ton téléphone – la bille roule. Écoute le ping sonar : il vient de la direction de l’arrivée et s’accélère quand tu approches. Roule vers la droite !',
  'lv.tut-2.name': 'Murs & écho',
  'lv.tut-2.intro':
    'Les murs sont invisibles. Si tu en touches un, tu entends un coup sourd venant de sa direction – et il s’illumine un instant. Avance à tâtons.',
  'lv.tut-3.name': 'Le ping d’écho',
  'lv.tut-3.intro':
    'Touche l’écran : un ping d’écho révèle brièvement les environs – les murs proches répondent en premier. Ta réserve est limitée, utilise-la bien.',
  'lv.tut-4.name': 'Le grondement',
  'lv.tut-4.intro':
    'Tu entends ce grondement sombre ? Un trou t’attend là. Plus tu approches, plus c’est fort – et ton cœur s’accélère. Faufile-toi ou prends le détour par le bas.',
  'lv.tut-5.name': 'Trous qui respirent',
  'lv.tut-5.intro':
    'Ce trou respire : il s’ouvre et se ferme. Fermé, il est inoffensif et silencieux. Attends que le grondement se taise – puis roule dessus.',
  'lv.tut-6.name': 'Vent contraire',
  'lv.tut-6.intro': 'Ce souffle devant toi, c’est du vent – il te repousse. Incline plus fort contre lui et fraie-toi un chemin.',
  'lv.tut-7.name': 'Murs friables',
  'lv.tut-7.intro':
    'Certains murs craquent quand tu les percutes – ils sont friables. Deux chocs violents et ils s’effondrent. Le seul chemin vers l’arrivée passe par ce mur.',
  'lv.tut-8.name': 'L’ancre',
  'lv.tut-8.intro':
    'La double note amicale est un checkpoint : après une chute, tu repars de là – et il recharge un ping d’écho. Derrière lui, un trou respire. N’aie pas peur de tomber.',

  'lv.w1-01.name': 'Le départ',
  'lv.w1-01.intro':
    'Bienvenue dans l’obscurité. Suis le ping de l’arrivée – le mur de gauche te mène vers le bas, puis c’est à droite.',
  'lv.w1-02.name': 'Chemin creux',
  'lv.w1-02.intro': 'La descente respire : deux trous s’ouvrent et se ferment. Écoute le grondement – et attends le silence.',
  'lv.w1-03.name': 'Première garde',
  'lv.w1-03.intro':
    'Quelque chose bourdonne. Un gardien patrouille le couloir du haut – s’il te touche, tu es renvoyé en arrière. Écoute bien où il est.',
  'lv.w1-04.name': 'Serrurier',
  'lv.w1-04.intro':
    'Juste avant l’arrivée, une porte barre le chemin – elle répond à ton ping d’un son mat. Quelque part, sa clé tinte.',
  'lv.w1-05.name': 'Étincelles',
  'lv.w1-05.intro':
    'Tu entends ce double écho clair sur ton ping ? Des gemmes ! Elles sont à l’écart du chemin. Qui ramasse les trois gagne la troisième étoile.',
  'lv.w1-06.name': 'Courant d’air',
  'lv.w1-06.intro': 'Dans le couloir du haut, le vent te fait face. Tiens bon – et ne te laisse pas pousser dans le trou derrière.',
  'lv.w1-07.name': 'Le briseur',
  'lv.w1-07.intro':
    'Ici, le chemin est muré – mais ça craque étrangement. Percute les murs friables, évite le gardien en bas et ramasse ce qui étincelle.',
  'lv.w1-08.name': 'Double garde',
  'lv.w1-08.intro':
    'Deux gardiens, une porte. La clé est au milieu du couloir gardé à droite – attrape-la quand la garde est passée.',
  'lv.w1-09.name': 'À bout de souffle',
  'lv.w1-09.intro':
    'La longue descente : cinq trous respirent à contretemps, et en bas le vent te pousse exactement là où tu ne veux pas aller. La patience gagne.',
  'lv.w1-10.name': 'Clé de voûte',
  'lv.w1-10.intro':
    'Tout ce que tu as appris : deux gardes, une porte, des raccourcis friables, des trous qui respirent et du vent. Deux chemins mènent à l’arrivée – choisis bien.',

  'lv.w2-01.name': 'Passage souterrain',
  'lv.w2-01.intro':
    'Un mur scelle le chemin – mais tu entends ce flottement ? Un transporteur mène en bas. Traverse l’obscurité en dessous, puis remonte ailleurs.',
  'lv.w2-02.name': 'Double fond',
  'lv.w2-02.intro':
    'La porte en haut reste muette – sa clé tinte sous tes pieds. Descends, passe devant la garde, prends la clé et remonte à la lumière ailleurs.',
  'lv.w2-03.name': 'L’ascenseur',
  'lv.w2-03.intro':
    'Toujours plus bas : deux puits à descendre, l’étincelle t’attend au fond – et un ascenseur te hisse droit dans la chambre d’arrivée scellée.',
  'lv.w2-04.name': 'Portes jumelles',
  'lv.w2-04.intro':
    'Deux portails sur un étage, une arrivée scellée. Saute – et apprends où tu atterris. Le double son montant de ton ping trahit les portes.',
  'lv.w2-05.name': 'Cathédrale',
  'lv.w2-05.intro':
    'Trois étages plus bas repose la clé de la crypte. Brise ce qui craque, défie le vent et la garde – et remonte à la lumière avec la clé.',
  'lv.w2-06.name': 'L’Immensité',
  'lv.w2-06.intro':
    'L’immensité : plus grand que ton écran. Longe le bord à travers l’obscurité – les checkpoints sécurisent le long voyage, et à l’écart du chemin, ça scintille.',

  'lv.w3-01.name': 'Sens du rythme',
  'lv.w3-01.intro':
    'Tu entends ce raclement de pierre ? Ici, des murs coulissent en cadence – on ne passe que lorsqu’ils sont grand ouverts. Quand le tic-tac s’accélère, ils vont se refermer. Attends. Écoute. Roule.',
  'lv.w3-02.name': 'Serrure horlogère',
  'lv.w3-02.intro':
    'L’interrupteur sur ton chemin remonte un mécanisme : la porte devant l’arrivée s’ouvre – mais pour neuf temps seulement. Le tic-tac compte avec toi et s’affole quand le temps manque. Alors fonce !',
  'lv.w3-03.name': 'Les rapides',
  'lv.w3-03.intro':
    'Un souffle qui pulse : des courants. Ils poussent plus fort que ton inclinaison – des sens uniques. Ce qui reste derrière un courant reste derrière toi. Ramasse d’abord, saute ensuite.',
  'lv.w3-04.name': 'Jeu d’écluses',
  'lv.w3-04.intro':
    'D’abord la cadence, puis l’horloge : deux murs coulissants se franchissent en rythme, puis une minuterie ouvre l’écluse devant l’arrivée – pour huit temps. Sauras-tu enchaîner les deux ?',
  'lv.w3-05.name': 'Mécanisme',
  'lv.w3-05.intro':
    'Tous les rouages s’engrènent : les murs coulissants cadencent la descente, un courant t’emporte vers l’interrupteur, et la minuterie ne tient la chambre d’arrivée ouverte que six temps. Une sentinelle fait sa ronde.',
  'lv.w3-06.name': 'La route cadencée',
  'lv.w3-06.intro':
    'Le finale des Rouages, plus vaste que ton écran : des courants t’emportent d’écluse en écluse, des murs coulissants battent la mesure, et tout au bout la minuterie égrène le temps devant la chambre d’arrivée. Écoute le rythme – et danse avec.',

  'lv.w4-01.name': 'Poste d’écoute',
  'lv.w4-01.intro':
    'Quelque chose renifle. Le guetteur entend ton roulement – même à travers les murs – et te traque tant que tu bouges. Immobile, tu lui fais perdre ta trace et il se retire. Avance par étapes.',
  'lv.w4-02.name': 'Banc de brume',
  'lv.w4-02.intro':
    'Dans la brume, tout sonne comme à travers de la ouate – même le sonar de l’arrivée. Mémorise ton cap avant d’y plonger, et fie-toi à ton instinct jusqu’à ce que tes oreilles s’éclaircissent.',
  'lv.w4-03.name': 'Miroir de glace',
  'lv.w4-03.intro':
    'Une glace lisse comme un miroir : une fois lancé, tu continues de glisser – freiner devient laborieux, diriger devient flou. Écoute le sifflement sous toi et prépare ton élan avant de le prendre.',
  'lv.w4-04.name': 'Marche furtive',
  'lv.w4-04.intro':
    'Marche furtive : un guetteur rôde dans le secteur et des bancs de brume avalent tes repères. Avance par à-coups – et dans les pauses, écoute où se tient le reniflement.',
  'lv.w4-05.name': 'Chasse sur glace',
  'lv.w4-05.intro':
    'La chasse sur glace : sur la glace tu glisses – et le guetteur entend chaque glissade. Qui dérape ne peut pas s’arrêter. Prends ton élan avec prudence et freine avant qu’il ne morde.',
  'lv.w4-06.name': 'L’Oreille',
  'lv.w4-06.intro':
    'L’Oreille : trois étages plus bas, au cœur de la brume, tout sonne comme de la ouate et deux guetteurs écoutent. Tout en bas, en pleine brume, l’arrivée pulse. Déplace-toi comme un murmure.',

  'lv.coop-01.name': 'Le sas',
  'lv.coop-01.intro':
    'La chambre d’arrivée ne s’ouvre que tant que l’un de vous tient la plaque devant elle. Et qui repose à l’arrivée tient la plaque intérieure – pour le retardataire. L’un tient, l’autre roule !',
  'lv.coop-02.name': 'Jeu d’échange',
  'lv.coop-02.intro':
    'La plaque de la porte d’arrivée est dans sa propre chambre verrouillée. Libérez-vous mutuellement : chaque chambre a une plaque intérieure pour s’auto-libérer.',
  'lv.coop-03.name': 'Action à distance',
  'lv.coop-03.intro':
    'La plaque de la chambre d’arrivée est tout en haut, au départ. L’un reste et tient, l’autre fait le long chemin – contre le vent et le long d’un trou qui respire. Puis le premier tient la porte depuis l’arrivée.',
  'lv.coop-04.name': 'Double sas',
  'lv.coop-04.intro':
    'Comme Jeu d’échange, en plus méchant : le sol respire entre les chambres, et une garde patrouille la traverse. Tout est dans le timing.',
  'lv.coop-05.name': 'Quatre mains, deux étages',
  'lv.coop-05.intro':
    'Le final : la plaque de la porte d’arrivée est un étage PLUS BAS. L’un descend et tient, l’autre roule à l’arrivée – et tient de là la porte pour celui qui remonte. Qui repose à l’arrivée continue de tenir !',
  'lv.coop-06.name': 'L’Expédition',
  'lv.coop-06.intro':
    'La grande expédition : une marche sur plus d’un écran. L’un tient au départ la plaque de la lointaine porte d’arrivée – l’autre ose le long voyage. Et qui repose à l’arrivée tient la porte pour le second.',

  'lv.race-01.name': 'Sprint',
  'lv.race-01.intro': 'Même parcours, mêmes chances : le premier arrivé gagne. Le halo te dit où est ton adversaire.',
  'lv.race-02.name': 'Vent contraire',
  'lv.race-02.intro': 'Deux zones de vent entre toi et l’arrivée. Qui tient le mieux la ligne gagne la course.',
  'lv.race-03.name': 'Le gantelet',
  'lv.race-03.intro':
    'Une garde patrouille la dernière ligne droite. Qui se fait prendre repart du checkpoint – et perd de précieuses secondes.',
  'lv.race-04.name': 'Piste des briseurs',
  'lv.race-04.intro':
    'Beaucoup de murs ici sont friables – qui percute avec courage trouve des raccourcis. Trop de courage, et tu perds ta vitesse sur le mauvais mur.',
  'lv.race-05.name': 'L’épreuve reine',
  'lv.race-05.intro': 'La grande course : longue, profonde, gardée et friable. Tout ce que tu as appris – plus vite que ton adversaire.',
  'lv.race-06.name': 'Marathon',
  'lv.race-06.intro':
    'Le marathon : la plus longue piste du jeu – plusieurs écrans de large. Économise tes pings et ne laisse pas les gardes te renvoyer en arrière.',
};
