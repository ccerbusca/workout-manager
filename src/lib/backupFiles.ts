import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/*
 * Moving backup files in and out of the app's sandbox.
 *
 * An Android app can't write straight into Downloads or Drive. Export writes the JSON to the
 * app's cache folder and opens the system share sheet, so you pick where it goes (Drive, Files,
 * email…). Import opens the system file picker, which hands back a readable copy of the file.
 */

export async function shareJsonFile(fileName: string, json: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save backup', UTI: 'public.json' });
}

/** Returns the picked file's text, or null if the picker was cancelled. */
export async function pickTextFile(): Promise<string | null> {
  // Cloud apps often label .json files as octet-stream or text, so accept those too
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/*', 'application/octet-stream'] });
  if (picked.canceled) return null;
  return picked.result.text();
}
