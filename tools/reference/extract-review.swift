// Dense pixel audit, no OCR or inferred physics. Usage:
// swift tools/reference/extract-review.swift VIDEO START_FRAME END_FRAME STRIDE OUTPUT.png
import Foundation
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count == 6, let start = Int(args[2]), let end = Int(args[3]), let strideBy = Int(args[4]), strideBy > 0 else {
    fatalError("usage: extract-review.swift VIDEO START_FRAME END_FRAME STRIDE OUTPUT.png")
}
let generator = AVAssetImageGenerator(asset: AVURLAsset(url: URL(fileURLWithPath: args[1])))
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let frames = Array(stride(from: start, to: end, by: strideBy))
let columns = 5, width = 240, height = 90
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: columns * width,
    pixelsHigh: ((frames.count + columns - 1) / columns) * height,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor.black.setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: bitmap.pixelsWide, height: bitmap.pixelsHigh)).fill()
for (i, frame) in frames.enumerated() {
    let source = try generator.copyCGImage(at: CMTime(value: Int64(frame), timescale: 30), actualTime: nil)
    let x = (i % columns) * width, y = bitmap.pixelsHigh - (i / columns + 1) * height
    let crops: [(CGRect, NSRect)] = [
        (CGRect(x: 660, y: 960, width: 150, height: 110), NSRect(x: x, y: y, width: 75, height: 55)),
        (CGRect(x: 1440, y: 890, width: 480, height: 190), NSRect(x: x + 82, y: y, width: 152, height: 60)),
        (CGRect(x: 36, y: 10, width: 200, height: 110), NSRect(x: x + 140, y: y + 59, width: 74, height: 29)),
    ]
    for (crop, rect) in crops {
        if let cropped = source.cropping(to: crop) { NSImage(cgImage: cropped, size: .zero).draw(in: rect) }
    }
    "f\(frame) \(String(format: "%.3f", Double(frame) / 30))s".draw(at: NSPoint(x: x + 2, y: y + 66),
        withAttributes: [.foregroundColor: NSColor.white, .font: NSFont.systemFont(ofSize: 10)])
}
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[5]))
