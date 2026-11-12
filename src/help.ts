// How to use InkShelf: short guides, searchable by keyword.
export type HelpTopic = {id: string; title: string; icon: string; words: string; steps: string[]};

export const HELP: HelpTopic[] = [
  {id: 'add', title: 'Add a library', icon: 'folder-plus', words: 'start folder sd card storage picker first library setup',
    steps: [
      'Open Settings (the gear at the top right), tap Data and storage, then the folder with a +.',
      'Pick Supernote or SD card, open folders until you reach the one that holds your books, then tap ✓ Use this folder.',
      'Every book inside is found, subfolders too. Your subfolders become categories.',
      "Can't see your SD card? Tap Find my SD card and pick any one book on it with Supernote's file picker. InkShelf remembers the card after that.",
    ]},
  {id: 'refresh', title: 'Find new books', icon: 'refresh', words: 'refresh new added scan update reload',
    steps: [
      'InkShelf looks for new and removed books by itself each time a library opens.',
      'To check now, open Settings › Data and storage and tap the refresh arrows on a library (or the ones at the top for every library).',
      'New books get a NEW label and show in the Newly added tab until you open them.',
    ]},
  {id: 'filter', title: 'Filter your library', icon: 'sidebar', words: 'filter panel genre tags more include exclude match all any unread bookmarked favourite',
    steps: [
      'Tap the panel button at the top left of the library to show or hide the filters.',
      'Genre and Tags list everything you have added. Tap once to include, again to exclude (crossed out), a third time to clear.',
      'Match All shows books with every ticked item; Any shows books with at least one.',
      'More has filters like Not read yet, Favourite, In progress, Finished by me, Needs details and Missing link.',
      'Clear at the top of the panel removes every filter.',
    ]},
  {id: 'category', title: 'Categories', icon: 'folder', words: 'category categories sub-category folder all top title switch library',
    steps: [
      'The name at the top of the library is the category you are looking at. Tap it to choose another, or All for everything.',
      'Categories come from your folders: SD card › Category › Sub-category › book.',
      "To change a book's categories, open it, tap the pencil and edit Category. Type a new one and tap +.",
      'Other libraries are listed at the bottom of the same list.',
    ]},
  {id: 'sort', title: 'Sort and change the view', icon: 'sort', words: 'sort order title date added last read volumes list grid covers view display',
    steps: [
      'Tap the book count (for example "18 books · Title ↑") to choose the order: title, last read, date added, volumes or category.',
      'Tap the chosen one again to reverse it.',
      'The list, covers and folder buttons next to it change how books are shown.',
    ]},
  {id: 'open', title: 'Open and read a book', icon: 'play', words: 'open read start volume chapter card close outside book page',
    steps: [
      'Tap a book to open its page. It opens as a card over the list: tap outside the card (or ✕) to close it.',
      'The black play button opens the book in Supernote\'s reader. Books in several files list every volume on the right.',
      'Left and right arrows turn the pages of the book page (Overview, Tags, Details). Settings can switch this to scrolling.',
      'The refresh button at the top checks this book\'s files again (added, deleted or renamed volumes).',
      'The button says Start until you open the book, then Continue: it opens the last volume you had open. Opened volumes get a tick.',
      'Opening a book straight from Supernote counts too: the next time you tap the InkShelf button inside that book, InkShelf notes it.',
    ]},
  {id: 'edit', title: 'Edit details and the cover', icon: 'edit', words: 'edit title description summary genre tag language status cover image screenshot save discard',
    steps: [
      'Open a book and tap the pencil.',
      'Change the title, categories, genres, tags, description, language and status.',
      'For a cover: take a screenshot of any cover, then tap Choose an image. It opens your screenshots.',
      'Tap ✓ to save. If you leave with changes, InkShelf asks whether to save or discard them.',
    ]},
  {id: 'status', title: 'Reading status and dates', icon: 'clock', words: 'status reading completed rereading plan hold dropped finished date history progress',
    steps: [
      'The button next to a book\'s title shows your reading status. Tap it to change it.',
      'Choose Plan to read, Reading, Completed, Rereading, On hold or Dropped. Every change is saved with the date.',
      'Opening a book you haven\'t started marks it Reading by itself.',
      'The history in the same sheet shows when you started and finished; Details shows how many times you read it.',
    ]},
  {id: 'collections', title: 'Favourites and collections', icon: 'collections', words: 'collection collections favourite favourites bookmark rules automatic smart add remove',
    steps: [
      'Tap the heart on a book page to make it a favourite. The bookmark button keeps it under Bookmarks.',
      'The Collections tab shows Bookmarks, Favourites, In progress, Completed and your own collections.',
      'Tap + to make a collection. Add rules like "Genre is Romance" or "Tag is not Harem", and books that fit are added by themselves.',
      'To add or take out a book by hand, use the collections button on its book page.',
    ]},
  {id: 'series', title: 'Series and combining books', icon: 'layers', words: 'series combine merge split volumes parts chapters folder one book',
    steps: [
      'Volumes named like "Title Vol 1", "Title Vol 2" become one book by themselves, and so does a folder named after its books.',
      'For anything else, switch the library to folder view (the folder button), open a folder and tap Make one book.',
      'Or tap the select button, tick the books, then Combine and give it a name.',
      'Split (in folder view, or on the Edit page) turns it back into separate books.',
    ]},
  {id: 'notes', title: 'Notes on a book', icon: 'note', words: 'note notes post-it sticky board write thoughts delete',
    steps: [
      'Tap the little yellow note on a book\'s cover. All its notes are pinned up on a board.',
      'Tap + to pin a new one (up to 5, each with its own colour). Tap a note to read or change it.',
      'To delete: tap the bin, tap the notes to remove, then the ✓ at the bottom. ✕ cancels.',
      'Each note can carry your rating (1 to 5 stars). The book\'s rating is the average of its notes. Tap a star again to clear it.',
      'Profile › Notes and quotes shows every note from every book on one board, with search.',
    ]},
  {id: 'author', title: 'Authors', icon: 'text', words: 'author writer by dash name file epub details filter sort',
    steps: [
      'A file named "Title - Author.epub" shows the author in small letters above the book and keeps the title clean. Turn this off in Settings if your titles have dashes.',
      'InkShelf also reads the author, description and language written inside each EPUB, once. It only fills empty fields and never replaces what you typed.',
      'Change it on the Edit page. Tap an author on a book page to see all their books; the filter panel has an Author tab and the sort has Author.',
    ]},
  {id: 'profile', title: 'Profile and your numbers', icon: 'profile', words: 'profile stats statistics numbers finished year streak days genres chart settings gear',
    steps: [
      'The Profile tab shows how many books you have, finished this year, are reading and love, with a chart of the last 12 months.',
      'Reading days counts the days you opened a book (in InkShelf, or in Supernote when you tap the InkShelf button inside it).',
      'Tap a number or a genre to see those books. Settings is the gear at the top right.',
    ]},
  {id: 'wishlist', title: 'Wishlist', icon: 'wish', words: 'wishlist wish want buy later find get list',
    steps: [
      'Open it from Profile or the Collections tab. Tap + and type the title; the author, where to get it and a note are optional.',
      'When a book with the same name turns up in a library, it comes off the list by itself, and your note is pinned on the book.',
      'Tap the pencil, then ✕ to take a book off the list.',
    ]},
  {id: 'duplicates', title: 'Duplicate files', icon: 'copy', words: 'duplicate duplicates copy twice same name (1) delete keep both',
    steps: [
      'Two files with the same name in the same folder (like "Book.epub" and "Book (1).epub") are flagged on the book page.',
      'Open files takes you to Supernote\'s file manager so you can delete the one you don\'t want. InkShelf never deletes books.',
      'Keep both hides the warning. A small 2× stays next to the title: tap it to jump to the other copy.',
      'The filter panel\'s More tab has Possible duplicate.',
    ]},
  {id: 'sheet', title: 'Fill in many books on a computer', icon: 'save', words: 'sheet spreadsheet excel google sheets xlsx csv computer laptop bulk import export many books fill drop-down collections tags',
    steps: [
      'InkShelf keeps a spreadsheet of all your books: Document › InkShelf › InkShelf books.xlsx (Data and storage › Make the sheet makes it now).',
      'Copy it to your computer and open it in Excel or Google Sheets. The Books tab has one row per book.',
      'Category, Genre, Tag, Reading, Favourite and Add to collection cells have drop-down lists: click the cell and pick. You can also type something new.',
      'To add a new tag to every drop-down, write it once at the bottom of its column on the Lists tab.',
      'The Collections tab holds your collections and their rules. Add a row to make a new one; write - as the name to delete one.',
      'An empty cell changes nothing; a - clears it. Leave the ID column alone. Save it (same name, .xlsx) and copy it back to Document › InkShelf.',
    ]},
  {id: 'naming', title: 'Name files so volumes join up', icon: 'layers', words: 'name naming volume vol part chapter ch episode lesson rename join series files',
    steps: [
      'Files whose names say Vol, Part, Book, Chapter (Ch), Episode, Lesson or Module with a number join into one book by themselves.',
      'For example "Moon Vol 1 - The Exile.epub", "Moon Vol 2 - The Burning Sea.epub". The words after the number show as each volume\'s name.',
      'Files named only "Chapter 1 - Intro.epub", "Chapter 2 - Loops.epub" join into one book named after their folder.',
      'After renaming, tap the refresh button on the book page (or in Data and storage) to see it.',
    ]},
  {id: 'paste', title: 'Paste a book into a note', icon: 'paste', words: 'paste copy note insert cover details clipboard',
    steps: [
      'Open InkShelf from the toolbar inside a note.',
      'Open a book and tap the paste button (or hold the cover).',
      'Choose the cover, the details, or both. They are added to the page of your note.',
    ]},
  {id: 'missing', title: 'Missing links', icon: 'unlink', words: 'missing link gone deleted moved renamed reconnect lost',
    steps: [
      'If a book\'s file is moved, renamed or deleted, InkShelf keeps its details and shows it as Missing link.',
      'When a file with the same name (or a similar name in the same folder) turns up again, it reconnects by itself.',
      'Data and storage › Missing links lists them; delete the ones you don\'t need. You can also choose to delete details right away.',
    ]},
  {id: 'exclude', title: 'Leave folders out', icon: 'hide', words: 'exclude hide leave out ignore folder file big accident',
    steps: [
      'Open Data and storage and tap the eye on a library.',
      'Tap the eye next to any folder or book to leave it out. Tap again to bring it back.',
      'Left-out folders stay out after refreshing, and they are kept in the backup.',
    ]},
  {id: 'backup', title: 'Backup and reinstalling', icon: 'save', words: 'backup restore reinstall save copy file document inkshelf move',
    steps: [
      'InkShelf saves a backup by itself after every change: Document › InkShelf › InkShelf backup.json.',
      'After reinstalling InkShelf it reads the backup back by itself.',
      'In Data and storage you can back up now, choose another folder, or restore from a backup.',
    ]},
  {id: 'perms', title: 'Permissions', icon: 'gear', words: 'permission permissions allow write read access denied ask',
    steps: [
      'InkShelf needs to read your book folders and write its own files (details, covers, backup).',
      'When it asks, choose Always allow, so Supernote doesn\'t ask again.',
      'Settings › Permissions shows what is allowed and can ask again.',
    ]},
  {id: 'search', title: 'Search titles', icon: 'search', words: 'search find title home recent searches',
    steps: [
      'Type in the search bar on Home. It looks through the titles in all your libraries.',
      'The settings button next to it picks which libraries to search.',
      'Recent searches stay under the bar; tap ✕ to forget one.',
    ]},
];

/** topics that match every word typed (title, keywords and text) */
export function searchHelp(q: string): HelpTopic[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return HELP;
  const scored = HELP.map(t => {
    const title = t.title.toLowerCase();
    const all = `${title} ${t.words} ${t.steps.join(' ')}`.toLowerCase();
    if (!words.every(w => all.includes(w))) return null;
    return {t, score: words.reduce((n, w) => n + (title.includes(w) ? 3 : t.words.includes(w) ? 2 : 1), 0)};
  }).filter(Boolean) as {t: HelpTopic; score: number}[];
  return scored.sort((a, b) => b.score - a.score).map(x => x.t);
}
