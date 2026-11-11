// Cuts a child mannequin out (Vision) and stands it on the bundled
// mannequin's studio backdrop at a height matching the child's age, so a
// toddler looks small and a teen nearly adult-size.
//   swift place_child.swift <child.jpg> <mannequin.jpg> <height fraction> <out.jpg>
import AppKit
import CoreImage
import Vision

let a = CommandLine.arguments
let cg = NSImage(contentsOfFile: a[1])!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
let ref = NSBitmapImageRep(data: NSImage(contentsOfFile: a[2])!.tiffRepresentation!)!
let fraction = Double(a[3])!
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: cg)
try handler.perform([request])
let obs = request.results!.first!
let mask = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler)
let ctx = CIContext()
let cut = CIImage(cgImage: cg).applyingFilter("CIBlendWithMask", parameters: [
    kCIInputBackgroundImageKey: CIImage.empty(), kCIInputMaskImageKey: CIImage(cvPixelBuffer: mask)])
let full = ctx.createCGImage(cut, from: CIImage(cgImage: cg).extent)!
// Tight bounds of the cut-out child.
let rep = NSBitmapImageRep(cgImage: full)
var minX = rep.pixelsWide, minY = rep.pixelsHigh, maxX = 0, maxY = 0
for y in stride(from: 0, to: rep.pixelsHigh, by: 2) { for x in stride(from: 0, to: rep.pixelsWide, by: 2) where (rep.colorAt(x: x, y: y)?.alphaComponent ?? 0) > 0.2 {
    minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y) } }
let crop = full.cropping(to: CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY))!

let W = Double(ref.pixelsWide), H = Double(ref.pixelsHigh)
let out = NSImage(size: NSSize(width: W, height: H))
out.lockFocus()
NSGradient(colors: [ref.colorAt(x: 8, y: Int(H * 0.95))!, ref.colorAt(x: 8, y: Int(H * 0.5))!, ref.colorAt(x: 8, y: Int(H * 0.05))!])!
    .draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: 90)
let ch = H * fraction, cw = ch * Double(crop.width) / Double(crop.height)
let floor = H * (1 - 0.962)
NSColor.black.withAlphaComponent(0.12).setFill()
NSBezierPath(ovalIn: NSRect(x: (W - cw * 0.9) / 2, y: floor - H * 0.008, width: cw * 0.9, height: H * 0.02)).fill()
NSImage(cgImage: crop, size: .zero).draw(in: NSRect(x: (W - cw) / 2, y: floor, width: cw, height: ch))
out.unlockFocus()
try! NSBitmapImageRep(data: out.tiffRepresentation!)!.representation(using: .jpeg, properties: [.compressionFactor: 0.86])!
    .write(to: URL(fileURLWithPath: a[4]))
