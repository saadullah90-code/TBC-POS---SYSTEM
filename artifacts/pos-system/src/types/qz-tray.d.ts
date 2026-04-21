// Minimal ambient declaration for the qz-tray UMD package which
// ships without official TypeScript types. We use a permissive
// `any`-typed default export and rely on our `qz-bridge.ts` wrapper
// to provide a strongly-typed surface for the rest of the app.
declare module "qz-tray" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qz: any;
  export default qz;
}
