/**
 * Iris SDK — programmatic image evidence API (Sylphx).
 * Isomorphic with MCP tool `read_image`.
 */
import { readImage } from './handlers/readImage.js';
import { readImageArgsSchema } from './schemas/readImage.js';

export type IrisReadInput = {
  path: string;
  [key: string]: unknown;
};

export { readImageArgsSchema };

export class Iris {
  static create(): Iris {
    return new Iris();
  }

  /** MCP: read_image */
  async read(input: IrisReadInput) {
    const parsed = readImageArgsSchema.parse(input);
    return readImage.handler({ input: parsed, ctx: {} });
  }
}

export default Iris;
