/**
 * The slice of ONNX Runtime Web this app touches.
 *
 * `onnxruntime-web` ships its typings at `types.d.ts` but does not expose them
 * through its `exports` map, so TypeScript cannot find them. Rather than cast
 * the import away, this declares exactly the two settings the Studio model
 * needs: where the WASM runtime is fetched from, and how many threads it may
 * use. Everything else stays the library's own business.
 */
declare module "onnxruntime-web" {
  export const env: {
    wasm: {
      /** A directory URL the runtime loads its `.wasm` files from. */
      wasmPaths?: string;
      /** Threads the runtime may use. 1 when the page is not cross-origin isolated. */
      numThreads?: number;
    };
  };
}
