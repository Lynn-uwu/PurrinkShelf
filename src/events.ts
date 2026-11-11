// Tiny event hub so index.js (Supernote's config button) can talk to the app.
type Fn = () => void;
const subs: {[name: string]: Set<Fn>} = {};
let pending: {[name: string]: boolean} = {};

export function emit(name: string) {
  const s = subs[name];
  if (s && s.size) s.forEach(f => f());
  else pending[name] = true; // the app isn't showing yet; deliver when it subscribes
}

export function on(name: string, f: Fn): () => void {
  (subs[name] = subs[name] || new Set()).add(f);
  if (pending[name]) {
    delete pending[name];
    setTimeout(f, 0);
  }
  return () => subs[name].delete(f);
}
