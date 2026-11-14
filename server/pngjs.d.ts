// pngjs ships no types: what the tests that draw or read a PNG use of it (CODE-03).
declare module "pngjs" {
  export class PNG {
    constructor(options?: { width?: number; height?: number });
    width: number;
    height: number;
    /** RGBA, 4 bytes a pixel, row by row. */
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}
