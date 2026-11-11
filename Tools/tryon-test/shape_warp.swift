// Reshapes the photo mannequin for each body shape by widening or narrowing
// it row by row (shoulders, bust, waist, hips, thighs). The backdrop is a
// plain vertical gradient, so stretching rows sideways leaves it unchanged.
//   swift Tools/tryon-test/shape_warp.swift <mannequin.jpg> <out dir>
import AppKit

let args = CommandLine.arguments
let src = NSBitmapImageRep(data: NSImage(contentsOfFile: args[1])!.tiffRepresentation!)!
let outDir = URL(fileURLWithPath: args[2])
let w = src.pixelsWide, h = src.pixelsHigh
let cx = 0.505   // body centre line

// Gaussian bump: amount at a height, fading over `spread`.
func bump(_ y: Double, at c: Double, _ spread: Double, _ amount: Double) -> Double {
    amount * exp(-pow((y - c) / spread, 2))
}
let shoulders = 0.215, bust = 0.29, waist = 0.385, hips = 0.47, thighs = 0.56
let shapes: [String: (Double) -> Double] = [
    "pear": { y in 1 + bump(y, at: hips, 0.05, 0.17) + bump(y, at: thighs, 0.06, 0.13) - bump(y, at: shoulders, 0.04, 0.05) },
    "apple": { y in 1 + bump(y, at: waist, 0.055, 0.2) + bump(y, at: bust, 0.04, 0.07) + bump(y, at: hips, 0.04, 0.04) },
    "hourglass": { y in 1 + bump(y, at: bust, 0.035, 0.1) - bump(y, at: waist, 0.03, 0.1) + bump(y, at: hips, 0.045, 0.13) },
    "invertedTriangle": { y in 1 + bump(y, at: shoulders, 0.05, 0.24) + bump(y, at: bust, 0.045, 0.12) - bump(y, at: hips, 0.05, 0.09) - bump(y, at: thighs, 0.05, 0.05) },
]
for (name, scale) in shapes {
    let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 3,
                               hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    for y in 0..<h {
        let s = scale(Double(y) / Double(h))
        for x in 0..<w {
            // Sample the source further in towards the centre line where the body widens.
            let sx = Double(w) * cx + (Double(x) - Double(w) * cx) / s
            let x0 = max(0, min(w - 1, Int(sx))), x1 = min(w - 1, x0 + 1), t = sx - Double(Int(sx))
            let a = src.colorAt(x: x0, y: y)!, b = src.colorAt(x: x1, y: y)!
            out.setColor(NSColor(deviceRed: a.redComponent * (1 - t) + b.redComponent * t,
                                 green: a.greenComponent * (1 - t) + b.greenComponent * t,
                                 blue: a.blueComponent * (1 - t) + b.blueComponent * t, alpha: 1), atX: x, y: y)
        }
    }
    try! out.representation(using: .jpeg, properties: [.compressionFactor: 0.88])!
        .write(to: outDir.appendingPathComponent("mannequin-\(name).jpg"))
    print(name)
}
