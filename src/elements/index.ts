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
import './echoCrystal';
import './anchor';
import './glass';

export { buildElements, galleryEntries, registerElement } from './registry';
export type { BuildContext, ElementModule, GalleryEntry } from './registry';
