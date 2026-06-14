import { iconFile, type AspectData, type Aspect } from '../data/aspects';

export function iconUrl(data: AspectData, a: Aspect): string {
  return import.meta.env.BASE_URL + iconFile(data, a);
}
