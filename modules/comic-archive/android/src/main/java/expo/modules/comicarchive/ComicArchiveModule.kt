package expo.modules.comicarchive

import android.net.Uri
import com.github.junrar.Archive
import com.github.junrar.exception.UnsupportedRarV5Exception
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.apache.commons.compress.archivers.sevenz.SevenZFile
import java.io.File
import java.io.FileOutputStream

/**
 * Reads page entries out of RAR4 (CBR) and 7z (CB7) archives. JS decides the kind from magic
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

  override fun definition() = ModuleDefinition {
    Name("ComicArchive")

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
  }
}
