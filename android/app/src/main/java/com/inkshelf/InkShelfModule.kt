package com.inkshelf

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.storage.StorageManager
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File
import java.net.URLDecoder
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/**
 * InkShelf native helpers.
 *
 * openDocument: hands a book to Supernote's own Document reader, the same way the
 * file browser does. Approach from SuperTask (apclark31/supernote-plugin-research) and
 * supernote-dashboard (AgP42, MIT): explicit component, "file_path" extra, started from
 * the plugin's own application context so the plugin SDK does not intercept it.
 *
 * Also: plain file read/write (for the library's saved tags and descriptions),
 * folder listing, and pulling the cover image out of an EPUB.
 */
class InkShelfModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "InkShelf"

    companion object {
        private const val TAG = "InkShelf"
    }

    private fun launch(intent: Intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
    }

    /**
     * Open a book (EPUB, PDF, ...) in Supernote's Document reader.
     * how: "reader" = Document app with file_path extra (main method)
     *      "explorer" = Supernote file browser asked to open the file
     */
    @ReactMethod
    fun openDocument(path: String, how: String, promise: Promise) {
        Log.i(TAG, "openDocument how=$how path=$path")
        try {
            if (!File(path).exists()) {
                promise.reject("NOT_FOUND", "File not found: $path")
                return
            }
            val intent = Intent()
            if (how == "explorer") {
                intent.component = ComponentName(
                    "com.ratta.supernote.inbox",
                    "com.ratta.supernote.explorer.FileManagerMainActivity"
                )
                intent.putExtra("folder_path", File(path).parent)
                intent.putExtra("source_type", 2)
                intent.putExtra("only_open_file", path)
            } else {
                intent.component = ComponentName(
                    "com.supernote.document",
                    "com.supernote.document.MainActivity"
                )
                intent.putExtra("file_path", path)
            }
            intent.action = Intent.ACTION_VIEW
            launch(intent)
            promise.resolve(true)
        } catch (e: Throwable) {
            Log.e(TAG, "openDocument failed", e)
            promise.reject("OPEN_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    /** List a folder: [{name, path, isDir, size, mtime}] (hidden entries skipped). */
    @ReactMethod
    fun listDir(path: String, promise: Promise) {
        try {
            val dir = File(path)
            val arr = Arguments.createArray()
            val kids = dir.listFiles()
            if (kids == null) {
                promise.resolve(arr)
                return
            }
            kids.filter { !it.name.startsWith(".") }
                .sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
                .forEach {
                    val m = Arguments.createMap()
                    m.putString("name", it.name)
                    m.putString("path", it.absolutePath)
                    m.putBoolean("isDir", it.isDirectory)
                    m.putDouble("size", it.length().toDouble())
                    m.putDouble("mtime", it.lastModified().toDouble())
                    arr.pushMap(m)
                }
            promise.resolve(arr)
        } catch (e: Throwable) {
            promise.reject("LIST_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    @ReactMethod
    fun readText(path: String, promise: Promise) {
        try {
            val f = File(path)
            promise.resolve(if (f.exists()) f.readText(Charsets.UTF_8) else null)
        } catch (e: Throwable) {
            promise.reject("READ_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    /** Write text safely: write to a temp file, then swap it in. */
    @ReactMethod
    fun writeText(path: String, text: String, promise: Promise) {
        try {
            val f = File(path)
            f.parentFile?.mkdirs()
            val tmp = File(f.absolutePath + ".tmp")
            tmp.writeText(text, Charsets.UTF_8)
            if (f.exists() && !f.delete()) {
                f.writeText(text, Charsets.UTF_8)
                tmp.delete()
            } else if (!tmp.renameTo(f)) {
                f.writeText(text, Charsets.UTF_8)
                tmp.delete()
            }
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("WRITE_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    /**
     * Copy the cover image out of an EPUB into outPath (any image type).
     * Resolves outPath, or null when the book has no usable cover.
     */
    @ReactMethod
    fun extractEpubCover(epubPath: String, outPath: String, promise: Promise) {
        try {
            ZipFile(File(epubPath)).use { zip ->
                val container = zip.getEntry("META-INF/container.xml")
                if (container == null) { promise.resolve(null); return }
                val cText = zip.getInputStream(container).bufferedReader().readText()
                val opfPath = Regex("full-path=\"([^\"]+)\"").find(cText)?.groupValues?.get(1)
                if (opfPath == null) { promise.resolve(null); return }
                val opfEntry = zip.getEntry(opfPath)
                if (opfEntry == null) { promise.resolve(null); return }
                val opf = zip.getInputStream(opfEntry).bufferedReader().readText()
                val base = if (opfPath.contains("/")) opfPath.substringBeforeLast("/") + "/" else ""

                val items = Regex("<item\\b[^>]*>", RegexOption.IGNORE_CASE).findAll(opf).map { it.value }.toList()
                fun attr(tag: String, name: String) =
                    Regex("\\b$name\\s*=\\s*\"([^\"]*)\"", RegexOption.IGNORE_CASE).find(tag)?.groupValues?.get(1)

                var href: String? = items.firstOrNull { (attr(it, "properties") ?: "").contains("cover-image") }
                    ?.let { attr(it, "href") }
                if (href == null) {
                    val coverId = Regex("<meta\\b[^>]*name=\"cover\"[^>]*>", RegexOption.IGNORE_CASE).find(opf)
                        ?.let { attr(it.value, "content") }
                    if (coverId != null) href = items.firstOrNull { attr(it, "id") == coverId }?.let { attr(it, "href") }
                }
                if (href == null) {
                    href = items.firstOrNull {
                        (attr(it, "media-type") ?: "").startsWith("image/") &&
                            ((attr(it, "id") ?: "") + (attr(it, "href") ?: "")).lowercase().contains("cover")
                    }?.let { attr(it, "href") }
                }
                if (href == null) { promise.resolve(null); return }

                val entryName = normalize(base + URLDecoder.decode(href, "UTF-8"))
                val img = zip.getEntry(entryName)
                if (img == null || img.size in 1..1500) { promise.resolve(null); return }
                val out = File(outPath)
                out.parentFile?.mkdirs()
                zip.getInputStream(img).use { input -> out.outputStream().use { input.copyTo(it) } }
                promise.resolve(out.absolutePath)
            }
        } catch (e: Throwable) {
            Log.w(TAG, "extractEpubCover failed for $epubPath", e)
            promise.resolve(null)
        }
    }

    /**
     * Where books can live besides internal storage (SD cards, USB), found with Android's
     * own storage APIs: [{path, label, how}]. Every method is tried; each is optional.
     */
    @ReactMethod
    fun storageRoots(promise: Promise) {
        // One entry per card. The same card shows up under several paths
        // (/storage/ID, /mnt/media_rw/ID, app folders...), so they are merged by the card's ID.
        val idRe = Regex("^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$|^[0-9A-Fa-f]{8,16}$")
        val cards = LinkedHashMap<String, String>() // id -> best path
        val labels = HashMap<String, String>()
        val how = ArrayList<String>()
        fun readable(p: String) = try { File(p).canRead() && File(p).listFiles() != null } catch (e: Throwable) { false }
        fun add(path: String?, label: String, src: String, trusted: Boolean) {
            if (path.isNullOrBlank()) return
            val p = path.trimEnd('/')
            if (p.startsWith("/storage/emulated") || p == "/storage/self" || p == "/storage") return
            val id = p.substringAfterLast('/')
            if (!trusted && !idRe.matches(id)) return
            if (!File(p).exists()) return
            val key = id.uppercase()
            val have = cards[key]
            // keep the /storage/ID path if we can read it; otherwise any readable one
            val better = have == null ||
                (!readable(have) && readable(p)) ||
                (readable(p) && p.startsWith("/storage/") && !have.startsWith("/storage/"))
            if (better) cards[key] = p
            if (!labels.containsKey(key) || src == "volume") labels[key] = label
            how.add("$src:$p")
        }
        val ctx = reactApplicationContext
        try {
            val sm = ctx.getSystemService(Context.STORAGE_SERVICE) as StorageManager
            if (Build.VERSION.SDK_INT >= 24) {
                for (v in sm.storageVolumes) {
                    if (v.isPrimary) continue
                    var path: String? = null
                    if (Build.VERSION.SDK_INT >= 30) path = v.directory?.absolutePath
                    if (path == null) try { path = v.javaClass.getMethod("getPath").invoke(v) as? String } catch (e: Throwable) {}
                    if (path == null && v.uuid != null) path = "/storage/" + v.uuid
                    add(path, if (v.isRemovable) "SD card" else ((try { v.getDescription(ctx) } catch (e: Throwable) { null }) ?: "Storage"), "volume", true)
                }
            }
        } catch (e: Throwable) { how.add("volume-failed:${e.javaClass.simpleName}") }
        try {
            for (d in ctx.getExternalFilesDirs(null)) {
                val p = d?.absolutePath ?: continue
                if (p.contains("/Android/")) add(p.substringBefore("/Android/"), "SD card", "appdir", false)
            }
        } catch (e: Throwable) { how.add("appdir-failed:${e.javaClass.simpleName}") }
        for (base in listOf("/storage", "/mnt/media_rw")) {
            try {
                File(base).listFiles()?.filter { it.isDirectory }?.forEach { add(it.absolutePath, "SD card", "list", false) }
            } catch (e: Throwable) {}
        }
        val arr = Arguments.createArray()
        var n = 0
        for ((key, p) in cards) {
            n++
            val m = Arguments.createMap()
            m.putString("path", p)
            m.putString("id", key)
            m.putString("label", if (cards.size > 1) "${labels[key] ?: "SD card"} $n" else (labels[key] ?: "SD card"))
            m.putBoolean("readable", readable(p))
            arr.pushMap(m)
        }
        Log.i(TAG, "storageRoots ${how.joinToString()}")
        val out = Arguments.createMap()
        out.putArray("roots", arr)
        out.putString("how", how.joinToString("; "))
        promise.resolve(out)
    }

    /** Add a line to a text file (InkShelf's trouble log). */
    /** The EPUB's own description file (OPF): title, author, description, language, subjects. */
    @ReactMethod
    fun readEpubMeta(path: String, promise: Promise) {
        try {
            ZipFile(path).use { zf ->
                val container = zf.getEntry("META-INF/container.xml")
                var opf: String? = null
                if (container != null) {
                    val c = zf.getInputStream(container).readBytes().toString(Charsets.UTF_8)
                    opf = Regex("full-path=\"([^\"]+)\"").find(c)?.groupValues?.get(1)
                }
                if (opf == null) opf = zf.entries().asSequence().firstOrNull { it.name.endsWith(".opf") }?.name
                val e = if (opf != null) zf.getEntry(opf) else null
                promise.resolve(if (e != null) zf.getInputStream(e).readBytes().toString(Charsets.UTF_8) else null)
            }
        } catch (e: Throwable) {
            promise.resolve(null)
        }
    }

    /** How long a book is: words in its text, and CJK characters (counted apart, they read at a different speed). */
    @ReactMethod
    fun epubWords(path: String, promise: Promise) {
        Thread {
            try {
                var words = 0L
                var cjk = 0L
                val tag = Regex("<[^>]*>")
                val ent = Regex("&[a-zA-Z#0-9]+;")
                val word = Regex("[\\p{L}\\p{N}'’]+")
                ZipFile(path).use { zf ->
                    for (e in zf.entries().asSequence()) {
                        val n = e.name.lowercase()
                        if (e.isDirectory || !(n.endsWith(".xhtml") || n.endsWith(".html") || n.endsWith(".htm"))) continue
                        if (e.size > 8_000_000) continue
                        var t = zf.getInputStream(e).readBytes().toString(Charsets.UTF_8)
                        val body = t.indexOf("<body", ignoreCase = true)
                        if (body > 0) t = t.substring(body)
                        t = ent.replace(tag.replace(t, " "), " ")
                        val latin = StringBuilder()
                        for (ch in t) {
                            val b = Character.UnicodeBlock.of(ch)
                            if (b == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS || b == Character.UnicodeBlock.HIRAGANA || b == Character.UnicodeBlock.KATAKANA ||
                                b == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A) {
                                cjk++
                                latin.append(' ')
                            } else latin.append(ch)
                        }
                        words += word.findAll(latin).count()
                    }
                }
                val m = Arguments.createMap()
                m.putDouble("words", words.toDouble())
                m.putDouble("cjk", cjk.toDouble())
                promise.resolve(m)
            } catch (e: Throwable) {
                promise.resolve(null)
            }
        }.start()
    }

    /** Remove a paper-book listing. Only InkShelf's own .paper files: never a real book. */
    @ReactMethod
    fun removePaper(path: String, promise: Promise) {
        try {
            if (!path.endsWith(".paper")) { promise.resolve(false); return }
            promise.resolve(File(path).delete())
        } catch (e: Throwable) {
            promise.resolve(false)
        }
    }

    /** Open Supernote's file manager (whichever app on the device looks like one). Returns its package or null. */
    @ReactMethod
    fun openFileManager(promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val apps = pm.queryIntentActivities(main, 0)
            val names = apps.map { it.activityInfo.packageName + "/" + it.activityInfo.name + "=" + it.loadLabel(pm) }
            Log.i(TAG, "launchers: " + names.joinToString())
            val hit = apps.firstOrNull { val l = (it.loadLabel(pm)?.toString() ?: "").lowercase(); val n = it.activityInfo.packageName.lowercase()
                l.contains("file") || l.contains("explorer") || n.contains("filemanager") || n.contains("explorer") || n.contains("file") }
            if (hit == null) { promise.resolve(null); return }
            val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(ComponentName(hit.activityInfo.packageName, hit.activityInfo.name))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(i)
            promise.resolve(hit.activityInfo.packageName)
        } catch (e: Throwable) {
            Log.e(TAG, "openFileManager failed", e)
            promise.resolve(null)
        }
    }

    /** Write a zip (an .xlsx spreadsheet is one) from {name: text}. */
    @ReactMethod
    fun writeZip(path: String, entries: ReadableMap, promise: Promise) {
        try {
            val f = File(path)
            f.parentFile?.mkdirs()
            val tmp = File(path + ".tmp")
            ZipOutputStream(tmp.outputStream()).use { z ->
                val it = entries.keySetIterator()
                while (it.hasNextKey()) {
                    val k = it.nextKey()
                    z.putNextEntry(ZipEntry(k))
                    z.write((entries.getString(k) ?: "").toByteArray(Charsets.UTF_8))
                    z.closeEntry()
                }
            }
            if (f.exists()) f.delete()
            promise.resolve(tmp.renameTo(f))
        } catch (e: Throwable) {
            Log.e(TAG, "writeZip failed", e)
            promise.resolve(false)
        }
    }

    /** Read the text files (xml) inside a zip, e.g. an .xlsx saved by Excel or Google Sheets. */
    @ReactMethod
    fun readZip(path: String, promise: Promise) {
        try {
            val out = Arguments.createMap()
            ZipFile(path).use { zf ->
                for (e in zf.entries()) {
                    if (e.isDirectory) continue
                    if (e.name.endsWith(".xml") || e.name.endsWith(".rels")) out.putString(e.name, zf.getInputStream(e).readBytes().toString(Charsets.UTF_8))
                }
            }
            promise.resolve(out)
        } catch (e: Throwable) {
            Log.e(TAG, "readZip failed", e)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun appendText(path: String, text: String, promise: Promise) {
        try {
            val f = File(path)
            f.parentFile?.mkdirs()
            if (f.exists() && f.length() > 200_000) f.writeText(f.readText().takeLast(100_000))
            f.appendText(text, Charsets.UTF_8)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.resolve(false)
        }
    }

    /** Put text on the Android clipboard. */
    @ReactMethod
    fun copyText(text: String, promise: Promise) {
        try {
            val cm = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("PurrinkShelf", text))
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("COPY_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    /**
     * Turn any cover image into a PNG no bigger than maxSide pixels,
     * because notes only accept png/jpg files with the right name.
     */
    @ReactMethod
    fun prepareImage(src: String, outPath: String, maxSide: Int, promise: Promise) {
        try {
            val path = src.removePrefix("file://")
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= maxSide || bounds.outHeight / (sample * 2) >= maxSide) sample *= 2
            val bmp = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
            if (bmp == null) { promise.resolve(null); return }
            val scale = minOf(1f, maxSide.toFloat() / maxOf(bmp.width, bmp.height))
            val out = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
            val f = File(outPath)
            f.parentFile?.mkdirs()
            f.outputStream().use { out.compress(Bitmap.CompressFormat.PNG, 100, it) }
            promise.resolve(f.absolutePath)
        } catch (e: Throwable) {
            Log.w(TAG, "prepareImage failed for $src", e)
            promise.resolve(null)
        }
    }

    private fun normalize(p: String): String {
        val out = ArrayList<String>()
        for (part in p.split("/")) {
            when (part) {
                "", "." -> {}
                ".." -> if (out.isNotEmpty()) out.removeAt(out.size - 1)
                else -> out.add(part)
            }
        }
        return out.joinToString("/")
    }
}
