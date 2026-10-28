package expo.modules.comicarchive

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Base64
import com.github.junrar.Archive
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.github.junrar.exception.UnsupportedRarV5Exception
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.apache.commons.compress.archivers.sevenz.SevenZFile
import java.io.File
import java.io.ByteArrayOutputStream
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Reads page entries out of RAR4 (CBR) and 7z (CB7) archives and renders PDF pages. JS decides the kind from magic
 * bytes and passes "rar" or "7z"; entry names come back exactly as stored.
 */
class ComicArchiveModule : Module() {
  private fun fileOf(uri: String): File = File(Uri.parse(uri).path ?: uri)

  private fun listRar(file: File): List<String> =
    Archive(file).use { archive ->
      if (archive.isEncrypted) throw CodedException("ENCRYPTED", "Archive is password-protected", null)
      archive.fileHeaders.filter { !it.isDirectory }.map { it.fileName }
    }

  private fun extractRar(file: File, entry: String, dest: File) {
    Archive(file).use { archive ->
      val header = archive.fileHeaders.firstOrNull { !it.isDirectory && it.fileName == entry }
        ?: throw CodedException("MISSING_ENTRY", "Entry not found: $entry", null)
      FileOutputStream(dest).use { out -> archive.extractFile(header, out) }
    }
  }

  private fun listSevenZ(file: File): List<String> {
    val names = mutableListOf<String>()
    SevenZFile(file).use { sz ->
      var e = sz.nextEntry
      while (e != null) {
        if (!e.isDirectory) names.add(e.name)
        e = sz.nextEntry
      }
    }
    return names
  }

  private fun extractSevenZ(file: File, entry: String, dest: File) {
    SevenZFile(file).use { sz ->
      var e = sz.nextEntry
      while (e != null) {
        if (!e.isDirectory && e.name == entry) {
          val buffer = ByteArray(64 * 1024)
          FileOutputStream(dest).use { out ->
            while (true) {
              val n = sz.read(buffer)
              if (n < 0) break
              out.write(buffer, 0, n)
            }
          }
          return
        }
        e = sz.nextEntry
      }
    }
    throw CodedException("MISSING_ENTRY", "Entry not found: $entry", null)
  }

  /** Keeps only the first bytes written — enough for an image header — and discards the rest. */
  private class HeadCapture(private val limit: Int) : OutputStream() {
    val head = ByteArrayOutputStream()
    override fun write(b: Int) { if (head.size() < limit) head.write(b) }
    override fun write(b: ByteArray, off: Int, len: Int) {
      val room = limit - head.size()
      if (room > 0) head.write(b, off, minOf(len, room))
    }
  }

  private fun boundsOf(bytes: ByteArray): List<Int> {
    val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
    return if (opts.outWidth > 0 && opts.outHeight > 0) listOf(opts.outWidth, opts.outHeight) else listOf(0, 0)
  }

  /** One pass over the archive: [width, height] per requested entry ([0, 0] when unreadable). */
  private fun sizesRar(file: File, entries: List<String>): List<List<Int>> {
    val wanted = entries.toHashSet(); val found = HashMap<String, List<Int>>()
    Archive(file).use { archive ->
      for (header in archive.fileHeaders) {
        if (header.isDirectory || header.fileName !in wanted) continue
        val capture = HeadCapture(96 * 1024)
        try { archive.extractFile(header, capture) } catch (_: Exception) { }
        found[header.fileName] = boundsOf(capture.head.toByteArray())
      }
    }
    return entries.map { found[it] ?: listOf(0, 0) }
  }

  private fun sizesSevenZ(file: File, entries: List<String>): List<List<Int>> {
    val wanted = entries.toHashSet(); val found = HashMap<String, List<Int>>()
    SevenZFile(file).use { sz ->
      var e = sz.nextEntry
      val buffer = ByteArray(64 * 1024)
      while (e != null) {
        if (!e.isDirectory && e.name in wanted) {
          val capture = HeadCapture(96 * 1024)
          while (true) { val n = sz.read(buffer); if (n < 0) break; capture.write(buffer, 0, n) }
          found[e.name] = boundsOf(capture.head.toByteArray())
        }
        e = sz.nextEntry
      }
    }
    return entries.map { found[it] ?: listOf(0, 0) }
  }

