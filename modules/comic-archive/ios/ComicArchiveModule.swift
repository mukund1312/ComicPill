import ExpoModulesCore
import Foundation
import PDFKit
import UIKit
import Vision
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
      DispatchQueue.global(qos: .userInitiated).async {
        do { try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request]) } catch { promise.reject("OCR", error.localizedDescription) }
      }
    }
  }

  // MARK: helpers

  static func fileURL(_ path: String) -> URL { path.hasPrefix("file://") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path) }

  static func openRar(_ url: URL) throws -> URKArchive {
    let archive: URKArchive
    do { archive = try URKArchive(url: url) } catch { throw Exception(name: "RAR5", description: "RAR5 archives are not supported") }
    if archive.isPasswordProtected() { throw Exception(name: "ENCRYPTED", description: "Archive is password-protected") }
    return archive
  }

  static func rarNames(_ url: URL) throws -> [String] {
    let archive = try openRar(url)
    return try archive.listFilenames()
  }

  static func sevenZipEntries(_ url: URL) throws -> [SWCompression.SevenZipEntry] {
    let data = try Data(contentsOf: url, options: .mappedIfSafe)
    return try SevenZipContainer.open(container: data)
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
