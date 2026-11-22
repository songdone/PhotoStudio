import { defineConfig } from "vite";

export default defineConfig({
  base: '/app/photostudio/',
  build: { rollupOptions: { input: { app: 'index.html', callback: 'callback.html' } } },
  // fnOS serves this application directly; Puter remains an optional connection.
  server: { host: '127.0.0.1' },
  // The packaged site (fnOS gateway and the local Go server) also serves public
  // assets at the root, which root-absolute fetches like the collaboration
  // worker bundle rely on. The dev server only mounts them under the base.
  // In dev, Vite also rewrites the %BASE_URL% token's result a second time, so
  // the token is resolved here first (the production build replaces it itself).
  plugins: [
    {
      name: 'dev-base-url-token',
      apply: 'serve',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replaceAll('%BASE_URL%', ''),
      },
    },
    {
      name: 'dev-root-asset-fallback',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/worker/') || req.url?.startsWith('/source/')) req.url = '/app/photostudio' + req.url;
          next();
        });
      },
    },
  ],
  // Prebundle lazy CJS entry points so first use does not reload an open editor.
  // PathKit remains loaded on demand at runtime, including in the worker.
  optimizeDeps: {
    include: [
      "ag-psd",
      "ag-psd/dist/psdWriter",
      "ag-psd/dist/additionalInfo",
      "ag-psd/dist/imageResources",
      "ag-psd/dist/helpers",
      "ag-psd/dist/psdReader",
      "ag-psd/dist/descriptor",
      "pathkit-wasm",
      "pako",
    ],
  },
  // Image processing uses a module worker; vector geometry loads its toolkit on
  // demand without adding it to ordinary document startup or the UI bundle.
  worker: { format: "es" },
});
