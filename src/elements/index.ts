// Alle Element-Module registrieren (Import mit Nebenwirkung).

import './hole';
import './windZone';
import './checkpoint';
import './guard';
import './key';
import './door';
import './gem';

export { buildElements, galleryEntries, registerElement } from './registry';
export type { BuildContext, ElementModule, GalleryEntry } from './registry';
