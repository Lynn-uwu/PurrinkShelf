/**
 * InkShelf - Supernote plugin entry
 * @format
 */
import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// A "Library" button in the toolbar of books (DOC) and notes (NOTE).
PluginManager.registerButton(1, ['DOC', 'NOTE'], {
  id: 100,
  name: 'InkShelf',
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: 1,
});

// A settings entry for InkShelf in Supernote's own plugin settings.
// Tapping it opens InkShelf with the settings sheet showing.
import {emit} from './src/events';
PluginManager.registerConfigButton().catch(() => {});
PluginManager.registerConfigButtonListener({
  onClick() {
    emit('settings');
    PluginManager.showPluginView().catch(() => {});
  },
});
