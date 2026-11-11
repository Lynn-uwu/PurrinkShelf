package com.inkshelf

import android.content.ComponentName
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.net.URLDecoder
import java.util.zip.ZipFile

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
        } catch (e: Exception) {
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
        } catch (e: Exception) {
            promise.reject("LIST_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
        }
    }

    @ReactMethod
    fun readText(path: String, promise: Promise) {
        try {
            val f = File(path)
            promise.resolve(if (f.exists()) f.readText(Charsets.UTF_8) else null)
        } catch (e: Exception) {
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
        } catch (e: Exception) {
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
        } catch (e: Exception) {
            Log.w(TAG, "extractEpubCover failed for $epubPath", e)
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
