// Local-only AVFoundation/Vision extraction. Never uploads the reference video.
// swift tools/reference/extract-video.swift VIDEO START_FRAME END_FRAME OUTPUT_DIR
// Frames are zero-based at the source's 30 Hz; end is exclusive. OCR is sampled
// every three source frames. OCR is evidence to review, never ground truth.
import Foundation
import AVFoundation
import AppKit
import Vision

let args = CommandLine.arguments
guard args.count == 5, let start = Int(args[2]), let end = Int(args[3]), start >= 0, end > start else {
    fatalError("usage: extract-video.swift VIDEO START_FRAME END_FRAME OUTPUT_DIR")
}
let destination = URL(fileURLWithPath: args[4], isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
// Keep the source resolution for small HUD numerals and report actual sample PTS.
let keySamples: [(String, Int, Int)] = [
    ("up", 875, 455), ("down", 875, 500), ("left", 827, 500),
    ("right", 922, 500), ("drift", 735, 455), ("boost", 735, 500),
]
var lines: [String] = []
var reviewTiles: [(Int, CGImage, CGImage)] = []
for frame in start..<end {
    try autoreleasepool {
        var actualTime = CMTime.zero
        let image = try generator.copyCGImage(at: CMTime(value: Int64(frame), timescale: 30), actualTime: &actualTime)
        let bitmap = NSBitmapImageRep(cgImage: image)
        let sx = Double(image.width) / 960.0
        let sy = Double(image.height) / 540.0
        var keys: [String] = []
        var redFractions: [String: Double] = [:]
        for (key, x, y) in keySamples {
            var red = 0
            // Sample a small interior patch so text anti-aliasing is not an edge.
            for dy in -2...2 { for dx in -2...2 {
                if let c = bitmap.colorAt(x: Int(Double(x + dx) * sx), y: Int(Double(y + dy) * sy))?.usingColorSpace(.deviceRGB),
                   c.redComponent > 0.75 && c.greenComponent < 0.3 && c.blueComponent < 0.3 { red += 1 }
            }}
            redFractions[key] = Double(red) / 25
            if red >= 13 { keys.append(key) }
        }
        var row: [String: Any] = ["frame": frame, "time": Double(frame) / 30,
            "actualTime": actualTime.seconds, "keys": keys, "keyRedFractions": redFractions]
        if (frame - start) % 3 == 0 {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]
            request.regionOfInterest = CGRect(x: 0.345, y: 0.035, width: 0.07, height: 0.066)
            try VNImageRequestHandler(cgImage: image).perform([request])
            row["speedOCR"] = request.results?.compactMap { result -> [String: Any]? in
                guard let candidate = result.topCandidates(1).first else { return nil }
                return ["text": candidate.string, "confidence": candidate.confidence]
            } ?? []
            if let hud = image.cropping(to: CGRect(x: 660 * sx / 2, y: 960 * sy / 2, width: 150 * sx / 2, height: 110 * sy / 2)),
               let keys = image.cropping(to: CGRect(x: 1440 * sx / 2, y: 890 * sy / 2, width: 480 * sx / 2, height: 190 * sy / 2)) {
                reviewTiles.append((frame, hud, keys))
            }
        }
        if (frame - start) % 15 == 0 {
            let thumb = NSImage(cgImage: image, size: NSSize(width: 960, height: 540))
            let canvas = NSImage(size: NSSize(width: 960, height: 540))
            canvas.lockFocus()
            thumb.draw(in: NSRect(x: 0, y: 0, width: 960, height: 540))
            canvas.unlockFocus()
            let png = NSBitmapImageRep(data: canvas.tiffRepresentation!)!.representation(using: .png, properties: [:])!
            try png.write(to: destination.appendingPathComponent(String(format: "frame-%06d.png", frame)))
        }
        let data = try JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])
        lines.append(String(data: data, encoding: .utf8)!)
    }
}
try (lines.joined(separator: "\n") + "\n").write(to: destination.appendingPathComponent("samples.jsonl"), atomically: true, encoding: .utf8)
// Dense visual audit: every OCR sample alongside its original HUD pixels and keys.
let columns = 5, tileWidth = 240, tileHeight = 84
let sheet = NSImage(size: NSSize(width: columns * tileWidth, height: ((reviewTiles.count + columns - 1) / columns) * tileHeight))
sheet.lockFocus()
NSColor.black.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: sheet.size)).fill()
for (i, tile) in reviewTiles.enumerated() {
    let x = (i % columns) * tileWidth, y = Int(sheet.size.height) - (i / columns + 1) * tileHeight
    NSImage(cgImage: tile.1, size: .zero).draw(in: NSRect(x: x, y: y, width: 80, height: 60))
    NSImage(cgImage: tile.2, size: .zero).draw(in: NSRect(x: x + 86, y: y, width: 150, height: 60))
    "frame \(tile.0) / \(String(format: "%.3f", Double(tile.0) / 30)) s".draw(at: NSPoint(x: x + 2, y: y + 63),
        withAttributes: [.foregroundColor: NSColor.white, .font: NSFont.systemFont(ofSize: 10)])
}
sheet.unlockFocus()
try NSBitmapImageRep(data: sheet.tiffRepresentation!)!.representation(using: .png, properties: [:])!
    .write(to: destination.appendingPathComponent("review.png"))
print("Wrote \(end - start) source frames to \(destination.path)")
