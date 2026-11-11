// Cuts example product photos out of their white background with Vision and
// writes transparent HEIC files the app ships with.
//
//   swift Tools/tryon-test/cutout.swift <in dir> <out dir>
import AppKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import Vision

let args = CommandLine.arguments
let inDir = URL(fileURLWithPath: args[1]), outDir = URL(fileURLWithPath: args[2])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let ctx = CIContext(options: [.workingColorSpace: NSNull()])
let maxSide: CGFloat = 900
var sheet: [(String, CGImage)] = []

for url in try FileManager.default.contentsOfDirectory(at: inDir, includingPropertiesForKeys: nil)
    .filter({ $0.pathExtension == "jpg" }).sorted(by: { $0.path < $1.path }) {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(source, 0, nil) else { continue }
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: cg)
    try handler.perform([request])
    guard let obs = request.results?.first else { print("no subject: \(url.lastPathComponent)"); continue }
    let mask = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler)
    let input = CIImage(cgImage: cg)
    let alpha = CIImage(cvPixelBuffer: mask)
    let cut = input.applyingFilter("CIBlendWithMask", parameters: [
        kCIInputBackgroundImageKey: CIImage.empty(), kCIInputMaskImageKey: alpha])

    // Crop to the subject plus a small margin, then scale down.
    guard let full = ctx.createCGImage(cut, from: input.extent) else { continue }
    let bounds = alphaBounds(full).insetBy(dx: -18, dy: -18).intersection(input.extent)
    var out = cut.cropped(to: bounds).transformed(by: .init(translationX: -bounds.minX, y: -bounds.minY))
    let scale = min(1, maxSide / max(bounds.width, bounds.height))
    out = out.transformed(by: .init(scaleX: scale, y: scale))
    guard let final = ctx.createCGImage(out, from: out.extent, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)) else { continue }

    let dest = outDir.appendingPathComponent(url.deletingPathExtension().lastPathComponent + ".heic")
    guard let writer = CGImageDestinationCreateWithURL(dest as CFURL, UTType.heic.identifier as CFString, 1, nil) else { continue }
    CGImageDestinationAddImage(writer, final, [kCGImageDestinationLossyCompressionQuality: 0.82] as CFDictionary)
    CGImageDestinationFinalize(writer)
    sheet.append((url.deletingPathExtension().lastPathComponent, final))
}

// Contact sheet on the app's studio colour, to eyeball the cutouts.
let cell = 220.0, cols = 6
let rows = (sheet.count + cols - 1) / cols
let img = NSImage(size: NSSize(width: cell * Double(cols), height: cell * Double(rows)))
img.lockFocus()
NSColor(red: 0.91, green: 0.89, blue: 0.86, alpha: 1).setFill()
NSRect(origin: .zero, size: img.size).fill()
for (i, (_, cg)) in sheet.enumerated() {
    let s = min((cell - 20) / Double(cg.width), (cell - 20) / Double(cg.height))
    let w = Double(cg.width) * s, h = Double(cg.height) * s
    let x = Double(i % cols) * cell + (cell - w) / 2, y = Double(rows - 1 - i / cols) * cell + (cell - h) / 2
    NSImage(cgImage: cg, size: .zero).draw(in: NSRect(x: x, y: y, width: w, height: h))
}
img.unlockFocus()
try NSBitmapImageRep(data: img.tiffRepresentation!)!.representation(using: .jpeg, properties: [.compressionFactor: 0.85])!
    .write(to: outDir.deletingLastPathComponent().appendingPathComponent("examples-sheet.jpg"))
print("cut \(sheet.count)")

func alphaBounds(_ image: CGImage) -> CGRect {
    let w = image.width, h = image.height
    var px = [UInt8](repeating: 0, count: w * h * 4)
    let c = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    var minX = w, minY = h, maxX = 0, maxY = 0
    for y in 0..<h { for x in 0..<w where px[(y * w + x) * 4 + 3] > 24 {
        minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
    } }
    // CGContext rows run top-down in memory; Core Image's origin is bottom-left.
    return CGRect(x: minX, y: h - 1 - maxY, width: maxX - minX + 1, height: maxY - minY + 1)
}
