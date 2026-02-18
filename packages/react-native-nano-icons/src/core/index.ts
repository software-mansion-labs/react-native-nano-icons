import { PyodideManager } from "./managers.js";

export async function picoFromFile(hostFilePath: string): Promise<string> {
  return PyodideManager.picoFromFile(hostFilePath);
}
