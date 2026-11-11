# InkShelf

A library for your Supernote. Pick any folder of books as a library, browse it by cover in a list or grid, add your own titles, tags, descriptions and covers right on the device, filter by folder and tags (include / exclude, match all or any), and tap **Start reading** to open a book in Supernote's reader.

## Status
Early test version. Built for Supernote Nomad (A6 X2) and Manta (A5 X2) on Chauvet 3.30.45 or newer.

## Install
1. Download `InkShelf.snplg` from Releases (or from the latest build under Actions).
2. Copy it to the **MyStyle** folder on your Supernote.
3. On the device: **Settings → Apps → Plugins → Add Plugin**.
4. Open any book or note and tap the **InkShelf** button in the toolbar.

## How it stores things
- Your list of libraries is kept with the plugin.
- Tags, descriptions, custom titles and chosen covers are saved in a hidden `.inkshelf` folder inside each library folder, so they travel with your books.
- Folders whose names start with `_` or `.` are skipped.

## Build
Pushing to `main` builds `InkShelf.snplg` on GitHub Actions (JavaScript plus a small native module). To build locally you need Node 20, JDK 17 and the Android SDK, then run `bash buildPlugin.sh`.

## Credits
Opening documents in Supernote's reader follows the approach documented by
[supernote-plugin-research](https://github.com/apclark31/supernote-plugin-research) (SuperTask) and
[supernote-dashboard](https://github.com/AgP42) by AgP42.
