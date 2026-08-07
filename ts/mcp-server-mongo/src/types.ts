/**
 * ObjectId conversion settings used by MongoDB tools.
 * - `auto`: convert 24-character hex strings that look like ObjectIds
 * - `none`: leave all strings untouched
 * - `force`: convert all 24-character hex strings
 */
export type ObjectIdConversionMode = 'auto' | 'none' | 'force';
