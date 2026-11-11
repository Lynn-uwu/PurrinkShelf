import * as esbuild from 'esbuild';
const P = process.cwd();
await esbuild.build({
  entryPoints: ['entry.jsx'], bundle: true, outfile: 'bundle.js',
  loader: {'.jpg': 'dataurl', '.png': 'dataurl', '.js': 'jsx'},
  resolveExtensions: ['.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  define: {'process.env.NODE_ENV': '"production"', __DEV__: 'false'},
  plugins: [{name: 'alias', setup(b) {
    const map = {
      'react-native': P + '/node_modules/react-native-web/dist/index.js',
      'react-native-web': P + '/node_modules/react-native-web/dist/index.js',
      'sn-plugin-lib': P + '/fake-supernote.js',
      'react': P + '/node_modules/react/index.js',
      'react/jsx-runtime': P + '/node_modules/react/jsx-runtime.js',
      'react-dom/client': P + '/node_modules/react-dom/client.js',
    };
    b.onResolve({filter: /^(react-native|react-native-web|sn-plugin-lib|react|react\/jsx-runtime|react-dom\/client)$/}, a => ({path: map[a.path]}));
  }}],
});
console.log('preview built');
