// Alle Element-Module registrieren (Import mit Nebenwirkung).

import './hole';
import './windZone';
import './checkpoint';
import './guard';
import './key';
import './door';
import './gem';
import './transporter';
import './plate';
import './slidingWall';
import './timedSwitch';
import './current';
import './listener';
import './fogZone';
import './ice';
import './sand';
import './echoCrystal';
import './anchor';
import './glass';
import './jukebox';
import './hourglass';
import './bell';
import './reverbZone';
import './roamingHole';
import './boulder';
import './torch';
import './drain';

export { buildElements, galleryEntries, registerElement } from './registry';
export type { BuildContext, ElementModule, GalleryEntry } from './registry';
