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
  'menu.campaign.sub': '2 mondes pleins de gardiens, de clés et d’étages',
  'menu.mp': 'Multijoueur',
  'menu.mp.sub': 'Coop & course – à deux, par QR code',
  'menu.tutorial': 'Tutoriel',
  'menu.tutorial.sub': 'Apprends les sons de l’obscurité',
  'menu.tutorial.new': 'Commence ici !',
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

  /* --- Cartes de résultat --- */
  'res.time': 'Temps : {time}',
  'res.newBest': ' – nouveau record !',
  'res.newBestLine': 'Nouveau record !',
  'res.par': ' (par {n} s)',
  'res.falls': 'Chutes : {n}',
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

  /* --- Mondes & niveaux --- */
  'world.w1': 'Monde 1 – Les profondeurs s’éveillent',
  'world.w2': 'Monde 2 – Entre les étages',

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
};
