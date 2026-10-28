import ExpoModulesCore
import Foundation
import PDFKit
import UIKit
import Vision
import UniformTypeIdentifiers
import SwiftUI
@_weakLinked import Translation // iOS 17.4+; weakly linked so the app still launches on older iOS
import UnrarKit
import SWCompression

/// The iOS half of ComicArchive. It answers exactly the questions the Android module does, so the JavaScript on top is identical:
/// list and extract pages from RAR (CBR) and 7z (CB7) files, size them, render PDF pages, make small grayscale thumbnails, and read text from an image.
public class ComicArchiveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ComicArchive")

    AsyncFunction("listEntries") { (path: String, kind: String) -> [String] in
      let url = Self.fileURL(path)
      if kind == "rar" { return try Self.rarNames(url) }
      return try Self.sevenZipEntries(url).filter { $0.info.type == .regular }.map { $0.info.name }
    }

    AsyncFunction("extractEntry") { (path: String, kind: String, entry: String, dest: String) in
      let url = Self.fileURL(path)
      let out = Self.fileURL(dest)
      if kind == "rar" {
        let archive = try Self.openRar(url)
        let data = try archive.extractData(fromFile: entry)
        try data.write(to: out)
      } else {
        guard let found = try Self.sevenZipEntries(url).first(where: { $0.info.type == .regular && $0.info.name == entry }), let data = found.data else {
          throw Exception(name: "MISSING_ENTRY", description: "Entry not found: \(entry)")
        }
        try data.write(to: out)
      }
    }

    AsyncFunction("imageSizes") { (path: String, kind: String, entries: [String]) -> [[Int]] in
      let url = Self.fileURL(path)
      var found: [String: [Int]] = [:]
      if kind == "rar" {
        let archive = try Self.openRar(url)
        for name in entries { if let data = try? archive.extractData(fromFile: name) { found[name] = Self.imageSize(data) } }
      } else {
        let wanted = Set(entries)
        for e in try Self.sevenZipEntries(url) where e.info.type == .regular && wanted.contains(e.info.name) { if let d = e.data { found[e.info.name] = Self.imageSize(d) } }
      }
      return entries.map { found[$0] ?? [0, 0] }
    }

    AsyncFunction("pdfPageSizes") { (path: String) -> [[Int]] in
      let doc = try Self.openPdf(Self.fileURL(path))
      return (0..<doc.pageCount).map { i in
        let r = doc.page(at: i)?.bounds(for: .mediaBox) ?? .zero
        return [Int(r.width), Int(r.height)]
      }
    }

    // One PDF page as a JPEG, targetWidth pixels wide, on white.
    AsyncFunction("renderPdfPage") { (path: String, index: Int, dest: String, targetWidth: Int) in
      let doc = try Self.openPdf(Self.fileURL(path))
      guard let page = doc.page(at: index) else { throw Exception(name: "MISSING_ENTRY", description: "No such page") }
      let box = page.bounds(for: .mediaBox)
      let scale = CGFloat(targetWidth) / max(box.width, 1)
      let size = CGSize(width: CGFloat(targetWidth), height: max(1, (box.height * scale).rounded()))
      let image = UIGraphicsImageRenderer(size: size).image { ctx in
        UIColor.white.set(); ctx.fill(CGRect(origin: .zero, size: size))
        ctx.cgContext.translateBy(x: 0, y: size.height); ctx.cgContext.scaleBy(x: scale, y: -scale)
        page.draw(with: .mediaBox, to: ctx.cgContext)
      }
      guard let jpeg = image.jpegData(compressionQuality: 0.9) else { throw Exception(name: "DECODE", description: "Could not encode page") }
      try jpeg.write(to: Self.fileURL(dest))
    }

    // A small grayscale copy of an image for panel detection: { width, height, data: base64 of w*h bytes }.
    AsyncFunction("grayThumbnail") { (path: String, maxWidth: Int) -> [String: Any] in
      guard let image = UIImage(contentsOfFile: Self.fileURL(path).path), let cg = image.cgImage else { throw Exception(name: "DECODE", description: "Cannot decode image") }
      let scale = min(1, CGFloat(maxWidth) / CGFloat(cg.width))
      let w = max(1, Int(CGFloat(cg.width) * scale)), h = max(1, Int(CGFloat(cg.height) * scale))
      var gray = [UInt8](repeating: 255, count: w * h)
      let space = CGColorSpaceCreateDeviceGray()
      guard let ctx = CGContext(data: &gray, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: space, bitmapInfo: CGImageAlphaInfo.none.rawValue) else { throw Exception(name: "DECODE", description: "Cannot decode image") }
      ctx.setFillColor(gray: 1, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h)) // transparent pixels read as white paper
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
      return ["width": w, "height": h, "data": Data(gray).base64EncodedString()]
    }

    // The Files picker, opening files where they are. The stock picker copies every file you choose before it lets you back into the app,
    // which for a 500 MB comic in Drive means staring at Files while it downloads. This hands back the names, sizes and bookmarks at once.
    AsyncFunction("pickFilesInPlace") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let presenter = self.appContext?.utilities?.currentViewController() else { promise.reject("PICKER", "Cannot show the file picker"); return }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.item], asCopy: false)
        picker.allowsMultipleSelection = true
        let delegate = InPlacePickerDelegate(promise: promise) { Self.activePicker = nil }
        Self.activePicker = delegate // the picker only holds its delegate weakly
        picker.delegate = delegate
        presenter.present(picker, animated: true)
      }
    }

    // Downloaded comics can always be fetched again, so they are kept out of iCloud backups.
    Function("excludeFromBackup") { (path: String) in
      var url = Self.fileURL(path)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try? url.setResourceValues(values)
    }

    // The same for a folder. Expo's own folder picker counts a folder as "cancelled" when iOS says it needs no security scope, which is
    // what Google Drive's folders do, so choosing one there seemed to do nothing. This one takes the folder either way.
    AsyncFunction("pickFolderInPlace") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let presenter = self.appContext?.utilities?.currentViewController() else { promise.reject("PICKER", "Cannot show the folder picker"); return }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
        picker.allowsMultipleSelection = false
        let delegate = InPlacePickerDelegate(promise: promise) { Self.activePicker = nil }
        Self.activePicker = delegate
        picker.delegate = delegate
        presenter.present(picker, animated: true)
      }
    }

    // Every comic file inside a bookmarked folder, however deep: its path below the folder, name and size. Read through file coordination, so a
    // cloud app lists what it has even when nothing is downloaded. Names are listed; no file is fetched.
    AsyncFunction("listFolderComics") { (bookmark: String, extensions: [String], maxDepth: Int) -> [[String: Any]] in
      guard let data = Data(base64Encoded: bookmark) else { throw Exception(name: "BOOKMARK", description: "Invalid link") }
      var stale = false
      let root = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
      let scoped = root.startAccessingSecurityScopedResource()
      defer { if scoped { root.stopAccessingSecurityScopedResource() } }
      var out: [[String: Any]] = []
      func walk(_ dir: URL, _ path: [String], _ depth: Int) {
        if depth > maxDepth { return }
        var entries: [URL] = []
        var coordError: NSError?
        NSFileCoordinator().coordinate(readingItemAt: dir, options: [], error: &coordError) { readable in
          entries = (try? FileManager.default.contentsOfDirectory(at: readable, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [.skipsHiddenFiles])) ?? []
        }
        for entry in entries {
          let values = try? entry.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
          let name = entry.lastPathComponent
          if values?.isDirectory == true { walk(entry, path + [name], depth + 1) }
          else if extensions.contains(entry.pathExtension.lowercased()) { out.append(["path": path + [name], "name": name, "size": values?.fileSize ?? 0]) }
        }
      }
      walk(root, [], 0)
      return out
    }

    // A cloud file (Drive, Dropbox…) picked without copying: iOS only lets the app reopen it later through a bookmark.
    Function("makeBookmark") { (uri: String) -> String? in
      let url = Self.fileURL(uri)
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      return try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil).base64EncodedString()
    }

    // Copies the bookmarked file to `dest`. The coordinated read makes the cloud app download it first if it isn't on the device yet.
    // `relative` is the path of a file inside a bookmarked folder ("" when the bookmark is the file itself).
    AsyncFunction("copyFromBookmark") { (bookmark: String, dest: String, relative: String) in
      guard let data = Data(base64Encoded: bookmark) else { throw Exception(name: "BOOKMARK", description: "Invalid link") }
      var stale = false
      let root = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
      let scoped = root.startAccessingSecurityScopedResource()
      defer { if scoped { root.stopAccessingSecurityScopedResource() } }
      var url = root
      for part in relative.split(separator: "/") { url.appendPathComponent(String(part)) }
      let out = Self.fileURL(dest)
      var coordError: NSError?
      var copyError: Error?
      NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordError) { readable in
        do {
          try? FileManager.default.removeItem(at: out)
          try FileManager.default.copyItem(at: readable, to: out)
        } catch { copyError = error }
      }
      if let e = coordError ?? copyError { throw Exception(name: "FETCH", description: e.localizedDescription) }
    }

    // Text in a screenshot, read on the device.
    AsyncFunction("recognizeText") { (path: String, promise: Promise) in
      guard let cg = UIImage(contentsOfFile: Self.fileURL(path).path)?.cgImage else { promise.reject("DECODE", "Cannot open image"); return }
      let request = VNRecognizeTextRequest { req, error in
        if let error = error { promise.reject("OCR", error.localizedDescription); return }
        let lines = (req.results as? [VNRecognizedTextObservation])?.compactMap { $0.topCandidates(1).first?.string } ?? []
        promise.resolve(lines.joined(separator: "\n"))
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.automaticallyDetectsLanguage = true
      DispatchQueue.global(qos: .userInitiated).async {
        do { try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request]) } catch { promise.reject("OCR", error.localizedDescription) }
      }
    }

    // Each line of text on a page with its box, as fractions of the image with the origin at the top left. The JavaScript puts the lines
    // in reading order, so this keeps Vision's raw lines rather than joining them.
    AsyncFunction("recognizeLines") { (path: String, promise: Promise) in
      guard let cg = UIImage(contentsOfFile: Self.fileURL(path).path)?.cgImage else { promise.reject("DECODE", "Cannot open image"); return }
      let request = VNRecognizeTextRequest { req, error in
        if let error = error { promise.reject("OCR", error.localizedDescription); return }
        let lines: [[String: Any]] = ((req.results as? [VNRecognizedTextObservation]) ?? []).compactMap { o in
          guard let top = o.topCandidates(1).first else { return nil }
          let b = o.boundingBox // Vision's origin is the bottom left
          return ["text": top.string, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height, "conf": Double(top.confidence)]
        }
        promise.resolve(lines)
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.automaticallyDetectsLanguage = true
      DispatchQueue.global(qos: .userInitiated).async {
        do { try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request]) } catch { promise.reject("OCR", error.localizedDescription) }
      }
    }

    // Apple's own translation sheet, which works on the device (language packs download once). Resolves false where it isn't available.
    AsyncFunction("translateText") { (text: String, promise: Promise) in
      DispatchQueue.main.async {
        guard #available(iOS 17.4, *), let presenter = self.appContext?.utilities?.currentViewController() else { promise.resolve(false); return }
        var host: UIHostingController<TranslateHost>?
        host = UIHostingController(rootView: TranslateHost(text: text) { host?.dismiss(animated: false); promise.resolve(true) })
        host?.view.backgroundColor = .clear
        host?.modalPresentationStyle = .overCurrentContext
        if let host = host { presenter.present(host, animated: false) }
      }
    }
  }

  // MARK: helpers

  static var activePicker: InPlacePickerDelegate?

  static func fileURL(_ path: String) -> URL { path.hasPrefix("file://") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path) }

  static func openRar(_ url: URL) throws -> URKArchive {
    let archive: URKArchive
    // RAR4 and RAR5 both open here. A failure is reported as it is, not guessed to be a format problem.
    do { archive = try URKArchive(url: url) } catch { throw Exception(name: "RAR_OPEN", description: "Cannot open RAR archive: \(error.localizedDescription)") }
    if archive.isPasswordProtected() { throw Exception(name: "ENCRYPTED", description: "Archive is password-protected") }
    return archive
  }

  static func rarNames(_ url: URL) throws -> [String] {
    let archive = try openRar(url)
    return try archive.listFilenames()
  }

  static func sevenZipEntries(_ url: URL) throws -> [SWCompression.SevenZipEntry] {
    do {
      let data = try Data(contentsOf: url, options: .mappedIfSafe)
      return try SevenZipContainer.open(container: data)
    } catch {
      throw Exception(name: "SEVENZIP", description: "7z: \(error)")
    }
  }

  static func openPdf(_ url: URL) throws -> PDFDocument {
    guard let doc = PDFDocument(url: url) else { throw Exception(name: "DECODE", description: "Cannot open PDF") }
    if doc.isLocked { throw Exception(name: "ENCRYPTED", description: "PDF is password-protected") }
    return doc
  }

  /// [width, height] from an image's header, without decoding the picture.
  static func imageSize(_ data: Data) -> [Int] {
    guard let src = CGImageSourceCreateWithData(data as CFData, nil), let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
          let w = props[kCGImagePropertyPixelWidth] as? Int, let h = props[kCGImagePropertyPixelHeight] as? Int else { return [0, 0] }
    return [w, h]
  }
}


/// Answers the in-place Files picker with `{ uri, name, size, bookmark }` for each file, without reading or copying any of them.
final class InPlacePickerDelegate: NSObject, UIDocumentPickerDelegate {
  private let promise: Promise
  private let finished: () -> Void

  init(promise: Promise, finished: @escaping () -> Void) { self.promise = promise; self.finished = finished }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    let items: [[String: Any]] = urls.map { url in
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
      let bookmark = (try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil))?.base64EncodedString()
      return ["uri": url.absoluteString, "name": url.lastPathComponent, "size": size, "bookmark": bookmark ?? NSNull()]
    }
    promise.resolve(items)
    finished()
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    promise.resolve([[String: Any]]())
    finished()
  }
}

/// An empty, see-through screen whose only job is to show the system translation sheet for `text`, and to say when it has been closed.
@available(iOS 17.4, *)
struct TranslateHost: View {
  let text: String
  let finished: () -> Void
  @State private var showing = true

  var body: some View {
    Color.clear
      .translationPresentation(isPresented: $showing, text: text)
      .onChange(of: showing) { _, now in if !now { finished() } }
  }
}