  private fun <T> withPdf(path: String, block: (PdfRenderer) -> T): T {
    val pfd = ParcelFileDescriptor.open(fileOf(path), ParcelFileDescriptor.MODE_READ_ONLY)
    try {
      PdfRenderer(pfd).use { return block(it) }
    } catch (e: SecurityException) {
      throw CodedException("ENCRYPTED", "PDF is password-protected", e)
    } finally {
      pfd.close()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ComicArchive")

    // Keep access to a file the reader picked from Drive, Dropbox or any other document provider, after the app is closed.
    Function("persistUriPermission") { uri: String ->
      try {
        val ctx = appContext.reactContext ?: return@Function false
        ctx.contentResolver.takePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION)
        true
      } catch (e: Exception) { false }
    }

    AsyncFunction("listEntries") { path: String, kind: String ->
      try {
        val file = fileOf(path)
        return@AsyncFunction if (kind == "rar") listRar(file) else listSevenZ(file)
      } catch (e: UnsupportedRarV5Exception) {
        throw CodedException("RAR5", "RAR5 archives are not supported", e)
      }
    }

    AsyncFunction("extractEntry") { path: String, kind: String, entry: String, dest: String ->
      try {
        val file = fileOf(path)
        val out = fileOf(dest)
        if (kind == "rar") extractRar(file, entry, out) else extractSevenZ(file, entry, out)
      } catch (e: UnsupportedRarV5Exception) {
        throw CodedException("RAR5", "RAR5 archives are not supported", e)
      }
    }

    AsyncFunction("imageSizes") { path: String, kind: String, entries: List<String> ->
      val file = fileOf(path)
      return@AsyncFunction if (kind == "rar") sizesRar(file, entries) else sizesSevenZ(file, entries)
    }

    AsyncFunction("pdfPageSizes") { path: String ->
      withPdf(path) { r ->
        (0 until r.pageCount).map { i -> r.openPage(i).use { p -> listOf(p.width, p.height) } }
      }
    }

    // Renders one page as JPEG at `targetWidth` px wide, on a white background.
    AsyncFunction("renderPdfPage") { path: String, index: Int, dest: String, targetWidth: Int ->
      withPdf(path) { r ->
        r.openPage(index).use { page ->
          val scale = targetWidth.toFloat() / page.width
          val bitmap = Bitmap.createBitmap(targetWidth, (page.height * scale).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
          try {
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            FileOutputStream(fileOf(dest)).use { out -> bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out) }
          } finally {
            bitmap.recycle()
          }
        }
      }
    }

    // A small grayscale copy of an image for panel detection: { width, height, data: base64 of w*h bytes }.
    AsyncFunction("grayThumbnail") { path: String, maxWidth: Int ->
      val file = fileOf(path)
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.path, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw CodedException("DECODE", "Cannot decode image", null)
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= maxWidth) sample *= 2
      val decoded = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
        ?: throw CodedException("DECODE", "Cannot decode image", null)
      val scale = minOf(1f, maxWidth.toFloat() / decoded.width)
      val w = maxOf(1, (decoded.width * scale).toInt())
      val h = maxOf(1, (decoded.height * scale).toInt())
      val scaled = if (scale < 1f) Bitmap.createScaledBitmap(decoded, w, h, true) else decoded
      val pixels = IntArray(w * h)
      scaled.getPixels(pixels, 0, w, 0, 0, w, h)
      val gray = ByteArray(w * h) { i ->
        val p = pixels[i]
        val alpha = (p ushr 24) and 255
        val lum = 0.299 * ((p shr 16) and 255) + 0.587 * ((p shr 8) and 255) + 0.114 * (p and 255)
        // Transparent pixels read as white paper.
        ((lum * alpha + 255.0 * (255 - alpha)) / 255.0).toInt().toByte()
      }
      if (scaled !== decoded) scaled.recycle()
      decoded.recycle()
      return@AsyncFunction mapOf("width" to w, "height" to h, "data" to Base64.encodeToString(gray, Base64.NO_WRAP))
    }

    // Text in a screenshot, read on the phone. Accepts file:// paths and content:// MediaStore uris.
    AsyncFunction("recognizeText") { path: String ->
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No Android context", null)
      val uri = Uri.parse(path).let { if (it.scheme == null) Uri.fromFile(File(path)) else it }
      val image = try {
        InputImage.fromFilePath(context, uri)
      } catch (e: Exception) {
        throw CodedException("DECODE", "Cannot open image", e)
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      try {
        return@AsyncFunction Tasks.await(recognizer.process(image)).text
      } finally {
        recognizer.close()
      }
    }

    // Every line of text on a page with its box, as fractions of the image with the origin at the top left. The JavaScript puts the
    // lines in reading order and reads the page in tiles, so this keeps ML Kit's raw lines rather than joining them.
    AsyncFunction("recognizeLines") { path: String ->
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No Android context", null)
      val uri = Uri.parse(path).let { if (it.scheme == null) Uri.fromFile(File(path)) else it }
      val image = try {
        InputImage.fromFilePath(context, uri)
      } catch (e: Exception) {
        throw CodedException("DECODE", "Cannot open image", e)
      }
      val width = image.width.toFloat()
      val height = image.height.toFloat()
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      try {
        val result = Tasks.await(recognizer.process(image))
        return@AsyncFunction result.textBlocks.flatMap { it.lines }.mapNotNull { line ->
          val box = line.boundingBox ?: return@mapNotNull null
          mapOf("text" to line.text, "x" to box.left / width, "y" to box.top / height, "w" to box.width() / width, "h" to box.height() / height, "conf" to line.confidence)
        }
      } finally {
        recognizer.close()
      }
    }
  }
}


