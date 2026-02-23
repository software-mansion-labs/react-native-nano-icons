import { PyodideManager } from './pipeline/managers.js';

export async function picoFromFile(hostFilePath: string): Promise<string> {
  return PyodideManager.picoFromFile(hostFilePath);
}
