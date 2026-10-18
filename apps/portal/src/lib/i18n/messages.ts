/**
 * All portal messages, per surface (one file each, so screens can be worked on in parallel). Keys follow the design
 * repository's text ids (`area.component.part`, agesoa-uiux copy/locales); every English entry has an Indonesian one.
 */

import { commonEn, commonId } from "./common";
import { consoleEn, consoleId } from "./console";
import { publicEn, publicId } from "./public";

export const messages = {
  id: { ...commonId, ...publicId, ...consoleId },
  en: { ...commonEn, ...publicEn, ...consoleEn },
} as const;

export type MessageKey = keyof typeof messages.id;
